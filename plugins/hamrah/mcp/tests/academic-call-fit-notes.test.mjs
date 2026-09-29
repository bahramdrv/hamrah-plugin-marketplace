import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const script = fileURLToPath(new URL("../../skills/hamrah/references/render_academic_call_fit_notes.mjs", import.meta.url));
const today = new Date().toISOString().slice(0, 10);
const deadline = `${Number(today.slice(0, 4)) + 1}-01-15`;
const url = "https://example.edu/jobs/physics";

async function report() {
  const result = await executeTool("renderOpenAcademicCallReport", {
    checkedAt: today, scope: { field: "Physics", targetCategory: "phd", countryCodes: ["DE"], fundingRequired: false },
    coverage: { apiSources: [], webSearches: ["official page"], countriesChecked: ["DE"],
      candidatesChecked: 1, excluded: [], failures: [], truncated: false },
    calls: [{ id: "phd-physics", kind: "research_vacancy", targetCategory: "phd",
      title: "Doctoral Researcher in Physics", institution: "Example University", countryCode: "DE", field: "Physics",
      officialUrl: url, titleEvidence: { sourceUrl: url, sourceExcerpt: "Doctoral Researcher in Physics" },
      application: { mode: "dated", deadline, sourceUrl: url,
        sourceExcerpt: `Applications are now open until 15 January ${Number(today.slice(0, 4)) + 1}.` },
      conditions: [{ text: "MSc in Physics", sourceUrl: url, sourceExcerpt: "An MSc in Physics is required." }],
      funding: { status: "unknown", terms: null, sourceUrl: null, sourceExcerpt: null },
      nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      linkedAdmissionId: null, applicabilityEvidence: null }]
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  return result.structuredContent;
}

test("local fit notes retain the validated Persian report and link every condition", async () => {
  const publicReport = await report();
  const result = spawnSync(process.execPath, [script], { encoding: "utf8",
    input: JSON.stringify({ publicReport, fitNotes: [{ id: "phd-physics", comparisons: [{
      status: "unverified", reason: "مدرک کارشناسی ارشد ارائه نشده است.", gap: "مدرک و ریزنمرات را بررسی کنید."
    }] }] }) });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith(publicReport.markdown));
  assert.match(result.stdout, /مدرک کارشناسی ارشد/);
  assert.match(result.stdout, /https:\/\/example\.edu\/jobs\/physics/);
});

test("local fit notes cannot omit a published condition", async () => {
  const publicReport = await report();
  const result = spawnSync(process.execPath, [script], { encoding: "utf8",
    input: JSON.stringify({ publicReport, fitNotes: [{ id: "phd-physics", comparisons: [] }] }) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /every published condition/);
});
