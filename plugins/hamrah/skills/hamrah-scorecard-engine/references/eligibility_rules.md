# Hamrah Official Eligibility Rules

## Purpose

Official Eligibility is the legal/official layer of the scorecard.

It must be determined before Community Signals are applied.

## Status values

### PASS
Use when current official information and applicant facts show the checked mandatory route requirements are satisfied.

### FAIL
Use when at least one current mandatory requirement is clearly not met.

A FAIL route:
- may retain a diagnostic Base Fit score;
- must have `usable_for_ranking=false`;
- must never be rescued by Community Signals, preferences, or university fit.

### POSSIBLE
Use when the route may be viable but:
- a required condition is not yet completed;
- a required offer/sponsor/nomination/endorsement is absent but obtainable;
- a material applicant fact is unknown;
- an official threshold depends on a future or external assessment.

POSSIBLE is not PASS.

### UNKNOWN
Use when the engine lacks sufficient current official route data to make a responsible legal assessment.

Examples:
- official rule set unavailable
- freshness too poor for a changed program
- conflicting official sources remain unresolved

UNKNOWN should normally be excluded from ranking until resolved.

---

## Source priority

Prefer:

1. immigration authority / government
2. official program page
3. embassy / consulate where relevant
4. official VAC/service provider for operations only
5. official regulator
6. official university/employer only for institution/employer requirements

Community sources never define official eligibility.

---

## Requirement records

Each checked requirement should include:

- `requirement_id`
- `title`
- `result`
- `explanation`
- `source_url`
- `source_title`
- `checked_at`
- `claim_type` and versioned `source_authority` (`policy_version`, `classification`, `rule_id`)
- for a Visa Atlas record, `government_source_url` (the record's `primarySource.url`) and `verified_at` (its last verification date, ISO date or zoned date-time)
- `retrieved_at`, `effective_from`, and `effective_until` (null when no end date is known)
- `fact_type` and versioned `freshness` (`policy_version`, `fact_type`, `status`, `age_days`, `max_age_days`)

The validator classifies the source URL using `source_authority_policy.json`, the same file the `evaluateRouteEligibility` MCP tool uses. Rules are tried in order and the first match decides. An `exact` rule must match the claim type, requirement ID, exact title and result explanation, country, route, HTTPS host, and exact path. A `host_path_prefix` rule matches any claim of one of its `claim_types` in its country (`*` for all) when the HTTPS host equals its host and the decoded path starts with its prefix; URLs with a port, credentials, query, fragment, or empty or dot path segments are never recognised. A rule's `requires` list adds conditions: `government_source_url` (an HTTPS government link on another host) and `verified_at_within_freshness` (`verified_at`, aged to `generated_at` under the freshness policy for the requirement's `fact_type`, is current or aging and not in the future). The supplied `source_authority` must match the computed classification; a title or claimed authority cannot substitute for a rule. Each rule records its `authority_basis` and `reviewed_at` date.

Policy version 2.0.0 contains:

- `primary` host and path rules for the official German sources used in the published evidence: the Residence Act on `www.gesetze-im-internet.de/aufenthg_2004/`, the federal Make it in Germany portal, the German Embassy in Tehran (`teheran.diplo.de`), and the Federal Foreign Office Consular Services Portal (`digital.diplo.de`), plus the original exact rule for the Opportunity Card secured-livelihood condition;
- a `trusted` rule for Visa Atlas records (`visaatlas.org`) that requires a government link and a current verification date.

Add other countries' official hosts to the versioned policy after review. The policy controls which kind of claim a source can support; validation of the applicant's evidence remains a separate step.

### Visa Atlas first, primary confirmation for decisive requirements

Read route requirements from Visa Atlas first; a current, government-linked record is `trusted`. Every decisive requirement (`met` or `not_met`) must then be confirmed by a second requirement record with the same `requirement_id` whose source is `primary`:

- **Trusted only:** the route is at most `POSSIBLE`, with `assessment_kind: "awaiting_official_confirmation"` and each such requirement's title in `official_eligibility.awaiting_official_confirmation`. It may be ranked by Practical Fit but is not `PASS` and cannot satisfy gates that require PASS, such as IRVI ranking. Exception: a trusted-only `not_met` is a likely failure. List its title in `official_eligibility.likely_blockers`, set `usable_for_ranking: false`, and keep it unranked until a primary source confirms or overturns it.
- **Trusted plus primary:** the primary record decides the requirement; `PASS` needs every decisive requirement confirmed and `FAIL` needs a primary `not_met`.
- **Contradiction:** when the primary record and Visa Atlas disagree, the primary record decides and the Visa Atlas record no longer counts for that requirement.

For `met` or `not_met`, a real scoped source URL and all authority and date fields are mandatory. An unrecognized or mismatched source, or a Visa Atlas record without a government link or past its freshness limit, remains `unknown`, with `assessment_kind: "provisional"`, nondecisive official eligibility, and `usable_for_ranking: false`. `PASS` and `FAIL` require `assessment_kind: "official"` and primary-confirmed decisive requirements.

Allowed results:

- `met`
- `not_met`
- `unknown`
- `not_applicable`

Do not claim a requirement was checked without a supporting official source or configured trusted route dataset (Visa Atlas under the rules above), and do not present a trusted-only requirement as officially confirmed.

---

## Missing requirements vs blockers

### missing_requirements
Use when:
- information/document/condition is still unknown or incomplete;
- the route could still become viable.

### blockers
Use when:
- a current mandatory requirement is clearly not met;
- the route is currently FAIL.

---

## Freshness

Dates must be real ISO values. `generated_at`, `profile_generated_at`, and `retrieved_at` are date-times with a timezone (`2026-09-11T00:00:00Z`); `effective_from` and `effective_until` are dates (`2026-09-11`); `checked_at`, `published_at`, and `official_data_quality.as_of` accept either. Impossible calendar values, an `effective_until` before `effective_from`, and a `checked_at`, `retrieved_at`, or `published_at` after `generated_at` are validation errors. A `met` or `not_met` requirement cannot cite a rule whose `effective_from` is after `generated_at`.

The validator computes each requirement's `freshness` from `references/freshness_policy.json` and the supplied `freshness` must match it. Age is the number of UTC calendar days from `retrieved_at` to `generated_at`. Policy version 1.0.0 covers `salary_threshold`, `fee`, `occupation_list`, `deadline`, `quota`, `processing_time`, `financial_requirement`, and `statutory_condition`:

- `current`: age is at most the fact type's `aging_after_days`;
- `aging`: age is at most `max_age_days` (the validator warns for decisive requirements);
- `stale`: age exceeds `max_age_days`, or `effective_until` is before `generated_at`;
- `unknown`: `retrieved_at` is missing or the fact type is not in the policy. An unknown date is never treated as current.

A `met` or `not_met` requirement that is `stale` or `unknown` blocks ranking. Set `usable_for_ranking: false`, do not report `official_data_quality.status: "current"`, and add a `practical_fit.ranking_blockers` entry with the `requirement_id`, code `stale_decisive_requirement` or `unknown_freshness`, and a reason. A rankable route cannot list ranking blockers.

If freshness cannot be established and the fact is material, lower confidence and consider `UNKNOWN`.

---

## Hard separation

The following must never change Official Eligibility:

- community popularity
- anecdotal approval/refusal patterns
- applicant country preference
- lifestyle preference
- university preference
- resolved operational disruptions

Operational issues can reduce Practical Fit without changing legal eligibility.
