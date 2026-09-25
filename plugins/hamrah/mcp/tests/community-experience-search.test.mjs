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
const PROFILE = "https://www.example.org/people/sara-ahmadi";
const NEWS = "https://news.example.org/2026/08/visa-refusals";
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, publicPerson = false, sourceType = "recognized_news" } = {}) {
  return {
    id, source_id: sourceId, source_url: url, retrieved_at: "2026-09-11T00:00:00Z", published_at: "2026-09-01", event_date: null,
    content_hash: hash(text), source_type: sourceType, authority: "unknown", direct_or_second_hand: "direct",
    supports_or_contradicts: "supports", independence_group: id, copy_risk: "low", evidence_summary: text, supersedes: null,
    ...(publicPerson ? { public_person_locator: true } : {})
  };
}
function experience(id, fields) {
  return {
    id, country_code: "DEU", routes: ["student_phd"], milestone: "enrolled", outcome: "milestone_attained", event_date: "2026-04-01",
    entity: { entity_type: "university", name: "example-tech.edu" }, applicant_scope: { ...EMPTY_SCOPE, nationalities: ["IRN"] },
    iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["news-report"] },
    summary_en: "An applicant from Iran reported a German study milestone.",
    evidence_ids: ["news-report"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const CANDIDATE = {
  ...structuredClone(V4),
  sources: [
    { id: "profile-site", source_name: "Public professional profile", source_family: "example.org", public: true, source_url: PROFILE },
    { id: "news", source_name: "Public news report", source_family: "news.example.org", public: true, source_url: NEWS },
    { id: "chat", source_name: "Private applicant group", source_family: "chat-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("profile", "profile-site", "The public profile states the researcher is from Iran and began a PhD in Germany in April 2026.", { url: PROFILE, publicPerson: true, sourceType: "first_hand_applicant_experience" }),
    evidence("news-report", "news", "The report describes an applicant from Iran whose German study visa was refused in August 2026.", { url: NEWS }),
    evidence("delay-report", "news", "The report describes an applicant from Iran still waiting five months for a German study visa decision.", { url: `${NEWS}/delay` }),
    evidence("chat-post", "chat", "A member from Iran says they enrolled in a German programme.", { sourceType: "first_hand_applicant_experience" })
  ],
  signals: [], route_claims: [], questions: [], academic_opportunities: [],
  lived_experiences: [
    experience("enrolled", {
      iran_connection: { status: "explicit", basis: "self_declared", evidence_ids: ["profile"] },
      summary_en: "A doctoral researcher from Iran enrolled in a German PhD programme in April 2026.",
      evidence_ids: ["profile", "chat-post"]
    }),
    experience("refused", {
      milestone: "study_visa_granted", outcome: "refusal", event_date: "2026-08-12",
      entity: { entity_type: "embassy", name: "German Embassy Tehran" },
      applicant_scope: { ...EMPTY_SCOPE, residence_countries: ["IRN"] },
      summary_en: "An applicant from Iran reported a German study visa refusal in August 2026."
    }),
    experience("delayed", {
      milestone: "study_visa_granted", outcome: "delay", event_date: "2026-07-01",
      iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["delay-report"] },
      summary_en: "An applicant from Iran waited five months for a German study visa decision.",
      evidence_ids: ["delay-report"]
    }),
    experience("admitted", {
      milestone: "admission_received", summary_en: "An applicant from Iran received a German PhD admission."
    }),
    experience("canada", {
      country_code: "CAN", routes: ["study_permit"], milestone: "study_visa_granted",
      summary_en: "An applicant from Iran received a Canadian study permit."
    })
  ]
};

function publishStore(candidate) {
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-experience-search-"));
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "experiences.json");
  writeFileSync(file, JSON.stringify(candidate));
  const storeRoot = path.join(directory, "store");
  const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "experiences", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  return { storeRoot, ids: report.ids.lived_experiences, evidenceIds: report.ids.evidence };
}

let cached;
const store = () => (cached ??= publishStore(CANDIDATE));
const callIn = (storeRoot, name, args = {}) => executeTool(name, args, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });
const call = (name, args) => callIn(store().storeRoot, name, args);
const search = async (args) => (await call("searchIranianLivedExperiences", args)).structuredContent;

test("the lived experience tools are read-only", () => {
  for (const name of ["searchIranianLivedExperiences", "getLivedExperience"]) {
    assert.equal(TOOLS.find((item) => item.name === name).annotations.readOnlyHint, true, name);
  }
});

test("search returns scoped experiences with explicit Iran evidence, verification, and freshness", async () => {
  const { ids } = store();
  const result = await search({ countryCode: "DEU", route: "student_phd" });
  assert.equal(result.coverage.status, "evidence_found");
  assert.deepEqual(result.experiences.map((item) => item.experienceId).sort(), [ids.enrolled, ids.refused, ids.delayed, ids.admitted].sort());

  const enrolled = result.experiences.find((item) => item.experienceId === ids.enrolled);
  assert.equal(enrolled.milestone, "enrolled");
  assert.equal(enrolled.outcome, "milestone_attained");
  assert.equal(enrolled.caseClass, "qualified_success");
  assert.equal(enrolled.iranConnection.basis, "self_declared");
  assert.equal(enrolled.iranConnection.evidenceIds.length, 1);
  assert.equal(enrolled.evidenceIds.length, 2);
  assert.equal(enrolled.verification.status, "public_evidence");
  assert.deepEqual(enrolled.freshness, { lastVerified: "2026-09-11", latestRetrieval: "2026-09-11T00:00:00Z", eventDate: "2026-04-01" });

  assert.deepEqual((await search({ countryCode: "CAN" })).experiences.map((item) => item.experienceId), [ids.canada]);
  assert.deepEqual((await search({ outcome: "refusal" })).experiences.map((item) => item.experienceId), [ids.refused]);
  assert.deepEqual((await search({ milestone: "admission_received" })).experiences.map((item) => item.experienceId), [ids.admitted]);
  assert.deepEqual((await search({ query: "waited five months" })).experiences.map((item) => item.experienceId), [ids.delayed]);
  const scoped = await search({ countryCode: "DEU", nationality: "AFG" });
  assert.deepEqual(scoped.experiences.map((item) => item.experienceId), [ids.refused], "experiences limited to Iranian nationals are out of an Afghan applicant's scope");
});

test("ordinary output never exposes a public person locator", async () => {
  const { ids } = store();
  const listed = await search({});
  const detail = (await call("getLivedExperience", { experienceId: ids.enrolled })).structuredContent;
  for (const payload of [listed, detail]) {
    const text = JSON.stringify(payload);
    assert.equal(text.includes(PROFILE), false);
    assert.equal(/sara|ahmadi/i.test(text), false);
  }
  const profile = detail.evidence.find((item) => item.evidenceClass === "public_person");
  assert.equal(profile.sourceUrl, null);
  assert.equal(profile.sourceUrlWithheld, "public_person_locator");
  assert.equal(profile.sourceFamily, "example.org");
});

test("detail retrieval shows negative cases with their scope, entity, date, and source link", async () => {
  const { ids } = store();
  const detail = (await call("getLivedExperience", { experienceId: ids.refused })).structuredContent;
  assert.equal(detail.caseClass, "failure");
  assert.equal(detail.experience.outcome, "refusal");
  assert.equal(detail.experience.event_date, "2026-08-12");
  assert.equal(detail.experience.entity.name, "German Embassy Tehran");
  assert.deepEqual(detail.experience.applicant_scope.residence_countries, ["IRN"]);
  assert.deepEqual(detail.evidence.map((item) => [item.evidenceClass, item.sourceUrl]), [["public_community", NEWS]]);
  assert.equal(detail.verification.iranConnectionEvidence, "public");

  const missing = await call("getLivedExperience", { experienceId: "exp_00000000000000000000000000000000" });
  assert.equal(missing.isError, true);
  assert.equal(missing.structuredContent.error, "lived_experience_not_found");
});

test("observed cases separate successes, failures, and unresolved cases without a probability", async () => {
  const { ids } = store();
  const result = await search({ countryCode: "DEU" });
  const cases = result.observedCases;
  assert.deepEqual(cases.qualifiedSuccesses.experienceIds, [ids.enrolled]);
  assert.deepEqual(cases.failures.experienceIds, [ids.refused]);
  assert.deepEqual(cases.unresolved.experienceIds.sort(), [ids.delayed, ids.admitted].sort(), "a delay and a progress milestone are not outcomes");
  assert.deepEqual([cases.qualifiedSuccesses.count, cases.failures.count, cases.unresolved.count], [1, 1, 2]);
  assert.equal(cases.usable_as_probability, false);
  assert.match(cases.sampleBias, /not representative/i);

  // No field anywhere may present a community ratio as a rate, chance, or probability.
  const keys = [];
  JSON.stringify(result, (key, value) => { keys.push(key); return value; });
  assert.deepEqual(keys.filter((key) => /probab|chance|ratio|percent|Rate|(?:^|_)rate\b/i.test(key) && key !== "generatedAt"), ["usable_as_probability"]);

  const empty = await search({ countryCode: "JPN" });
  assert.equal(empty.coverage.status, "no_coverage");
  assert.equal(empty.observedCases.qualifiedSuccesses.count, 0);
  assert.equal(empty.observedCases.usable_as_probability, false);
});

test("private community evidence is context only and never qualifies a public success", async () => {
  const { ids } = store();
  const detail = (await call("getLivedExperience", { experienceId: ids.enrolled })).structuredContent;
  const chat = detail.evidence.find((item) => item.evidenceClass === "private_community");
  assert.equal(chat.role, "context");
  assert.equal(chat.sourceUrl, null);

  // Once the public milestone evidence is withdrawn, the private report alone cannot keep the success qualified.
  const candidate = structuredClone(CANDIDATE);
  // The profile locator would be uncited here, so it is left out of this candidate.
  candidate.sources = candidate.sources.filter((source) => source.id !== "profile-site");
  candidate.evidence = candidate.evidence.filter((item) => item.id !== "profile");
  candidate.evidence.push(evidence("visa-news", "news", "The report says an applicant from Iran received a German study visa in March 2026.", { url: `${NEWS}/granted` }));
  candidate.lived_experiences = [experience("granted", {
    milestone: "study_visa_granted", evidence_ids: ["visa-news", "chat-post"],
    summary_en: "An applicant from Iran received a German study visa in March 2026."
  })];
  const { storeRoot, ids: grantedIds, evidenceIds } = publishStore(candidate);
  const withdrawn = spawnSync(process.execPath, [PUBLISHER, "withdraw", "--store-root", storeRoot, "--artifact", evidenceIds["visa-news"], "--reason", "incorrect", "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  const result = (await callIn(storeRoot, "searchIranianLivedExperiences", {})).structuredContent;
  const [granted] = result.experiences;
  assert.equal(granted.experienceId, grantedIds.granted);
  assert.equal(granted.caseClass, "private_context");
  assert.equal(granted.verification.status, "private_community_only");
  assert.equal(result.observedCases.qualifiedSuccesses.count, 0);
  assert.deepEqual(result.observedCases.privateContext.experienceIds, [grantedIds.granted]);
  assert.match(result.observedCases.privateContext.note, /context or warning/);
});

test("public evidence that contradicts a milestone is opposing evidence, not support", async () => {
  const candidate = structuredClone(CANDIDATE);
  candidate.sources = candidate.sources.filter((source) => source.id !== "profile-site");
  candidate.evidence = candidate.evidence.filter((item) => item.id !== "profile");
  candidate.evidence.push(
    evidence("visa-news", "news", "The report says an applicant from Iran received a German study visa in March 2026.", { url: `${NEWS}/granted` }),
    { ...evidence("retraction", "news", "A correction says the applicant from Iran had not received the German study visa.", { url: `${NEWS}/correction` }), supports_or_contradicts: "contradicts" }
  );
  candidate.lived_experiences = [experience("granted", {
    milestone: "study_visa_granted", evidence_ids: ["visa-news", "retraction"],
    summary_en: "An applicant from Iran received a German study visa in March 2026."
  })];
  const { storeRoot, ids, evidenceIds } = publishStore(candidate);
  const detail = (await callIn(storeRoot, "getLivedExperience", { experienceId: ids.granted })).structuredContent;
  assert.equal(detail.evidence.find((item) => item.sourceUrl === `${NEWS}/correction`).role, "opposing");

  const withdrawn = spawnSync(process.execPath, [PUBLISHER, "withdraw", "--store-root", storeRoot, "--artifact", evidenceIds["visa-news"], "--reason", "incorrect", "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
  assert.equal(withdrawn.status, 0, withdrawn.stderr);
  const after = (await callIn(storeRoot, "searchIranianLivedExperiences", {})).structuredContent;
  assert.equal(after.experiences[0].caseClass, "unresolved", "only contradicting public evidence is left");
  assert.equal(after.experiences[0].verification.status, "no_public_support");
  assert.equal(after.observedCases.qualifiedSuccesses.count, 0);
});
