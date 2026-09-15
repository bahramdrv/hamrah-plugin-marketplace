import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCommunitySignalStore,
  searchCommunitySignals
} from "../community-signals.mjs";

test("all bundled community signal datasets conform to the validated v2 store contract", () => {
  const store = loadCommunitySignalStore();

  assert.equal(store.scanned, 3);
  assert.equal(store.invalidDatasets.length, 0);
  assert.equal(store.datasets.length, 3);
});

test("normalized Australia and Germany community signals are queryable", () => {
  const australia = searchCommunitySignals({ countryCode: "AUS" });
  const germany = searchCommunitySignals({ countryCode: "DEU" });

  assert.ok(australia.resultCount > 0);
  assert.ok(germany.resultCount > 0);
});
