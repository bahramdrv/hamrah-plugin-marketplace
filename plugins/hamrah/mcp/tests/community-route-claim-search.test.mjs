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
const LIFECYCLE = { status: "active", first_seen: "2026-08-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const LAW = "https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html";
const FORUM = "https://forum.example.org/threads/opportunity-card-appointments";
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };

function evidence(id, sourceId, text, { url = null, authority = "unknown", sourceType = "first_hand_applicant_experience", date = null, stance = "supports" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: "2026-09-11T00:00:00Z", published_at: date, event_date: null,
    content_hash: hash(text), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: stance, independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function claim(id, claimType, countryCode, routes, stage, statement, evidenceIds, extra = {}) {
  return {
    id, country_code: countryCode, routes, claim_type: claimType, process_stage: stage, statement_en: statement,
    opposing_evidence_ids: [], evidence_ids: evidenceIds, lifecycle: structuredClone(LIFECYCLE), ...extra
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "law", source_name: "Residence Act section 20a", source_family: "gesetze-im-internet.de", public: true, source_url: LAW },
    { id: "forum", source_name: "Public applicant forum", source_family: "forum.example.org", public: true, source_url: FORUM },
    { id: "private-group", source_name: "Private applicant group", source_family: "private-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("law-text", "law", "Section 20a sets eligibility by skilled-worker status or points.", { url: LAW, authority: "primary", sourceType: "official_government" }),
    evidence("forum-post", "forum", "A forum member reports getting an appointment within six weeks.", { url: FORUM, date: "2026-09-02", stance: "contradicts" }),
    evidence("private-post", "private-group", "Members living in Iran report no appointment slots for months.", { date: "2026-09-05" }),
    evidence("forum-tip", "forum", "Members suggest booking a certified translation before the appointment.", { url: FORUM, date: "2026-09-06" })
  ],
  signals: [],
  questions: [],
  route_claims: [
    claim("points", "official_rule", "DEU", ["opportunity_card"], "points_assessment",
      "An Opportunity Card can be issued to a skilled worker or an applicant with enough points.", ["law-text"]),
    claim("slots", "operational_pattern", "DEU", ["opportunity_card"], "visa_application",
      "Applicants living in Iran report long waits for Opportunity Card appointment slots.", ["private-post"],
      { opposing_evidence_ids: ["forum-post"], applicant_scope: { ...EMPTY_SCOPE, residence_countries: ["IRN"] } }),
    claim("translation", "workaround", "DEU", ["student_masters_taught"], "visa_application",
      "Booking a certified translation early avoids delays at the study visa appointment.", ["forum-tip"]),
    claim("canada", "risk", "CAN", ["student_masters_taught"], null,
      "A Canadian study permit risk unrelated to Germany.", ["forum-tip"])
  ]
};

function publishStore(t, candidate = CANDIDATE) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-claim-search-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "claims.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "claims", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  return { storeRoot, result, ids: result.status === 0 ? JSON.parse(result.stdout).ids.route_claims : null };
}

const search = (storeRoot, args) => executeTool("searchRouteClaims", args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });

test("searchRouteClaims is a read-only tool", () => {
  const tool = TOOLS.find((item) => item.name === "searchRouteClaims");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.ok(tool.inputSchema.properties.claimType.enum.includes("workaround"));
});

test("Route Claims published without Signals are found with evidence classes, verification status, and dates", async (t) => {
  const { storeRoot, result, ids } = publishStore(t);
  assert.equal(result.status, 0, result.stderr);
  const searched = await search(storeRoot, { countryCode: "DEU", route: "opportunity_card" });
  assert.equal(searched.isError, false);
  const { claims, coverage, claimNotice } = searched.structuredContent;
  assert.deepEqual(claims.map((item) => item.claimId).sort(), [ids.points, ids.slots].sort());
  assert.equal(coverage.status, "evidence_found");
  assert.match(claimNotice, /not a verified fact/);

  const points = claims.find((item) => item.claimId === ids.points);
  assert.match(points.claimId, /^clm_[0-9a-f]{32}$/);
  assert.equal(points.claimType, "official_rule");
  assert.equal(points.verification.status, "official_source");
  assert.equal(points.verification.lastVerified, "2026-09-11");
  assert.equal(points.applicantScope, null);
  assert.deepEqual(points.supporting.map((item) => [item.evidenceClass, item.authority, item.sourceUrl]), [["official", "primary", LAW]]);
  assert.match(points.supporting[0].contentHash, /^sha256:/);
  assert.equal(points.supporting[0].retrievedAt, "2026-09-11T00:00:00Z");

  const slots = claims.find((item) => item.claimId === ids.slots);
  assert.equal(slots.verification.status, "private_community_only");
  assert.deepEqual(slots.applicantScope.residence_countries, ["IRN"]);
  assert.deepEqual(slots.supporting.map((item) => [item.evidenceClass, item.sourceUrl, item.publishedAt]), [["private_community", null, "2026-09-05"]]);
  assert.deepEqual(slots.opposing.map((item) => [item.evidenceClass, item.sourceUrl]), [["public_community", FORUM]]);
  assert.deepEqual(slots.evidenceClasses, { official: 0, public_community: 1, private_community: 1 });
});

test("scope filters narrow claims by stage, type, applicant, and text", async (t) => {
  const { storeRoot, ids } = publishStore(t);
  const ids_ = async (args) => (await search(storeRoot, args)).structuredContent.claims.map((item) => item.claimId).sort();
  assert.deepEqual(await ids_({ countryCode: "DEU", processStage: "visa_application" }), [ids.slots, ids.translation].sort());
  assert.deepEqual(await ids_({ countryCode: "DEU", claimType: "official_rule" }), [ids.points]);
  assert.deepEqual(await ids_({ countryCode: "DEU", route: "opportunity_card", residenceCountry: "IRN" }), [ids.points, ids.slots].sort());
  assert.deepEqual(await ids_({ countryCode: "DEU", route: "opportunity_card", residenceCountry: "TUR" }), [ids.points], "a restricted claim is not shown outside its applicant scope");
  assert.deepEqual(await ids_({ query: "certified translation" }), [ids.translation]);
});

test("scopes without claims report missing coverage and never fabricate claims", async (t) => {
  const { storeRoot } = publishStore(t);
  for (const args of [{ countryCode: "JPN" }, { countryCode: "DEU", route: "healthcare_worker" }]) {
    const searched = await search(storeRoot, args);
    assert.deepEqual(searched.structuredContent.claims, []);
    assert.equal(searched.structuredContent.coverage.status, "no_coverage");
    assert.match(searched.structuredContent.coverage.note, /missing coverage, not evidence that the route is closed/);
  }
});

test("claim types outside the vocabulary are refused at publication", (t) => {
  const candidate = structuredClone(CANDIDATE);
  candidate.route_claims[0].claim_type = "guaranteed_outcome";
  const { result } = publishStore(t, candidate);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[schema\] .*claim_type/);
});

test("the deployed German seed is searchable as Route Claims without network access", async () => {
  const offline = async () => { throw new Error("network access is not allowed"); };
  const searched = await executeTool("searchRouteClaims", { countryCode: "DEU", route: "opportunity_card" }, offline);
  const { claims } = searched.structuredContent;
  assert.ok(claims.length >= 6);
  assert.ok(claims.every((item) => item.verification.status === "official_source"));
  assert.ok(claims.every((item) => item.supporting.every((evidence) => evidence.evidenceClass === "official")));
});
