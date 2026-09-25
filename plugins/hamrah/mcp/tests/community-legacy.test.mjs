import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const EQUIVALENT = { "2.0": fixture("equivalent_v2.json"), "3.0.0": fixture("equivalent_v3.json"), "4.0.0": V4 };
const INSTALLED_V3 = fixture("installed_v3_gold_standard.json");
const STORE_SIGNALS = fileURLToPath(new URL("../../skills/hamrah-signal-builder/scripts/store_signals.py", import.meta.url));
const SIGNAL_ID = "sig_gbr-gt-endorsement-delay";

function store(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, dataset] of Object.entries(files)) writeFileSync(path.join(root, `${name}.json`), JSON.stringify(dataset));
  return root;
}

const search = (signalStoreRoot, args = {}) =>
  executeTool("searchCommunitySignals", args, globalThis.fetch, { signalStoreRoot });
const getDataset = (signalStoreRoot, args) =>
  executeTool("getCommunitySignalDataset", args, globalThis.fetch, { signalStoreRoot });

const CORE_FIELDS = [
  "signalId", "title", "status", "trend", "severity", "confidence", "destination", "applicantScope",
  "migrationRoutes", "migrationRouteFamily", "processStages", "entities", "summaryEn", "summaryFa",
  "practicalImpact", "whoShouldCare", "recommendedAction", "knownWorkaround", "lastVerified", "suggestedRecheckDate"
];

test("the same Signal in version 2, 3, and 4 datasets is retrieved equivalently", async (t) => {
  const results = {};
  for (const [version, dataset] of Object.entries(EQUIVALENT)) {
    const root = store(t, { dataset });
    const searched = await search(root, { countryCode: "GBR", route: "global_talent" });
    assert.equal(searched.structuredContent.coverage.validDatasets, 1, `${version}: ${JSON.stringify(searched.structuredContent.coverage)}`);
    assert.equal(searched.structuredContent.resultCount, 1, version);
    const signal = searched.structuredContent.signals[0];
    assert.equal(signal.schemaVersion, version);
    const fetched = await getDataset(root, { datasetId: "dataset", signalIds: [SIGNAL_ID] });
    assert.equal(fetched.isError, false, version);
    results[version] = { signal, dataset: fetched.structuredContent };
  }

  const core = (signal) => Object.fromEntries(CORE_FIELDS.map((field) => [field, signal[field]]));
  assert.deepEqual(core(results["2.0"].signal), core(results["4.0.0"].signal));
  assert.deepEqual(core(results["3.0.0"].signal), core(results["4.0.0"].signal));
  for (const version of Object.keys(EQUIVALENT)) {
    const { signal, dataset } = results[version];
    assert.deepEqual([...signal.evidenceIds].sort(), [...V4.signals[0].evidence_ids].sort(), version);
    assert.equal(dataset.schemaVersion, version);
    assert.deepEqual(dataset.canonicalSignals.map((item) => item.id), [SIGNAL_ID], version);
    assert.equal(dataset.canonicalSignals[0].source_schema_version, version);
    assert.deepEqual(dataset.evidence.map((item) => item.id).sort(), [...V4.signals[0].evidence_ids].sort(), version);
    for (const item of dataset.evidence) assert.equal(item.source_schema_version, version);
  }

  assert.equal(results["2.0"].signal.suggestedFitAdjustment, -10);
  assert.equal(results["4.0.0"].signal.suggestedFitAdjustment, -10);
  assert.equal(results["3.0.0"].signal.suggestedFitAdjustment, null, "version 3 has no adjustment; none is fabricated");
  assert.equal(results["3.0.0"].signal.conditionalAdjustment, null);

  const v2Evidence = results["2.0"].dataset.evidence[0];
  assert.equal(v2Evidence.content_hash, null);
  assert.equal(v2Evidence.retrieved_at, null);
  assert.equal(v2Evidence.source_id, null);
  assert.equal(v2Evidence.authority, "unknown");
  assert.equal(v2Evidence.source_name, "Example UK immigration community");
  const v3Evidence = results["3.0.0"].dataset.evidence.find((item) => item.id === "evd_gt-official-baseline-timing");
  assert.equal(v3Evidence.retrieved_at, "2026-09-11T00:00:00Z");
  assert.deepEqual(v3Evidence.locator, { type: "url", value: "https://www.gov.uk/global-talent" });
  assert.equal(v3Evidence.content_hash, null);
  assert.equal(results["3.0.0"].dataset.canonicalSignals[0].lifecycle.first_seen, null);
  assert.equal(results["3.0.0"].dataset.canonicalSignals[0].localized.summary.fa, V4.signals[0].summary_fa);

  assert.equal(results["2.0"].dataset.signals[0].signal_id, SIGNAL_ID);
  assert.equal(results["3.0.0"].dataset.signals[0].scope.destination.country_code, "GBR");
  assert.equal(results["4.0.0"].dataset.signals[0].id, SIGNAL_ID);
});

test("the installed version 3 example is searchable with its provenance preserved", async (t) => {
  const root = store(t, { installed: INSTALLED_V3 });
  const searched = await search(root, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.coverage.validDatasets, 1, JSON.stringify(searched.structuredContent.coverage));
  const signal = searched.structuredContent.signals.find((item) => item.signalId === "GBR-GT-R4-ENDORSEMENT-DELAY-EXAMPLE");
  assert.equal(signal.schemaVersion, "3.0.0");
  assert.equal(signal.status, "active");
  assert.equal(signal.title, "Repeated peer-review endorsement delays");
  assert.deepEqual(signal.evidenceIds, ["EX-1", "EX-2"]);

  const fetched = await getDataset(root, { datasetId: "installed" });
  const evidence = fetched.structuredContent.evidence.find((item) => item.id === "EX-1");
  assert.deepEqual(evidence.locator, { type: "message_id", value: "101" });
  assert.equal(evidence.source_id, "example-community");
  assert.equal(evidence.published_at, "2026-08-01");
  assert.equal(evidence.retrieved_at, "2026-09-11T00:00:00Z");
  assert.equal(evidence.direct_or_second_hand, "direct");
  assert.equal(evidence.evidence_summary_fa, "متقاضی از طولانی شدن زمان اندورسمنت گزارش داد.");
  assert.equal(fetched.structuredContent.sources[0].id, "example-community");
  assert.deepEqual(fetched.structuredContent.provenance, {
    dataset_id: "gold-standard-uk", producer: "hamrah-signal-builder", producer_version: "3.0", method: null, collected_at: null
  });
  assert.equal(fetched.structuredContent.sourceCoverage[0].coverage_complete, true);
});

test("every supported version is read together and invalid or unsupported files are reported separately", async (t) => {
  const offContract = structuredClone(EQUIVALENT["3.0.0"]);
  offContract.signals[0].first_seen = "2026-05-01";
  offContract.evidence[0].locator.type = "telegram_message";
  const unsupported = { schema_version: "1.0.0", signals: [] };
  const brokenV2 = structuredClone(EQUIVALENT["2.0"]);
  brokenV2.summary.total_signals = 7;
  const root = store(t, {
    v2: EQUIVALENT["2.0"], installed_v3: INSTALLED_V3, v4: V4,
    off_contract_v3: offContract, unsupported, broken_v2: brokenV2
  });

  const searched = await search(root, { countryCode: "GBR" });
  const { coverage } = searched.structuredContent;
  assert.equal(coverage.filesScanned, 6);
  assert.equal(coverage.validDatasets, 3);
  const invalid = Object.fromEntries(coverage.invalidDatasets.map((item) => [item.datasetId, item]));
  assert.deepEqual(Object.keys(invalid).sort(), ["broken_v2", "off_contract_v3", "unsupported"]);
  assert.equal(invalid.off_contract_v3.schemaVersion, "3.0.0");
  assert.match(invalid.off_contract_v3.error, /first_seen/);
  assert.match(invalid.off_contract_v3.error, /locator\/type/);
  assert.match(invalid.unsupported.error, /unsupported schema_version "1\.0\.0"/);
  assert.match(invalid.broken_v2.error, /total_signals/);

  const versions = new Set(searched.structuredContent.signals.map((signal) => signal.schemaVersion));
  assert.deepEqual([...versions].sort(), ["2.0", "3.0.0"], "the same signal ID keeps only the newest copy");
  const ids = searched.structuredContent.signals.map((signal) => signal.signalId);
  assert.equal(new Set(ids).size, ids.length);
});

test("version 3 datasets need resolvable references and inspected privacy, not a declared flag", async (t) => {
  const cases = {
    missing_evidence: (d) => { d.signals[0].evidence_links[0].evidence_id = "evd_missing"; },
    missing_source: (d) => { d.evidence[0].source_id = "src_missing"; },
    duplicate_evidence: (d) => { d.evidence[1].evidence_id = d.evidence[0].evidence_id; },
    declared_privacy_fail: (d) => { d.quality.checks.privacy.status = "fail"; },
    email_in_summary: (d) => { d.evidence[0].summary.en = "Contact jane@example.com for details"; },
    persian_name: (d) => { d.evidence[0].summary.fa = "علی رضایی پرونده را ثبت کرد"; },
    invalid_generated_at: (d) => { d.dataset.generated_at = "2026-02-30T00:00:00Z"; },
    contact_locator: (d) => { d.evidence[3].locator.value = "https://example.org/thread?user=private"; },
    profile_locator: (d) => { d.evidence[3].locator.value = "https://example.org/users/john-smith"; }
  };
  const files = {};
  for (const [name, mutate] of Object.entries(cases)) {
    const dataset = structuredClone(EQUIVALENT["3.0.0"]);
    mutate(dataset);
    files[name] = dataset;
  }
  const searched = await search(store(t, files));
  assert.equal(searched.structuredContent.resultCount, 0);
  const invalid = Object.fromEntries(searched.structuredContent.coverage.invalidDatasets.map((item) => [item.datasetId, item.error]));
  assert.match(invalid.missing_evidence, /unknown evidence evd_missing/);
  assert.match(invalid.missing_source, /unknown source src_missing/);
  assert.match(invalid.duplicate_evidence, /duplicate evidence_id/);
  assert.match(invalid.declared_privacy_fail, /quality\.checks\.privacy/);
  assert.match(invalid.email_in_summary, /privacy fail/);
  assert.match(invalid.persian_name, /privacy needs_review/);
  assert.match(invalid.invalid_generated_at, /generated_at is not a valid ISO date-time/);
  assert.match(invalid.contact_locator, /privacy fail: evidence\[3\]\.locator\.value \(embedded_contact_locator\)/);
  assert.match(invalid.profile_locator, /privacy needs_review: evidence\[3\]\.locator\.value \(possible_full_name_locator\)/);
});

test("a version 3 dataset can be published and then searched", async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-v3-publish-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const candidate = path.join(directory, "candidate.json");
  writeFileSync(candidate, JSON.stringify(INSTALLED_V3));
  const storeRoot = path.join(directory, "store");
  const published = spawnSync("python3", [STORE_SIGNALS, candidate, "--store-root", storeRoot, "--label", "v3"], { encoding: "utf8" });
  assert.equal(published.status, 0, published.stderr);
  const catalog = JSON.parse(readFileSync(path.join(storeRoot, "catalog.json"), "utf8"));
  assert.deepEqual(catalog.datasets[0].countries, ["GBR"]);
  assert.deepEqual(catalog.datasets[0].routes, ["global_talent", "skilled_worker"]);

  const searched = await search(path.join(storeRoot, "datasets"), { route: "global_talent" });
  assert.ok(searched.structuredContent.resultCount > 0);

  const offContract = structuredClone(INSTALLED_V3);
  offContract.signals[0].first_seen = "2026-05-01";
  writeFileSync(candidate, JSON.stringify(offContract));
  const rejected = spawnSync("python3", [STORE_SIGNALS, candidate, "--store-root", storeRoot, "--label", "bad"], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /first_seen/);
});
