import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool, filterResponse, handleRequest, OPENAPI, TOOLS } from "../server.mjs";

test("publishes every curated OpenAPI operation", async () => {
  assert.equal(TOOLS.length, 47);
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
      "searchCommunityQuestions",
      "getCommunityQuestion",
      "answerCommunityQuestion",
      "searchRouteClaims",
      "validateRouteClaim",
      "searchAcademicOpportunities",
      "getAcademicOpportunity",
      "searchIranianLivedExperiences",
      "getLivedExperience",
      "searchOfficialApprovalStatistics",
      "getIranianRouteViability",
      "findViableRoutesForIranians",
      "getIdealCandidateProfile",
      "getRouteFactPack",
      "renderAcademicProgramShortlist",
      "renderVerifiedOpenAcademicOpportunityShortlist",
      "normalizeApplicantProfile",
      "evaluateRouteEligibility",
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

test("MCP rejects malformed and detailed route-finder input without contacting Visa Atlas", async () => {
  const calls = [];
  const fakeFetch = async (...args) => {
    calls.push(args);
    return new Response("{}", { status: 200 });
  };
  const rejected = [
    { nationalityIso: "IR", fullName: "Example Person" },
    { nationalityIso: 42 },
    { targetDestinations: ["DE", 123] },
    { dependants: -1 },
    { limit: 1.5 },
    { routeIntent: "job" },
    { professionSlug: "engineer jane@example.com" },
    { professionSlug: "123-main-street" },
    { targetDestinations: ["DE +989121234567"] },
    { targetDestinations: ["John Smith"] },
    { targetDestinations: ["آدرس منزل تهران"] }
  ];

  for (const input of rejected) {
    const response = await handleRequest({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "findMatchingVisaRoutes", arguments: input }
    }, fakeFetch);
    assert.equal(response.result.isError, true, JSON.stringify(input));
    assert.equal(response.result.structuredContent.error, "invalid_route_finder_input");
    assert.ok(response.result.structuredContent.details.length > 0);
  }
  assert.equal(calls.length, 0);
});

test("MCP accepts a coarse route-finder request and preserves its response", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ results: [{ slug: "study-route" }] }), { status: 200 });
  };
  const input = { nationalityIso: "IR", targetDestinations: ["DE"], routeIntent: "study", limit: 4 };
  const response = await handleRequest({
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "findMatchingVisaRoutes", arguments: input }
  }, fakeFetch);
  assert.equal(response.result.isError, false);
  assert.deepEqual(response.result.structuredContent.data, { results: [{ slug: "study-route" }] });
  assert.deepEqual(calls, [{ url: "https://visaatlas.org/api/public/route-finder", body: input }]);
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
  assert.equal(listed.result.tools.length, 47);
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
    new URL("../../skills/hamrah-signal-builder/examples/gold_standard_v2.json", import.meta.url),
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
  assert.equal(fetched.structuredContent.privacy.status, "pass");
  assert.ok(fetched.structuredContent.privacy.exceptions.some((item) => item.rule === "institution_name"));
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

test("fake redaction metadata cannot publish or expose private evidence through MCP", async (t) => {
  const signalStoreRoot = mkdtempSync(path.join(tmpdir(), "hamrah-private-signals-"));
  t.after(() => rmSync(signalStoreRoot, { recursive: true, force: true }));
  const dataset = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-signal-builder/examples/gold_standard_v2.json", import.meta.url), "utf8"
  ));
  dataset.quality_control.personal_identifiers_removed = true;
  dataset.signals[0].evidence[0].evidence_summary = "Contact applicant at jane@example.com";
  const candidate = path.join(signalStoreRoot, "candidate.json");
  writeFileSync(candidate, JSON.stringify(dataset));

  const published = spawnSync("python3", [
    fileURLToPath(new URL("../../skills/hamrah-signal-builder/scripts/store_signals.py", import.meta.url)),
    candidate, "--store-root", path.join(signalStoreRoot, "published")
  ], { encoding: "utf8" });
  assert.notEqual(published.status, 0);
  assert.match(published.stderr, /privacy.*fail|email/i);

  const searched = await executeTool("searchCommunitySignals", {}, globalThis.fetch, { signalStoreRoot });
  assert.equal(searched.structuredContent.resultCount, 0);
  assert.equal(searched.structuredContent.coverage.validDatasets, 0);
  assert.equal(searched.structuredContent.coverage.invalidDatasets[0].privacy.status, "fail");
  assert.equal(searched.structuredContent.coverage.invalidDatasets[0].privacy.findings[0].rule, "email");
  const fetched = await executeTool("getCommunitySignalDataset", { datasetId: "candidate" }, globalThis.fetch, { signalStoreRoot });
  assert.equal(fetched.isError, true);
});

test("MCP excludes datasets with direct identifiers and names needing review", async (t) => {
  const signalStoreRoot = mkdtempSync(path.join(tmpdir(), "hamrah-privacy-cases-"));
  t.after(() => rmSync(signalStoreRoot, { recursive: true, force: true }));
  const fixture = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-signal-builder/examples/gold_standard_v2.json", import.meta.url), "utf8"
  ));
  const cases = [
    ["phone", (data) => { data.signals[0].evidence[0].evidence_summary = "Call +989121234567"; }, "fail"],
    ["handle", (data) => { data.signals[0].evidence[0].evidence_summary = "Ask @private_user"; }, "fail"],
    ["telegram_locator", (data) => { data.signals[0].evidence[0].source_url = "https://t.me/private_user"; }, "fail"],
    ["personal_identifier", (data) => { data.signals[0].evidence[0].evidence_summary = "application number: A12345678"; }, "fail"],
    ["passport_identifier", (data) => { data.signals[0].evidence[0].evidence_summary = "passport ID: A12345678"; }, "fail", "personal_identifier"],
    ["national_identifier", (data) => { data.signals[0].evidence[0].evidence_summary = "national ID: 12345678"; }, "fail", "personal_identifier"],
    ["later_passport_identifier", (data) => { data.signals[0].evidence[0].evidence_summary = "national number unknown; passport number ABCD1234"; }, "fail", "personal_identifier"],
    ["persian_identifier", (data) => { data.signals[0].evidence[0].evidence_summary = "کد ملی ۱۲۳۴۵۶۷۸۹۰"; }, "fail", "personal_identifier"],
    ["address", (data) => { data.signals[0].evidence[0].evidence_summary = "At 123 Main Street"; }, "fail"],
    ["persian_address", (data) => { data.signals[0].evidence[0].evidence_summary = "نشانی: خیابان آزادی، پلاک ۱۲"; }, "fail", "address"],
    ["embedded_contact_locator", (data) => { data.signals[0].evidence[0].source_url = "https://example.org/?user=private"; }, "fail"],
    ["possible_full_name", (data) => { data.signals[0].evidence[0].evidence_summary = "John Smith filed a case"; }, "needs_review"],
    ["unprompted_full_name", (data) => { data.signals[0].evidence[0].evidence_summary = "Jane Doe discussed her visa delay."; }, "needs_review", "possible_full_name"],
    ["source_name", (data) => { data.signals[0].evidence[0].source_name = "John Smith"; }, "needs_review", "possible_full_name"],
    ["action_name", (data) => { data.signals[0].recommended_action = "Ask John Smith directly"; }, "needs_review", "possible_full_name"],
    ["persian_name", (data) => { data.signals[0].summary_fa = "علی رضایی پرونده را ثبت کرد"; }, "needs_review", "possible_full_name"],
    ["persian_evidence_name", (data) => { data.signals[0].evidence[0].evidence_summary = "علی رضایی پرونده را ثبت کرد"; }, "needs_review", "possible_full_name"],
    ["entity_name", (data) => { data.signals[2].entities[0].name = "John Smith"; }, "needs_review", "possible_full_name"],
    ["possible_full_name_locator", (data) => { data.signals[0].evidence[0].source_url = "https://example.org/users/john-smith"; }, "needs_review"],
    ["short_profile_locator", (data) => { data.signals[0].evidence[0].source_url = "https://example.org/u/john-smith"; }, "needs_review", "possible_full_name_locator"],
    ["possible_account_id", (data) => { data.signals[0].evidence[0].source_message_id = "1234567890"; }, "needs_review"],
    ["message_phone", (data) => { data.signals[0].evidence[0].source_message_id = "+989121234567"; }, "fail", "phone"],
    ["telegram_account_id", (data) => { data.signals[0].evidence[0].source_message_id = "telegram_user_A1234567"; }, "fail"]
  ];
  for (const [rule, mutate] of cases) {
    const dataset = structuredClone(fixture);
    mutate(dataset);
    writeFileSync(path.join(signalStoreRoot, `${rule}.json`), JSON.stringify(dataset));
  }
  const searched = await executeTool("searchCommunitySignals", {}, globalThis.fetch, { signalStoreRoot });
  assert.equal(searched.structuredContent.resultCount, 0);
  assert.equal(searched.structuredContent.coverage.validDatasets, 0);
  for (const [rule, , status, expectedRule = rule] of cases) {
    const invalid = searched.structuredContent.coverage.invalidDatasets.find((item) => item.datasetId === rule);
    assert.equal(invalid.privacy.status, status, rule);
    assert.ok(invalid.privacy.findings.some((item) => item.rule === expectedRule), rule);
  }
});
