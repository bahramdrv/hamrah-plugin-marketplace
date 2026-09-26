import assert from "node:assert/strict";
import test from "node:test";

import { loadCommunitySignalStore, searchCommunitySignals } from "../community-signals.mjs";

test("all bundled community datasets pass their versioned contract and privacy gate", () => {
  const store = loadCommunitySignalStore();
  assert.ok(store.scanned > 0);
  assert.deepEqual(store.invalidDatasets, []);
  assert.equal(store.datasets.length + store.withdrawnDatasets.length, store.scanned);
  for (const { dataset, privacy } of store.datasets) {
    assert.ok(["2.0", "3.0.0", "4.0.0"].includes(dataset.schema_version));
    assert.equal(privacy.status, "pass");
    if (dataset.schema_version === "3.0.0") {
      for (const signal of dataset.signals) {
        assert.equal(Object.hasOwn(signal, "suggested_fit_adjustment"), false);
        assert.equal(Object.hasOwn(signal, "conditional_adjustment"), false);
      }
    }
  }
});

test("Australian and German signals remain queryable from the mixed store", () => {
  for (const countryCode of ["AUS", "DEU"]) {
    const result = searchCommunitySignals({ countryCode });
    assert.ok(result.resultCount > 0, countryCode);
    assert.equal(result.coverage.validDatasets + result.coverage.withdrawnDatasets.length, result.coverage.filesScanned);
    assert.ok(result.signals.every((signal) => signal.datasetId && signal.schemaVersion));
  }
});

test("every served signal resolves its evidence within its own dataset", () => {
  const store = loadCommunitySignalStore();
  for (const { datasetId, canonical } of store.datasets) {
    const evidenceIds = new Set(canonical.evidence.map((item) => item.id));
    for (const signal of canonical.signals) {
      for (const evidenceId of signal.evidence_ids) {
        assert.ok(evidenceIds.has(evidenceId), `${datasetId}: ${signal.id} references ${evidenceId}`);
      }
    }
  }
});
