import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import { duplicateErrors, LEGACY_VALIDATION, localized, privacyErrors, schemaErrorMessages } from "./community-canonical.mjs";
import { inspectDatasetPrivacy } from "./privacy-check.mjs";

export const V2_SCHEMA_VERSION = "2.0";
const SCHEMA = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/output_schema.json", import.meta.url), "utf8"
));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

function semanticErrors(dataset) {
  const errors = [];
  if (dataset.quality_control?.personal_identifiers_removed !== true) {
    errors.push("quality_control.personal_identifiers_removed must be true");
  }
  const signals = Array.isArray(dataset.signals) ? dataset.signals : [];
  errors.push(...duplicateErrors(signals.map((signal) => signal.signal_id), "signal_id"));
  errors.push(...duplicateErrors(signals.flatMap((signal) => (signal.evidence || []).map((item) => item.evidence_id)), "evidence_id"));
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
  return errors;
}

export function validateCommunityDatasetV2(dataset) {
  const privacy = inspectDatasetPrivacy(dataset);
  const errors = [
    ...(validateSchema(dataset) ? [] : schemaErrorMessages(validateSchema.errors)),
    ...semanticErrors(dataset),
    ...privacyErrors(privacy)
  ];
  return { errors: errors.slice(0, 8), privacy };
}

function canonicalEvidence(item) {
  return {
    id: item.evidence_id,
    source_schema_version: V2_SCHEMA_VERSION,
    source_id: null,
    source_name: item.source_name,
    source_url: item.source_url,
    locator: item.source_message_id
      ? { type: "message_id", value: item.source_message_id }
      : item.source_url ? { type: "url", value: item.source_url } : null,
    retrieved_at: null,
    // Version 2 records one evidence date: the date the report was posted.
    published_at: item.date,
    event_date: null,
    content_hash: null,
    source_type: item.source_type,
    authority: "unknown",
    direct_or_second_hand: item.direct_or_second_hand,
    supports_or_contradicts: item.supports_or_contradicts,
    independence_group: item.independence_group,
    copy_risk: "unknown",
    evidence_summary: item.evidence_summary,
    evidence_summary_fa: null,
    supersedes: null,
    privacy_redacted: null,
    validation: LEGACY_VALIDATION
  };
}

function canonicalSignal(signal) {
  return {
    id: signal.signal_id,
    source_schema_version: V2_SCHEMA_VERSION,
    root_cause_id: signal.root_cause_id,
    correlated_signal_ids: signal.correlated_signal_ids,
    relationships: signal.correlated_signal_ids.map((id) => ({ type: "correlates_with", signal_id: id })),
    title: signal.title,
    signal_family: signal.signal_family,
    signal_type: signal.signal_type,
    signal_class: signal.signal_class,
    impact_direction: signal.impact_direction,
    trend: signal.trend,
    severity: signal.severity,
    confidence: signal.confidence,
    confidence_rationale: null,
    evidence_maturity: null,
    destination: signal.destination,
    applicant_scope: signal.applicant_scope,
    migration_routes: signal.migration_routes,
    migration_route_family: signal.migration_route_family,
    process_stages: signal.process_stages,
    entities: signal.entities,
    summary_en: signal.summary_en,
    summary_fa: signal.summary_fa,
    practical_impact: signal.practical_impact,
    who_should_care: signal.who_should_care,
    recommended_action: signal.recommended_action,
    known_workaround: signal.known_workaround,
    localized: {
      title: localized(signal.title),
      summary: localized(signal.summary_en, signal.summary_fa),
      practical_impact: localized(signal.practical_impact),
      who_should_care: localized(signal.who_should_care),
      recommended_action: localized(signal.recommended_action)
    },
    officially_confirmed: signal.officially_confirmed,
    community_confirmed: signal.community_confirmed,
    official_verification: signal.official_verification,
    community_verification: null,
    suggested_fit_adjustment: signal.suggested_fit_adjustment,
    conditional_adjustment: signal.conditional_adjustment,
    reason_for_adjustment: signal.reason_for_adjustment,
    keywords: signal.keywords,
    resolution: signal.resolution,
    needs_recheck: signal.needs_recheck,
    suggested_recheck_date: signal.suggested_recheck_date,
    evidence_ids: signal.evidence.map((item) => item.evidence_id),
    evidence_links: signal.evidence.map((item) => ({
      evidence_id: item.evidence_id,
      relation: item.supports_or_contradicts,
      independence_group: item.independence_group
    })),
    lifecycle: {
      status: signal.status,
      source_status: signal.status,
      first_seen: signal.first_seen,
      last_seen: signal.last_seen,
      last_verified: signal.last_verified,
      superseded_by: null
    },
    validation: LEGACY_VALIDATION
  };
}

export function adaptCommunityDatasetV2(dataset) {
  return {
    sourceSchemaVersion: V2_SCHEMA_VERSION,
    generatedAt: dataset.generated_at,
    sourceCoverage: dataset.source_coverage,
    summary: dataset.summary,
    qualityControl: dataset.quality_control,
    watchlist: dataset.watchlist,
    provenance: null,
    sources: dataset.source_coverage.map((item) => ({
      id: item.source_id,
      source_schema_version: V2_SCHEMA_VERSION,
      source_name: item.source_name,
      source_family: null,
      public: null,
      source_url: item.source_url,
      source_type: item.source_type,
      validation: LEGACY_VALIDATION
    })),
    evidence: dataset.signals.flatMap((signal) => signal.evidence.map(canonicalEvidence)),
    signals: dataset.signals.map(canonicalSignal)
  };
}
