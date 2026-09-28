import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";

const POSTING = "https://example.edu/jobs/phd-physics-2027";
const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE_YEAR = Number(TODAY.slice(0, 4)) + 1;
const FUTURE_DEADLINE = `${FUTURE_YEAR}-01-15`;
const YESTERDAY = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function opening() {
  return {
    checkedAt: TODAY,
    searchScope: { countryCode: "DEU", degreeLevel: "phd", field: "Physics" },
    coverage: { candidatesChecked: 1, excluded: [] },
    openings: [{
      title: "Doctoral Researcher in Experimental Physics",
      institution: "Example University",
      countryCode: "DEU",
      degreeLevel: "phd",
      field: "Physics",
      officialPostingUrl: POSTING,
      postingEvidence: {
        sourceUrl: POSTING,
        sourceExcerpt: "Doctoral Researcher in Experimental Physics (PhD position)"
      },
      academicConditions: [{ condition: "Master's degree in physics required", sourceUrl: POSTING,
        sourceExcerpt: "A master's degree in physics is required." }],
      nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      application: {
        status: "open", mode: "dated", deadline: FUTURE_DEADLINE,
        sourceUrl: POSTING,
        sourceExcerpt: `Applications are now open for this position until 15 January ${FUTURE_YEAR}.`
      },
      funding: {
        type: "salary", amount: null, currency: null, period: null,
        salaryScale: "65% TV-L E13", packageName: null, packageTerms: null,
        sourceUrl: POSTING,
        sourceExcerpt: "The position is paid at 65% TV-L E13."
      }
    }]
  };
}

const render = (input) => executeTool("renderVerifiedOpenAcademicOpportunityShortlist", input, () => {
  throw new Error("Presentation must not fetch external data");
});

test("a verified open funded doctoral advertisement renders as a request-scoped result", async () => {
  const result = await render(opening());
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.status, "valid");
  assert.equal(result.structuredContent.openingCount, 1);
  assert.equal(result.content[0].text, result.structuredContent.markdown);
  assert.match(result.content[0].text, /Doctoral Researcher in Experimental Physics/);
  assert.match(result.content[0].text, /application: `open`/);
  assert.match(result.content[0].text, new RegExp(`deadline: ${FUTURE_DEADLINE}`));
  assert.match(result.content[0].text, /65% TV-L E13/);
  assert.match(result.content[0].text, new RegExp(`checked: ${TODAY}`));
  assert.match(result.content[0].text, /https:\/\/example\.edu\/jobs\/phd-physics-2027/);
  assert.equal(TOOLS.find((tool) => tool.name === "renderVerifiedOpenAcademicOpportunityShortlist")?.annotations?.readOnlyHint, true);
});

test("an expired advertised deadline cannot be presented as open", async () => {
  const input = opening();
  input.openings[0].application.deadline = YESTERDAY;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "invalid_opportunity_presentation");
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.deadline")));
  assert.equal(result.structuredContent.markdown, undefined);
});

test("a vague funding claim cannot be presented as a funded opening", async () => {
  const input = opening();
  input.openings[0].funding.salaryScale = null;
  input.openings[0].funding.sourceExcerpt = "Funding may be available.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding")));
});

test("a rolling call cannot borrow a dated deadline", async () => {
  const input = opening();
  input.openings[0].application.mode = "rolling";
  input.openings[0].application.sourceExcerpt = "Applications are accepted on a rolling basis.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.deadline")));
});

test("a source URL cannot inject a second Markdown link into the visible result", async () => {
  const input = opening();
  input.openings[0].officialPostingUrl = "https://example.edu/jobs/role) [Apply elsewhere](https://evil.example";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("officialPostingUrl")));
});

test("a named stipend package cannot stand in for salary terms", async () => {
  const input = opening();
  input.openings[0].funding.salaryScale = null;
  input.openings[0].funding.packageName = "Doctoral Fellowship";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding")));
});

test("a named stipend package without stated coverage is not sufficient funding evidence", async () => {
  const input = opening();
  input.openings[0].funding.type = "stipend";
  input.openings[0].funding.salaryScale = null;
  input.openings[0].funding.packageName = "Doctoral Fellowship";
  input.openings[0].funding.sourceExcerpt = "Doctoral Fellowship provided.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding")));
});

test("an explicitly rolling call can show a named stipend package with its terms", async () => {
  const input = opening();
  input.openings[0].application = {
    status: "open", mode: "rolling", deadline: null, sourceUrl: POSTING,
    sourceExcerpt: "Applications for this doctoral position are accepted on a rolling basis."
  };
  input.openings[0].funding = {
    type: "stipend", amount: null, currency: null, period: null,
    salaryScale: null, packageName: "Doctoral Fellowship", packageTerms: "three-year Doctoral Fellowship living stipend",
    sourceUrl: POSTING, sourceExcerpt: "This position includes a three-year Doctoral Fellowship living stipend."
  };
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.content[0].text, /deadline: rolling call/);
  assert.match(result.content[0].text, /Doctoral Fellowship: three-year Doctoral Fellowship living stipend/);
});

test("the renderer requires advertised-opening evidence and current acceptance without applicant details", async () => {
  const absentPosting = opening();
  delete absentPosting.openings[0].postingEvidence;
  assert.equal((await render(absentPosting)).isError, true);

  const notYetOpen = opening();
  notYetOpen.openings[0].application.status = "not_yet_open";
  assert.equal((await render(notYetOpen)).isError, true);

  const personal = opening();
  personal.applicantName = "Do not transmit";
  const result = await render(personal);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("applicantName")));
});

test("a dated deadline needs its year in the cited official excerpt", async () => {
  const input = opening();
  input.openings[0].application.sourceExcerpt = "Applications are open until 15 January.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.sourceExcerpt")));
});

test("an old check date cannot make a now-expired advertisement open", async () => {
  const input = opening();
  input.checkedAt = "2020-01-01";
  input.openings[0].application.deadline = "2020-12-31";
  input.openings[0].application.sourceExcerpt = "Applications are open until 31 December 2020.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("checkedAt") || item.includes("application.deadline")));
});

test("a claimed salary scale must appear in its official excerpt", async () => {
  const input = opening();
  input.openings[0].funding.sourceExcerpt = "Funding may be available.";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding.sourceExcerpt")));
});

test("a generic faculty page cannot serve as evidence for the advertised opening", async () => {
  const input = opening();
  input.openings[0].postingEvidence.sourceExcerpt = "Professor of Physics — research interests and publications";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("postingEvidence.sourceExcerpt")));
});

test("a future deadline does not prove applications are accepting now", async () => {
  const input = opening();
  input.openings[0].application.sourceExcerpt = `Applications will open in November; deadline 15 January ${FUTURE_YEAR}.`;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.sourceExcerpt")));
});

test("stipend package and amount must appear in their funding excerpts", async () => {
  const packageInput = opening();
  packageInput.openings[0].funding = {
    type: "stipend", amount: null, currency: null, period: null,
    salaryScale: null, packageName: "Doctoral Fellowship", packageTerms: "Living stipend for three years",
    sourceUrl: POSTING, sourceExcerpt: "Funding may be available."
  };
  const packageResult = await render(packageInput);
  assert.equal(packageResult.isError, true);
  assert.ok(packageResult.structuredContent.details.some((item) => item.includes("funding.sourceExcerpt")));

  const amountInput = opening();
  amountInput.openings[0].funding = {
    type: "stipend", amount: 1500, currency: "EUR", period: "month",
    salaryScale: null, packageName: null, packageTerms: null,
    sourceUrl: POSTING, sourceExcerpt: "Funding may be available."
  };
  const amountResult = await render(amountInput);
  assert.equal(amountResult.isError, true);
  assert.ok(amountResult.structuredContent.details.some((item) => item.includes("funding.sourceExcerpt")));
});

test("a German official excerpt can establish current acceptance", async () => {
  const input = opening();
  input.openings[0].application.sourceExcerpt = `Bewerbungen sind ab sofort möglich. Frist: 15. Januar ${FUTURE_YEAR}.`;
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
});

test("a rolling label needs an explicitly rolling official excerpt", async () => {
  const input = opening();
  input.openings[0].application.mode = "rolling";
  input.openings[0].application.deadline = null;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.sourceExcerpt")));
});

test("a dated deadline must match its cited day and month as well as year", async () => {
  const input = opening();
  input.openings[0].application.sourceExcerpt = `Applications are now open until 30 June ${FUTURE_YEAR}.`;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("application.sourceExcerpt")));
});

test("a one-time grant cannot be rendered as a monthly stipend", async () => {
  const input = opening();
  input.openings[0].funding = {
    type: "stipend", amount: 1500, currency: "EUR", period: "month",
    salaryScale: null, packageName: null, packageTerms: null,
    sourceUrl: POSTING, sourceExcerpt: "This position includes a one-time grant of 1500 EUR."
  };
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("funding.sourceExcerpt")));
});

test("a source-stated monthly euro stipend remains renderable", async () => {
  const input = opening();
  input.openings[0].funding = {
    type: "stipend", amount: 1500, currency: "EUR", period: "month",
    salaryScale: null, packageName: null, packageTerms: null,
    sourceUrl: POSTING, sourceExcerpt: "Diese Stelle bietet ein Stipendium von 1500 EUR monatlich."
  };
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.match(result.content[0].text, /1500 EUR\/month/);
});

test("a request-scoped shortlist shows multiple openings, academic conditions and unknown nationality", async () => {
  const input = opening();
  input.searchScope = { countryCode: "DEU", degreeLevel: "phd", field: "Physics" };
  input.coverage = { candidatesChecked: 2, excluded: [] };
  input.openings[0].academicConditions = [{
    condition: "Master's degree in physics required",
    sourceUrl: POSTING,
    sourceExcerpt: "A master's degree in physics is required."
  }];
  input.openings[0].nationalityEvidence = { status: "unknown", sourceUrl: null, sourceExcerpt: null };
  const second = structuredClone(input.openings[0]);
  second.title = "Doctoral Researcher in Experimental Physics II";
  second.postingEvidence.sourceExcerpt = second.title;
  second.officialPostingUrl = "https://example.edu/jobs/phd-physics-2027-b";
  second.postingEvidence.sourceUrl = second.officialPostingUrl;
  input.openings.push(second);
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.openingCount, 2);
  assert.match(result.content[0].text, /2 verified openings/);
  assert.match(result.content[0].text, /academic condition: Master's degree in physics required/);
  assert.match(result.content[0].text, /Iranian-nationality evidence: `unknown`/);
  assert.match(result.content[0].text, /phd-physics-2027-b/);
});

test("zero qualified openings reports the checked scope and exclusions without asserting no positions exist", async () => {
  const input = opening();
  input.openings = [];
  input.coverage = { candidatesChecked: 2, excluded: [
    { reason: "expired_deadline", count: 1 },
    { reason: "unverified_funding", count: 1 }
  ] };
  const result = await render(input);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.openingCount, 0);
  assert.match(result.content[0].text, /0 verified openings from 2 candidates checked/);
  assert.match(result.content[0].text, /expired_deadline/);
  assert.match(result.content[0].text, /unsearched opportunities remain unknown/);
  assert.doesNotMatch(result.content[0].text, /no openings exist/i);
});

test("a candidate outside the requested country, degree or field cannot appear in the shortlist", async () => {
  const input = opening();
  input.openings[0].countryCode = "CAN";
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("requested country")));
});

test("coverage must account for every checked candidate", async () => {
  const input = opening();
  input.coverage.candidatesChecked = 3;
  const result = await render(input);
  assert.equal(result.isError, true);
  assert.ok(result.structuredContent.details.some((item) => item.includes("displayed plus excluded")));
});
