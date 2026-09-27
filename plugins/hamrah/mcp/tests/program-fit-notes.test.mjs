import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = new URL("../../skills/hamrah-program-finder/scripts/render_fit_notes.mjs", import.meta.url);
const academicUrl = "https://example.edu/physics/requirements";
const rendererMarkdown = [
  "### [Example University — M.Sc. Physics](https://example.edu/physics/msc)",
  "- checked: 2026-09-27",
  "- match: `conditional_fit`",
  `- published academic evidence: B2 English required, official page ([source](${academicUrl}))`,
  "- application: `unknown`",
  "- admission deadline: `unknown`",
  "- scholarship deadline: `unknown`",
  "- funding: `unknown`",
  "- tuition: `unknown`",
  "- Iranian-nationality evidence: `unknown`"
].join("\n");

function render(input) {
  return spawnSync(process.execPath, [fileURLToPath(script)], {
    input: JSON.stringify(input), encoding: "utf8"
  });
}

test("local fit-note renderer preserves the MCP block and links each private note to published academic evidence", () => {
  const result = render({
    rendererMarkdown,
    fitNotes: [{ academicEvidenceIndex: 0, reason: "Physics degree aligns []().", gaps: ["B2 English proof missing"] }]
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith(`${rendererMarkdown}\n\n**Applicant Fit Notes**\n`));
  assert.match(result.stdout, /\[Example University — M\.Sc\. Physics\]\(https:\/\/example\.edu\/physics\/requirements\): Physics degree aligns/);
  assert.match(result.stdout, /Gaps: B2 English proof missing/);
  assert.equal(result.stdout.includes("[]()"), false);
});

test("local fit-note renderer refuses a missing or unlinked program note", () => {
  const missing = render({ rendererMarkdown, fitNotes: [] });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /one fit note per program/);

  const wrongEvidence = render({
    rendererMarkdown,
    fitNotes: [{ academicEvidenceIndex: 4, reason: "Physics degree aligns.", gaps: ["B2 proof missing"] }]
  });
  assert.notEqual(wrongEvidence.status, 0);
  assert.match(wrongEvidence.stderr, /academicEvidenceIndex/);
});
