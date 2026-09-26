import { readFileSync } from "node:fs";

import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { claimFreshness } from "./community-answers.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { assessLivedExperience } from "./community-experience-tools.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { applicantMatches, presentEvidence } from "./community-route-claim-tools.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

const OFFICIAL = new Set(["official_rule", "financial_requirement"]);
const COMMUNITY = new Set(["operational_pattern", "anecdotal_pattern"]);
const AUTHORITATIVE = new Set(["primary", "trusted"]);
// These are documented, non-sensitive applicant attributes. Geography, nationality, age and free text
// conditions are deliberately excluded from examples, even when they appear in applicant_scope.
const OBSERVABLE_FIELDS = ["occupations", "fields", "education_levels", "regulated_professions"];
const MAX_CHARACTERISTICS = 50;
const RECENCY = JSON.parse(readFileSync(new URL("../skills/hamrah-signal-builder/references/evidence_confidence_policy.json", import.meta.url), "utf8")).recency_windows;
const EXAMPLE_WINDOW_DAYS = JSON.parse(readFileSync(new URL("../skills/hamrah-signal-builder/references/irvi_policy.json", import.meta.url), "utf8")).components.qualified_examples.window_days;

export class InvalidIdealCandidateProfileInput extends Error {}

function latestById(store, collection, asOf) {
  const latest = new Map();
  for (const entry of store.datasets) {
    if (entry.canonical.generatedAt.slice(0, 10) > asOf) continue;
    for (const artifact of entry.canonical[collection]) {
      const previous = latest.get(artifact.id);
      if (!previous || entry.canonical.generatedAt > previous.canonical.generatedAt) latest.set(artifact.id, { ...entry, artifact });
    }
  }
  return [...latest.values()];
}

function citedEvidence(canonical, ids) {
  const evidence = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sources = new Map(canonical.sources.map((item) => [item.id, item]));
  return ids.map((id) => evidence.get(id)).filter(Boolean).map((item) => ({ item, source: sources.get(item.source_id) }));
}

function publicEvidence(canonical, ids, asOf) {
  return citedEvidence(canonical, ids).filter(({ item, source }) => source?.public === true
    && /^https:\/\//.test(item.source_url ?? "") && item.retrieved_at?.slice(0, 10) <= asOf);
}

function cite({ item, source }) {
  return { ...presentEvidence(item, source), sourceId: item.source_id,
    ...(item.public_person_locator === true ? { sourceUrl: null, sourceUrlWithheld: "public_person_locator" } : {}) };
}

function scoped(artifact, args) {
  return normalizeQuestionText(artifact.country_code) === normalizeQuestionText(args.countryCode)
    && artifact.routes.some((route) => normalizeQuestionText(route) === normalizeQuestionText(args.route))
    && applicantMatches(artifact, args) && CURRENT_STATUSES.has(artifact.lifecycle.status);
}

function freshnessFor(claim, supporting, asOf) {
  if (OFFICIAL.has(claim.claim_type)) return claimFreshness(claim, supporting, asOf);
  const window = RECENCY[claim.claim_type];
  const retrievedAt = supporting.map((item) => item.retrieved_at?.slice(0, 10)).filter(Boolean).sort().at(-1);
  if (!window || !retrievedAt) return { status: "unknown", retrievedAt: retrievedAt ?? null };
  const ageDays = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${retrievedAt}T00:00:00Z`)) / 86_400_000;
  return { status: ageDays > window.max_age_days ? "stale" : ageDays > window.aging_after_days ? "aging" : "current",
    retrievedAt, ageDays, maxAgeDays: window.max_age_days };
}

function claimProfile(entry, args) {
  const claim = entry.artifact;
  if (!scoped(claim, args) || !(OFFICIAL.has(claim.claim_type) || COMMUNITY.has(claim.claim_type))) return null;
  const supporting = publicEvidence(entry.canonical, claim.evidence_ids, args.asOf).filter(({ item }) => item.supports_or_contradicts === "supports");
  const opposing = citedEvidence(entry.canonical, claim.opposing_evidence_ids)
    .filter(({ item }) => item.retrieved_at?.slice(0, 10) <= args.asOf);
  const usable = OFFICIAL.has(claim.claim_type)
    ? supporting.filter(({ item }) => AUTHORITATIVE.has(item.authority)) : supporting;
  if (!usable.length) return null;
  const freshness = freshnessFor(claim, usable.map(({ item }) => item), args.asOf);
  const profile = {
    characteristic: claim.statement_en,
    classification: OFFICIAL.has(claim.claim_type) ? "official_requirement" : "community_pattern",
    classificationFa: OFFICIAL.has(claim.claim_type) ? "شرط رسمی" : "الگوی جامعه",
    claimId: claim.id, datasetId: entry.datasetId, processStage: claim.process_stage,
    evidence: usable.map(cite), opposingEvidence: opposing.map(cite), freshness,
    mandatory: OFFICIAL.has(claim.claim_type) ? null : false,
    summaryFa: OFFICIAL.has(claim.claim_type)
      ? "شرط رسمیِ مستند؛ انطباق فردی باید جداگانه بررسی شود."
      : "الگوی مشاهده‌شده در جامعه؛ شرط الزامی یا احتمال موفقیت نیست."
  };
  if (opposing.length || freshness.status === "stale" || freshness.status === "unknown") {
    return { unresolved: { ...profile, mandatory: false,
      reason: opposing.length ? "contradicted" : "freshness_unresolved",
      summaryFa: opposing.length ? "شواهد متعارض‌اند؛ این ویژگی هنوز قطعی نیست." : "تازگی شاهد کافی نیست؛ این ویژگی نیاز به بررسی دوباره دارد." } };
  }
  return { characteristic: profile };
}

function observedProfiles(entry, args) {
  const experience = entry.artifact;
  if (!scoped(experience, args)) return [];
  const availableCanonical = { ...entry.canonical,
    evidence: entry.canonical.evidence.filter((item) => item.retrieved_at?.slice(0, 10) <= args.asOf
      && item.supports_or_contradicts !== "resolves") };
  const assessed = assessLivedExperience({ canonical: availableCanonical, experience });
  if (assessed.caseClass !== "qualified_success" || experience.event_date > args.asOf) return [];
  const ageDays = (Date.parse(`${args.asOf}T00:00:00Z`) - Date.parse(`${experience.event_date}T00:00:00Z`)) / 86_400_000;
  if (ageDays > EXAMPLE_WINDOW_DAYS) return [];
  const publicSupport = publicEvidence(entry.canonical, experience.evidence_ids, args.asOf)
    .filter(({ item }) => item.supports_or_contradicts === "supports");
  if (!publicSupport.length || assessed.evidence.some((item) => item.role === "opposing")) return [];
  const retrievedAt = assessed.freshness.latestRetrieval;
  const evidenceAgeDays = retrievedAt ? (Date.parse(`${args.asOf}T00:00:00Z`) - Date.parse(`${retrievedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000 : null;
  if (evidenceAgeDays === null || evidenceAgeDays > EXAMPLE_WINDOW_DAYS) return [];
  const freshness = { status: Math.max(ageDays, evidenceAgeDays) > EXAMPLE_WINDOW_DAYS / 2 ? "aging" : "current",
    ageDays, evidenceAgeDays, maxAgeDays: EXAMPLE_WINDOW_DAYS, eventDate: experience.event_date,
    lastVerified: experience.lifecycle.last_verified ?? null,
    latestRetrieval: retrievedAt };
  return OBSERVABLE_FIELDS.flatMap((field) => (experience.applicant_scope?.[field] ?? [])
    .filter((value) => typeof value === "string" && value.trim()
      && publicSupport.some(({ item }) => normalizeQuestionText(item.evidence_summary).includes(normalizeQuestionText(value))))
    .map((value) => ({
      characteristic: `${field}: ${value}`,
      classification: "observed_success_pattern", mandatory: false,
      classificationFa: "ویژگی مشاهده‌شده در نمونهٔ موفق",
      experienceId: experience.id, datasetId: entry.datasetId,
      milestone: experience.milestone, evidence: publicSupport.map(cite), freshness,
      summaryFa: "در یک نمونهٔ موفقِ مستند مشاهده شده است؛ شرط الزامی یا پیش‌بینی نتیجه نیست."
    })));
}

export function getIdealCandidateProfile(input = {}, root = DATASET_ROOT, maxDatasets) {
  const args = { ...input, asOf: input.asOf ?? new Date().toISOString().slice(0, 10) };
  if (typeof args.countryCode !== "string" || !/^[A-Z]{3}$/.test(args.countryCode)
    || typeof args.route !== "string" || !args.route.trim() || args.route.length > 100
    || !parseIsoDay(args.asOf, true, false)) {
    throw new InvalidIdealCandidateProfileInput("countryCode, route, and a real ISO asOf date are required.");
  }
  const store = loadCommunitySignalStore(root, maxDatasets);
  const claims = latestById(store, "routeClaims", args.asOf).map((entry) => claimProfile(entry, args)).filter(Boolean);
  const observed = latestById(store, "livedExperiences", args.asOf).flatMap((entry) => observedProfiles(entry, args));
  const allCharacteristics = [...claims.flatMap((item) => item.characteristic ? [item.characteristic] : []), ...observed]
    .sort((a, b) => a.classification.localeCompare(b.classification) || a.characteristic.localeCompare(b.characteristic));
  const allUnresolved = claims.flatMap((item) => item.unresolved ? [item.unresolved] : []);
  const characteristics = allCharacteristics.slice(0, MAX_CHARACTERISTICS);
  const unresolved = allUnresolved.slice(0, MAX_CHARACTERISTICS);
  return {
    source: "Hamrah Ideal Candidate Profile", countryCode: args.countryCode, route: args.route, asOf: args.asOf,
    coverage: { status: characteristics.length ? "evidence_found" : unresolved.length ? "unresolved" : "no_coverage",
      noteFa: characteristics.length ? "تنها ویژگی‌های دارای شاهد معتبر نمایش داده شده‌اند؛ فهرست کامل شرایط مسیر نیست."
        : "ویژگی قابل اتکایی ثبت نشده است؛ نبود شاهد به معنی نامناسب بودن مسیر یا متقاضی نیست.",
      filesScanned: store.scanned, validDatasets: store.datasets.length, invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets, truncated: store.truncated || allCharacteristics.length > MAX_CHARACTERISTICS || allUnresolved.length > MAX_CHARACTERISTICS },
    characteristics, unresolved,
    usageNoteFa: "شرط رسمی، نمونهٔ موفقِ مشاهده‌شده و الگوی جامعه را جدا نگه دارید. نمونه‌ها نمایندهٔ همهٔ متقاضیان نیستند و هیچ الگوی مشاهده‌شده‌ای شرط الزامی یا احتمال پذیرش نیست."
  };
}
