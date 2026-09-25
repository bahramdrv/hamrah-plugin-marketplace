import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { opportunityEvidenceRefs } from "./community-opportunities.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

export class OpportunityNotFoundError extends Error {}

const AUTHORITATIVE = new Set(["primary", "trusted"]);

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function contains(value, wanted) {
  return !wanted || normalizeQuestionText(value).includes(wanted);
}

function newestOpportunities(store) {
  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    for (const opportunity of canonical.academicOpportunities) {
      const existing = newest.get(opportunity.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) newest.set(opportunity.id, { datasetId, canonical, opportunity });
    }
  }
  return [...newest.values()];
}

function evidenceClass(item, source) {
  if (source?.public !== true) return "private_community";
  return AUTHORITATIVE.has(item.authority) && /^https:\/\//.test(item.source_url ?? "") ? "official" : "public_community";
}

function freshness(opportunity, evidence) {
  return {
    lastVerified: opportunity.lifecycle.last_verified ?? null,
    latestRetrieval: evidence.map((item) => item.retrieved_at).filter(Boolean).sort().at(-1) ?? null,
    deadline: opportunity.deadline
  };
}

function summary({ datasetId, opportunity }) {
  return {
    opportunityId: opportunity.id,
    datasetId,
    countryCode: opportunity.country_code,
    routes: opportunity.routes,
    institution: opportunity.institution,
    department: opportunity.department,
    program: opportunity.program,
    degreeLevel: opportunity.degree_level,
    field: opportunity.field,
    researchArea: opportunity.research_area,
    deadline: opportunity.deadline,
    intake: opportunity.intake,
    fundingStatus: opportunity.funding.status,
    fundingComponents: opportunity.funding.components.map((component) => ({ type: component.type, status: component.status })),
    nationalityRestrictions: opportunity.nationality_restrictions.status,
    iranianEvidence: opportunity.iranian_evidence.status,
    lifecycle: opportunity.lifecycle
  };
}

export function searchAcademicOpportunities(args = {}, root = DATASET_ROOT, maxDatasets) {
  const store = loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const tokens = normalizeQuestionText(args.query).split(" ").filter((token) => token.length >= 2);
  const statuses = Array.isArray(args.statuses) && args.statuses.length ? new Set(args.statuses) : CURRENT_STATUSES;

  const scoped = newestOpportunities(store).filter(({ opportunity }) =>
    (!countryCode || normalizeQuestionText(opportunity.country_code) === countryCode)
    && (!route || opportunity.routes.some((item) => normalizeQuestionText(item) === route))
    && statuses.has(opportunity.lifecycle.status));
  let unknownDeadlineExcluded = 0;
  const matches = scoped.filter(({ opportunity }) => {
    if (!contains(opportunity.institution, normalizeQuestionText(args.institution))) return false;
    if (!contains(opportunity.field, normalizeQuestionText(args.field))) return false;
    if (args.degreeLevel && opportunity.degree_level !== args.degreeLevel) return false;
    if (args.fundingStatus && opportunity.funding.status !== args.fundingStatus) return false;
    if (args.fundingComponent && !opportunity.funding.components.some((component) => component.type === args.fundingComponent)) return false;
    if (tokens.length) {
      const text = normalizeQuestionText([opportunity.institution, opportunity.department, opportunity.program, opportunity.field, opportunity.research_area, opportunity.supervisor].filter(Boolean).join(" "));
      if (!tokens.every((token) => text.includes(token))) return false;
    }
    if (args.deadlineAfter || args.deadlineBefore) {
      // An unknown deadline is neither inside nor outside a date range; it is counted instead of guessed.
      if (!opportunity.deadline) {
        unknownDeadlineExcluded++;
        return false;
      }
      if (args.deadlineAfter && opportunity.deadline < args.deadlineAfter) return false;
      if (args.deadlineBefore && opportunity.deadline > args.deadlineBefore) return false;
    }
    return true;
  });
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const opportunities = matches
    .sort((a, b) => String(a.opportunity.deadline ?? "9999").localeCompare(String(b.opportunity.deadline ?? "9999")) || a.opportunity.id.localeCompare(b.opportunity.id))
    .slice(0, limit)
    .map(summary);
  const matchingDatasets = new Set(scoped.map((item) => item.datasetId)).size;
  return {
    source: "Hamrah Academic Opportunity Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      status: matchingDatasets > 0 ? "evidence_found" : "no_coverage",
      note: matchingDatasets > 0
        ? "Only validated opportunities are listed; programs not in Hamrah's datasets are unknown, not closed."
        : "No validated Hamrah dataset has academic opportunities for this scope yet. This is missing coverage, not evidence that no program exists.",
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets,
      matchingDatasets
    },
    filters: args,
    resultCount: opportunities.length,
    unknownDeadlineExcluded,
    opportunities,
    usageNote: "Funding, admission conditions, nationality restrictions, and Iranian participation are shown only as their sources state them; unknown means no source states it."
  };
}

export function getAcademicOpportunity(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.opportunityId !== "string" || !args.opportunityId.trim()) {
    throw new Error("getAcademicOpportunity requires an opportunityId from searchAcademicOpportunities.");
  }
  const store = loadCommunitySignalStore(root, maxDatasets);
  const found = newestOpportunities(store).find(({ opportunity }) => opportunity.id === args.opportunityId.trim());
  if (!found) throw new OpportunityNotFoundError(`Academic opportunity not found: ${args.opportunityId}`);
  const { datasetId, canonical, opportunity } = found;
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  // Evidence cited by any nested fact is shown alongside the opportunity's own evidence.
  const citedIds = new Set([...opportunity.evidence_ids, ...opportunityEvidenceRefs(opportunity).map(([, id]) => id)]);
  const cited = canonical.evidence.filter((item) => citedIds.has(item.id));
  const evidence = cited.map((item) => {
    const source = sourcesById.get(item.source_id);
    const evidenceClassName = evidenceClass(item, source);
    return {
      evidenceId: item.id,
      evidenceClass: evidenceClassName,
      authority: item.authority,
      sourceName: source?.source_name ?? null,
      sourceFamily: source?.source_family ?? null,
      sourceUrl: evidenceClassName === "private_community" ? null : item.source_url,
      retrievedAt: item.retrieved_at,
      publishedAt: item.published_at,
      contentHash: item.content_hash,
      summary: item.evidence_summary
    };
  });
  return {
    source: "Hamrah Academic Opportunity Store",
    datasetId,
    schemaVersion: opportunity.source_schema_version,
    generatedAt: canonical.generatedAt,
    opportunity,
    evidence,
    freshness: freshness(opportunity, cited),
    usageNote: "Check the official institution source before applying; funding marked unverified or unknown is not an offer."
  };
}
