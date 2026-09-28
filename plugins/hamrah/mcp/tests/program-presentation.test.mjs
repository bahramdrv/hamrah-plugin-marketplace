import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";

const SOURCE = "https://example.edu/physics/msc";
const ADMISSIONS = "https://example.edu/physics/msc/apply";
const SCHOLARSHIP = "https://example.edu/physics/scholarships";

function example() {
  return {
    checkedAt: "2026-09-27",
    programs: [{
      title: "Example University — M.Sc. Physics",
      officialProgramUrl: SOURCE,
      matchStatus: "conditional_fit",
      academicEvidence: [{
        kind: "admission_requirement",
        fact: "A physics bachelor's degree is required",
        sourceExcerpt: "Applicants must hold a bachelor's degree in physics.",
        sourceUrl: SOURCE
      }],
      application: { status: "unknown", intake: null, sourceUrl: null, sourceExcerpt: null },
      admissionDeadline: { status: "unknown", date: null, intake: null, sourceUrl: null, sourceExcerpt: null },
      scholarshipDeadline: { status: "unknown", date: null, intake: null, sourceUrl: null, sourceExcerpt: null },
      funding: { status: "unknown", coverage: null, sourceUrl: null },
      tuition: { status: "unknown", amount: null, currency: null, period: null, sourceUrl: null },
      iranianEvidence: { status: "unknown", sourceUrl: null }
    }]
  };
}

const render = (input) => executeTool("renderAcademicProgramShortlist", input, () => {
  throw new Error("Presentation must not fetch external data");
});

test("renders a request-scoped shortlist with one status per field and explicit unknowns", async () => {
  const result = await render(example());
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "valid");
  assert.equal(result.content[0].text, result.structuredContent.markdown);
  assert.match(result.content[0].text, /^### \[Example University/);
  assert.match(result.structuredContent.markdown, /conditional_fit/);
  assert.match(result.structuredContent.markdown, /admission requirement: A physics bachelor's degree is required/);
  assert.match(result.structuredContent.markdown, /application: `unknown`/);
  assert.match(result.structuredContent.markdown, /admission deadline: `unknown`/);
  assert.match(result.structuredContent.markdown, /funding: `unknown`/);
  assert.match(result.structuredContent.markdown, /example\.edu\/physics\/msc/);
  assert.equal(result.structuredContent.markdown.includes("2027"), false);
  assert.equal(TOOLS.find((tool) => tool.name === "renderAcademicProgramShortlist")?.annotations?.readOnlyHint, true);
});

test("rejects mixed application and funding statuses before presentation", async () => {
  const input = example();
  input.programs[0].application.status = "unknown/not_yet_open";
  input.programs[0].funding.status = "competitive/unknown";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "invalid_program_presentation");
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.status")));
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding.status")));
  assert.equal(result.structuredContent.markdown, undefined);
});

test("rejects an inferred date when the cited call does not name its year", async () => {
  const input = example();
  input.programs[0].admissionDeadline = {
    status: "verified", date: "2027-01-15", intake: "Summer 2027", sourceUrl: ADMISSIONS,
    sourceExcerpt: "Summer semester deadline: 15 January"
  };
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("admissionDeadline.sourceExcerpt")));
});

test("keeps admission and competitive scholarship deadlines and coverage separate", async () => {
  const input = example();
  input.programs[0].application = {
    status: "not_yet_open", intake: "Winter 2027/28", sourceUrl: ADMISSIONS,
    sourceExcerpt: "Winter 2027/28 applications open in November 2026"
  };
  input.programs[0].admissionDeadline = {
    status: "verified", date: "2027-05-01", intake: "Winter 2027/28", sourceUrl: ADMISSIONS,
    sourceExcerpt: "Winter 2027/28 admission deadline: 1 May 2027"
  };
  input.programs[0].scholarshipDeadline = {
    status: "verified", date: "2026-12-01", intake: "Winter 2027/28", sourceUrl: SCHOLARSHIP,
    sourceExcerpt: "Winter 2027/28 scholarship deadline: 1 December 2026"
  };
  input.programs[0].funding = { status: "competitive", coverage: "Living stipend only", sourceUrl: SCHOLARSHIP };
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  const markdown = result.structuredContent.markdown;
  assert.match(markdown, /admission deadline: `verified` — 2027-05-01/);
  assert.match(markdown, /scholarship deadline: `verified` — 2026-12-01/);
  assert.match(markdown, /funding: `competitive` — Living stipend only/);
});

test("rejects unsupported open calls, mixed intakes and unscoped funding claims", async () => {
  const input = example();
  input.programs[0].application = {
    status: "open", intake: "Summer 2027", sourceUrl: ADMISSIONS,
    sourceExcerpt: "Applications are open"
  };
  input.programs[0].admissionDeadline = {
    status: "verified", date: "2027-01-15", intake: "Winter 2027/28", sourceUrl: ADMISSIONS,
    sourceExcerpt: "Winter 2027/28 deadline: 15 January 2027"
  };
  input.programs[0].funding = { status: "competitive", coverage: null, sourceUrl: SCHOLARSHIP };
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.sourceExcerpt")));
  assert.ok(result.structuredContent.details.some((item) => item.includes("admissionDeadline.intake")));
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding.coverage")));
});

test("does not accept personal-profile fields in the presentation request", async () => {
  const input = example();
  input.applicantName = "Do not transmit";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("applicantName")));
});

test("requires an official citation before asserting that no funding exists", async () => {
  const input = example();
  input.programs[0].funding.status = "none";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding.sourceUrl")));
});

test("rejects a program without a source-linked academic reason", async () => {
  const input = example();
  input.programs[0].academicEvidence = [];
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("academicEvidence")));
});

test("rejects program descriptions when no published admission requirement is cited", async () => {
  const input = example();
  input.programs[0].academicEvidence = [{
    kind: "program_context",
    fact: "The program is taught in English and includes a master's project",
    sourceExcerpt: "The program is taught in English and includes a master's project.",
    sourceUrl: SOURCE
  }];
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("admission requirement")));
});

test("requires a short source excerpt for each claimed admission requirement", async () => {
  const input = example();
  delete input.programs[0].academicEvidence[0].sourceExcerpt;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("sourceExcerpt")));
});

test("renders admission requirements separately from program context", async () => {
  const input = example();
  input.programs[0].academicEvidence.push({
    kind: "program_context",
    fact: "The program is taught in English",
    sourceExcerpt: "This master's program is taught in English.",
    sourceUrl: SOURCE
  });
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.structuredContent.markdown, /- admission requirement: A physics bachelor's degree is required/);
  assert.match(result.structuredContent.markdown, /- program context: The program is taught in English/);
});
