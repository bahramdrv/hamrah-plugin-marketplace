import { readFileSync } from "node:fs";

import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { isOfficialInstitutionEvidence } from "./community-opportunities.mjs";

// Read-time verification of an Academic Opportunity against an as-of date and the versioned fact-type freshness
// policy shared with the scorecard validator.
const FRESHNESS_POLICY = JSON.parse(readFileSync(
  new URL("../skills/hamrah-scorecard-engine/references/freshness_policy.json", import.meta.url), "utf8"
));
const DEADLINE_FACT = "deadline";
const FUNDING_FACT = "financial_requirement";

function dayNumber(day) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function freshnessOf(items, factType, asOf) {
  const rule = FRESHNESS_POLICY.fact_types[factType];
  const newest = items.map((item) => parseIsoDay(item.evidence.retrieved_at, false, true)).filter(Boolean).sort().at(-1);
  if (!newest) return { status: "unknown", ageDays: null, maxAgeDays: rule.max_age_days, factType };
  const ageDays = dayNumber(asOf) - dayNumber(newest);
  const status = ageDays > rule.max_age_days ? "stale" : ageDays > rule.aging_after_days ? "aging" : "current";
  return { status, ageDays, maxAgeDays: rule.max_age_days, factType };
}

function evidenceClass(item) {
  if (item.source?.public !== true) return "private_community";
  return item.official ? "official" : "public_community";
}

function present(item) {
  return {
    evidenceId: item.evidence.id,
    evidenceClass: evidenceClass(item),
    authority: item.evidence.authority,
    sourceUrl: item.source?.public === true ? item.evidence.source_url : null,
    retrievedAt: item.evidence.retrieved_at,
    summary: item.evidence.evidence_summary
  };
}

function lookup(canonical) {
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  return (ids) => ids.map((id) => evidenceById.get(id)).filter(Boolean).map((evidence) => {
    const source = sourcesById.get(evidence.source_id);
    return { evidence, source, official: isOfficialInstitutionEvidence(evidence, source) };
  });
}

function verifyDeadline(opportunity, resolve, asOf) {
  if (!opportunity.deadline) return { date: null, status: "unknown", officialSource: false, freshness: null };
  const official = resolve(opportunity.deadline_evidence_ids).filter((item) => item.official);
  const freshness = official.length ? freshnessOf(official, DEADLINE_FACT, asOf) : null;
  let status = "open";
  if (opportunity.deadline < asOf) status = "expired";
  else if (!official.length) status = "unverified";
  else if (freshness.status === "stale") status = "needs_reverification";
  return { date: opportunity.deadline, status, officialSource: official.length > 0, freshness };
}

// Only a fresh official institution source makes a funding component definite, and an official contradiction
// takes that certainty away; community evidence on either side only changes confidence.
function verifyComponent(component, resolve, asOf) {
  const supporting = resolve(component.evidence_ids);
  const opposing = resolve(component.opposing_evidence_ids);
  const official = supporting.filter((item) => item.official);
  const freshness = official.length ? freshnessOf(official, FUNDING_FACT, asOf) : null;
  const base = {
    type: component.type,
    declaredStatus: component.status,
    amount: component.amount,
    freshness,
    supporting: supporting.map(present),
    opposing: opposing.map(present)
  };
  if (component.status !== "verified" || !official.length) return { ...base, effectiveStatus: "unknown", confidence: "low", reason: "no_official_source" };
  if (freshness.status === "stale") return { ...base, effectiveStatus: "unknown", confidence: "low", reason: "stale_official_source" };
  if (opposing.some((item) => item.official)) return { ...base, effectiveStatus: "unknown", confidence: "low", reason: "conflicting_official_sources" };
  return opposing.length
    ? { ...base, effectiveStatus: "verified", confidence: "medium", reason: "official_source_with_community_dispute" }
    : { ...base, effectiveStatus: "verified", confidence: freshness.status === "aging" ? "medium" : "high", reason: "current_official_source" };
}

export function verifyOpportunity(opportunity, canonical, asOf) {
  const resolve = lookup(canonical);
  const deadline = verifyDeadline(opportunity, resolve, asOf);
  const components = opportunity.funding.components.map((component) => verifyComponent(component, resolve, asOf));
  const noneIsOfficial = opportunity.funding.status === "none" && resolve(opportunity.evidence_ids).some((item) => item.official);
  const fundingStatus = components.some((component) => component.effectiveStatus === "verified") ? "verified" : noneIsOfficial ? "none" : "unknown";
  const restrictions = opportunity.nationality_restrictions;
  const officialRestriction = resolve(restrictions.evidence_ids).some((item) => item.official);
  const reasons = [];
  let lifecycleStatus = opportunity.lifecycle.status;
  if (deadline.status === "expired" && CURRENT_STATUSES.has(lifecycleStatus)) {
    lifecycleStatus = "historical";
    reasons.push(`The application deadline passed on ${deadline.date}.`);
  }
  if (deadline.status === "needs_reverification") reasons.push("The deadline's official source is past its freshness limit.");
  if (deadline.status === "unverified") reasons.push("No official institution source states the deadline.");
  return {
    asOf,
    lifecycleStatus,
    deadline,
    funding: { declaredStatus: opportunity.funding.status, effectiveStatus: fundingStatus, components },
    nationalityRestrictions: {
      declaredStatus: restrictions.status,
      effectiveStatus: restrictions.status !== "unknown" && officialRestriction ? restrictions.status : "unknown",
      details: restrictions.details
    },
    reasons
  };
}
