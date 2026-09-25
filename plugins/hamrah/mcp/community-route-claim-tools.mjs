import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

export const CLAIM_TYPES = ["official_rule", "financial_requirement", "operational_pattern", "anecdotal_pattern", "opportunity", "risk", "workaround"];
const AUTHORITATIVE = new Set(["primary", "trusted"]);
// Applicant filters and the applicant_scope lists they are matched against.
const APPLICANT_FILTERS = {
  nationality: ["nationalities"],
  residenceCountry: ["residence_countries", "applying_from"],
  originCountry: ["origin_countries"]
};

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function evidenceClass(item, source) {
  if (source?.public !== true) return "private_community";
  return AUTHORITATIVE.has(item.authority) && /^https:\/\//.test(item.source_url ?? "") ? "official" : "public_community";
}

function presentEvidence(item, source) {
  const evidenceClassName = evidenceClass(item, source);
  return {
    evidenceId: item.id,
    evidenceClass: evidenceClassName,
    authority: item.authority,
    sourceName: source?.source_name ?? item.source_name ?? null,
    sourceFamily: source?.source_family ?? null,
    // Private sources are context only and never expose a locator.
    sourceUrl: evidenceClassName === "private_community" ? null : item.source_url,
    retrievedAt: item.retrieved_at,
    publishedAt: item.published_at,
    eventDate: item.event_date,
    contentHash: item.content_hash,
    independenceGroup: item.independence_group,
    summary: item.evidence_summary
  };
}

// A claim with no applicant scope applies to everyone; a scoped claim matches only applicants inside a listed value.
function applicantMatches(claim, args) {
  const scope = claim.applicant_scope;
  return Object.entries(APPLICANT_FILTERS).every(([filter, fields]) => {
    const wanted = normalizeQuestionText(args[filter]);
    if (!wanted || !scope) return true;
    const listed = fields.flatMap((field) => scope[field] ?? []);
    return listed.length === 0 || listed.some((value) => normalizeQuestionText(value) === wanted);
  });
}

function verification(claim, supporting) {
  const classes = new Set(supporting.map((item) => item.evidenceClass));
  const status = classes.has("official") ? "official_source" : classes.has("public_community") ? "public_community_source" : "private_community_only";
  return {
    status,
    lastVerified: claim.lifecycle.last_verified ?? null,
    latestRetrieval: supporting.map((item) => item.retrievedAt).filter(Boolean).sort().at(-1) ?? null
  };
}

export function searchRouteClaims(args = {}, root = DATASET_ROOT, maxDatasets) {
  const store = loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const processStage = normalizeQuestionText(args.processStage);
  const tokens = normalizeQuestionText(args.query).split(" ").filter((token) => token.length >= 2);
  const statuses = Array.isArray(args.statuses) && args.statuses.length ? new Set(args.statuses) : CURRENT_STATUSES;

  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    for (const claim of canonical.routeClaims) {
      const existing = newest.get(claim.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) newest.set(claim.id, { datasetId, canonical, claim });
    }
  }
  const scoped = [...newest.values()].filter(({ claim }) =>
    (!countryCode || normalizeQuestionText(claim.country_code) === countryCode)
    && (!route || claim.routes.some((item) => normalizeQuestionText(item) === route))
    && (!processStage || normalizeQuestionText(claim.process_stage) === processStage)
    && (!args.claimType || claim.claim_type === args.claimType)
    && applicantMatches(claim, args)
    && statuses.has(claim.lifecycle.status));
  const matches = scoped.filter(({ claim }) => {
    if (!tokens.length) return true;
    const text = normalizeQuestionText(`${claim.statement_en} ${claim.claim_type} ${claim.routes.join(" ")}`);
    return tokens.every((token) => text.includes(token));
  });
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const claims = matches
    .sort((a, b) => dateValue(b.claim.lifecycle.last_verified) - dateValue(a.claim.lifecycle.last_verified) || a.claim.id.localeCompare(b.claim.id))
    .slice(0, limit)
    .map(({ datasetId, canonical, claim }) => {
      const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
      const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
      const present = (ids) => ids.map((id) => evidenceById.get(id)).filter(Boolean)
        .map((item) => presentEvidence(item, sourcesById.get(item.source_id)));
      const supporting = present(claim.evidence_ids);
      const opposing = present(claim.opposing_evidence_ids);
      const evidenceClasses = { official: 0, public_community: 0, private_community: 0 };
      for (const item of [...supporting, ...opposing]) evidenceClasses[item.evidenceClass]++;
      return {
        claimId: claim.id,
        datasetId,
        schemaVersion: claim.source_schema_version,
        claimType: claim.claim_type,
        statementEn: claim.statement_en,
        countryCode: claim.country_code,
        routes: claim.routes,
        processStage: claim.process_stage,
        applicantScope: claim.applicant_scope ?? null,
        lifecycle: claim.lifecycle,
        verification: verification(claim, supporting),
        evidenceClasses,
        supporting,
        opposing
      };
    });
  const matchingDatasets = new Set(scoped.map((item) => item.datasetId)).size;
  return {
    source: "Hamrah Route Claim Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      status: matchingDatasets > 0 ? "evidence_found" : "no_coverage",
      note: matchingDatasets > 0
        ? "Only validated datasets are searched; facts they do not cover remain unknown."
        : "No validated Hamrah dataset has Route Claims for this scope yet. This is missing coverage, not evidence that the route is closed or unavailable.",
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets,
      matchingDatasets
    },
    filters: args,
    resultCount: claims.length,
    claims,
    claimNotice: "Each Route Claim is a sourced statement to inspect, not a verified fact. official_source means an authoritative public source supports it; check freshness and applicant fit before relying on it, and never treat community patterns as rules or probabilities."
  };
}
