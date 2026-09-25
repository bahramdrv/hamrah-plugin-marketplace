import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import { localized } from "./community-canonical.mjs";
import { inspectDatasetPrivacy } from "./privacy-check.mjs";

export const V4_SCHEMA_VERSION = "4.0.0";
const SCHEMA = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/community_dataset_v4_schema.json", import.meta.url), "utf8"
));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);
const COLLECTIONS = ["sources", "evidence", "signals", "questions", "academic_opportunities", "lived_experiences", "route_claims"];
const ARTIFACT_COLLECTIONS = COLLECTIONS.filter((name) => name !== "sources" && name !== "evidence");
const MAX_ERRORS = 12;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseIsoDay(value, allowDate, allowDateTime) {
  if (typeof value !== "string") return null;
  const isDate = allowDate && DATE.test(value);
  if (!isDate && !(allowDateTime && DATE_TIME.test(value))) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  if (isDate) return value;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString().slice(0, 10);
}

function checkDate(errors, reference, path, value, { allowDate = true, allowDateTime = false, nullable = false } = {}) {
  if (value === null && nullable) return null;
  const day = parseIsoDay(value, allowDate, allowDateTime);
  if (!day) {
    errors.push(`${path} is not a valid ISO ${[allowDate && "date", allowDateTime && "date-time"].filter(Boolean).join(" or ")}`);
    return null;
  }
  if (reference && day > reference) errors.push(`${path} is after generated_at`);
  return day;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function referenceErrors(dataset) {
  const errors = [];
  const byId = new Map();
  for (const collection of COLLECTIONS) {
    dataset[collection].forEach((artifact, index) => {
      const path = `${collection}[${index}]`;
      if (byId.has(artifact.id)) errors.push(`${path}: duplicate artifact id ${artifact.id}`);
      else byId.set(artifact.id, { collection, artifact });
    });
  }
  const expect = (path, id, collection, label) => {
    if (id !== null && byId.get(id)?.collection !== collection) errors.push(`${path} references unknown ${label} ${id}`);
  };
  dataset.evidence.forEach((item, index) => {
    const path = `evidence[${index}]`;
    expect(`${path}.source_id`, item.source_id, "sources", "source");
    expect(`${path}.supersedes`, item.supersedes, "evidence", "evidence");
    const source = byId.get(item.source_id)?.artifact;
    if (source && !source.public && item.source_url !== null) {
      errors.push(`${path}: evidence from a private source must not carry a source_url`);
    }
    if (source?.public && !isHttpsUrl(item.source_url)) {
      errors.push(`${path}: evidence from a public source needs an https source_url`);
    }
  });
  dataset.sources.forEach((source, index) => {
    if (source.public && !isHttpsUrl(source.source_url)) errors.push(`sources[${index}]: public source needs an https source_url`);
    if (!source.public && source.source_url !== null) errors.push(`sources[${index}]: private source must not carry a source_url`);
  });
  for (const collection of ARTIFACT_COLLECTIONS) {
    dataset[collection].forEach((artifact, index) => {
      const path = `${collection}[${index}]`;
      for (const field of ["evidence_ids", "opposing_evidence_ids"]) {
        for (const id of artifact[field] || []) expect(`${path}.${field}`, id, "evidence", "evidence");
      }
      if (artifact.iran_connection_evidence_id) {
        expect(`${path}.iran_connection_evidence_id`, artifact.iran_connection_evidence_id, "evidence", "evidence");
      }
      for (const id of artifact.correlated_signal_ids || []) expect(`${path}.correlated_signal_ids`, id, "signals", "signal");
      expect(`${path}.lifecycle.superseded_by`, artifact.lifecycle.superseded_by, collection, "artifact");
    });
  }
  return errors;
}

function lifecycleAndStateErrors(dataset) {
  const errors = [];
  const reference = checkDate(errors, null, "generated_at", dataset.generated_at, { allowDate: false, allowDateTime: true });
  checkDate(errors, reference, "provenance.collected_at", dataset.provenance.collected_at, { allowDate: false, allowDateTime: true });
  for (const collection of COLLECTIONS) {
    dataset[collection].forEach((artifact, index) => {
      const path = `${collection}[${index}]`;
      const { validation } = artifact;
      if (validation.status !== "validated") errors.push(`${path}: validation.status must be validated, got ${validation.status}`);
      if (validation.privacy_status !== "pass") errors.push(`${path}: validation.privacy_status must be pass, got ${validation.privacy_status}`);
      checkDate(errors, reference, `${path}.validation.validated_at`, validation.validated_at, { allowDate: false, allowDateTime: true });
      if (!artifact.lifecycle) return;
      const { lifecycle } = artifact;
      const first = checkDate(errors, reference, `${path}.lifecycle.first_seen`, lifecycle.first_seen);
      const last = checkDate(errors, reference, `${path}.lifecycle.last_seen`, lifecycle.last_seen);
      if (lifecycle.last_verified !== undefined) {
        checkDate(errors, reference, `${path}.lifecycle.last_verified`, lifecycle.last_verified, { nullable: true });
      }
      if (first && last && last < first) errors.push(`${path}.lifecycle.last_seen is before first_seen`);
      if ((lifecycle.status === "superseded") !== (lifecycle.superseded_by !== null)) {
        errors.push(`${path}: superseded status requires superseded_by, and only superseded artifacts may set it`);
      }
    });
  }
  dataset.evidence.forEach((item, index) => {
    const path = `evidence[${index}]`;
    checkDate(errors, reference, `${path}.retrieved_at`, item.retrieved_at, { allowDate: false, allowDateTime: true });
    checkDate(errors, reference, `${path}.published_at`, item.published_at, { allowDateTime: true, nullable: true });
    checkDate(errors, reference, `${path}.event_date`, item.event_date, { nullable: true });
  });
  dataset.signals.forEach((signal, index) => {
    const path = `signals[${index}]`;
    const status = signal.lifecycle.status;
    if (["resolved", "historical", "stale", "superseded"].includes(status) && signal.suggested_fit_adjustment !== 0) {
      errors.push(`${path}: ${status} signal adjustment must be 0`);
    }
    if (signal.impact_direction === "positive_resolution" && signal.suggested_fit_adjustment !== 0) {
      errors.push(`${path}: positive resolution adjustment must be 0`);
    }
    if ((status === "resolved") !== (signal.resolution.resolved === true)) {
      errors.push(`${path}: resolved status and resolution.resolved must agree`);
    }
  });
  return errors;
}

export function validateCommunityDatasetV4(dataset) {
  if (!validateSchema(dataset)) {
    return {
      errors: validateSchema.errors.slice(0, MAX_ERRORS).map((error) => `schema ${error.instancePath || "<root>"}: ${error.message}`),
      privacy: null
    };
  }
  const privacy = inspectDatasetPrivacy(dataset);
  const errors = [...referenceErrors(dataset), ...lifecycleAndStateErrors(dataset)];
  if (privacy.status !== "pass") {
    errors.push(`privacy ${privacy.status}: ${privacy.findings.map((item) => `${item.path} (${item.rule})`).join(", ")}`);
  }
  return { errors: errors.slice(0, MAX_ERRORS), privacy };
}

export function adaptCommunityDatasetV4(dataset) {
  const evidenceById = new Map(dataset.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(dataset.sources.map((source) => [source.id, source]));
  return {
    sourceSchemaVersion: V4_SCHEMA_VERSION,
    generatedAt: dataset.generated_at,
    sourceCoverage: dataset.source_coverage,
    summary: null,
    qualityControl: dataset.quality_control,
    watchlist: dataset.watchlist,
    provenance: dataset.provenance,
    sources: dataset.sources.map((source) => ({ ...source, source_schema_version: V4_SCHEMA_VERSION, source_type: null })),
    evidence: dataset.evidence.map((item) => ({
      ...item,
      source_schema_version: V4_SCHEMA_VERSION,
      source_name: sourcesById.get(item.source_id).source_name,
      locator: item.source_url ? { type: "url", value: item.source_url } : null,
      evidence_summary_fa: null,
      privacy_redacted: null
    })),
    signals: dataset.signals.map((signal) => ({
      ...signal,
      source_schema_version: V4_SCHEMA_VERSION,
      relationships: signal.correlated_signal_ids.map((id) => ({ type: "correlates_with", signal_id: id })),
      confidence_rationale: null,
      evidence_maturity: null,
      localized: {
        title: localized(signal.title),
        summary: localized(signal.summary_en, signal.summary_fa),
        practical_impact: localized(signal.practical_impact),
        who_should_care: localized(signal.who_should_care),
        recommended_action: localized(signal.recommended_action)
      },
      community_verification: null,
      evidence_links: signal.evidence_ids.map((id) => ({
        evidence_id: id,
        relation: evidenceById.get(id).supports_or_contradicts,
        independence_group: evidenceById.get(id).independence_group
      })),
      lifecycle: { ...signal.lifecycle, source_status: signal.lifecycle.status, last_verified: signal.lifecycle.last_verified ?? null }
    }))
  };
}
