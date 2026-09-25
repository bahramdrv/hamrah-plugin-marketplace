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
const PHD_PAGE = "https://www.example-tech.edu/phd/computer-science";
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, authority = "unknown", sourceType = "official_university" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: "2026-09-11T00:00:00Z", published_at: null, event_date: null,
    content_hash: hash(text), source_type: sourceType, authority, direct_or_second_hand: "direct",
    supports_or_contradicts: "supports", independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function opportunity(id, fields) {
  return {
    id, country_code: "DEU", routes: ["student_phd"], institution: "Example Technical University", department: null,
    program: "Doctoral programme", degree_level: "phd", field: "Computer Science", research_area: null, supervisor: null,
    deadline: null, deadline_evidence_ids: [], intake: null,
    funding: { status: "unknown", components: [] },
    admission_conditions: null,
    nationality_restrictions: { status: "unknown", details: null, evidence_ids: [] },
    iranian_evidence: { status: "not_checked", evidence_ids: [] },
    evidence_ids: ["phd-page"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "uni", source_name: "Doctoral programme page of example-tech.edu", source_family: "example-tech.edu", public: true, source_url: PHD_PAGE },
    { id: "group", source_name: "Applicant chat group", source_family: "chat-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("phd-page", "uni", "The doctoral page lists a funded position in machine learning with a stipend, an application deadline, and a master's degree requirement.", { url: PHD_PAGE, authority: "primary" }),
    evidence("chat", "group", "Members say the master's programme might waive tuition.", { sourceType: "community_opinion" })
  ],
  signals: [],
  route_claims: [],
  questions: [],
  academic_opportunities: [
    opportunity("phd-ml", {
      department: "Department of Informatics", research_area: "Machine learning", supervisor: "Chair of Machine Learning",
      deadline: "2026-12-15", intake: "2027 summer semester",
      funding: { status: "verified", components: [{ type: "stipend", status: "verified", amount: "Full-time position at salary grade E13", evidence_ids: ["phd-page"], opposing_evidence_ids: [] }] },
      admission_conditions: [{ condition: "A master's degree in computer science or a related field", status: "verified", evidence_ids: ["phd-page"] }]
    }),
    opportunity("msc-ds", {
      routes: ["student_masters_taught"], program: "Master of Data Science", degree_level: "master", field: "Data Science",
      funding: { status: "unverified", components: [{ type: "tuition_waiver", status: "unverified", amount: null, evidence_ids: ["chat"], opposing_evidence_ids: [] }] },
      evidence_ids: ["phd-page", "chat"]
    }),
    opportunity("ca-phd", { country_code: "CAN", institution: "Example Canadian University", program: "PhD in Physics", field: "Physics", deadline: "2027-01-10" })
  ]
};

let cached;
function publishStore(candidate = CANDIDATE) {
  if (candidate === CANDIDATE && cached) return cached;
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-opportunities-"));
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "opportunities.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "opportunities", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  const published = { storeRoot, result, ids: result.status === 0 ? JSON.parse(result.stdout).ids.academic_opportunities : null };
  if (candidate === CANDIDATE) cached = published;
  return published;
}

const AS_OF = "2026-09-25";
const call = (name, args) => executeTool(name, { asOf: AS_OF, ...args }, globalThis.fetch, { signalStoreRoot: path.join(publishStore().storeRoot, "datasets") });
const idsOf = async (args) => (await call("searchAcademicOpportunities", args)).structuredContent.opportunities.map((item) => item.opportunityId).sort();

test("the opportunity tools are read-only", () => {
  for (const name of ["searchAcademicOpportunities", "getAcademicOpportunity"]) {
    assert.equal(TOOLS.find((item) => item.name === name).annotations.readOnlyHint, true, name);
  }
});

test("search filters by country, route, degree, field, institution, funding, and deadline", async () => {
  const { result, ids } = publishStore();
  assert.equal(result.status, 0, result.stderr);
  assert.match(ids["phd-ml"], /^opp_[0-9a-f]{32}$/);
  assert.deepEqual(await idsOf({ countryCode: "DEU" }), [ids["phd-ml"], ids["msc-ds"]].sort());
  assert.deepEqual(await idsOf({ countryCode: "DEU", route: "student_phd" }), [ids["phd-ml"]]);
  assert.deepEqual(await idsOf({ degreeLevel: "master" }), [ids["msc-ds"]]);
  assert.deepEqual(await idsOf({ field: "computer" }), [ids["phd-ml"]]);
  assert.deepEqual(await idsOf({ institution: "canadian" }), [ids["ca-phd"]]);
  assert.deepEqual(await idsOf({ fundingStatus: "verified" }), [ids["phd-ml"]]);
  assert.deepEqual(await idsOf({ fundingComponent: "tuition_waiver" }), [ids["msc-ds"]]);
  assert.deepEqual(await idsOf({ query: "machine learning" }), [ids["phd-ml"]]);

  const deadline = await call("searchAcademicOpportunities", { countryCode: "DEU", deadlineAfter: "2026-11-01" });
  assert.deepEqual(deadline.structuredContent.opportunities.map((item) => item.opportunityId), [ids["phd-ml"]]);
  assert.equal(deadline.structuredContent.unknownDeadlineExcluded, 1, "an unknown deadline is reported, not assumed");
  assert.equal(deadline.structuredContent.coverage.status, "evidence_found");
});

test("detail retrieval exposes structured facts, provenance, and freshness without inventing unknowns", async () => {
  const { ids } = publishStore();
  const detail = (await call("getAcademicOpportunity", { opportunityId: ids["phd-ml"] })).structuredContent;
  const record = detail.opportunity;
  assert.equal(record.department, "Department of Informatics");
  assert.equal(record.research_area, "Machine learning");
  assert.equal(record.supervisor, "Chair of Machine Learning");
  assert.equal(record.funding.components[0].type, "stipend");
  assert.equal(record.admission_conditions[0].status, "verified");
  assert.equal(record.nationality_restrictions.status, "unknown");
  assert.equal(record.iranian_evidence.status, "not_checked");
  assert.deepEqual(detail.evidence.map((item) => [item.evidenceClass, item.sourceUrl]), [["official", PHD_PAGE]]);
  assert.deepEqual(detail.freshness, { lastVerified: "2026-09-11", latestRetrieval: "2026-09-11T00:00:00Z", deadline: "2026-12-15" });

  const unknown = (await call("getAcademicOpportunity", { opportunityId: ids["msc-ds"] })).structuredContent.opportunity;
  assert.equal(unknown.deadline, null);
  assert.equal(unknown.admission_conditions, null, "missing admission conditions stay unknown");
  assert.equal(unknown.funding.status, "unverified");
  assert.equal(unknown.funding.components[0].status, "unverified", "a community hint does not verify funding");
});

test("absent coverage and unknown IDs are explicit", async () => {
  const none = await call("searchAcademicOpportunities", { countryCode: "JPN" });
  assert.deepEqual(none.structuredContent.opportunities, []);
  assert.equal(none.structuredContent.coverage.status, "no_coverage");
  assert.match(none.structuredContent.coverage.note, /missing coverage/);
  const missing = await call("getAcademicOpportunity", { opportunityId: "opp_00000000000000000000000000000000" });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent.error, "academic_opportunity_not_found");
});

test("inconsistent funding and Iranian evidence states are refused at publication", () => {
  const cases = [
    [(d) => { d.academic_opportunities[0].funding.components[0].status = "unverified"; }, /funding.status verified needs a verified component/],
    [(d) => { d.academic_opportunities[0].funding.components[0].evidence_ids = []; }, /verified funding component 0 needs evidence/],
    [(d) => { d.academic_opportunities[0].iranian_evidence = { status: "explicit_public_evidence", evidence_ids: [] }; }, /explicit_public_evidence needs evidence/],
    [(d) => { d.academic_opportunities[0].iranian_evidence = { status: "explicit_public_evidence", evidence_ids: ["chat"] }; }, /explicit_public_evidence needs public evidence/],
    [(d) => { d.academic_opportunities[0].funding.components[0].evidence_ids = ["missing"]; }, /references unknown evidence missing/]
  ];
  for (const [mutate, reason] of cases) {
    const candidate = structuredClone(CANDIDATE);
    mutate(candidate);
    const { result } = publishStore(candidate);
    assert.notEqual(result.status, 0, String(reason));
    assert.match(result.stderr, reason);
  }
});

test("nested evidence is inspectable and withdrawn support downgrades verified facts", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.evidence.push(evidence("letter", "uni", "The stipend letter confirms a monthly doctoral stipend.", { url: `${PHD_PAGE}/stipend`, authority: "primary" }));
  candidate.academic_opportunities = [opportunity("funded", {
    funding: { status: "verified", components: [{ type: "stipend", status: "verified", amount: null, evidence_ids: ["letter"], opposing_evidence_ids: [] }] }
  })];
  const { storeRoot, result, ids } = publishStore(candidate);
  assert.equal(result.status, 0, result.stderr);
  const signalStoreRoot = path.join(storeRoot, "datasets");
  const get = async () => (await executeTool("getAcademicOpportunity", { opportunityId: ids.funded, asOf: AS_OF }, globalThis.fetch, { signalStoreRoot })).structuredContent;

  const before = await get();
  assert.ok(before.evidence.some((item) => item.sourceUrl === `${PHD_PAGE}/stipend`), "evidence cited only by a funding component is shown");

  const letterId = before.opportunity.funding.components[0].evidence_ids[0];
  const withdrawn = spawnSync(process.execPath, [PUBLISHER, "withdraw", "--store-root", storeRoot, "--artifact", letterId, "--reason", "incorrect", "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  const after = await get();
  assert.equal(after.opportunity.funding.components[0].status, "unverified");
  assert.equal(after.opportunity.funding.status, "unverified");
  assert.deepEqual(after.opportunity.funding.components[0].evidence_ids, []);
});
