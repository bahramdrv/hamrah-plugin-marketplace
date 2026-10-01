// Public acceptance cases; no applicant profile or provider credentials are supplied.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const base = process.argv[2] ?? "https://hamrah-plugin-marketplace.vercel.app";
const expectedCommit = process.argv[3];
const observations = [];
process.on("uncaughtException", (error) => {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base, cases: observations, acceptanceError: error.message }, null, 2));
  process.exitCode = 1;
});
let sequence = 0;
async function request(path, body) {
  if (!process.env.HAMRAH_PREVIEW_CLI) {
    const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(35000) });
    assert.equal(response.status, 200, `${path} HTTP ${response.status}`);
    return response.text();
  }
  const directory = await mkdtemp(join(tmpdir(), "hamrah-academic-acceptance-"));
  try {
    const input = join(directory, "request.json"), output = join(directory, "response.txt");
    if (body) await writeFile(input, JSON.stringify(body), { mode: 0o600 });
    await run(process.execPath, [process.env.HAMRAH_PREVIEW_CLI, "curl", path, "--deployment", base, "--", "--silent", "--fail-with-body", "--max-time", "35",
      "--header", "Content-Type: application/json", "--header", "Accept: application/json, text/event-stream", "--output", output,
      ...(body ? ["--request", "POST", "--data-binary", `@${input}`] : [])], { timeout: 45000, maxBuffer: 100000 });
    return await readFile(output, "utf8");
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function rpc(name, args) {
  const started = performance.now();
  const raw = await request("/mcp", { jsonrpc: "2.0", id: ++sequence, method: "tools/call", params: { name, arguments: args } });
  const message = JSON.parse(raw.includes("data: ") ? raw.split("\n").find((line) => line.startsWith("data: ")).slice(6) : raw);
  assert.ok(message.result && !message.result.isError, `${name} returned an error`);
  const result = message.result.structuredContent;
  observations.push({ tool: name, type: args.type ?? args.request?.type, durationMs: Math.round(performance.now() - started),
    status: result.status ?? result.verificationStatus, candidates: result.discoveryCandidates?.length,
    verified: result.verifiedResults?.length, sources: result.coverage?.sources, failures: result.coverage?.failures, reasons: result.reasons });
  if (result.markdown) assert.equal(message.result.content[0].text, result.markdown);
  return result;
}

const health = JSON.parse(await request("/health"));
assert.equal(health.status, "ok");
assert.equal(health.tools, 54);
if (expectedCommit) assert.equal(health.deploymentCommit, expectedCommit);
const scope = { field: "artificial intelligence", countryCode: "GB", limit: 3 };
const university = await rpc("discoverAcademicMatches", { ...scope, type: "university", institution: "University of Oxford" });
assert.ok(university.coverage.sources.some((s) => s.source === "tavily" && s.status === "ok"), "live Tavily search must work");
assert.equal(university.discoveryCandidates[0].institution, "University of Oxford");
assert.equal(university.verifiedResults.length, 0);
const again = await rpc("discoverAcademicMatches", { ...scope, field: "هوش مصنوعی", type: "university", institution: "University of Oxford" });
assert.deepEqual(university.queryPlan, again.queryPlan);
assert.ok(again.coverage.sources.some((s) => s.source === "ror" && s.cache === "hit"), "live public metadata must be reused");

for (const type of ["program", "supervisor", "masters", "phd", "postdoc", "research_job", "funding", "grant"]) {
  const result = await rpc("discoverAcademicMatches", { ...scope, type });
  assert.equal(result.status, "partial");
  assert.equal(result.verifiedResults.length, 0, "API/search snippets must not become verified");
  assert.ok(result.discoveryCandidates.length <= scope.limit);
  assert.equal(result.coverage.globalCoverage, "not_established");
}
const programScope = { type: "program", field: "computer science", countryCode: "US", limit: 3 };
const program = { institution: "Massachusetts Institute of Technology", countryCode: "US", rorId: "https://ror.org/042nb2s44", type: "program", title: "EECS PhD program",
  url: "https://www.eecs.mit.edu/academics/graduate-programs/admission-process/graduate-admissions-faqs/", claims: [
    { kind: "title", excerpt: "In the EECS PhD program" },
    { kind: "program", excerpt: "computer science" },
    { kind: "requirement", excerpt: "earned a Bachelor’s degree by the time they register in EECS" }
  ] };
const verified = await rpc("verifyAcademicEvidence", program);
assert.equal(verified.verificationStatus, "verified_official_record", JSON.stringify(verified.reasons));
assert.ok(verified.evidenceToken);
const report = await rpc("renderAcademicDiscoveryReport", { request: programScope,
  evidenceTokens: [verified.evidenceToken], candidates: [], sourceCoverage: [{ source: "official:mit.edu", status: "ok" }] });
assert.equal(report.verifiedResults.length, 1);
assert.equal(report.verifiedResults[0].fundingStatus, "unknown");
const unsupported = await rpc("verifyAcademicEvidence", { ...program, claims: [...program.claims, { kind: "funding", excerpt: "Every admitted student receives a guaranteed stipend", fundingStatus: "guaranteed" }] });
assert.equal(unsupported.verificationStatus, "unverified");
assert.equal(unsupported.evidenceToken, null);
const funded = await rpc("renderAcademicDiscoveryReport", { request: { ...programScope, fundingRequired: true }, evidenceTokens: [verified.evidenceToken], candidates: [] });
assert.equal(funded.verifiedResults.length, 0);
assert.equal(funded.exclusions[0].reason, "guaranteed_funding_not_confirmed");
if (process.env.HAMRAH_ACADEMIC_REPORT_PATH) await writeFile(process.env.HAMRAH_ACADEMIC_REPORT_PATH, JSON.stringify(report, null, 2));
const times = observations.map((r) => r.durationMs).sort((a, b) => a - b);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base, health, cases: observations,
  latency: { sampleCount: times.length, includesCliOverhead: Boolean(process.env.HAMRAH_PREVIEW_CLI), p50Ms: times[Math.ceil(times.length * .5) - 1], p95Ms: times[Math.ceil(times.length * .95) - 1], interpretation: "small acceptance sample, not a performance guarantee" } }, null, 2));
