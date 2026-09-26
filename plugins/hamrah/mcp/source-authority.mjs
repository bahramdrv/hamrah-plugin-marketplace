import { readFileSync } from "node:fs";

import { assessFreshness, parseIsoDay } from "./requirement-freshness.mjs";

// The scorecard validator (hamrah-scorecard-engine/scripts/source_authority.py) reads this same file.
// There is one versioned policy; this module only ports its matching logic.
const SOURCE_AUTHORITY_POLICY = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-scorecard-engine/references/source_authority_policy.json", import.meta.url),
    "utf8"
  )
);

export const SOURCE_AUTHORITY_POLICY_VERSION = SOURCE_AUTHORITY_POLICY.policy_version;

// Empty inner segments and dot segments could walk a path out of a rule's prefix. The Python classifier
// rejects them before any normalisation, so this checks the path exactly as written, not url.pathname.
function safeRawPath(rawUrl) {
  const rawPath = /^https:\/\/[^/?#]*(\/[^?#]*)?/i.exec(rawUrl.trim())?.[1] ?? "";
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // Like Python's unquote, keep malformed percent escapes as written.
  }
  const segments = decoded.split("/").slice(1);
  return segments.every((segment, index) =>
    segment !== "." && segment !== ".." && (segment !== "" || index === segments.length - 1)
  );
}

function parseSourceUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  // WHATWG URL drops an explicit default port (":443"), which the Python classifier rejects.
  const explicitPort = /^https:\/\/[^/?#]*:\d*(?:[/?#]|$)/i.test(rawUrl.trim());
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port || explicitPort || url.search || url.hash) {
    return null;
  }
  if (!safeRawPath(rawUrl)) return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Like Python's unquote, keep malformed percent escapes as written.
  }
  return { host: url.hostname.toLowerCase(), path };
}

function governmentLinkOnOtherHost(rawUrl, sourceHost) {
  const government = parseSourceUrl(rawUrl);
  return government !== null && government.host !== sourceHost;
}

// The verification date is aged like a retrieval date under the versioned freshness policy for the
// claim's fact type; a plain date counts from the start of that UTC day.
function verifiedWithinFreshness(claim, now) {
  const { verifiedAt } = claim;
  const asDateTime = parseIsoDay(verifiedAt, { allowDateTime: false }) !== null ? `${verifiedAt}T00:00:00Z` : verifiedAt;
  const freshness = assessFreshness({ factType: claim.factType, retrievedAt: asDateTime, effectiveUntil: claim.effectiveUntil }, now);
  return (freshness.status === "current" || freshness.status === "aging") && freshness.age_days >= 0;
}

const CONDITIONS = {
  government_source_url: (claim, source) => governmentLinkOnOtherHost(claim.governmentSourceUrl, source.host),
  verified_at_within_freshness: (claim, _source, now) => verifiedWithinFreshness(claim, now)
};

function matchesExact(rule, claim, source) {
  return claim.claimType === rule.claim_type
    && claim.requirementId === rule.requirement_id
    && claim.title === rule.claim_title
    && claim.explanation === rule.result_explanations?.[claim.result]
    && claim.countryCode === rule.country_code
    && claim.routeCode === rule.route_code
    && source.host === rule.source_host
    && source.path === rule.source_path;
}

function matchesHostPathPrefix(rule, claim, source) {
  return rule.claim_types.includes(claim.claimType)
    && (rule.country_code === "*" || claim.countryCode === rule.country_code)
    && source.host === rule.source_host
    && source.path.startsWith(rule.source_path_prefix);
}

const MATCHERS = { exact: matchesExact, host_path_prefix: matchesHostPathPrefix };

/**
 * Classify one requirement check against the versioned Source Authority policy at the instant `now`.
 * Rules are tried in order and the first that matches decides. An exact rule needs the claim type,
 * requirement id, title, result explanation, country, route, HTTPS host and path to equal it; a host
 * and path-prefix rule needs the claim type and country in scope, the host, and the path prefix. The
 * matching rule's `requires` conditions must also hold; anything else is unknown.
 */
export function classifySource(claim, now, policy = SOURCE_AUTHORITY_POLICY) {
  const unknown = { policy_version: policy.policy_version, classification: "unknown", rule_id: null };
  const source = parseSourceUrl(claim.sourceUrl);
  if (!source) return unknown;
  const rule = policy.rules.find((candidate) => MATCHERS[candidate.match]?.(candidate, claim, source));
  const conditionsHold = rule && (rule.requires ?? []).every((name) => CONDITIONS[name]?.(claim, source, now) === true);
  if (!conditionsHold) return unknown;
  return { policy_version: policy.policy_version, classification: rule.classification, rule_id: rule.rule_id };
}
