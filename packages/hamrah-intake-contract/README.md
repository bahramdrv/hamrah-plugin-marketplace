# Hamrah intake compatibility baseline 1.0.0

Local source package for the Hamrah repository's **development** facade. No network, model, scoring, database, or installed-cache dependency. It lives inside the Hamrah Plugin repository at `packages/hamrah-intake-contract`; run `npm ci` from the repository root. This package is private and is not a published plugin runtime dependency.

`previewProfile(profile)` reads the Profile Normalizer's `schema_version: "1.0"` shape and returns four conservative field proposals, unmapped paths, and compatibility issues. This is a projection validator for that subset, **not validation of the entire upstream schema**, text normalization, import, export, or a scheduler. Inputs must already be structured by the Facilitator/normalizer. Unknown schema versions and malformed ambiguity/missing/contradiction envelopes are rejected. Unsupported values become Unknown with an issue; contradictions remain Conflicting. The source object is never mutated. No profile completeness or screening verdict is inherited.

Application facade: `workflow.previewHamrahProfile(caseId, profile)` adds current question labels and whether the current intake permits each field. It neither stores a profile nor alters a Case. Chosen proposals still require `recordFact`, current revision, and ordinary server validation. Every chosen value remains applicant-reported. Verification is a separate command.

Plugin facade: `plugins/hamrah/mcp/intake-contract.mjs` exports `previewApplicationIntake`. It deliberately is not registered on the remote MCP server or connected to the installed `normalizeApplicantProfile` tool. The local plugin and application conformance tests consume the same package and synthetic fixture. Distribution/bundling of this package into a future installed plugin requires a separate release decision.

The golden fixture is invented; it contains no real Applicant information. Run `node --test plugins/hamrah/mcp/tests/intake-contract.test.mjs` from the repository root. The historical application integration lives outside this repository and is not needed to run the plugin tests.

## Mapping boundary

| Hamrah field | Application field | Conversion |
|---|---|---|
| applicant.age | age | Finite number in 0–110; no inferred birth date |
| applicant.current_country_of_residence | profile.residence | Iran → iran; Germany → DE; Australia → AU; other text explicitly unresolved |
| household.relationship_status | profile.maritalStatus | Exact single/married/partner/divorced/widowed only |
| goals.primary_goal | profile.intent | Exact work/study/both only; free text and other goals unresolved |

All other fields remain in `unmappedPaths`; arrays are reported as whole paths so record selection cannot happen implicitly. A source `null` or absent value becomes Unknown/null, never false. Explicit false and empty arrays outside this four-field boundary stay unconsumed and are not converted to an application legal conclusion. The source retains their distinction.

Missing importance is carried as advisory metadata only: critical = screening blocker in Hamrah; high = potential eligibility/ranking effect; medium = refinement; low = optional detail. The app has no equivalent persisted importance field. Its current Route requirements, assessment pass and issuance checks remain authoritative. Missing importance is null rather than guessed. Hamrah provenance prose/normalization logs cannot supply document-reviewed or authority-confirmed verification, an actor, or a checked date.
