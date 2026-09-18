import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { executeTool, filterResponse, handleRequest, OPENAPI, TOOLS } from "../server.mjs";

test("publishes every curated OpenAPI operation", async () => {
  assert.equal(TOOLS.length, 32);
  assert.equal(OPENAPI.info.version, "1.3.0");
  const contractOperationIds = Object.values(OPENAPI.paths).flatMap((methods) =>
    Object.values(methods).map((operation) => operation.operationId)
  );
  assert.deepEqual(
    TOOLS.map((tool) => tool.name).filter((name) => ![
      "search",
      "fetch",
      "searchCommunitySignals",
      "getCommunitySignalDataset",
      "normalizeApplicantProfile",
      "evaluateRouteEligibility",
      "getRouteFactPack",
      "evaluateCommunityAdjustment",
      "finalizeAssessment"
    ].includes(name)).sort(),
    contractOperationIds.sort()
  );
  assert.ok(TOOLS.some((tool) => tool.name === "search"));
  assert.ok(TOOLS.some((tool) => tool.name === "fetch"));
  assert.ok(TOOLS.some((tool) => tool.name === "getVisaRoutes"));
  assert.ok(TOOLS.some((tool) => tool.name === "findMatchingVisaRoutes"));
  assert.ok(TOOLS.some((tool) => tool.name === "searchCommunitySignals"));
  assert.ok(TOOLS.some((tool) => tool.name === "getCommunitySignalDataset"));
  assert.ok(TOOLS.some((tool) => tool.name === "normalizeApplicantProfile"));
  assert.ok(TOOLS.some((tool) => tool.name === "evaluateRouteEligibility"));
  assert.ok(TOOLS.some((tool) => tool.name === "getRouteFactPack"));
  assert.ok(TOOLS.some((tool) => tool.name === "evaluateCommunityAdjustment"));
  assert.ok(TOOLS.some((tool) => tool.name === "finalizeAssessment"));
});

test("rejects unsupported route-finder fields before transmission", async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  const result = await executeTool("findMatchingVisaRoutes", {
    nationalityIso: "IR",
    fullName: "Must not be transmitted"
  }, fakeFetch);
  assert.equal(result.isError, true);
  assert.equal(called, false);
  assert.match(result.structuredContent.message, /fullName/);
});

test("filters and limits large array responses locally", () => {
  const response = filterResponse([
    { destination: "ca", slug: "express-entry", category: "skilled" },
    { destination: "gb", slug: "skilled-worker", category: "work" },
    { destination: "ca", slug: "study-permit", category: "study" }
  ], { destination: "ca", limit: 1 });
  assert.equal(response.total, 2);
  assert.equal(response.returned, 1);
  assert.equal(response.data[0].slug, "express-entry");
});

test("calls the fixed Visa Atlas path", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify([{ destination: "ca", slug: "express-entry" }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await executeTool("getVisaRoutes", { destination: "ca" }, fakeFetch);
  assert.equal(result.isError, false);
  assert.equal(calls[0].url, "https://visaatlas.org/api/public/visas");
  assert.equal(result.structuredContent.returned, 1);
});

test("POSTs only the coarse route-finder payload", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const profile = { nationalityIso: "IR", routeIntent: "study", limit: 4 };
  const result = await executeTool("findMatchingVisaRoutes", profile, fakeFetch);
  assert.equal(result.isError, false);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), profile);
});

test("returns explicit errors instead of inventing unavailable data", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  const result = await executeTool("getSourceFreshness", {}, fakeFetch);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, 404);
  assert.match(result.structuredContent.guidance, /UNKNOWN/);
});

test("supports MCP initialize and tools/list", async () => {
  const initialized = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(initialized.result.serverInfo.name, "hamrah-visa-atlas");
  const listed = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(listed.result.tools.length, 32);
});

test("implements citation-ready standard search and fetch tools", async () => {
  const index = {
    items: [{
      id: "visa-uk-skilled-worker",
      kind: "Visa",
      title: "UK Skilled Worker visa",
      description: "A sponsored work route.",
      keywords: ["uk", "work"],
      sourceDatasets: ["/api/public/visas"],
      url: "https://visaatlas.org/visa/uk/skilled-worker"
    }]
  };
  const fakeFetch = async () => new Response(JSON.stringify(index), { status: 200 });
  const searched = await executeTool("search", { query: "skilled" }, fakeFetch);
  assert.deepEqual(JSON.parse(searched.content[0].text).results[0], {
    id: "visa-uk-skilled-worker",
    title: "UK Skilled Worker visa",
    url: "https://visaatlas.org/visa/uk/skilled-worker"
  });
  const fetched = await executeTool("fetch", { id: "visa-uk-skilled-worker" }, fakeFetch);
  assert.equal(JSON.parse(fetched.content[0].text).title, "UK Skilled Worker visa");
});

test("indexes valid Git-backed community datasets and reports invalid files", async (t) => {
  const signalStoreRoot = mkdtempSync(path.join(tmpdir(), "hamrah-signals-"));
  t.after(() => rmSync(signalStoreRoot, { recursive: true, force: true }));
  const fixture = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-signal-builder/examples/gold_standard.json", import.meta.url),
    "utf8"
  ));
  mkdirSync(path.join(signalStoreRoot, "2026", "09"), { recursive: true });
  writeFileSync(path.join(signalStoreRoot, "2026", "09", "uk.json"), JSON.stringify(fixture));
  writeFileSync(path.join(signalStoreRoot, "invalid.json"), JSON.stringify({ schema_version: "2.0" }));

  const searched = await executeTool(
    "searchCommunitySignals",
    { countryCode: "GBR", route: "global_talent" },
    globalThis.fetch,
    { signalStoreRoot }
  );
  assert.equal(searched.isError, false);
  assert.equal(searched.structuredContent.coverage.filesScanned, 2);
  assert.equal(searched.structuredContent.coverage.validDatasets, 1);
  assert.equal(searched.structuredContent.coverage.invalidDatasets.length, 1);
  assert.equal(searched.structuredContent.resultCount, 2);
  assert.equal(searched.structuredContent.signals[0].datasetId, "2026/09/uk");

  const fetched = await executeTool(
    "getCommunitySignalDataset",
    { datasetId: "2026/09/uk", signalIds: ["GBR-GT-R4-ENDORSEMENT-DELAY-EXAMPLE"] },
    globalThis.fetch,
    { signalStoreRoot }
  );
  assert.equal(fetched.isError, false);
  assert.equal(fetched.structuredContent.signals.length, 1);
  assert.equal(fetched.structuredContent.qualityControl.personal_identifiers_removed, true);
});

test("refuses invalid or unknown community datasets", async (t) => {
  const signalStoreRoot = mkdtempSync(path.join(tmpdir(), "hamrah-signals-empty-"));
  t.after(() => rmSync(signalStoreRoot, { recursive: true, force: true }));
  const result = await executeTool(
    "getCommunitySignalDataset",
    { datasetId: "missing" },
    globalThis.fetch,
    { signalStoreRoot }
  );
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "community_signal_store_failed");
  assert.match(result.structuredContent.guidance, /coverage unavailable/);
});
