import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readCommunityDataset } from "../community-datasets.mjs";
import { executeTool } from "../server.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const CANDIDATE_EXPORT = fixture("legacy_candidate_export.json");
// A version 3 export carrying the legacy qualityControl block and per-evidence redaction flags, as the
// published legacy snapshots do.
const LEGACY_V3 = { ...fixture("equivalent_v3.json"), qualityControl: { personal_identifiers_removed: true } };

test("a free-text redaction note does not declare a privacy pass; the inspected result decides", () => {
  const result = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate");
  assert.deepEqual(result.errors, []);
  assert.equal(result.privacy.status, "pass");
  assert.equal(result.canonical.qualityControl.checks.privacy.status, "unknown");
});

test("a legacy export without a privacy declaration is still rejected when inspection finds an identifier", () => {
  const exported = structuredClone(CANDIDATE_EXPORT);
  exported.signals[0].evidence[0].claim = "Contact jane@example.com for an appointment slot.";
  const result = readCommunityDataset(exported, "candidate");
  assert.equal(result.canonical, null);
  assert.equal(result.privacy.status, "fail");
});

test("legacy evidence is marked redacted only where the source flagged that record", () => {
  const result = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate");
  assert.deepEqual([...new Set(result.canonical.evidence.map((item) => item.privacy_redacted))], [null]);

  const flagged = readCommunityDataset(structuredClone(LEGACY_V3), "legacy");
  assert.deepEqual([...new Set(flagged.canonical.evidence.map((item) => item.privacy_redacted))], [true]);
});

test("legacy evidence maturity is carried over only when the source stated it", () => {
  const exported = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate");
  assert.deepEqual(exported.canonical.signals.map((signal) => [signal.confidence, signal.evidence_maturity]), [["high", null], ["high", null]]);

  const established = structuredClone(LEGACY_V3);
  established.signals[0].assessment.evidence_maturity = "established";
  const fromLabel = readCommunityDataset(established, "legacy");
  assert.deepEqual(fromLabel.errors, []);
  assert.equal(fromLabel.canonical.signals[0].confidence, "high");
  assert.equal(fromLabel.canonical.signals[0].evidence_maturity, null);

  const stated = structuredClone(LEGACY_V3);
  stated.signals[0].assessment.evidence_maturity = "emerging";
  assert.equal(readCommunityDataset(stated, "legacy").canonical.signals[0].evidence_maturity, "emerging");
});

test("legacy community corroboration is not inferred from confidence", () => {
  const exported = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate");
  assert.deepEqual(exported.canonical.signals.map((signal) => signal.community_confirmed), [null, null]);
  assert.deepEqual(exported.canonical.signals.map((signal) => signal.officially_confirmed), [null, null]);
});

test("a legacy signal without a source ID gets a deterministic ID that its evidence refers to", async (t) => {
  const first = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate").canonical;
  const second = readCommunityDataset(structuredClone(CANDIDATE_EXPORT), "candidate").canonical;
  assert.deepEqual(second.signals.map((signal) => signal.id), first.signals.map((signal) => signal.id));
  assert.deepEqual(second.evidence.map((item) => item.id), first.evidence.map((item) => item.id));
  const unnamed = first.signals[1];
  assert.notEqual(unnamed.id, first.signals[0].id);

  const root = mkdtempSync(path.join(tmpdir(), "hamrah-legacy-export-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "candidate.json"), JSON.stringify(CANDIDATE_EXPORT));
  const offline = async () => { throw new Error("network access is not expected"); };
  const fetched = await executeTool("getCommunitySignalDataset", { datasetId: "candidate", signalIds: [unnamed.id] }, offline, { signalStoreRoot: root });
  assert.equal(fetched.isError, false);
  const { canonicalSignals, evidence, missingSignalIds } = fetched.structuredContent;
  assert.deepEqual(missingSignalIds, []);
  assert.deepEqual(canonicalSignals.map((signal) => signal.id), [unnamed.id]);
  assert.equal(evidence.length, 1);
  assert.deepEqual(canonicalSignals[0].evidence_ids, [evidence[0].id]);
  assert.ok(evidence[0].id.startsWith(`${unnamed.id}-`), `${evidence[0].id} is named after ${unnamed.id}`);
});

test("an explicit privacy fail in a legacy export stays a fail despite redaction notes and flags", () => {
  const legacy = structuredClone(LEGACY_V3);
  legacy.quality.checks.privacy = { status: "fail", note: "Personal names were omitted from evidence summaries." };
  const result = readCommunityDataset(legacy, "legacy");
  assert.equal(result.canonical, null);
  assert.match(result.errors.join("; "), /quality\.checks\.privacy is fail/);
});
