import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const script = fileURLToPath(new URL("../../skills/hamrah/references/render_opportunity_fit_notes.mjs", import.meta.url));
const today = new Date().toISOString().slice(0, 10);
const nextYear = Number(today.slice(0, 4)) + 1;
const posting = "https://example.edu/jobs/physics";

async function publicBlock(title = "Doctoral Researcher in Physics") {
  const result = await executeTool("renderVerifiedOpenAcademicOpportunityShortlist", {
    checkedAt: today,
    searchScope: { countryCode: "DEU", degreeLevel: "phd", field: "Physics" },
    coverage: { candidatesChecked: 1, excluded: [] },
    openings: [{
      title, institution: "Example University", countryCode: "DEU",
      degreeLevel: "phd", field: "Physics", officialPostingUrl: posting,
      postingEvidence: { sourceUrl: posting, sourceExcerpt: title },
      academicConditions: [{ condition: "Master's degree in physics required", sourceUrl: posting,
        sourceExcerpt: "A master's degree in physics is required." }],
      nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      application: { status: "open", mode: "dated", deadline: `${nextYear}-01-15`, sourceUrl: posting,
        sourceExcerpt: `Applications are now open until 15 January ${nextYear}.` },
      funding: { type: "salary", amount: null, currency: null, period: null, salaryScale: "65% TV-L E13",
        packageName: null, packageTerms: null, sourceUrl: posting, sourceExcerpt: "Salary is 65% TV-L E13." }
    }]
  }, () => { throw new Error("no fetch"); });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  return result.content[0].text;
}

test("local academic comparison preserves the complete public block and links missing proof to the official condition", async () => {
  const rendererMarkdown = await publicBlock();
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ rendererMarkdown, fitNotes: [{ comparisons: [{ status: "unverified",
      reason: "The applicant stated a physics degree but supplied no diploma evidence.",
      gap: "Confirm degree level and transcript." }] }] }), encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith(rendererMarkdown));
  assert.match(result.stdout, /unverified/);
  assert.match(result.stdout, /Confirm degree level and transcript/);
  assert.match(result.stdout, /https:\/\/example\.edu\/jobs\/physics/);
});

test("a minimal profile keeps every missing academic condition unverified", async () => {
  const rendererMarkdown = await publicBlock();
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ rendererMarkdown, fitNotes: [{ comparisons: [{ status: "unverified",
      reason: "No academic background was supplied.", gap: "Provide degree and transcript." }] }] }), encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No academic background was supplied/);
  assert.match(result.stdout, /`unverified`/);
});

test("a published opening title with brackets still receives its private fit note", async () => {
  const rendererMarkdown = await publicBlock("Doctoral Researcher in Physics [m/f/d]");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ rendererMarkdown, fitNotes: [{ comparisons: [{ status: "unverified",
      reason: "Degree evidence not supplied.", gap: "Provide a diploma." }] }] }), encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Degree evidence not supplied/);
});

test("a missing comparison cannot silently omit a published academic condition", async () => {
  const rendererMarkdown = await publicBlock();
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ rendererMarkdown, fitNotes: [{ comparisons: [] }] }), encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cover every published academic condition/);
});

test("a zero-result public block needs no personal comparison", async () => {
  const result = await executeTool("renderVerifiedOpenAcademicOpportunityShortlist", {
    checkedAt: today,
    searchScope: { countryCode: "DEU", degreeLevel: "phd", field: "Physics" },
    coverage: { candidatesChecked: 0, excluded: [] }, openings: []
  }, () => { throw new Error("no fetch"); });
  assert.equal(result.isError, false);
  const notes = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ rendererMarkdown: result.content[0].text, fitNotes: [] }), encoding: "utf8"
  });
  assert.equal(notes.status, 0, notes.stderr);
  assert.equal(notes.stdout, `${result.content[0].text}\n`);
});
