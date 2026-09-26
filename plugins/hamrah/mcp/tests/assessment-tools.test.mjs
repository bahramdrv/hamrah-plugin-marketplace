import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateCommunityAdjustment,
  finalizeAssessment,
  normalizeApplicantProfile
} from "../assessment-tools.mjs";

test("normalizes a partial structured profile without inventing omitted facts", () => {
  const result = normalizeApplicantProfile({
    profile: {
      applicant: {
        nationalities: ["Iran"],
        current_country_of_residence: "Germany",
        applying_from: "Germany"
      },
      goals: {
        primary_goal: "Skilled work"
      }
    }
  }, "2026-09-18T00:00:00Z");

  assert.equal(result.valid, true);
  assert.equal(result.normalizedProfile.schema_version, "1.0");
  assert.equal(result.normalizedProfile.applicant.age, null);
  assert.equal(result.normalizedProfile.goals.primary_goal, "Skilled work");
  assert.equal(result.normalizedProfile.intake_status, "needs_more_information");
  assert.ok(result.normalizedProfile.missing_information.some((item) => item.field_path === "employment.roles"));
});

test("missing community coverage always keeps adjustment at zero", () => {
  const result = evaluateCommunityAdjustment({
    countryCode: "ZZZ",
    route: "route-that-does-not-exist"
  });

  assert.equal(result.checked, true);
  assert.equal(result.coverage, "none");
  assert.equal(result.totalAdjustment, 0);
  assert.match(result.warnings.join(" "), /not proof of no friction/i);
});

test("finalization rejects a scorecard when community evaluation is missing", () => {
  const profile = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-profile-normalizer/examples/skilled_worker_profile.json", import.meta.url),
    "utf8"
  ));
  const scorecard = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-scorecard-engine/examples/strong_route.json", import.meta.url),
    "utf8"
  ));

  const result = finalizeAssessment({
    applicantProfile: profile,
    scorecard,
    communityEvaluations: []
  });

  assert.equal(result.finalized, false);
  assert.ok(result.routeAudits[0].gates.some((gate) => gate.gate === "community_checked" && gate.passed === false));
});

test("finalization passes a canonical scorecard when all hard gates match", () => {
  const profile = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-profile-normalizer/examples/skilled_worker_profile.json", import.meta.url),
    "utf8"
  ));
  const scorecard = JSON.parse(readFileSync(
    new URL("../../skills/hamrah-scorecard-engine/examples/strong_route.json", import.meta.url),
    "utf8"
  ));

  const result = finalizeAssessment({
    applicantProfile: profile,
    scorecard,
    communityEvaluations: [{
      countryCode: "DEU",
      routeCode: "opportunity_card",
      checked: true,
      coverage: "strong",
      totalAdjustment: -5,
      checkedAt: "2026-09-18"
    }]
  });

  assert.equal(result.finalized, true);
  assert.equal(result.finalizedScorecard.route_scorecards[0].practical_fit.score, 79);
});
