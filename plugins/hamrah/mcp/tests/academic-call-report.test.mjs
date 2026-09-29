import assert from "node:assert/strict";
import test from "node:test";

import { executeTool } from "../server.mjs";

const TODAY = new Date().toISOString().slice(0, 10);
const NEXT_YEAR = Number(TODAY.slice(0, 4)) + 1;
const DEADLINE = `${NEXT_YEAR}-10-15`;
const URL = "https://example.edu/jobs/physics-2027";

function base() {
  return {
    checkedAt: TODAY,
    scope: { field: "Physics", targetCategory: "phd", countryCodes: ["DE"], fundingRequired: false },
    coverage: { apiSources: ["daad_phdgermany"], webSearches: ["official university posting"],
      countriesChecked: ["DE"], candidatesChecked: 1, excluded: [], failures: [], truncated: false },
    calls: [{
      id: "physics-2027", kind: "research_vacancy", targetCategory: "phd",
      title: "Doctoral Researcher in Physics", institution: "Example University",
      countryCode: "DE", field: "Physics", officialUrl: URL,
      titleEvidence: { sourceUrl: URL, sourceExcerpt: "Doctoral Researcher in Physics" },
      application: { mode: "dated", deadline: DEADLINE, sourceUrl: URL,
        sourceExcerpt: `Applications are now open until 15 October ${NEXT_YEAR}.` },
      conditions: [{ text: "Master's degree in Physics", sourceUrl: URL,
        sourceExcerpt: "A Master's degree in Physics is required." }],
      funding: { status: "verified", terms: "TV-L E13 salary", sourceUrl: URL,
        sourceExcerpt: "Salary: TV-L E13 salary." },
      nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      linkedAdmissionId: null, applicabilityEvidence: null
    }]
  };
}

const render = (value) => executeTool("renderOpenAcademicCallReport", value, () => {
  throw new Error("A public-fact renderer must not fetch or receive applicant data");
});

test("a verified doctoral vacancy has a stable structured envelope and Persian display", async () => {
  const result = await render(base());
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const report = result.structuredContent;
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.status, "results");
  assert.equal(report.coverage.status, "complete_within_budget");
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].kind, "research_vacancy");
  assert.match(result.content[0].text, /آگهی پژوهشی/);
  assert.match(result.content[0].text, /Doctoral Researcher in Physics/);
  assert.match(result.content[0].text, /https:\/\/example\.edu\/jobs\/physics-2027/);
});

test("missing field or target category returns needs_input with the same envelope", async () => {
  const input = base();
  input.scope.field = null;
  input.scope.targetCategory = null;
  input.coverage = { apiSources: [], webSearches: [], countriesChecked: [], candidatesChecked: 0,
    excluded: [], failures: [], truncated: false };
  input.calls = [];
  const result = await render(input);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "needs_input");
  assert.deepEqual(result.structuredContent.results, []);
  assert.ok(result.structuredContent.nextQuestion);
  assert.ok(result.structuredContent.coverage);
});

test("a passed deadline cannot become a verified open call", async () => {
  const input = base();
  input.calls[0].application.deadline = "2020-01-01";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "invalid_open_academic_call_report");
});

test("a Master's admission and broadly applicable competitive scholarship remain separate", async () => {
  const input = base();
  input.scope.targetCategory = "masters";
  input.scope.fundingRequired = true;
  input.coverage.candidatesChecked = 2;
  const admission = input.calls[0];
  admission.id = "masters-admission";
  admission.kind = "admission_call";
  admission.targetCategory = "masters";
  admission.title = "MSc Physics 2027 admission";
  admission.titleEvidence.sourceExcerpt = admission.title;
  admission.funding = { status: "unknown", terms: null, sourceUrl: null, sourceExcerpt: null };
  const scholarship = structuredClone(admission);
  scholarship.id = "scholarship";
  scholarship.kind = "funding_call";
  scholarship.title = "Science Masters Scholarship 2027";
  scholarship.titleEvidence.sourceExcerpt = scholarship.title;
  scholarship.officialUrl = "https://example.edu/scholarships/science-2027";
  scholarship.funding = { status: "competitive", terms: "Full tuition scholarship", sourceUrl: scholarship.officialUrl,
    sourceExcerpt: "Full tuition scholarship for eligible science masters students." };
  scholarship.linkedAdmissionId = admission.id;
  scholarship.applicabilityEvidence = { sourceUrl: scholarship.officialUrl,
    sourceExcerpt: "Available to all MSc science programmes starting in 2027." };
  input.calls.push(scholarship);
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(result.structuredContent.results.map((item) => item.kind), ["admission_call", "funding_call"]);
  assert.match(result.content[0].text, /فاند رقابتی؛ دریافت آن قطعی نیست/);
});

test("a funded vacancy with unknown funding cannot enter the funded shortlist", async () => {
  const input = base();
  input.scope.fundingRequired = true;
  input.calls[0].funding = { status: "unknown", terms: null, sourceUrl: null, sourceExcerpt: null };
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding")));
});

test("a nationality restriction exclusion stays source-linked in the visible answer", async () => {
  const input = base();
  input.coverage.candidatesChecked = 2;
  input.coverage.excluded = [{ reason: "nationality_restriction", count: 1,
    title: "Restricted Research Fellowship", sourceUrl: "https://example.edu/restricted",
    sourceExcerpt: "Applicants with Iranian nationality are not eligible to apply." }];
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.content[0].text, /Restricted Research Fellowship/);
  assert.match(result.content[0].text, /https:\/\/example\.edu\/restricted/);
});

test("verified calls have a stable order independent of caller input order", async () => {
  const input = base();
  const lessRelevant = structuredClone(input.calls[0]);
  lessRelevant.id = "generic";
  lessRelevant.title = "Doctoral Researcher";
  lessRelevant.titleEvidence.sourceExcerpt = lessRelevant.title;
  lessRelevant.officialUrl = "https://example.edu/jobs/generic";
  lessRelevant.funding = { status: "unknown", terms: null, sourceUrl: null, sourceExcerpt: null };
  input.calls.push(lessRelevant);
  input.coverage.candidatesChecked = 2;
  const first = await render(input);
  input.calls.reverse();
  const second = await render(input);
  assert.equal(first.isError, false);
  assert.equal(second.isError, false);
  assert.deepEqual(first.structuredContent.results.map((item) => item.id),
    second.structuredContent.results.map((item) => item.id));
  assert.equal(first.structuredContent.results[0].id, "physics-2027");
});

test("no verified calls and a failed source preserve honest partial coverage", async () => {
  const input = base();
  input.calls = [];
  input.coverage.excluded = [{ reason: "unverified_official_page", count: 1 }];
  input.coverage.failures = [{ source: "daad_phdgermany", reason: "HTTP 503" }];
  const result = await render(input);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "research_required");
  assert.equal(result.structuredContent.coverage.status, "partial");
  assert.deepEqual(result.structuredContent.results, []);
  assert.match(result.content[0].text, /نبود نتیجه به معنی نبود فرصت نیست/);
});

test("a job cannot label an unawarded competition as its own verified funding", async () => {
  const input = base();
  input.calls[0].funding.status = "competitive";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("competitive funding requires a separate funding call")));
});

test("a funding application is represented as competitive, never an awarded benefit", async () => {
  const input = base();
  input.calls[0].kind = "funding_call";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding calls are competitive")));
});

test("a rolling opening needs explicit rolling evidence beyond an Apply button", async () => {
  const input = base();
  input.calls[0].application = { mode: "rolling", deadline: null, sourceUrl: URL,
    sourceExcerpt: "Apply for this job" };
  const weak = await render(input);
  assert.equal(weak.isError, true);
  input.calls[0].application.sourceExcerpt = "Ongoing research project. Apply for this job.";
  const incidental = await render(input);
  assert.equal(incidental.isError, true);
  input.calls[0].application.sourceExcerpt = "Applications are accepted on a rolling basis.";
  const supported = await render(input);
  assert.equal(supported.isError, false, JSON.stringify(supported.structuredContent));
  input.calls[0].application.sourceExcerpt = "Rolling applications are now closed.";
  const closed = await render(input);
  assert.equal(closed.isError, true);
});

test("a future deadline does not override an explicit closed-application statement", async () => {
  const input = base();
  input.calls[0].application.sourceExcerpt = `Applications are not open yet. Deadline ${DEADLINE}.`;
  const result = await render(input);
  assert.equal(result.isError, true);
});

test("a future deadline alone cannot establish currently open applications", async () => {
  const input = base();
  input.calls[0].application.sourceExcerpt = `Application deadline: 15 October ${NEXT_YEAR}.`;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("positive open-application evidence")));
});

test("an explicit Finnish open-application statement can support a dated call", async () => {
  const input = base();
  input.calls[0].application.sourceExcerpt = `Haku on käynnissä 15.10.${NEXT_YEAR} asti.`;
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
});

test("a dated call with a future exact closing time remains open on its final UTC day", {
  skip: Date.now() >= Date.parse(`${TODAY}T23:59:00Z`)
}, async () => {
  const input = base();
  input.calls[0].application.deadline = TODAY;
  input.calls[0].application.deadlineAt = `${TODAY}T23:59:00Z`;
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.content[0].text, /23:59:00Z/);
});

test("a dated call rejects an exact closing time already past", async () => {
  const input = base();
  input.calls[0].application.deadlineAt = `${NEXT_YEAR}-10-15T15:00:00+03:00`;
  input.calls[0].application.deadline = DEADLINE;
  const accepted = await render(input);
  assert.equal(accepted.isError, false, JSON.stringify(accepted.structuredContent));
  input.calls[0].application.deadlineAt = `${TODAY}T00:00:00Z`;
  input.calls[0].application.deadline = TODAY;
  const expired = await render(input);
  assert.equal(expired.isError, true);
  assert.ok(expired.structuredContent.details.some((item) => item.includes("deadline")));
});
