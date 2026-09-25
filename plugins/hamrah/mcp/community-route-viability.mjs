import { readFileSync } from "node:fs";

import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { claimFreshness, signalFreshness } from "./community-answers.mjs";
import { assessRouteClaim } from "./community-claim-confidence.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { assessLivedExperience } from "./community-experience-tools.mjs";
import { verifyOpportunity } from "./community-opportunity-verification.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { applicantMatches } from "./community-route-claim-tools.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";
import { searchOfficialApprovalStatistics } from "./community-statistics-tools.mjs";

// Deterministic, versioned Iranian Route Viability Index for one route. Weights live in the policy file; while the
// policy is provisional, confidence is capped.
export const IRVI_POLICY = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/irvi_policy.json", import.meta.url), "utf8"
));
const AUTHORITATIVE = new Set(["primary", "trusted"]);
const OFFICIAL_CLAIM_TYPES = new Set(["official_rule", "financial_requirement"]);
const IRAN_CODES = new Set(["irn", "ir", "iran"]);
const IRAN_SCOPE_FIELDS = ["nationalities", "residence_countries", "applying_from", "origin_countries"];
const LEVELS = ["high", "medium", "low"];
const ELIGIBILITY = ["PASS", "POSSIBLE", "FAIL", "UNKNOWN"];
const CONFIDENCE_ORDER = ["low", "medium", "high"];
const NOTICE = "IRVI measures practical, evidence-based route viability for an Iranian applicant profile. It is not official eligibility, applicant fit, Practical Fit, Community Confidence, or an official approval statistic, and it is not an approval probability.";

export class InvalidIranianApplicantError extends Error {}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function dayNumber(day) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function newestArtifacts(store, collection) {
  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    for (const artifact of canonical[collection]) {
      const existing = newest.get(artifact.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) newest.set(artifact.id, { datasetId, canonical, artifact });
    }
  }
  return [...newest.values()];
}

function evidenceOf(canonical, ids) {
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  return ids.map((id) => evidenceById.get(id)).filter(Boolean).map((item) => ({ item, source: sourcesById.get(item.source_id) }));
}

function evidenceTrace(entries, freshness) {
  return entries.flatMap(({ canonical, artifact, datasetId }) => evidenceOf(canonical, artifact.evidence_ids)
    .filter(isPublic)
    .map(({ item, source }) => ({
      datasetId, artifactId: artifact.id, evidenceId: item.id,
      sourceName: item.public_person_locator === true ? null : source.source_name,
      sourceUrl: item.public_person_locator === true ? null : item.source_url,
      sourceUrlWithheld: item.public_person_locator === true ? "public_person_locator" : null,
      authority: item.authority, retrievedAt: item.retrieved_at,
      freshness: freshness({ canonical, artifact, datasetId })
    })));
}

const isPublic = ({ source }) => source?.public === true;
const isOfficial = (entry) => isPublic(entry) && AUTHORITATIVE.has(entry.item.authority) && /^https:\/\//.test(entry.item.source_url ?? "");
const isIranScoped = (scope) => IRAN_SCOPE_FIELDS.some((field) => (scope?.[field] ?? []).some((value) => IRAN_CODES.has(normalizeQuestionText(value))));

function component(name, status, level, detail) {
  const policy = IRVI_POLICY.components[name];
  if (status === "not_assessed") return { status, level: null, points: 0, max: policy.max, detail };
  const fraction = typeof level === "number" ? level : policy.levels[level];
  return { status, level, points: Math.round(policy.max * fraction), max: policy.max, detail };
}

function officialAccessibility(claims, asOf) {
  const official = claims
    .filter(({ artifact }) => OFFICIAL_CLAIM_TYPES.has(artifact.claim_type))
    .map((entry) => ({ ...entry, support: evidenceOf(entry.canonical, entry.artifact.evidence_ids).filter(isOfficial) }))
    .filter((entry) => entry.support.length);
  if (!official.length) return { ...component("official_accessibility", "not_assessed", null, "No current public official Route Claim covers this route."), basis: "missing", evidence: [] };
  const trace = official.flatMap((entry) => entry.support.map(({ item, source }) => ({
    datasetId: entry.datasetId, artifactId: entry.artifact.id, evidenceId: item.id,
    sourceName: source.source_name, sourceUrl: item.source_url,
    authority: item.authority, retrievedAt: item.retrieved_at, role: "supports",
    freshness: claimFreshness(entry.artifact, entry.support.map(({ item: support }) => support), asOf).status
  })));
  if (official.some(({ canonical, artifact }) => evidenceOf(canonical, artifact.opposing_evidence_ids).some(isOfficial))) {
    const opposing = official.flatMap((entry) => evidenceOf(entry.canonical, entry.artifact.opposing_evidence_ids)
      .filter(isOfficial).map(({ item, source }) => ({
        datasetId: entry.datasetId, artifactId: entry.artifact.id, evidenceId: item.id,
        sourceName: source.source_name, sourceUrl: item.source_url,
        authority: item.authority, retrievedAt: item.retrieved_at, role: "opposes",
        freshness: claimFreshness(entry.artifact, [item], asOf).status
      })));
    return { ...component("official_accessibility", "contradicted", "contradicted", "An official source contradicts an official rule for this route; the conflict is unresolved."), basis: "contradicted", evidence: [...trace, ...opposing] };
  }
  const statuses = official.map(({ artifact, support }) => claimFreshness(artifact, support.map(({ item }) => item), asOf).status);
  const status = statuses.includes("stale") || statuses.includes("unknown") ? "stale" : statuses.includes("aging") ? "aging" : "current";
  return { ...component("official_accessibility", status, status, `${official.length} official Route Claims; the oldest decisive support is ${status}.`), basis: status, evidence: trace };
}

function iranSpecificEvidence(claims, signals, args, asOf) {
  const currentClaims = claims.filter((entry) => ["current", "aging"].includes(assessRouteClaim({ datasetId: entry.datasetId, canonical: entry.canonical, claim: entry.artifact }, args, asOf).freshness.status));
  const currentSignals = signals.filter(({ artifact }) => signalFreshness(artifact, asOf).status === "current");
  const publicArtifacts = [...currentClaims, ...currentSignals].filter(({ canonical, artifact }) => evidenceOf(canonical, artifact.evidence_ids).some(isPublic));
  const trace = evidenceTrace(publicArtifacts, (entry) => "claim_type" in entry.artifact
    ? assessRouteClaim({ datasetId: entry.datasetId, canonical: entry.canonical, claim: entry.artifact }, args, asOf).freshness.status
    : signalFreshness(entry.artifact, asOf).status);
  const iranScoped = publicArtifacts.filter(({ artifact }) => isIranScoped(artifact.applicant_scope));
  if (iranScoped.some(({ canonical, artifact }) => artifact.claim_type === "risk" && evidenceOf(canonical, artifact.evidence_ids).some(isOfficial))) {
    return { ...component("iran_specific_evidence", "assessed", "iran_restriction", "An official source supports an Iran-specific risk for this route."), evidence: trace };
  }
  if (iranScoped.length) return { ...component("iran_specific_evidence", "assessed", "iran_scoped_public", `${iranScoped.length} current public artifacts are scoped to Iranian applicants.`), evidence: trace };
  if (publicArtifacts.length) return { ...component("iran_specific_evidence", "assessed", "general_public_only", "Public evidence exists for the route, but none is scoped to Iranian applicants."), evidence: trace };
  return { ...component("iran_specific_evidence", "not_assessed", null, "No current public Route Claim or Signal covers this route."), evidence: [] };
}

function qualifiedExamples(experiences, asOf) {
  const policy = IRVI_POLICY.components.qualified_examples;
  const recent = experiences.filter((entry) => {
    const day = parseIsoDay(entry.artifact.event_date, true, false);
    const ageDays = day ? dayNumber(asOf) - dayNumber(day) : null;
    return ageDays !== null && ageDays >= 0 && ageDays <= policy.window_days
      && assessLivedExperience({ canonical: entry.canonical, experience: entry.artifact }).caseClass === "qualified_success";
  });
  const fraction = policy.fraction_by_count[Math.min(recent.length, policy.fraction_by_count.length - 1)];
  return { ...component("qualified_examples", "assessed", fraction, `${recent.length} qualified public Iranian successes within ${policy.window_days} days.`), count: recent.length, experienceIds: recent.map(({ artifact }) => artifact.id).sort(), evidence: evidenceTrace(recent, () => "current") };
}

function fundingOrSponsorship(opportunities, asOf) {
  const current = opportunities
    .map((entry) => ({ ...entry, verification: verifyOpportunity(entry.artifact, entry.canonical, asOf) }))
    .filter(({ verification }) => CURRENT_STATUSES.has(verification.lifecycleStatus));
  if (!current.length) return { ...component("funding_or_sponsorship", "not_assessed", null, "No current Academic Opportunity is recorded for this route."), evidence: [] };
  const level = current.some(({ verification }) => verification.funding.effectiveStatus === "verified") ? "verified"
    : current.some(({ artifact }) => artifact.funding.components.length) ? "unverified"
    : "none";
  return { ...component("funding_or_sponsorship", "assessed", level, `${current.length} current opportunities; the best funding state is ${level}.`), evidence: evidenceTrace(current, ({ artifact }) => artifact.lifecycle.status) };
}

function evidenceQuality(claims, args, asOf) {
  if (!claims.length) return { ...component("evidence_quality", "not_assessed", null, "No current Route Claim covers this route."), evidence: [] };
  const scores = claims.map((entry) => assessRouteClaim({ datasetId: entry.datasetId, canonical: entry.canonical, claim: entry.artifact }, args, asOf).evidenceConfidence.score);
  const mean = scores.reduce((total, score) => total + score, 0) / scores.length;
  return { ...component("evidence_quality", "assessed", mean / 100, `Mean Evidence Confidence ${Math.round(mean)} across ${scores.length} Route Claims.`), evidence: evidenceTrace(claims, (entry) => assessRouteClaim({ datasetId: entry.datasetId, canonical: entry.canonical, claim: entry.artifact }, args, asOf).freshness.status) };
}

// Community friction and Community Confidence come from the same applicable Signals; private-only Signals warn but never score.
function communityMeasures(signals, asOf) {
  const current = signals.filter(({ artifact }) => signalFreshness(artifact, asOf).status === "current");
  const unknownFreshness = signals.filter(({ artifact }) => signalFreshness(artifact, asOf).status === "unknown");
  const scoring = current.filter(({ canonical, artifact }) => evidenceOf(canonical, artifact.evidence_ids).some(isPublic));
  const warnings = current.filter((entry) => !scoring.includes(entry));
  const total = scoring.reduce((sum, { artifact }) => sum + artifact.suggested_fit_adjustment, 0);
  const labels = { high: 0, medium: 0, low: 0 };
  for (const { artifact } of scoring) labels[artifact.confidence]++;
  return {
    friction: { points: Math.max(IRVI_POLICY.friction.min, total), min: IRVI_POLICY.friction.min, signalIds: scoring.map(({ artifact }) => artifact.id).sort(), evidence: evidenceTrace(scoring, () => "current") },
    communityConfidence: {
      applicableSignals: scoring.length,
      signalConfidence: labels,
      privateOnlyWarnings: warnings.map(({ artifact }) => artifact.id).sort(),
      unknownFreshnessWarnings: unknownFreshness.map(({ artifact }) => artifact.id).sort(),
      note: "Community Confidence describes how well the applicable Signals are supported; it is separate from IRVI and Practical Fit."
    }
  };
}

function confidence(components, accessibility, examples) {
  const assessed = Object.values(components).filter((item) => item.status !== "not_assessed");
  const share = assessed.reduce((total, item) => total + item.max, 0) / 100;
  const notAssessed = Object.entries(components).filter(([, item]) => item.status === "not_assessed").map(([name]) => name);
  const reasons = [];
  if (IRVI_POLICY.status === "provisional") reasons.push({ code: "provisional_policy", message: `IRVI policy ${IRVI_POLICY.policy_version} has limited calibration evidence, so confidence is capped at low.` });
  if (notAssessed.length) reasons.push({ code: "components_not_assessed", message: `Not assessed: ${notAssessed.join(", ")}.` });
  if (accessibility.basis === "stale") reasons.push({ code: "stale_official_data", message: "Decisive official evidence is past its freshness limit." });
  if (accessibility.basis === "contradicted") reasons.push({ code: "official_conflict", message: "Official sources conflict about a route rule." });
  if (!examples.count) reasons.push({ code: "no_recent_qualified_examples", message: "No verified recent Iranian example has attained a route milestone." });
  const weak = ["stale", "contradicted"].includes(accessibility.basis) || !examples.count;
  const uncappedLabel = weak || share < IRVI_POLICY.confidence.medium_min_assessed_share ? "low"
    : share < IRVI_POLICY.confidence.high_min_assessed_share ? "medium" : "high";
  const cap = IRVI_POLICY.status === "provisional" ? IRVI_POLICY.confidence.cap_while_provisional : "high";
  const label = CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(uncappedLabel), CONFIDENCE_ORDER.indexOf(cap))];
  return { label, uncappedLabel, reasons };
}

function callerLevel(args, name) {
  const value = args[name];
  if (value === undefined || value === null) return null;
  if (!LEVELS.includes(value)) throw new Error(`${name} must be one of ${LEVELS.join(", ")}.`);
  return value;
}

function callerScore(args, name) {
  const value = args[name];
  if (value === undefined || value === null) return { value: null, source: "not_supplied" };
  if (typeof value !== "number" || value < 0 || value > 100) throw new Error(`${name} must be a number from 0 to 100.`);
  return { value, source: "caller_scorecard" };
}

export function getIranianRouteViability(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.countryCode !== "string" || typeof args.route !== "string") throw new Error("getIranianRouteViability requires a countryCode and a route.");
  if (![args.nationality, args.residenceCountry, args.originCountry].some((value) => IRAN_CODES.has(normalizeQuestionText(value)))) {
    throw new InvalidIranianApplicantError("getIranianRouteViability requires nationality, residenceCountry, or originCountry to identify an Iran-connected applicant.");
  }
  const asOf = args.asOf ?? new Date().toISOString().slice(0, 10);
  if (!parseIsoDay(asOf, true, false)) throw new Error(`asOf ${asOf} is not an ISO date.`);
  if (args.officialEligibility !== undefined && !ELIGIBILITY.includes(args.officialEligibility)) throw new Error(`officialEligibility must be one of ${ELIGIBILITY.join(", ")}.`);
  const profileLevel = callerLevel(args, "profileCompatibility");
  const executionLevel = callerLevel(args, "executionPracticality");

  const store = loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const onRoute = (routes) => routes.some((item) => normalizeQuestionText(item) === route);
  const current = ({ artifact }) => CURRENT_STATUSES.has(artifact.lifecycle.status);
  const claims = newestArtifacts(store, "routeClaims").filter((entry) => current(entry)
    && normalizeQuestionText(entry.artifact.country_code) === countryCode && onRoute(entry.artifact.routes) && applicantMatches(entry.artifact, args));
  const signals = newestArtifacts(store, "signals").filter((entry) => current(entry)
    && normalizeQuestionText(entry.artifact.destination.country_code) === countryCode && onRoute(entry.artifact.migration_routes) && applicantMatches(entry.artifact, args));
  const experiences = newestArtifacts(store, "livedExperiences").filter((entry) => current(entry)
    && normalizeQuestionText(entry.artifact.country_code) === countryCode && onRoute(entry.artifact.routes));
  const opportunities = newestArtifacts(store, "academicOpportunities").filter(({ artifact }) =>
    normalizeQuestionText(artifact.country_code) === countryCode && onRoute(artifact.routes));

  const accessibility = officialAccessibility(claims, asOf);
  const examples = qualifiedExamples(experiences, asOf);
  const components = {
    official_accessibility: accessibility,
    profile_compatibility: profileLevel ? component("profile_compatibility", "assessed", profileLevel, "Supplied by the caller from the applicant's scorecard facts.") : component("profile_compatibility", "not_assessed", null, "No profileCompatibility level was supplied."),
    execution_practicality: executionLevel ? component("execution_practicality", "assessed", executionLevel, "Supplied by the caller from the applicant's scorecard facts.") : component("execution_practicality", "not_assessed", null, "No executionPracticality level was supplied."),
    iran_specific_evidence: iranSpecificEvidence(claims, signals, args, asOf),
    qualified_examples: examples,
    funding_or_sponsorship: fundingOrSponsorship(opportunities, asOf),
    evidence_quality: evidenceQuality(claims, args, asOf)
  };
  const { friction, communityConfidence } = communityMeasures(signals, asOf);
  const assessed = Object.values(components).filter((item) => item.status !== "not_assessed");
  const earned = assessed.reduce((total, item) => total + item.points, 0);
  const assessedMax = assessed.reduce((total, item) => total + item.max, 0);
  // Without a current official basis, the route is research_required and has no number.
  const score = accessibility.basis === "missing" ? null
    : Math.max(0, Math.min(100, Math.round((100 * earned) / assessedMax) + friction.points));

  const ranking = [
    ...(accessibility.basis === "missing" ? [{ code: "no_official_basis", message: "No current official source establishes the route." }] : []),
    ...(args.officialEligibility === "FAIL" ? [{ code: "official_fail", message: "The applicant's official eligibility is FAIL." }] : []),
    ...(accessibility.basis === "contradicted" ? [{ code: "unresolved_official_conflict", message: "Official sources conflict about a route rule." }] : []),
    ...(accessibility.basis === "stale" ? [{ code: "stale_decisive_fact", message: "A decisive official rule is past its freshness limit." }] : []),
    ...(!examples.count ? [{ code: "no_recent_qualified_examples", message: "No verified recent Iranian example has attained a route milestone." }] : []),
    { code: "no_route_evidence_threshold", message: "No versioned Route Evidence Threshold is configured for this route, so it cannot be ranked." }
  ];
  const statisticsResult = searchOfficialApprovalStatistics({ countryCode: args.countryCode, route: args.route, nationality: args.nationality, residenceCountry: args.residenceCountry, originCountry: args.originCountry }, root, maxDatasets);
  return {
    source: "Hamrah Route Viability Assessment",
    generatedAt: new Date().toISOString(),
    asOf,
    countryCode: args.countryCode,
    route: args.route,
    applicant: { nationality: args.nationality ?? null, residenceCountry: args.residenceCountry ?? null, originCountry: args.originCountry ?? null },
    measures: {
      officialEligibility: args.officialEligibility ? { status: args.officialEligibility, source: "caller_scorecard" } : { status: "not_assessed", source: "not_supplied" },
      applicantFit: callerScore(args, "applicantFit"),
      practicalFit: callerScore(args, "practicalFit"),
      communityConfidence,
      irvi: {
        label: "Iranian Route Viability Index",
        status: score === null ? "research_required" : "assessed",
        score,
        policyVersion: IRVI_POLICY.policy_version,
        policyStatus: IRVI_POLICY.status,
        policyReviewedAt: IRVI_POLICY.reviewed_at,
        components,
        friction,
        confidence: confidence(components, accessibility, examples),
        notice: NOTICE
      },
      officialApprovalStatistics: { statistics: statisticsResult.statistics, separation: statisticsResult.separation }
    },
    ranking: { rankable: false, reasons: ranking },
    usageNote: "Report each measure in its own field. Show IRVI with its confidence, components, and policy version; never call it a visa chance or approval probability, and never merge it with applicant fit, Practical Fit, or official statistics."
  };
}
