import { readFileSync } from "node:fs";

import { countIndependentReports, CURRENT_STATUSES, groupIndependentReports } from "./community-aggregation.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

// Deterministic, versioned Evidence Confidence for one Route Claim. Weights and windows live in the policy file.
export const CONFIDENCE_POLICY = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/evidence_confidence_policy.json", import.meta.url), "utf8"
));
const AUTHORITATIVE = new Set(["primary", "trusted"]);
const APPLICANT_FILTERS = { nationality: ["nationalities"], residenceCountry: ["residence_countries", "applying_from"], originCountry: ["origin_countries"] };

export class RouteClaimNotFoundError extends Error {}

function byCount(table, count) {
  return table[Math.min(count, table.length - 1)];
}

function dayNumber(day) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function isOfficial(item) {
  return AUTHORITATIVE.has(item.evidence.authority) && /^https:\/\//.test(item.evidence.source_url ?? "");
}

// Official evidence is dated by when it was last verified against its source; community evidence by when the
// reported event or post happened.
function evidenceDay(item) {
  const { evidence } = item;
  if (isOfficial(item)) return parseIsoDay(evidence.retrieved_at, false, true);
  return parseIsoDay(evidence.event_date, true, false) ?? parseIsoDay(evidence.published_at, true, true);
}

// Each independent report contributes one family, that of its earliest record, so a copy elsewhere adds nothing.
function familyDiversity(items) {
  const families = groupIndependentReports(items).map((group) => [...group]
    .sort((a, b) => String(evidenceDay(a)).localeCompare(String(evidenceDay(b))) || String(a.source?.source_family).localeCompare(String(b.source?.source_family)))[0]
    .source?.source_family).filter(Boolean);
  return new Set(families).size;
}

function recency(claim, items, asOf) {
  const window = CONFIDENCE_POLICY.recency_windows[claim.claim_type];
  const newest = items.map(evidenceDay).filter(Boolean).sort().at(-1);
  if (!window || !newest) return { status: "unknown", newest: newest ?? null, ageDays: null };
  const ageDays = dayNumber(asOf) - dayNumber(newest);
  const status = ageDays > window.max_age_days ? "stale" : ageDays > window.aging_after_days ? "aging" : "current";
  return { status, newest, ageDays, agingAfterDays: window.aging_after_days, maxAgeDays: window.max_age_days };
}

function scopeFit(claim, args) {
  const supplied = Object.keys(APPLICANT_FILTERS).filter((filter) => normalizeQuestionText(args[filter]));
  if (!supplied.length) return { status: "not_evaluated", detail: "No applicant was supplied, so the claim's applicant scope was not tested." };
  const scope = claim.applicant_scope;
  const restricted = supplied.filter((filter) => APPLICANT_FILTERS[filter].some((field) => (scope?.[field] ?? []).length));
  if (!restricted.length) return { status: "general_claim", detail: "The claim is not limited to specific applicants, so it may not describe this applicant's situation precisely." };
  const outside = restricted.filter((filter) => !APPLICANT_FILTERS[filter]
    .flatMap((field) => scope[field] ?? [])
    .some((value) => normalizeQuestionText(value) === normalizeQuestionText(args[filter])));
  return outside.length
    ? { status: "outside", detail: `The applicant's ${outside.join(", ")} is outside the claim's applicant scope.` }
    : { status: "matched", detail: "The applicant is inside the claim's applicant scope." };
}

function hypotheses(supporting, opposing) {
  if (!opposing.length) return [];
  const results = [];
  const supportDays = supporting.map(evidenceDay).filter(Boolean).sort();
  const opposeDays = opposing.map(evidenceDay).filter(Boolean).sort();
  const gap = CONFIDENCE_POLICY.hypothesis_rules.timing_gap_days;
  if (supportDays.length && opposeDays.length && Math.abs(dayNumber(opposeDays.at(-1)) - dayNumber(supportDays.at(-1))) > gap) {
    results.push({
      kind: "timing",
      status: "hypothesis",
      statement: `Supporting evidence is newest on ${supportDays.at(-1)} and opposing evidence on ${opposeDays.at(-1)}; the situation may have changed between these dates.`
    });
  }
  const supportFamilies = new Set(supporting.map((item) => item.source?.source_family).filter(Boolean));
  const opposeFamilies = new Set(opposing.map((item) => item.source?.source_family).filter(Boolean));
  if (opposeFamilies.size && [...opposeFamilies].every((family) => !supportFamilies.has(family))) {
    results.push({
      kind: "source_population",
      status: "hypothesis",
      statement: "Supporting and opposing reports come from different sources, whose members may differ in profile, location, or application path."
    });
  }
  if (supporting.some(isOfficial) !== opposing.some(isOfficial)) {
    results.push({
      kind: "official_versus_practice",
      status: "hypothesis",
      statement: "One side cites an official source and the other reports practice; the rule and its implementation may differ."
    });
  }
  return results;
}

function presentEvidence(item) {
  return {
    evidenceId: item.evidence.id,
    public: item.source?.public === true,
    sourceName: item.source?.source_name ?? null,
    sourceFamily: item.source?.source_family ?? null,
    sourceUrl: item.source?.public === true ? item.evidence.source_url : null,
    authority: item.evidence.authority,
    date: evidenceDay(item),
    summary: item.evidence.evidence_summary
  };
}

export function validateRouteClaim(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.claimId !== "string" || !args.claimId.trim()) throw new Error("validateRouteClaim requires a claimId from searchRouteClaims.");
  const asOf = args.asOf ?? new Date().toISOString().slice(0, 10);
  if (!parseIsoDay(asOf, true, false)) throw new Error(`asOf ${asOf} is not an ISO date.`);
  const store = loadCommunitySignalStore(root, maxDatasets);
  const found = store.datasets
    .flatMap(({ datasetId, canonical }) => canonical.routeClaims.filter((claim) => claim.id === args.claimId.trim()).map((claim) => ({ datasetId, canonical, claim })))
    .sort((a, b) => (Date.parse(b.canonical.generatedAt) || 0) - (Date.parse(a.canonical.generatedAt) || 0))[0];
  if (!found) throw new RouteClaimNotFoundError(`Route claim not found: ${args.claimId}`);
  const { datasetId, canonical, claim } = found;
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  const items = (ids) => ids.map((id) => evidenceById.get(id)).filter(Boolean)
    .map((evidence) => ({ datasetId, evidence, source: sourcesById.get(evidence.source_id) }));
  const supportingAll = items(claim.evidence_ids);
  const opposingAll = items(claim.opposing_evidence_ids);
  const isPublic = (item) => item.source?.public === true;
  const supporting = supportingAll.filter(isPublic);
  const opposing = opposingAll.filter(isPublic);
  const privateItems = [...supportingAll, ...opposingAll].filter((item) => !isPublic(item));

  const policy = CONFIDENCE_POLICY.components;
  const reports = countIndependentReports(supporting);
  const opposingReports = countIndependentReports(opposing);
  const diversityCount = familyDiversity(supporting);
  const primaryLevel = supporting.some((item) => isOfficial(item) && item.evidence.authority === "primary") ? "primary"
    : supporting.some(isOfficial) ? "trusted" : "none";
  const freshness = recency(claim, supporting, asOf);
  const scope = scopeFit(claim, args);
  const qualified = supporting.filter((item) => item.evidence.direct_or_second_hand === "direct"
    && item.evidence.copy_risk !== "high" && evidenceDay(item));
  const components = {
    diversity: { points: byCount(policy.diversity.points_by_count, diversityCount), max: policy.diversity.max, detail: `${diversityCount} independent public source families.` },
    independentReports: { points: byCount(policy.independentReports.points_by_count, reports), max: policy.independentReports.max, detail: `${reports} independent public supporting reports from ${supporting.length} records.` },
    primarySupport: { points: policy.primarySupport.points[primaryLevel], max: policy.primarySupport.max, detail: primaryLevel === "none" ? "No primary or trusted public source supports the claim." : `A ${primaryLevel} public source supports the claim.` },
    recency: {
      points: policy.recency.points[freshness.status], max: policy.recency.max,
      detail: freshness.status === "unknown" ? "No dated public supporting evidence." : `Newest public support ${freshness.newest} is ${freshness.status} (${freshness.ageDays} days; aging after ${freshness.agingAfterDays}, stale after ${freshness.maxAgeDays}).`
    },
    scope: { points: policy.scope.points[scope.status], max: policy.scope.max, detail: scope.detail },
    dataQuality: {
      points: supporting.length ? Math.round(policy.dataQuality.max * qualified.length / supporting.length) : 0, max: policy.dataQuality.max,
      detail: supporting.length ? `${qualified.length} of ${supporting.length} public supporting records are direct, not high copy risk, and dated.` : "No public supporting evidence."
    }
  };
  const penalty = CONFIDENCE_POLICY.contradiction_penalty;
  const penaltyPoints = 0 - Math.min(penalty.max, opposingReports * penalty.per_independent_opposing_report);
  const raw = Object.values(components).reduce((total, item) => total + item.points, 0) + penaltyPoints;
  const score = Math.max(0, Math.min(100, raw));
  const label = [...CONFIDENCE_POLICY.labels].reverse().find((band) => score >= band.min).label;

  const scopeText = `${claim.country_code} ${claim.routes.join(", ")}${claim.process_stage ? ` at ${claim.process_stage}` : ""}`;
  const limitations = [
    ...(scope.status === "outside" ? [scope.detail] : []),
    ...(freshness.status === "stale" ? ["The newest public support is past the claim type's recency window."] : []),
    ...(privateItems.length ? ["Private evidence is context only and does not change the score."] : []),
    ...(!CURRENT_STATUSES.has(claim.lifecycle.status) ? [`The claim's lifecycle status is ${claim.lifecycle.status}.`] : [])
  ];
  return {
    source: "Hamrah Route Claim Validator",
    claimId: claim.id,
    datasetId,
    asOf,
    policyVersion: CONFIDENCE_POLICY.policy_version,
    claim: { claimType: claim.claim_type, statementEn: claim.statement_en, countryCode: claim.country_code, routes: claim.routes, processStage: claim.process_stage, applicantScope: claim.applicant_scope ?? null, lifecycle: claim.lifecycle },
    evidenceConfidence: {
      score,
      label,
      components,
      contradictionPenalty: { points: penaltyPoints, max: penalty.max, detail: `${opposingReports} independent public opposing reports.` }
    },
    independence: {
      supportingPublicReports: reports,
      supportingRecords: supportingAll.length,
      opposingPublicReports: opposingReports,
      opposingRecords: opposingAll.length
    },
    contradictions: { opposing: opposingAll.map(presentEvidence), hypotheses: hypotheses(supporting, opposing) },
    privateContext: {
      records: privateItems.length,
      independentReports: countIndependentReports(privateItems),
      note: "Private evidence cannot be publicly inspected; it is shown as context and never adds to or subtracts from the score."
    },
    explanation: `Evidence Confidence ${score} (${label}) for this ${claim.claim_type} claim applies only for ${scopeText}${claim.applicant_scope ? " and its listed applicant scope" : ""}, from ${reports} independent public supporting and ${opposingReports} opposing reports.`,
    limitations,
    note: "Evidence Confidence describes how well public evidence supports this claim, not the probability of any outcome, visa decision, or approval."
  };
}
