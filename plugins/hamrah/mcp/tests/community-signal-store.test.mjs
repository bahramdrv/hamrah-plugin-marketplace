import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommunitySignalDataset,
  loadCommunitySignalStore,
  searchCommunitySignals
} from "../community-signals.mjs";

test("all bundled community signal datasets conform to the v3 store contract", () => {
  const store = loadCommunitySignalStore();

  assert.ok(store.scanned > 0, "at least one bundled community dataset must be present");
  assert.equal(store.invalidDatasets.length, 0);
  assert.equal(store.datasets.length, store.scanned);
  for (const { dataset } of store.datasets) {
    assert.equal(dataset.schema_version, "3.0.0");
    assert.ok(Array.isArray(dataset.sources));
    assert.ok(Array.isArray(dataset.evidence));
    assert.ok(Array.isArray(dataset.signals));
    assert.equal(dataset.quality?.checks?.privacy?.status, "pass");
    for (const signal of dataset.signals) {
      assert.equal(Object.hasOwn(signal, "suggested_fit_adjustment"), false);
      assert.equal(Object.hasOwn(signal, "conditional_adjustment"), false);
      assert.ok(signal.assessment?.lifecycle);
      assert.ok(signal.assessment?.evidence_maturity);
      assert.ok(signal.review?.status);
    }
  }
});

test("Australia and Germany signals are queryable without stored scoring adjustments", () => {
  const australia = searchCommunitySignals({ countryCode: "AUS" });
  const germany = searchCommunitySignals({ countryCode: "DEU" });

  assert.ok(australia.resultCount > 0);
  assert.ok(germany.resultCount > 0);
  for (const result of [...australia.signals, ...germany.signals]) {
    assert.ok(result.assessment?.lifecycle);
    assert.equal(Object.hasOwn(result, "suggestedFitAdjustment"), false);
    assert.equal(Object.hasOwn(result, "conditionalAdjustment"), false);
  }
});

test("every signal evidence link resolves to top-level evidence", () => {
  const searched = searchCommunitySignals({ countryCode: "DEU", limit: 1 });
  assert.equal(searched.resultCount, 1);
  const full = getCommunitySignalDataset({ datasetId: searched.signals[0].datasetId });
  const evidenceIds = new Set(full.evidence.map((item) => item.evidence_id));

  for (const signal of full.signals) {
    for (const link of signal.evidence_links) {
      assert.ok(evidenceIds.has(link.evidence_id), `${link.evidence_id} must resolve`);
      assert.ok(["supports", "contradicts", "resolves", "context"].includes(link.relation));
    }
  }
});
