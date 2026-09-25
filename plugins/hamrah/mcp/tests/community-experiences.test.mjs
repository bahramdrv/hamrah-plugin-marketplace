import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PUBLISHER = fileURLToPath(new URL("../community-publication.mjs", import.meta.url));
const V4 = JSON.parse(readFileSync(
  new URL("../../skills/hamrah-signal-builder/examples/v4_signal_dataset.json", import.meta.url), "utf8"
));
const LIFECYCLE = { status: "active", first_seen: "2026-09-01", last_seen: "2026-09-10", last_verified: "2026-09-11", superseded_by: null };
const PROFILE = "https://www.example.org/people/sara-ahmadi";
const NEWS = "https://news.example.org/2026/08/visa-refusals";
const EMPTY_SCOPE = { origin_countries: [], nationalities: [], residence_countries: [], applying_from: [], age_groups: [], occupations: [], fields: [], education_levels: [], regulated_professions: [], other_conditions: [] };
const hash = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

function evidence(id, sourceId, text, { url = null, publicPerson = false, sourceType = "first_hand_applicant_experience" } = {}) {
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
    iran_connection: { status: "explicit", basis: "self_declared", evidence_ids: ["profile"] },
    summary_en: "A doctoral researcher from Iran enrolled in a German PhD programme in April 2026.",
    evidence_ids: ["profile"], lifecycle: structuredClone(LIFECYCLE), ...fields
  };
}

const BASE = {
  ...structuredClone(V4),
  sources: [
    { id: "profile-site", source_name: "Public professional profile", source_family: "example.org", public: true, source_url: PROFILE },
    { id: "news", source_name: "Public news report", source_family: "news.example.org", public: true, source_url: NEWS },
    { id: "chat", source_name: "Private applicant group", source_family: "chat-group", public: false, source_url: null }
  ],
  evidence: [
    evidence("profile", "profile-site", "The public profile states the researcher is from Iran and began a PhD in Germany in April 2026.", { url: PROFILE, publicPerson: true }),
    evidence("news-report", "news", "The report describes an applicant from Iran whose German study visa was refused in August 2026.", { url: NEWS, sourceType: "recognized_news" }),
    evidence("no-iran", "news", "The report describes an applicant whose German study visa was refused in August 2026.", { url: `${NEWS}/second`, sourceType: "recognized_news" }),
    evidence("chat-post", "chat", "A member from Iran says they enrolled in a German programme.")
  ],
  signals: [], route_claims: [], questions: [], academic_opportunities: [],
  lived_experiences: []
};

function publish(experiences, mutate = () => {}) {
  const candidate = structuredClone(BASE);
  candidate.lived_experiences = experiences;
  mutate(candidate);
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-experiences-"));
  try {
    const file = path.join(directory, "candidate.json");
    writeFileSync(file, JSON.stringify(candidate));
    const storeRoot = path.join(directory, "store");
    const result = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--label", "experiences", "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
    const report = result.status === 0 ? JSON.parse(result.stdout) : null;
    const dataset = report ? JSON.parse(readFileSync(report.published, "utf8")) : null;
    return { result, report, dataset };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("an explicitly documented Iran connection and attained milestone publish with a narrow profile-URL exception", () => {
  const { result, dataset } = publish([experience("enrolled", {})]);
  assert.equal(result.status, 0, result.stderr);
  const [published] = dataset.lived_experiences;
  assert.match(published.id, /^exp_[0-9a-f]{32}$/);
  assert.equal(published.iran_connection.basis, "self_declared");
  assert.equal(dataset.evidence.find((item) => item.source_url === PROFILE).public_person_locator, true);
});

test("names, appearance, language, or education history leave Iranian status unknown", () => {
  for (const basis of ["name", "appearance", "language", "education_history"]) {
    const { result } = publish([experience("inferred", { iran_connection: { status: "explicit", basis, evidence_ids: ["profile"] } })]);
    assert.notEqual(result.status, 0, basis);
    assert.match(result.stderr, new RegExp(`\\[evidence\\] .*Iranian status is unknown: ${basis} cannot establish an Iran connection`));
  }
  const unknown = publish([experience("unknown", { iran_connection: { status: "unknown", basis: "documented", evidence_ids: ["profile"] } })]);
  assert.match(unknown.result.stderr, /Iranian status is unknown/);
  const silent = publish([experience("silent", { iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["no-iran"] }, evidence_ids: ["no-iran"] })]);
  assert.match(silent.result.stderr, /does not explicitly state an Iran connection/);
  const privateOnly = publish([experience("private", { iran_connection: { status: "explicit", basis: "self_declared", evidence_ids: ["chat-post"] }, evidence_ids: ["chat-post"] })]);
  assert.match(privateOnly.result.stderr, /Iran connection needs public evidence/);
});

test("merely applying is never an attained success", () => {
  const { result } = publish([experience("applied", { milestone: "application_submitted" })]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /application_submitted is a process step, not an attained milestone/);
  const claim = publish([experience("applied-claim", { milestone: "application_submitted", outcome: "claim_only" })]);
  assert.equal(claim.result.status, 0, claim.result.stderr);
  const noPublicMilestone = publish([experience("private-milestone", { evidence_ids: ["chat-post"] })]);
  assert.match(noPublicMilestone.result.stderr, /attained milestone needs public evidence/);
});

test("negative outcomes keep their date, entity, applicant scope, and a public source link", () => {
  const refusal = experience("refused", {
    milestone: "study_visa_granted", outcome: "refusal", event_date: "2026-08-12",
    entity: { entity_type: "embassy", name: "German Embassy Tehran" },
    applicant_scope: { ...EMPTY_SCOPE, residence_countries: ["IRN"] },
    iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["news-report"] },
    summary_en: "An applicant from Iran reported a German study visa refusal in August 2026.",
    evidence_ids: ["news-report"]
  });
  // The unrelated public profile would be an uncited profile locator, so it is left out of this candidate.
  const withoutProfile = (candidate) => {
    candidate.sources = candidate.sources.filter((source) => source.id !== "profile-site");
    candidate.evidence = candidate.evidence.filter((item) => item.id !== "profile");
  };
  const { result, dataset } = publish([refusal], withoutProfile);
  assert.equal(result.status, 0, result.stderr);
  const [published] = dataset.lived_experiences;
  assert.equal(published.outcome, "refusal");
  assert.equal(published.event_date, "2026-08-12");
  assert.equal(published.entity.name, "German Embassy Tehran");
  assert.deepEqual(published.applicant_scope.residence_countries, ["IRN"]);
  assert.equal(dataset.evidence.find((item) => published.evidence_ids.includes(item.id)).source_url, NEWS);

  const undated = publish([{ ...refusal, event_date: null }], withoutProfile);
  assert.match(undated.result.stderr, /refusal needs an event_date/);
  const unlinked = publish([{ ...refusal, evidence_ids: ["chat-post"] }], withoutProfile);
  assert.match(unlinked.result.stderr, /refusal needs a public source link/);
});

test("privacy-unsafe candidates are refused", () => {
  const unflagged = publish([experience("unflagged", {})], (candidate) => { delete candidate.evidence[0].public_person_locator; });
  assert.match(unflagged.result.stderr, /\[privacy\] .*possible_full_name_locator/);

  const uncited = publish([experience("uncited", { iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["news-report"] }, evidence_ids: ["news-report"] })]);
  assert.match(uncited.result.stderr, /\[privacy\] .*possible_full_name_locator/, "the exception applies only to evidence a lived experience cites");

  const contact = publish([experience("contact", {})], (candidate) => {
    candidate.evidence[0].source_url = `${PROFILE}?email=private`;
    candidate.sources[0].source_url = `${PROFILE}?email=private`;
  });
  assert.match(contact.result.stderr, /\[privacy\] .*embedded_contact_locator/);

  const named = publish([experience("named", { summary_en: "Sara Ahmadi enrolled in a German PhD programme." })]);
  assert.match(named.result.stderr, /\[privacy\] .*summary_en \(possible_full_name\)/);
});

test("a negated Iran mention does not establish the connection", () => {
  const { result } = publish([experience("negated", { iran_connection: { status: "explicit", basis: "documented", evidence_ids: ["negated-report"] }, evidence_ids: ["negated-report"] })], (candidate) => {
    candidate.evidence.push(evidence("negated-report", "news", "The applicant is not Iranian but studied in Iran for one semester.", { url: `${NEWS}/negated`, sourceType: "recognized_news" }));
    candidate.sources = candidate.sources.filter((source) => source.id !== "profile-site");
    candidate.evidence = candidate.evidence.filter((item) => item.id !== "profile");
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not explicitly state an Iran connection/);
});

test("withdrawing a Lived Experience also hides the profile locator kept for it", async () => {
  const { executeTool } = await import("../server.mjs");
  const directory = mkdtempSync(path.join(tmpdir(), "hamrah-experience-withdraw-"));
  try {
    const candidate = structuredClone(BASE);
    candidate.lived_experiences = [experience("enrolled", {})];
    const file = path.join(directory, "candidate.json");
    writeFileSync(file, JSON.stringify(candidate));
    const storeRoot = path.join(directory, "store");
    const published = spawnSync(process.execPath, [PUBLISHER, "publish", file, "--store-root", storeRoot, "--now", "2026-09-20T00:00:00Z"], { encoding: "utf8" });
    assert.equal(published.status, 0, published.stderr);
    const report = JSON.parse(published.stdout);
    const experienceId = report.ids.lived_experiences.enrolled;
    const withdrawn = spawnSync(process.execPath, [PUBLISHER, "withdraw", "--store-root", storeRoot, "--artifact", experienceId, "--reason", "privacy", "--now", "2026-09-21T00:00:00Z"], { encoding: "utf8" });
    assert.equal(withdrawn.status, 0, withdrawn.stderr);
    const fetched = await executeTool("getCommunitySignalDataset", { datasetId: report.datasetId }, globalThis.fetch, { signalStoreRoot: path.join(storeRoot, "datasets") });
    assert.equal(JSON.stringify(fetched.structuredContent).includes(PROFILE), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
