import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import { duplicateErrors, LEGACY_VALIDATION, localized, privacyErrors, schemaErrorMessages } from "./community-canonical.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { inspectDatasetPrivacy } from "./privacy-check.mjs";

export const V3_SCHEMA_VERSION = "3.0.0";
// The installed 3.0.0 contract, copied unchanged. Files that deviate from it are reported, not reinterpreted.
const SCHEMA = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/community_signals_v3_schema.json", import.meta.url), "utf8"
));
const validateSchema = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(SCHEMA);
// Legacy exports normalized at ingest record what their source never stated as unknown instead of inventing
// a value. Only those fields widen; every other 3.0.0 rule, and privacy inspection, still applies.
const NORMALIZED_LEGACY_SCHEMA = structuredClone(SCHEMA);
NORMALIZED_LEGACY_SCHEMA.$defs.qualityCheck.properties.status.enum.push("unknown");
NORMALIZED_LEGACY_SCHEMA.$defs.evidence.properties.privacy_redacted.type = ["boolean", "null"];
NORMALIZED_LEGACY_SCHEMA.$defs.assessment.properties.evidence_maturity.enum.push(null);
const validateNormalizedLegacySchema = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })
  .compile(NORMALIZED_LEGACY_SCHEMA);
// Version 3 "unknown" lifecycle means the status was not determined, which version 2 and search call "uncertain".
const LIFECYCLE_STATUS = { active: "active", resolved: "resolved", historical: "historical", unknown: "uncertain" };
const COVERAGE_COMPLETE = { complete: true, partial: false, unknown: null };
const CONFIRMED = { confirmed: true, corroborated: true, not_verified: false, unverified: false, contradicted: false };
const NEEDS_RECHECK = { recheck_required: true, no_recheck: false, resolved: false };

function referenceErrors(dataset) {
  const errors = [
    ...duplicateErrors(dataset.sources.map((item) => item.source_id), "source_id"),
    ...duplicateErrors(dataset.evidence.map((item) => item.evidence_id), "evidence_id"),
    ...duplicateErrors(dataset.signals.map((item) => item.signal_id), "signal_id")
  ];
  const sourceIds = new Set(dataset.sources.map((item) => item.source_id));
  const evidenceIds = new Set(dataset.evidence.map((item) => item.evidence_id));
  dataset.evidence.forEach((item, index) => {
    if (!sourceIds.has(item.source_id)) errors.push(`evidence[${index}].source_id references unknown source ${item.source_id}`);
  });
  dataset.signals.forEach((signal, index) => {
    const references = [
      ...signal.evidence_links.map((link) => ["evidence_links", link.evidence_id]),
      ...signal.verification.official.evidence_ids.map((id) => ["verification.official.evidence_ids", id]),
      ...signal.verification.community.evidence_ids.map((id) => ["verification.community.evidence_ids", id])
    ];
    for (const [field, id] of references) {
      if (!evidenceIds.has(id)) errors.push(`signals[${index}].${field} references unknown evidence ${id}`);
    }
  });
  return errors;
}

function validate(dataset, options, schemaValidator, acceptedDeclarations, requirement) {
  if (!schemaValidator(dataset)) return { errors: schemaErrorMessages(schemaValidator.errors, 12), privacy: null };
  const privacy = inspectDatasetPrivacy(dataset, options);
  const errors = [...referenceErrors(dataset)];
  if (!parseIsoDay(dataset.dataset.generated_at, false, true)) errors.push("dataset.generated_at is not a valid ISO date-time");
  const declared = dataset.quality.checks.privacy.status;
  if (!acceptedDeclarations.includes(declared)) errors.push(`quality.checks.privacy is ${declared}; ${requirement}`);
  errors.push(...privacyErrors(privacy));
  return { errors: errors.slice(0, 12), privacy };
}

export function validateCommunityDatasetV3(dataset, options = {}) {
  return validate(dataset, options, validateSchema, ["pass"], "version 3 datasets need a declared and inspected privacy pass");
}

// A normalized legacy export may lack a privacy declaration; the inspected result alone then decides.
// A declared result other than pass still rejects the dataset.
export function validateNormalizedLegacyDatasetV3(dataset, options = {}) {
  return validate(dataset, options, validateNormalizedLegacySchema, ["pass", "unknown"],
    "legacy datasets need a declared pass or no declaration, and an inspected privacy pass");
}

function canonicalEvidence(item, sourcesById) {
  const url = item.locator.type === "url" ? item.locator.value : null;
  return {
    id: item.evidence_id,
    source_schema_version: V3_SCHEMA_VERSION,
    source_id: item.source_id,
    source_name: sourcesById.get(item.source_id).name,
    source_url: url,
    locator: item.locator.type === "none" ? null : item.locator,
    retrieved_at: item.collected_at,
    published_at: item.published_at,
    event_date: item.event_date,
    content_hash: null,
    source_type: item.source_type,
    authority: "unknown",
    direct_or_second_hand: item.firsthandness,
    // Version 3 records stance and independence per signal link, not per evidence record.
    supports_or_contradicts: null,
    independence_group: null,
    copy_risk: "unknown",
    evidence_summary: item.summary.en,
    evidence_summary_fa: item.summary.fa || null,
    supersedes: null,
    privacy_redacted: item.privacy_redacted,
    validation: LEGACY_VALIDATION
  };
}

function verificationState(state) {
  return { status: state.status, evidence_ids: state.evidence_ids, checked_at: state.checked_at, note: state.note };
}

function canonicalSignal(signal) {
  const { claim, scope, assessment, verification, review } = signal;
  return {
    id: signal.signal_id,
    source_schema_version: V3_SCHEMA_VERSION,
    root_cause_id: signal.issue_cluster_id,
    correlated_signal_ids: signal.relationships
      .filter((item) => item.type === "correlates_with" || item.type === "same_issue_cluster")
      .map((item) => item.signal_id),
    relationships: signal.relationships,
    title: claim.title.en,
    signal_family: signal.classification.family,
    signal_type: signal.classification.type,
    signal_class: signal.classification.class,
    impact_direction: assessment.impact_direction,
    trend: assessment.trend,
    severity: assessment.severity,
    confidence: assessment.confidence.level,
    confidence_rationale: assessment.confidence.rationale,
    evidence_maturity: assessment.evidence_maturity,
    destination: scope.destination,
    applicant_scope: scope.applicants,
    migration_routes: scope.routes.codes,
    migration_route_family: scope.routes.families,
    process_stages: scope.process_stages,
    entities: scope.entities,
    summary_en: claim.summary.en,
    summary_fa: claim.summary.fa,
    practical_impact: claim.practical_impact.en,
    who_should_care: claim.who_should_care.en,
    recommended_action: claim.recommended_action.en,
    known_workaround: claim.known_workaround,
    localized: {
      title: localized(claim.title.en, claim.title.fa),
      summary: localized(claim.summary.en, claim.summary.fa),
      practical_impact: localized(claim.practical_impact.en, claim.practical_impact.fa),
      who_should_care: localized(claim.who_should_care.en, claim.who_should_care.fa),
      recommended_action: localized(claim.recommended_action.en, claim.recommended_action.fa)
    },
    officially_confirmed: CONFIRMED[verification.official.status] ?? null,
    community_confirmed: CONFIRMED[verification.community.status] ?? null,
    official_verification: verificationState(verification.official),
    community_verification: verificationState(verification.community),
    suggested_fit_adjustment: null,
    conditional_adjustment: null,
    reason_for_adjustment: null,
    keywords: signal.keywords,
    resolution: null,
    needs_recheck: NEEDS_RECHECK[review.status] ?? null,
    suggested_recheck_date: review.next_check_at,
    evidence_ids: signal.evidence_links.map((link) => link.evidence_id),
    evidence_links: signal.evidence_links,
    lifecycle: {
      status: LIFECYCLE_STATUS[assessment.lifecycle],
      source_status: assessment.lifecycle,
      first_seen: null,
      last_seen: null,
      last_verified: review.last_checked_at,
      superseded_by: null
    },
    validation: LEGACY_VALIDATION
  };
}

export function adaptCommunityDatasetV3(dataset) {
  const sourcesById = new Map(dataset.sources.map((source) => [source.source_id, source]));
  return {
    sourceSchemaVersion: V3_SCHEMA_VERSION,
    generatedAt: dataset.dataset.generated_at,
    sourceCoverage: dataset.sources.map((source) => ({
      source_id: source.source_id,
      source_name: source.name,
      source_type: source.source_type,
      source_url: source.source_url,
      coverage_start: source.coverage.from,
      coverage_end: source.coverage.to,
      records_processed: source.coverage.records_processed,
      coverage_complete: COVERAGE_COMPLETE[source.coverage.status]
    })),
    summary: null,
    qualityControl: dataset.quality,
    watchlist: null,
    // Legacy schemas have no Route Claims, Questions, Academic Opportunities, or Lived Experiences.
    routeClaims: [],
    questions: [],
    academicOpportunities: [],
    livedExperiences: [],
    officialStatistics: [],
    provenance: {
      dataset_id: dataset.dataset.dataset_id,
      producer: dataset.dataset.generator.name,
      producer_version: dataset.dataset.generator.version,
      method: null,
      collected_at: null
    },
    sources: dataset.sources.map((source) => ({
      id: source.source_id,
      source_schema_version: V3_SCHEMA_VERSION,
      source_name: source.name,
      source_family: null,
      public: null,
      source_url: source.source_url,
      source_type: source.source_type,
      validation: LEGACY_VALIDATION
    })),
    evidence: dataset.evidence.map((item) => canonicalEvidence(item, sourcesById)),
    signals: dataset.signals.map(canonicalSignal)
  };
}
