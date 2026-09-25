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
const AS_OF = "2026-09-25";
const LIFECYCLE = { status: "active", first_seen: "2026-08-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, authority = "unknown", retrievedAt = "2026-09-11T00:00:00Z", stance = "supports", group = id, sourceType = "first_hand_applicant_experience" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: retrievedAt, published_at: null, event_date: null,
    content_hash: hash(text), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: stance, independence_group: group, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function claim(id, statement, evidenceIds, { claimType = "official_rule", countryCode = "DEU", routes = ["opportunity_card"], opposing = [] } = {}) {
  return {
    id, country_code: countryCode, routes, claim_type: claimType, process_stage: null, statement_en: statement,
    opposing_evidence_ids: opposing, evidence_ids: evidenceIds, lifecycle: structuredClone(LIFECYCLE)
  };
}
function signal(id, evidenceIds, { recheck = "2026-12-01", title = "Opportunity Card holders report finding part-time work" } = {}) {
  return {
    ...structuredClone(V4.signals[0]), id, root_cause_id: id, title, confidence: "medium", suggested_fit_adjustment: 0,
    impact_direction: "neutral", destination: { country: "Germany", country_code: "DEU", region: null, city: null },
    migration_routes: ["opportunity_card"], migration_route_family: ["EMPLOYMENT / WORK"], evidence_ids: evidenceIds,
    suggested_recheck_date: recheck, lifecycle: structuredClone(LIFECYCLE)
  };
}
function question(id, canonicalEn, answerLinks) {
  return {
    id, canonical_en: canonicalEn, canonical_fa: `پرسش درباره کارت فرصت ${id}`, variants: [], country_codes: ["DEU"],
    routes: ["opportunity_card"], topics: ["work_rights"], process_stages: [], independent_asker_count: 1, trend: "stable",
    answer_status: "unresolved", evidence_ids: ["ask"], answer_links: answerLinks, lifecycle: structuredClone(LIFECYCLE)
  };
}

const LAW = "https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html";
const OLD = "https://www.example.gov/old-livelihood-amount";
const rules = {
  ...structuredClone(V4),
  sources: [
    { id: "law", source_name: "Residence Act section 20a", source_family: "gesetze-im-internet.de", public: true, source_url: LAW },
    { id: "old-page", source_name: "Archived funds page", source_family: "example.gov", public: true, source_url: OLD },
    { id: "community-a", source_name: "community-a group", source_family: "community-a", public: false, source_url: null },
    { id: "community-b", source_name: "community-b group", source_family: "community-b", public: false, source_url: null }
  ],
  evidence: [
    evidence("law-text", "law", "Section 20a allows work of up to 20 hours a week on average.", { url: LAW, authority: "primary", sourceType: "official_government" }),
    evidence("old-amount", "old-page", "An archived page stated a monthly funds amount.", { url: OLD, authority: "primary", retrievedAt: "2024-01-01T00:00:00Z", sourceType: "official_government" }),
    evidence("post-a", "community-a", "A member found a 20-hour job within two months on the card.", { group: "member-1" }),
    evidence("post-b", "community-b", "A member found a 20-hour job within two months on the card.", { group: "member-1-copy" }),
    evidence("post-c", "community-a", "A member could not find any part-time job allowed on the card.", { group: "member-2" })
  ],
  signals: [
    signal("found-work", ["post-a", "post-b"]),
    signal("no-work", ["post-c"], { title: "Opportunity Card holders report no part-time work" })
  ],
  route_claims: [
    claim("work-limit", "An Opportunity Card allows work of up to 20 hours a week on average.", ["law-text"]),
    claim("old-funds", "An archived funds amount applied to the Opportunity Card.", ["old-amount"], { claimType: "financial_requirement" }),
    claim("canada-rule", "A Canadian rule that does not apply to Germany.", ["law-text"], { countryCode: "CAN" }),
    claim("mixed-funds", "A funds amount applies to the Opportunity Card.", ["old-amount", "post-a"], { claimType: "financial_requirement" }),
    claim("pattern", "Card holders usually find part-time work within two months.", ["law-text"], { claimType: "operational_pattern" })
  ],
  questions: []
};

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-answers-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function publish(directory, storeRoot, data, label, now) {
  const file = path.join(directory, `${label}.json`);
  writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", label, "--now", now], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function buildStore(t) {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const ruleIds = publish(directory, storeRoot, rules, "rules", "2026-09-20T00:00:00Z").ids;
  const id = (collection, key) => ruleIds[collection][key];
  const ask = evidence("ask", "community-a", "A member asked whether the card allows part-time work.", { group: "asker-1" });
  const questions = {
    official: question("q-official", "How many hours can I work on an Opportunity Card?", [{ artifact_id: id("route_claims", "work-limit"), relation: "answers" }]),
    officialDisputed: question("q-official-disputed", "Is part-time work allowed on the card at all?", [
      { artifact_id: id("route_claims", "work-limit"), relation: "answers" }, { artifact_id: id("signals", "no-work"), relation: "contradicts" }
    ]),
    community: question("q-community", "How quickly do card holders find part-time work?", [{ artifact_id: id("signals", "found-work"), relation: "answers" }]),
    contradictory: question("q-contradictory", "Do card holders find part-time jobs?", [
      { artifact_id: id("signals", "found-work"), relation: "answers" }, { artifact_id: id("signals", "no-work"), relation: "contradicts" }
    ]),
    outdated: question("q-outdated", "How much money do I need for the card?", [{ artifact_id: id("route_claims", "old-funds"), relation: "answers" }]),
    partial: question("q-partial", "What are all the work and funds rules for the card?", [{ artifact_id: id("route_claims", "work-limit"), relation: "partially_answers" }]),
    outOfScope: question("q-scope", "Does a Canadian rule answer this?", [{ artifact_id: id("route_claims", "canada-rule"), relation: "answers" }]),
    research: question("q-research", "Can I bring my family on the card?", []),
    mixed: question("q-mixed", "What funds amount applies to the card?", [{ artifact_id: id("route_claims", "mixed-funds"), relation: "answers" }]),
    pattern: question("q-pattern", "How long until card holders find part-time work?", [{ artifact_id: id("route_claims", "pattern"), relation: "answers" }])
  };
  const questionData = {
    ...structuredClone(V4), sources: [rules.sources[2]], evidence: [ask], signals: [], route_claims: [], questions: Object.values(questions)
  };
  const questionIds = publish(directory, storeRoot, questionData, "questions", "2026-09-21T00:00:00Z").ids.questions;
  return { storeRoot, ruleIds, questionIds: Object.fromEntries(Object.entries(questions).map(([name, item]) => [name, questionIds[item.id]])) };
}

const answer = (storeRoot, questionId) => executeTool("answerCommunityQuestion", { questionId, asOf: AS_OF }, globalThis.fetch,
  { signalStoreRoot: path.join(storeRoot, "datasets") });

test("answerCommunityQuestion is published as a read-only tool", () => {
  const tool = TOOLS.find((item) => item.name === "answerCommunityQuestion");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ["questionId"]);
});

test("a current, authoritative Route Claim yields an official answer with citations", async (t) => {
  const { storeRoot, questionIds, ruleIds } = buildStore(t);
  const result = await answer(storeRoot, questionIds.official);
  assert.equal(result.isError, false);
  const content = result.structuredContent;
  assert.equal(content.answerType, "official");
  assert.equal(content.confidence, "high");
  assert.equal(content.official.length, 1);
  assert.equal(content.official[0].claimId, ruleIds.route_claims["work-limit"]);
  assert.deepEqual(content.official[0].freshness, { status: "current", ageDays: 14, maxAgeDays: 730, factType: "statutory_condition" });
  assert.deepEqual(content.citations.map((item) => [item.authority, item.sourceUrl]), [["primary", LAW]]);
  assert.match(content.citations[0].contentHash, /^sha256:/);
  assert.equal(content.lastVerifiedAt, "2026-09-11");
  assert.deepEqual(content.contradictions, []);
  assert.ok(content.explanationFa.length > 0);
});

test("community contradiction lowers confidence but cannot overturn a current official rule", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.officialDisputed)).structuredContent;
  assert.equal(content.answerType, "official");
  assert.equal(content.confidence, "medium");
  assert.equal(content.contradictions.length, 1);
  assert.equal(content.contradictions[0].kind, "community");
});

test("community-only support is a community observation and copies count as one source", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.community)).structuredContent;
  assert.equal(content.answerType, "community_observation");
  assert.equal(content.confidence, "low");
  assert.deepEqual(content.official, []);
  assert.equal(content.communityObservations.length, 1);
  assert.equal(content.communityObservations[0].citations.length, 2);
  assert.equal(content.independentCommunitySources, 1, "a cross-posted report is one source");
});

test("conflicting community support is unresolved rather than a chosen side", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.contradictory)).structuredContent;
  assert.equal(content.answerType, "unresolved");
  assert.equal(content.confidence, "low");
  assert.equal(content.contradictions.length, 1);
  assert.match(content.reasons.join(" "), /conflicting community evidence/);
});

test("stale official support is outdated, partial links are partially answered, and out-of-scope links are excluded", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const outdated = (await answer(storeRoot, questionIds.outdated)).structuredContent;
  assert.equal(outdated.answerType, "outdated");
  assert.equal(outdated.excluded[0].reason, "stale");
  assert.equal(outdated.excluded[0].freshness.status, "stale");

  const partial = (await answer(storeRoot, questionIds.partial)).structuredContent;
  assert.equal(partial.answerType, "partially_answered");

  const scoped = (await answer(storeRoot, questionIds.outOfScope)).structuredContent;
  assert.equal(scoped.answerType, "research_required");
  assert.equal(scoped.excluded[0].reason, "out_of_scope");
});

test("a question without usable answer evidence requires research", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.research)).structuredContent;
  assert.equal(content.answerType, "research_required");
  assert.equal(content.confidence, "low");
  assert.deepEqual(content.citations, []);
  assert.equal(content.lastVerifiedAt, null);

  const unknown = await answer(storeRoot, "qst_00000000000000000000000000000000");
  assert.equal(unknown.isError, true);
  assert.equal(unknown.structuredContent.error, "community_question_not_found");
});

test("publication refuses answer links that resolve nowhere", (t) => {
  const directory = workspace(t);
  const data = {
    ...structuredClone(V4), sources: [rules.sources[2]], signals: [], route_claims: [],
    evidence: [evidence("ask", "community-a", "A member asked about family reunion on the card.", { group: "asker-1" })],
    questions: [question("q1", "Can I bring my family?", [{ artifact_id: "clm_ffffffffffffffffffffffffffffffff", relation: "answers" }])]
  };
  const file = path.join(directory, "candidate.json");
  writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", path.join(directory, "store"), "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[evidence\] .*answer_links.*clm_ffffffffffffffffffffffffffffffff.*not found/);
});

test("a stale authoritative source cannot make a claim official through fresher community evidence", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.mixed)).structuredContent;
  assert.notEqual(content.answerType, "official");
  assert.deepEqual(content.official, []);
  assert.equal(content.answerType, "community_observation");
  assert.equal(content.communityObservations[0].kind, "route_claim");
});

test("pattern claims are never official answers, even with an authoritative source", async (t) => {
  const { storeRoot, questionIds } = buildStore(t);
  const content = (await answer(storeRoot, questionIds.pattern)).structuredContent;
  assert.notEqual(content.answerType, "official");
  assert.deepEqual(content.official, []);
});
