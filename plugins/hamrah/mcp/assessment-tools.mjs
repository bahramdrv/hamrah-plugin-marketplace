import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";

import {
  getCommunitySignalDataset,
  searchCommunitySignals
} from "./community-signals.mjs";
import { assessFreshness, FRESHNESS_FACT_TYPES, FRESHNESS_POLICY_VERSION } from "./requirement-freshness.mjs";
import { classifySource, SOURCE_AUTHORITY_POLICY_VERSION } from "./source-authority.mjs";

const PROFILE_SCHEMA = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-profile-normalizer/references/applicant_profile_schema.json", import.meta.url),
    "utf8"
  )
);
const SCORECARD_SCHEMA = JSON.parse(
  readFileSync(
    new URL("../skills/hamrah-scorecard-engine/references/scorecard_schema.json", import.meta.url),
    "utf8"
  )
);

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateProfileSchema = ajv.compile(PROFILE_SCHEMA);
const validateScorecardSchema = ajv.compile(SCORECARD_SCHEMA);

const ALLOWED_ADJUSTMENTS = new Set([0, -5, -10, -15, -20]);
const AUTHORITATIVE_CLASSIFICATIONS = new Set(["primary", "trusted"]);

function toolDefinition(name, title, description, inputSchema, openWorldHint = false) {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint,
      destructiveHint: false
    }
  };
}

export const ASSESSMENT_TOOLS = [
  toolDefinition(
    "normalizeApplicantProfile",
    "Normalize Hamrah Applicant Profile",
    "Use this after consent when structured applicant facts need to be normalized into the canonical Hamrah profile schema. The tool never infers omitted facts; unknown values remain null and missing screening fields are surfaced explicitly.",
    {
      type: "object",
      additionalProperties: false,
      required: ["profile"],
      properties: {
        profile: {
          type: "object",
          description: "Structured applicant facts. Free text should first be interpreted by the facilitator; this tool only performs conservative schema normalization."
        }
      }
    }
  ),
  toolDefinition(
    "evaluateRouteEligibility",
    "Evaluate Source-Backed Route Eligibility",
    [
      "Deterministically aggregate explicit, source-backed official requirement checks for one route into PASS, FAIL, POSSIBLE, or UNKNOWN. This tool does not invent requirements and should be used after route facts or primary-authority checks are collected.",
      "Two-step flow: first submit each requirement as read from a Visa Atlas record (sourceUrl = the record's https://visaatlas.org URL, governmentSourceUrl = the record's primarySource.url, verifiedAt = its primarySource.lastVerified or lastReviewed date, plus factType); then, for every met or not_met requirement, submit a second check with the same requirementId whose sourceUrl is the primary official page that confirms it.",
      `Every check is classified with the versioned Source Authority policy (version ${SOURCE_AUTHORITY_POLICY_VERSION}) that the scorecard validator uses; the first matching rule decides. An exact rule needs claimType, requirementId, title, explanation, countryCode, routeCode, and the sourceUrl host and decoded path to equal it. A host and path-prefix rule needs claimType in its claim types, countryCode in its country, the sourceUrl host, and a decoded path under its prefix: official German pages on the Residence Act (gesetze-im-internet.de/aufenthg_2004/), Make it in Germany, the Tehran embassy and the Consular Services Portal (diplo.de) are primary. A Visa Atlas record is trusted only with an HTTPS governmentSourceUrl on another host and a verifiedAt whose age under the freshness policy for its factType is current or aging; otherwise it is unknown. sourceUrl must be HTTPS with no port, credentials, query, fragment, empty or dot path segments; sourceTitle is descriptive only and never establishes authority.`,
      "A met or not_met check whose source is missing, title-only, non-HTTPS, unrecognised, a stale or unlinked Visa Atlas record, or outside the rule's scope keeps the route UNKNOWN; any non-not_applicable check with unknown authority makes the result a Provisional Assessment (assessment_kind 'provisional') with usableForRanking false. A primary check decides its requirement and overrides a contradicting Visa Atlas check. A decisive requirement with only trusted evidence is listed in awaiting_official_confirmation and caps the route at POSSIBLE (assessment_kind 'awaiting_official_confirmation'); it can be ranked but never counts as PASS, except that a trusted-only not_met is listed in likely_blockers and makes the route unrankable until a primary check confirms or overturns it. Official PASS needs every decisive requirement confirmed by a primary check; a primary not_met gives an official FAIL.",
      `Freshness uses the versioned fact-type policy (version ${FRESHNESS_POLICY_VERSION}) from the scorecard validator: age is measured from retrievedAt (zoned ISO date-time) to evaluation time for the given factType, and effectiveUntil in the past makes a check stale. A stale met or not_met check cannot produce PASS or FAIL, and a timeSensitive check with unknown freshness (no valid factType or retrievedAt) keeps the route UNKNOWN.`,
      "Each reason returns source_url, government_source_url, verified_at, checked_at, claim_type, source_authority {policy_version, classification, rule_id}, fact_type, retrieved_at, effective dates, and freshness {policy_version, fact_type, status, age_days, max_age_days}."
    ].join(" "),
    {
      type: "object",
      additionalProperties: false,
      required: ["countryCode", "routeCode", "officialDataQuality", "requirements"],
      properties: {
        countryCode: { type: "string", minLength: 2, maxLength: 3 },
        routeCode: { type: "string", minLength: 1, maxLength: 120 },
        routeName: { type: "string", maxLength: 160 },
        officialDataQuality: {
          type: "string",
          enum: ["current", "partial", "stale", "missing"]
        },
        asOf: { type: ["string", "null"] },
        freshnessNote: { type: "string", maxLength: 500 },
        requirements: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["requirementId", "title", "result", "explanation"],
            properties: {
              requirementId: { type: "string", minLength: 1, maxLength: 160 },
              title: { type: "string", minLength: 1, maxLength: 240 },
              result: {
                type: "string",
                enum: ["met", "not_met", "unknown", "not_applicable"]
              },
              explanation: { type: "string", minLength: 1, maxLength: 2000 },
              claimType: {
                type: "string",
                maxLength: 120,
                description: "Claim type matched against the Source Authority policy's claim_type, for example immigration_requirement."
              },
              sourceUrl: {
                type: ["string", "null"],
                maxLength: 1000,
                description: "HTTPS URL of the source: a primary official page, or a Visa Atlas record URL (https://visaatlas.org/...); its host and path are matched against the Source Authority policy."
              },
              governmentSourceUrl: {
                type: ["string", "null"],
                maxLength: 1000,
                description: "For a Visa Atlas record: the government source it links (the record's primarySource.url). Required, as HTTPS on another host, for the record to be trusted."
              },
              verifiedAt: {
                type: ["string", "null"],
                description: "For a Visa Atlas record: when it was last verified against that government source (primarySource.lastVerified, else lastReviewed), as an ISO date or zoned date-time. It must be within the freshness policy for factType for the record to be trusted."
              },
              sourceTitle: { type: ["string", "null"], maxLength: 500, description: "Descriptive only; never establishes authority." },
              checkedAt: { type: ["string", "null"], description: "When the facilitator checked the requirement (ISO date or date-time)." },
              factType: {
                type: ["string", "null"],
                enum: [...FRESHNESS_FACT_TYPES, null],
                description: "Freshness-policy fact type that sets the aging and maximum age for this check."
              },
              retrievedAt: {
                type: ["string", "null"],
                description: "Zoned ISO date-time when the source was retrieved; the freshness age basis."
              },
              effectiveFrom: { type: ["string", "null"], description: "ISO date the cited rule took effect." },
              effectiveUntil: { type: ["string", "null"], description: "ISO date the cited rule stops applying; a past date makes the check stale." },
              timeSensitive: {
                type: "boolean",
                default: false,
                description: "When true, the check needs a known, non-stale freshness (factType plus retrievedAt) before the route can PASS."
              }
            }
          }
        }
      }
    }
  ),
  toolDefinition(
    "evaluateCommunityAdjustment",
    "Evaluate Community Adjustment",
    "Run the required community-signal search and full dataset evidence check for one applicant-route scope, deduplicate correlated issues, and derive a conservative downside-only adjustment under Hamrah policy. The result is a Practical Fit component only. Coverage counts the matching signals used and excluded (with reasons); missing or wholly excluded coverage returns adjustment 0 plus an explicit warning.",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        countryCode: { type: "string", minLength: 2, maxLength: 3 },
        country: { type: "string", minLength: 2, maxLength: 80 },
        route: { type: "string", minLength: 1, maxLength: 100 },
        topic: { type: "string", minLength: 1, maxLength: 120 },
        processStage: { type: "string", minLength: 1, maxLength: 100 },
        originCountry: { type: "string", minLength: 2, maxLength: 80 },
        nationality: { type: "string", minLength: 2, maxLength: 80 },
        entity: { type: "string", minLength: 2, maxLength: 120 },
        statuses: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["active", "monitoring", "uncertain", "resolved", "historical"]
          }
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }
      }
    }
  ),
  toolDefinition(
    "finalizeAssessment",
    "Finalize Hamrah Assessment",
    "Validate a canonical profile and scorecard and enforce finalization gates. Every scored route must have a recorded community evaluation; rankable routes must use source-backed official evidence and non-stale official data; score arithmetic and portfolio ranking are checked before the scorecard is marked final.",
    {
      type: "object",
      additionalProperties: false,
      required: ["applicantProfile", "scorecard", "communityEvaluations"],
      properties: {
        applicantProfile: {
          type: "object",
          description: "Canonical Hamrah applicant profile."
        },
        scorecard: {
          type: "object",
          description: "Canonical Hamrah immigration scorecard."
        },
        communityEvaluations: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["countryCode", "routeCode", "checked", "coverage", "totalAdjustment"],
            properties: {
              countryCode: { type: "string", minLength: 2, maxLength: 3 },
              routeCode: { type: "string", minLength: 1, maxLength: 120 },
              checked: { type: "boolean" },
              coverage: {
                type: "string",
                enum: ["strong", "partial", "none", "unavailable"]
              },
              totalAdjustment: {
                type: "integer",
                enum: [0, -5, -10, -15, -20]
              },
              checkedAt: { type: ["string", "null"] }
            }
          }
        }
      }
    }
  )
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function blankProfile(now) {
  return {
    schema_version: "1.0",
    generated_at: now,
    intake_status: "needs_more_information",
    applicant: {
      age: null,
      date_of_birth: null,
      nationalities: null,
      citizenships: null,
      current_country_of_residence: null,
      current_immigration_status: null,
      applying_from: null
    },
    household: {
      relationship_status: null,
      accompanying_partner: null,
      dependants: null,
      partner_profile: null
    },
    education: null,
    languages: null,
    employment: {
      declared_total_years: null,
      roles: null
    },
    research: {
      publications: null,
      citation_count: null,
      h_index: null,
      patents: null,
      grants: null,
      awards: null,
      peer_review: null,
      invited_talks: null,
      research_leadership: null,
      teaching_experience: null,
      major_projects: null,
      recommenders: null
    },
    professional: {
      regulated_profession: null,
      licences: null,
      skills_assessments: null,
      certifications: null,
      memberships: null,
      portfolio: null,
      major_achievements: null
    },
    finances: {
      available_budget: null,
      maximum_budget: null,
      annual_income: null,
      source_of_funds: null,
      scholarship_or_funding: null,
      financial_sponsor: null,
      can_pay_deposit: null
    },
    immigration_history: {
      previous_visas: null,
      previous_refusals: null,
      previous_residence_abroad: null,
      overstay_or_status_breach: null,
      removal_or_deportation: null
    },
    admissibility_declarations: {
      criminal_conviction_declared: null,
      serious_immigration_breach_declared: null,
      health_admissibility_concern_declared: null
    },
    goals: {
      primary_goal: null,
      desired_route_families: null,
      target_study_level: null,
      desired_field: null,
      target_occupation: null,
      long_term_settlement: null,
      target_start_date: null,
      temporary_route_acceptable: null
    },
    constraints: {
      hard_deadline: null,
      must_work_while_studying: null,
      must_relocate_with_family: null,
      third_country_travel_possible: null,
      biometrics_travel_limitations: null,
      licensing_constraints: null,
      other_constraints: null
    },
    preferences: {
      preferred_countries: null,
      excluded_countries: null,
      preferred_languages: null,
      climate_preferences: null,
      city_size_preferences: null,
      other_preferences: null
    },
    missing_information: [],
    ambiguities: [],
    contradictions: [],
    normalization_log: [],
    data_quality: {
      overall_confidence: "low",
      critical_missing_count: 0,
      high_missing_count: 0,
      ambiguity_count: 0,
      contradiction_count: 0
    }
  };
}

function mergeKnown(target, incoming, path, dropped) {
  if (!isPlainObject(incoming) || !isPlainObject(target)) return;
  for (const [key, value] of Object.entries(incoming)) {
    const nextPath = path ? path + "." + key : key;
    if (!Object.hasOwn(target, key)) {
      dropped.push(nextPath);
      continue;
    }
    if (isPlainObject(target[key]) && isPlainObject(value)) {
      mergeKnown(target[key], value, nextPath, dropped);
    } else {
      target[key] = clone(value);
    }
  }
}

function normalizeEducationLabels(profile, log) {
  if (!Array.isArray(profile.education)) return;
  const map = new Map([
    ["msc", "masters"],
    ["m.sc", "masters"],
    ["master", "masters"],
    ["master's", "masters"],
    ["masters degree", "masters"],
    ["phd", "doctorate"],
    ["ph.d", "doctorate"],
    ["bsc", "bachelor"],
    ["b.sc", "bachelor"],
    ["bachelor's", "bachelor"]
  ]);
  profile.education.forEach((item, index) => {
    if (!isPlainObject(item) || typeof item.level !== "string") return;
    const original = item.level;
    const replacement = map.get(original.trim().toLowerCase());
    if (!replacement || replacement === original) return;
    if (item.source_label === null || item.source_label === undefined) item.source_label = original;
    item.level = replacement;
    log.push({
      field_path: "education[" + index + "].level",
      source_value: original,
      normalized_value: replacement,
      rule: "obvious education-level label normalization"
    });
  });
}

function normalizeLanguageLabels(profile, log) {
  if (!Array.isArray(profile.languages)) return;
  profile.languages.forEach((item, index) => {
    if (!isPlainObject(item) || typeof item.test !== "string") return;
    const original = item.test;
    const normalized = original.trim().toLowerCase();
    if (normalized === "ielts academic") {
      item.test = "IELTS";
      if (item.test_type === null || item.test_type === undefined) item.test_type = "Academic";
    } else if (normalized === "ielts general" || normalized === "ielts general training") {
      item.test = "IELTS";
      if (item.test_type === null || item.test_type === undefined) item.test_type = "General";
    } else {
      return;
    }
    log.push({
      field_path: "languages[" + index + "].test",
      source_value: original,
      normalized_value: "IELTS",
      rule: "obvious language-test label normalization"
    });
  });
}

function pathValue(object, path) {
  return path.split(".").reduce((current, key) => current === null || current === undefined ? undefined : current[key], object);
}

function absent(value) {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === "";
}

function missingItem(fieldPath, importance, reason, affectedRouteFamilies, suggestedQuestion) {
  return {
    field_path: fieldPath,
    importance,
    reason,
    affected_route_families: affectedRouteFamilies,
    suggested_question: suggestedQuestion
  };
}

function computeMissingInformation(profile) {
  const checks = [
    ["applicant.nationalities", "critical", "Nationality materially affects initial route screening.", ["all"], "What nationality or nationalities does the applicant hold?"],
    ["goals.primary_goal", "critical", "The primary migration goal is required to select relevant route families.", ["all"], "What is the applicant's primary goal: work, study, family, settlement, investment, or another route?"],
    ["applicant.current_country_of_residence", "high", "Current residence can affect application location and operational requirements.", ["all"], "What country does the applicant currently reside in?"],
    ["applicant.applying_from", "high", "Applying-from country can change process steps and practical constraints.", ["all"], "From which country will the applicant apply?"]
  ];
  const goal = String(profile.goals?.primary_goal || "").toLowerCase();
  if (goal.includes("work") || goal.includes("skilled") || goal.includes("employ") || goal.includes("move")) {
    checks.push(
      ["employment.roles", "high", "Employment history materially affects work-route screening.", ["EMPLOYMENT / WORK", "PERMANENT / LONG-TERM"], "What are the applicant's current and previous relevant roles?"],
      ["languages", "high", "Language evidence often affects skilled-work screening.", ["EMPLOYMENT / WORK", "PERMANENT / LONG-TERM"], "What language test results or current language level does the applicant have?"]
    );
  }
  if (goal.includes("study") || goal.includes("student") || goal.includes("research")) {
    checks.push(
      ["education", "high", "Education history is required for study-route screening.", ["STUDY / RESEARCH"], "What completed or current degrees does the applicant have?"],
      ["languages", "high", "Language evidence is commonly required for study-route screening.", ["STUDY / RESEARCH"], "What language test results or current language level does the applicant have?"],
      ["finances.available_budget", "medium", "Budget affects study-route practicality and funding checks.", ["STUDY / RESEARCH"], "What budget is currently available for study and relocation?"]
    );
  }
  return checks
    .filter(([fieldPath]) => absent(pathValue(profile, fieldPath)))
    .map(([fieldPath, importance, reason, routes, question]) =>
      missingItem(fieldPath, importance, reason, routes, question)
    );
}

function schemaErrors(validateFn) {
  return (validateFn.errors || []).slice(0, 30).map((error) => ({
    path: error.instancePath || "<root>",
    message: error.message || "schema validation error"
  }));
}

export function normalizeApplicantProfile(args = {}, now = new Date().toISOString()) {
  if (!isPlainObject(args.profile)) throw new Error("normalizeApplicantProfile requires a structured profile object.");
  const profile = blankProfile(now);
  const droppedFields = [];
  mergeKnown(profile, args.profile, "", droppedFields);

  profile.schema_version = "1.0";
  profile.generated_at = now;
  if (!Array.isArray(profile.ambiguities)) profile.ambiguities = [];
  if (!Array.isArray(profile.contradictions)) profile.contradictions = [];
  if (!Array.isArray(profile.normalization_log)) profile.normalization_log = [];

  const generatedLog = [];
  normalizeEducationLabels(profile, generatedLog);
  normalizeLanguageLabels(profile, generatedLog);
  profile.normalization_log = profile.normalization_log.concat(generatedLog);

  profile.missing_information = computeMissingInformation(profile);
  const critical = profile.missing_information.filter((item) => item.importance === "critical").length;
  const high = profile.missing_information.filter((item) => item.importance === "high").length;
  const contradictions = profile.contradictions.length;
  const ambiguities = profile.ambiguities.length;

  if (critical >= 2) profile.intake_status = "insufficient_for_screening";
  else if (critical > 0 || high > 0 || contradictions > 0) profile.intake_status = "needs_more_information";
  else profile.intake_status = "ready_for_initial_screening";

  profile.data_quality = {
    overall_confidence: critical > 0 || contradictions > 0 ? "low" : high > 0 || ambiguities > 0 ? "medium" : "high",
    critical_missing_count: critical,
    high_missing_count: high,
    ambiguity_count: ambiguities,
    contradiction_count: contradictions
  };

  const valid = validateProfileSchema(profile);
  return {
    source: "Hamrah Applicant Profile Normalizer",
    generatedAt: now,
    valid,
    normalizedProfile: profile,
    validationErrors: valid ? [] : schemaErrors(validateProfileSchema),
    droppedFields,
    usageNote: "No omitted applicant fact was inferred. null means unknown/not provided; the normalized profile remains a screening input, not an immigration decision."
  };
}

export function evaluateRouteEligibility(args = {}, now = new Date().toISOString()) {
  const requirements = Array.isArray(args.requirements) ? args.requirements : [];
  if (!requirements.length) throw new Error("evaluateRouteEligibility requires at least one explicit official requirement check.");

  const reasons = requirements.map((requirement) => ({
    requirement_id: String(requirement.requirementId),
    title: String(requirement.title),
    result: requirement.result,
    explanation: String(requirement.explanation),
    source_url: requirement.sourceUrl ?? null,
    source_title: requirement.sourceTitle ?? null,
    checked_at: requirement.checkedAt ?? null,
    claim_type: requirement.claimType ?? null,
    government_source_url: requirement.governmentSourceUrl ?? null,
    verified_at: requirement.verifiedAt ?? null,
    source_authority: classifySource({ ...requirement, countryCode: args.countryCode, routeCode: args.routeCode }, now),
    fact_type: requirement.factType ?? null,
    retrieved_at: requirement.retrievedAt ?? null,
    effective_from: requirement.effectiveFrom ?? null,
    effective_until: requirement.effectiveUntil ?? null,
    freshness: assessFreshness(requirement, now)
  }));
  const decisive = requirements.filter((item) => item.result !== "not_applicable");
  const authorised = (reason) => AUTHORITATIVE_CLASSIFICATIONS.has(reason.source_authority.classification);
  const unauthorisedChecks = reasons.filter((reason) => ["met", "not_met"].includes(reason.result) && !authorised(reason));
  const staleChecks = reasons.filter((reason) => ["met", "not_met"].includes(reason.result) && reason.freshness.status === "stale");
  const hasUnknownAuthority = reasons.some((reason) =>
    reason.result !== "not_applicable" && reason.source_authority.classification === "unknown"
  );
  const undatedSensitive = requirements.filter((item, index) =>
    item.result !== "not_applicable" && item.timeSensitive === true && reasons[index].freshness.status === "unknown"
  );
  const decisiveReasons = reasons.filter((reason) => ["met", "not_met"].includes(reason.result));
  const confirmedIds = new Set(decisiveReasons
    .filter((reason) => reason.source_authority.classification === "primary")
    .map((reason) => reason.requirement_id));
  const awaitingReasons = decisiveReasons
    .filter((reason) => reason.source_authority.classification === "trusted" && !confirmedIds.has(reason.requirement_id));
  const awaitingConfirmation = [...new Set(awaitingReasons.map((reason) => reason.title))];
  // A trusted-only not_met is a likely failure: it cannot establish FAIL, but it must not be ranked either.
  const likelyBlockers = [...new Set(awaitingReasons.filter((reason) => reason.result === "not_met").map((reason) => reason.title))];
  // A primary check decides its requirement: other checks of that requirement, including a contradicting
  // Visa Atlas record, no longer count. A trusted-only decisive check is awaiting confirmation, not a blocker.
  const effective = reasons.filter((reason) => reason.result !== "not_applicable"
    && (!confirmedIds.has(reason.requirement_id) || reason.source_authority.classification === "primary"));
  const titlesWith = (result) => [...new Set(effective
    .filter((reason) => reason.result === result && !awaitingReasons.includes(reason))
    .map((reason) => reason.title))];
  const blockers = titlesWith("not_met");
  const missingRequirements = titlesWith("unknown");

  let status = "UNKNOWN";
  if (args.officialDataQuality === "missing" || args.officialDataQuality === "stale" || unauthorisedChecks.length || staleChecks.length || undatedSensitive.length) {
    status = "UNKNOWN";
  } else if (blockers.length) {
    status = "FAIL";
  } else if (awaitingConfirmation.length || missingRequirements.length || args.officialDataQuality === "partial") {
    status = "POSSIBLE";
  } else if (decisive.length) {
    status = "PASS";
  }

  const notes = [];
  if (unauthorisedChecks.length) {
    notes.push("One or more decisive checks lack a linked official source whose versioned Source Authority covers that exact claim; the result is a Provisional Assessment and cannot be ranked.");
  }
  if (staleChecks.length) {
    notes.push("One or more decisive checks are past their versioned freshness limit; re-verify them against a current official source before relying on the result.");
  }
  if (undatedSensitive.length) {
    notes.push("One or more time-sensitive checks have unknown freshness; supply a freshness-policy factType and a zoned retrievedAt date-time.");
  }
  if (likelyBlockers.length && !hasUnknownAuthority) {
    notes.push("Visa Atlas reports one or more decisive requirements as not met; treat the route as a likely failure awaiting official confirmation at a primary official source, and do not rank it until then.");
  }
  if (awaitingConfirmation.length && !hasUnknownAuthority) {
    notes.push("One or more decisive requirements rest only on trusted Visa Atlas evidence and are awaiting official confirmation at a primary official source; the route is at most POSSIBLE until each is confirmed.");
  }

  return {
    source: "Hamrah Eligibility Gate",
    evaluatedAt: now,
    countryCode: args.countryCode,
    routeCode: args.routeCode,
    routeName: args.routeName ?? null,
    officialEligibility: {
      status,
      assessment_kind: hasUnknownAuthority
        ? "provisional"
        : awaitingConfirmation.length && status !== "FAIL" ? "awaiting_official_confirmation" : "official",
      reasons,
      awaiting_official_confirmation: awaitingConfirmation,
      likely_blockers: likelyBlockers,
      missing_requirements: missingRequirements,
      blockers,
      official_data_quality: {
        status: args.officialDataQuality,
        as_of: args.asOf ?? null,
        freshness_note: args.freshnessNote || notes.join(" ") || "No additional freshness note supplied."
      }
    },
    usableForRanking: (status === "PASS" || status === "POSSIBLE") && !hasUnknownAuthority && !likelyBlockers.length,
    warnings: notes,
    usageNote: "Community evidence and preferences cannot change official eligibility."
  };
}

// Policy inputs come from the canonical signal, whose field names version 2, 3 and 4 datasets share, and from
// the store's count of independent supporting reports.
function policyInputs(canonical, searched) {
  return {
    status: canonical.lifecycle?.status,
    impactDirection: canonical.impact_direction,
    evidenceMaturity: canonical.evidence_maturity ?? null,
    severity: canonical.severity,
    confidence: canonical.confidence || "low",
    independentReports: searched.evidenceSupport?.supportingGroups ?? 0
  };
}

// The ordered conditions a signal must meet before its severity can become a penalty. The first failed rule
// names why a signal was ignored, so penalty eligibility and the ignore reason cannot drift apart.
const PENALTY_ELIGIBILITY_RULES = [
  { reasonCode: "not_active", fails: (inputs) => inputs.status !== "active" },
  { reasonCode: "not_downside", fails: (inputs) => !["negative", "mixed"].includes(inputs.impactDirection) },
  { reasonCode: "evidence_maturity_unrecorded", fails: (inputs) => inputs.evidenceMaturity === null },
  {
    reasonCode: "evidence_maturity_insufficient",
    fails: (inputs) => !["corroborated", "officially_verified"].includes(inputs.evidenceMaturity)
  },
  { reasonCode: "fewer_than_two_independent_reports", fails: (inputs) => inputs.independentReports < 2 },
  { reasonCode: "low_confidence", fails: (inputs) => inputs.confidence === "low" }
];

function failedEligibilityRule(inputs) {
  return PENALTY_ELIGIBILITY_RULES.find((rule) => rule.fails(inputs)) ?? null;
}

// Severity penalty for a signal that passed every eligibility rule, capped by confidence and impact direction.
function severityPenalty(inputs) {
  let penalty = {
    low: 0,
    moderate: -5,
    high: -10,
    critical: -15
  }[inputs.severity] ?? 0;

  if (inputs.confidence === "medium" && penalty < -5) penalty = -5;
  if (inputs.impactDirection === "mixed") {
    if (penalty === -15) penalty = -10;
    else if (penalty === -10) penalty = -5;
    else if (penalty === -5) penalty = 0;
  }
  return penalty;
}

// An excluded signal could not be judged by the policy, so it does not count as used coverage; the other
// reasons are policy conclusions about a signal that was used.
const IGNORE_REASONS = {
  privacy_inspection_not_passed: { excluded: true, reason: "Dataset privacy inspection did not pass." },
  signal_not_in_dataset: { excluded: true, reason: "Signal was not found in the validated full dataset." },
  evidence_maturity_unrecorded: { excluded: true, reason: "The source dataset does not record evidence maturity, so the signal cannot support a scored penalty." },
  not_active: { excluded: false, reason: "Only active signals can create a current penalty under default Hamrah policy." },
  not_downside: { excluded: false, reason: "Signal is not a current downside/friction signal." },
  evidence_maturity_insufficient: { excluded: false, reason: "Evidence maturity is not strong enough for a scored penalty." },
  fewer_than_two_independent_reports: { excluded: false, reason: "Fewer than two independent reports; one anecdote does not create a penalty." },
  low_confidence: { excluded: false, reason: "Confidence is too low for a scored penalty." },
  no_material_penalty: { excluded: false, reason: "No material penalty under the current community-adjustment policy." },
  correlated_root_cause: { excluded: false, reason: "A correlated signal with the same root cause already carries the penalty." }
};

// ADR 0004: community friction may lower only the applicant's Practical Fit.
const SCORE_COMPONENT = Object.freeze({
  component: "practical_fit",
  notUsedFor: ["iranian_route_viability_index", "route_evidence_threshold", "rankable_route", "route_discovery_ordering"]
});

function ignoredSignal(signal, reasonCode) {
  return { signalId: signal.signalId, datasetId: signal.datasetId, reasonCode, ...IGNORE_REASONS[reasonCode] };
}

export function evaluateCommunityAdjustment(args = {}, root, maxDatasets) {
  const searched = searchCommunitySignals(args, root, maxDatasets);
  const warnings = [];
  if (searched.coverage?.invalidDatasets?.length) {
    warnings.push("Some community datasets were invalid and excluded; coverage is partial.");
  }
  if (searched.coverage?.truncated) {
    warnings.push("Community dataset scan reached its store cap; coverage is partial.");
  }

  if (!searched.signals.length) {
    warnings.push("No matching validated community signal was found for this scope. Adjustment remains 0; this is missing coverage, not proof of no friction.");
    return {
      source: "Hamrah Community Adjustment Evaluator",
      checked: true,
      checkedAt: new Date().toISOString(),
      filters: args,
      scoreComponent: SCORE_COMPONENT,
      coverage: "none",
      signalCoverage: { matching: 0, used: 0, applied: 0, excluded: 0, excludedByReason: {}, truncated: Boolean(searched.coverage?.truncated) },
      totalAdjustment: 0,
      appliedSignals: [],
      ignoredSignals: [],
      evidenceRefs: [],
      warnings,
      usageNote: "Community adjustment is a Practical Fit component only; it never changes official eligibility, the Iranian Route Viability Index, Route Evidence Thresholds, Rankable Route status, or route discovery ordering."
    };
  }

  const datasets = new Map();
  for (const signal of searched.signals) {
    if (!datasets.has(signal.datasetId)) {
      datasets.set(signal.datasetId, getCommunitySignalDataset({ datasetId: signal.datasetId }, root, maxDatasets));
    }
  }

  const candidates = [];
  const ignoredSignals = [];
  const evidenceRefs = [];
  for (const signal of searched.signals) {
    const dataset = datasets.get(signal.datasetId);
    // The store admits only datasets whose privacy inspection passed; its recorded result is the gate.
    if (dataset?.privacy?.status !== "pass") {
      ignoredSignals.push(ignoredSignal(signal, "privacy_inspection_not_passed"));
      continue;
    }
    const fullSignal = dataset.canonicalSignals.find((item) => item.id === signal.signalId);
    if (!fullSignal) {
      ignoredSignals.push(ignoredSignal(signal, "signal_not_in_dataset"));
      continue;
    }
    evidenceRefs.push({
      datasetId: signal.datasetId,
      signalId: signal.signalId,
      evidenceIds: fullSignal.evidence_links.map((link) => link.evidence_id)
    });
    const inputs = policyInputs(fullSignal, signal);
    const failedRule = failedEligibilityRule(inputs);
    const penalty = failedRule ? 0 : severityPenalty(inputs);
    if (!penalty) {
      ignoredSignals.push(ignoredSignal(signal, failedRule?.reasonCode ?? "no_material_penalty"));
      continue;
    }
    candidates.push({
      signalId: signal.signalId,
      datasetId: signal.datasetId,
      rootCauseId: fullSignal.root_cause_id || signal.signalId,
      adjustment: penalty,
      reason: fullSignal.practical_impact || fullSignal.summary_en || "Applicable corroborated community friction.",
      applicability: "matched",
      evidenceCount: fullSignal.evidence_ids.length,
      independentReportCount: inputs.independentReports,
      severity: inputs.severity,
      confidence: inputs.confidence,
      evidenceMaturity: inputs.evidenceMaturity
    });
  }

  const bestByRootCause = new Map();
  for (const candidate of candidates) {
    const existing = bestByRootCause.get(candidate.rootCauseId);
    if (!existing || candidate.adjustment < existing.adjustment) bestByRootCause.set(candidate.rootCauseId, candidate);
  }
  const appliedSignals = [...bestByRootCause.values()].sort((a, b) => a.adjustment - b.adjustment);
  for (const candidate of candidates) {
    if (!appliedSignals.includes(candidate)) {
      ignoredSignals.push(ignoredSignal(candidate, "correlated_root_cause"));
    }
  }
  const rawTotal = appliedSignals.reduce((sum, item) => sum + item.adjustment, 0);
  const totalAdjustment = Math.max(-20, rawTotal);

  const excludedByReason = {};
  for (const item of ignoredSignals.filter((entry) => entry.excluded)) {
    excludedByReason[item.reasonCode] = (excludedByReason[item.reasonCode] ?? 0) + 1;
  }
  // Matches past the result limit were never evaluated, so they count as excluded.
  const beyondLimit = Math.max(0, (searched.totalMatches ?? searched.signals.length) - searched.signals.length);
  if (beyondLimit) {
    excludedByReason.result_limit = beyondLimit;
    warnings.push(`${beyondLimit} matching community signals were beyond the result limit and were not evaluated; raise limit or narrow the scope.`);
  }
  const excluded = ignoredSignals.filter((entry) => entry.excluded).length + beyondLimit;
  const signalCoverage = {
    matching: searched.signals.length + beyondLimit,
    used: searched.signals.length + beyondLimit - excluded,
    applied: appliedSignals.length,
    excluded,
    excludedByReason,
    truncated: Boolean(beyondLimit || searched.coverage?.truncated)
  };
  let coverage = "strong";
  if (signalCoverage.used === 0) {
    coverage = "none";
    warnings.push(`All ${excluded} matching community signals were excluded before the policy could judge them. Adjustment remains 0; this is missing usable coverage, not proof of no friction.`);
  } else if (excluded || searched.coverage?.invalidDatasets?.length || signalCoverage.truncated) {
    coverage = "partial";
    if (excluded) warnings.push(`${excluded} of ${signalCoverage.matching} matching community signals were excluded; coverage is partial.`);
  }

  return {
    source: "Hamrah Community Adjustment Evaluator",
    checked: true,
    checkedAt: new Date().toISOString(),
    filters: args,
    scoreComponent: SCORE_COMPONENT,
    coverage,
    signalCoverage,
    totalAdjustment,
    appliedSignals,
    ignoredSignals,
    evidenceRefs,
    warnings,
    usageNote: "A Practical Fit component only: penalties are downside-only, correlated root causes are deduplicated, and the total adjustment is capped at -20. It never changes official eligibility, the Iranian Route Viability Index, Route Evidence Thresholds, Rankable Route status, or route discovery ordering."
  };
}

function normalizeKey(countryCode, routeCode) {
  return String(countryCode || "").trim().toLowerCase() + "::" + String(routeCode || "").trim().toLowerCase();
}

export function finalizeAssessment(args = {}) {
  if (!isPlainObject(args.applicantProfile)) throw new Error("finalizeAssessment requires applicantProfile.");
  if (!isPlainObject(args.scorecard)) throw new Error("finalizeAssessment requires scorecard.");
  if (!Array.isArray(args.communityEvaluations)) throw new Error("finalizeAssessment requires communityEvaluations.");

  const profile = clone(args.applicantProfile);
  const scorecard = clone(args.scorecard);
  const profileValid = validateProfileSchema(profile);
  const scorecardValid = validateScorecardSchema(scorecard);
  const gates = [
    {
      gate: "profile_schema",
      passed: Boolean(profileValid),
      details: profileValid ? [] : schemaErrors(validateProfileSchema)
    },
    {
      gate: "scorecard_schema",
      passed: Boolean(scorecardValid),
      details: scorecardValid ? [] : schemaErrors(validateScorecardSchema)
    }
  ];

  if (!profileValid || !scorecardValid) {
    return {
      source: "Hamrah Finalization Gate",
      finalized: false,
      gates,
      routeAudits: [],
      finalizedScorecard: null
    };
  }

  const communityByRoute = new Map(
    args.communityEvaluations.map((item) => [normalizeKey(item.countryCode, item.routeCode), item])
  );
  const routeAudits = [];
  const rankable = new Set();

  for (const route of scorecard.route_scorecards) {
    const key = normalizeKey(route.country.code, route.route.code);
    const community = communityByRoute.get(key);
    const routeGates = [];

    routeGates.push({
      gate: "community_checked",
      passed: community?.checked === true,
      detail: community ? community.coverage : "missing"
    });

    const adjustmentMatches = community?.checked === true &&
      ALLOWED_ADJUSTMENTS.has(community.totalAdjustment) &&
      community.totalAdjustment === route.community_adjustment.total;
    routeGates.push({
      gate: "community_adjustment_matches",
      passed: adjustmentMatches,
      detail: community ? community.totalAdjustment : null
    });

    if (community && ["none", "unavailable"].includes(community.coverage)) {
      const coverageSafe = route.community_adjustment.total === 0;
      routeGates.push({
        gate: "missing_community_coverage_zero_adjustment",
        passed: coverageSafe,
        detail: community.coverage
      });
      if (coverageSafe) {
        route.warnings.push("Community coverage is " + community.coverage + "; adjustment held at 0 and coverage should be rechecked before relying on execution-friction assumptions.");
      }
    }

    const officialStatus = route.official_eligibility.status;
    const rankingSafe = !route.practical_fit.usable_for_ranking || ["PASS", "POSSIBLE"].includes(officialStatus);
    routeGates.push({
      gate: "official_status_allows_ranking",
      passed: rankingSafe,
      detail: officialStatus
    });

    const quality = route.official_eligibility.official_data_quality.status;
    const freshnessSafe = !route.practical_fit.usable_for_ranking || !["stale", "missing"].includes(quality);
    routeGates.push({
      gate: "official_data_fresh_enough",
      passed: freshnessSafe,
      detail: quality
    });

    const sourceBacked = route.official_eligibility.reasons
      .filter((reason) => ["met", "not_met"].includes(reason.result))
      .every((reason) => Boolean(reason.source_url || reason.source_title));
    routeGates.push({
      gate: "decisive_requirements_source_backed",
      passed: !route.practical_fit.usable_for_ranking || sourceBacked,
      detail: sourceBacked ? "ok" : "missing source"
    });

    const expectedScore = route.base_fit.score === null
      ? null
      : Math.max(0, route.base_fit.score + route.community_adjustment.total);
    const arithmeticSafe = route.practical_fit.score === expectedScore;
    routeGates.push({
      gate: "practical_fit_arithmetic",
      passed: arithmeticSafe,
      detail: { expected: expectedScore, actual: route.practical_fit.score }
    });

    if (route.practical_fit.usable_for_ranking && routeGates.every((item) => item.passed)) {
      rankable.add(key);
    }

    routeAudits.push({
      countryCode: route.country.code,
      routeCode: route.route.code,
      passed: routeGates.every((item) => item.passed),
      gates: routeGates
    });
  }

  const portfolioSafe = scorecard.portfolio_summary.strongest_routes.every((item) =>
    rankable.has(normalizeKey(item.country_code, item.route_code))
  );
  gates.push({
    gate: "portfolio_contains_only_rankable_routes",
    passed: portfolioSafe,
    details: portfolioSafe ? [] : ["One or more strongest_routes entries failed route finalization gates."]
  });

  gates.push({
    gate: "all_routes_pass_finalization",
    passed: routeAudits.every((item) => item.passed),
    details: routeAudits.filter((item) => !item.passed).map((item) => item.countryCode + ":" + item.routeCode)
  });

  const finalized = gates.every((item) => item.passed);
  return {
    source: "Hamrah Finalization Gate",
    finalized,
    finalizedAt: finalized ? new Date().toISOString() : null,
    gates,
    routeAudits,
    finalizedScorecard: finalized ? scorecard : null,
    usageNote: finalized
      ? "All mandatory Hamrah finalization gates passed."
      : "Assessment is not final. Correct failed gates instead of overriding them with model judgment."
  };
}

export { PROFILE_SCHEMA, SCORECARD_SCHEMA };
