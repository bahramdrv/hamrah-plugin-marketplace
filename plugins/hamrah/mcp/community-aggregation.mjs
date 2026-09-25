import { createHash } from "node:crypto";

// Deterministic cross-dataset evidence aggregation for one search scope.
// Records are copies of one observation when they share a stable version 4 ID, a content hash, the same normalized
// summary text, or the same message locator; copies form an evidence cluster. Clusters are one independent report
// when a dataset declares a shared independence group or they cite the same URL. Only records linked from current
// signals, and not superseded by newer evidence, count as current support.

export const CURRENT_STATUSES = new Set(["active", "monitoring", "uncertain"]);
const MIN_TEXT_KEY_LENGTH = 24;
const MAX_CLUSTERS = 200;
const COPY_RISK_ORDER = ["low", "medium", "high"];

function identityText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function digest(parts) {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return value;
  }
}

class UnionFind {
  constructor() { this.parent = new Map(); }
  find(item) {
    if (!this.parent.has(item)) this.parent.set(item, item);
    let root = item;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    this.parent.set(item, root);
    return root;
  }
  union(a, b) { this.parent.set(this.find(a), this.find(b)); }
  groups(items) {
    const groups = new Map();
    for (const item of items) {
      const root = this.find(item);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(item);
    }
    return [...groups.values()];
  }
}

function joinByKeys(unionFind, keysByItem) {
  const firstByKey = new Map();
  for (const [item, keys] of keysByItem) {
    unionFind.find(item);
    for (const key of keys) {
      if (firstByKey.has(key)) unionFind.union(item, firstByKey.get(key));
      else firstByKey.set(key, item);
    }
  }
}

function recordDate(evidence) {
  return evidence.event_date ?? evidence.published_at ?? evidence.retrieved_at?.slice(0, 10) ?? null;
}

function timeWindow(dates) {
  const known = dates.filter(Boolean).sort();
  return { earliest: known[0] ?? null, latest: known.at(-1) ?? null };
}

function collectRecords(entries) {
  const records = new Map();
  const supersededBy = new Map();
  const indexes = new Map();
  for (const { datasetId, canonical, signal } of entries) {
    if (!indexes.has(datasetId)) {
      indexes.set(datasetId, {
        evidenceById: new Map(canonical.evidence.map((item) => [item.id, item])),
        sourcesById: new Map(canonical.sources.map((source) => [source.id, source]))
      });
      for (const item of canonical.evidence) if (item.supersedes) supersededBy.set(item.supersedes, item.id);
    }
    const { evidenceById, sourcesById } = indexes.get(datasetId);
    for (const link of signal.evidence_links) {
      const evidence = evidenceById.get(link.evidence_id);
      if (!evidence) continue;
      const key = `${datasetId}::${evidence.id}`;
      if (!records.has(key)) {
        records.set(key, { key, datasetId, evidence, source: sourcesById.get(evidence.source_id) ?? null, links: [] });
      }
      records.get(key).links.push({
        signalId: signal.id,
        relation: link.relation,
        independenceGroup: link.independence_group ?? evidence.independence_group,
        signalCurrent: CURRENT_STATUSES.has(signal.lifecycle.status),
        signalStatus: signal.lifecycle.status
      });
    }
  }
  for (const record of records.values()) {
    const successor = supersededBy.get(record.evidence.id);
    const currentLink = record.links.some((link) => link.signalCurrent);
    record.current = currentLink && !successor;
    record.historicalReason = successor
      ? `superseded by ${successor}`
      : currentLink ? null : `linked only to ${[...new Set(record.links.map((link) => link.signalStatus))].sort().join(", ")} signals`;
  }
  return [...records.values()];
}

function clusterKeys(record) {
  const { evidence, datasetId } = record;
  const keys = [];
  // Only version 4 IDs are global; legacy IDs are local to their dataset.
  if (evidence.source_schema_version === "4.0.0") keys.push(`id:${evidence.id}`);
  if (evidence.content_hash) keys.push(`hash:${evidence.content_hash}`);
  for (const text of [evidence.evidence_summary, evidence.evidence_summary_fa]) {
    const normalized = identityText(text);
    if (normalized.length >= MIN_TEXT_KEY_LENGTH) keys.push(`text:${normalized}`);
  }
  if (evidence.locator?.type === "message_id" && evidence.locator.value) {
    keys.push(`message:${identityText(evidence.source_id ?? evidence.source_name ?? datasetId)}:${evidence.locator.value}`);
  }
  return keys;
}

function independenceKeys(records) {
  const keys = [];
  for (const record of records) {
    for (const link of record.links) {
      if (link.independenceGroup) keys.push(`group:${record.datasetId}|${link.independenceGroup}`);
    }
    if (record.evidence.source_url) keys.push(`url:${canonicalUrl(record.evidence.source_url)}`);
  }
  return keys;
}

function relationOf(records, current) {
  const relations = new Set(records.flatMap((record) => record.links
    .filter((link) => !current || link.signalCurrent)
    .map((link) => link.relation ?? "context")));
  if (relations.has("supports") && relations.has("contradicts")) return "mixed";
  for (const relation of ["contradicts", "resolves", "supports"]) if (relations.has(relation)) return relation;
  return "context";
}

function member(record) {
  const { evidence, source } = record;
  return {
    evidenceId: evidence.id,
    datasetId: record.datasetId,
    schemaVersion: evidence.source_schema_version,
    sourceId: evidence.source_id,
    sourceName: evidence.source_name ?? source?.source_name ?? null,
    sourceFamily: source?.source_family ?? null,
    copyRisk: evidence.copy_risk ?? "unknown",
    locator: evidence.locator ?? null,
    date: recordDate(evidence),
    relations: [...new Set(record.links.map((link) => link.relation))].sort(),
    current: record.current
  };
}

function buildClusters(records) {
  const copies = new UnionFind();
  joinByKeys(copies, records.map((record) => [record.key, clusterKeys(record)]));
  const byKey = new Map(records.map((record) => [record.key, record]));
  const clusters = copies.groups(records.map((record) => record.key)).map((keys) => {
    const members = keys.map((key) => byKey.get(key)).sort((a, b) => a.key.localeCompare(b.key));
    return { id: `cl_${digest(members.map((record) => record.key))}`, records: members };
  });

  const independence = new UnionFind();
  joinByKeys(independence, clusters.map((cluster) => [cluster.id, independenceKeys(cluster.records)]));
  const groupIds = new Map();
  for (const ids of independence.groups(clusters.map((cluster) => cluster.id))) {
    const groupId = `ig_${digest([...ids].sort())}`;
    for (const id of ids) groupIds.set(id, groupId);
  }
  for (const cluster of clusters) {
    cluster.independenceGroupId = groupIds.get(cluster.id);
    cluster.current = cluster.records.some((record) => record.current);
  }
  return clusters;
}

function presentCluster(cluster) {
  const members = cluster.records.map(member);
  const families = [...new Set(members.map((item) => item.sourceFamily).filter(Boolean))].sort();
  const origins = new Set(cluster.records.map((record) => `${record.datasetId}|${record.evidence.source_id ?? record.evidence.source_name}`));
  const risks = members.map((item) => COPY_RISK_ORDER.indexOf(item.copyRisk)).filter((index) => index >= 0);
  const representative = cluster.records.find((record) => record.current) ?? cluster.records[0];
  return {
    clusterId: cluster.id,
    independenceGroupId: cluster.independenceGroupId,
    status: cluster.current ? "current" : "historical",
    historicalReason: cluster.current ? null : cluster.records.map((record) => record.historicalReason).filter(Boolean).join("; "),
    relation: relationOf(cluster.records, cluster.current),
    signalIds: [...new Set(cluster.records.flatMap((record) => record.links.map((link) => link.signalId)))].sort(),
    representative: {
      evidenceId: representative.evidence.id,
      datasetId: representative.datasetId,
      summaryEn: representative.evidence.evidence_summary,
      summaryFa: representative.evidence.evidence_summary_fa ?? null
    },
    members,
    sourceFamilies: families,
    copyRisk: risks.length ? COPY_RISK_ORDER[Math.max(...risks)] : "unknown",
    crossPosted: origins.size > 1,
    timeWindow: timeWindow(members.map((item) => item.date))
  };
}

function groupCounts(clusters, links) {
  const counts = { supports: new Set(), contradicts: new Set(), resolves: new Set() };
  for (const { cluster, relation } of links) if (cluster.current && counts[relation]) counts[relation].add(cluster.independenceGroupId);
  return counts;
}

function datasetCoverage(store, entries) {
  const bySet = new Map();
  for (const entry of entries) {
    if (!bySet.has(entry.datasetId)) bySet.set(entry.datasetId, { entry, matched: 0, current: 0 });
    const item = bySet.get(entry.datasetId);
    item.matched++;
    if (CURRENT_STATUSES.has(entry.signal.lifecycle.status)) item.current++;
  }
  return {
    scanned: store.scanned,
    valid: store.datasets.length,
    invalid: store.invalidDatasets.length,
    withdrawn: store.withdrawnDatasets.length,
    matchingDatasets: bySet.size,
    datasets: [...bySet.values()].map(({ entry, matched, current }) => ({
      datasetId: entry.datasetId,
      schemaVersion: entry.canonical.sourceSchemaVersion,
      generatedAt: entry.canonical.generatedAt,
      matchedSignals: matched,
      currentSignals: current,
      sources: entry.canonical.sources.map((source) => ({
        sourceId: source.id,
        sourceName: source.source_name,
        sourceFamily: source.source_family ?? null,
        public: source.public ?? null
      })),
      sourceCoverage: entry.canonical.sourceCoverage
    })).sort((a, b) => a.datasetId.localeCompare(b.datasetId))
  };
}

// entries: the newest copy of every signal matching the search scope, whatever its status.
export function aggregateEvidence(store, entries) {
  const records = collectRecords(entries);
  const clusters = buildClusters(records);
  const clusterOf = new Map(clusters.flatMap((cluster) => cluster.records.map((record) => [record.key, cluster])));
  const allLinks = records.flatMap((record) => record.links.map((link) => ({ record, cluster: clusterOf.get(record.key), ...link })));
  const current = groupCounts(clusters, allLinks.filter((link) => link.signalCurrent));

  const linksBySignal = new Map();
  for (const link of allLinks) {
    const key = `${link.record.datasetId}::${link.signalId}`;
    if (!linksBySignal.has(key)) linksBySignal.set(key, []);
    linksBySignal.get(key).push(link);
  }
  const signalSupport = new Map();
  for (const { datasetId, signal } of entries) {
    const links = linksBySignal.get(`${datasetId}::${signal.id}`) ?? [];
    const counts = groupCounts(clusters, links);
    signalSupport.set(signal.id, {
      supportingGroups: counts.supports.size,
      opposingGroups: counts.contradicts.size,
      resolvingGroups: counts.resolves.size,
      historicalRecords: links.filter((link) => !link.record.current).length
    });
  }

  const currentRecords = records.filter((record) => record.current);
  const presented = clusters
    .map(presentCluster)
    .sort((a, b) => (a.status === b.status ? String(b.timeWindow.latest).localeCompare(String(a.timeWindow.latest)) || a.clusterId.localeCompare(b.clusterId) : a.status === "current" ? -1 : 1));
  return {
    signalSupport,
    aggregation: {
      method: "deterministic-v1",
      note: "Counts describe independent observations in the matching datasets; they are not a probability, and missing coverage means unknown, not absent.",
      datasetCoverage: datasetCoverage(store, entries),
      currentSupport: {
        evidenceRecords: currentRecords.length,
        clusters: clusters.filter((cluster) => cluster.current).length,
        independentSupporting: current.supports.size,
        independentOpposing: current.contradicts.size,
        independentResolving: current.resolves.size,
        timeWindow: timeWindow(currentRecords.map((record) => recordDate(record.evidence)))
      },
      historicalRecords: records.length - currentRecords.length,
      clusters: presented.slice(0, MAX_CLUSTERS),
      truncated: presented.length > MAX_CLUSTERS
    }
  };
}

// Independent reports among evidence records drawn from one or more datasets, using the same copy and
// independence rules as the aggregation above.
export function countIndependentReports(items) {
  const records = new Map();
  for (const { datasetId, evidence } of items) {
    const key = `${datasetId}::${evidence.id}`;
    if (!records.has(key)) {
      records.set(key, { key, datasetId, evidence, source: null, current: true, links: [{ independenceGroup: evidence.independence_group }] });
    }
  }
  return new Set(buildClusters([...records.values()]).map((cluster) => cluster.independenceGroupId)).size;
}
