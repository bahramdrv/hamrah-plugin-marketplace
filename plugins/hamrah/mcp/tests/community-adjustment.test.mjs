import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { executeTool } from "../server.mjs";

const offlineFetch = async () => {
  throw new Error("The community adjustment must not reach the network.");
};

const fixture = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const V2_DATASET = fixture("../../skills/hamrah-signal-builder/examples/gold_standard_v2.json");
const V3_DATASET = fixture("./fixtures/installed_v3_gold_standard.json");
const V4_DATASET = fixture("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json");

function store(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-adjustment-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, name), content);
  return root;
}

async function evaluate(args, options = {}) {
  const result = await executeTool("evaluateCommunityAdjustment", args, offlineFetch, options);
  return result;
}

test("a corroborated active downside signal lowers Practical Fit by its policy penalty", async (t) => {
  const signalStoreRoot = store(t, { "v3.json": V3_DATASET });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const adjustment = result.structuredContent;
  assert.equal(adjustment.totalAdjustment, -10);
  assert.deepEqual(adjustment.appliedSignals.map((item) => [item.signalId, item.adjustment]), [["GBR-GT-R4-ENDORSEMENT-DELAY-EXAMPLE", -10]]);
  assert.deepEqual(adjustment.ignoredSignals.map((item) => item.signalId), ["GBR-WORK-PRIORITY-OVERRUN-EXAMPLE"]);
});

test("validated version 4 independent community reports can lower Practical Fit", async (t) => {
  const signalStoreRoot = store(t, { "v4.json": V4_DATASET });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const adjustment = result.structuredContent;
  assert.equal(adjustment.totalAdjustment, -10);
  assert.equal(adjustment.appliedSignals[0].evidenceMaturity, "corroborated");
  assert.equal(adjustment.scoreComponent.component, "practical_fit");
});

test("validated version 2 independent community reports can lower Practical Fit", async (t) => {
  const signalStoreRoot = store(t, { "v2.json": V2_DATASET });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const adjustment = result.structuredContent;
  assert.equal(adjustment.coverage, "strong");
  assert.equal(adjustment.totalAdjustment, -10);
  assert.equal(adjustment.signalCoverage.applied, 1);
  const byId = Object.fromEntries(adjustment.ignoredSignals.map((item) => [item.signalId, item]));
  assert.equal(byId["GBR-WORK-PRIORITY-OVERRUN-EXAMPLE"].excluded, false);
  assert.equal(byId["GBR-WORK-PRIORITY-OVERRUN-EXAMPLE"].reasonCode, "not_active");
});

test("version 4 reports with one independent group cannot create a penalty", async (t) => {
  const data = JSON.parse(V4_DATASET);
  for (const evidence of data.evidence) if (evidence.source_id === "src_example-uk-community") evidence.independence_group = "r1";
  const signalStoreRoot = store(t, { "v4.json": JSON.stringify(data) });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.totalAdjustment, 0);
  assert.equal(result.structuredContent.ignoredSignals[0].reasonCode, "evidence_maturity_insufficient");
});

test("opposing public reports reduce version 4 Evidence Confidence before maturity is granted", async (t) => {
  const data = JSON.parse(V4_DATASET);
  data.sources[0].public = true;
  data.sources[0].source_url = "https://example.org/community";
  const signal = data.signals[0];
  signal.evidence_ids = signal.evidence_ids.filter((id) => id !== "evd_gt-official-baseline-timing");
  for (const evidence of data.evidence.filter((item) => item.source_id === "src_example-uk-community")) {
    evidence.source_url = `https://example.org/reports/${evidence.independence_group}`;
  }
  for (let index = 1; index <= 3; index++) {
    const opposing = structuredClone(data.evidence[0]);
    opposing.id = `evd_opposing-${index}`;
    opposing.independence_group = `opposing-${index}`;
    opposing.source_url = `https://example.org/opposing/${index}`;
    opposing.content_hash = `sha256:${String(index).repeat(64)}`;
    opposing.supports_or_contradicts = "contradicts";
    data.evidence.push(opposing);
    signal.evidence_ids.push(opposing.id);
  }
  const signalStoreRoot = store(t, { "v4.json": JSON.stringify(data) });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.totalAdjustment, 0);
  assert.equal(result.structuredContent.ignoredSignals[0].reasonCode, "evidence_maturity_insufficient");
});

test("German Opportunity Card signals in the deployed store are evaluated for policy reasons, not a privacy flag", async () => {
  const result = await evaluate({ countryCode: "DEU", route: "opportunity_card" });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const adjustment = result.structuredContent;
  assert.ok(adjustment.signalCoverage.matching > 0);
  assert.equal(adjustment.appliedSignals.length + adjustment.ignoredSignals.length, adjustment.signalCoverage.matching);
  for (const ignored of adjustment.ignoredSignals) {
    assert.doesNotMatch(ignored.reason, /privacy/i, ignored.signalId);
    assert.doesNotMatch(ignored.reason, /not found/i, ignored.signalId);
  }
});

test("the dataset scan limit applies to the adjustment and an over-limit store fails instead of truncating", async (t) => {
  const signalStoreRoot = store(t, { "a.json": V2_DATASET, "b.json": V3_DATASET, "c.json": V4_DATASET });
  const limited = await evaluate({ countryCode: "GBR", route: "global_talent" }, { signalStoreRoot, maxDatasetsScanned: 2 });
  assert.equal(limited.isError, true);
  assert.equal(limited.structuredContent.error, "dataset_scan_limit_exceeded");
  assert.equal(limited.structuredContent.limit, 2);
});

test("matching signals left out by the result limit are reported as truncation and coverage is partial", async (t) => {
  const signalStoreRoot = store(t, { "v3.json": V3_DATASET });
  const result = await evaluate({ countryCode: "GBR", route: "global_talent", limit: 1 }, { signalStoreRoot });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const adjustment = result.structuredContent;
  assert.equal(adjustment.coverage, "partial");
  assert.equal(adjustment.signalCoverage.matching, 2);
  assert.equal(adjustment.signalCoverage.truncated, true);
  assert.equal(adjustment.signalCoverage.used + adjustment.signalCoverage.excluded, 2);
  assert.equal(adjustment.signalCoverage.excludedByReason.result_limit, 1);
  assert.match(adjustment.warnings.join(" "), /limit/i);
});

test("the adjustment is labelled as a Practical Fit component only, with or without coverage", async (t) => {
  const signalStoreRoot = store(t, { "v3.json": V3_DATASET });
  const expected = {
    component: "practical_fit",
    notUsedFor: ["iranian_route_viability_index", "route_evidence_threshold", "rankable_route", "route_discovery_ordering"]
  };
  for (const args of [{ countryCode: "GBR", route: "global_talent" }, { countryCode: "ZZZ", route: "none" }]) {
    const result = await evaluate(args, { signalStoreRoot });
    assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
    assert.deepEqual(result.structuredContent.scoreComponent, expected, args.countryCode);
  }
});
