import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";

const V4 = JSON.parse(readFileSync(new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"));
const SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const OFFICIAL = "evd_gt-official-baseline-timing";
const DATE = "2026-09-12";

function fixture(t, change = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), "hamrah-ideal-profile-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dataset = structuredClone(V4);
  dataset.generated_at = `${DATE}T00:00:00Z`;
  dataset.sources.push({ ...dataset.sources[1], id: "src_public-story", source_name: "Public case report", source_family: "case-report", source_url: "https://example.org/case" });
  dataset.evidence.push({ ...dataset.evidence[3], id: "evd_public-story", source_id: "src_public-story", source_url: "https://example.org/case",
    authority: "unknown", evidence_summary: "A documented applicant from Iran with a doctorate in physics received a work visa.",
    independence_group: "case-1", source_type: "first_hand_applicant_experience" });
  const lifecycle = { status: "active", first_seen: "2026-09-01", last_seen: DATE, last_verified: DATE, superseded_by: null };
  const claim = (id, claimType, evidenceIds, opposingIds = []) => ({
    id, country_code: "GBR", routes: ["global_talent"], claim_type: claimType, process_stage: "visa_application",
    statement_en: `${id} is documented for this route.`, evidence_ids: evidenceIds, opposing_evidence_ids: opposingIds,
    lifecycle: structuredClone(lifecycle), validation: structuredClone(dataset.signals[0].validation)
  });
  dataset.route_claims = [
    claim("clm_official", "official_rule", [OFFICIAL]),
    claim("clm_community", "anecdotal_pattern", ["evd_public-story"]),
    claim("clm_conflict", "official_rule", [OFFICIAL], ["evd_public-story"])
  ];
  dataset.lived_experiences = [{
    id: "exp_success", country_code: "GBR", routes: ["global_talent"], milestone: "work_visa_granted",
    outcome: "milestone_attained", event_date: "2026-08-01", entity: null,
    applicant_scope: { ...SCOPE, nationalities: ["IRN"], age_groups: ["30-39"], occupations: ["engineer"], fields: ["physics"], education_levels: ["doctorate"] },
    iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["evd_public-story"] },
    summary_en: "An applicant from Iran with a research degree obtained a work visa.", evidence_ids: ["evd_public-story"],
    lifecycle: structuredClone(lifecycle), validation: structuredClone(dataset.signals[0].validation)
  }];
  change(dataset);
  writeFileSync(path.join(root, "dataset.json"), JSON.stringify(dataset));
  return root;
}

const call = (root, args = {}) => executeTool("getIdealCandidateProfile", { countryCode: "GBR", route: "global_talent", asOf: DATE, ...args }, globalThis.fetch, { signalStoreRoot: root });

test("the MCP profile separates sourced official, observed success and community characteristics in Persian", async (t) => {
  const result = await call(fixture(t));
  assert.equal(result.isError, false);
  const profile = result.structuredContent;
  assert.equal(profile.coverage.status, "evidence_found", JSON.stringify(profile.coverage.invalidDatasets));
  assert.deepEqual(new Set(profile.characteristics.map((item) => item.classification)),
    new Set(["official_requirement", "observed_success_pattern", "community_pattern"]));
  assert.ok(profile.characteristics.every((item) => item.evidence.length && item.freshness && /[\u0600-\u06ff]/u.test(item.summaryFa)));
  assert.equal(profile.characteristics.find((item) => item.claimId === "clm_official").mandatory, null);
  assert.ok(profile.characteristics.filter((item) => item.classification === "observed_success_pattern").every((item) => item.mandatory === false));
  assert.ok(profile.characteristics.some((item) => item.characteristic === "fields: physics"));
  assert.ok(!profile.characteristics.some((item) => item.characteristic === "occupations: engineer"), "an unstated trait is not inferred from scope metadata");
  assert.ok(!JSON.stringify(profile).includes("30-39"), "age from examples is not inferred as an ideal trait");
  assert.ok(!JSON.stringify(profile).includes("nationalities: IRN"));
  assert.equal(profile.unresolved[0].reason, "contradicted");
  assert.equal(profile.unresolved[0].claimId, "clm_conflict");
  assert.ok(!profile.characteristics.some((item) => item.claimId === "clm_conflict"));
  assert.equal(TOOLS.find((item) => item.name === "getIdealCandidateProfile").annotations.readOnlyHint, true);
});

test("missing and unusable evidence yields no guessed profile", async (t) => {
  const root = fixture(t, (dataset) => {
    dataset.route_claims = [];
    dataset.lived_experiences = [];
  });
  const result = (await call(root)).structuredContent;
  assert.equal(result.coverage.status, "no_coverage");
  assert.deepEqual(result.characteristics, []);
  assert.match(result.coverage.noteFa, /نبود شاهد/);
});

test("stale official claims are unresolved rather than mandatory", async (t) => {
  const root = fixture(t, (dataset) => {
    dataset.route_claims = dataset.route_claims.filter((item) => item.id === "clm_official");
    dataset.lived_experiences = [];
    dataset.evidence.find((item) => item.id === OFFICIAL).retrieved_at = "2020-01-01T00:00:00Z";
  });
  const result = (await call(root)).structuredContent;
  assert.equal(result.coverage.status, "unresolved", JSON.stringify(result.coverage.invalidDatasets));
  assert.deepEqual(result.characteristics, []);
  assert.equal(result.unresolved[0].reason, "freshness_unresolved");
});

test("resolution evidence does not establish a requirement, pattern, or success trait", async (t) => {
  const root = fixture(t, (dataset) => {
    dataset.evidence.find((item) => item.id === OFFICIAL).supports_or_contradicts = "resolves";
    dataset.evidence.find((item) => item.id === "evd_public-story").supports_or_contradicts = "resolves";
  });
  const result = (await call(root)).structuredContent;
  assert.equal(result.coverage.status, "no_coverage");
  assert.deepEqual(result.characteristics, []);
});

test("a profile at an earlier date cannot use a dataset published later", async (t) => {
  const root = fixture(t, (dataset) => { dataset.generated_at = "2026-09-13T00:00:00Z"; });
  const result = (await call(root)).structuredContent;
  assert.equal(result.coverage.status, "no_coverage");
  assert.deepEqual(result.characteristics, []);
});

test("observed success freshness ages with the dated event", async (t) => {
  const root = fixture(t, (dataset) => {
    dataset.route_claims = [];
    dataset.lived_experiences[0].event_date = "2025-04-01";
  });
  const result = (await call(root)).structuredContent;
  assert.ok(result.characteristics.length > 0);
  assert.ok(result.characteristics.every((item) => item.freshness.status === "aging"));
});
