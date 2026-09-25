import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { readCommunityDataset } from "../community-datasets.mjs";
import { DATASET_ROOT } from "../community-signals.mjs";
import { executeTool } from "../server.mjs";

// These tests read the committed, deployed store only; a fetch that throws proves no network is used.
const offline = async () => { throw new Error("network access is not allowed in seed tests"); };
const STUDY_ROUTES = ["student_bachelor", "student_masters_taught", "student_masters_research", "student_phd"];

function publishedFiles(directory = DATASET_ROOT) {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return publishedFiles(full);
    return entry.endsWith(".json") ? [full] : [];
  });
}

function seedDatasets() {
  return publishedFiles()
    .map((file) => JSON.parse(readFileSync(file, "utf8")))
    .filter((dataset) => dataset.schema_version === "4.0.0" && dataset.signals.some((signal) => signal.destination.country_code === "DEU"));
}

const search = (args) => executeTool("searchCommunitySignals", args, offline);

test("the committed German seed is valid, sourced, dated, and privacy-checked", () => {
  const datasets = seedDatasets();
  assert.ok(datasets.length >= 1, "a German seed dataset is published");
  for (const dataset of datasets) {
    const { errors, privacy } = readCommunityDataset(dataset);
    assert.deepEqual(errors, []);
    assert.equal(privacy.status, "pass");
    const evidenceById = new Map(dataset.evidence.map((item) => [item.id, item]));
    const sourcesById = new Map(dataset.sources.map((item) => [item.id, item]));
    for (const artifact of [...dataset.signals, ...dataset.route_claims]) {
      assert.match(artifact.id, /^(sig|clm)_[0-9a-f]{32}$/, "stable publication IDs");
      assert.equal(artifact.lifecycle.status, "active");
      assert.ok(artifact.lifecycle.last_verified, `${artifact.id} has a verification date`);
      for (const id of artifact.evidence_ids) {
        const evidence = evidenceById.get(id);
        assert.ok(["primary", "trusted"].includes(evidence.authority), `${id} authority`);
        assert.match(evidence.source_url, /^https:\/\//);
        assert.match(evidence.content_hash, /^sha256:[0-9a-f]{64}$/);
        assert.ok(evidence.retrieved_at);
        assert.equal(sourcesById.get(evidence.source_id).public, true);
      }
    }
    for (const claim of dataset.route_claims) assert.equal(claim.country_code, "DEU");
  }
});

test("the deployed store returns Opportunity Card signals and official route claims", async () => {
  const searched = await search({ countryCode: "DEU", route: "opportunity_card" });
  assert.equal(searched.isError, false);
  const content = searched.structuredContent;
  assert.equal(content.coverage.status, "evidence_found");
  assert.ok(content.resultCount >= 1);
  assert.ok(content.signals.every((signal) => signal.migrationRoutes.includes("opportunity_card")));
  assert.ok(content.signals.some((signal) => signal.officiallyConfirmed === true));
  assert.ok(content.routeClaimCoverage.matchingClaims >= 4);
  assert.ok(content.routeClaimCoverage.byClaimType.official_rule >= 1);
  assert.ok(content.evidenceAggregation.currentSupport.independentSupporting >= 1);

  const datasetId = content.routeClaimCoverage.datasets[0].datasetId;
  const fetched = await executeTool("getCommunitySignalDataset", { datasetId }, offline);
  const claims = fetched.structuredContent.routeClaims.filter((claim) => claim.routes.includes("opportunity_card"));
  assert.ok(claims.length >= 4);
  const evidenceIds = new Set(fetched.structuredContent.evidence.map((item) => item.id));
  for (const claim of claims) for (const id of claim.evidence_ids) assert.ok(evidenceIds.has(id));
});

test("the deployed store returns German study evidence for every seeded study route", async () => {
  for (const route of STUDY_ROUTES) {
    const searched = await search({ countryCode: "DEU", route });
    assert.ok(searched.structuredContent.resultCount >= 1, route);
    assert.ok(searched.structuredContent.routeClaimCoverage.matchingClaims >= 3, route);
  }
});

test("routes and countries without seeded evidence report missing coverage, not closure", async () => {
  for (const args of [{ countryCode: "CAN", route: "student_masters_taught" }, { countryCode: "DEU", route: "healthcare_worker" }]) {
    const searched = await search(args);
    assert.equal(searched.structuredContent.resultCount, 0, JSON.stringify(args));
    assert.equal(searched.structuredContent.routeClaimCoverage.matchingClaims, 0);
    assert.equal(searched.structuredContent.coverage.status, "no_coverage");
    assert.match(searched.structuredContent.coverage.note, /missing coverage, not evidence that the route is closed/);
  }
});
