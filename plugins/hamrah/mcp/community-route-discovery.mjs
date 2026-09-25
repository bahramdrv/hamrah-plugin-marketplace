import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { claimFreshness } from "./community-answers.mjs";
import { BudgetExceededError } from "./budgets.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { applicantMatches } from "./community-route-claim-tools.mjs";
import { InvalidIranianApplicantError, getIranianRouteViability } from "./community-route-viability.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

const MAX_COUNTRIES = 4;
const MAX_CANDIDATES = 10;
const MAX_CLAIMS_SCANNED = 500;
const MAX_PROVIDER_CANDIDATES = 100;
const IRAN_CODES = new Set(["ir", "irn", "iran"]);
const OFFICIAL_TYPES = new Set(["official_rule", "financial_requirement"]);
const AUTHORITATIVE = new Set(["primary", "trusted"]);
const SCORECARD_FIELDS = ["officialEligibility", "profileCompatibility", "executionPracticality", "applicantFit", "practicalFit"];
const COUNTRY_FA = { DEU: "آلمان" };
const ROUTE_FA = {
  student_bachelor: "تحصیل کارشناسی",
  student_masters_taught: "کارشناسی ارشد آموزشی",
  student_masters_research: "کارشناسی ارشد پژوهشی",
  student_phd: "دکتری",
  opportunity_card: "کارت شانس"
};
const REASON_FA = {
  no_official_basis: "مبنای رسمی جاری پیدا نشد",
  official_fail: "احراز شرایط رسمی برای متقاضی رد شده است",
  official_eligibility_unresolved: "احراز شرایط رسمی متقاضی هنوز قطعی نیست",
  unresolved_official_conflict: "منابع رسمی دربارهٔ شرط مسیر تعارض دارند",
  unresolved_official_requirements: "برخی شروط رسمی هنوز روشن نشده‌اند",
  stale_decisive_fact: "شاهد رسمی تعیین‌کننده قدیمی است",
  insufficient_official_source_families: "منابع رسمی مستقل کافی نیستند",
  insufficient_iran_source_families: "شواهد عمومی مستقل ویژهٔ ایران کافی نیستند",
  no_recent_qualified_examples: "نمونهٔ موفقِ اخیرِ تأییدشده وجود ندارد",
  insufficient_recent_qualified_examples: "نمونه‌های موفقِ اخیر کافی نیستند",
  no_route_evidence_threshold: "آستانهٔ شواهد برای این مسیر تعریف نشده است"
};

export class InvalidRouteDiscoveryInput extends Error {}

function evidenceOf(canonical, ids) {
  const evidence = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sources = new Map(canonical.sources.map((item) => [item.id, item]));
  return ids.map((id) => evidence.get(id)).filter(Boolean).map((item) => ({ item, source: sources.get(item.source_id) }));
}

function newestClaims(store) {
  const claims = new Map();
  let scanned = 0;
  const datasets = [...store.datasets].sort((a, b) => b.canonical.generatedAt.localeCompare(a.canonical.generatedAt) || a.datasetId.localeCompare(b.datasetId));
  for (const { datasetId, canonical } of datasets) {
    for (const claim of canonical.routeClaims) {
      if (scanned >= MAX_CLAIMS_SCANNED) return { claims: [...claims.values()], scanned, scanLimited: true };
      scanned++;
      if (!claims.has(claim.id)) claims.set(claim.id, { datasetId, canonical, claim });
    }
  }
  return { claims: [...claims.values()], scanned, scanLimited: false };
}

// The local EvidenceProvider discovers potential legal routes only from inspectable, authoritative Route Claims.
// It does not decide an individual applicant's official eligibility.
export function communityRouteEvidenceProvider(root = DATASET_ROOT, maxDatasets) {
  return {
    async discoverCandidates(args, signal) {
      if (signal?.aborted) throw signal.reason;
      const store = loadCommunitySignalStore(root, maxDatasets);
      const { claims, scanned, scanLimited } = newestClaims(store);
      const selected = new Set(args.countryCodes.map((code) => normalizeQuestionText(code)));
      const candidates = new Map();
      for (const { datasetId, canonical, claim } of claims) {
        if (!CURRENT_STATUSES.has(claim.lifecycle.status) || !OFFICIAL_TYPES.has(claim.claim_type)
          || !selected.has(normalizeQuestionText(claim.country_code)) || !applicantMatches(claim, args)) continue;
        const publicOfficial = evidenceOf(canonical, claim.evidence_ids).filter(({ item, source }) =>
          source?.public === true && AUTHORITATIVE.has(item.authority) && /^https:\/\//.test(item.source_url ?? ""));
        if (!publicOfficial.length) continue;
        for (const route of claim.routes) {
          const key = `${claim.country_code}:${route}`;
          if (!candidates.has(key)) candidates.set(key, { countryCode: claim.country_code, route, sourceIds: new Set(), evidenceIds: new Set(), datasetIds: new Set(), currentOfficialEvidence: false });
          const candidate = candidates.get(key);
          candidate.datasetIds.add(datasetId);
          for (const { item } of publicOfficial) {
            candidate.sourceIds.add(item.source_id);
            candidate.evidenceIds.add(item.id);
            if (["current", "aging"].includes(claimFreshness(claim, [item], args.asOf).status)) candidate.currentOfficialEvidence = true;
          }
        }
      }
      const found = [...candidates.values()].map((candidate) => ({
        ...candidate, sourceIds: [...candidate.sourceIds].sort(), evidenceIds: [...candidate.evidenceIds].sort(), datasetIds: [...candidate.datasetIds].sort()
      })).sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.route.localeCompare(b.route));
      const countries = args.countryCodes.map((countryCode) => {
        const covered = found.some((item) => normalizeQuestionText(item.countryCode) === normalizeQuestionText(countryCode));
        return {
          countryCode,
          status: covered ? "covered" : scanLimited ? "unknown" : "no_coverage",
          note: covered ? "At least one source-backed route candidate was found."
            : scanLimited ? "The claim scan stopped at its limit; absence cannot establish coverage."
              : "No source-backed candidate was found in validated datasets; this does not mean a route is closed."
        };
      });
      return {
        status: "available", sourceType: "validated_git_dataset", retrievedAt: new Date().toISOString(), rateStatus: "not_applicable_local",
        candidates: found, countries, claimsScanned: scanned, scanLimited, store
      };
    }
  };
}

function validateInput(args) {
  if (!Array.isArray(args.countryCodes) || args.countryCodes.length < 1 || args.countryCodes.length > MAX_COUNTRIES
    || new Set(args.countryCodes).size !== args.countryCodes.length
    || args.countryCodes.some((code) => typeof code !== "string" || !/^[A-Z]{3}$/.test(code))) {
    throw new InvalidRouteDiscoveryInput(`countryCodes must contain 1–${MAX_COUNTRIES} distinct ISO alpha-3 country codes.`);
  }
  if (![args.nationality, args.residenceCountry, args.originCountry].some((value) => IRAN_CODES.has(normalizeQuestionText(value)))) {
    throw new InvalidIranianApplicantError("findViableRoutesForIranians requires an explicit Iran connection in nationality, residenceCountry, or originCountry.");
  }
  if (!parseIsoDay(args.asOf, true, false)) throw new InvalidRouteDiscoveryInput("asOf must be a real ISO date.");
  if (!Number.isInteger(args.maxCandidates) || args.maxCandidates < 1 || args.maxCandidates > MAX_CANDIDATES) {
    throw new InvalidRouteDiscoveryInput(`maxCandidates must be an integer from 1 to ${MAX_CANDIDATES}.`);
  }
  if (!Array.isArray(args.routeAssessments) || args.routeAssessments.length > MAX_CANDIDATES) {
    throw new InvalidRouteDiscoveryInput(`routeAssessments must contain at most ${MAX_CANDIDATES} entries.`);
  }
  const assessedRoutes = new Set();
  for (const item of args.routeAssessments) {
    if (!item || typeof item.countryCode !== "string" || typeof item.route !== "string"
      || !args.countryCodes.includes(item.countryCode) || !item.route.trim() || item.route.length > 100
      || Object.keys(item).some((field) => !["countryCode", "route", ...SCORECARD_FIELDS].includes(field))) {
      throw new InvalidRouteDiscoveryInput("Each routeAssessment needs a requested countryCode and route, and only supported scorecard fields.");
    }
    const key = `${item.countryCode}:${normalizeQuestionText(item.route)}`;
    if (assessedRoutes.has(key)) throw new InvalidRouteDiscoveryInput("Duplicate routeAssessments for one country and route are not allowed.");
    assessedRoutes.add(key);
    if (item.officialEligibility !== undefined && !["PASS", "POSSIBLE", "FAIL", "UNKNOWN"].includes(item.officialEligibility)) {
      throw new InvalidRouteDiscoveryInput("officialEligibility must be PASS, POSSIBLE, FAIL, or UNKNOWN.");
    }
    for (const field of ["profileCompatibility", "executionPracticality"]) {
      if (item[field] !== undefined && !["high", "medium", "low"].includes(item[field])) {
        throw new InvalidRouteDiscoveryInput(`${field} must be high, medium, or low.`);
      }
    }
    for (const field of ["applicantFit", "practicalFit"]) {
      if (item[field] !== undefined && (typeof item[field] !== "number" || !Number.isFinite(item[field]) || item[field] < 0 || item[field] > 100)) {
        throw new InvalidRouteDiscoveryInput(`${field} must be a number from 0 to 100.`);
      }
    }
  }
}

function provenanceIds(assessment, candidate, eligibility) {
  const sources = new Set([...(candidate.sourceIds ?? []), ...(eligibility.sourceIds ?? [])]);
  const evidence = new Set(candidate.evidenceIds ?? []);
  for (const component of Object.values(assessment.measures.irvi.components)) {
    for (const item of component.evidence ?? []) {
      sources.add(item.sourceId);
      evidence.add(item.evidenceId);
    }
  }
  for (const item of assessment.measures.irvi.friction.evidence ?? []) {
    sources.add(item.sourceId);
    evidence.add(item.evidenceId);
  }
  for (const id of assessment.ranking.threshold.observed?.iranEvidenceIds ?? []) evidence.add(id);
  return { sourceIds: [...sources].filter(Boolean).sort(), evidenceIds: [...evidence].filter(Boolean).sort() };
}

function evidenceStatus(assessment) {
  const traces = Object.values(assessment.measures.irvi.components).flatMap((component) => component.evidence ?? []);
  traces.push(...(assessment.measures.irvi.friction.evidence ?? []));
  const trace = [...new Map(traces.map((item) => [`${item.datasetId}:${item.artifactId}:${item.evidenceId}`, item])).values()];
  const freshness = assessment.measures.irvi.components.official_accessibility.basis;
  return {
    trace,
    coverage: { publicEvidenceCount: trace.length, officialSourceFamilies: assessment.ranking.threshold.observed?.officialSourceFamilies ?? 0,
      iranSourceFamilies: assessment.ranking.threshold.observed?.iranSourceFamilies ?? 0 },
    freshness: { official: freshness, decisiveFactCurrent: ["current", "aging"].includes(freshness) },
    verification: { status: "validated_public_dataset", routeThresholdStatus: assessment.ranking.threshold.status },
    privacy: { status: "public_only", publicPersonLocatorsWithheld: trace.some((item) => item.sourceUrlWithheld === "public_person_locator") }
  };
}

function nextActions(assessment) {
  const codes = new Set(assessment.ranking.reasons.map(({ code }) => code));
  const actions = [];
  if (codes.has("official_eligibility_unresolved") || codes.has("official_fail")) actions.push("شرایط رسمی این متقاضی را با منبع صادرکننده و پروندهٔ به‌روز دوباره بررسی کنید.");
  if ([...codes].some((code) => code.includes("official") || code === "stale_decisive_fact")) actions.push("قاعدهٔ رسمی و تاریخ اعتبار آن را از منبع اصلی دوباره تأیید کنید.");
  if (codes.has("insufficient_iran_source_families")) actions.push("یک منبع عمومی و مستقلِ دیگر دربارهٔ اجرای این مسیر برای ایرانیان پیدا و اعتبارسنجی کنید.");
  if (codes.has("no_recent_qualified_examples") || codes.has("insufficient_recent_qualified_examples")) actions.push("یک نمونهٔ عمومیِ دارای پیوند صریح با ایران و مرحلهٔ موفقِ احراز‌شده را بررسی کنید.");
  if (assessment.measures.irvi.friction.points < 0) actions.push("برای موانع اجرایی ثبت‌شده زمان و راه‌حل عملی را بررسی کنید.");
  if (!actions.length) actions.push("پیش از اقدام، شرایط رسمی و تاریخ اعتبار منابع را دوباره بررسی کنید.");
  return actions;
}

function presentCandidate(candidate, assessment, eligibility) {
  const reasons = assessment.ranking.rankable
    ? [{ code: "route_evidence_threshold_pass", message: "Official eligibility PASS and the reviewed public Route Evidence Threshold passed." }]
    : assessment.ranking.reasons;
  const friction = assessment.measures.irvi.friction;
  const risks = friction.points < 0 ? [{
    kind: "community_friction", points: friction.points, signalIds: friction.signalIds,
    sourceIds: [...new Set(friction.evidence.map((item) => item.sourceId))].sort(),
    evidenceIds: [...new Set(friction.evidence.map((item) => item.evidenceId))].sort()
  }] : [];
  if (assessment.measures.irvi.components.iran_specific_evidence.level === "iran_restriction") {
    risks.push({ kind: "official_iran_restriction", sourceIds: assessment.measures.irvi.components.iran_specific_evidence.evidence.map((item) => item.sourceId).sort(), evidenceIds: assessment.measures.irvi.components.iran_specific_evidence.evidence.map((item) => item.evidenceId).sort() });
  }
  const explanationFa = assessment.ranking.rankable ? "آستانهٔ شواهد عمومی و احراز شرایط رسمی را گذرانده است"
    : assessment.ranking.reasons.map(({ code }) => REASON_FA[code] ?? "شواهد یا شرایط کافی نیستند").join("؛ ");
  return {
    countryCode: candidate.countryCode, route: candidate.route,
    officialEligibility: eligibility,
    applicantFit: assessment.measures.applicantFit,
    practicalFit: assessment.measures.practicalFit,
    irviScore: assessment.measures.irvi.score,
    confidence: assessment.measures.irvi.confidence,
    threshold: assessment.ranking.threshold,
    qualifiedExampleCount: assessment.measures.irvi.components.qualified_examples.count,
    frictionPoints: assessment.measures.irvi.friction.points,
    risks, reasons, ...provenanceIds(assessment, candidate, eligibility), evidence: evidenceStatus(assessment),
    idealNextActions: nextActions(assessment),
    summaryFa: `مسیر ${ROUTE_FA[candidate.route] ?? candidate.route} در ${COUNTRY_FA[candidate.countryCode] ?? candidate.countryCode} ${assessment.ranking.rankable ? "برای رتبه‌بندی پذیرفته شده" : "هنوز رتبه‌بندی نمی‌شود"}: ${explanationFa}.`
  };
}

export async function findViableRoutesForIranians(input = {}, options = {}) {
  const args = {
    ...input,
    asOf: input.asOf ?? new Date().toISOString().slice(0, 10),
    maxCandidates: input.maxCandidates ?? MAX_CANDIDATES,
    routeAssessments: input.routeAssessments ?? []
  };
  validateInput(args);
  const provider = options.evidenceProvider ?? communityRouteEvidenceProvider(options.signalStoreRoot, options.maxDatasetsScanned);
  let discovery;
  try {
    discovery = await provider.discoverCandidates(args, options.signal);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (error instanceof BudgetExceededError) throw error;
    return {
      status: "research_required", ranked: [], unranked: [],
      provider: { status: "unavailable", failureStatus: "failed", message: error instanceof Error ? error.message : String(error) },
      coverage: { countries: args.countryCodes.map((countryCode) => ({ countryCode, status: "unknown" })), truncatedCandidates: false },
      reason: "EvidenceProvider is unavailable; no candidate or eligibility fact was inferred."
    };
  }
  if (discovery?.status !== "available" || !Array.isArray(discovery.candidates)) {
    return {
      status: "research_required", ranked: [], unranked: [],
      provider: { status: "unsupported", failureStatus: "unsupported", message: "EvidenceProvider returned no usable candidate set." },
      coverage: { countries: args.countryCodes.map((countryCode) => ({ countryCode, status: "unknown" })), truncatedCandidates: false },
      reason: "No source-backed candidate set is available."
    };
  }
  const unique = new Map();
  const providerCandidates = discovery.candidates.slice(0, MAX_PROVIDER_CANDIDATES);
  for (const candidate of providerCandidates) {
    if (!candidate || !args.countryCodes.includes(candidate.countryCode) || typeof candidate.route !== "string"
      || !Array.isArray(candidate.sourceIds) || !candidate.sourceIds.length) continue;
    const key = `${candidate.countryCode}:${candidate.route}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const candidates = [...unique.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.route.localeCompare(b.route));
  const selected = candidates.slice(0, args.maxCandidates);
  const ranked = [];
  const unranked = [];
  for (const candidate of selected) {
    if (options.signal?.aborted) throw options.signal.reason;
    const supplied = args.routeAssessments.find((item) => item.countryCode === candidate.countryCode && normalizeQuestionText(item.route) === normalizeQuestionText(candidate.route));
    const scorecard = Object.fromEntries(SCORECARD_FIELDS.filter((field) => supplied?.[field] !== undefined).map((field) => [field, supplied[field]]));
    // A caller's PASS is a claim, not a checked eligibility result. Only a trusted verifier can unlock ranking.
    let checkedEligibility = null;
    if (options.eligibilityProvider?.assess) {
      try {
        checkedEligibility = await options.eligibilityProvider.assess({ ...args, countryCode: candidate.countryCode, route: candidate.route, claimedStatus: supplied?.officialEligibility }, options.signal);
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
      }
    }
    const verified = checkedEligibility?.verificationStatus === "verified"
      && checkedEligibility?.freshness === "current"
      && typeof checkedEligibility?.assessmentId === "string" && checkedEligibility.assessmentId.length > 0
      && Array.isArray(checkedEligibility?.sourceIds) && checkedEligibility.sourceIds.length > 0;
    const eligibilityStatus = verified && ["PASS", "POSSIBLE", "FAIL", "UNKNOWN"].includes(checkedEligibility.status)
      ? checkedEligibility.status : supplied?.officialEligibility === "FAIL" ? "FAIL" : "UNKNOWN";
    const eligibility = verified ? {
      status: eligibilityStatus, source: "verified_scorecard", assessmentId: checkedEligibility.assessmentId,
      sourceIds: checkedEligibility.sourceIds, freshness: checkedEligibility.freshness, verificationStatus: checkedEligibility.verificationStatus
    } : {
      status: eligibilityStatus, source: "unverified_caller_scorecard", claimedStatus: supplied?.officialEligibility ?? null,
      freshness: "unknown", verificationStatus: "unverified"
    };
    const assessment = getIranianRouteViability({
      countryCode: candidate.countryCode, route: candidate.route, asOf: args.asOf,
      nationality: args.nationality, residenceCountry: args.residenceCountry, originCountry: args.originCountry,
      ...scorecard, officialEligibility: eligibilityStatus
    }, options.signalStoreRoot, options.maxDatasetsScanned, options.evidenceProvider ? undefined : discovery.store);
    const presented = presentCandidate(candidate, assessment, eligibility);
    (assessment.ranking.rankable ? ranked : unranked).push(presented);
  }
  ranked.sort((a, b) => b.irviScore - a.irviScore || a.countryCode.localeCompare(b.countryCode) || a.route.localeCompare(b.route));
  const countries = Array.isArray(discovery.countries) ? discovery.countries : args.countryCodes.map((countryCode) => ({
    countryCode, status: candidates.some((item) => item.countryCode === countryCode) ? "covered" : "no_coverage"
  }));
  const truncatedCandidates = candidates.length > selected.length || discovery.candidates.length > providerCandidates.length || discovery.scanLimited === true;
  return {
    status: candidates.length === 0 ? "research_required"
      : countries.some((item) => item.status !== "covered") || truncatedCandidates ? "partial_coverage" : "complete",
    asOf: args.asOf,
    provider: { status: "available", sourceType: discovery.sourceType ?? "unknown", retrievedAt: discovery.retrievedAt ?? null, rateStatus: discovery.rateStatus ?? "unknown" },
    coverage: { countries, providerCandidatesReported: discovery.candidates.length, candidatesFound: candidates.length, candidatesAssessed: selected.length, truncatedCandidates, claimsScanned: discovery.claimsScanned ?? null },
    ranked, unranked,
    usageNote: "Ranked results passed official eligibility and the reviewed public evidence threshold. Unranked candidates remain visible with missing gates. Scores and observed cases are not approval probabilities."
  };
}
