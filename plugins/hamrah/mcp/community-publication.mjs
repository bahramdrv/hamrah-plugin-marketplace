// Explicit publication of vetted Evidence Candidates into a Git-backed Community Dataset store.
//
//   node plugins/hamrah/mcp/community-publication.mjs publish candidate.json --store-root plugins/hamrah/data/community-signals [--label name] [--now ISO]
//   node plugins/hamrah/mcp/community-publication.mjs withdraw --store-root <root> (--artifact ID | --dataset ID) --reason privacy [--note text] [--now ISO]
//
// A candidate uses the version 4 layout with local keys as IDs and optional validation blocks. Publication runs the
// normalization, deduplication, privacy, provenance, evidence, contradiction, and schema gates, assigns deterministic
// SHA-256 IDs, and writes an immutable snapshot only when every gate passes.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { parseIsoDay, V4_SCHEMA_VERSION, validateCommunityDatasetV4 } from "./community-dataset-v4.mjs";
import { askerCountIssues, countIndependentAskers, mergeQuestions, normalizeQuestionText } from "./community-questions.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";
import { emptyLedger, ledgerPathFor, readWithdrawalLedger, WITHDRAWAL_REASONS } from "./withdrawals.mjs";

export const DEPLOYED_STORE_ROOT = path.resolve(DATASET_ROOT, "..");
const GATES = ["normalization", "deduplication", "privacy", "provenance", "evidence", "contradiction", "schema"];
const COLLECTIONS = {
  sources: "src",
  evidence: "evd",
  signals: "sig",
  questions: "qst",
  academic_opportunities: "opp",
  lived_experiences: "exp",
  route_claims: "clm"
};
const ARTIFACT_COLLECTIONS = ["signals", "questions", "academic_opportunities", "lived_experiences", "route_claims"];

export class PublicationError extends Error {
  constructor(issues) {
    super(issues.map((item) => `[${item.gate}] ${item.message}`).join("\n"));
    this.issues = issues;
  }
}

function candidateSchema() {
  const schema = JSON.parse(readFileSync(
    new URL("../skills/hamrah-signal-builder/references/community_dataset_v4_schema.json", import.meta.url), "utf8"
  ));
  for (const [name, definition] of Object.entries(schema.$defs)) {
    if (name.endsWith("Id")) schema.$defs[name] = { type: "string", minLength: 1 };
    if (definition.required?.includes("validation")) definition.required = definition.required.filter((key) => key !== "validation");
    if (definition.properties?.evidence_ids) delete definition.properties.evidence_ids.minItems;
  }
  return schema;
}
const validateCandidate = new Ajv2020({ allErrors: true, strict: false }).compile(candidateSchema());

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function identityText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064a\u0649]/gu, "\u06cc")
    .replace(/\u0643/gu, "\u06a9")
    .replace(/\u200c/gu, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function canonicalUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return value;
  }
}

function normalizeStrings(value) {
  if (typeof value === "string") return value.normalize("NFC").trim();
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeStrings(item)]));
  }
  return value;
}

function normalizeCandidate(candidate) {
  const normalized = normalizeStrings(candidate);
  for (const collection of ["sources", "evidence"]) {
    for (const item of normalized[collection]) item.source_url = canonicalUrl(item.source_url);
  }
  for (const item of normalized.evidence) item.content_hash = item.content_hash.toLowerCase();
  for (const signal of normalized.signals) signal.destination.country_code = signal.destination.country_code.toUpperCase();
  for (const collection of ["academic_opportunities", "lived_experiences", "route_claims"]) {
    for (const item of normalized[collection]) item.country_code = item.country_code.toUpperCase();
  }
  for (const question of normalized.questions) question.country_codes = question.country_codes.map((code) => code.toUpperCase());
  return normalized;
}

const sortedText = (values) => [...new Set(values.map(identityText))].sort();

function identityKey(collection, artifact, ids) {
  switch (collection) {
    case "sources":
      return artifact.public && artifact.source_url
        ? ["url", artifact.source_url]
        : ["family", identityText(artifact.source_family), identityText(artifact.source_name)];
    case "evidence":
      return [ids.sources.get(artifact.source_id), artifact.content_hash, artifact.source_url, artifact.event_date];
    case "signals":
      return [artifact.destination.country_code, sortedText(artifact.migration_routes), identityText(artifact.signal_type),
        identityText(artifact.root_cause_id), sortedText(artifact.entities.map((entity) => entity.name))];
    case "questions":
      return [sortedText(artifact.country_codes), sortedText(artifact.routes), normalizeQuestionText(artifact.canonical_en)];
    case "academic_opportunities":
      return [artifact.country_code, identityText(artifact.institution), identityText(artifact.program),
        identityText(artifact.degree_level), artifact.deadline];
    case "lived_experiences":
      return [artifact.country_code, identityText(artifact.route), identityText(artifact.milestone), artifact.outcome,
        artifact.event_date, ids.evidence.get(artifact.iran_connection_evidence_id)];
    case "route_claims":
      return [artifact.country_code, sortedText(artifact.routes), identityText(artifact.claim_type),
        identityText(artifact.process_stage), identityText(artifact.statement_en)];
    default:
      throw new Error(`Unknown collection ${collection}`);
  }
}

function referenceFields(collection, artifact) {
  const references = [];
  if (collection === "evidence") {
    references.push(["source_id", artifact.source_id, "sources"], ["supersedes", artifact.supersedes, "evidence"]);
  }
  if (ARTIFACT_COLLECTIONS.includes(collection)) {
    for (const id of artifact.evidence_ids) references.push(["evidence_ids", id, "evidence"]);
    for (const id of artifact.opposing_evidence_ids || []) references.push(["opposing_evidence_ids", id, "evidence"]);
    for (const id of artifact.correlated_signal_ids || []) references.push(["correlated_signal_ids", id, "signals"]);
    if (artifact.iran_connection_evidence_id) references.push(["iran_connection_evidence_id", artifact.iran_connection_evidence_id, "evidence"]);
    references.push(["lifecycle.superseded_by", artifact.lifecycle.superseded_by, collection]);
  }
  return references.filter(([, id]) => id !== null && id !== undefined);
}

function assertNoIssues(issues) {
  if (issues.length) {
    throw new PublicationError([...issues].sort((a, b) => GATES.indexOf(a.gate) - GATES.indexOf(b.gate)));
  }
}

function candidateChecks(candidate) {
  const issues = [];
  const keys = new Map();
  for (const collection of Object.keys(COLLECTIONS)) {
    candidate[collection].forEach((artifact, index) => {
      const at = `${collection}[${index}]`;
      if (keys.has(artifact.id)) issues.push({ gate: "deduplication", message: `${at}: duplicate candidate key ${artifact.id}` });
      else keys.set(artifact.id, collection);
      const declared = artifact.validation;
      if (declared && (declared.status !== "validated" || declared.privacy_status !== "pass")) {
        issues.push({ gate: "privacy", message: `${at}: candidate declares validation ${declared.status} with privacy ${declared.privacy_status}` });
      }
      if (ARTIFACT_COLLECTIONS.includes(collection) && artifact.evidence_ids.length === 0) {
        issues.push({ gate: "evidence", message: `${at} has no evidence` });
      }
    });
  }
  for (const collection of Object.keys(COLLECTIONS)) {
    candidate[collection].forEach((artifact, index) => {
      for (const [field, id, target] of referenceFields(collection, artifact)) {
        if (keys.get(id) !== target) {
          issues.push({ gate: "evidence", message: `${collection}[${index}].${field} references unknown ${target === "evidence" ? "evidence" : target.replace(/s$/, "")} ${id}` });
        }
      }
    });
  }
  return issues;
}

function assignIds(candidate) {
  const ids = Object.fromEntries(Object.keys(COLLECTIONS).map((collection) => [collection, new Map()]));
  const identities = new Map();
  const issues = [];
  const order = ["sources", "evidence", ...ARTIFACT_COLLECTIONS];
  for (const collection of order) {
    for (const artifact of candidate[collection]) {
      const identity = stableJson([collection, identityKey(collection, artifact, ids)]);
      // 128 bits of SHA-256; a different identity reaching the same ID fails publication rather than being renamed.
      const id = `${COLLECTIONS[collection]}_${sha256(identity).slice(0, 32)}`;
      if (identities.has(id) && identities.get(id) !== identity) {
        issues.push({ gate: "deduplication", message: `${collection} ID collision for ${id}` });
      }
      identities.set(id, identity);
      ids[collection].set(artifact.id, id);
    }
  }
  return { ids, issues };
}

function remap(collection, artifact, ids) {
  const mapped = { ...structuredClone(artifact), id: ids[collection].get(artifact.id) };
  delete mapped.validation;
  const unique = (values, target) => [...new Set(values.map((id) => ids[target].get(id)))].sort();
  if (collection === "evidence") {
    mapped.source_id = ids.sources.get(artifact.source_id);
    mapped.supersedes = artifact.supersedes === null ? null : ids.evidence.get(artifact.supersedes);
  }
  if (ARTIFACT_COLLECTIONS.includes(collection)) {
    mapped.evidence_ids = unique(artifact.evidence_ids, "evidence");
    if (artifact.opposing_evidence_ids) mapped.opposing_evidence_ids = unique(artifact.opposing_evidence_ids, "evidence");
    if (artifact.correlated_signal_ids) mapped.correlated_signal_ids = unique(artifact.correlated_signal_ids, "signals");
    if (artifact.iran_connection_evidence_id) mapped.iran_connection_evidence_id = ids.evidence.get(artifact.iran_connection_evidence_id);
    if (artifact.answer_links) {
      // Links to candidate keys become stable IDs; other links name artifacts already published in the store.
      mapped.answer_links = artifact.answer_links.map((link) => ({
        ...link,
        artifact_id: ids.signals.get(link.artifact_id) ?? ids.route_claims.get(link.artifact_id) ?? link.artifact_id
      }));
    }
    const successor = artifact.lifecycle.superseded_by;
    mapped.lifecycle = { ...mapped.lifecycle, superseded_by: successor === null ? null : ids[collection].get(successor) };
  }
  return mapped;
}

function deduplicate(collection, artifacts, candidateKeys) {
  const byId = new Map();
  const issues = [];
  let merged = 0;
  artifacts.forEach((artifact, index) => {
    const existing = byId.get(artifact.id);
    if (!existing) {
      byId.set(artifact.id, { artifact, key: candidateKeys[index] });
    } else if (stableJson(existing.artifact) === stableJson(artifact)) {
      merged++;
    } else if (collection === "questions") {
      // Differently worded records of one Question are merged; conflicting facts about it are not.
      const result = mergeQuestions(existing.artifact, artifact);
      if (result.issue) issues.push({ gate: "deduplication", message: `questions: ${result.issue} from candidate keys ${existing.key} and ${candidateKeys[index]}` });
      else {
        existing.artifact = result.merged;
        merged++;
      }
    } else {
      issues.push({
        gate: "deduplication",
        message: `${collection}: conflicting duplicate ${artifact.id} from candidate keys ${existing.key} and ${candidateKeys[index]}`
      });
    }
  });
  return { artifacts: [...byId.values()].map(({ artifact }) => artifact).sort((a, b) => a.id.localeCompare(b.id)), merged, issues };
}

function contradictionIssues(dataset) {
  const issues = [];
  const stance = new Map(dataset.evidence.map((item) => [item.id, item.supports_or_contradicts]));
  dataset.signals.forEach((signal, index) => {
    const stances = signal.evidence_ids.map((id) => stance.get(id));
    if (!stances.some((value) => value === "supports" || value === "resolves")) {
      issues.push({ gate: "contradiction", message: `signals[${index}] ${signal.id} has no supporting evidence` });
    }
    if (signal.confidence === "high" && stances.includes("contradicts")) {
      issues.push({ gate: "contradiction", message: `signals[${index}] ${signal.id} claims high confidence with contradicting evidence` });
    }
  });
  dataset.route_claims.forEach((claim, index) => {
    const opposing = new Set(claim.opposing_evidence_ids);
    for (const id of claim.evidence_ids) {
      if (opposing.has(id)) issues.push({ gate: "contradiction", message: `route_claims[${index}]: evidence ${id} both supports and opposes the claim` });
      else if (stance.get(id) === "contradicts") issues.push({ gate: "contradiction", message: `route_claims[${index}]: contradicting evidence ${id} is listed as support` });
    }
    for (const id of opposing) {
      if (stance.get(id) === "supports") issues.push({ gate: "contradiction", message: `route_claims[${index}]: supporting evidence ${id} is listed as opposing` });
    }
  });
  return issues;
}

// Runs every gate and returns the dataset to persist; throws PublicationError listing each failing gate.
function answerLinkIssues(questions, ids, publishedArtifactIds) {
  const issues = [];
  questions.forEach((question, index) => {
    for (const link of question.answer_links ?? []) {
      const inCandidate = ids.signals.has(link.artifact_id) || ids.route_claims.has(link.artifact_id);
      if (!inCandidate && !publishedArtifactIds.has(link.artifact_id)) {
        issues.push({ gate: "evidence", message: `questions[${index}].answer_links references ${link.artifact_id}, which was not found in the candidate or the store's current datasets` });
      }
    }
  });
  return issues;
}

export function prepareCandidate(candidate, { now, publishedArtifactIds = new Set() }) {
  if (!parseIsoDay(now, false, true)) throw new PublicationError([{ gate: "normalization", message: `--now ${now} is not an ISO date-time` }]);
  if (!validateCandidate(candidate)) {
    throw new PublicationError(validateCandidate.errors.slice(0, 12).map((error) => ({
      gate: "schema",
      message: `candidate ${error.instancePath || "<root>"}: ${error.message}${error.params?.missingProperty ? ` (${error.params.missingProperty})` : ""}`
    })));
  }
  const normalized = normalizeCandidate(candidate);
  assertNoIssues(candidateChecks(normalized));
  // Each proposed record must count its own askers correctly before records are merged and recounted.
  assertNoIssues(askerCountIssues(normalized.questions, normalized.evidence));
  const { ids, issues: idIssues } = assignIds(normalized);
  assertNoIssues([...idIssues, ...answerLinkIssues(normalized.questions, ids, publishedArtifactIds)]);

  const validation = { status: "validated", privacy_status: "pass", validated_at: now };
  const collections = {};
  const merged = {};
  const dedupIssues = [];
  for (const collection of Object.keys(COLLECTIONS)) {
    const result = deduplicate(
      collection,
      normalized[collection].map((artifact) => remap(collection, artifact, ids)),
      normalized[collection].map((artifact) => artifact.id)
    );
    const evidenceById = new Map((collections.evidence ?? []).map((item) => [item.id, item]));
    collections[collection] = result.artifacts.map((artifact) => ({
      ...artifact,
      ...(collection === "questions" ? { independent_asker_count: countIndependentAskers(artifact.evidence_ids, evidenceById) } : {}),
      validation
    }));
    merged[collection] = result.merged;
    dedupIssues.push(...result.issues);
  }
  assertNoIssues(dedupIssues);

  const dataset = {
    schema_version: V4_SCHEMA_VERSION,
    generated_at: now,
    provenance: normalized.provenance,
    source_coverage: normalized.source_coverage,
    quality_control: normalized.quality_control,
    watchlist: normalized.watchlist,
    ...collections
  };
  const { issues } = validateCommunityDatasetV4(dataset);
  assertNoIssues([...issues, ...contradictionIssues(dataset)]);
  return {
    dataset,
    ids: Object.fromEntries(Object.entries(ids).map(([collection, map]) => [collection, Object.fromEntries(map)])),
    merged
  };
}

export function isDeployedStore(storeRoot) {
  return path.resolve(storeRoot) === DEPLOYED_STORE_ROOT;
}

function writeAtomically(target, text, storeRoot) {
  mkdirSync(path.dirname(target), { recursive: true });
  // Temporary files stay outside datasets/ so a partial write is never scanned.
  const temporary = path.join(storeRoot, `.publishing-${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(temporary, text);
  renameSync(temporary, target);
}

function readCatalog(storeRoot) {
  const catalogPath = path.join(storeRoot, "catalog.json");
  return existsSync(catalogPath)
    ? JSON.parse(readFileSync(catalogPath, "utf8"))
    : { schema_version: "1.0", updated_at: null, datasets: [] };
}

function contentDigest(dataset) {
  const { generated_at: _generatedAt, ...rest } = dataset;
  const withoutValidationTimes = Object.fromEntries(Object.entries(rest).map(([key, value]) => [
    key,
    Object.hasOwn(COLLECTIONS, key) ? value.map(({ validation: _validation, ...artifact }) => artifact) : value
  ]));
  return sha256(stableJson(withoutValidationTimes));
}

export function publishCandidate(candidate, { storeRoot, label = "community", now }) {
  if (!storeRoot) throw new PublicationError([{ gate: "normalization", message: "--store-root is required; use plugins/hamrah/data/community-signals for the deployed store" }]);
  const root = path.resolve(storeRoot);
  const datasetsRoot = path.join(root, "datasets");
  const publishedArtifactIds = new Set(existsSync(datasetsRoot)
    ? loadCommunitySignalStore(datasetsRoot).datasets.flatMap(({ canonical }) => [...canonical.signals, ...canonical.routeClaims].map((artifact) => artifact.id))
    : []);
  const { dataset, ids, merged } = prepareCandidate(candidate, { now, publishedArtifactIds });
  const digestOfContent = contentDigest(dataset);
  const catalog = readCatalog(root);
  const base = { datasetsDirectory: path.join(root, "datasets"), readerScans: isDeployedStore(root), contentDigest: digestOfContent, ids, merged };
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "community";
  // Only the newest snapshot under this label counts: re-publishing older content after a change must restore it.
  const existing = catalog.datasets
    .filter((entry) => entry.path.includes(`-${safeLabel}-`))
    .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)))[0];
  if (existing?.content_digest === digestOfContent) {
    return { ...base, unchanged: true, published: path.join(root, existing.path), datasetId: existing.path.replace(/^datasets\//, "").replace(/\.json$/, "") };
  }

  const digest = sha256(stableJson(dataset));
  const stamp = now.replace(/\D/g, "").slice(0, 14);
  const relative = path.posix.join("datasets", stamp.slice(0, 4), stamp.slice(4, 6), `${stamp}-${safeLabel}-${digest.slice(0, 10)}.json`);
  writeAtomically(path.join(root, relative), `${JSON.stringify(dataset, null, 2)}\n`, root);

  const destinations = dataset.signals.map((signal) => signal.destination.country_code);
  catalog.datasets.push({
    path: relative,
    sha256: digest,
    content_digest: digestOfContent,
    schema_version: V4_SCHEMA_VERSION,
    generated_at: dataset.generated_at,
    countries: [...new Set(destinations)].sort(),
    routes: [...new Set(dataset.signals.flatMap((signal) => signal.migration_routes))].sort(),
    statuses: [...new Set(dataset.signals.map((signal) => signal.lifecycle.status))].sort(),
    signal_count: dataset.signals.length,
    source_ids: dataset.sources.map((source) => source.id)
  });
  catalog.updated_at = now;
  catalog.datasets.sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)));
  writeAtomically(path.join(root, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, root);
  return { ...base, unchanged: false, published: path.join(root, relative), datasetId: relative.replace(/^datasets\//, "").replace(/\.json$/, "") };
}

// Appends to the withdrawal ledger. Published snapshots are never rewritten, so history stays in the store and in Git.
export function withdraw({ storeRoot, artifactId, datasetId, reason, note = null, now }) {
  if (!storeRoot) throw new Error("--store-root is required");
  if (Boolean(artifactId) === Boolean(datasetId)) throw new Error("Pass exactly one of --artifact or --dataset.");
  if (!WITHDRAWAL_REASONS.includes(reason)) throw new Error(`--reason must be one of ${WITHDRAWAL_REASONS.join(", ")}`);
  if (!parseIsoDay(now, false, true)) throw new Error(`--now ${now} is not an ISO date-time`);
  const datasetsRoot = path.join(path.resolve(storeRoot), "datasets");
  const ledgerPath = ledgerPathFor(datasetsRoot);
  const ledger = existsSync(ledgerPath) ? readWithdrawalLedger(ledgerPath) : emptyLedger();
  const target = artifactId ? { artifact_id: artifactId } : { dataset_id: datasetId };
  if (ledger.withdrawals.some((entry) => entry.artifact_id === target.artifact_id && entry.dataset_id === target.dataset_id)) {
    return { ledger: ledgerPath, alreadyWithdrawn: true, ...target };
  }
  const store = loadCommunitySignalStore(datasetsRoot);
  const exists = artifactId
    ? store.datasets.some(({ canonical }) => [...canonical.signals, ...canonical.evidence, ...canonical.sources, ...canonical.routeClaims, ...canonical.questions]
      .some((artifact) => artifact.id === artifactId))
    : store.datasets.some((entry) => entry.datasetId === datasetId);
  if (!exists) throw new Error(`${artifactId ?? datasetId} was not found in the store's current datasets.`);
  ledger.withdrawals.push({ ...target, reason, note, withdrawn_at: now });
  writeAtomically(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, path.resolve(storeRoot));
  return { ledger: ledgerPath, alreadyWithdrawn: false, ...target };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { positional: [] };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    if (arg.startsWith("--")) options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest[++index];
    else options.positional.push(arg);
  }
  return { command, options };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { command, options } = parseArgs(process.argv.slice(2));
  const now = options.now ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    let report;
    if (command === "publish") {
      if (!options.positional[0]) throw new Error("publish needs a candidate file path");
      const candidate = JSON.parse(readFileSync(options.positional[0], "utf8"));
      report = publishCandidate(candidate, { storeRoot: options.storeRoot, label: options.label, now });
    } else if (command === "withdraw") {
      report = withdraw({ storeRoot: options.storeRoot, artifactId: options.artifact, datasetId: options.dataset, reason: options.reason, note: options.note ?? null, now });
    } else {
      throw new Error("Usage: community-publication.mjs publish <candidate.json> --store-root <root> | withdraw --store-root <root> (--artifact ID | --dataset ID) --reason <reason>");
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof PublicationError ? error.message : `Publication failed: ${error.message}`}\n`);
    process.exitCode = 1;
  }
}
