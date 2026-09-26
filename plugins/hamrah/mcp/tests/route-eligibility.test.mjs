import assert from "node:assert/strict";
import test from "node:test";

import { executeTool } from "../server.mjs";

const offlineFetch = async () => {
  throw new Error("evaluateRouteEligibility must not use the network");
};

const SECTION_20A = "https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html";

function livelihoodCheck(overrides = {}) {
  return {
    requirementId: "opportunity_card_secured_livelihood",
    claimType: "immigration_requirement",
    title: "Secured livelihood for the Opportunity Card under Section 20a(4)",
    result: "met",
    explanation: "The applicant has evidence of secured livelihood for the Opportunity Card.",
    sourceUrl: SECTION_20A,
    sourceTitle: "Residence Act section 20a",
    checkedAt: "2026-09-20",
    ...overrides
  };
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function evaluate(requirements, overrides = {}) {
  const result = await executeTool("evaluateRouteEligibility", {
    countryCode: "DEU",
    routeCode: "opportunity_card",
    officialDataQuality: "current",
    requirements,
    ...overrides
  }, offlineFetch);
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  return result.structuredContent;
}

test("a check backed by a primary authority for that exact claim yields an official PASS", async () => {
  const result = await evaluate([livelihoodCheck()]);

  assert.equal(result.officialEligibility.status, "PASS");
  assert.equal(result.officialEligibility.assessment_kind, "official");
  assert.equal(result.usableForRanking, true);
  const [reason] = result.officialEligibility.reasons;
  assert.equal(reason.source_url, SECTION_20A);
  assert.equal(reason.checked_at, "2026-09-20");
  assert.deepEqual(reason.source_authority, {
    policy_version: "1.0.0",
    classification: "primary",
    rule_id: "de-opportunity-card-core"
  });
});

test("a not_met check backed by a primary authority yields an official, unrankable FAIL", async () => {
  const result = await evaluate([livelihoodCheck({
    result: "not_met",
    explanation: "The applicant lacks evidence of secured livelihood for the Opportunity Card."
  })]);

  assert.equal(result.officialEligibility.status, "FAIL");
  assert.equal(result.officialEligibility.assessment_kind, "official");
  assert.deepEqual(result.officialEligibility.blockers, ["Secured livelihood for the Opportunity Card under Section 20a(4)"]);
  assert.equal(result.usableForRanking, false);
  assert.equal(result.officialEligibility.reasons[0].source_authority.rule_id, "de-opportunity-card-core");
});

test("the primary authority's page over plain HTTP cannot establish PASS", async () => {
  const result = await evaluate([livelihoodCheck({ sourceUrl: "http://www.gesetze-im-internet.de/aufenthg_2004/__20a.html" })]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.equal(result.usableForRanking, false);
});

test("an unrecognised HTTPS source yields an unrankable Provisional Assessment instead of PASS", async () => {
  const result = await evaluate([livelihoodCheck({ sourceUrl: "https://example.org/opportunity-card-guide" })]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.equal(result.usableForRanking, false);
  assert.deepEqual(result.officialEligibility.reasons[0].source_authority, {
    policy_version: "1.0.0",
    classification: "unknown",
    rule_id: null
  });
});

test("a title-only source cannot establish PASS and is not rankable", async () => {
  const result = await evaluate([livelihoodCheck({ sourceUrl: undefined, sourceTitle: "Some blog" })]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.equal(result.usableForRanking, false);
  assert.equal(result.officialEligibility.reasons[0].source_url, null);
  assert.equal(result.officialEligibility.reasons[0].source_authority.classification, "unknown");
});

test("an applicant statement with no source stays UNKNOWN with a warning", async () => {
  const result = await evaluate([{
    requirementId: "r1",
    title: "Core route condition",
    result: "met",
    explanation: "Applicant states the condition is met."
  }]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.equal(result.usableForRanking, false);
  assert.match(result.warnings.join(" "), /lack a linked official source/i);
});

test("an open requirement cited from an unrecognised source is POSSIBLE but provisional and unrankable", async () => {
  const result = await evaluate([{
    requirementId: "offer",
    claimType: "immigration_requirement",
    title: "Eligible job offer",
    result: "unknown",
    explanation: "No offer has been secured yet.",
    sourceUrl: "https://example.gov/official",
    checkedAt: "2026-09-18"
  }], { countryCode: "CAN", routeCode: "example" });

  assert.equal(result.officialEligibility.status, "POSSIBLE");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.deepEqual(result.officialEligibility.missing_requirements, ["Eligible job offer"]);
  assert.equal(result.usableForRanking, false);
});

test("a primary source cited for a claim outside its authority scope cannot establish FAIL", async () => {
  const result = await evaluate([{
    requirementId: "opportunity_card_german_language",
    claimType: "immigration_requirement",
    title: "German language at A1 for the Opportunity Card",
    result: "not_met",
    explanation: "The applicant has no German language certificate.",
    sourceUrl: SECTION_20A,
    sourceTitle: "Residence Act section 20a",
    checkedAt: "2026-09-20"
  }]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.officialEligibility.assessment_kind, "provisional");
  assert.equal(result.usableForRanking, false);
  assert.equal(result.officialEligibility.reasons[0].source_authority.classification, "unknown");
});

test("a time-sensitive check retrieved beyond its versioned freshness limit cannot PASS", async () => {
  const result = await evaluate([livelihoodCheck({
    timeSensitive: true,
    factType: "financial_requirement",
    retrievedAt: daysAgo(400)
  })]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.usableForRanking, false);
  const { freshness } = result.officialEligibility.reasons[0];
  assert.equal(freshness.policy_version, "1.0.0");
  assert.equal(freshness.status, "stale");
  assert.equal(freshness.max_age_days, 365);
  assert.ok(freshness.age_days >= 399 && freshness.age_days <= 401, `age_days ${freshness.age_days}`);
});

test("a time-sensitive check without a fact type and retrieval time has unknown freshness and cannot PASS", async () => {
  const result = await evaluate([livelihoodCheck({ timeSensitive: true })]);

  assert.equal(result.officialEligibility.status, "UNKNOWN");
  assert.equal(result.usableForRanking, false);
  assert.equal(result.officialEligibility.reasons[0].freshness.status, "unknown");
});

test("a time-sensitive check retrieved within its freshness limit can PASS", async () => {
  const result = await evaluate([livelihoodCheck({
    timeSensitive: true,
    factType: "financial_requirement",
    retrievedAt: daysAgo(10)
  })]);

  assert.equal(result.officialEligibility.status, "PASS");
  assert.equal(result.usableForRanking, true);
  assert.equal(result.officialEligibility.reasons[0].freshness.status, "current");
});
