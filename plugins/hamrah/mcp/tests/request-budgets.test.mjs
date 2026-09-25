import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp } from "../../../../server.mjs";
import { executeTool, TOOLS } from "../server.mjs";

const ROUTES = [{ destination: "de", slug: "opportunity-card" }];
const okFetch = async () => new Response(JSON.stringify(ROUTES), { status: 200 });

async function listen(t, options) {
  const server = createApp(options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/mcp`;
}

function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function callTool(url, name, args = {}) {
  return post(url, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
}

async function rpcResult(response) {
  const text = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).join("")
    : text;
  return JSON.parse(data);
}

function signalStore(t, count) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = readFileSync(
    new URL("../../skills/hamrah-signal-builder/examples/gold_standard.json", import.meta.url), "utf8"
  );
  for (let index = 0; index < count; index++) writeFileSync(path.join(root, `dataset-${index}.json`), fixture);
  return root;
}

test("HTTP serves an ordinary tool call within budget", async (t) => {
  const url = await listen(t, { fetchImpl: okFetch });
  const response = await callTool(url, "getVisaRoutes", { destination: "de" });
  assert.equal(response.status, 200);
  const { result } = await rpcResult(response);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.returned, 1);
});

test("HTTP rejects an oversized body with a structured 413 and keeps serving", async (t) => {
  const url = await listen(t, { fetchImpl: okFetch, bodyLimitBytes: 1024 });
  const oversized = await callTool(url, "getVisaRoutes", { query: "x".repeat(2048) });
  assert.equal(oversized.status, 413);
  const body = await oversized.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.data.reason, "request_too_large");
  assert.equal(body.error.data.limitBytes, 1024);

  const malformed = await post(url, "{not json");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);

  const ordinary = await callTool(url, "getVisaRoutes");
  assert.equal((await rpcResult(ordinary)).result.isError, false);
});

test("HTTP caps concurrent requests with a structured 503 and recovers", async (t) => {
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  let started;
  const fetchStarted = new Promise((resolve) => { started = resolve; });
  let blockNext = true;
  const fetchImpl = async () => {
    if (blockNext) {
      blockNext = false;
      started();
      await released;
    }
    return new Response(JSON.stringify(ROUTES), { status: 200 });
  };
  const url = await listen(t, { fetchImpl, maxConcurrentRequests: 1 });

  const first = callTool(url, "getVisaRoutes");
  await fetchStarted;
  const rejected = await callTool(url, "getVisaRoutes");
  assert.equal(rejected.status, 503);
  assert.equal(rejected.headers.get("retry-after"), "1");
  assert.equal((await rejected.json()).error.data.reason, "concurrency_limit_exceeded");

  release();
  assert.equal((await rpcResult(await first)).result.isError, false);
  const recovered = await callTool(url, "getVisaRoutes");
  assert.equal((await rpcResult(recovered)).result.isError, false);
});

test("an operation past its deadline fails as a structured tool error without an incomplete success", async (t) => {
  let aborted = false;
  const hangingFetch = (_url, init) => {
    init.signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => {});
  };
  const direct = await executeTool("getVisaRoutes", {}, hangingFetch, { deadlineMs: 20 });
  assert.equal(direct.isError, true);
  assert.equal(direct.structuredContent.error, "operation_deadline_exceeded");
  assert.equal(direct.structuredContent.limitMs, 20);
  assert.equal("data" in direct.structuredContent, false);
  assert.equal(aborted, true);

  const url = await listen(t, { fetchImpl: hangingFetch, deadlineMs: 20 });
  const response = await callTool(url, "getVisaRoutes");
  assert.equal(response.status, 200);
  assert.equal((await rpcResult(response)).result.structuredContent.error, "operation_deadline_exceeded");
});

test("community tools fail instead of truncating when a call would scan too many datasets", async (t) => {
  const signalStoreRoot = signalStore(t, 3);
  for (const [name, args] of [["searchCommunitySignals", {}], ["getCommunitySignalDataset", { datasetId: "dataset-0" }]]) {
    const limited = await executeTool(name, args, okFetch, { signalStoreRoot, maxDatasetsScanned: 2 });
    assert.equal(limited.isError, true, name);
    assert.equal(limited.structuredContent.error, "dataset_scan_limit_exceeded");
    assert.equal(limited.structuredContent.limit, 2);
  }
  const allowed = await executeTool("searchCommunitySignals", {}, okFetch, { signalStoreRoot, maxDatasetsScanned: 3 });
  assert.equal(allowed.isError, false);
  assert.equal(allowed.structuredContent.coverage.filesScanned, 3);

  const url = await listen(t, { fetchImpl: okFetch, signalStoreRoot, maxDatasetsScanned: 2 });
  const response = await callTool(url, "searchCommunitySignals");
  assert.equal((await rpcResult(response)).result.structuredContent.error, "dataset_scan_limit_exceeded");
});

test("user-controlled URLs cannot redirect server-side fetches away from Visa Atlas", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  };
  const hostile = "https://attacker.example/steal";
  for (const tool of TOOLS) {
    if (tool.name === "searchCommunitySignals" || tool.name === "getCommunitySignalDataset") continue;
    await executeTool(tool.name, { query: hostile, id: hostile, destination: hostile, url: hostile, slug: "../../x" }, fetchImpl);
  }
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(new URL(call.url).origin, "https://visaatlas.org");
    assert.equal(call.redirect, "error");
  }
});
