import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../server.mjs";

const env = { HAMRAH_JSEARCH_ENABLED: "true", HAMRAH_JSEARCH_FREE_PLAN_CONFIRMED: "true", OPENWEBNINJA_API_KEY: "fixture-key" };
const input = { field: "physics", targetCategory: "postdoc", countryCode: "FR" };
const job = (id, overrides = {}) => ({ job_id: id, job_title: "Postdoctoral Researcher in Physics",
  employer_name: "Example University", job_country: "FR", job_apply_link: `https://jobs.example.edu/postings/${id}`,
  job_apply_is_direct: true, job_publisher: "University website", job_posted_at_datetime_utc: "2026-09-29T00:00:00.000Z",
  job_description: "Contact Person private@example.test", ...overrides });
const response = (jobs, cursor = null) => new Response(JSON.stringify({ status: "OK", data: { jobs, cursor } }));

test("configured JSearch adds country-scoped university leads while keeping official verification separate", async () => {
  const requests = [];
  const result = await executeTool("discoverAcademicCallCandidates", input, async (url, options) => {
    requests.push({ url, options });
    return response([job("j1"), job("j2", { job_country: "US" }), job("j3", { job_title: "Software engineer" })]);
  }, { academicOpeningDiscovery: { env } });
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["j1"]);
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(result.structuredContent.candidates[0].deadlineText, null);
  assert.doesNotMatch(JSON.stringify(result), /Contact Person|private@example|fixture-key/);
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["FR"]);
  assert.equal(requests.length, 1);
  const url = new URL(requests[0].url);
  assert.equal(url.origin + url.pathname, "https://api.openwebninja.com/jsearch/search-v2");
  assert.equal(url.searchParams.get("country"), "fr");
  assert.equal(url.searchParams.get("num_pages"), "1");
  assert.match(url.searchParams.get("query"), /physics.*postdoc.*France/i);
  assert.doesNotMatch(requests[0].url, /fixture-key/);
  assert.equal(requests[0].options.headers["x-api-key"], "fixture-key");
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(result.structuredContent.coverage.apiCoverage, "partial");
});

test("a worldwide JSearch request reports its bounded countries and stops immediately on exhausted quota", async () => {
  const countries = [];
  const result = await executeTool("discoverAcademicCallCandidates", { field: "physics", targetCategory: "postdoc" },
    async (url) => {
      if (url.startsWith("https://api.openwebninja.com/")) {
        const country = new URL(url).searchParams.get("country");
        countries.push(country);
        return country === "us" ? response([job("us1", { job_country: "US" })], "next-page")
          : new Response("quota exceeded fixture-key", { status: 429 });
      }
      if (url.includes("jobsearch.api.jobtechdev.se")) return new Response('{"hits":[],"total":{"value":0}}');
      if (url.includes("greenhouse.io")) return new Response('{"jobs":[]}');
      if (url.includes("smartrecruiters.com")) return new Response('{"content":[],"totalFound":0}');
      return new Response('[]');
    }, { academicOpeningDiscovery: { env } });
  assert.deepEqual(countries, ["us", "gb"]);
  assert.equal(result.structuredContent.status, "partial");
  assert.equal(result.structuredContent.coverage.truncated, true);
  const scope = result.structuredContent.coverage.sourceScopes.find((item) => item.source === "jsearch:openwebninja");
  assert.deepEqual(scope.countriesRequested, ["US", "GB", "DE", "CA", "AU"]);
  assert.equal(scope.persistence, "disabled");
  assert.equal(result.structuredContent.coverage.failures.at(-1).reason, "HTTP 429");
  assert.doesNotMatch(JSON.stringify(result), /fixture-key/);
});

test("untrusted provider metadata cannot echo the configured credential or private application contacts", async () => {
  const result = await executeTool("discoverAcademicCallCandidates", input,
    async () => response([job("fixture-key"), job("safe", { job_apply_link: "https://jobs.example.edu/?key=fixture-key" }),
      job("safe2", { employer_name: "Example University fixture-key" }), job("good")]),
    { academicOpeningDiscovery: { env } });
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["good"]);
  assert.doesNotMatch(JSON.stringify(result), /fixture-key|private@example/);
});

test("JSearch requires free-plan confirmation, caps the response, and never covers Master's admissions", async () => {
  for (const current of [{}, { HAMRAH_JSEARCH_ENABLED: "true", OPENWEBNINJA_API_KEY: "fixture-key" },
    { ...env, HAMRAH_JSEARCH_ENABLED: "false" }]) {
    let calls = 0;
    const result = await executeTool("discoverAcademicCallCandidates", input, async () => { calls++; return response([]); },
      { academicOpeningDiscovery: { env: current } });
    assert.equal(calls, 0);
    assert.deepEqual(result.structuredContent.candidates, []);
    if (current.HAMRAH_JSEARCH_ENABLED === "true") assert.equal(result.structuredContent.status, "partial");
  }
  const oversized = await executeTool("discoverAcademicCallCandidates", input,
    async () => new Response(" ".repeat(100001)), { academicOpeningDiscovery: { env } });
  assert.equal(oversized.structuredContent.coverage.failures[0].reason, "JSearch response exceeds size limit");
  const masters = await executeTool("discoverAcademicCallCandidates", { ...input, targetCategory: "masters" },
    async () => { throw new Error("no job search for Master's admissions"); }, { academicOpeningDiscovery: { env } });
  assert.ok(!masters.structuredContent.coverage.apiSources.includes("jsearch:openwebninja"));
});

test("a slow JSearch source stops within its own budget and preserves explicit partial coverage", async () => {
  const result = await executeTool("discoverAcademicCallCandidates", input, (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("source aborted")), { once: true });
  }), { deadlineMs: 100, academicOpeningDiscovery: { env, jsearchDeadlineMs: 5 } });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "partial");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, []);
});

test("a PhD credential mentioned in a job title is not a doctoral opening", async () => {
  const result = await executeTool("discoverAcademicCallCandidates", { ...input, targetCategory: "phd" },
    async () => response([job("credential", { job_title: "Scientist in Physics - PhD required" }),
      job("doctoral", { job_title: "PhD student position in physics" }), job("postdoc", { job_title: "Postdoctoral physics researcher" })]),
    { academicOpeningDiscovery: { env } });
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["doctoral"]);
});
