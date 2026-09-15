import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const DATASET_ROOT = fileURLToPath(
  new URL("../data/community-signals/datasets/", import.meta.url)
);
const SCHEMA = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-signal-builder/references/output_schema.json", import.meta.url),
    "utf8"
  )
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(SCHEMA);
const ALLOWED_CURRENT_STATUSES = new Set(["active", "monitoring", "uncertain"]);
const MAX_DATASETS = 500;
const MAX_DATASET_BYTES = 2_000_000;

function walkJsonFiles(directory, output = []) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length >= MAX_DATASETS) break;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJsonFiles(absolutePath, output);
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(absolutePath);
  }
  return output;
}

function compactSchemaErrors(errors = []) {
  return errors.slice(0, 8).map((error) => {
    const location = error.instancePath || "<root>";
    return `${location}: ${error.message}`;
  });
}

function semanticErrors(dataset) {
  const errors = [];
  if (dataset.quality_control?.personal_identifiers_removed !== true) {
    errors.push("quality_control.personal_identifiers_removed must be true");
  }
  const signals = Array.isArray(dataset.signals) ? dataset.signals : [];
  const ids = signals.map((signal) => signal.signal_id);
  const duplicates = [...new Set(ids.filter((id, index) => id && ids.indexOf(id) !== index))];
  if (duplicates.length) errors.push(`duplicate signal_id values: ${duplicates.join(", ")}`);
  if (dataset.summary?.total_signals !== signals.length) {
    errors.push("summary.total_signals does not match signals.length");
  }
  for (const signal of signals) {
    if (["resolved", "historical"].includes(signal.status) && signal.suggested_fit_adjustment !== 0) {
      errors.push(`${signal.signal_id}: resolved/historical adjustment must be 0`);
    }
    if (signal.impact_direction === "positive_resolution" && signal.suggested_fit_adjustment !== 0) {
      errors.push(`${signal.signal_id}: positive resolution adjustment must be 0`);
    }
  }
  return errors.slice(0, 8);
}

function datasetIdFor(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join("/").replace(/\.json$/i, "");
}

export function loadCommunitySignalStore(root = DATASET_ROOT) {
  const datasets = [];
  const invalidDatasets = [];
  const files = walkJsonFiles(root);
  for (const filePath of files) {
    const datasetId = datasetIdFor(filePath, root);
    try {
      if (statSync(filePath).size > MAX_DATASET_BYTES) {
        throw new Error(`file exceeds ${MAX_DATASET_BYTES} bytes`);
      }
      const dataset = JSON.parse(readFileSync(filePath, "utf8"));
      const schemaValid = validateSchema(dataset);
      const errors = [
        ...(schemaValid ? [] : compactSchemaErrors(validateSchema.errors)),
        ...semanticErrors(dataset)
      ];
      if (errors.length) throw new Error(errors.join("; "));
      datasets.push({ datasetId, dataset });
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
    truncated: files.length >= MAX_DATASETS
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
  if (!statuses.has(signal.status)) return false;
  if (topic && !searchableText(signal).includes(topic)) return false;
  return true;
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function publicSignal(datasetId, dataset, signal) {
  return {
    datasetId,
    datasetGeneratedAt: dataset.generated_at,
    signalId: signal.signal_id,
    rootCauseId: signal.root_cause_id,
    title: signal.title,
    status: signal.status,
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
    lastSeen: signal.last_seen,
    lastVerified: signal.last_verified,
    officiallyConfirmed: signal.officially_confirmed,
    communityConfirmed: signal.community_confirmed,
    suggestedFitAdjustment: signal.suggested_fit_adjustment,
    conditionalAdjustment: signal.conditional_adjustment,
    reasonForAdjustment: signal.reason_for_adjustment,
    correlatedSignalIds: signal.correlated_signal_ids,
    needsRecheck: signal.needs_recheck,
    suggestedRecheckDate: signal.suggested_recheck_date
  };
}

export function searchCommunitySignals(args = {}, root = DATASET_ROOT) {
  const store = loadCommunitySignalStore(root);
  const newestBySignalId = new Map();
  for (const { datasetId, dataset } of store.datasets) {
    for (const signal of dataset.signals) {
      if (!matchesSignal(signal, args)) continue;
      const existing = newestBySignalId.get(signal.signal_id);
      if (!existing || dateValue(dataset.generated_at) > dateValue(existing.dataset.generated_at)) {
        newestBySignalId.set(signal.signal_id, { datasetId, dataset, signal });
      }
    }
  }
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const matches = [...newestBySignalId.values()]
    .sort((a, b) => dateValue(b.signal.last_verified) - dateValue(a.signal.last_verified))
    .slice(0, limit)
    .map(({ datasetId, dataset, signal }) => publicSignal(datasetId, dataset, signal));
  return {
    source: "Hamrah Community Signal Store",
    generatedAt: new Date().toISOString(),
    coverage: {
      filesScanned: store.scanned,
      validDatasets: store.datasets.length,
      invalidDatasets: store.invalidDatasets,
      truncated: store.truncated
    },
    filters: args,
    resultCount: matches.length,
    signals: matches,
    usageNote: "Community evidence is practical context only. Recheck applicant, route, stage, entity, location, timing, and conditions before applying an adjustment."
  };
}

export function getCommunitySignalDataset(args = {}, root = DATASET_ROOT) {
  if (typeof args.datasetId !== "string" || !args.datasetId.trim()) {
    throw new Error("getCommunitySignalDataset requires a non-empty datasetId from searchCommunitySignals.");
  }
  const store = loadCommunitySignalStore(root);
  const found = store.datasets.find(({ datasetId }) => datasetId === args.datasetId.trim());
  if (!found) throw new Error(`Community signal dataset not found: ${args.datasetId}`);
  const requested = Array.isArray(args.signalIds) && args.signalIds.length
    ? new Set(args.signalIds.map(String))
    : null;
  const signals = requested
    ? found.dataset.signals.filter((signal) => requested.has(signal.signal_id))
    : found.dataset.signals;
  return {
    source: "Hamrah Community Signal Store",
    datasetId: found.datasetId,
    schemaVersion: found.dataset.schema_version,
    generatedAt: found.dataset.generated_at,
    sourceCoverage: found.dataset.source_coverage,
    summary: found.dataset.summary,
    qualityControl: found.dataset.quality_control,
    signals,
    watchlist: found.dataset.watchlist,
    missingSignalIds: requested
      ? [...requested].filter((signalId) => !signals.some((signal) => signal.signal_id === signalId))
      : [],
    usageNote: "Official eligibility remains separate. Resolved and historical signals have zero current fit adjustment."
  };
}

export { DATASET_ROOT };
