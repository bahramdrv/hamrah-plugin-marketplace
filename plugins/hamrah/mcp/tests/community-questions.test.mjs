import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool, TOOLS } from "../server.mjs";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const NOW = "2026-09-25T00:00:00Z";
const LIFECYCLE = { status: "active", first_seen: "2026-08-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };

const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const source = (id, family) => ({ id, source_name: `${family} group`, source_family: family, public: false, source_url: null });
function post(id, sourceId, text, asker, date) {
  return {
    id, source_id: sourceId, source_url: null, retrieved_at: "2026-09-11T00:00:00Z", published_at: null, event_date: date,
    content_hash: hash(text), source_type: "first_hand_applicant_experience", authority: "unknown", direct_or_second_hand: "direct",
    supports_or_contradicts: "supports", independence_group: asker, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function question(id, canonicalEn, evidenceIds, count, overrides = {}) {
  return {
    id, canonical_en: canonicalEn, canonical_fa: "آیا با کارت فرصت می‌توانم کار کنم؟", variants: [],
    country_codes: ["DEU"], routes: ["opportunity_card"], topics: ["work_rights"], process_stages: [],
    independent_asker_count: count, trend: "rising", answer_status: "unresolved", evidence_ids: evidenceIds,
    lifecycle: structuredClone(LIFECYCLE), ...overrides
  };
}

// Asker A posts twice, asker B once, and asker C's post is cross-posted to a second community.
const POSTS = [
  post("post-a1", "src-a", "Asked whether the Opportunity Card allows any paid work.", "asker-a", "2026-08-01"),
  post("post-a2", "src-a", "Repeated the same work question a week later.", "asker-a", "2026-08-08"),
  post("post-b1", "src-a", "Asked how many hours a week one may work on the card.", "asker-b", "2026-08-20"),
  post("post-c1", "src-a", "Asked if part-time work is allowed while job hunting.", "asker-c", "2026-09-10"),
  post("post-c2", "src-b", "Asked if part-time work is allowed while job hunting.", "asker-c-copy", "2026-09-10")
];

function candidate(questions, posts = POSTS) {
  return {
    ...structuredClone(V4),
    sources: [source("src-a", "community-a"), source("src-b", "community-b")],
    evidence: structuredClone(posts), signals: [], route_claims: [], questions
  };
}

const MERGED = [
  question("q1", "Can I work with an Opportunity Card?", ["post-a1", "post-a2"], 1, { variants: ["Is paid work allowed on the card?"] }),
  question("q2", "  can i work with an opportunity card  ", ["post-b1", "post-c1", "post-c2"], 2, {
    variants: ["How many hours can I work on the Chancenkarte?"], lifecycle: { ...LIFECYCLE, first_seen: "2026-08-20" }
  })
];

function workspace(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-questions-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function publish(directory, storeRoot, data) {
  const file = path.join(directory, `candidate-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(data));
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "questions", "--now", NOW], { encoding: "utf8" });
  return { ...result, report: result.status === 0 ? JSON.parse(result.stdout) : null };
}

const call = (storeRoot, name, args) =>
  executeTool(name, args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });

test("the question tools are published as read-only", () => {
  for (const name of ["searchCommunityQuestions", "getCommunityQuestion"]) {
    const tool = TOOLS.find((item) => item.name === name);
    assert.ok(tool, name);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  }
});

test("wording variants merge into one Question while repeated posts from one asker count once", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const published = publish(directory, storeRoot, candidate(MERGED));
  assert.equal(published.status, 0, published.stderr);
  assert.equal(published.report.merged.questions, 1);
  const questionId = published.report.ids.questions.q1;
  assert.match(questionId, /^qst_[0-9a-f]{32}$/);
  assert.equal(published.report.ids.questions.q2, questionId);

  const searched = await call(storeRoot, "searchCommunityQuestions", { query: "opportunity card work", countryCode: "DEU" });
  assert.equal(searched.isError, false);
  assert.equal(searched.structuredContent.resultCount, 1);
  const found = searched.structuredContent.questions[0];
  assert.equal(found.questionId, questionId);
  assert.equal(found.independentAskerCount, 3);
  assert.equal(found.evidenceCount, 5);
  assert.equal(found.firstSeen, "2026-08-01");
  assert.equal(found.lastSeen, "2026-09-10");
  assert.equal(found.answerStatus, "unresolved");
  assert.deepEqual(found.variants.sort(), [
    "How many hours can I work on the Chancenkarte?", "Is paid work allowed on the card?", "can i work with an opportunity card"
  ].sort());
  assert.equal(searched.structuredContent.coverage.status, "evidence_found");

  const fetched = await call(storeRoot, "getCommunityQuestion", { questionId });
  assert.equal(fetched.isError, false);
  const { question: detail, evidence, evidenceCoverage } = fetched.structuredContent;
  assert.equal(detail.id, questionId);
  assert.equal(evidence.length, 5);
  assert.deepEqual(evidenceCoverage, {
    evidenceRecords: 5,
    independentAskers: 3,
    sourceFamilies: ["community-a", "community-b"],
    privateRecords: 5,
    timeWindow: { earliest: "2026-08-01", latest: "2026-09-10" }
  });
  assert.equal(fetched.structuredContent.datasetId, searched.structuredContent.questions[0].datasetId);
});

test("Persian searches normalize letter variants and find the same Question", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  assert.equal(publish(directory, storeRoot, candidate(MERGED)).status, 0);
  for (const query of ["کارت فرصت", "كارت فرصت", "کار کنم"]) {
    const searched = await call(storeRoot, "searchCommunityQuestions", { query });
    assert.equal(searched.structuredContent.resultCount, 1, query);
  }
  const miss = await call(storeRoot, "searchCommunityQuestions", { query: "blocked account amount" });
  assert.equal(miss.structuredContent.resultCount, 0);
});

test("inflated counts and ambiguous merges stay unpublished", (t) => {
  const directory = workspace(t);
  const cases = [
    ["inflated", candidate([question("q1", "Can I work with an Opportunity Card?", ["post-a1", "post-a2"], 2)]),
      /\[evidence\] .*declares 2 independent askers but its evidence shows 1/],
    ["shared-variant", candidate([
      question("q1", "Can I work with an Opportunity Card?", ["post-a1"], 1, { variants: ["Can I work part-time?"] }),
      question("q2", "How many hours may I work on the card?", ["post-b1"], 1, { variants: ["can i work part time"] })
    ]), /\[deduplication\] .*ambiguous merge.*needs_review/],
    ["declared-review", candidate([question("q1", "Can I work with an Opportunity Card?", ["post-a1"], 1, {
      validation: { status: "needs_review", privacy_status: "pass", validated_at: NOW }
    })]), /\[privacy\] .*declares validation needs_review/],
    ["conflicting-status", candidate([
      question("q1", "Can I work with an Opportunity Card?", ["post-a1"], 1),
      question("q2", "can I work with an Opportunity Card", ["post-b1"], 1, { answer_status: "official" })
    ]), /\[deduplication\] .*answer_status/]
  ];
  for (const [name, data, reason] of cases) {
    const storeRoot = path.join(directory, name);
    const result = publish(directory, storeRoot, data);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, reason, name);
    assert.equal(existsSync(path.join(storeRoot, "datasets")), false, name);
  }
});

test("the same wording in different scopes is two Questions, not an ambiguous merge", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const data = candidate([
    question("q-de", "Can I work while studying?", ["post-a1"], 1, { routes: ["student_masters_taught"] }),
    question("q-ca", "Can I work while studying?", ["post-b1"], 1, { country_codes: ["CAN"], routes: ["student_masters_taught"] })
  ]);
  const published = publish(directory, storeRoot, data);
  assert.equal(published.status, 0, published.stderr);
  assert.notEqual(published.report.ids.questions["q-de"], published.report.ids.questions["q-ca"]);
  const german = await call(storeRoot, "searchCommunityQuestions", { query: "work while studying", countryCode: "DEU" });
  assert.equal(german.structuredContent.resultCount, 1);
});

test("missing questions report coverage honestly and unknown IDs fail explicitly", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  assert.equal(publish(directory, storeRoot, candidate(MERGED)).status, 0);
  const none = await call(storeRoot, "searchCommunityQuestions", { countryCode: "CAN" });
  assert.equal(none.structuredContent.resultCount, 0);
  assert.equal(none.structuredContent.coverage.status, "no_coverage");
  assert.match(none.structuredContent.coverage.note, /missing coverage/);
  const unknown = await call(storeRoot, "getCommunityQuestion", { questionId: "qst_00000000000000000000000000000000" });
  assert.equal(unknown.isError, true);
  assert.equal(unknown.structuredContent.error, "community_question_not_found");
});

test("the reader rejects a hand-edited dataset that inflates asker counts", async (t) => {
  const directory = workspace(t);
  const storeRoot = path.join(directory, "store");
  const { report } = publish(directory, storeRoot, candidate(MERGED));
  const file = path.join(storeRoot, "datasets", `${report.datasetId}.json`);
  const dataset = JSON.parse(readFileSync(file, "utf8"));
  dataset.questions[0].independent_asker_count = 9;
  const edited = path.join(storeRoot, "datasets", "edited.json");
  mkdirSync(path.dirname(edited), { recursive: true });
  writeFileSync(edited, JSON.stringify(dataset));
  const searched = await call(storeRoot, "searchCommunityQuestions", {});
  const invalid = searched.structuredContent.coverage.invalidDatasets.find((item) => item.datasetId === "edited");
  assert.match(invalid.error, /declares 9 independent askers but its evidence shows 3/);
});
