import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { experienceEvidenceIds, isQualifiedSuccess } from "./community-experiences.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { applicantMatches, presentEvidence } from "./community-route-claim-tools.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

export class LivedExperienceNotFoundError extends Error {}

const FAILURES = new Set(["refusal", "operational_failure"]);
const SAMPLE_BIAS = "These cases are not representative: people publish some outcomes and not others, and Hamrah lists only the few with explicit public Iran evidence. Counts describe what was observed, not how likely any outcome is.";
const PRIVATE_CONTEXT_NOTE = "Cases resting only on private community evidence are context or warning; they are never counted as public successes or failures.";

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestExperiences(store) {
  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    for (const experience of canonical.livedExperiences) {
      const existing = newest.get(experience.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) newest.set(experience.id, { datasetId, canonical, experience });
    }
  }
  return [...newest.values()];
}

// A profile locator is kept only as audited provenance; ordinary output shows its source family, never the URL.
// Private evidence is context, and public evidence that contradicts the case is opposing, never support.
function presentExperienceEvidence(item, source) {
  const presented = presentEvidence(item, source);
  const role = presented.evidenceClass === "private_community" ? "context"
    : item.supports_or_contradicts === "contradicts" ? "opposing"
    : "support";
  if (item.public_person_locator === true) {
    return { ...presented, evidenceClass: "public_person", sourceUrl: null, sourceUrlWithheld: "public_person_locator", role };
  }
  return { ...presented, role };
}

// Private community evidence alone neither establishes the Iran connection nor supports the milestone publicly.
export function assessLivedExperience({ canonical, experience }) {
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  const presented = new Map(experienceEvidenceIds(experience).map((id) => evidenceById.get(id)).filter(Boolean)
    .map((item) => [item.id, presentExperienceEvidence(item, sourcesById.get(item.source_id))]));
  const hasRole = (role) => (id) => presented.get(id)?.role === role;
  const iranConnectionEvidence = experience.iran_connection.evidence_ids.some(hasRole("support")) ? "public" : "no_public_support";
  const status = iranConnectionEvidence === "public" && experience.evidence_ids.some(hasRole("support")) ? "public_evidence"
    : experienceEvidenceIds(experience).some(hasRole("context")) ? "private_community_only"
    : "no_public_support";
  const caseClass = status === "private_community_only" ? "private_context"
    : status === "no_public_support" ? "unresolved"
    : isQualifiedSuccess(experience) ? "qualified_success"
    : FAILURES.has(experience.outcome) ? "failure"
    : "unresolved";
  return {
    caseClass,
    evidence: [...presented.values()],
    verification: { status, iranConnectionEvidence },
    freshness: {
      lastVerified: experience.lifecycle.last_verified ?? null,
      latestRetrieval: [...presented.values()].map((item) => item.retrievedAt).filter(Boolean).sort().at(-1) ?? null,
      eventDate: experience.event_date
    }
  };
}

function observedCases(assessed) {
  const group = (caseClass) => {
    const experienceIds = assessed.filter((item) => item.caseClass === caseClass).map((item) => item.experience.id).sort();
    return { count: experienceIds.length, experienceIds };
  };
  return {
    qualifiedSuccesses: group("qualified_success"),
    failures: group("failure"),
    unresolved: group("unresolved"),
    privateContext: { ...group("private_context"), note: PRIVATE_CONTEXT_NOTE },
    sampleBias: SAMPLE_BIAS,
    usable_as_probability: false
  };
}

function summary({ datasetId, experience, caseClass, verification, freshness }) {
  return {
    experienceId: experience.id,
    datasetId,
    countryCode: experience.country_code,
    routes: experience.routes,
    milestone: experience.milestone,
    outcome: experience.outcome,
    caseClass,
    eventDate: experience.event_date,
    entity: experience.entity,
    applicantScope: experience.applicant_scope,
    summaryEn: experience.summary_en,
    iranConnection: { status: experience.iran_connection.status, basis: experience.iran_connection.basis, evidenceIds: experience.iran_connection.evidence_ids },
    evidenceIds: experience.evidence_ids,
    lifecycle: experience.lifecycle,
    verification,
    freshness
  };
}

export function searchIranianLivedExperiences(args = {}, root = DATASET_ROOT, maxDatasets) {
  const store = loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const tokens = normalizeQuestionText(args.query).split(" ").filter((token) => token.length >= 2);
  const statuses = Array.isArray(args.statuses) && args.statuses.length ? new Set(args.statuses) : CURRENT_STATUSES;

  const scoped = newestExperiences(store).filter(({ experience }) =>
    (!countryCode || normalizeQuestionText(experience.country_code) === countryCode)
    && (!route || experience.routes.some((item) => normalizeQuestionText(item) === route))
    && applicantMatches(experience, args)
    && statuses.has(experience.lifecycle.status));
  const matches = scoped
    .filter(({ experience }) => (!args.milestone || experience.milestone === args.milestone) && (!args.outcome || experience.outcome === args.outcome))
    .filter(({ experience }) => {
      if (!tokens.length) return true;
      const text = normalizeQuestionText(`${experience.summary_en} ${experience.milestone} ${experience.routes.join(" ")} ${experience.entity?.name ?? ""}`);
      return tokens.every((token) => text.includes(token));
    })
    .map((entry) => ({ ...entry, ...assessLivedExperience(entry) }));
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const experiences = [...matches]
    .sort((a, b) => dateValue(b.experience.event_date) - dateValue(a.experience.event_date) || a.experience.id.localeCompare(b.experience.id))
    .slice(0, limit)
    .map(summary);
  const matchingDatasets = new Set(scoped.map((item) => item.datasetId)).size;
  return {
    source: "Hamrah Lived Experience Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      status: matchingDatasets > 0 ? "evidence_found" : "no_coverage",
      note: matchingDatasets > 0
        ? "Only validated experiences with explicit public Iran evidence are listed; experiences Hamrah has not recorded are unknown."
        : "No validated Hamrah dataset has Iranian Lived Experiences for this scope yet. This is missing coverage, not evidence that nobody has used the route.",
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets,
      matchingDatasets
    },
    filters: args,
    resultCount: experiences.length,
    experiences,
    observedCases: observedCases(matches),
    usageNote: "Each experience is one observed case, described without naming the person. Show successes, failures, and unresolved cases side by side with the sample-bias statement, and never turn their counts into an approval chance."
  };
}

export function getLivedExperience(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.experienceId !== "string" || !args.experienceId.trim()) {
    throw new Error("getLivedExperience requires an experienceId from searchIranianLivedExperiences.");
  }
  const store = loadCommunitySignalStore(root, maxDatasets);
  const found = newestExperiences(store).find(({ experience }) => experience.id === args.experienceId.trim());
  if (!found) throw new LivedExperienceNotFoundError(`Lived experience not found: ${args.experienceId}`);
  const { datasetId, canonical, experience } = found;
  const { caseClass, evidence, verification, freshness } = assessLivedExperience(found);
  return {
    source: "Hamrah Lived Experience Store",
    datasetId,
    schemaVersion: experience.source_schema_version,
    generatedAt: canonical.generatedAt,
    experience,
    caseClass,
    evidence,
    verification,
    freshness,
    usageNote: "One observed case, not a prediction. Private community evidence is context only, and public profile locators are withheld from ordinary output."
  };
}
