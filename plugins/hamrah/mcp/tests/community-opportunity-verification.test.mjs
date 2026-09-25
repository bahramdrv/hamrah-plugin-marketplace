import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeTool } from "../server.mjs";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const AS_OF = "2026-09-25";
const LIFECYCLE = { status: "active", first_seen: "2026-01-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const PAGE = "https://www.example-tech.edu/phd";
const OTHER = "https://www.example-tech.edu/funding-2026";
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, authority = "unknown", sourceType = "official_university", retrievedAt = "2026-09-11T00:00:00Z", stance = "supports" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: retrievedAt, published_at: null, event_date: null,
    content_hash: hash(text), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: stance, independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
const stipend = (evidenceIds, opposing = [], status = "verified") => ({ type: "stipend", status, amount: null, evidence_ids: evidenceIds, opposing_evidence_ids: opposing });
function opportunity(id, fields) {
  return {
    id, country_code: "DEU", routes: ["student_phd"], institution: "Example Technical University", department: null,
    program: `Doctoral position ${id}`, degree_level: "phd", field: "Computer Science", research_area: null, supervisor: null,
    deadline: "2026-12-15", deadline_evidence_ids: ["page"], intake: null,
    funding: { status: "verified", components: [stipend(["page"])] },
    admission_conditions: null,
    nationality_restrictions: { status: "unknown", details: null, evidence_ids: [] },
    iranian_evidence: { status: "not_checked", evidence_ids: [] },
    evidence_ids: ["page"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "uni", source_name: "Doctoral page of example-tech.edu", source_family: "example-tech.edu", public: true, source_url: PAGE },
    { id: "uni-funding", source_name: "Funding page of example-tech.edu", source_family: "example-tech.edu", public: true, source_url: OTHER },
    { id: "chat", source_name: "Applicant chat group", source_family: "chat-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("page", "uni", "The doctoral page lists open positions with a stipend and a December deadline.", { url: PAGE, authority: "primary" }),
    evidence("old-page", "uni", "An archived version of the doctoral page listed a stipend.", { url: `${PAGE}/archive-2025`, authority: "primary", retrievedAt: "2025-01-10T00:00:00Z" }),
    evidence("no-stipend", "uni-funding", "The funding page states that this position carries no stipend.", { url: OTHER, authority: "primary", stance: "contradicts" }),
    evidence("rumor", "chat", "Members say the position might come with a tuition waiver.", { sourceType: "community_opinion" }),
    evidence("doubt", "chat", "A member heard the stipend was cancelled this year.", { sourceType: "community_opinion", stance: "contradicts" })
  ],
  signals: [], route_claims: [], questions: [],
  academic_opportunities: [
    opportunity("current", {}),
    opportunity("expired", { deadline: "2026-06-30" }),
    opportunity("unverified", {
      deadline_evidence_ids: ["rumor"],
      funding: { status: "unverified", components: [{ type: "tuition_waiver", status: "unverified", amount: null, evidence_ids: ["rumor"], opposing_evidence_ids: [] }] },
      nationality_restrictions: { status: "restricted", details: "Members think only EU citizens are eligible.", evidence_ids: ["rumor"] },
      evidence_ids: ["page", "rumor"]
    }),
    opportunity("community-doubt", { funding: { status: "verified", components: [stipend(["page"], ["doubt"])] }, evidence_ids: ["page", "doubt"] }),
    opportunity("official-conflict", { funding: { status: "verified", components: [stipend(["page"], ["no-stipend"])] }, evidence_ids: ["page", "no-stipend"] }),
    opportunity("stale-source", {
      deadline_evidence_ids: ["old-page"], funding: { status: "verified", components: [stipend(["old-page"])] }, evidence_ids: ["old-page"]
    })
  ]
};

let cached;
function publish(candidate = CANDIDATE) {
  if (candidate === CANDIDATE && cached) return cached;
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-verify-"));
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "candidate.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "verify", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  const value = { storeRoot, result, ids: result.status === 0 ? JSON.parse(result.stdout).ids.academic_opportunities : null };
  if (candidate === CANDIDATE) cached = value;
  return value;
}

async function detail(key) {
  const { storeRoot, result, ids } = publish();
  assert.equal(result.status, 0, result.stderr);
  const response = await executeTool("getAcademicOpportunity", { opportunityId: ids[key], asOf: AS_OF }, globalThis.fetch,
    { signalStoreRoot: path.join(storeRoot, "datasets") });
  assert.equal(response.isError, false, JSON.stringify(response.structuredContent));
  return response.structuredContent.verification;
}

const search = (args) => executeTool("searchAcademicOpportunities", { asOf: AS_OF, ...args }, globalThis.fetch,
  { signalStoreRoot: path.join(publish().storeRoot, "datasets") });

test("a current, officially sourced opening is open and its funding verified", async () => {
  const verification = await detail("current");
  assert.equal(verification.asOf, AS_OF);
  assert.equal(verification.lifecycleStatus, "active");
  assert.deepEqual(verification.deadline, {
    date: "2026-12-15", status: "open", officialSource: true,
    freshness: { status: "current", ageDays: 14, maxAgeDays: 120, factType: "deadline" }
  });
  assert.equal(verification.funding.effectiveStatus, "verified");
  assert.equal(verification.funding.components[0].effectiveStatus, "verified");
  assert.equal(verification.funding.components[0].confidence, "high");
  assert.equal(verification.funding.components[0].freshness.factType, "financial_requirement");
});

test("an expired deadline makes the opening historical and hidden from default search", async () => {
  const verification = await detail("expired");
  assert.equal(verification.deadline.status, "expired");
  assert.equal(verification.lifecycleStatus, "historical");
  assert.match(verification.reasons.join(" "), /deadline passed on 2026-06-30/);
  const { ids } = publish();
  const current = (await search({ countryCode: "DEU" })).structuredContent.opportunities.map((item) => item.opportunityId);
  assert.equal(current.includes(ids.expired), false);
  const history = (await search({ countryCode: "DEU", statuses: ["historical"] })).structuredContent.opportunities;
  assert.deepEqual(history.map((item) => item.opportunityId), [ids.expired]);
  assert.equal(history[0].verification.deadline, "expired");
});

test("community-only deadlines, funding, and nationality restrictions remain unknown", async () => {
  const verification = await detail("unverified");
  assert.equal(verification.deadline.status, "unverified");
  assert.equal(verification.funding.effectiveStatus, "unknown");
  assert.deepEqual(verification.funding.components.map((item) => [item.type, item.declaredStatus, item.effectiveStatus, item.reason]),
    [["tuition_waiver", "unverified", "unknown", "no_official_source"]]);
  assert.equal(verification.nationalityRestrictions.effectiveStatus, "unknown");
  assert.equal(verification.nationalityRestrictions.declaredStatus, "restricted");
});

test("community doubt is preserved but cannot overturn a current official stipend", async () => {
  const verification = await detail("community-doubt");
  const component = verification.funding.components[0];
  assert.equal(component.effectiveStatus, "verified");
  assert.equal(component.confidence, "medium");
  assert.deepEqual(component.opposing.map((item) => item.evidenceClass), ["private_community"]);
});

test("conflicting official sources leave funding unknown instead of definite", async () => {
  const verification = await detail("official-conflict");
  const component = verification.funding.components[0];
  assert.equal(component.effectiveStatus, "unknown");
  assert.equal(component.reason, "conflicting_official_sources");
  assert.equal(component.confidence, "low");
  assert.equal(verification.funding.effectiveStatus, "unknown");
  assert.deepEqual(component.opposing.map((item) => item.evidenceClass), ["official"]);
});

test("stale official sources need re-verification before a deadline or stipend counts", async () => {
  const verification = await detail("stale-source");
  assert.equal(verification.deadline.status, "needs_reverification");
  assert.equal(verification.funding.components[0].effectiveStatus, "unknown");
  assert.equal(verification.funding.components[0].reason, "stale_official_source");
});

test("search funding filters use verified status rather than declared status", async () => {
  const { ids } = publish();
  const verified = (await search({ countryCode: "DEU", fundingStatus: "verified" })).structuredContent.opportunities.map((item) => item.opportunityId).sort();
  assert.deepEqual(verified, [ids.current, ids["community-doubt"]].sort());
  const unverified = (await search({ countryCode: "DEU", fundingStatus: "unverified" })).structuredContent.opportunities.map((item) => item.opportunityId).sort();
  assert.deepEqual(unverified, [ids.unverified, ids["official-conflict"], ids["stale-source"]].sort(), "reported but unverified funding");
});

test("publication refuses a verified funding component without an official institution source", () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.academic_opportunities = [opportunity("community-verified", {
    funding: { status: "verified", components: [stipend(["rumor"])] }, evidence_ids: ["page", "rumor"]
  })];
  const { result } = publish(candidate);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[evidence\] .*verified funding component 0 needs an official institution source/);
});
