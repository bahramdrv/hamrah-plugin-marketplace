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
const LIFECYCLE = { status: "active", first_seen: "2026-05-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const LAW = "https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html";
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

const forum = (name) => ({ id: name, source_name: `${name} forum`, source_family: name, public: true, source_url: `https://${name}.example.org/` });
function post(id, sourceId, text, date, { stance = "supports", url = `https://${sourceId}.example.org/t/${id}` } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: "2026-09-11T00:00:00Z", published_at: date, event_date: null,
    content_hash: hash(text), source_type: "first_hand_applicant_experience", authority: "unknown", direct_or_second_hand: "direct",
    supports_or_contradicts: stance, independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null
  };
}
function claim(id, evidenceIds, { opposing = [], claimType = "operational_pattern", scope } = {}) {
  return {
    id, country_code: "DEU", routes: ["opportunity_card"], claim_type: claimType, process_stage: "visa_application",
    statement_en: `Claim ${id.replace(/^c-/, "")} about Opportunity Card appointments.`, opposing_evidence_ids: opposing, evidence_ids: evidenceIds,
    lifecycle: structuredClone(LIFECYCLE), ...(scope ? { applicant_scope: scope } : {})
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    forum("alpha"), forum("beta"), forum("gamma"), forum("delta"),
    { id: "private-group", source_name: "Private chat group", source_family: "private-chat", public: false, source_url: null },
    { id: "law", source_name: "Residence Act section 20a", source_family: "gesetze-im-internet.de", public: true, source_url: LAW }
  ],
  evidence: [
    post("single", "alpha", "One applicant waited five months for an Opportunity Card appointment.", "2026-09-01"),
    post("copy-a", "alpha", "Appointments for the Opportunity Card took about five months here.", "2026-09-02"),
    post("copy-b", "beta", "Appointments for the Opportunity Card took about five months here.", "2026-09-02"),
    post("corr-1", "alpha", "My Opportunity Card appointment took four months.", "2026-05-10"),
    post("corr-2", "beta", "We waited almost five months for the appointment.", "2026-05-20"),
    post("corr-3", "gamma", "Four and a half months until the embassy appointment.", "2026-06-01"),
    post("old", "alpha", "Appointments took five months in early 2025.", "2025-01-15"),
    post("against", "delta", "I received an Opportunity Card appointment within three weeks.", "2026-09-20", { stance: "contradicts" }),
    { ...post("private", "private-group", "Chat members report five-month waits.", "2026-09-05"), source_url: null },
    { ...post("law-text", "law", "Section 20a sets eligibility by skilled-worker status or points.", null, { url: LAW }), authority: "primary", source_type: "official_government" },
    { ...post("old-law", "law", "Section 20a text as first published in 2020.", "2020-01-01", { url: `${LAW}#archive` }), authority: "primary", source_type: "official_government" },
    post("alpha-2", "alpha", "Another alpha member waited five months.", "2026-08-15"),
    post("alpha-3", "alpha", "A third alpha member reports a similar wait.", "2026-08-20"),
    post("alpha-3-copy", "beta", "A third alpha member reports a similar wait.", "2026-08-21")
  ],
  signals: [],
  questions: [],
  route_claims: [
    claim("c-single", ["single"]),
    claim("c-copied", ["copy-a", "copy-b"]),
    claim("c-corroborated", ["corr-1", "corr-2", "corr-3"]),
    claim("c-stale", ["old"]),
    claim("c-contradicted", ["corr-1", "corr-2", "corr-3"], { opposing: ["against"] }),
    claim("c-private-only", ["private"]),
    claim("c-corroborated-plus-private", ["corr-1", "corr-2", "corr-3", "private"]),
    claim("c-official", ["law-text"], { claimType: "official_rule" }),
    claim("c-iran-only", ["single"], { scope: { ...EMPTY_SCOPE, residence_countries: ["IRN"] } }),
    claim("c-old-publication", ["old-law"], { claimType: "official_rule" }),
    claim("c-one-family", ["single", "alpha-2", "alpha-3", "alpha-3-copy"])
  ]
};

let published;
function store(t) {
  if (published) return published;
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-confidence-"));
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "claims.json");
  writeFileSync(file, JSON.stringify(CANDIDATE));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "confidence", "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  published = { storeRoot, ids: JSON.parse(result.stdout).ids.route_claims };
  return published;
}

async function validate(t, key, extra = {}) {
  const { storeRoot, ids } = store(t);
  const result = await executeTool("validateRouteClaim", { claimId: ids[key], asOf: AS_OF, ...extra }, globalThis.fetch,
    { signalStoreRoot: path.join(storeRoot, "datasets") });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  return result.structuredContent;
}

const points = (content) => Object.fromEntries(Object.entries(content.evidenceConfidence.components).map(([name, item]) => [name, item.points]));

test("validateRouteClaim is a read-only tool", () => {
  const tool = TOOLS.find((item) => item.name === "validateRouteClaim");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.deepEqual(tool.inputSchema.required, ["claimId"]);
});

test("one anecdote stays weak and every component is explained", async (t) => {
  const content = await validate(t, "c-single");
  assert.equal(content.policyVersion, "1.0.0");
  assert.deepEqual(points(content), { diversity: 5, independentReports: 5, primarySupport: 0, recency: 15, scope: 10, dataQuality: 10 });
  assert.equal(content.evidenceConfidence.contradictionPenalty.points, 0);
  assert.equal(content.evidenceConfidence.score, 45);
  assert.equal(content.evidenceConfidence.label, "low");
  for (const component of Object.values(content.evidenceConfidence.components)) {
    assert.ok(component.max > 0 && component.detail.length > 0);
  }
  assert.match(content.explanation, /only for DEU opportunity_card at visa_application/);
  assert.match(content.note, /not the probability/);
});

test("copied reports count once", async (t) => {
  const single = await validate(t, "c-single");
  const copied = await validate(t, "c-copied");
  assert.equal(copied.independence.supportingPublicReports, 1);
  assert.equal(copied.independence.supportingRecords, 2);
  assert.equal(copied.evidenceConfidence.score, single.evidenceConfidence.score);
  assert.equal(points(copied).diversity, 5, "copies from two forums are not two source families");
});

test("independent corroboration raises confidence and stale evidence lowers it", async (t) => {
  const corroborated = await validate(t, "c-corroborated");
  assert.deepEqual(points(corroborated), { diversity: 15, independentReports: 18, primarySupport: 0, recency: 15, scope: 10, dataQuality: 10 });
  assert.equal(corroborated.evidenceConfidence.score, 68);
  assert.equal(corroborated.evidenceConfidence.label, "moderate");

  const stale = await validate(t, "c-stale");
  assert.equal(points(stale).recency, 0);
  assert.equal(stale.evidenceConfidence.score, 30);
  assert.match(stale.evidenceConfidence.components.recency.detail, /stale/);
});

test("opposing evidence lowers confidence, stays visible, and gets hypotheses rather than conclusions", async (t) => {
  const content = await validate(t, "c-contradicted");
  assert.equal(content.evidenceConfidence.contradictionPenalty.points, -10);
  assert.equal(content.evidenceConfidence.score, 58);
  assert.equal(content.independence.opposingPublicReports, 1);
  assert.deepEqual(content.contradictions.opposing.map((item) => item.evidenceId).length, 1);
  assert.ok(content.contradictions.hypotheses.length >= 1);
  for (const hypothesis of content.contradictions.hypotheses) assert.equal(hypothesis.status, "hypothesis");
  assert.ok(content.contradictions.hypotheses.some((item) => item.kind === "timing"));
});

test("private evidence adds context but no score", async (t) => {
  const privateOnly = await validate(t, "c-private-only");
  assert.equal(privateOnly.evidenceConfidence.score, 10);
  assert.equal(privateOnly.evidenceConfidence.label, "very_low");
  assert.equal(privateOnly.privateContext.records, 1);
  assert.match(privateOnly.privateContext.note, /context/);

  const withPrivate = await validate(t, "c-corroborated-plus-private");
  const without = await validate(t, "c-corroborated");
  assert.equal(withPrivate.evidenceConfidence.score, without.evidenceConfidence.score);
  assert.equal(withPrivate.privateContext.records, 1);
});

test("primary support and applicant scope are scored and explained", async (t) => {
  const official = await validate(t, "c-official");
  assert.equal(points(official).primarySupport, 25);
  assert.equal(official.evidenceConfidence.score, 70);

  const inside = await validate(t, "c-iran-only", { residenceCountry: "IRN" });
  assert.equal(points(inside).scope, 10);
  const outside = await validate(t, "c-iran-only", { residenceCountry: "TUR" });
  assert.equal(points(outside).scope, 0);
  assert.match(outside.limitations.join(" "), /outside the claim's applicant scope/);
  const general = await validate(t, "c-single", { residenceCountry: "TUR" });
  assert.equal(points(general).scope, 7);
});

test("an unknown claim fails explicitly", async (t) => {
  const { storeRoot } = store(t);
  const result = await executeTool("validateRouteClaim", { claimId: "clm_00000000000000000000000000000000" }, globalThis.fetch,
    { signalStoreRoot: path.join(storeRoot, "datasets") });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "route_claim_not_found");
});

test("official evidence is dated by its verification, not its original publication", async (t) => {
  const content = await validate(t, "c-old-publication");
  assert.equal(points(content).recency, 15);
  assert.deepEqual(content.limitations, []);
});

test("a family reached only through a copy does not add diversity", async (t) => {
  const content = await validate(t, "c-one-family");
  assert.equal(content.independence.supportingPublicReports, 3);
  assert.equal(points(content).diversity, 5);
});
