import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEPLOYED_STORE_ROOT, isDeployedStore } from "../community-publication.mjs";
import { executeTool } from "../server.mjs";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const STORE_SIGNALS = fileURLToPath(new URL("../../skills/hamrah-signal-builder/scripts/store_signals.py", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const NOW = "2026-09-25T00:00:00Z";
const STABLE = (prefix) => new RegExp(`^${prefix}_[0-9a-f]{32}$`);

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-publish-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function run(directory, args, candidate) {
  const candidatePath = path.join(directory, `candidate-${Math.random().toString(36).slice(2)}.json`);
  if (candidate) writeFileSync(candidatePath, JSON.stringify(candidate));
  const argv = args.map((arg) => (arg === "$CANDIDATE" ? candidatePath : arg));
  const result = spawnSync(process.execPath, [PUBLISHER, ...argv], { encoding: "utf8" });
  return { ...result, report: result.status === 0 ? JSON.parse(result.stdout) : null };
}

const publish = (directory, storeRoot, candidate, now = NOW) =>
  run(directory, ["publish", "$CANDIDATE", "--store-root", storeRoot, "--label", "de-test", "--now", now], candidate);
const withdraw = (directory, storeRoot, target, now = NOW) =>
  run(directory, ["withdraw", "--store-root", storeRoot, ...target, "--reason", "privacy", "--note", "Found a direct identifier.", "--now", now]);

function datasetFiles(storeRoot) {
  const files = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(path.join(storeRoot, "datasets"));
  return files;
}

const search = (storeRoot, args = {}) =>
  executeTool("searchCommunitySignals", args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });
const getDataset = (storeRoot, args) =>
  executeTool("getCommunitySignalDataset", args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });

test("a vetted candidate is published with stable IDs and becomes searchable", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const published = publish(directory, storeRoot, V4);
  assert.equal(published.status, 0, published.stderr);
  const { report } = published;
  assert.equal(report.readerScans, false);
  assert.equal(report.datasetsDirectory, path.join(storeRoot, "datasets"));
  assert.equal(report.unchanged, false);
  assert.match(report.ids.signals["sig_gbr-gt-endorsement-delay"], STABLE("sig"));

  const signalId = report.ids.signals["sig_gbr-gt-endorsement-delay"];
  const searched = await search(storeRoot, { countryCode: "GBR", route: "global_talent" });
  assert.equal(searched.structuredContent.resultCount, 1);
  assert.equal(searched.structuredContent.signals[0].signalId, signalId);
  assert.equal(searched.structuredContent.signals[0].datasetId, report.datasetId);

  const fetched = await getDataset(storeRoot, { datasetId: report.datasetId });
  const dataset = fetched.structuredContent;
  assert.equal(dataset.generatedAt, NOW);
  assert.deepEqual(dataset.provenance, V4.provenance);
  for (const item of dataset.evidence) {
    assert.match(item.id, STABLE("evd"));
    assert.match(item.source_id, STABLE("src"));
    assert.deepEqual(item.validation, { status: "validated", privacy_status: "pass", validated_at: NOW });
  }
  const catalog = JSON.parse(readFileSync(path.join(storeRoot, "catalog.json"), "utf8"));
  assert.equal(catalog.datasets.length, 1);
  assert.equal(catalog.datasets[0].path, `datasets/${report.datasetId}.json`);
});

test("repeated and reworded imports keep the same identities", async (t) => {
  const directory = workspace(t);
  const first = publish(directory, path.join(directory, "a"), V4);
  assert.equal(first.status, 0, first.stderr);

  const reworded = structuredClone(V4);
  const rename = new Map([
    ...reworded.sources.map((item, index) => [item.id, `source-${index}`]),
    ...reworded.evidence.map((item, index) => [item.id, `ev-${index}`]),
    ...reworded.signals.map((item, index) => [item.id, `signal-${index}`])
  ]);
  for (const source of reworded.sources) source.id = rename.get(source.id);
  for (const item of reworded.evidence) {
    item.id = rename.get(item.id);
    item.source_id = rename.get(item.source_id);
    delete item.validation;
  }
  for (const signal of reworded.signals) {
    signal.id = rename.get(signal.id);
    signal.evidence_ids = signal.evidence_ids.map((id) => rename.get(id)).reverse();
    signal.destination.country_code = " gbr ";
    signal.title = `  ${signal.title}  `;
  }
  reworded.evidence.reverse();
  reworded.sources[1].source_url = "HTTPS://WWW.GOV.UK/global-talent#overview";
  reworded.evidence.find((item) => item.source_url)["source_url"] = "https://www.gov.uk/global-talent/";
  const second = publish(directory, path.join(directory, "b"), reworded, "2026-09-26T00:00:00Z");
  assert.equal(second.status, 0, second.stderr);

  const ids = (report) => ({
    signals: Object.values(report.ids.signals).sort(),
    evidence: Object.values(report.ids.evidence).sort(),
    sources: Object.values(report.ids.sources).sort()
  });
  assert.deepEqual(ids(second.report), ids(first.report));

  const storeRoot = path.join(directory, "a");
  const repeated = publish(directory, storeRoot, V4, "2026-09-27T00:00:00Z");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(repeated.report.unchanged, true);
  assert.equal(repeated.report.datasetId, first.report.datasetId);
  assert.equal(datasetFiles(storeRoot).length, 1);

  const updated = structuredClone(V4);
  updated.signals[0].lifecycle.last_seen = "2026-09-20";
  updated.signals[0].lifecycle.last_verified = "2026-09-20";
  const revised = publish(directory, storeRoot, updated, "2026-09-28T00:00:00Z");
  assert.equal(revised.status, 0, revised.stderr);
  assert.equal(revised.report.unchanged, false);
  assert.deepEqual(revised.report.ids.signals, first.report.ids.signals);
  assert.equal(datasetFiles(storeRoot).length, 2, "the earlier snapshot is kept as history");
  const searched = await search(storeRoot, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.resultCount, 1);
  assert.equal(searched.structuredContent.signals[0].lastSeen, "2026-09-20");
});

test("identical duplicate candidates merge while conflicting duplicates are refused", (t) => {
  const directory = workspace(t);
  const duplicated = structuredClone(V4);
  duplicated.evidence.push({ ...structuredClone(duplicated.evidence[0]), id: "evd_copy" });
  duplicated.signals[0].evidence_ids.push("evd_copy");
  const merged = publish(directory, path.join(directory, "merged"), duplicated);
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(merged.report.merged.evidence, 1);
  assert.equal(new Set(Object.values(merged.report.ids.evidence)).size, 4);

  const conflicting = structuredClone(duplicated);
  conflicting.evidence.at(-1).evidence_summary = "A different account of the same message.";
  const refused = publish(directory, path.join(directory, "conflict"), conflicting);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /\[deduplication\] .*conflicting duplicate/);

  const reusedKey = structuredClone(V4);
  reusedKey.evidence[1].id = reusedKey.evidence[0].id;
  const keyed = publish(directory, path.join(directory, "keys"), reusedKey);
  assert.notEqual(keyed.status, 0);
  assert.match(keyed.stderr, /\[deduplication\] .*duplicate candidate key/);
});

test("every publication gate refuses unsafe candidates and writes nothing", (t) => {
  const directory = workspace(t);
  const cases = [
    ["privacy", (d) => { d.evidence[0].evidence_summary = "Contact the applicant at jane@example.com"; }, /email/],
    ["privacy", (d) => { d.evidence[0].validation.privacy_status = "needs_review"; }, /needs_review/],
    ["provenance", (d) => { d.evidence[0].retrieved_at = "2026-02-30T00:00:00Z"; }, /retrieved_at is not a valid ISO date-time/],
    ["provenance", (d) => { d.evidence[0].source_url = "https://example.org/thread/1"; }, /private source must not carry a source_url/],
    ["evidence", (d) => { d.signals[0].evidence_ids.push("evd_missing"); }, /unknown evidence evd_missing/],
    ["evidence", (d) => { d.signals[0].evidence_ids = []; }, /has no evidence/],
    ["contradiction", (d) => {
      for (const item of d.evidence) item.supports_or_contradicts = "contradicts";
    }, /no supporting evidence/],
    ["contradiction", (d) => { d.evidence[1].supports_or_contradicts = "contradicts"; }, /high confidence with contradicting evidence/],
    ["contradiction", (d) => d.route_claims.push({
      id: "clm_overlap", country_code: "GBR", routes: ["global_talent"], claim_type: "processing_time", process_stage: null,
      statement_en: "Endorsement takes longer than published.", evidence_ids: [d.evidence[0].id],
      opposing_evidence_ids: [d.evidence[0].id], lifecycle: structuredClone(d.signals[0].lifecycle)
    }), /both supports and opposes/],
    ["schema", (d) => { d.signals[0].lifecycle.status = "resolved"; }, /adjustment must be 0/],
    ["schema", (d) => { delete d.signals[0].title; }, /title/]
  ];
  for (const [gate, mutate, reason] of cases) {
    const candidate = structuredClone(V4);
    mutate(candidate);
    const storeRoot = path.join(directory, `store-${Math.random().toString(36).slice(2)}`);
    const result = publish(directory, storeRoot, candidate);
    assert.notEqual(result.status, 0, `${gate}: ${reason}`);
    assert.match(result.stderr, new RegExp(`\\[${gate}\\] `), `${gate}: ${result.stderr}`);
    assert.match(result.stderr, reason, gate);
    assert.equal(datasetFiles(storeRoot).length, 0, gate);
    assert.equal(existsSync(path.join(storeRoot, "catalog.json")), false, gate);
  }
});

test("the destination is explicit and compared with the deployed reader", (t) => {
  const directory = workspace(t);
  const missing = run(directory, ["publish", "$CANDIDATE", "--now", NOW], V4);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--store-root is required/);
  assert.equal(isDeployedStore(DEPLOYED_STORE_ROOT), true);
  assert.equal(isDeployedStore(path.join(DEPLOYED_STORE_ROOT, "..", "community-signals")), true);
  assert.equal(isDeployedStore(directory), false);
  assert.match(DEPLOYED_STORE_ROOT, /plugins[\\/]hamrah[\\/]data[\\/]community-signals$/);

  const legacy = path.join(directory, "legacy.json");
  writeFileSync(legacy, JSON.stringify(V4));
  const refused = spawnSync("python3", [STORE_SIGNALS, legacy, "--store-root", path.join(directory, "legacy-store")], { encoding: "utf8" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /community-publication\.mjs publish/);
});

test("withdrawal keeps published history but removes unsafe artifacts from current results", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const { report } = publish(directory, storeRoot, V4);
  const signalId = report.ids.signals["sig_gbr-gt-endorsement-delay"];
  const evidenceId = report.ids.evidence["evd_gt-endorsement-delay-1"];
  const datasetPath = path.join(storeRoot, "datasets", `${report.datasetId}.json`);
  const before = readFileSync(datasetPath, "utf8");

  const withdrawnEvidence = withdraw(directory, storeRoot, ["--artifact", evidenceId]);
  assert.equal(withdrawnEvidence.status, 0, withdrawnEvidence.stderr);
  let searched = await search(storeRoot, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.resultCount, 1);
  assert.equal(searched.structuredContent.signals[0].evidenceIds.includes(evidenceId), false);
  let fetched = await getDataset(storeRoot, { datasetId: report.datasetId });
  assert.equal(fetched.structuredContent.evidence.some((item) => item.id === evidenceId), false);
  assert.deepEqual(fetched.structuredContent.withdrawnArtifactIds, [evidenceId]);

  const again = withdraw(directory, storeRoot, ["--artifact", evidenceId], "2026-09-26T00:00:00Z");
  assert.equal(again.status, 0, again.stderr);
  const withdrawnSignal = withdraw(directory, storeRoot, ["--artifact", signalId]);
  assert.equal(withdrawnSignal.status, 0, withdrawnSignal.stderr);
  searched = await search(storeRoot, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.resultCount, 0);
  fetched = await getDataset(storeRoot, { datasetId: report.datasetId, signalIds: [signalId] });
  assert.deepEqual(fetched.structuredContent.canonicalSignals, []);
  assert.deepEqual(fetched.structuredContent.signals, []);
  assert.deepEqual(fetched.structuredContent.missingSignalIds, [signalId]);

  const unknown = withdraw(directory, storeRoot, ["--artifact", "sig_not_published"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /not found in the store/);

  const ledger = JSON.parse(readFileSync(path.join(storeRoot, "withdrawals.json"), "utf8"));
  assert.deepEqual(ledger.withdrawals.map((item) => item.artifact_id), [evidenceId, signalId]);
  assert.equal(ledger.withdrawals[0].reason, "privacy");
  assert.equal(ledger.withdrawals[0].withdrawn_at, NOW);
  assert.equal(readFileSync(datasetPath, "utf8"), before, "the published snapshot is never rewritten");

  const wholeDataset = withdraw(directory, storeRoot, ["--dataset", report.datasetId]);
  assert.equal(wholeDataset.status, 0, wholeDataset.stderr);
  searched = await search(storeRoot);
  assert.deepEqual(searched.structuredContent.coverage.withdrawnDatasets, [report.datasetId]);
  assert.equal(searched.structuredContent.coverage.validDatasets, 0);
  fetched = await getDataset(storeRoot, { datasetId: report.datasetId });
  assert.equal(fetched.isError, true);
});

test("a malformed withdrawal ledger fails closed instead of re-exposing withdrawn artifacts", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  publish(directory, storeRoot, V4);
  writeFileSync(path.join(storeRoot, "withdrawals.json"), "{not json");
  const searched = await search(storeRoot);
  assert.equal(searched.isError, true);
  assert.equal(searched.structuredContent.error, "community_signal_store_failed");
  assert.match(searched.structuredContent.message, /withdrawal ledger/);
});

test("a newer snapshot that supersedes a Signal hides the older current copy", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const first = publish(directory, storeRoot, V4);
  const oldId = first.report.ids.signals["sig_gbr-gt-endorsement-delay"];

  const successor = structuredClone(V4.signals[0]);
  successor.id = "sig_successor";
  successor.root_cause_id = "gbr-gt-endorsement-delay-2027";
  successor.title = "Endorsement delays after the 2027 process change";
  const next = structuredClone(V4);
  next.signals[0].lifecycle = { ...next.signals[0].lifecycle, status: "superseded", superseded_by: "sig_successor" };
  next.signals[0].suggested_fit_adjustment = 0;
  next.signals.push(successor);
  const second = publish(directory, storeRoot, next, "2026-09-26T00:00:00Z");
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.report.ids.signals["sig_gbr-gt-endorsement-delay"], oldId);

  const searched = await search(storeRoot, { countryCode: "GBR" });
  assert.deepEqual(searched.structuredContent.signals.map((signal) => signal.signalId), [second.report.ids.signals.sig_successor]);
  const history = await search(storeRoot, { countryCode: "GBR", statuses: ["active", "historical"] });
  assert.equal(history.structuredContent.signals.some((signal) => signal.signalId === oldId), false);
});

test("withdrawn version 2 evidence is removed from original-form signals too", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const v2 = JSON.parse(readFileSync(new URL("../../skills/hamrah-signal-builder/examples/gold_standard.json", import.meta.url), "utf8"));
  const datasetsRoot = path.join(storeRoot, "datasets");
  mkdirSync(datasetsRoot, { recursive: true });
  writeFileSync(path.join(datasetsRoot, "legacy.json"), JSON.stringify(v2));
  const withdrawn = withdraw(directory, storeRoot, ["--artifact", "EX-ACTIVE-1"]);
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  const fetched = await getDataset(storeRoot, { datasetId: "legacy" });
  const embedded = fetched.structuredContent.signals.flatMap((signal) => signal.evidence.map((item) => item.evidence_id));
  assert.equal(embedded.includes("EX-ACTIVE-1"), false);
  assert.ok(embedded.includes("EX-ACTIVE-2"));
});

test("re-publishing earlier content after a newer snapshot restores it", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  assert.equal(publish(directory, storeRoot, V4).status, 0);
  const changed = structuredClone(V4);
  changed.signals[0].lifecycle.last_seen = "2026-09-20";
  assert.equal(publish(directory, storeRoot, changed, "2026-09-26T00:00:00Z").status, 0);
  const reverted = publish(directory, storeRoot, V4, "2026-09-27T00:00:00Z");
  assert.equal(reverted.status, 0, reverted.stderr);
  assert.equal(reverted.report.unchanged, false);
  assert.equal(datasetFiles(storeRoot).length, 3);
  const searched = await search(storeRoot, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.signals[0].lastSeen, V4.signals[0].lifecycle.last_seen);
});
