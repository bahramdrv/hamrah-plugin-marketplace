import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getCommunitySignalDataset,
  loadCommunitySignalStore,
  normalizeCommunityDataset,
  searchCommunitySignals
} from "../community-signals.mjs";

const gold = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/gold_standard.json", import.meta.url),
  "utf8"
));

function clone(value) {
  return structuredClone(value);
}

function withTempStore(t) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-full-verify-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeDataset(root, name, data) {
  const target = path.join(root, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, typeof data === "string" ? data : JSON.stringify(data));
  return target;
}

test("bundled store loads all three datasets as canonical v3", () => {
  const store = loadCommunitySignalStore();
  assert.equal(store.scanned, 3);
  assert.equal(store.invalidDatasets.length, 0);
  assert.equal(store.datasets.length, 3);

  for (const { datasetId, dataset } of store.datasets) {
    assert.ok(datasetId);
    assert.equal(dataset.schema_version, "3.0.0");
    assert.equal(dataset.taxonomy_version, "2026.09");
    assert.ok(dataset.dataset?.generated_at);
    assert.ok(dataset.dataset?.generator?.name);
    assert.ok(dataset.sources.length > 0);
    assert.ok(dataset.evidence.length > 0);
    assert.ok(dataset.signals.length > 0);
    assert.equal(dataset.quality.checks.privacy.status, "pass");
  }
});

test("GBR, DEU, and AUS are all queryable and public results contain no stored scoring", () => {
  for (const countryCode of ["GBR", "DEU", "AUS"]) {
    const result = searchCommunitySignals({ countryCode, limit: 50 });
    assert.ok(result.resultCount > 0, `${countryCode} should return signals`);
    for (const signal of result.signals) {
      assert.equal(Object.hasOwn(signal, "suggestedFitAdjustment"), false);
      assert.equal(Object.hasOwn(signal, "conditionalAdjustment"), false);
      assert.ok(signal.assessment?.lifecycle);
      assert.ok(signal.assessment?.evidence_maturity);
      assert.ok(signal.review?.status);
      assert.ok(Number.isInteger(signal.evidenceCount));
      assert.ok(Number.isInteger(signal.independentReportCount));
    }
  }
});

test("Germany filters work across route, stage, applicant scope, topic, and entity", () => {
  assert.ok(searchCommunitySignals({ countryCode: "DEU", route: "STUDY / ACADEMIC" }).resultCount > 0);
  assert.ok(searchCommunitySignals({ countryCode: "DEU", processStage: "visa_application" }).resultCount > 0);
  assert.ok(searchCommunitySignals({ countryCode: "DEU", originCountry: "Iran" }).resultCount > 0);
  assert.ok(searchCommunitySignals({ countryCode: "DEU", nationality: "Iranian" }).resultCount > 0);
  assert.ok(searchCommunitySignals({ countryCode: "DEU", topic: "processing" }).resultCount > 0);
  assert.ok(searchCommunitySignals({ countryCode: "DEU", entity: "uni-assist" }).resultCount > 0);
});

test("full dataset fetch resolves every evidence and verification reference", () => {
  for (const countryCode of ["GBR", "DEU", "AUS"]) {
    const searched = searchCommunitySignals({ countryCode, limit: 1 });
    assert.equal(searched.resultCount, 1);
    const full = getCommunitySignalDataset({ datasetId: searched.signals[0].datasetId });
    assert.equal(full.schemaVersion, "3.0.0");
    assert.ok(Array.isArray(full.sources));
    assert.ok(Array.isArray(full.evidence));
    assert.ok(Array.isArray(full.signals));
    const evidenceIds = new Set(full.evidence.map((item) => item.evidence_id));

    for (const signal of full.signals) {
      for (const link of signal.evidence_links) {
        assert.ok(evidenceIds.has(link.evidence_id), `${signal.signal_id}: ${link.evidence_id}`);
      }
      for (const id of signal.verification.official.evidence_ids) {
        assert.ok(evidenceIds.has(id), `${signal.signal_id}: official ${id}`);
      }
      for (const id of signal.verification.community.evidence_ids) {
        assert.ok(evidenceIds.has(id), `${signal.signal_id}: community ${id}`);
      }
    }
  }
});

test("explicit v2 compatibility migration is conservative", () => {
  const raw = JSON.parse(readFileSync(
    new URL("../../data/community-signals/datasets/hamrah_australia_study_signals.json", import.meta.url),
    "utf8"
  ));
  assert.equal(raw.schema_version, "2.0");
  const migrated = normalizeCommunityDataset(raw, "australia-test");
  assert.equal(migrated.schema_version, "3.0.0");
  assert.equal(migrated.extensions.migrated_from_schema, "2.0");
  assert.equal(migrated.quality.checks.privacy.status, "pass");
  assert.ok(migrated.signals.length > 0);
  for (const signal of migrated.signals) {
    assert.equal(signal.scope.routes.codes.includes("other"), false);
    assert.equal(Object.hasOwn(signal, "suggested_fit_adjustment"), false);
    assert.equal(Object.hasOwn(signal, "conditional_adjustment"), false);
  }
});

test("candidate or unknown schema versions cannot use the compatibility path", () => {
  assert.throws(
    () => normalizeCommunityDataset({ signals: [] }, "candidate"),
    /unsupported community-signal schema <missing>/
  );
  assert.throws(
    () => normalizeCommunityDataset({ schema_version: "1.0", signals: [] }, "old"),
    /unsupported community-signal schema 1.0/
  );
});

test("store rejects a v3 dataset whose privacy check is not pass", (t) => {
  const root = withTempStore(t);
  const invalid = clone(gold);
  invalid.quality.checks.privacy.status = "fail";
  writeDataset(root, "privacy-fail.json", invalid);
  const store = loadCommunitySignalStore(root);
  assert.equal(store.datasets.length, 0);
  assert.equal(store.invalidDatasets.length, 1);
  assert.match(store.invalidDatasets[0].error, /privacy/);
});

test("store rejects dangling evidence links", (t) => {
  const root = withTempStore(t);
  const invalid = clone(gold);
  invalid.signals[0].evidence_links[0].evidence_id = "EV-DOES-NOT-EXIST";
  writeDataset(root, "dangling.json", invalid);
  const store = loadCommunitySignalStore(root);
  assert.equal(store.datasets.length, 0);
  assert.match(store.invalidDatasets[0].error, /unknown evidence_id/);
});

test("store rejects canonical signals that contain fit-adjustment fields", (t) => {
  const root = withTempStore(t);
  const invalid = clone(gold);
  invalid.signals[0].suggested_fit_adjustment = -10;
  writeDataset(root, "scoring.json", invalid);
  const store = loadCommunitySignalStore(root);
  assert.equal(store.datasets.length, 0);
  assert.match(store.invalidDatasets[0].error, /suggested_fit_adjustment|scoring adjustments are forbidden/);
});

test("store rejects duplicate source, evidence, and signal IDs", (t) => {
  for (const [kind, mutate, expected] of [
    ["source", (d) => d.sources.push(clone(d.sources[0])), /duplicate source_id/],
    ["evidence", (d) => d.evidence.push(clone(d.evidence[0])), /duplicate evidence_id/],
    ["signal", (d) => d.signals.push(clone(d.signals[0])), /duplicate signal_id/]
  ]) {
    const root = path.join(withTempStore(t), kind);
    mkdirSync(root, { recursive: true });
    const invalid = clone(gold);
    mutate(invalid);
    writeDataset(root, `${kind}.json`, invalid);
    const store = loadCommunitySignalStore(root);
    assert.equal(store.datasets.length, 0);
    assert.match(store.invalidDatasets[0].error, expected);
  }
});

test("store rejects oversized datasets before parsing", (t) => {
  const root = withTempStore(t);
  writeDataset(root, "oversized.json", " ".repeat(2_000_001));
  const store = loadCommunitySignalStore(root);
  assert.equal(store.datasets.length, 0);
  assert.equal(store.invalidDatasets.length, 1);
  assert.match(store.invalidDatasets[0].error, /file exceeds 2000000 bytes/);
});

test("newest dataset wins when the same signal ID exists in multiple valid files", (t) => {
  const root = withTempStore(t);
  const oldData = clone(gold);
  oldData.dataset.dataset_id = "old";
  oldData.dataset.generated_at = "2026-09-01T00:00:00Z";
  oldData.signals[0].claim.title.en = "OLD TITLE";
  const newData = clone(gold);
  newData.dataset.dataset_id = "new";
  newData.dataset.generated_at = "2026-09-15T00:00:00Z";
  newData.signals[0].claim.title.en = "NEW TITLE";
  writeDataset(root, "old.json", oldData);
  writeDataset(root, "new.json", newData);

  const result = searchCommunitySignals({ countryCode: "GBR", limit: 50 }, root);
  const target = result.signals.find((item) => item.signalId === gold.signals[0].signal_id);
  assert.ok(target);
  assert.equal(target.title.en, "NEW TITLE");
  assert.equal(target.datasetId, "new");
});

test("unknown dataset IDs fail closed", () => {
  assert.throws(
    () => getCommunitySignalDataset({ datasetId: "does-not-exist" }),
    /not found/
  );
});
