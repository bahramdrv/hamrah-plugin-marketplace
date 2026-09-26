import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, handleRequest, TOOLS } from "../server.mjs";

const request = {
  countryCode: "DE",
  routeSlug: "opportunity-card",
  datasets: ["getVisaRoutes", "getVisaFees"]
};

test("Route Fact Pack fetches selected datasets concurrently and preserves source-linked route records", async () => {
  const started = [];
  let release;
  const bothStarted = new Promise((resolve) => { release = resolve; });
  const fakeFetch = async (url) => {
    started.push(url);
    if (started.length === 2) release();
    await bothStarted;
    const body = url.endsWith("/visas")
      ? [{ destinationIso: "de", slug: "opportunity-card", source: { url: "https://official.example/route" } },
        { destinationIso: "de", slug: "student", source: { url: "https://official.example/student" } }]
      : { datasetUrl: "https://visaatlas.org/datasets/fees", lastModified: "2026-09-01",
          items: [{ destinationIso: "de", routeSlug: "opportunity-card", amount: 75,
                    source: { url: "https://official.example/fee", lastVerified: "2026-09-01" } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  assert.ok(TOOLS.some((tool) => tool.name === "getRouteFactPack" && tool.annotations.readOnlyHint));
  const result = await executeTool("getRouteFactPack", request, fakeFetch, { deadlineMs: 1000 });
  assert.equal(result.isError, false);
  assert.deepEqual(started.sort(), [
    "https://visaatlas.org/api/public/fees",
    "https://visaatlas.org/api/public/visas"
  ]);
  assert.deepEqual(result.structuredContent.coverage, {
    denominator: 2, denominatorBasis: "datasets_selected", successful: 2, failed: 0, timedOut: 0, percentage: 100
  });
  assert.equal(result.structuredContent.status, "all_selected_retrieved");
  const [visas, fees] = result.structuredContent.datasets;
  assert.equal(visas.status, "success");
  assert.equal(visas.records.length, 1);
  assert.equal(visas.records[0].slug, "opportunity-card");
  assert.equal(fees.metadata.datasetUrl, "https://visaatlas.org/datasets/fees");
  assert.deepEqual(fees.records[0].source, {
    url: "https://official.example/fee", lastVerified: "2026-09-01"
  });
});

test("Route Fact Pack distinguishes a failed dataset from a retrieved empty dataset", async () => {
  const fakeFetch = async (url) => {
    if (url.endsWith("/policy-claims")) {
      return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
    }
    const body = url.endsWith("/visas")
      ? []
      : { items: [{ destinationIso: "de", routeSlug: "opportunity-card",
                    source: { url: "https://official.example/fee" } }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const result = await executeTool("getRouteFactPack", {
    ...request, datasets: ["getVisaRoutes", "getPolicyClaims", "getVisaFees"]
  }, fakeFetch, { deadlineMs: 1000 });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "partial");
  assert.deepEqual(result.structuredContent.coverage, {
    denominator: 3, denominatorBasis: "datasets_selected", successful: 2, failed: 1, timedOut: 0, percentage: 66.7
  });
  assert.equal(result.structuredContent.datasets[0].status, "success");
  assert.deepEqual(result.structuredContent.datasets[0].records, []);
  assert.equal(result.structuredContent.datasets[1].status, "failure");
  assert.equal(result.structuredContent.datasets[1].httpStatus, 503);
  assert.equal(result.structuredContent.datasets[1].records, undefined);
  assert.equal(result.structuredContent.datasets[2].records[0].source.url, "https://official.example/fee");
});

test("Route Fact Pack returns completed datasets when the operation deadline expires", async () => {
  const startedAt = Date.now();
  const fakeFetch = async (url) => {
    if (url.endsWith("/visas")) {
      return new Response(JSON.stringify([
        { destinationIso: "de", slug: "opportunity-card",
          source: { url: "https://official.example/route" } }
      ]), { status: 200 });
    }
    return new Promise(() => {});
  };
  const result = await executeTool("getRouteFactPack", request, fakeFetch, { deadlineMs: 200 });
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "partial");
  assert.deepEqual(result.structuredContent.coverage, {
    denominator: 2, denominatorBasis: "datasets_selected", successful: 1, failed: 0, timedOut: 1, percentage: 50
  });
  assert.equal(result.structuredContent.datasets[0].records[0].source.url, "https://official.example/route");
  assert.equal(result.structuredContent.datasets[1].status, "timeout");
  assert.equal(result.structuredContent.datasets[1].records, undefined);
});

test("Route Fact Pack rejects unapproved datasets and unbounded fan-out before fetching", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response("[]", { status: 200 }); };
  for (const datasets of [
    ["https://unapproved.example/visas"],
    Array(7).fill("getVisaRoutes"),
    ["getVisaRoutes", "getVisaRoutes"]
  ]) {
    const result = await executeTool("getRouteFactPack", { ...request, datasets }, fakeFetch);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error, "invalid_route_fact_pack_input");
  }
  assert.equal(calls, 0);
  const listed = await handleRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.ok(listed.result.tools.some((tool) => tool.name === "getRouteFactPack"));
});

test("Route Fact Pack finds UK route claims without dropping their primary source metadata", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({
    lastModified: "2026-09-11",
    claims: [
      { destinationIso: "uk", affectedVisas: [{ slug: "skilled-worker" }],
        statement: "A synthetic policy claim.",
        source: { url: "https://official.example/rules", authority: "Issuing authority" } },
      { destinationIso: "uk", affectedVisas: [{ slug: "student" }],
        statement: "Another route." }
    ]
  }), { status: 200 });
  const result = await executeTool("getRouteFactPack", {
    countryCode: "GB", routeSlug: "skilled-worker", datasets: ["getPolicyClaims"]
  }, fakeFetch);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.datasets[0].records.length, 1);
  assert.equal(result.structuredContent.datasets[0].records[0].source.url, "https://official.example/rules");
  assert.equal(result.structuredContent.datasets[0].metadata.lastModified, "2026-09-11");
});

test("Route Fact Pack recognizes a route record with a destination code field", async () => {
  const fakeFetch = async () => new Response(JSON.stringify([
    { destination: "de", slug: "opportunity-card", source: { url: "https://official.example/route" } }
  ]), { status: 200 });
  const result = await executeTool("getRouteFactPack", {
    ...request, datasets: ["getVisaRoutes"]
  }, fakeFetch);
  assert.equal(result.structuredContent.datasets[0].records.length, 1);
});

test("Route Fact Pack bounds record scans and discloses incomplete route matching", async () => {
  const records = Array.from({ length: 500 }, () => ({ destination: "de", slug: "student" }));
  records.push({ destination: "de", slug: "opportunity-card" });
  const fakeFetch = async () => new Response(JSON.stringify(records), { status: 200 });
  const result = await executeTool("getRouteFactPack", {
    ...request, datasets: ["getVisaRoutes"]
  }, fakeFetch);
  const dataset = result.structuredContent.datasets[0];
  assert.equal(result.structuredContent.status, "partial");
  assert.equal(dataset.status, "success");
  assert.equal(dataset.totalRecords, 501);
  assert.equal(dataset.recordsScanned, 500);
  assert.equal(dataset.scanLimited, true);
  assert.deepEqual(dataset.records, []);
});

test("Slug form fetches its default datasets concurrently and reports coverage counts, never complete", { timeout: 3000 }, async () => {
  const started = [];
  let release;
  const allStarted = new Promise((resolve) => { release = resolve; });
  const fakeFetch = async (url) => {
    started.push(url);
    if (started.length === 6) release();
    await allStarted;
    return new Response(JSON.stringify([
      { destinationIso: "de", slug: "opportunity-card", source: { url: "https://official.example/route" } }
    ]), { status: 200 });
  };
  const result = await executeTool("getRouteFactPack", {
    countryCode: "DE", slug: "opportunity-card"
  }, fakeFetch, { deadlineMs: 1000 });
  assert.equal(result.isError, false);
  assert.deepEqual(started.sort(), [
    "https://visaatlas.org/api/public/fees",
    "https://visaatlas.org/api/public/policy-claims",
    "https://visaatlas.org/api/public/policy-updates",
    "https://visaatlas.org/api/public/processing-times",
    "https://visaatlas.org/api/public/salary-thresholds",
    "https://visaatlas.org/api/public/visas"
  ]);
  const pack = result.structuredContent;
  assert.deepEqual(pack.route, { countryCode: "DE", slug: "opportunity-card" });
  assert.deepEqual(pack.coverage, {
    denominator: 6, denominatorBasis: "datasets_selected",
    successful: 6, failed: 0, timedOut: 0, percentage: 100
  });
  assert.ok(pack.datasets.every((dataset) => dataset.status === "success" && dataset.records.length === 1));
  assert.doesNotMatch(JSON.stringify(pack), /"complete"/);
});

test("Slug form reports one unavailable dataset as a failure and keeps the other datasets", async () => {
  const fakeFetch = async (url) => url.endsWith("/policy-claims")
    ? new Response(JSON.stringify({ error: "unavailable" }), { status: 503 })
    : new Response(JSON.stringify([]), { status: 200 });
  const result = await executeTool("getRouteFactPack", {
    countryCode: "DE", slug: "opportunity-card"
  }, fakeFetch, { deadlineMs: 1000 });
  assert.equal(result.isError, false);
  const pack = result.structuredContent;
  assert.equal(pack.status, "partial");
  assert.deepEqual(pack.coverage, {
    denominator: 6, denominatorBasis: "datasets_selected",
    successful: 5, failed: 1, timedOut: 0, percentage: 83.3
  });
  const claims = pack.datasets.find((dataset) => dataset.name === "getPolicyClaims");
  assert.equal(claims.status, "failure");
  assert.equal(claims.httpStatus, 503);
  assert.equal(claims.records, undefined);
});

test("Slug form returns completed datasets and marks the rest timeout when the deadline expires", async () => {
  let aborted = 0;
  const fakeFetch = (url, init = {}) => {
    if (url.endsWith("/visas")) {
      return Promise.resolve(new Response(JSON.stringify([
        { destinationIso: "de", slug: "opportunity-card", source: { url: "https://official.example/route" } }
      ]), { status: 200 }));
    }
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        aborted++;
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  };
  const startedAt = Date.now();
  const result = await executeTool("getRouteFactPack", {
    countryCode: "DE", slug: "opportunity-card", datasets: ["getVisaRoutes", "getVisaFees", "getSourceFreshness"]
  }, fakeFetch, { deadlineMs: 50 });
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(result.isError, false);
  const pack = result.structuredContent;
  assert.equal(pack.status, "partial");
  assert.deepEqual(pack.coverage, {
    denominator: 3, denominatorBasis: "datasets_selected",
    successful: 1, failed: 0, timedOut: 2, percentage: 33.3
  });
  assert.deepEqual(pack.datasets.map((dataset) => dataset.status), ["success", "timeout", "timeout"]);
  assert.equal(pack.datasets[0].records[0].source.url, "https://official.example/route");
  assert.equal(pack.datasets[1].records, undefined);
  assert.equal(aborted, 2);
});

test("Slug form keeps the dataset budget and rejects an unscoped route before fetching", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response("[]", { status: 200 }); };
  for (const args of [
    { countryCode: "DE", slug: "opportunity-card", datasets: [
      "getVisaRoutes", "getPolicyClaims", "getPolicyUpdates", "getVisaFees",
      "getSalaryThresholds", "getProcessingTimes", "getSourceFreshness"] },
    { slug: "opportunity-card" },
    { countryCode: "DE", slug: "opportunity-card", limit: 10 }
  ]) {
    const result = await executeTool("getRouteFactPack", args, fakeFetch);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error, "invalid_route_fact_pack_input");
  }
  assert.equal(calls, 0);
});
