import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { executeTool } from "../server.mjs";

const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const V2 = JSON.parse(readFileSync(new URL("./fixtures/equivalent_v2.json", import.meta.url), "utf8"));
const VALIDATED = { status: "validated", privacy_status: "pass", validated_at: "2026-09-11T00:00:00Z" };
const COPIED = "Applicant reported waiting well beyond the usual endorsement window.";

const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const source = (id, family) => ({ id, source_name: `${family} community`, source_family: family, public: false, source_url: null, validation: VALIDATED });
function evidence(id, sourceId, summary, { stance = "supports", group = id, date = "2026-08-01", supersedes = null, copyRisk = "low" } = {}) {
  return {
    id, source_id: sourceId, source_url: null, retrieved_at: "2026-09-11T00:00:00Z", published_at: null, event_date: date,
    content_hash: hash(summary), source_type: "first_hand_applicant_experience", authority: "unknown",
    direct_or_second_hand: "direct", supports_or_contradicts: stance, independence_group: group, copy_risk: copyRisk,
    evidence_summary: summary, supersedes, validation: VALIDATED
  };
}
function signal(id, evidenceIds, { status = "active", confidence = "medium" } = {}) {
  const base = structuredClone(V4.signals[0]);
  return {
    ...base, id, root_cause_id: id, confidence, evidence_ids: evidenceIds,
    suggested_fit_adjustment: status === "active" ? base.suggested_fit_adjustment : 0,
    lifecycle: { ...base.lifecycle, status }
  };
}
const dataset = (sources, evidenceItems, signals) => ({ ...structuredClone(V4), sources, evidence: evidenceItems, signals });

function buildStore(t) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-aggregate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    // Community A: an original report, an independent report, a contradicting report, and a report it later replaced.
    "a-community": dataset([source("src_a-com", "community-a")], [
      evidence("evd_a-01", "src_a-com", COPIED),
      evidence("evd_a-02", "src_a-com", "A second applicant waited about four months for peer review.", { date: "2026-08-20", supersedes: "evd_a-06" }),
      evidence("evd_a-03", "src_a-com", "One applicant received endorsement within the published window.", { stance: "contradicts", date: "2026-08-25" }),
      evidence("evd_a-06", "src_a-com", "Early draft of the second applicant's report.", { date: "2026-08-10" })
    ], [signal("sig_a-com", ["evd_a-01", "evd_a-02", "evd_a-03", "evd_a-06"])]),
    // Community B cross-posts A's report and adds two posts from one person.
    "b-community": dataset([source("src_b-com", "community-b")], [
      evidence("evd_b-01", "src_b-com", COPIED, { copyRisk: "high" }),
      evidence("evd_b-02", "src_b-com", "Endorsement took nineteen weeks in this member's case.", { group: "member-7", date: "2026-09-01" }),
      evidence("evd_b-03", "src_b-com", "The same member followed up that the decision finally arrived.", { group: "member-7", date: "2026-09-03" })
    ], [signal("sig_b-com", ["evd_b-01", "evd_b-02", "evd_b-03"])]),
    // Community D holds only a historical signal.
    "d-history": dataset([source("src_d-com", "community-d")], [
      evidence("evd_d-01", "src_d-com", "Endorsement delays in 2025 were caused by a system migration.", { date: "2025-06-01" })
    ], [signal("sig_d-com", ["evd_d-01"], { status: "historical" })])
  };
  const legacy = structuredClone(V2);
  legacy.signals[0].signal_id = "GBR-GT-LEGACY";
  legacy.signals[0].evidence = [{ ...legacy.signals[0].evidence[0], evidence_id: "EX-1", evidence_summary: COPIED, source_name: "Legacy community" }];
  legacy.signals[0].evidence_count = 1;
  legacy.signals[0].independent_report_count = 1;
  files["c-legacy"] = legacy;
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, `${name}.json`), JSON.stringify(content));
  return root;
}

const search = (signalStoreRoot, args) => executeTool("searchCommunitySignals", args, globalThis.fetch, { signalStoreRoot });

test("copies across datasets count once while contradictory records are retained", async (t) => {
  const root = buildStore(t);
  const searched = await search(root, { countryCode: "GBR", route: "global_talent" });
  assert.equal(searched.isError, false);
  const { evidenceAggregation: aggregation } = searched.structuredContent;
  assert.deepEqual(searched.structuredContent.coverage.invalidDatasets, []);

  const copied = aggregation.clusters.find((cluster) => cluster.members.some((member) => member.evidenceId === "evd_a-01"));
  assert.deepEqual(copied.members.map((member) => `${member.datasetId}/${member.evidenceId}`).sort(),
    ["a-community/evd_a-01", "b-community/evd_b-01", "c-legacy/EX-1"]);
  assert.equal(copied.crossPosted, true);
  assert.deepEqual(copied.sourceFamilies, ["community-a", "community-b"]);
  assert.equal(copied.copyRisk, "high");
  assert.deepEqual(copied.signalIds, ["GBR-GT-LEGACY", "sig_a-com", "sig_b-com"]);
  assert.equal(copied.status, "current");

  const member7 = aggregation.clusters.filter((cluster) => cluster.members.some((member) => ["evd_b-02", "evd_b-03"].includes(member.evidenceId)));
  assert.equal(member7.length, 2, "separate posts stay separate clusters");
  assert.equal(member7[0].independenceGroupId, member7[1].independenceGroupId, "but share one independence group");

  assert.deepEqual(aggregation.currentSupport, {
    evidenceRecords: 7,
    clusters: 5,
    independentSupporting: 3,
    independentOpposing: 1,
    independentResolving: 0,
    timeWindow: { earliest: "2026-08-01", latest: "2026-09-03" }
  });

  const contradiction = aggregation.clusters.find((cluster) => cluster.members.some((member) => member.evidenceId === "evd_a-03"));
  assert.equal(contradiction.relation, "contradicts");
  assert.equal(contradiction.status, "current");
  assert.equal(contradiction.representative.summaryEn, "One applicant received endorsement within the published window.");

  const signalA = searched.structuredContent.signals.find((item) => item.signalId === "sig_a-com");
  assert.deepEqual(signalA.evidenceSupport, { supportingGroups: 2, opposingGroups: 1, resolvingGroups: 0, historicalRecords: 1 });
  const signalB = searched.structuredContent.signals.find((item) => item.signalId === "sig_b-com");
  assert.deepEqual(signalB.evidenceSupport, { supportingGroups: 2, opposingGroups: 0, resolvingGroups: 0, historicalRecords: 0 });
});

test("historical, stale, and superseded records stay auditable without counting as current support", async (t) => {
  const root = buildStore(t);
  const searched = await search(root, { countryCode: "GBR", route: "global_talent" });
  const { evidenceAggregation: aggregation, signals } = searched.structuredContent;
  assert.equal(signals.some((item) => item.signalId === "sig_d-com"), false);

  const historical = aggregation.clusters.filter((cluster) => cluster.status === "historical");
  const reasons = Object.fromEntries(historical.map((cluster) => [cluster.members[0].evidenceId, cluster.historicalReason]));
  assert.match(reasons["evd_d-01"], /historical/);
  assert.match(reasons["evd_a-06"], /superseded by evd_a-02/);
  assert.equal(aggregation.historicalRecords, 2);

  const withHistory = await search(root, { countryCode: "GBR", route: "global_talent", statuses: ["active", "historical"] });
  assert.ok(withHistory.structuredContent.signals.some((item) => item.signalId === "sig_d-com"));
  assert.deepEqual(withHistory.structuredContent.evidenceAggregation.currentSupport, aggregation.currentSupport);
});

test("the response states source families, time windows, and dataset coverage honestly", async (t) => {
  const root = buildStore(t);
  writeFileSync(path.join(root, "broken.json"), JSON.stringify({ schema_version: "4.0.0" }));
  const unrelated = dataset([source("src_x-com", "community-x")], [evidence("evd_x-01", "src_x-com", "Canadian study permit processing slowed this summer.")],
    [{ ...signal("sig_x-com", ["evd_x-01"]), destination: { country: "Canada", country_code: "CAN", region: null, city: null } }]);
  writeFileSync(path.join(root, "e-unrelated.json"), JSON.stringify(unrelated));

  const searched = await search(root, { countryCode: "GBR", route: "global_talent" });
  const coverage = searched.structuredContent.evidenceAggregation.datasetCoverage;
  assert.deepEqual({ scanned: coverage.scanned, valid: coverage.valid, invalid: coverage.invalid, withdrawn: coverage.withdrawn,
    matching: coverage.matchingDatasets }, { scanned: 6, valid: 5, invalid: 1, withdrawn: 0, matching: 4 });
  const a = coverage.datasets.find((item) => item.datasetId === "a-community");
  assert.equal(a.schemaVersion, "4.0.0");
  assert.equal(a.currentSignals, 1);
  assert.deepEqual(a.sources, [{ sourceId: "src_a-com", sourceName: "community-a community", sourceFamily: "community-a", public: false }]);
  assert.equal(a.sourceCoverage[0].coverage_complete, true);
  assert.equal(coverage.datasets.some((item) => item.datasetId === "e-unrelated"), false);
  const legacy = coverage.datasets.find((item) => item.datasetId === "c-legacy");
  assert.equal(legacy.sources[0].sourceFamily, null, "legacy datasets report an unknown source family");

  const copied = searched.structuredContent.evidenceAggregation.clusters.find((cluster) => cluster.members.some((member) => member.evidenceId === "EX-1"));
  const legacyMember = copied.members.find((member) => member.evidenceId === "EX-1");
  assert.equal(legacyMember.copyRisk, "unknown");
  assert.equal(legacyMember.sourceName, "Legacy community");
  assert.match(searched.structuredContent.evidenceAggregation.note, /not a probability/);
});
