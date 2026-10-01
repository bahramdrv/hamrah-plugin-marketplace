import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../server.mjs";

const input = { field: "physics", targetCategory: "postdoc", countryCode: "SE" };
const posting = (id, overrides = {}) => ({ id, headline: "Postdoc in physics",
  webpage_url: `https://arbetsformedlingen.se/platsbanken/annonser/${id}`,
  application_deadline: "2099-10-20T23:59:59", removed: false,
  employer: { name: "Example University", organization_number: "2021001234" },
  workplace_address: { country: "Sverige", country_code: "199" }, ...overrides });
const response = (hits, total = hits.length) => new Response(JSON.stringify({ total: { value: total }, hits }));

function storeFixture() {
  let saved = null;
  let leased = false;
  return {
    async take(now) {
      if (saved && now - saved.observedAt < 600_000) return { state: "hit", snapshot: saved };
      if (leased) return { state: "busy", snapshot: saved };
      leased = true;
      return { state: "refresh", snapshot: saved, lease: "lease" };
    },
    async save(lease, snapshot) { saved = structuredClone(snapshot); leased = false; },
    async release() { leased = false; }
  };
}

test("Swedish postdoc discovery keeps exact domestic public leads and reports its bounded scope", async () => {
  const requests = [];
  const result = await executeTool("discoverAcademicCallCandidates", input, async (url, options) => {
    requests.push({ url, options });
    return response([posting("31500001"), posting("31500002", { removed: true }),
      posting("31500003", { webpage_url: "https://example.org/unrelated" }),
      posting("31500004", { headline: "Research assistant in physics" }),
      posting("31500005", { workplace_address: { country: "Norge", country_code: "159" } }),
      posting("31500006", { application_deadline: "2020-01-01T23:59:59" })], 140);
  });
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent.candidates.map((candidate) => candidate.sourceId), ["31500001"]);
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(result.structuredContent.candidates[0].discoverySource, "jobtech:se:postdoc");
  assert.equal(result.structuredContent.coverage.truncated, true);
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["SE"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://jobsearch.api.jobtechdev.se/search?q=postdoc&limit=100");
  assert.ok(requests[0].options.headers["X-Fields"]);
  assert.equal(requests[0].options.headers.Authorization, undefined);
});

test("a shared Swedish source snapshot serves another public field without saving search history", async () => {
  let now = Date.parse("2026-10-01T12:00:00Z");
  const store = storeFixture();
  let apiCalls = 0;
  const fetchImpl = async () => { apiCalls++; return response([
    posting("31500001"), posting("31500002", { headline: "Postdoc in chemistry" })]); };
  const options = { academicOpeningDiscovery: { now: () => now, store } };
  const first = await executeTool("discoverAcademicCallCandidates", input, fetchImpl, options);
  now += 30_000;
  const second = await executeTool("discoverAcademicCallCandidates", { ...input, field: "chemistry" }, fetchImpl, options);
  assert.equal(first.structuredContent.coverage.openingCache.write, "saved");
  assert.deepEqual(second.structuredContent.candidates.map((item) => item.sourceId), ["31500002"]);
  assert.equal(second.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(second.structuredContent.coverage.openingCache.read, "hit");
  assert.equal(second.structuredContent.coverage.openingCache.apiSearch, "skipped_recent_snapshot");
  assert.equal(second.structuredContent.coverage.openingCache.ageSeconds, 30);
  assert.equal(apiCalls, 1, "public searches share one fixed provider scope");
});

test("a stale source snapshot refreshes before returning and includes newly posted leads", async () => {
  let now = Date.parse("2026-10-01T12:00:00Z");
  const store = storeFixture();
  let apiCalls = 0;
  const fetchImpl = async () => response(apiCalls++ ? [posting("31500002")] : [posting("31500001")]);
  const options = { academicOpeningDiscovery: { now: () => now, store } };
  await executeTool("discoverAcademicCallCandidates", input, fetchImpl, options);
  now += 600_000;
  const next = await executeTool("discoverAcademicCallCandidates", input, fetchImpl, options);
  assert.deepEqual(next.structuredContent.candidates.map((item) => item.sourceId), ["31500002"]);
  assert.equal(next.structuredContent.coverage.openingCache.apiSearch, "searched");
});

test("quota or an in-flight refresh produces visible partial coverage without extra provider calls", async () => {
  for (const state of ["quota", "busy"]) {
    let apiCalls = 0;
    const result = await executeTool("discoverAcademicCallCandidates", input,
      async () => { apiCalls++; return response([posting("31500001")]); },
      { academicOpeningDiscovery: { store: { async take() { return { state, snapshot: null }; } } } });
    assert.equal(apiCalls, 0);
    assert.equal(result.structuredContent.status, "partial");
    assert.deepEqual(result.structuredContent.candidates, []);
    assert.equal(result.structuredContent.coverage.failures[0].source, "jobtech:se:postdoc");
    assert.equal(result.structuredContent.coverage.openingCache.apiSearch, `skipped_${state}`);
  }
});

test("expired, corrupt or injected cache records cannot become current discovery evidence", async () => {
  const now = Date.parse("2026-10-02T00:01:00Z");
  for (const snapshot of [
    { schemaVersion: "1.0.0", observedAt: now - 30000, leads: [{ ...posting("31500001"), verificationStatus: "verified" }], truncated: false },
    { schemaVersion: "1.0.0", observedAt: now - 30000, leads: [], truncated: false, applicantProfile: { name: "private" } }
  ]) {
    const result = await executeTool("discoverAcademicCallCandidates", input, async () => response([posting("31500002")]),
      { academicOpeningDiscovery: { now: () => now, store: { async take() { return { state: "hit", snapshot }; } } } });
    assert.deepEqual(result.structuredContent.candidates, []);
    assert.equal(result.structuredContent.status, "partial");
    assert.equal(result.structuredContent.coverage.failures[0].reason, "invalid_cached_snapshot");
  }
  let clock = now - 60000;
  const store = storeFixture();
  const options = { academicOpeningDiscovery: { now: () => clock, store } };
  await executeTool("discoverAcademicCallCandidates", input,
    async () => response([posting("31500003", { application_deadline: "2026-10-02T23:59:59" })]), options);
  clock = now;
  const cached = await executeTool("discoverAcademicCallCandidates", input, async () => { throw Error("no fetch on hit"); }, options);
  assert.deepEqual(cached.structuredContent.candidates, [], "a same-day deadline is conservatively excluded");
});

test("a provider failure releases the refresh and keeps cached hints visibly stale", async () => {
  let now = Date.parse("2026-10-01T12:00:00Z");
  const store = storeFixture();
  const options = { academicOpeningDiscovery: { now: () => now, store } };
  await executeTool("discoverAcademicCallCandidates", input, async () => response([posting("31500001")]), options);
  now += 600000;
  const failed = await executeTool("discoverAcademicCallCandidates", input, async () => new Response("unavailable", { status: 503 }), options);
  assert.equal(failed.structuredContent.status, "partial");
  assert.equal(failed.structuredContent.coverage.openingCache.read, "stale");
  assert.equal(failed.structuredContent.candidates[0].verificationStatus, "unverified");
  const recovered = await executeTool("discoverAcademicCallCandidates", input, async () => response([posting("31500002")]), options);
  assert.deepEqual(recovered.structuredContent.candidates.map((item) => item.sourceId), ["31500002"]);
});

test("Redis-backed persistence keeps only public source metadata and is explicitly opt-in", async () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const commands = [];
  const env = { HAMRAH_ACADEMIC_OPENING_CACHE_ENABLED: "true",
    UPSTASH_REDIS_REST_URL: "https://cache.example.test", UPSTASH_REDIS_REST_TOKEN: "fixture" };
  const cacheFetch = async (url, options) => {
    commands.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ result: commands.length === 1
      ? JSON.stringify({ state: "refresh", lease: "fixture-lease", snapshot: null }) : "OK" }));
  };
  const result = await executeTool("discoverAcademicCallCandidates", input,
    async () => response([posting("31500001", { description: { text: "Contact Person private@example.test" },
      application_contacts: [{ name: "Contact Person", email: "private@example.test" }] })]),
    { academicOpeningDiscovery: { env, cacheFetch, now: () => now } });
  assert.equal(result.structuredContent.coverage.openingCache.write, "saved");
  assert.equal(commands.length, 2);
  const persisted = JSON.parse(commands[1].at(-1));
  assert.equal(persisted.leads.length, 1);
  assert.equal(persisted.leads[0].publisherId, "2021001234");
  assert.equal(persisted.leads[0].verificationStatus, "unverified");
  assert.doesNotMatch(JSON.stringify(commands), /private@example|Contact Person|applicant/);
  const disabled = await executeTool("discoverAcademicCallCandidates", input, async () => response([]),
    { academicOpeningDiscovery: { env: { ...env, HAMRAH_ACADEMIC_OPENING_CACHE_ENABLED: "false" }, cacheFetch } });
  assert.equal(disabled.structuredContent.coverage.openingCache.read, "disabled");
  assert.equal(commands.length, 2, "disabled persistence does not touch Redis");
});

test("a throttled provider releases its lease with a cooldown and no retry", async () => {
  let requests = 0;
  const releases = [];
  const result = await executeTool("discoverAcademicCallCandidates", input, async () => {
    requests++;
    return new Response("throttled", { status: 429, headers: { "Retry-After": "120" } });
  }, { academicOpeningDiscovery: { store: {
    async take() { return { state: "refresh", lease: "lease" }; },
    async release(...args) { releases.push(args); }
  } } });
  assert.equal(requests, 1);
  assert.deepEqual(releases, [["lease", 120]]);
  assert.equal(result.structuredContent.status, "partial");
  assert.deepEqual(result.structuredContent.candidates, []);
});

test("enabled persistence without credentials never bypasses its quota guard", async () => {
  let requests = 0;
  const result = await executeTool("discoverAcademicCallCandidates", input, async () => {
    requests++;
    return response([posting("31500001")]);
  }, { academicOpeningDiscovery: { env: { HAMRAH_ACADEMIC_OPENING_CACHE_ENABLED: "true" } } });
  assert.equal(requests, 0);
  assert.equal(result.structuredContent.coverage.openingCache.read, "unavailable");
  assert.equal(result.structuredContent.status, "partial");
});
