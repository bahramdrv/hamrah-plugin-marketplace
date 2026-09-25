import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const V4_EXAMPLE = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const V2_EXAMPLE = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/gold_standard.json", import.meta.url), "utf8"
));
const STORE_SIGNALS = fileURLToPath(new URL("../../skills/hamrah-signal-builder/scripts/store_signals.py", import.meta.url));
const SIGNAL_ID = "sig_gbr-gt-endorsement-delay";

function tempDir(t, prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function publish(directory, dataset, storeRoot) {
  const candidate = path.join(directory, `candidate-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(candidate, JSON.stringify(dataset));
  return spawnSync("python3", [STORE_SIGNALS, candidate, "--store-root", storeRoot, "--label", "v4"], { encoding: "utf8" });
}

function search(signalStoreRoot, args = {}) {
  return executeTool("searchCommunitySignals", args, globalThis.fetch, { signalStoreRoot });
}

test("a published version 4 Signal is searchable and retrievable with evidence, provenance, lifecycle, and privacy", async (t) => {
  const directory = tempDir(t, "hamrah-v4-");
  const storeRoot = path.join(directory, "store");
  const published = publish(directory, V4_EXAMPLE, storeRoot);
  assert.equal(published.status, 0, published.stderr);
  const signalStoreRoot = path.join(storeRoot, "datasets");

  const searched = await search(signalStoreRoot, { countryCode: "GBR", route: "global_talent" });
  assert.equal(searched.isError, false);
  assert.equal(searched.structuredContent.coverage.validDatasets, 1, JSON.stringify(searched.structuredContent.coverage));
  assert.equal(searched.structuredContent.resultCount, 1);
  const found = searched.structuredContent.signals[0];
  assert.equal(found.signalId, SIGNAL_ID);
  assert.equal(found.schemaVersion, "4.0.0");
  assert.equal(found.status, "active");
  assert.equal(found.privacyStatus, "pass");
  assert.equal(found.validationStatus, "validated");
  assert.equal(found.lastVerified, "2026-09-11");
  assert.deepEqual(found.lifecycle, { ...V4_EXAMPLE.signals[0].lifecycle, source_status: "active" });
  assert.equal(found.evidenceIds.length, 4);

  const fetched = await executeTool("getCommunitySignalDataset", {
    datasetId: found.datasetId, signalIds: [SIGNAL_ID, "sig_missing"]
  }, globalThis.fetch, { signalStoreRoot });
  assert.equal(fetched.isError, false);
  const dataset = fetched.structuredContent;
  assert.equal(dataset.schemaVersion, "4.0.0");
  assert.equal(dataset.privacy.status, "pass");
  assert.deepEqual(dataset.signals.map((signal) => signal.id), [SIGNAL_ID]);
  assert.deepEqual(dataset.missingSignalIds, ["sig_missing"]);
  assert.equal(dataset.evidence.length, 4);
  for (const item of dataset.evidence) {
    assert.match(item.content_hash, /^sha256:[0-9a-f]{64}$/);
    assert.ok(item.retrieved_at);
    assert.ok(dataset.sources.some((source) => source.id === item.source_id));
  }
  assert.equal(dataset.sources.length, 2);
});

test("version 2 and version 4 datasets are searched together without changing version 2 results", async (t) => {
  const signalStoreRoot = tempDir(t, "hamrah-mixed-");
  writeFileSync(path.join(signalStoreRoot, "v2.json"), JSON.stringify(V2_EXAMPLE));
  writeFileSync(path.join(signalStoreRoot, "v4.json"), JSON.stringify(V4_EXAMPLE));
  const searched = await search(signalStoreRoot, { countryCode: "GBR", route: "global_talent" });
  assert.equal(searched.structuredContent.coverage.validDatasets, 2);
  const legacy = searched.structuredContent.signals.find((signal) => signal.datasetId === "v2");
  assert.equal(legacy.signalId, "GBR-GT-R4-ENDORSEMENT-DELAY-EXAMPLE");
  assert.equal(legacy.privacyStatus, "pass");
  assert.ok(searched.structuredContent.signals.some((signal) => signal.signalId === SIGNAL_ID));

  const legacyDataset = await executeTool("getCommunitySignalDataset", { datasetId: "v2" }, globalThis.fetch, { signalStoreRoot });
  assert.equal(legacyDataset.structuredContent.schemaVersion, "2.0");
  assert.equal(legacyDataset.structuredContent.signals[0].signal_id, "GBR-GT-R4-ENDORSEMENT-DELAY-EXAMPLE");
});

test("invalid references, missing provenance, and unsafe privacy states never enter publication or search", async (t) => {
  const directory = tempDir(t, "hamrah-v4-invalid-");
  const cases = [
    ["unknown_evidence", (d) => d.signals[0].evidence_ids.push("evd_missing"), /unknown evidence evd_missing/],
    ["unknown_source", (d) => { d.evidence[0].source_id = "src_missing"; }, /unknown source src_missing/],
    ["claim_reference", (d) => d.route_claims.push({
      id: "clm_unsupported", country_code: "GBR", route: "global_talent", claim_type: "processing_time",
      process_stage: null, statement_en: "Endorsement takes longer than published.", opposing_evidence_ids: [],
      evidence_ids: ["evd_missing"], lifecycle: { ...d.signals[0].lifecycle }, validation: { ...d.signals[0].validation }
    }), /unknown evidence evd_missing/],
    ["duplicate_id", (d) => { d.evidence[1].id = d.evidence[0].id; }, /duplicate artifact id/],
    ["missing_hash", (d) => { delete d.evidence[0].content_hash; }, /content_hash/],
    ["missing_retrieval", (d) => { delete d.evidence[0].retrieved_at; }, /retrieved_at/],
    ["invalid_retrieval", (d) => { d.evidence[0].retrieved_at = "2026-02-30T00:00:00Z"; }, /retrieved_at is not a valid ISO date-time/],
    ["no_evidence", (d) => { d.signals[0].evidence_ids = []; }, /evidence_ids/],
    ["public_without_locator", (d) => { d.sources[1].source_url = null; }, /public source needs an https source_url/],
    ["private_with_locator", (d) => { d.evidence[0].source_url = "https://example.org/thread/1"; }, /private source must not carry a source_url/],
    ["artifact_needs_review", (d) => { d.evidence[0].validation.privacy_status = "needs_review"; }, /validation.privacy_status must be pass/],
    ["artifact_not_validated", (d) => { d.signals[0].validation.status = "needs_review"; }, /validation.status must be validated/],
    ["inspected_privacy_fail", (d) => { d.evidence[0].evidence_summary = "Contact the applicant at jane@example.com"; }, /privacy fail/],
    ["impossible_lifecycle_date", (d) => { d.signals[0].lifecycle.first_seen = "2026-02-30"; }, /first_seen is not a valid ISO date/],
    ["future_lifecycle_date", (d) => { d.signals[0].lifecycle.last_seen = "2026-09-12"; }, /last_seen is after generated_at/],
    ["superseded_without_successor", (d) => { d.signals[0].lifecycle.status = "superseded"; }, /superseded status requires superseded_by/],
    ["resolved_penalty", (d) => { d.signals[0].lifecycle.status = "resolved"; }, /adjustment must be 0/]
  ];
  const signalStoreRoot = path.join(directory, "direct");
  mkdirSync(signalStoreRoot);
  for (const [name, mutate, reason] of cases) {
    const dataset = structuredClone(V4_EXAMPLE);
    mutate(dataset);
    const published = publish(directory, dataset, path.join(directory, `store-${name}`));
    assert.notEqual(published.status, 0, name);
    assert.match(published.stderr, reason, name);
    writeFileSync(path.join(signalStoreRoot, `${name}.json`), JSON.stringify(dataset));
  }

  const searched = await search(signalStoreRoot);
  assert.equal(searched.structuredContent.resultCount, 0);
  assert.equal(searched.structuredContent.coverage.validDatasets, 0);
  for (const [name, , reason] of cases) {
    const invalid = searched.structuredContent.coverage.invalidDatasets.find((item) => item.datasetId === name);
    assert.ok(invalid, name);
    assert.match(invalid.error, reason, name);
  }
  const fetched = await executeTool("getCommunitySignalDataset", { datasetId: "unknown_source" }, globalThis.fetch, { signalStoreRoot });
  assert.equal(fetched.isError, true);
});

test("a content hash with long digit runs is not mistaken for a phone number", async (t) => {
  const signalStoreRoot = tempDir(t, "hamrah-v4-hash-");
  const dataset = structuredClone(V4_EXAMPLE);
  dataset.evidence[0].content_hash = `sha256:${"1234567890".repeat(6)}abcd`;
  writeFileSync(path.join(signalStoreRoot, "hash.json"), JSON.stringify(dataset));
  const searched = await search(signalStoreRoot);
  assert.equal(searched.structuredContent.coverage.validDatasets, 1, JSON.stringify(searched.structuredContent.coverage));
});
