import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const VALIDATED = V4.signals[0].validation;

function claim(id, routes, claimType, processStage, evidenceIds) {
  return {
    id, country_code: "GBR", routes, claim_type: claimType, process_stage: processStage,
    statement_en: `Official rule ${id} for ${routes.join(", ")}.`, opposing_evidence_ids: [],
    evidence_ids: evidenceIds, lifecycle: structuredClone(V4.signals[0].lifecycle), validation: VALIDATED
  };
}

function storeWithClaims(t) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-claims-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const datasetsRoot = path.join(root, "datasets");
  mkdirSync(datasetsRoot);
  const official = V4.evidence.find((item) => item.authority === "primary").id;
  const dataset = structuredClone(V4);
  dataset.route_claims = [
    claim("clm_gt-endorsement", ["global_talent"], "official_rule", "endorsement_stage_1", [official]),
    claim("clm_gt-fee", ["global_talent", "skilled_worker"], "official_rule", "visa_application", [official]),
    claim("clm_sw-salary", ["skilled_worker"], "financial_requirement", "visa_application", [official])
  ];
  writeFileSync(path.join(datasetsRoot, "claims.json"), JSON.stringify(dataset));
  return { root, datasetsRoot, official };
}

const search = (signalStoreRoot, args) => executeTool("searchCommunitySignals", args, globalThis.fetch, { signalStoreRoot });

test("search reports route claim coverage for the requested scope", async (t) => {
  const { datasetsRoot } = storeWithClaims(t);
  const globalTalent = await search(datasetsRoot, { countryCode: "GBR", route: "global_talent" });
  assert.deepEqual(globalTalent.structuredContent.routeClaimCoverage, {
    matchingClaims: 2,
    currentClaims: 2,
    byClaimType: { official_rule: 2 },
    datasets: [{ datasetId: "claims", claimIds: ["clm_gt-endorsement", "clm_gt-fee"] }],
    notEvaluated: []
  });
  assert.equal(globalTalent.structuredContent.coverage.status, "evidence_found");

  const staged = await search(datasetsRoot, { countryCode: "GBR", route: "skilled_worker", processStage: "visa_application" });
  assert.equal(staged.structuredContent.routeClaimCoverage.matchingClaims, 2);
  assert.equal(staged.structuredContent.resultCount, 0);
  assert.equal(staged.structuredContent.coverage.status, "evidence_found", "claims alone are coverage");

  const elsewhere = await search(datasetsRoot, { countryCode: "CAN", route: "skilled_worker" });
  assert.equal(elsewhere.structuredContent.routeClaimCoverage.matchingClaims, 0);
  assert.equal(elsewhere.structuredContent.coverage.status, "no_coverage");
  assert.match(elsewhere.structuredContent.coverage.note, /missing coverage, not evidence that the route is closed/);
});

test("getCommunitySignalDataset returns route claims with their evidence and honours withdrawal", async (t) => {
  const { root, datasetsRoot, official } = storeWithClaims(t);
  const fetched = await executeTool("getCommunitySignalDataset", { datasetId: "claims", signalIds: ["sig_none"] },
    globalThis.fetch, { signalStoreRoot: datasetsRoot });
  const { routeClaims, evidence } = fetched.structuredContent;
  assert.deepEqual(routeClaims.map((item) => item.id), ["clm_gt-endorsement", "clm_gt-fee", "clm_sw-salary"]);
  assert.equal(routeClaims[0].source_schema_version, "4.0.0");
  assert.deepEqual(evidence.map((item) => item.id), [official], "evidence referenced by returned claims is included");

  const withdrawn = spawnSync(process.execPath, [PUBLISHER, "withdraw", "--store-root", root, "--artifact", "clm_gt-fee",
    "--reason", "incorrect", "--now", "2026-09-25T00:00:00Z"], { encoding: "utf8" });
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  const after = await search(datasetsRoot, { countryCode: "GBR", route: "global_talent" });
  assert.equal(after.structuredContent.routeClaimCoverage.matchingClaims, 1);
  const refetched = await executeTool("getCommunitySignalDataset", { datasetId: "claims" }, globalThis.fetch, { signalStoreRoot: datasetsRoot });
  assert.equal(refetched.structuredContent.routeClaims.some((item) => item.id === "clm_gt-fee"), false);
  assert.deepEqual(refetched.structuredContent.withdrawnArtifactIds, ["clm_gt-fee"]);
});

test("route claim text is privacy-inspected like other narrative fields", async (t) => {
  const { datasetsRoot } = storeWithClaims(t);
  const dataset = JSON.parse(readFileSync(path.join(datasetsRoot, "claims.json"), "utf8"));
  dataset.route_claims[0].statement_en = "John Smith confirmed the endorsement rule.";
  writeFileSync(path.join(datasetsRoot, "claims.json"), JSON.stringify(dataset));
  const searched = await search(datasetsRoot, { countryCode: "GBR" });
  assert.equal(searched.structuredContent.coverage.validDatasets, 0);
  assert.match(searched.structuredContent.coverage.invalidDatasets[0].error, /route_claims\[0\]\.statement_en \(possible_full_name\)/);
});

test("claim coverage never counts claims for filters a claim cannot be checked against", async (t) => {
  const { datasetsRoot } = storeWithClaims(t);
  const byName = await search(datasetsRoot, { country: "Canada" });
  assert.equal(byName.structuredContent.routeClaimCoverage.matchingClaims, 0);
  assert.deepEqual(byName.structuredContent.routeClaimCoverage.notEvaluated, ["country"]);
  assert.equal(byName.structuredContent.coverage.status, "no_coverage");

  const byNationality = await search(datasetsRoot, { countryCode: "GBR", nationality: "IRN" });
  assert.equal(byNationality.structuredContent.routeClaimCoverage.matchingClaims, 0);
  assert.deepEqual(byNationality.structuredContent.routeClaimCoverage.notEvaluated, ["nationality"]);

  const byTopic = await search(datasetsRoot, { countryCode: "GBR", topic: "gt-endorsement" });
  assert.deepEqual(byTopic.structuredContent.routeClaimCoverage.datasets, [{ datasetId: "claims", claimIds: ["clm_gt-endorsement"] }]);
});
