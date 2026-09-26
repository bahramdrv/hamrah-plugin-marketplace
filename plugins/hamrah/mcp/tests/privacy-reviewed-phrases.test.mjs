import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readCommunityDataset } from "../community-datasets.mjs";
import { inspectDatasetPrivacy } from "../privacy-check.mjs";

const published = (id) => JSON.parse(readFileSync(
  new URL(`../../data/community-signals/datasets/${id}.json`, import.meta.url), "utf8"
));

test("a published dataset's reviewed phrases are accepted under its own id but held under any other id", () => {
  const id = "hamrah_germany_work_community_signals_v3";
  const own = readCommunityDataset(published(id), id);
  assert.deepEqual(own.errors, []);
  assert.equal(own.privacy.status, "pass");

  const renamed = readCommunityDataset(published(id), "unreviewed_copy");
  assert.equal(renamed.canonical, null);
  assert.equal(renamed.privacy.status, "needs_review");
  assert.ok(renamed.privacy.findings.some((item) => item.rule === "possible_full_name"));
});

test("a reviewed phrase is accepted only in the fields it was reviewed in", () => {
  const datasetId = "hamrah_germany_work_community_signals_v3";
  const inReviewedField = { signals: [{ claim: { summary: { en: "Holders of an EU Blue Card report faster renewals." } } }] };
  assert.equal(inspectDatasetPrivacy(inReviewedField, { datasetId }).status, "pass");

  const inOtherField = { sources: [{ name: "EU Blue Card community thread" }] };
  const held = inspectDatasetPrivacy(inOtherField, { datasetId });
  assert.equal(held.status, "needs_review");
  assert.deepEqual(held.findings, [{ status: "needs_review", rule: "possible_full_name", path: "sources[0].name" }]);
});

test("without a dataset id, only phrases reviewed for every dataset are accepted", () => {
  const scoped = { signals: [{ claim: { summary: { en: "Holders of an EU Blue Card report faster renewals." } } }] };
  assert.equal(inspectDatasetPrivacy(scoped).status, "needs_review");
  const everyDataset = { signals: [{ claim: { summary: { en: "Global Talent applicants wait for endorsement." } } }] };
  assert.equal(inspectDatasetPrivacy(everyDataset).status, "pass");
});

const summary = (en) => ({ signals: [{ claim: { summary: { en } } }] });
const statusOf = (en) => inspectDatasetPrivacy(summary(en), { datasetId: "unreviewed" }).status;

test("a common word capitalised only because it starts a sentence is not read as a first name", () => {
  assert.equal(statusOf("Current German mission guidance applies."), "pass");
  assert.equal(statusOf("Appointments are scarce. The Tehran mission lists a waiting list."), "pass");
  assert.equal(statusOf("From June the portal closed; Treat Korean as a parallel asset."), "pass");
});

test("names at or after a sentence opening are still held for review", () => {
  assert.equal(statusOf("Reza Ahmadi applied for the card."), "needs_review");
  assert.equal(statusOf("The Reza Ahmadi case was delayed."), "needs_review");
  assert.equal(statusOf("For Sara Karimi, the visa was refused."), "needs_review");
  assert.equal(statusOf("Delays affected Current German cases."), "needs_review", "an opener word mid-sentence is not exempt");
});
