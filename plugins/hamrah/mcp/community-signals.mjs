import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BudgetExceededError, REQUEST_BUDGETS } from "./budgets.mjs";
import { readCommunityDataset } from "./community-datasets.mjs";
import { ledgerPathFor, readWithdrawalLedger, withdrawnSets } from "./withdrawals.mjs";

const DATASET_ROOT = fileURLToPath(
  new URL("../data/community-signals/datasets/", import.meta.url)
);
const ALLOWED_CURRENT_STATUSES = new Set(["active", "monitoring", "uncertain"]);
const MAX_DATASET_BYTES = 2_000_000;

function walkJsonFiles(directory, maxFiles, output = []) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length > maxFiles) break;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJsonFiles(absolutePath, maxFiles, output);
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(absolutePath);
  }
  return output;
}

function datasetIdFor(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join("/").replace(/\.json$/i, "");
}

function withoutWithdrawn(canonical, withdrawn) {
  const evidence = canonical.evidence.filter((item) => !withdrawn.has(item.id));
  const signals = canonical.signals
    .filter((signal) => !withdrawn.has(signal.id))
    .map((signal) => ({
      ...signal,
      evidence_ids: signal.evidence_ids.filter((id) => !withdrawn.has(id)),
      evidence_links: signal.evidence_links.filter((link) => !withdrawn.has(link.evidence_id))
    }))
    // A signal left without any evidence after a withdrawal is no longer supported.
    .filter((signal) => signal.evidence_ids.length > 0);
  return { ...canonical, evidence, signals, sources: canonical.sources.filter((source) => !withdrawn.has(source.id)) };
}

// Version 2 signals embed their evidence, so withdrawn evidence must also leave the original-form signal.
function withoutEmbeddedWithdrawn(signal, withdrawnIds) {
  if (!withdrawnIds.length || !Array.isArray(signal.evidence)) return signal;
  return { ...signal, evidence: signal.evidence.filter((item) => !withdrawnIds.includes(item.evidence_id)) };
}

export function loadCommunitySignalStore(root = DATASET_ROOT, maxDatasets = REQUEST_BUDGETS.maxDatasetsScanned) {
  const datasets = [];
  const invalidDatasets = [];
  const withdrawnDatasets = [];
  const withdrawn = withdrawnSets(readWithdrawalLedger(ledgerPathFor(root)));
  const files = walkJsonFiles(root, maxDatasets);
  if (files.length > maxDatasets) {
    throw new BudgetExceededError(
      "dataset_scan_limit_exceeded",
      `The community signal store holds more than ${maxDatasets} dataset files, the per-call scan limit.`,
      { limit: maxDatasets }
    );
  }
  for (const filePath of files) {
    const datasetId = datasetIdFor(filePath, root);
    if (withdrawn.datasets.has(datasetId)) {
      withdrawnDatasets.push(datasetId);
      continue;
    }
    try {
      if (statSync(filePath).size > MAX_DATASET_BYTES) {
        throw new Error(`file exceeds ${MAX_DATASET_BYTES} bytes`);
      }
      const dataset = JSON.parse(readFileSync(filePath, "utf8"));
      const { schemaVersion, errors, privacy, canonical } = readCommunityDataset(dataset);
      if (errors.length) {
        invalidDatasets.push({ datasetId, schemaVersion, error: errors.join("; "), ...(privacy ? { privacy } : {}) });
        continue;
      }
      const withdrawnArtifactIds = [...canonical.signals, ...canonical.evidence, ...canonical.sources]
        .map((artifact) => artifact.id)
        .filter((id) => withdrawn.artifacts.has(id));
      datasets.push({
        datasetId,
        dataset,
        privacy,
        canonical: withdrawnArtifactIds.length ? withoutWithdrawn(canonical, withdrawn.artifacts) : canonical,
        withdrawnArtifactIds
      });
    } catch (error) {
      invalidDatasets.push({
        datasetId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    root,
    scanned: files.length,
    datasets,
    invalidDatasets,
    withdrawnDatasets,
    truncated: false
  };
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function arrayIncludes(values, wanted) {
  if (!wanted) return true;
  return Array.isArray(values) && values.some((value) => normalized(value) === wanted);
}

function searchableText(signal) {
  return [
    signal.title,
    signal.signal_family,
    signal.signal_type,
    signal.signal_class,
    signal.summary_en,
    signal.summary_fa,
    signal.practical_impact,
    signal.who_should_care,
    signal.recommended_action,
    ...(signal.keywords || [])
  ].join(" ").toLowerCase();
}

function matchesSignal(signal, args) {
  const countryCode = normalized(args.countryCode);
  const country = normalized(args.country);
  const route = normalized(args.route);
  const topic = normalized(args.topic);
  const processStage = normalized(args.processStage);
  const originCountry = normalized(args.originCountry);
  const nationality = normalized(args.nationality);
  const entity = normalized(args.entity);
  const statuses = Array.isArray(args.statuses) && args.statuses.length
    ? new Set(args.statuses)
    : ALLOWED_CURRENT_STATUSES;

  if (countryCode && normalized(signal.destination?.country_code) !== countryCode) return false;
  if (country && !normalized(signal.destination?.country).includes(country)) return false;
  if (route && !arrayIncludes(signal.migration_routes, route) && !arrayIncludes(signal.migration_route_family, route)) return false;
  if (processStage && !arrayIncludes(signal.process_stages, processStage)) return false;
  if (originCountry && ![
    ...(signal.applicant_scope?.origin_countries || []),
    ...(signal.applicant_scope?.residence_countries || []),
    ...(signal.applicant_scope?.applying_from || [])
  ].some((value) => normalized(value) === originCountry)) return false;
  if (nationality && !arrayIncludes(signal.applicant_scope?.nationalities, nationality)) return false;
  if (entity && !(signal.entities || []).some((item) => normalized(item.name).includes(entity))) return false;
  if (!statuses.has(signal.lifecycle.status)) return false;
  if (topic && !searchableText(signal).includes(topic)) return false;
  return true;
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function publicSignal(datasetId, canonical, signal) {
  return {
    datasetId,
    datasetGeneratedAt: canonical.generatedAt,
    schemaVersion: signal.source_schema_version,
    privacyStatus: "pass",
    signalId: signal.id,
    rootCauseId: signal.root_cause_id,
    title: signal.title,
    status: signal.lifecycle.status,
    trend: signal.trend,
    severity: signal.severity,
    confidence: signal.confidence,
    destination: signal.destination,
    applicantScope: signal.applicant_scope,
    migrationRoutes: signal.migration_routes,
    migrationRouteFamily: signal.migration_route_family,
    processStages: signal.process_stages,
    entities: signal.entities,
    summaryEn: signal.summary_en,
    summaryFa: signal.summary_fa,
    practicalImpact: signal.practical_impact,
    whoShouldCare: signal.who_should_care,
    recommendedAction: signal.recommended_action,
    knownWorkaround: signal.known_workaround,
    lastSeen: signal.lifecycle.last_seen,
    lastVerified: signal.lifecycle.last_verified,
    officiallyConfirmed: signal.officially_confirmed,
    communityConfirmed: signal.community_confirmed,
    suggestedFitAdjustment: signal.suggested_fit_adjustment,
    conditionalAdjustment: signal.conditional_adjustment,
    reasonForAdjustment: signal.reason_for_adjustment,
    correlatedSignalIds: signal.correlated_signal_ids,
    needsRecheck: signal.needs_recheck,
    suggestedRecheckDate: signal.suggested_recheck_date,
    lifecycle: signal.lifecycle,
    validationStatus: signal.validation.status,
    evidenceIds: signal.evidence_ids
  };
}

export function searchCommunitySignals(args = {}, root = DATASET_ROOT, maxDatasets) {
  const store = loadCommunitySignalStore(root, maxDatasets);
  const newestBySignalId = new Map();
  // The newest copy of each signal decides, so a later superseded or resolved snapshot hides an older current one.
  for (const { datasetId, canonical } of store.datasets) {
    for (const signal of canonical.signals) {
      const existing = newestBySignalId.get(signal.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) {
        newestBySignalId.set(signal.id, { datasetId, canonical, signal });
      }
    }
  }
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const matches = [...newestBySignalId.values()]
    .filter(({ signal }) => matchesSignal(signal, args))
    .sort((a, b) => dateValue(b.signal.lifecycle.last_verified) - dateValue(a.signal.lifecycle.last_verified))
    .slice(0, limit)
    .map(({ datasetId, canonical, signal }) => publicSignal(datasetId, canonical, signal));
  return {
    source: "Hamrah Community Signal Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      withdrawnDatasets: store.withdrawnDatasets,
      truncated: store.truncated
    },
    filters: args,
    resultCount: matches.length,
    signals: matches,
    usageNote: "Community evidence is practical context only. Recheck applicant, route, stage, entity, location, timing, and conditions before applying an adjustment."
  };
}

export function getCommunitySignalDataset(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.datasetId !== "string" || !args.datasetId.trim()) {
    throw new Error("getCommunitySignalDataset requires a non-empty datasetId from searchCommunitySignals.");
  }
  const store = loadCommunitySignalStore(root, maxDatasets);
  const found = store.datasets.find(({ datasetId }) => datasetId === args.datasetId.trim());
  if (!found) throw new Error(`Community signal dataset not found: ${args.datasetId}`);
  const requested = Array.isArray(args.signalIds) && args.signalIds.length
    ? new Set(args.signalIds.map(String))
    : null;
  const { canonical, dataset } = found;
  const originalIdOf = (signal) => signal.id ?? signal.signal_id;
  const originals = new Map(dataset.signals.map((signal) => [originalIdOf(signal), signal]));
  const selected = canonical.signals
    .map((signal) => ({ signal, original: originals.get(signal.id) }))
    .filter(({ signal }) => !requested || requested.has(signal.id));
  const canonicalSignals = selected.map(({ signal }) => signal);
  const evidenceIds = new Set(canonicalSignals.flatMap((signal) => signal.evidence_ids));
  const evidence = canonical.evidence.filter((item) => requested ? evidenceIds.has(item.id) : true);
  const sourceIds = new Set(evidence.map((item) => item.source_id));
  return {
    source: "Hamrah Community Signal Store",
    datasetId: found.datasetId,
    schemaVersion: canonical.sourceSchemaVersion,
    generatedAt: canonical.generatedAt,
    sourceCoverage: canonical.sourceCoverage,
    summary: canonical.summary,
    qualityControl: canonical.qualityControl,
    privacy: found.privacy,
    provenance: canonical.provenance,
    signals: selected.map(({ original }) => withoutEmbeddedWithdrawn(original, found.withdrawnArtifactIds)),
    canonicalSignals,
    evidence,
    sources: canonical.sources.filter((source) => requested ? sourceIds.has(source.id) : true),
    watchlist: canonical.watchlist,
    withdrawnArtifactIds: found.withdrawnArtifactIds,
    missingSignalIds: requested
      ? [...requested].filter((signalId) => !canonicalSignals.some((signal) => signal.id === signalId))
      : [],
    usageNote: "Official eligibility remains separate. Resolved and historical signals have zero current fit adjustment. signals keep the dataset's original schema; canonicalSignals, evidence, and sources use the version 4 field names, with null or \"unknown\" where the original schema cannot express a value."
  };
}

export { DATASET_ROOT };
