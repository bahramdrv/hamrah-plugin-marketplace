import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const DATASET_ROOT = fileURLToPath(new URL("../data/community-signals/datasets/", import.meta.url));
const SCHEMA = JSON.parse(readFileSync(new URL("../skills/hamrah-signal-builder/references/output_schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateSchema = ajv.compile(SCHEMA);
const MAX_DATASETS = 500;
const MAX_DATASET_BYTES = 2_000_000;

function walkJsonFiles(directory, output = []) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return output; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length >= MAX_DATASETS) break;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJsonFiles(absolutePath, output);
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(absolutePath);
  }
  return output;
}

function q(status, note = null) { return { status, note }; }
function arr(value) { return Array.isArray(value) ? value : []; }
function normalized(value) { return String(value ?? "").trim().toLowerCase(); }
function dateValue(value) { const ts = Date.parse(value || ""); return Number.isNaN(ts) ? 0 : ts; }
function local(en = "", fa = "") { return { en: en || "", fa: fa || "" }; }

function maturity(signal) {
  if (signal.officially_confirmed) return "officially_verified";
  if (signal.community_confirmed || signal.confidence === "high") return "corroborated";
  if (signal.confidence === "medium") return "emerging";
  return "anecdotal";
}

function lifecycle(signal) {
  if (signal.status === "resolved") return "resolved";
  if (signal.status === "historical") return "historical";
  if (signal.status === "uncertain") return "unknown";
  return "active";
}

function legacyQuality(raw) {
  const qc = raw.quality_control || {};
  const check = (name) => q(qc[name] === true ? "pass" : "not_run");
  return { checks: {
    privacy: q(qc.personal_identifiers_removed === true ? "pass" : "fail"),
    full_sources_processed: check("full_sources_processed"),
    reply_chains_considered: check("reply_chains_considered"),
    duplicates_merged: check("duplicates_merged"),
    contradictions_checked: check("contradictions_checked"),
    resolutions_checked: check("resolutions_checked"),
    country_scope_checked: check("country_scope_checked"),
    route_scope_checked: check("route_scope_checked"),
    institution_scope_checked: check("institution_scope_checked"),
    correlated_penalties_checked: check("correlated_penalties_checked")
  }};
}

export function normalizeCommunityDataset(raw, datasetId = "dataset") {
  if (raw?.schema_version === "3.0.0") return raw;
  if (raw?.schema_version !== "2.0") {
    throw new Error(`unsupported community-signal schema ${raw?.schema_version ?? "<missing>"}; only v3 and explicit v2 migration are accepted`);
  }

  const sources = arr(raw.source_coverage).map((source, index) => ({
    source_id: source.source_id || `source-${index + 1}`,
    name: source.source_name || source.source_id || `Source ${index + 1}`,
    source_type: source.source_type || "other",
    source_url: source.source_url ?? null,
    coverage: {
      status: source.coverage_complete === true ? "complete" : source.coverage_complete === false ? "partial" : "unknown",
      from: source.coverage_start || null,
      to: source.coverage_end || null,
      records_available: source.coverage_complete === true ? (source.records_processed ?? null) : null,
      records_processed: Number.isInteger(source.records_processed) ? source.records_processed : null
    }
  }));
  if (!sources.length) sources.push({ source_id: "legacy-source", name: "Legacy v2 source", source_type: "other", source_url: null, coverage: { status: "unknown", from: null, to: null, records_available: null, records_processed: null } });

  const defaultSourceId = sources[0].source_id;
  const evidenceById = new Map();
  const signals = arr(raw.signals).map((signal) => {
    const links = [];
    for (const item of arr(signal.evidence)) {
      const evidenceId = item.evidence_id || `${signal.signal_id}-E${links.length + 1}`;
      if (!evidenceById.has(evidenceId)) {
        evidenceById.set(evidenceId, {
          evidence_id: evidenceId,
          source_id: defaultSourceId,
          locator: { type: item.source_message_id ? (String(item.source_message_id).includes("filecite") ? "citation" : "message_id") : item.source_url ? "url" : "none", value: item.source_message_id ?? item.source_url ?? null },
          published_at: item.date || null,
          event_date: item.date || null,
          collected_at: raw.generated_at || null,
          source_type: item.source_type || "unknown",
          firsthandness: item.direct_or_second_hand === "direct" ? "direct" : item.direct_or_second_hand === "second_hand" ? "second_hand" : "unknown",
          summary: local(item.evidence_summary || "", item.evidence_summary || ""),
          privacy_redacted: raw.quality_control?.personal_identifiers_removed === true
        });
      }
      links.push({ evidence_id: evidenceId, relation: ["supports", "contradicts", "resolves"].includes(item.supports_or_contradicts) ? item.supports_or_contradicts : "context", independence_group: item.independence_group || evidenceId });
    }

    const officialStatus = signal.official_verification?.status || (signal.officially_confirmed ? "confirmed" : "not_verified");
    return {
      signal_id: signal.signal_id,
      issue_cluster_id: signal.root_cause_id || null,
      relationships: arr(signal.correlated_signal_ids).map((signalId) => ({ type: "correlates_with", signal_id: signalId })),
      classification: { family: signal.signal_family || "OTHER", type: signal.signal_type || "other", class: signal.signal_class || "other" },
      scope: {
        destination: {
          country: signal.destination?.country || "",
          country_code: signal.destination?.country_code || "",
          region: signal.destination?.region ?? null,
          city: signal.destination?.city ?? null
        },
        applicants: {
          origin_countries: arr(signal.applicant_scope?.origin_countries),
          nationalities: arr(signal.applicant_scope?.nationalities),
          residence_countries: arr(signal.applicant_scope?.residence_countries),
          applying_from: arr(signal.applicant_scope?.applying_from),
          age_groups: arr(signal.applicant_scope?.age_groups),
          occupations: arr(signal.applicant_scope?.occupations),
          fields: arr(signal.applicant_scope?.fields),
          education_levels: arr(signal.applicant_scope?.education_levels),
          regulated_professions: arr(signal.applicant_scope?.regulated_professions),
          other_conditions: arr(signal.applicant_scope?.other_conditions)
        },
        routes: { families: arr(signal.migration_route_family), codes: arr(signal.migration_routes).filter((route) => route !== "other") },
        process_stages: arr(signal.process_stages),
        entities: arr(signal.entities)
      },
      claim: {
        title: local(signal.title || signal.summary_en || signal.signal_id, signal.title || signal.summary_fa || ""),
        summary: local(signal.summary_en || "", signal.summary_fa || ""),
        practical_impact: local(signal.practical_impact || "", signal.practical_impact || ""),
        who_should_care: local(signal.who_should_care || "", signal.who_should_care || ""),
        recommended_action: local(signal.recommended_action || "", signal.recommended_action || ""),
        known_workaround: signal.known_workaround ?? null
      },
      evidence_links: links,
      assessment: {
        lifecycle: lifecycle(signal),
        evidence_maturity: maturity(signal),
        trend: signal.trend || "unknown",
        severity: signal.severity || "moderate",
        confidence: { level: signal.confidence || "low", rationale: signal.reason_for_adjustment || "Migrated from the validated v2 assessment without adding new claims." },
        impact_direction: signal.impact_direction || "neutral",
        assessed_at: signal.last_verified || raw.generated_at,
        method: { name: "hamrah-signal-builder", version: "3.0" }
      },
      verification: {
        official: { status: officialStatus, evidence_ids: [], checked_at: signal.official_verification?.verified_at ?? null, note: signal.official_verification?.note ?? null },
        community: { status: signal.community_confirmed ? "corroborated" : "unverified", evidence_ids: links.map((link) => link.evidence_id), checked_at: signal.last_verified || null, note: null }
      },
      review: {
        status: signal.status === "resolved" ? "resolved" : signal.needs_recheck || ["monitoring", "uncertain"].includes(signal.status) ? "recheck_required" : "no_recheck",
        last_checked_at: signal.last_verified || null,
        next_check_at: signal.suggested_recheck_date || null,
        reason: signal.reason_for_adjustment || "Migrated from v2 review state.",
        confirmation_criteria: []
      },
      keywords: arr(signal.keywords)
    };
  });

  return {
    schema_version: "3.0.0",
    taxonomy_version: "2026.09",
    dataset: {
      dataset_id: datasetId,
      generated_at: raw.generated_at,
      generator: { name: "hamrah-v2-compat-migrator", version: "1.0" }
    },
    sources,
    evidence: [...evidenceById.values()],
    signals,
    quality: legacyQuality(raw),
    extensions: { migrated_from_schema: "2.0" }
  };
}

function compactSchemaErrors(errors = []) {
  return errors.slice(0, 12).map((error) => `${error.instancePath || "<root>"}: ${error.message}`);
}

function semanticErrors(dataset) {
  const errors = [];
  if (dataset.quality?.checks?.privacy?.status !== "pass") errors.push("quality.checks.privacy.status must be pass");
  const sourceIds = new Set();
  for (const source of dataset.sources || []) {
    if (sourceIds.has(source.source_id)) errors.push(`duplicate source_id ${source.source_id}`);
    sourceIds.add(source.source_id);
  }
  const evidenceIds = new Set();
  for (const evidence of dataset.evidence || []) {
    if (evidenceIds.has(evidence.evidence_id)) errors.push(`duplicate evidence_id ${evidence.evidence_id}`);
    evidenceIds.add(evidence.evidence_id);
    if (!sourceIds.has(evidence.source_id)) errors.push(`${evidence.evidence_id}: unknown source_id ${evidence.source_id}`);
  }
  const signalIds = new Set();
  for (const signal of dataset.signals || []) {
    if (signalIds.has(signal.signal_id)) errors.push(`duplicate signal_id ${signal.signal_id}`);
    signalIds.add(signal.signal_id);
    if (Object.hasOwn(signal, "suggested_fit_adjustment") || Object.hasOwn(signal, "conditional_adjustment")) errors.push(`${signal.signal_id}: scoring adjustments are forbidden in v3 canonical signals`);
    for (const link of signal.evidence_links || []) if (!evidenceIds.has(link.evidence_id)) errors.push(`${signal.signal_id}: unknown evidence_id ${link.evidence_id}`);
  }
  return errors.slice(0, 12);
}

function datasetIdFor(filePath, root) { return path.relative(root, filePath).split(path.sep).join("/").replace(/\.json$/i, ""); }

export function loadCommunitySignalStore(root = DATASET_ROOT) {
  const datasets = [];
  const invalidDatasets = [];
  const files = walkJsonFiles(root);
  for (const filePath of files) {
    const datasetId = datasetIdFor(filePath, root);
    try {
      if (statSync(filePath).size > MAX_DATASET_BYTES) throw new Error(`file exceeds ${MAX_DATASET_BYTES} bytes`);
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const dataset = normalizeCommunityDataset(raw, datasetId);
      const schemaValid = validateSchema(dataset);
      const errors = [...(schemaValid ? [] : compactSchemaErrors(validateSchema.errors)), ...semanticErrors(dataset)];
      if (errors.length) throw new Error(errors.join("; "));
      datasets.push({ datasetId, dataset });
    } catch (error) {
      invalidDatasets.push({ datasetId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { root, scanned: files.length, datasets, invalidDatasets, truncated: files.length >= MAX_DATASETS };
}

function arrayIncludes(values, wanted) { return !wanted || (Array.isArray(values) && values.some((value) => normalized(value) === wanted)); }
function legacyStatus(signal) {
  if (signal.assessment.lifecycle === "resolved") return "resolved";
  if (signal.assessment.lifecycle === "historical") return "historical";
  if (signal.assessment.lifecycle === "unknown") return "uncertain";
  if (["recheck_required", "monitor"].includes(signal.review.status)) return "monitoring";
  return "active";
}
function statusMatches(signal, statuses) {
  const selected = Array.isArray(statuses) && statuses.length ? statuses : ["active", "monitoring", "uncertain"];
  return selected.includes(legacyStatus(signal)) || selected.includes(signal.assessment.lifecycle);
}
function searchableText(signal) {
  return [signal.claim.title.en, signal.claim.title.fa, signal.classification.family, signal.classification.type, signal.classification.class, signal.claim.summary.en, signal.claim.summary.fa, signal.claim.practical_impact.en, signal.claim.practical_impact.fa, ...(signal.keywords || [])].join(" ").toLowerCase();
}
function matchesSignal(signal, args) {
  const countryCode = normalized(args.countryCode), country = normalized(args.country), route = normalized(args.route), topic = normalized(args.topic), stage = normalized(args.processStage), origin = normalized(args.originCountry), nationality = normalized(args.nationality), entity = normalized(args.entity);
  if (countryCode && normalized(signal.scope.destination.country_code) !== countryCode) return false;
  if (country && !normalized(signal.scope.destination.country).includes(country)) return false;
  if (route && !arrayIncludes(signal.scope.routes.codes, route) && !arrayIncludes(signal.scope.routes.families, route)) return false;
  if (stage && !arrayIncludes(signal.scope.process_stages, stage)) return false;
  if (origin && ![...signal.scope.applicants.origin_countries, ...signal.scope.applicants.residence_countries, ...signal.scope.applicants.applying_from].some((value) => normalized(value) === origin)) return false;
  if (nationality && !arrayIncludes(signal.scope.applicants.nationalities, nationality)) return false;
  if (entity && !signal.scope.entities.some((item) => normalized(item.name).includes(entity))) return false;
  if (!statusMatches(signal, args.statuses)) return false;
  return !topic || searchableText(signal).includes(topic);
}
function evidenceStats(dataset, signal) {
  const map = new Map(dataset.evidence.map((item) => [item.evidence_id, item]));
  const listed = signal.evidence_links.map((link) => map.get(link.evidence_id)).filter(Boolean);
  const dates = listed.map((item) => item.event_date || item.published_at).filter(Boolean).sort();
  return { evidenceCount: listed.length, independentReportCount: new Set(signal.evidence_links.map((link) => link.independence_group)).size, firstSeen: dates[0] || null, lastSeen: dates.at(-1) || null };
}
function publicSignal(datasetId, dataset, signal) {
  const stats = evidenceStats(dataset, signal);
  return {
    datasetId, datasetGeneratedAt: dataset.dataset.generated_at, signalId: signal.signal_id, issueClusterId: signal.issue_cluster_id,
    title: signal.claim.title, classification: signal.classification, status: legacyStatus(signal), assessment: signal.assessment,
    destination: signal.scope.destination, applicantScope: signal.scope.applicants, migrationRoutes: signal.scope.routes.codes,
    migrationRouteFamily: signal.scope.routes.families, processStages: signal.scope.process_stages, entities: signal.scope.entities,
    summaryEn: signal.claim.summary.en, summaryFa: signal.claim.summary.fa, practicalImpact: signal.claim.practical_impact,
    whoShouldCare: signal.claim.who_should_care, recommendedAction: signal.claim.recommended_action, knownWorkaround: signal.claim.known_workaround,
    verification: signal.verification, review: signal.review, relationships: signal.relationships, ...stats
  };
}

export function searchCommunitySignals(args = {}, root = DATASET_ROOT) {
  const store = loadCommunitySignalStore(root);
  const newestBySignalId = new Map();
  for (const { datasetId, dataset } of store.datasets) for (const signal of dataset.signals) {
    if (!matchesSignal(signal, args)) continue;
    const existing = newestBySignalId.get(signal.signal_id);
    if (!existing || dateValue(dataset.dataset.generated_at) > dateValue(existing.dataset.dataset.generated_at)) newestBySignalId.set(signal.signal_id, { datasetId, dataset, signal });
  }
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const matches = [...newestBySignalId.values()].sort((a, b) => dateValue(b.signal.assessment.assessed_at) - dateValue(a.signal.assessment.assessed_at)).slice(0, limit).map(({ datasetId, dataset, signal }) => publicSignal(datasetId, dataset, signal));
  return { source: "Hamrah Community Signal Store v3", generatedAt: new Date().toISOString(), coverage: { filesScanned: store.scanned, validDatasets: store.datasets.length, invalidDatasets: store.invalidDatasets, truncated: store.truncated }, filters: args, resultCount: matches.length, signals: matches, usageNote: "Community signals provide evidence and assessment only. Applicant-specific fit scoring belongs to the Advisor scoring policy." };
}

export function getCommunitySignalDataset(args = {}, root = DATASET_ROOT) {
  if (typeof args.datasetId !== "string" || !args.datasetId.trim()) throw new Error("getCommunitySignalDataset requires a non-empty datasetId from searchCommunitySignals.");
  const store = loadCommunitySignalStore(root);
  const found = store.datasets.find(({ datasetId }) => datasetId === args.datasetId.trim());
  if (!found) throw new Error(`Community signal dataset not found: ${args.datasetId}`);
  const requested = Array.isArray(args.signalIds) && args.signalIds.length ? new Set(args.signalIds.map(String)) : null;
  const signals = requested ? found.dataset.signals.filter((signal) => requested.has(signal.signal_id)) : found.dataset.signals;
  const evidenceIds = new Set(signals.flatMap((signal) => signal.evidence_links.map((link) => link.evidence_id)));
  const evidence = found.dataset.evidence.filter((item) => evidenceIds.has(item.evidence_id));
  return {
    source: "Hamrah Community Signal Store v3", datasetId: found.datasetId, schemaVersion: found.dataset.schema_version,
    taxonomyVersion: found.dataset.taxonomy_version, dataset: found.dataset.dataset, sources: found.dataset.sources, evidence, signals,
    quality: found.dataset.quality, qualityControl: { personal_identifiers_removed: found.dataset.quality.checks.privacy.status === "pass" },
    missingSignalIds: requested ? [...requested].filter((signalId) => !signals.some((signal) => signal.signal_id === signalId)) : [],
    usageNote: "Canonical community signals do not store applicant-specific fit adjustments."
  };
}

export { DATASET_ROOT };
