import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
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

function parseDay(value, allowDate, allowDateTime) {
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
  const day = parseDay(value, allowDate, allowDateTime);
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

export function searchableV4Signals(dataset) {
  return dataset.signals.map((signal) => ({
    ...signal,
    signal_id: signal.id,
    status: signal.lifecycle.status,
    first_seen: signal.lifecycle.first_seen,
    last_seen: signal.lifecycle.last_seen,
    last_verified: signal.lifecycle.last_verified ?? null
  }));
}

export function v4DatasetView(dataset, signals) {
  const evidenceIds = new Set(signals.flatMap((signal) => signal.evidence_ids));
  const evidence = dataset.evidence.filter((item) => evidenceIds.has(item.id));
  const sourceIds = new Set(evidence.map((item) => item.source_id));
  return {
    provenance: dataset.provenance,
    evidence,
    sources: dataset.sources.filter((source) => sourceIds.has(source.id))
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const { errors, privacy } = validateCommunityDatasetV4(JSON.parse(readFileSync(process.argv[2], "utf8")));
    process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, errors, privacy })}\n`);
    if (errors.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Version 4 validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
