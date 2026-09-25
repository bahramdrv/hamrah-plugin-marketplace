import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { assessStatistic, isAuthoritativeStatisticEvidence } from "./community-official-statistics.mjs";
import { normalizeQuestionText } from "./community-questions.mjs";
import { applicantMatches } from "./community-route-claim-tools.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

const SEPARATION = "An official approval statistic is the authority's own count for its stated population and period. It is not the Iranian Route Viability Index, applicant fit, Practical Fit, Evidence Confidence, or Community Confidence, and community reports never adjust it.";

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestStatistics(store) {
  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    for (const statistic of canonical.officialStatistics) {
      const existing = newest.get(statistic.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) newest.set(statistic.id, { datasetId, canonical, statistic });
    }
  }
  return [...newest.values()];
}

function present({ datasetId, canonical, statistic }) {
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  const cited = statistic.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean);
  const authoritative = cited.filter((item) => isAuthoritativeStatisticEvidence(item, sourcesById.get(item.source_id)));
  return {
    statisticId: statistic.id,
    datasetId,
    countryCode: statistic.country_code,
    routes: statistic.routes,
    authority: statistic.authority,
    population: statistic.population,
    period: statistic.period,
    counts: statistic.counts,
    publishedSuccessRate: statistic.published_success_rate,
    ...assessStatistic(statistic, authoritative.length > 0),
    sources: authoritative.map((item) => ({
      evidenceId: item.id,
      sourceName: sourcesById.get(item.source_id)?.source_name ?? null,
      sourceUrl: item.source_url,
      authorityLevel: item.authority,
      retrievedAt: item.retrieved_at,
      publishedAt: item.published_at,
      contentHash: item.content_hash
    })),
    lifecycle: statistic.lifecycle
  };
}

export function searchOfficialApprovalStatistics(args = {}, root = DATASET_ROOT, maxDatasets, loadedStore) {
  const store = loadedStore ?? loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const statuses = Array.isArray(args.statuses) && args.statuses.length ? new Set(args.statuses) : CURRENT_STATUSES;
  const scoped = newestStatistics(store).filter(({ statistic }) =>
    (!countryCode || normalizeQuestionText(statistic.country_code) === countryCode)
    && (!route || statistic.routes.some((item) => normalizeQuestionText(item) === route))
    && applicantMatches(statistic.population, args)
    && statuses.has(statistic.lifecycle.status));
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const statistics = scoped
    .sort((a, b) => b.statistic.period.end.localeCompare(a.statistic.period.end) || a.statistic.id.localeCompare(b.statistic.id))
    .slice(0, limit)
    .map(present);
  const matchingDatasets = new Set(scoped.map((item) => item.datasetId)).size;
  return {
    source: "Hamrah Official Statistics Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      status: matchingDatasets > 0 ? "evidence_found" : "no_coverage",
      note: matchingDatasets > 0
        ? "Only statistics an authority publishes with a defined population and period are listed."
        : "No validated Hamrah dataset has an official approval statistic for this scope. This is missing coverage; no rate can be given, and community samples cannot stand in for one.",
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets,
      matchingDatasets
    },
    filters: args,
    resultCount: statistics.length,
    statistics,
    separation: SEPARATION,
    usageNote: "Show official_success_rate only with its authority, population, period, and source. An unresolved statistic has no official rate; report its reasons and never fill the gap from a published figure or community observations."
  };
}
