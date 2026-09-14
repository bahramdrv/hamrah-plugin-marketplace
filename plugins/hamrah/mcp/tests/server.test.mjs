import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, filterResponse, handleRequest, OPENAPI, TOOLS } from "../server.mjs";

test("publishes every curated OpenAPI operation", async () => {
  assert.equal(TOOLS.length, 23);
  assert.equal(OPENAPI.info.version, "1.3.0");
  const contractOperationIds = Object.values(OPENAPI.paths).flatMap((methods) =>
    Object.values(methods).map((operation) => operation.operationId)
  );
  assert.deepEqual(TOOLS.map((tool) => tool.name).sort(), contractOperationIds.sort());
  assert.ok(TOOLS.some((tool) => tool.name === "getVisaRoutes"));
  assert.ok(TOOLS.some((tool) => tool.name === "findMatchingVisaRoutes"));
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
  assert.equal(listed.result.tools.length, 23);
});
