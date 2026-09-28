import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";

const PROFILE = "https://physics.example.edu/faculty/arya";
const TODAY = new Date().toISOString().slice(0, 10);
const render = (input) => executeTool("renderAcademicSupervisorShortlist", input, () => {
  throw new Error("Public presentation must not browse");
});

function sample() {
  return {
    checkedAt: TODAY,
    searchScope: { countryCode: "DEU", field: "Physics", researchFocus: "Astrobiology" },
    coverage: { candidatesChecked: 1, excluded: [] },
    leads: [{
      name: "Professor Arya", institution: "Example University", countryCode: "DEU", field: "Physics",
      officialProfileUrl: PROFILE,
      research: { focus: "Astrobiology", sourceUrl: PROFILE,
        sourceExcerpt: "Professor Arya's research includes astrobiology and planetary habitability." },
      recruitment: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      contact: { status: "published", sourceUrl: PROFILE,
        sourceExcerpt: "Department office email: physics@example.edu" },
      iranianStudent: { status: "unknown", sourceUrl: null, sourceExcerpt: null }
    }]
  };
}

test("source-linked supervisor lead keeps research, recruitment, contact and Iranian-student evidence separate", async () => {
  const result = await render(sample());
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.leadCount, 1);
  assert.equal(result.content[0].text, result.structuredContent.markdown);
  assert.match(result.content[0].text, /Astrobiology/);
  assert.match(result.content[0].text, /student recruitment: `unknown`/);
  assert.match(result.content[0].text, /former Iranian student: `unknown`/);
  assert.match(result.content[0].text, /institutional contact/);
  assert.equal(TOOLS.find((tool) => tool.name === "renderAcademicSupervisorShortlist")?.annotations?.readOnlyHint, true);
});

test("a directory entry without topic evidence cannot be called a match", async () => {
  const input = sample();
  input.leads[0].research.sourceExcerpt = "Professor Arya, Department of Physics.";
  assert.equal((await render(input)).isError, true);
});

test("recruitment needs an explicit official statement; silence remains unknown", async () => {
  const input = sample();
  input.leads[0].recruitment = { status: "explicitly_accepting", sourceUrl: PROFILE,
    sourceExcerpt: "Research in planetary habitability." };
  assert.equal((await render(input)).isError, true);
  input.leads[0].recruitment.sourceExcerpt = "I am currently accepting PhD students in astrobiology.";
  assert.equal((await render(input)).isError, false);
  input.leads[0].recruitment.sourceExcerpt = "I am not currently accepting PhD students.";
  assert.equal((await render(input)).isError, true);
});

test("former Iranian student requires explicit public evidence and omits the person's name", async () => {
  const input = sample();
  input.leads[0].iranianStudent = { status: "documented", sourceUrl: PROFILE,
    sourceExcerpt: "Lila was a former PhD student in this group and came from Iran." };
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.content[0].text, /former Iranian student: `documented`/);
  assert.doesNotMatch(result.content[0].text, /Lila/);
  input.leads[0].iranianStudent.sourceExcerpt = "Lila has an Iranian surname.";
  assert.equal((await render(input)).isError, true);
});

test("contact must link a published institutional channel", async () => {
  const input = sample();
  input.leads[0].contact.sourceExcerpt = "Professor Arya studies physics.";
  assert.equal((await render(input)).isError, true);
  input.leads[0].contact.sourceExcerpt = "Contact";
  assert.equal((await render(input)).isError, true);
});

test("personal profile data cannot enter public renderer", async () => {
  const input = sample();
  input.applicantName = "Private applicant";
  assert.equal((await render(input)).isError, true);
});
