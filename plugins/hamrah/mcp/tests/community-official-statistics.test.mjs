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
const STATS_PAGE = "https://www.auswaertiges-amt.example.de/visa-statistics-2025";
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const IRANIAN_STUDY = "Study visa applications by Iranian nationals at German missions";
const YEAR_2025 = { start: "2025-01-01", end: "2025-12-31" };
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, authority = "primary", sourceType = "official_immigration_authority" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: "2026-09-11T00:00:00Z", published_at: "2026-03-01", event_date: null,
    content_hash: hash(text), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: "supports", independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
const count = (value, population_en = IRANIAN_STUDY, period = YEAR_2025) => ({ count: value, population_en, period });
function statistic(id, fields) {
  return {
    id, country_code: "DEU", routes: ["student_phd", "student_masters_taught"],
    authority: { entity_type: "immigration_authority", name: "Federal Foreign Office" },
    population: { description_en: IRANIAN_STUDY, applicant_scope: { ...EMPTY_SCOPE, nationalities: ["IRN"] } },
    period: YEAR_2025,
    counts: { applications: count(4000), approvals: count(2600), refusals: count(1100) },
    published_success_rate: 65,
    evidence_ids: ["stats-page"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "ministry", source_name: "Federal Foreign Office visa statistics", source_family: "auswaertiges-amt.example.de", public: true, source_url: STATS_PAGE },
    { id: "chat", source_name: "Private applicant group", source_family: "chat-group", public: false, source_url: null },
    { id: "blog", source_name: "Public migration blog", source_family: "blog.example.org", public: true, source_url: "https://blog.example.org/german-visa-odds" }
  ],
  evidence: [
    evidence("stats-page", "ministry", "The ministry table lists 2025 study visa applications, approvals, and refusals for Iranian nationals.", { url: STATS_PAGE }),
    evidence("chat-tally", "chat", "Group members counted twelve approvals among twenty applicants this year.", { authority: "unknown", sourceType: "community_opinion" }),
    evidence("blog-tally", "blog", "A blog survey of readers estimates a German study visa approval share for 2025.", { url: "https://blog.example.org/german-visa-odds", authority: "unknown", sourceType: "second_hand_report" })
  ],
  signals: [], route_claims: [], questions: [], academic_opportunities: [], lived_experiences: [],
  official_statistics: [
    statistic("complete", {}),
    statistic("no-denominator", {
      period: { start: "2024-01-01", end: "2024-12-31" },
      counts: { applications: null, approvals: count(2400, IRANIAN_STUDY, { start: "2024-01-01", end: "2024-12-31" }), refusals: null },
      published_success_rate: 62
    }),
    statistic("mixed-population", {
      period: { start: "2023-01-01", end: "2023-12-31" },
      counts: {
        applications: count(3500, IRANIAN_STUDY, { start: "2023-01-01", end: "2023-12-31" }),
        approvals: count(90000, "Study visas issued to all nationalities worldwide", { start: "2023-01-01", end: "2023-12-31" }),
        refusals: count(900, IRANIAN_STUDY, { start: "2022-07-01", end: "2023-06-30" })
      },
      published_success_rate: null
    })
  ]
};

const directories = [];
process.on("exit", () => directories.forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function publish(candidate) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-statistics-"));
  directories.push(directory);
  const file = path.join(directory, "statistics.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "statistics", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  return { storeRoot, result, ids: result.status === 0 ? JSON.parse(result.stdout).ids.official_statistics : null };
}

let cached;
const store = () => (cached ??= publish(CANDIDATE));
const search = async (args = {}) => (await executeTool("searchOfficialApprovalStatistics", args, globalThis.fetch, { signalStoreRoot: path.join(store().storeRoot, "datasets") })).structuredContent;
const byId = (result, id) => result.statistics.find((item) => item.statisticId === id);

test("the statistics tool is read-only", () => {
  assert.equal(TOOLS.find((item) => item.name === "searchOfficialApprovalStatistics").annotations.readOnlyHint, true);
});

test("a complete official statistic reports its rates with source, population, and period", async () => {
  const { result, ids } = store();
  assert.equal(result.status, 0, result.stderr);
  assert.match(ids.complete, /^sta_[0-9a-f]{32}$/);
  const found = await search({ countryCode: "DEU", route: "student_phd" });
  assert.equal(found.coverage.status, "evidence_found");
  const stat = byId(found, ids.complete);
  assert.equal(stat.status, "official");
  assert.equal(stat.official_success_rate, 65);
  assert.equal(stat.official_refusal_rate, 27.5);
  assert.deepEqual(stat.reasons, []);
  assert.deepEqual(stat.period, YEAR_2025);
  assert.equal(stat.population.description_en, IRANIAN_STUDY);
  assert.equal(stat.authority.name, "Federal Foreign Office");
  assert.deepEqual(stat.sources.map((item) => [item.sourceUrl, item.retrievedAt]), [[STATS_PAGE, "2026-09-11T00:00:00Z"]]);
});

test("statistics are presented apart from IRVI, applicant fit, and community measures", async () => {
  const found = await search({ countryCode: "DEU" });
  assert.match(found.separation, /not the Iranian Route Viability Index/);
  assert.match(found.separation, /applicant fit/);
  assert.match(found.separation, /Community Confidence/);
  const keys = [];
  JSON.stringify(found, (key, value) => { keys.push(key); return value; });
  assert.deepEqual(keys.filter((key) => /irvi|viability|fit|confidence|observed|community/i.test(key)), []);
});

test("a missing denominator or mismatched population leaves the statistic unresolved", async () => {
  const { ids } = store();
  const found = await search({ countryCode: "DEU" });
  const partial = byId(found, ids["no-denominator"]);
  assert.equal(partial.status, "unresolved");
  assert.equal(partial.official_success_rate, null, "a stated rate without its denominator is not reproduced");
  assert.equal(partial.publishedSuccessRate, 62);
  assert.deepEqual(partial.reasons.map((item) => item.code), ["missing_denominator"]);

  const mixed = byId(found, ids["mixed-population"]);
  assert.equal(mixed.status, "unresolved");
  assert.equal(mixed.official_success_rate, null);
  assert.equal(mixed.official_refusal_rate, null);
  assert.deepEqual(mixed.reasons.map((item) => [item.code, item.measure]), [["mismatched_population", "approvals"], ["mismatched_period", "refusals"]]);
});

test("statistics outside the applicant's scope are excluded and absent coverage is explicit", async () => {
  assert.deepEqual((await search({ countryCode: "DEU", nationality: "AFG" })).statistics, []);
  const none = await search({ countryCode: "JPN" });
  assert.equal(none.coverage.status, "no_coverage");
  assert.match(none.coverage.note, /missing coverage/);
});

test("community samples, inconsistent arithmetic, and undefined periods are refused at publication", () => {
  const cases = [
    [(stat) => { stat.evidence_ids = ["chat-tally"]; }, /authoritative public HTTPS source/],
    [(stat) => { stat.evidence_ids = ["blog-tally"]; }, /community samples cannot be official statistics/],
    [(stat) => { stat.period = { start: "2026-01-01", end: "2026-12-31" }; for (const measure of ["applications", "approvals", "refusals"]) stat.counts[measure].period = stat.period; }, /period ends after generated_at/],
    [(stat) => { stat.counts = { applications: count(0), approvals: count(0), refusals: null }; stat.published_success_rate = 50; }, /published_success_rate needs applications/],
    [(stat) => { stat.counts.refusals = count(1500); }, /approvals and refusals exceed applications/],
    [(stat) => { stat.counts.approvals = count(4100); stat.published_success_rate = null; }, /approvals exceed applications/],
    [(stat) => { stat.published_success_rate = 70; }, /published_success_rate 70 does not match 65/],
    [(stat) => { stat.period = { start: "2025-12-31", end: "2025-01-01" }; }, /period starts after it ends/],
    [(stat) => { stat.counts = { applications: count(4000), approvals: null, refusals: null }; }, /needs approvals or refusals/],
    [(stat) => { stat.population.description_en = " "; }, /population/]
  ];
  for (const [mutate, reason] of cases) {
    const candidate = structuredClone(CANDIDATE);
    candidate.official_statistics = [statistic("candidate", {})];
    mutate(candidate.official_statistics[0]);
    const { result } = publish(candidate);
    assert.notEqual(result.status, 0, String(reason));
    assert.match(result.stderr, reason);
  }
});

test("datasets without official statistics still publish and read", async () => {
  const candidate = structuredClone(CANDIDATE);
  delete candidate.official_statistics;
  candidate.evidence = candidate.evidence.slice(0, 1);
  candidate.route_claims = [{
    id: "rule", country_code: "DEU", routes: ["student_phd"], claim_type: "official_rule", process_stage: "visa_application",
    statement_en: "A study visa application needs proof of admission.", opposing_evidence_ids: [], evidence_ids: ["stats-page"], lifecycle: structuredClone(LIFECYCLE)
  }];
  const { result, storeRoot } = publish(candidate);
  assert.equal(result.status, 0, result.stderr);
  const published = JSON.parse(readFileSync(JSON.parse(result.stdout).published, "utf8"));
  assert.equal("official_statistics" in published, false, "an absent collection keeps older content digests stable");
  const found = (await executeTool("searchOfficialApprovalStatistics", {}, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") })).structuredContent;
  assert.equal(found.coverage.status, "no_coverage");
});

test("a refusal-only statistic has no official success rate, and a rate over decided cases is accepted", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.official_statistics = [
    statistic("refusals-only", { counts: { applications: count(4000), approvals: null, refusals: count(1100) }, published_success_rate: null }),
    statistic("decided-share", { period: { start: "2024-01-01", end: "2024-12-31" }, counts: {
      applications: count(100, IRANIAN_STUDY, { start: "2024-01-01", end: "2024-12-31" }),
      approvals: count(60, IRANIAN_STUDY, { start: "2024-01-01", end: "2024-12-31" }),
      refusals: count(20, IRANIAN_STUDY, { start: "2024-01-01", end: "2024-12-31" })
    }, published_success_rate: 75 }),
    statistic("no-applications", { period: { start: "2023-01-01", end: "2023-12-31" }, counts: {
      applications: count(0, IRANIAN_STUDY, { start: "2023-01-01", end: "2023-12-31" }),
      approvals: count(0, IRANIAN_STUDY, { start: "2023-01-01", end: "2023-12-31" }),
      refusals: null
    }, published_success_rate: null })
  ];
  const { result, storeRoot, ids } = publish(candidate);
  assert.equal(result.status, 0, result.stderr);
  const found = (await executeTool("searchOfficialApprovalStatistics", {}, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") })).structuredContent;
  const refusals = byId(found, ids["refusals-only"]);
  assert.equal(refusals.status, "unresolved", "without an approvals count there is no official success rate");
  assert.equal(refusals.official_success_rate, null);
  assert.equal(refusals.official_refusal_rate, 27.5);
  assert.deepEqual(refusals.reasons.map((item) => item.code), ["missing_approvals"]);
  const decided = byId(found, ids["decided-share"]);
  assert.equal(decided.official_success_rate, 60, "the reproduced rate always divides by applications");
  assert.equal(decided.publishedSuccessRate, 75);
  const empty = byId(found, ids["no-applications"]);
  assert.equal(empty.status, "unresolved");
  assert.deepEqual(empty.reasons.map((item) => item.code), ["zero_applications"]);
});
