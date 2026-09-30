import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";
import { supervisorCacheStoreFromEnv } from "../supervisor-discovery.mjs";

const scope = { countryCode: "DE", field: "Physics", researchFocus: "Astrobiology" };
const work = { id: "https://openalex.org/W123", title: "Astrobiology research", publication_year: 2025,
  authorships: [{ author: { id: "https://openalex.org/A123", display_name: "Ada Researcher" },
    institutions: [{ id: "https://openalex.org/I123", display_name: "Example University",
      country_code: "DE", type: "education", ror: "https://ror.org/012345678" }] }] };
const ror = { id: "https://ror.org/012345678", locations: [{ geonames_details: { country_code: "DE" } }] };

function fakeFetch(url) {
  if (String(url).startsWith("https://api.openalex.org/works?")) {
    return Promise.resolve(new Response(JSON.stringify({ results: [work] }), { status: 200 }));
  }
  if (url === "https://api.ror.org/v2/organizations/012345678") {
    return Promise.resolve(new Response(JSON.stringify(ror), { status: 200 }));
  }
  throw new Error(`Unexpected URL ${url}`);
}

test("discovery persists minimal names, reuses them, and never marks them officially verified", async () => {
  const saved = new Map();
  const store = { kind: "redis", async read(key) { return saved.get(key) ?? null; },
    async write(key, value, ttl) { assert.equal(ttl, 30 * 86400); saved.set(key, value); } };
  const options = { supervisorCacheStore: store };
  const first = await executeTool("discoverAcademicSupervisorCandidates", scope, fakeFetch, options);
  assert.equal(first.isError, false, JSON.stringify(first.structuredContent));
  assert.equal(first.structuredContent.candidates[0].name, "Ada Researcher");
  assert.equal(first.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(first.structuredContent.coverage.cacheWrite, "saved");
  assert.equal(saved.size, 1);
  assert.doesNotMatch(JSON.stringify([...saved.values()]), /Astrobiology research|email|Iranian/);
  const second = await executeTool("discoverAcademicSupervisorCandidates", scope,
    async (url) => String(url).startsWith("https://api.openalex.org/")
      ? new Response("quota", { status: 429 }) : fakeFetch(url), options);
  assert.equal(second.isError, false);
  assert.equal(second.structuredContent.candidates[0].name, "Ada Researcher");
  assert.equal(second.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(second.structuredContent.coverage.cacheRead, "hit");
  assert.equal(second.structuredContent.coverage.apiStatus, "unavailable");
  assert.match(second.structuredContent.note, /official institutional pages/);
  assert.equal(TOOLS.find((tool) => tool.name === "discoverAcademicSupervisorCandidates")?.annotations?.readOnlyHint, false);
});

test("discovery rejects applicant data before calling an API or database", async () => {
  let called = false;
  const result = await executeTool("discoverAcademicSupervisorCandidates", { ...scope, applicantName: "Private" },
    async () => { called = true; throw new Error("unreachable"); },
    { supervisorCacheStore: { async read() { called = true; }, async write() { called = true; } } });
  assert.equal(result.isError, true);
  assert.equal(called, false);
});

test("a company coauthor in a country-filtered work is not a professor candidate", async () => {
  const mixed = structuredClone(work);
  mixed.authorships.unshift({ author: { id: "https://openalex.org/A999", display_name: "Industry Author" },
    institutions: [{ display_name: "Example Company", country_code: "DE", type: "company", ror: null }] });
  const result = await executeTool("discoverAcademicSupervisorCandidates", scope,
    async (url) => String(url).startsWith("https://api.openalex.org/")
      ? new Response(JSON.stringify({ results: [mixed] }), { status: 200 }) : fakeFetch(url),
    { supervisorCacheStore: null });
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.name), ["Ada Researcher"]);
});

test("shared Redis cache uses expiring writes and does not log search terms in its key", async () => {
  const commands = [];
  const store = supervisorCacheStoreFromEnv({ KV_REST_API_URL: "https://redis.example", KV_REST_API_TOKEN: "secret" },
    async (url, init) => {
      assert.equal(url, "https://redis.example/");
      assert.equal(init.headers.Authorization, "Bearer secret");
      const command = JSON.parse(init.body);
      commands.push(command);
      return new Response(JSON.stringify({ result: command[0] === "GET" ? null : "OK" }), { status: 200 });
    });
  const result = await executeTool("discoverAcademicSupervisorCandidates", scope, fakeFetch,
    { supervisorCacheStore: store });
  assert.equal(result.isError, false);
  assert.deepEqual(commands.map((item) => item[0]), ["GET", "SETEX"]);
  assert.equal(commands[1][2], 30 * 86400);
  assert.doesNotMatch(commands[1][1], /Physics|Astrobiology/);
  assert.deepEqual(JSON.parse(commands[1][3]).map((item) => Object.keys(item).sort()),
    [["countryCode", "institution", "name", "openAlexId", "rorId"]]);
});
