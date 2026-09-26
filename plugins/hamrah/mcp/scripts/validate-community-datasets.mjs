#!/usr/bin/env node
import { SUPPORTED_SCHEMA_VERSIONS } from "../community-datasets.mjs";
import { loadCommunitySignalStore } from "../community-signals.mjs";
const store = loadCommunitySignalStore();
if (store.invalidDatasets.length) {
  console.error(JSON.stringify(store.invalidDatasets, null, 2));
  process.exit(1);
}
console.log(`VALID: ${store.datasets.length}/${store.scanned} bundled community datasets normalize and validate against a supported schema version (${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`);
