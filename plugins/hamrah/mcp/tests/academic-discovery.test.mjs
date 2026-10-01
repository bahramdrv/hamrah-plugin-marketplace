import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../server.mjs";
import { renderPrivateAcademicFit } from "../../skills/hamrah-program-finder/scripts/render_academic_discovery_fit_notes.mjs";

const clock = () => new Date("2026-10-01T10:00:00Z");
const disabled = { env: {}, now: clock, store: null };
const enabled = { env: { HAMRAH_ACADEMIC_DISCOVERY_ENABLED: "true", HAMRAH_TAVILY_ENABLED: "true", TAVILY_API_KEY: "test-key", HAMRAH_TAVILY_FREE_PLAN_CONFIRMED: "true" }, now: clock, store: null };

test("incomplete academic input returns a Persian exploratory report, equivalent fields use the same query plan", async () => {
  const run = (field) => executeTool("discoverAcademicMatches", { type: "phd", field },
    async () => { throw new Error("unconfigured sources must not be contacted"); }, { academicDiscovery: disabled });
  const fa = await run("هوش مصنوعی");
  const en = await run("AI");
  assert.equal(fa.isError, false, JSON.stringify(fa.structuredContent));
  assert.deepEqual(fa.structuredContent, en.structuredContent);
  assert.equal(fa.structuredContent.scope.field, "artificial intelligence");
  assert.equal(fa.structuredContent.inputCompleteness.mode, "exploratory");
  assert.equal(fa.structuredContent.status, "partial");
  assert.deepEqual(fa.structuredContent.verifiedResults, []);
  assert.match(fa.content[0].text, /شواهد|بررسی/);
  assert.equal(fa.content[0].text, fa.structuredContent.markdown);
});

test("verified results require freshly retrieved official evidence; source excerpts and tokens cannot be forged", async () => {
  const claims = [
    { kind: "title", excerpt: "Doctoral Researcher in artificial intelligence" },
    { kind: "research", excerpt: "Research on artificial intelligence and machine learning" },
    { kind: "application", excerpt: "Applications are open until 15 October 2026", mode: "dated", deadline: "2026-10-15" },
    { kind: "funding", excerpt: "The position provides a salary", fundingStatus: "guaranteed" }
  ];
  const input = { type: "phd", title: "Doctoral Researcher in artificial intelligence", institution: "Example University",
    countryCode: "DE", rorId: "https://ror.org/03yrm5c26", url: "https://uni.example/jobs/42", claims };
  const options = { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough",
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } };
  const fetcher = async (url) => {
    if (url.startsWith("https://api.ror.org/")) return Response.json({ id: input.rorId, status: "active", types: ["education"],
      names: [{ value: "Example University", types: ["ror_display"] }], locations: [{ geonames_details: { country_code: "DE" } }],
      links: [{ type: "website", value: "https://uni.example/" }] });
    return new Response(`<html><main>${claims.map((c) => `<p>${c.excerpt}</p>`).join("")}</main></html>`, { headers: { "content-type": "text/html" } });
  };
  const verified = await executeTool("verifyAcademicEvidence", input, fetcher, options);
  assert.equal(verified.isError, false, JSON.stringify(verified.structuredContent));
  assert.equal(verified.structuredContent.verificationStatus, "verified_open");
  assert.ok(verified.structuredContent.evidenceToken);
  const rendered = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "AI", countryCode: "DE" },
    evidenceTokens: [verified.structuredContent.evidenceToken], candidates: [] }, fetcher, options);
  assert.equal(rendered.isError, false, JSON.stringify(rendered.structuredContent));
  assert.equal(rendered.structuredContent.verifiedResults.length, 1);
  assert.match(rendered.content[0].text, /حقوق|فاند/);
  const missing = await executeTool("verifyAcademicEvidence", { ...input, claims: [...claims, { kind: "requirement", excerpt: "No English test is required" }] }, fetcher, options);
  assert.equal(missing.structuredContent.verificationStatus, "unverified");
  const forged = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "AI" }, evidenceTokens: ["forged"], candidates: [] }, fetcher, options);
  assert.equal(forged.structuredContent.verifiedResults.length, 0);
  assert.ok(forged.structuredContent.coverage.failures.some((f) => f.reason === "invalid_or_expired_evidence_token"));
  const expiredToken = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "AI" }, evidenceTokens: [verified.structuredContent.evidenceToken], candidates: [] }, fetcher,
    { academicDiscovery: { ...options.academicDiscovery, now: () => new Date("2026-10-01T10:16:00Z") } });
  assert.equal(expiredToken.structuredContent.verifiedResults.length, 0);
  const wrongScope = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "AI", institution: "Other University" }, evidenceTokens: [verified.structuredContent.evidenceToken], candidates: [] }, fetcher, options);
  assert.equal(wrongScope.structuredContent.verifiedResults.length, 0);
  assert.equal(wrongScope.structuredContent.exclusions[0].reason, "outside_requested_scope");
  const changedFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(`${claims.map((c) => c.excerpt).join(" ")} Additional official guidance.`, { headers: { "content-type": "text/html" } });
  const changed = await executeTool("verifyAcademicEvidence", input, changedFetcher, options);
  const replayArgs = { request: { type: "phd", field: "AI" }, evidenceTokens: [changed.structuredContent.evidenceToken], previousEvidenceTokens: [verified.structuredContent.evidenceToken], candidates: [] };
  const replay = await executeTool("renderAcademicDiscoveryReport", replayArgs, changedFetcher, options);
  assert.equal(replay.structuredContent.changes[0].status, "official_evidence_changed");
  assert.deepEqual(replay, await executeTool("renderAcademicDiscoveryReport", replayArgs, changedFetcher, options));
  const abbreviated = { ...input, title: "Doctoral Researcher in AI", claims: claims.map((c) => ["title", "research"].includes(c.kind) ? { ...c, excerpt: c.excerpt.replaceAll("artificial intelligence", "AI") } : c) };
  const abbreviatedFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(abbreviated.claims.map((c) => c.excerpt).join(" "), { headers: { "content-type": "text/html" } });
  const abbreviationEvidence = await executeTool("verifyAcademicEvidence", abbreviated, abbreviatedFetcher, options);
  const abbreviationReport = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "هوش مصنوعی" }, evidenceTokens: [abbreviationEvidence.structuredContent.evidenceToken], candidates: [] }, abbreviatedFetcher, options);
  assert.equal(abbreviationReport.structuredContent.verifiedResults.length, 1, "registered aliases in primary evidence must match the canonical field");
  const conditionalFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(`${claims.map((c) => c.excerpt).join(" ")} subject to external funding approval.`, { headers: { "content-type": "text/html" } });
  const conditional = await executeTool("verifyAcademicEvidence", input, conditionalFetcher, options);
  assert.equal(conditional.structuredContent.fundingStatus, "unknown", "a clipped excerpt cannot hide adjacent conditional funding terms");
});

test("API and web discovery remain unverified, use bounded public queries, and keep partial source failures", async () => {
  const requests = [];
  const result = await executeTool("discoverAcademicMatches", { type: "program", field: "AI", countryCode: "DE" }, async (url, options) => {
    requests.push({ url, options });
    if (url === "https://api.tavily.com/search") return Response.json({ results: [
      { title: "Artificial Intelligence MSc", url: "https://uni.example/study/ai?utm_source=search", content: "Applications open, funded scholarship" },
      { title: "Unsafe", url: "http://127.0.0.1/private" }
    ] });
    throw new Error("provider response with SECRET should not be reflected");
  }, { academicDiscovery: enabled });
  const report = result.structuredContent;
  assert.equal(result.isError, false);
  assert.equal(report.discoveryCandidates.length, 1);
  assert.equal(report.discoveryCandidates[0].url, "https://uni.example/study/ai");
  assert.deepEqual(report.verifiedResults, []);
  const query = JSON.parse(requests.find((r) => r.url === "https://api.tavily.com/search").options.body);
  assert.equal(query.include_answer, false);
  assert.equal(query.include_raw_content, false);
  assert.equal(query.auto_parameters, false);
  assert.equal(query.search_depth, "basic");
  assert.doesNotMatch(JSON.stringify(report), /funded scholarship|SECRET|test-key/);
  assert.ok(report.coverage.sources.some((s) => s.source === "tavily" && s.status === "ok"));
  const invalid = await executeTool("discoverAcademicMatches", { type: "supervisor", field: "email me at private@example.com", profile: {} }, async () => { assert.fail("private input must not be sent"); });
  assert.equal(invalid.isError, true);
});

test("licensed university metadata is reused without retaining web snippets or renewing absolute record expiry", async () => {
  const persisted = new Map(); let writes = 0, rorReads = 0;
  const store = { kind: "fixture", read: async (key) => persisted.get(key), write: async (key, value, ttl) => { persisted.set(key, value); writes++; assert.equal(ttl, 604800); } };
  const fetcher = async (url) => {
    if (url.startsWith("https://api.ror.org/")) { rorReads++; return Response.json({ number_of_results: 1, items: [{ id: "https://ror.org/03yrm5c26", status: "active", types: ["education"], names: [{ value: "Example University", types: ["ror_display"] }],
      links: [{ type: "website", value: "https://uni.example/" }], locations: [{ geonames_details: { country_code: "DE" } }] }] }); }
    throw new Error("unexpected provider");
  };
  const args = { type: "university", field: "physics", institution: "Example University", countryCode: "DE" };
  const opts = { academicDiscovery: { env: { HAMRAH_ACADEMIC_DISCOVERY_ENABLED: "true" }, now: clock, store } };
  const first = await executeTool("discoverAcademicMatches", args, fetcher, opts);
  const second = await executeTool("discoverAcademicMatches", args, fetcher, opts);
  assert.equal(rorReads, 1);
  assert.equal(writes, 1);
  assert.equal(first.structuredContent.discoveryCandidates.length, 1);
  assert.equal(second.structuredContent.coverage.sources.find((s) => s.source === "ror").cache, "hit");
  assert.equal(second.structuredContent.discoveryCandidates[0].verificationStatus, "unverified");
  assert.doesNotMatch([...persisted.values()].join(""), /profile|applicant|excerpt|snippet|queryPlan|tavily/);
  const program = await executeTool("discoverAcademicMatches", { ...args, type: "program" }, fetcher, opts);
  assert.equal(program.structuredContent.discoveryCandidates.length, 0, "cached universities must not be recast as academic programs");
  assert.equal(program.structuredContent.researchContext.length, 1);
});

test("unsafe DNS, expired calls and competitive funding never produce a verified funded opening", async () => {
  const input = { type: "phd", title: "Doctoral Researcher in physics", institution: "Example University", countryCode: "DE",
    rorId: "https://ror.org/03yrm5c26", url: "https://uni.example/jobs/42", claims: [
      { kind: "title", excerpt: "Doctoral Researcher in physics" },
      { kind: "research", excerpt: "Research in experimental physics" },
      { kind: "application", excerpt: "Applications open until 15 October 2026", mode: "dated", deadline: "2026-10-15" },
      { kind: "funding", excerpt: "A competitive scholarship may cover the tuition", fundingStatus: "guaranteed" }
    ] };
  const fetcher = async (url) => url.startsWith("https://api.ror.org/") ? Response.json({ id: input.rorId, status: "active", types: ["education"],
    names: [{ value: input.institution }], links: [{ type: "website", value: "https://uni.example/" }], locations: [{ geonames_details: { country_code: "DE" } }] })
    : new Response(input.claims.map((c) => c.excerpt).join(" "), { headers: { "content-type": "text/html" } });
  const options = { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "127.0.0.1", family: 4 }] } };
  const unsafe = await executeTool("verifyAcademicEvidence", input, fetcher, options);
  assert.equal(unsafe.structuredContent.verificationStatus, "unverified");
  assert.equal(unsafe.structuredContent.evidenceToken, null);
  const publicOptions = { academicDiscovery: { ...options.academicDiscovery, resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } };
  const valid = await executeTool("verifyAcademicEvidence", input, fetcher, publicOptions);
  const report = await executeTool("renderAcademicDiscoveryReport", { request: { type: "phd", field: "physics", fundingRequired: true }, evidenceTokens: [valid.structuredContent.evidenceToken], candidates: [] }, fetcher, publicOptions);
  assert.equal(report.structuredContent.verifiedResults.length, 0);
  assert.equal(report.structuredContent.exclusions[0].reason, "guaranteed_funding_not_confirmed");
  const expired = await executeTool("verifyAcademicEvidence", input, fetcher, { academicDiscovery: { ...publicOptions.academicDiscovery, now: () => new Date("2026-10-16T10:00:00Z") } });
  assert.equal(expired.structuredContent.verificationStatus, "unverified");
  const mislabeledRolling = await executeTool("verifyAcademicEvidence", { ...input, claims: input.claims.map((c) => c.kind === "application"
    ? { kind: c.kind, excerpt: c.excerpt, mode: "rolling" } : c) }, fetcher,
    { academicDiscovery: { ...publicOptions.academicDiscovery, now: () => new Date("2026-10-16T10:00:00Z") } });
  assert.equal(mislabeledRolling.structuredContent.verificationStatus, "unverified", "calling a dated expired application rolling must not reopen it");
  const rolling = { ...input, claims: input.claims.map((c) => c.kind === "application"
    ? { kind: c.kind, excerpt: "Applications are accepted on a rolling basis until the position is filled", mode: "rolling" } : c) };
  const rollingFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(rolling.claims.map((c) => c.excerpt).join(" "), { headers: { "content-type": "text/html" } });
  const genuinelyRolling = await executeTool("verifyAcademicEvidence", rolling, rollingFetcher, publicOptions);
  assert.equal(genuinelyRolling.structuredContent.verificationStatus, "verified_open");
  const clippedFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(`${rolling.claims.map((c) => c.excerpt).join(" ")} Final application deadline: 15 September 2026.`, { headers: { "content-type": "text/html" } });
  const clipped = await executeTool("verifyAcademicEvidence", rolling, clippedFetcher, publicOptions);
  assert.equal(clipped.structuredContent.verificationStatus, "unverified");
});

test("a funding claim with negation and recruitment that is explicitly closed remain unknown", async () => {
  const claims = [{ kind: "title", excerpt: "Professor of artificial intelligence" },
    { kind: "affiliation", excerpt: "Professor of artificial intelligence at Example University" },
    { kind: "research", excerpt: "Research on artificial intelligence" },
    { kind: "funding", excerpt: "No salary or stipend is provided", fundingStatus: "guaranteed" },
    { kind: "recruitment", excerpt: "We are not accepting new students" }];
  const input = { type: "supervisor", title: claims[0].excerpt, institution: "Example University", countryCode: "DE", rorId: "https://ror.org/03yrm5c26", url: "https://uni.example/faculty/42", claims };
  const fetcher = async (url) => url.startsWith("https://api.ror.org/") ? Response.json({ id: input.rorId, status: "active", types: ["education"],
    names: [{ value: input.institution }], links: [{ type: "website", value: "https://uni.example/" }], locations: [{ geonames_details: { country_code: "DE" } }] })
    : new Response(claims.map((c) => c.excerpt).join(" "), { headers: { "content-type": "text/html" } });
  const result = await executeTool("verifyAcademicEvidence", input, fetcher, { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } });
  assert.equal(result.structuredContent.fundingStatus, "unknown");
  assert.equal(result.structuredContent.recruitmentStatus, "unknown");
  const unsupportedAffiliation = await executeTool("verifyAcademicEvidence", { ...input, claims: claims.filter((c) => c.kind !== "affiliation") }, fetcher,
    { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } });
  assert.equal(unsupportedAffiliation.structuredContent.verificationStatus, "unverified");
  assert.ok(unsupportedAffiliation.structuredContent.reasons.includes("current_affiliation_not_confirmed"));
});

test("an exact requested institution survives the result limit and provider reordering", async () => {
  let reverse = false;
  const fetcher = async (url) => {
    if (url.startsWith("https://api.ror.org/")) {
      const items = ["Example University", "Example Technical University"].map((name, i) => ({ id: `https://ror.org/03yrm5c2${i}`,
        status: "active", types: ["education"], names: [{ value: name, types: ["ror_display"] }],
        links: [{ type: "website", value: `https://${i ? "aaa" : "zzz"}.example/` }], locations: [{ geonames_details: { country_code: "DE" } }] }));
      return Response.json({ number_of_results: 2, items: reverse ? items.reverse() : items });
    }
    return Response.json({ results: [{ title: "Artificial Intelligence publisher news", url: "https://a.example/news" }] });
  };
  const request = { type: "university", field: "AI", institution: "Example University", countryCode: "DE", limit: 1 };
  const first = await executeTool("discoverAcademicMatches", request, fetcher, { academicDiscovery: enabled });
  reverse = true;
  const second = await executeTool("discoverAcademicMatches", request, fetcher, { academicDiscovery: enabled });
  assert.equal(first.structuredContent.discoveryCandidates[0].title, "Example University");
  assert.deepEqual(first.structuredContent, second.structuredContent);
});

test("a research grant does not establish student funding and a program needs admission requirements", async () => {
  const claims = [{ kind: "title", excerpt: "Artificial intelligence research program" },
    { kind: "funding", excerpt: "This research grant provides a salary for investigators", fundingStatus: "guaranteed" }];
  const input = { type: "grant", title: claims[0].excerpt, institution: "Example University", countryCode: "DE", rorId: "https://ror.org/03yrm5c26", url: "https://uni.example/research/42", claims };
  const fetcher = async (url) => url.startsWith("https://api.ror.org/") ? Response.json({ id: input.rorId, status: "active", types: ["education"],
    names: [{ value: input.institution }], links: [{ type: "website", value: "https://uni.example/" }], locations: [{ geonames_details: { country_code: "DE" } }] })
    : new Response([...claims.map((c) => c.excerpt), "A bachelor's degree in computer science is required."].join(" "), { headers: { "content-type": "text/html" } });
  const options = { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "203.2.3.4", family: 4 }] } };
  const grant = await executeTool("verifyAcademicEvidence", input, fetcher, options);
  assert.equal(grant.structuredContent.verificationStatus, "verified_official_record", "public university networks must be reachable");
  assert.equal(grant.structuredContent.fundingStatus, "unknown");
  const competitiveGrant = await executeTool("verifyAcademicEvidence", { ...input, claims: [claims[0], { ...claims[1], fundingStatus: "competitive" }] }, fetcher, options);
  assert.equal(competitiveGrant.structuredContent.fundingStatus, "unknown");
  const program = await executeTool("verifyAcademicEvidence", { ...input, type: "program" }, fetcher, options);
  assert.equal(program.structuredContent.verificationStatus, "unverified");
  assert.ok(program.structuredContent.reasons.includes("admission_requirements_not_confirmed"));
  const complete = await executeTool("verifyAcademicEvidence", { ...input, type: "program", claims: [...claims, { kind: "requirement", excerpt: "A bachelor's degree in computer science is required." }] }, fetcher, options);
  assert.equal(complete.structuredContent.verificationStatus, "verified_official_record");
});

test("one timed-out provider and a database outage preserve successful web coverage", async () => {
  const fetcher = async (url) => url === "https://api.tavily.com/search"
    ? Response.json({ results: [{ title: "Physics department", url: "https://uni.example/physics" }] }) : new Promise(() => {});
  const result = await executeTool("discoverAcademicMatches", { type: "program", field: "physics" }, fetcher, { academicDiscovery: { ...enabled,
    sourceTimeoutMs: 30, store: { read: async () => { throw new Error("private backend details"); }, write: async () => assert.fail("failed provider cannot be cached") } } });
  assert.equal(result.structuredContent.discoveryCandidates.length, 1);
  assert.ok(result.structuredContent.coverage.failures.some((f) => f.source === "ror" && f.reason === "source_timeout"));
  assert.ok(result.structuredContent.coverage.sources.some((s) => s.source === "tavily" && s.status === "ok"));
  assert.doesNotMatch(JSON.stringify(result), /private backend/);
});

test("ROR official web subdomains support sibling faculties without trusting another private-domain tenant", async () => {
  const input = { type: "supervisor", title: "Professor of artificial intelligence", institution: "Example University", countryCode: "US", rorId: "https://ror.org/03yrm5c26", url: "https://faculty.university.edu/person/42",
    claims: [{ kind: "title", excerpt: "Professor of artificial intelligence" }, { kind: "research", excerpt: "Research on artificial intelligence" },
      { kind: "affiliation", excerpt: "Professor of artificial intelligence at Example University" }] };
  let homepage = "https://web.university.edu/";
  const fetcher = async (url) => url.startsWith("https://api.ror.org/") ? Response.json({ id: input.rorId, status: "active", types: ["education"],
    names: [{ value: input.institution }], links: [{ type: "website", value: homepage }], locations: [{ geonames_details: { country_code: "US" } }] })
    : new Response(input.claims.map((c) => c.excerpt).join(" "), { headers: { "content-type": "text/html" } });
  const options = { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } };
  const faculty = await executeTool("verifyAcademicEvidence", input, fetcher, options);
  assert.equal(faculty.structuredContent.verificationStatus, "verified_official_record");
  const formerFetcher = async (url) => url.startsWith("https://api.ror.org/") ? fetcher(url)
    : new Response(`Former ${input.claims.map((c) => c.excerpt).join(" ")}`, { headers: { "content-type": "text/html" } });
  const former = await executeTool("verifyAcademicEvidence", input, formerFetcher, options);
  assert.equal(former.structuredContent.verificationStatus, "unverified");
  assert.ok(former.structuredContent.reasons.includes("current_affiliation_not_confirmed"));
  homepage = "https://university.github.io/";
  const impostor = await executeTool("verifyAcademicEvidence", { ...input, url: "https://other.github.io/person/42" }, fetcher, options);
  assert.equal(impostor.structuredContent.verificationStatus, "unverified");
  assert.ok(impostor.structuredContent.reasons.includes("publisher_delegation_not_confirmed"));
});

test("official HTML character entities are decoded before literal evidence comparison", async () => {
  const input = { type: "program", title: "Artificial intelligence degree", institution: "Example University", countryCode: "DE", rorId: "https://ror.org/03yrm5c26", url: "https://uni.example/study/ai",
    claims: [{ kind: "title", excerpt: "Artificial intelligence degree" }, { kind: "requirement", excerpt: "A Bachelor’s degree is required" }] };
  const fetcher = async (url) => url.startsWith("https://api.ror.org/") ? Response.json({ id: input.rorId, status: "active", types: ["education"],
    names: [{ value: input.institution }], links: [{ type: "website", value: "https://uni.example/" }], locations: [{ geonames_details: { country_code: "DE" } }] })
    : new Response("<main>Artificial intelligence degree. A Bachelor&#8217;s degree is required.</main>", { headers: { "content-type": "text/html" } });
  const result = await executeTool("verifyAcademicEvidence", input, fetcher, { academicDiscovery: { ...disabled, evidenceKey: "fixture-signing-key-that-is-long-enough", resolveHost: async () => [{ address: "93.184.216.34", family: 4 }] } });
  assert.equal(result.structuredContent.verificationStatus, "verified_official_record");
});

test("private fit compares actual official requirements locally and cannot claim complete fit with omitted checks", () => {
  const publicReport = { markdown: "گزارش عمومی", verifiedResults: [{ id: "result1", title: "Physics PhD", claims: [
    { kind: "title", excerpt: "Physics PhD" }, { kind: "requirement", excerpt: "A master's degree is required", sourceUrl: "https://uni.example/jobs/42" },
    { kind: "requirement", excerpt: "English language proof is required", sourceUrl: "https://uni.example/jobs/42" }
  ] }] };
  const note = { resultId: "result1", checks: [{ claimIndex: 1, result: "met", applicantEvidence: "کاربر مدرک ارشد دارد" }], gaps: [] };
  const partial = renderPrivateAcademicFit({ publicReport, fitNotes: [note] });
  assert.match(partial, /همهٔ شرایط تعیین‌کننده هنوز مقایسه نشده‌اند/);
  assert.ok(partial.startsWith(publicReport.markdown));
  assert.throws(() => renderPrivateAcademicFit({ publicReport, fitNotes: [{ ...note, checks: [{ ...note.checks[0], claimIndex: 0 }] }] }), /actual official requirement/);
  const complete = renderPrivateAcademicFit({ publicReport, fitNotes: [{ ...note, checks: [...note.checks, { claimIndex: 2, result: "unknown", applicantEvidence: "مدرک زبان هنوز مشخص نشده" }] }] });
  assert.match(complete, /تطبیق مشروط/);
  assert.match(complete, /https:\/\/uni.example\/jobs\/42/);
  const fullReport = { ...publicReport, scope: { type: "phd", field: "physics" }, checkedAt: clock().toISOString(), inputCompleteness: { mode: "exploratory" },
    coverage: { sources: [], countriesChecked: ["DE"], failures: [], truncated: false }, exclusions: [], changes: [], nextActions: [] };
  fullReport.verifiedResults[0].url = "https://uni.example/jobs/42";
  const failed = renderPrivateAcademicFit({ publicReport: fullReport, fitNotes: [{ ...note, checks: [{ ...note.checks[0], result: "not_met" }] }] });
  assert.doesNotMatch(failed.split("## سرنخ‌های نیازمند بررسی")[0], /Physics PhD/);
  assert.match(failed, /شرط بررسی‌شده برآورده نشده/);
  const nationalityReport = { ...fullReport, verifiedResults: [{ ...fullReport.verifiedResults[0], claims: [...fullReport.verifiedResults[0].claims,
    { kind: "nationality", excerpt: "Applicants must be EU citizens", sourceUrl: "https://uni.example/jobs/42" }] }] };
  const nationalityFailed = renderPrivateAcademicFit({ publicReport: nationalityReport, fitNotes: [{ ...note,
    checks: [{ claimIndex: 3, result: "not_met", applicantEvidence: "کاربر فقط تابعیت ایران دارد" }] }] });
  assert.doesNotMatch(nationalityFailed.split("## سرنخ‌های نیازمند بررسی")[0], /Physics PhD/);
  assert.match(nationalityFailed, /Applicants must be EU citizens/);
});

test("an unsupported job API scope is unavailable, not a successfully received source", async () => {
  const result = await executeTool("discoverAcademicMatches", { type: "masters", field: "physics", countryCode: "GB" }, async () => assert.fail("no selected job API supports this scope"),
    { academicDiscovery: { ...disabled, env: { HAMRAH_ACADEMIC_DISCOVERY_ENABLED: "true" } } });
  const source = result.structuredContent.coverage.sources.find((s) => s.source === "official_and_job_apis");
  assert.equal(source.status, "unavailable");
  assert.ok(result.structuredContent.coverage.failures.some((f) => f.reason === "no_configured_source_for_scope"));
});

test("individual academic source switches stop requests and preserve an explicit coverage gap", async () => {
  const result = await executeTool("discoverAcademicMatches", { type: "supervisor", field: "physics", countryCode: "GB" }, async () => assert.fail("disabled provider must not be called"),
    { academicDiscovery: { ...disabled, env: { HAMRAH_ACADEMIC_DISCOVERY_ENABLED: "true", HAMRAH_ROR_ENABLED: "false", HAMRAH_OPENALEX_ENABLED: "false", HAMRAH_CROSSREF_ENABLED: "false" } } });
  assert.deepEqual(result.structuredContent.verifiedResults, []);
  assert.equal(result.structuredContent.coverage.failures.filter((r) => r.reason === "source_disabled").length, 3);
});
