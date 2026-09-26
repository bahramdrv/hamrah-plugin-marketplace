import { readFileSync } from "node:fs";

// The scorecard validator (hamrah-scorecard-engine/scripts/source_authority.py) reads this same file.
// There is one versioned policy; this module only ports its matching logic.
const SOURCE_AUTHORITY_POLICY = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-scorecard-engine/references/source_authority_policy.json", import.meta.url),
    "utf8"
  )
);

export const SOURCE_AUTHORITY_POLICY_VERSION = SOURCE_AUTHORITY_POLICY.policy_version;

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
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Like Python's unquote, keep malformed percent escapes as written.
  }
  return { host: url.hostname.toLowerCase(), path };
}

/**
 * Classify one requirement check against the versioned Source Authority policy.
 * A rule matches only when claim type, requirement id, title, result explanation,
 * country, route, HTTPS host and path all equal the rule; anything else is unknown.
 */
export function classifySource(claim, policy = SOURCE_AUTHORITY_POLICY) {
  const unknown = { policy_version: policy.policy_version, classification: "unknown", rule_id: null };
  const source = parseSourceUrl(claim.sourceUrl);
  if (!source) return unknown;
  const rule = policy.rules.find((candidate) =>
    claim.claimType === candidate.claim_type
    && claim.requirementId === candidate.requirement_id
    && claim.title === candidate.claim_title
    && claim.explanation === candidate.result_explanations?.[claim.result]
    && claim.countryCode === candidate.country_code
    && claim.routeCode === candidate.route_code
    && source.host === candidate.source_host
    && source.path === candidate.source_path
  );
  if (!rule) return unknown;
  return { policy_version: policy.policy_version, classification: rule.classification, rule_id: rule.rule_id };
}
