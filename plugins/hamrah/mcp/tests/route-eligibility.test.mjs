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
    policy_version: "2.0.0",
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
    policy_version: "2.0.0",
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

test("a primary source cited outside its country, claim type, or host path cannot establish FAIL", async () => {
  const notMet = {
    requirementId: "opportunity_card_german_language",
    claimType: "immigration_requirement",
    title: "German language at A1 for the Opportunity Card",
    result: "not_met",
    explanation: "The applicant has no German language certificate.",
    sourceUrl: SECTION_20A,
    sourceTitle: "Residence Act section 20a",
    checkedAt: "2026-09-20"
  };
  for (const [check, overrides] of [
    [notMet, { countryCode: "CAN", routeCode: "express_entry" }],
    [{ ...notMet, claimType: "university_admission" }, {}],
    [{ ...notMet, sourceUrl: "https://www.gesetze-im-internet.de/bgb/__1.html" }, {}],
    [{ ...notMet, sourceUrl: "https://www.gesetze-im-internet.de/aufenthg_2004/../bgb/__1.html" }, {}],
    [{ ...notMet, sourceUrl: "https://www.gesetze-im-internet.de/aufenthg_2004//__20a.html" }, {}],
    [{ ...notMet, sourceUrl: "https://kairo.diplo.de/ir-de/02-service" }, {}]
  ]) {
    const result = await evaluate([check], overrides);

    assert.equal(result.officialEligibility.status, "UNKNOWN", check.sourceUrl);
    assert.equal(result.officialEligibility.assessment_kind, "provisional");
    assert.equal(result.usableForRanking, false);
    assert.equal(result.officialEligibility.reasons[0].source_authority.classification, "unknown");
  }
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

const VISA_ATLAS_RECORD = "https://visaatlas.org/visas/germany/opportunity-card";

function visaAtlasCheck(overrides = {}) {
  return livelihoodCheck({
    sourceUrl: VISA_ATLAS_RECORD,
    sourceTitle: "Visa Atlas: Germany Opportunity Card",
    governmentSourceUrl: SECTION_20A,
    verifiedAt: daysAgo(20).slice(0, 10),
    factType: "financial_requirement",
    retrievedAt: daysAgo(1),
    ...overrides
  });
}

test("a current, government-linked Visa Atlas record alone is trusted and reaches at most POSSIBLE awaiting official confirmation", async () => {
  const result = await evaluate([visaAtlasCheck()]);

  assert.equal(result.officialEligibility.status, "POSSIBLE");
  assert.equal(result.officialEligibility.assessment_kind, "awaiting_official_confirmation");
  assert.deepEqual(result.officialEligibility.awaiting_official_confirmation, [
    "Secured livelihood for the Opportunity Card under Section 20a(4)"
  ]);
  assert.equal(result.usableForRanking, true);
  assert.match(result.warnings.join(" "), /awaiting official confirmation/i);
  const [reason] = result.officialEligibility.reasons;
  assert.equal(reason.government_source_url, SECTION_20A);
  assert.equal(reason.source_authority.classification, "trusted");
  assert.equal(reason.source_authority.rule_id, "visa-atlas-record");
});

test("a stale, unlinked, or undated Visa Atlas record stays an unrankable Provisional Assessment", async () => {
  for (const [label, overrides] of [
    ["no government link", { governmentSourceUrl: undefined }],
    ["government link back to Visa Atlas", { governmentSourceUrl: "https://visaatlas.org/sources/aufenthg" }],
    ["government link over HTTP", { governmentSourceUrl: "http://www.gesetze-im-internet.de/aufenthg_2004/__20a.html" }],
    ["no verification date", { verifiedAt: undefined }],
    ["verification past the freshness limit", { verifiedAt: daysAgo(400).slice(0, 10) }],
    ["verification in the future", { verifiedAt: daysAgo(-5).slice(0, 10) }],
    ["no fact type to age the verification", { factType: undefined }]
  ]) {
    const result = await evaluate([visaAtlasCheck(overrides)]);

    assert.equal(result.officialEligibility.reasons[0].source_authority.classification, "unknown", label);
    assert.equal(result.officialEligibility.status, "UNKNOWN", label);
    assert.equal(result.officialEligibility.assessment_kind, "provisional", label);
    assert.equal(result.usableForRanking, false, label);
  }
});

test("a Visa Atlas requirement confirmed at a primary official source can yield an official PASS", async () => {
  const result = await evaluate([visaAtlasCheck(), livelihoodCheck()]);

  assert.equal(result.officialEligibility.status, "PASS");
  assert.equal(result.officialEligibility.assessment_kind, "official");
  assert.deepEqual(result.officialEligibility.awaiting_official_confirmation, []);
  assert.equal(result.usableForRanking, true);
  assert.deepEqual(result.officialEligibility.reasons.map((reason) => reason.source_authority.classification), ["trusted", "primary"]);
});

test("a primary official source that contradicts Visa Atlas decides the result", async () => {
  const lacks = "The applicant lacks evidence of secured livelihood for the Opportunity Card.";
  const primaryMet = await evaluate([visaAtlasCheck({ result: "not_met", explanation: lacks }), livelihoodCheck()]);
  const primaryNotMet = await evaluate([visaAtlasCheck(), livelihoodCheck({ result: "not_met", explanation: lacks })]);

  assert.equal(primaryMet.officialEligibility.status, "PASS");
  assert.deepEqual(primaryMet.officialEligibility.blockers, []);
  assert.equal(primaryNotMet.officialEligibility.status, "FAIL");
  assert.equal(primaryNotMet.officialEligibility.assessment_kind, "official");
  assert.deepEqual(primaryNotMet.officialEligibility.blockers, ["Secured livelihood for the Opportunity Card under Section 20a(4)"]);
  assert.equal(primaryNotMet.usableForRanking, false);
});

function germanLanguageCheck(overrides = {}) {
  return {
    requirementId: "opportunity_card_language",
    claimType: "immigration_requirement",
    title: "German at A1 or English at B2 for the Opportunity Card",
    result: "met",
    explanation: "The applicant holds a B2 English certificate.",
    sourceUrl: "https://www.make-it-in-germany.com/en/visa-residence/opportunity-card/job-search",
    checkedAt: "2026-09-20",
    ...overrides
  };
}

test("official German pages already used in the published evidence confirm any immigration requirement they state", async () => {
  for (const [sourceUrl, ruleId] of [
    ["https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html", "de-residence-act"],
    ["https://www.make-it-in-germany.com/en/visa-residence/opportunity-card/job-search", "de-make-it-in-germany"],
    ["https://teheran.diplo.de/ir-de/02-service/2403868-2403868", "de-mission-tehran"],
    ["https://digital.diplo.de/chancenkarte", "de-consular-services-portal"]
  ]) {
    const result = await evaluate([visaAtlasCheck(), germanLanguageCheck({ sourceUrl }), livelihoodCheck()]);

    assert.equal(result.officialEligibility.reasons[1].source_authority.classification, "primary", sourceUrl);
    assert.equal(result.officialEligibility.reasons[1].source_authority.rule_id, ruleId, sourceUrl);
    assert.equal(result.officialEligibility.status, "PASS", sourceUrl);
  }
});

test("a primary not_met requirement fails the route even while another requirement awaits official confirmation", async () => {
  const result = await evaluate([
    visaAtlasCheck(),
    germanLanguageCheck({ result: "not_met", explanation: "The applicant has no qualifying language certificate." })
  ]);

  assert.equal(result.officialEligibility.status, "FAIL");
  assert.equal(result.officialEligibility.assessment_kind, "official");
  assert.deepEqual(result.officialEligibility.blockers, ["German at A1 or English at B2 for the Opportunity Card"]);
  assert.deepEqual(result.officialEligibility.awaiting_official_confirmation, [
    "Secured livelihood for the Opportunity Card under Section 20a(4)"
  ]);
  assert.equal(result.usableForRanking, false);
});
