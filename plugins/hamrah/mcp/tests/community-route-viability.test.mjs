import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool, TOOLS } from "../server.mjs";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const LIFECYCLE = { status: "active", first_seen: "2026-09-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const LAW = "https://www.gesetze-im-internet.example.de/aufenthg/__16b.html";
const NEWS = "https://news.example.org/2026/08/german-visas";
const UNI = "https://www.example-tech.edu/phd/computer-science";
const PROFILE = "https://www.example.org/people/researcher-profile";
const AS_OF = "2026-09-25";
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const IRAN_RESIDENTS = { ...EMPTY_SCOPE, residence_countries: ["IRN"] };
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, authority = "unknown", sourceType = "recognized_news", retrievedAt = "2026-09-11T00:00:00Z", stance = "supports" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: retrievedAt, published_at: "2026-09-01", event_date: "2026-08-20",
    content_hash: hash(`${id}:${text}`), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: stance, independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function claim(id, fields) {
  return {
    id, country_code: "DEU", routes: ["student_phd"], claim_type: "official_rule", process_stage: "visa_application",
    statement_en: "A doctoral study visa requires admission to a German university.",
    opposing_evidence_ids: [], evidence_ids: ["law"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}
function signal(id, fields) {
  const { validation, ...example } = structuredClone(V4.signals[0]);
  return {
    ...example, id, root_cause_id: id, title: "Tehran visa appointments are scarce",
    destination: { country: "Germany", country_code: "DEU", region: null, city: null },
    applicant_scope: IRAN_RESIDENTS, migration_routes: ["student_phd"], migration_route_family: ["STUDY"],
    process_stages: ["visa_application"], summary_en: "Applicants resident in Iran report scarce German visa appointments in Tehran.",
    officially_confirmed: false, official_verification: { status: "not_verified", source_url: null, source_title: null, verified_at: null, note: null },
    confidence: "medium", suggested_fit_adjustment: -10, conditional_adjustment: { adjustment: -10, apply_when: "The applicant applies from Iran." },
    suggested_recheck_date: "2026-10-09", evidence_ids: ["appointments"], correlated_signal_ids: [], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "law-site", source_name: "Residence Act section 16b", source_family: "gesetze-im-internet.example.de", public: true, source_url: LAW },
    { id: "news", source_name: "Public news report", source_family: "news.example.org", public: true, source_url: NEWS },
    { id: "uni", source_name: "Doctoral programme page", source_family: "example-tech.edu", public: true, source_url: UNI },
    { id: "chat", source_name: "Private applicant group", source_family: "chat-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("law", "law-site", "Section 16b grants residence permits for study to admitted students.", { url: LAW, authority: "primary", sourceType: "official_government" }),
    evidence("iran-pattern", "news", "Applicants from Iran report that German missions ask for extra documents for doctoral visas.", { url: `${NEWS}/documents` }),
    evidence("appointments", "news", "Applicants resident in Iran describe months-long waits for German visa appointments in Tehran.", { url: `${NEWS}/appointments` }),
    evidence("phd-page", "uni", "The doctoral page lists a funded position with a monthly stipend.", { url: UNI, authority: "primary", sourceType: "official_university" }),
    evidence("chat-post", "chat", "Members say the embassy is slow this month.", { sourceType: "community_opinion" })
  ],
  signals: [signal("tehran-appointments", {})],
  route_claims: [
    claim("admission-rule", {}),
    claim("iran-documents", {
      claim_type: "operational_pattern", applicant_scope: IRAN_RESIDENTS,
      statement_en: "German missions ask applicants resident in Iran for extra documents for doctoral visas.", evidence_ids: ["iran-pattern"]
    })
  ],
  questions: [], lived_experiences: [],
  academic_opportunities: [{
    id: "phd-ml", country_code: "DEU", routes: ["student_phd"], institution: "Example Technical University", department: null,
    program: "Doctoral programme", degree_level: "phd", field: "Computer Science", research_area: null, supervisor: null,
    deadline: "2026-12-15", deadline_evidence_ids: ["phd-page"], intake: null,
    funding: { status: "verified", components: [{ type: "stipend", status: "verified", amount: null, evidence_ids: ["phd-page"], opposing_evidence_ids: [] }] },
    admission_conditions: null,
    nationality_restrictions: { status: "unknown", details: null, evidence_ids: [] },
    iranian_evidence: { status: "not_checked", evidence_ids: [] },
    evidence_ids: ["phd-page"], lifecycle: structuredClone(LIFECYCLE)
  }]
};

const directories = [];
process.on("exit", () => directories.forEach((directory) => rmSync(directory, { recursive: true, force: true })));
function publish(candidate) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-viability-"));
  directories.push(directory);
  const file = path.join(directory, "viability.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "viability", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return { storeRoot, ids: JSON.parse(result.stdout).ids };
}
let cached;
const store = () => (cached ??= publish(CANDIDATE));
const callIn = async (storeRoot, name, args) => (await executeTool(name, args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") })).structuredContent;
const viability = (args = {}, storeRoot = store().storeRoot) => callIn(storeRoot, "getIranianRouteViability", { countryCode: "DEU", route: "student_phd", asOf: AS_OF, residenceCountry: "IRN", ...args });
const components = (result) => Object.fromEntries(Object.entries(result.measures.irvi.components).map(([name, item]) => [name, item.points]));

test("the viability tool is read-only", () => {
  assert.equal(TOOLS.find((item) => item.name === "getIranianRouteViability").annotations.readOnlyHint, true);
});

test("IRVI adds versioned component points and subtracts community friction", async () => {
  const { storeRoot, ids } = store();
  const result = await viability({ profileCompatibility: "high", executionPracticality: "medium" });
  const irvi = result.measures.irvi;
  assert.equal(irvi.policyVersion, "0.1.0");
  assert.equal(irvi.policyStatus, "provisional");
  assert.equal(irvi.policyReviewedAt, "2026-09-25");
  const points = components(result);
  assert.equal(points.official_accessibility, 20, "a current primary official rule");
  assert.equal(points.profile_compatibility, 15);
  assert.equal(points.execution_practicality, 9);
  assert.equal(points.iran_specific_evidence, 15, "public evidence scoped to applicants resident in Iran");
  assert.equal(points.qualified_examples, 0);
  assert.equal(points.funding_or_sponsorship, 10, "a verified official stipend");
  // Evidence quality is the route claims' mean Evidence Confidence on the component's 15-point scale.
  const scores = await Promise.all(Object.values(ids.route_claims).map(async (claimId) =>
    (await callIn(storeRoot, "validateRouteClaim", { claimId, asOf: AS_OF, residenceCountry: "IRN" })).evidenceConfidence.score));
  assert.equal(points.evidence_quality, Math.round(15 * (scores.reduce((a, b) => a + b, 0) / scores.length) / 100));
  assert.equal(irvi.friction.points, -10);
  const earned = Object.values(points).reduce((a, b) => a + b, 0);
  assert.equal(irvi.score, Math.round(earned) - 10, "every component was assessed, so the base is out of 100");
});

test("components without applicant input are not assessed and are left out of the base", async () => {
  const result = await viability();
  const irvi = result.measures.irvi;
  assert.equal(irvi.components.profile_compatibility.status, "not_assessed");
  assert.equal(irvi.components.execution_practicality.status, "not_assessed");
  assert.equal(irvi.components.profile_compatibility.points, 0);
  const assessed = Object.values(irvi.components).filter((item) => item.status !== "not_assessed");
  const earned = assessed.reduce((total, item) => total + item.points, 0);
  const max = assessed.reduce((total, item) => total + item.max, 0);
  assert.equal(max, 70);
  assert.equal(irvi.score, Math.round((100 * earned) / max) - 10);
  assert.ok(irvi.confidence.reasons.some((reason) => reason.code === "components_not_assessed"));
});

test("a current route without recent Iranian examples shows a numeric, low-confidence, unranked IRVI", async () => {
  const result = await viability({ profileCompatibility: "high", executionPracticality: "high" });
  const irvi = result.measures.irvi;
  assert.equal(typeof irvi.score, "number");
  assert.equal(irvi.confidence.label, "low");
  assert.ok(irvi.confidence.reasons.some((reason) => reason.code === "no_recent_qualified_examples"));
  assert.equal(result.ranking.rankable, false);
  assert.equal(result.ranking.threshold.policyVersion, "1.0.0");
  assert.equal(result.ranking.threshold.route, "student_phd");
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "insufficient_iran_source_families"));
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "no_recent_qualified_examples"));
});

test("a Signal with unknown freshness cannot change friction or Community Confidence", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.signals[0].suggested_recheck_date = "unknown";
  candidate.route_claims = [candidate.route_claims[0]];
  const result = await viability({}, publish(candidate).storeRoot);
  assert.equal(result.measures.irvi.friction.points, 0);
  assert.equal(result.measures.communityConfidence.applicableSignals, 0);
  assert.equal(result.measures.communityConfidence.unknownFreshnessWarnings.length, 1);
  assert.equal(result.measures.irvi.components.iran_specific_evidence.points, 8, "unconfirmed Signal freshness does not establish current Iran-specific evidence");
});

test("a stale Iran-scoped Route Claim cannot establish current Iran-specific evidence", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.signals = [];
  candidate.evidence.find((item) => item.id === "iran-pattern").event_date = "2023-08-20";
  candidate.evidence.find((item) => item.id === "iran-pattern").published_at = "2023-09-01";
  const result = await viability({}, publish(candidate).storeRoot);
  assert.equal(result.measures.irvi.components.iran_specific_evidence.points, 8);
});

test("IRVI requires an explicit Iran connection and cites public evidence for scored components", async () => {
  const { storeRoot } = store();
  const outside = await callIn(storeRoot, "getIranianRouteViability", { countryCode: "DEU", route: "student_phd", asOf: AS_OF, nationality: "USA", residenceCountry: "USA" });
  assert.equal(outside.error, "invalid_irvi_applicant");

  const result = await viability({}, storeRoot);
  const source = result.measures.irvi.components.official_accessibility.evidence[0];
  assert.equal(source.artifactId.length > 0, true);
  assert.equal(source.sourceUrl, LAW);
  assert.equal(source.freshness, "current");
  assert.equal(result.measures.irvi.components.iran_specific_evidence.evidence.length > 0, true);
});

test("qualified examples raise the component, while a provisional policy keeps confidence low", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.sources.push({ id: "profile-site", source_name: "Public professional profile", source_family: "example.org", public: true, source_url: PROFILE });
  candidate.evidence.push(evidence("profile", "profile-site", "The public profile states the researcher is from Iran and began a PhD in Germany in April 2026.", { url: PROFILE, sourceType: "first_hand_applicant_experience" }));
  candidate.evidence.at(-1).public_person_locator = true;
  candidate.lived_experiences = [{
    id: "enrolled", country_code: "DEU", routes: ["student_phd"], milestone: "enrolled", outcome: "milestone_attained", event_date: "2026-04-01",
    entity: null, applicant_scope: { ...EMPTY_SCOPE, nationalities: ["IRN"] },
    iran_connection: { status: "explicit", basis: "self_declared", evidence_ids: ["profile"] },
    summary_en: "A doctoral researcher from Iran enrolled in a German PhD programme in April 2026.",
    evidence_ids: ["profile"], lifecycle: structuredClone(LIFECYCLE)
  }];
  const { storeRoot } = publish(candidate);
  const result = await viability({ profileCompatibility: "high", executionPracticality: "high" }, storeRoot);
  const irvi = result.measures.irvi;
  assert.equal(irvi.components.qualified_examples.points, 5, "one recent qualified example earns half the component");
  assert.equal(JSON.stringify(irvi).includes(PROFILE), false, "ordinary IRVI output withholds public person profile locators");
  assert.equal(irvi.confidence.label, "low");
  assert.notEqual(irvi.confidence.uncappedLabel, "low");
  assert.deepEqual(irvi.confidence.reasons.map((reason) => reason.code), ["provisional_policy"]);
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "insufficient_official_source_families"));
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "insufficient_iran_source_families"));

  const beforeMilestone = await viability({ asOf: "2026-03-01" }, storeRoot);
  assert.equal(beforeMilestone.measures.irvi.components.qualified_examples.count, 0, "a later milestone is not a past success as of the assessment date");
});

test("an official contradiction or a stale decisive rule zeroes official accessibility and blocks ranking", async () => {
  const contradicted = structuredClone(CANDIDATE);
  contradicted.evidence.push(evidence("repeal", "law-site", "An amendment replaces section 16b admission requirements from September 2026.", { url: `${LAW}#amendment`, authority: "primary", sourceType: "official_government", stance: "contradicts" }));
  contradicted.route_claims[0].opposing_evidence_ids = ["repeal"];
  const conflict = await viability({}, publish(contradicted).storeRoot);
  assert.equal(conflict.measures.irvi.components.official_accessibility.status, "contradicted");
  assert.equal(conflict.measures.irvi.components.official_accessibility.points, 0);
  assert.ok(conflict.measures.irvi.components.official_accessibility.evidence.some((item) => item.role === "opposes" && item.evidenceId));
  assert.ok(conflict.ranking.reasons.some((reason) => reason.code === "unresolved_official_conflict"));
  assert.equal(conflict.measures.irvi.confidence.label, "low");

  const stale = structuredClone(CANDIDATE);
  stale.evidence[0].retrieved_at = "2023-06-01T00:00:00Z";
  const old = await viability({}, publish(stale).storeRoot);
  assert.equal(old.measures.irvi.components.official_accessibility.status, "stale");
  assert.equal(old.measures.irvi.components.official_accessibility.points, 0);
  assert.ok(old.ranking.reasons.some((reason) => reason.code === "stale_decisive_fact"));
  assert.ok(old.measures.irvi.confidence.reasons.some((reason) => reason.code === "stale_official_data"));
});

test("official eligibility, applicant fit, Practical Fit, community measures, IRVI, and statistics stay separate", async () => {
  const base = await viability({ profileCompatibility: "high", executionPracticality: "high" });
  const withScorecard = await viability({ profileCompatibility: "high", executionPracticality: "high", officialEligibility: "FAIL", applicantFit: 72, practicalFit: 62 });
  assert.equal(withScorecard.measures.irvi.score, base.measures.irvi.score, "scorecard measures never enter IRVI");
  assert.deepEqual(withScorecard.measures.officialEligibility, { status: "FAIL", source: "caller_scorecard" });
  assert.deepEqual(withScorecard.measures.applicantFit, { value: 72, source: "caller_scorecard" });
  assert.deepEqual(withScorecard.measures.practicalFit, { value: 62, source: "caller_scorecard" });
  assert.deepEqual(base.measures.applicantFit, { value: null, source: "not_supplied" });
  assert.equal(withScorecard.measures.communityConfidence.applicableSignals, 1);
  assert.deepEqual(withScorecard.measures.officialApprovalStatistics.statistics, []);
  assert.ok(withScorecard.ranking.reasons.some((reason) => reason.code === "official_fail"));
  assert.equal(withScorecard.measures.irvi.label, "Iranian Route Viability Index");
  assert.match(withScorecard.measures.irvi.notice, /not an approval probability/);
  const keys = [];
  JSON.stringify(withScorecard, (key, value) => { keys.push(key); return value; });
  assert.deepEqual(keys.filter((key) => /probab|chance/i.test(key)), []);
});

test("a route without a current official basis has no IRVI", async () => {
  const result = await viability({ countryCode: "JPN", route: "student_phd" });
  assert.equal(result.measures.irvi.score, null);
  assert.equal(result.measures.irvi.status, "research_required");
  assert.equal(result.ranking.rankable, false);
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "no_official_basis"));
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "no_route_evidence_threshold"));
});

function passingCandidate() {
  const candidate = structuredClone(CANDIDATE);
  const FINANCE = "https://www.auswaertiges-amt.example.de/visa/study-finance";
  const REGIONAL = "https://regional.example.org/iran-study-observation";
  candidate.sources.push(
    { id: "finance-site", source_name: "Federal Foreign Office finance guidance", source_family: "auswaertiges-amt.example.de", public: true, source_url: FINANCE },
    { id: "regional", source_name: "Independent regional report", source_family: "regional.example.org", public: true, source_url: REGIONAL },
    { id: "profile-site", source_name: "Public professional profile", source_family: "example.org", public: true, source_url: PROFILE }
  );
  candidate.evidence.push(
    evidence("finance-rule", "finance-site", "Official guidance requires proof of study financing.", { url: FINANCE, authority: "primary", sourceType: "official_government" }),
    evidence("regional-report", "regional", "Applicants resident in Iran describe a separate German study visa processing delay.", { url: REGIONAL }),
    { ...evidence("profile", "profile-site", "The public profile states the researcher is from Iran and enrolled in a German PhD in April 2026.", { url: PROFILE, sourceType: "first_hand_applicant_experience" }), public_person_locator: true }
  );
  candidate.route_claims.push(claim("finance-requirement", { claim_type: "financial_requirement", statement_en: "Study applicants must prove adequate financing.", evidence_ids: ["finance-rule"] }));
  candidate.signals.push(signal("regional-delay", { title: "Separate processing delay", summary_en: "Applicants resident in Iran describe another German study visa processing delay.", evidence_ids: ["regional-report"], suggested_fit_adjustment: 0, conditional_adjustment: { adjustment: 0, apply_when: "The applicant applies from Iran." } }));
  candidate.lived_experiences = [{
    id: "enrolled", country_code: "DEU", routes: ["student_phd"], milestone: "enrolled", outcome: "milestone_attained", event_date: "2026-04-01",
    entity: null, applicant_scope: { ...EMPTY_SCOPE, nationalities: ["IRN"] },
    iran_connection: { status: "explicit", basis: "self_declared", evidence_ids: ["profile"] },
    summary_en: "A doctoral researcher from Iran enrolled in a German PhD programme in April 2026.",
    evidence_ids: ["profile"], lifecycle: structuredClone(LIFECYCLE)
  }];
  return candidate;
}

test("a configured German route passes only with current official and independent public Iran evidence", async () => {
  const candidate = passingCandidate();
  const result = await viability({ officialEligibility: "PASS" }, publish(candidate).storeRoot);
  assert.equal(result.ranking.rankable, true);
  assert.equal(result.ranking.threshold.status, "pass");
  assert.deepEqual(result.ranking.reasons, []);
  assert.equal(result.ranking.threshold.observed.officialSourceFamilies, 2);
  assert.equal(result.ranking.threshold.observed.iranSourceFamilies, 2);

  const copiedReport = structuredClone(candidate);
  copiedReport.evidence.find((item) => item.id === "regional-report").independence_group = "appointments";
  const copied = await viability({ officialEligibility: "PASS" }, publish(copiedReport).storeRoot);
  assert.equal(copied.ranking.rankable, false, "a copied report in another source family is still one independent report");
  assert.equal(copied.ranking.threshold.observed.iranSourceFamilies, 1);

  const withPrivate = structuredClone(candidate);
  withPrivate.signals.push(signal("private-warning", { title: "Private applicant warning", summary_en: "Applicants resident in Iran privately reported another delay.", evidence_ids: ["chat-post"], suggested_fit_adjustment: -15, conditional_adjustment: { adjustment: -15, apply_when: "The applicant applies from Iran." } }));
  withPrivate.route_claims.push(claim("private-rule", { statement_en: "A private group claims another rule applies.", evidence_ids: ["chat-post"] }));
  const privateResult = await viability({ officialEligibility: "PASS" }, publish(withPrivate).storeRoot);
  assert.equal(privateResult.ranking.rankable, true, "private reports cannot change a passing public rank");
  assert.equal(privateResult.measures.irvi.score, result.measures.irvi.score);
  assert.deepEqual(privateResult.ranking.threshold.observed.iranFamilies, result.ranking.threshold.observed.iranFamilies);

  const failed = await viability({ officialEligibility: "FAIL" }, publish(candidate).storeRoot);
  assert.equal(failed.ranking.rankable, false);
  assert.ok(failed.ranking.reasons.some((reason) => reason.code === "official_fail"));

  const unresolved = structuredClone(candidate);
  unresolved.route_claims.push(claim("unverified-rule", { statement_en: "Another purported study requirement needs official verification.", evidence_ids: ["iran-pattern"] }));
  const unresolvedResult = await viability({ officialEligibility: "PASS" }, publish(unresolved).storeRoot);
  assert.equal(unresolvedResult.ranking.rankable, false);
  assert.ok(unresolvedResult.ranking.reasons.some((reason) => reason.code === "unresolved_official_requirements"));

  const eligibilityUnknown = await viability({ officialEligibility: "UNKNOWN" }, publish(candidate).storeRoot);
  assert.equal(eligibilityUnknown.ranking.rankable, false);
  assert.ok(eligibilityUnknown.ranking.reasons.some((reason) => reason.code === "official_eligibility_unresolved"));
});

test("private reports cannot satisfy public route thresholds", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.route_claims[1].evidence_ids = ["chat-post"];
  candidate.signals[0].evidence_ids = ["chat-post"];
  candidate.academic_opportunities[0].evidence_ids = ["chat-post"];
  candidate.academic_opportunities[0].deadline_evidence_ids = ["chat-post"];
  candidate.academic_opportunities[0].funding.status = "unverified";
  candidate.academic_opportunities[0].funding.components[0].status = "unverified";
  candidate.academic_opportunities[0].funding.components[0].evidence_ids = ["chat-post"];
  const result = await viability({ officialEligibility: "PASS" }, publish(candidate).storeRoot);
  assert.equal(result.ranking.rankable, false);
  assert.equal(result.ranking.threshold.observed.iranSourceFamilies, 0);
  assert.equal(result.measures.irvi.components.funding_or_sponsorship.status, "not_assessed");
  assert.ok(result.ranking.reasons.some((reason) => reason.code === "insufficient_iran_source_families"));
});

test("the reviewed thresholds describe the first published German routes", async () => {
  for (const route of ["student_bachelor", "student_masters_taught", "student_masters_research", "student_phd", "opportunity_card"]) {
    const result = (await executeTool("getIranianRouteViability", { countryCode: "DEU", route, residenceCountry: "IRN", officialEligibility: "PASS", asOf: AS_OF })).structuredContent;
    const expectedOfficial = route === "opportunity_card" ? 1 : 2;
    assert.equal(result.ranking.threshold.requirements.current_official_source_families, expectedOfficial);
    assert.equal(result.ranking.threshold.observed.officialSourceFamilies, expectedOfficial);
    assert.equal(result.ranking.threshold.observed.iranSourceFamilies, 1);
    assert.equal(result.ranking.threshold.observed.qualifiedRecentExamples, 0);
    assert.equal(result.ranking.rankable, false);
    assert.deepEqual(result.ranking.reasons.map((reason) => reason.code), ["insufficient_iran_source_families", "no_recent_qualified_examples"]);
  }
});

test("route discovery is read-only and separates uncovered countries from unranked candidates", async () => {
  assert.equal(TOOLS.find((item) => item.name === "findViableRoutesForIranians").annotations.readOnlyHint, true);
  const result = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["DEU", "JPN"], residenceCountry: "IRN", asOf: AS_OF, maxCandidates: 10
  })).structuredContent;
  assert.equal(result.status, "partial_coverage");
  assert.equal(result.ranked.length, 0);
  assert.equal(result.unranked.length, 5);
  assert.ok(result.coverage.countries.some((item) => item.countryCode === "JPN" && item.status === "no_coverage"));
  assert.ok(result.unranked.every((item) => item.reasons.some((reason) => reason.code === "official_eligibility_unresolved")));
  assert.ok(result.unranked.every((item) => item.summaryFa.includes("رتبه")));
  assert.ok(result.unranked.every((item) => item.summaryFa.includes("آلمان")));

  const uncovered = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["JPN"], residenceCountry: "IRN", asOf: AS_OF
  })).structuredContent;
  assert.equal(uncovered.status, "research_required");
  assert.equal(uncovered.coverage.countries[0].status, "no_coverage");
  assert.deepEqual(uncovered.ranked, []);
});

test("route discovery reports provider failure and enforces candidate fan-out limits", async () => {
  const failed = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["DEU"], residenceCountry: "IRN", asOf: AS_OF
  }, globalThis.fetch, { evidenceProvider: { discoverCandidates: async () => { throw new Error("provider offline"); } } })).structuredContent;
  assert.equal(failed.status, "research_required");
  assert.deepEqual(failed.ranked, []);
  assert.deepEqual(failed.unranked, []);
  assert.equal(failed.provider.status, "unavailable");

  const limited = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["DEU"], residenceCountry: "IRN", asOf: AS_OF, maxCandidates: 2
  })).structuredContent;
  assert.equal(limited.ranked.length + limited.unranked.length, 2);
  assert.equal(limited.coverage.truncatedCandidates, true);

  const invalid = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["DEU"], residenceCountry: "IRN", asOf: AS_OF,
    routeAssessments: [
      { countryCode: "DEU", route: "student_phd", officialEligibility: "PASS" },
      { countryCode: "DEU", route: "student_phd", officialEligibility: "FAIL" }
    ]
  })).structuredContent;
  assert.equal(invalid.error, "invalid_route_discovery_input");

  const timedOut = (await executeTool("findViableRoutesForIranians", {
    countryCodes: ["DEU"], residenceCountry: "IRN", asOf: AS_OF
  }, globalThis.fetch, { deadlineMs: 20, evidenceProvider: { discoverCandidates: () => new Promise(() => {}) } })).structuredContent;
  assert.equal(timedOut.error, "operation_deadline_exceeded");
});

test("route discovery ranks a qualified route and explains official FAIL, stale facts, and missing evidence", async () => {
  const candidate = passingCandidate();
  const { storeRoot } = publish(candidate);
  const args = {
    countryCodes: ["DEU"], residenceCountry: "IRN", asOf: AS_OF,
    routeAssessments: [{ countryCode: "DEU", route: "student_phd", officialEligibility: "PASS", applicantFit: 78, practicalFit: 68 }]
  };
  const unverified = await callIn(storeRoot, "findViableRoutesForIranians", args);
  assert.equal(unverified.ranked.length, 0, "a caller-supplied PASS is not verified eligibility");
  assert.equal(unverified.unranked[0].officialEligibility.claimedStatus, "PASS");
  assert.equal(unverified.unranked[0].officialEligibility.verificationStatus, "unverified");
  const verifiedOptions = {
    signalStoreRoot: path.join(storeRoot, "datasets"),
    eligibilityProvider: { assess: async () => ({ status: "PASS", verificationStatus: "verified", freshness: "current", assessmentId: "scorecard-1", sourceIds: ["law-site"] }) }
  };
  const ranked = (await executeTool("findViableRoutesForIranians", args, globalThis.fetch, verifiedOptions)).structuredContent;
  assert.equal(ranked.status, "complete");
  assert.equal(ranked.ranked.length, 1);
  assert.equal(ranked.unranked.length, 0);
  const route = ranked.ranked[0];
  assert.equal(route.qualifiedExampleCount, 1);
  assert.equal(route.officialEligibility.status, "PASS");
  assert.equal(route.officialEligibility.assessmentId, "scorecard-1");
  assert.equal(route.evidence.freshness.decisiveFactCurrent, true);
  assert.equal(route.evidence.verification.status, "validated_public_dataset");
  assert.equal(route.evidence.verification.routeThresholdStatus, "pass");
  assert.equal(route.evidence.privacy.status, "public_only");
  assert.ok(route.evidence.trace.some((item) => item.authority === "primary" && item.freshness === "current"));
  assert.equal(route.applicantFit.value, 78);
  assert.equal(route.practicalFit.value, 68);
  assert.equal(route.confidence.label, "low");
  assert.ok(route.sourceIds.length >= 3);
  assert.ok(route.evidenceIds.length >= 3);
  assert.ok(route.sourceIds.every((id) => !route.evidenceIds.includes(id)));
  assert.ok(route.risks.some((risk) => risk.kind === "community_friction"));
  assert.equal(route.frictionPoints, -10);
  assert.ok(route.idealNextActions.length > 0);
  assert.match(route.summaryFa, /رتبه‌بندی پذیرفته شده/);
  assert.ok(route.reasons.some((reason) => reason.code === "route_evidence_threshold_pass"));

  const failed = await callIn(storeRoot, "findViableRoutesForIranians", {
    ...args, routeAssessments: [{ countryCode: "DEU", route: "student_phd", officialEligibility: "FAIL" }]
  });
  assert.equal(failed.ranked.length, 0);
  assert.ok(failed.unranked[0].reasons.some((reason) => reason.code === "official_fail"));

  const staleCandidate = passingCandidate();
  staleCandidate.evidence.find((item) => item.id === "law").retrieved_at = "2023-06-01T00:00:00Z";
  const stale = (await executeTool("findViableRoutesForIranians", args, globalThis.fetch, {
    ...verifiedOptions, signalStoreRoot: path.join(publish(staleCandidate).storeRoot, "datasets")
  })).structuredContent;
  assert.equal(stale.ranked.length, 0);
  assert.ok(stale.unranked[0].reasons.some((reason) => reason.code === "stale_decisive_fact"));

  const insufficient = await callIn(store().storeRoot, "findViableRoutesForIranians", args);
  assert.equal(insufficient.ranked.length, 0);
  assert.ok(insufficient.unranked[0].reasons.some((reason) => reason.code === "insufficient_iran_source_families"));
});
