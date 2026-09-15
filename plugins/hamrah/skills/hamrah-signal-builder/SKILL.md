---
name: hamrah-signal-builder
description: Use when immigration-related community sources need to be converted into canonical Hamrah Community Signals v3.
---

# Hamrah Signal Builder

## Contract

Create evidence-aware Community Signals. Community evidence is practical context, never an official rule merely because it is repeated.

The only final reusable output contract is `references/output_schema.json` with `schema_version: "3.0.0"`. Candidate notes or legacy v2 shapes are intermediate analysis only and MUST NOT be returned or stored as a finished dataset.

## Required references

Read the references needed for the task:
- `references/signal_taxonomy.md`
- `references/migration_routes.md`
- `references/evidence_rules.md`
- `references/output_schema.json`
- `examples/gold_standard.json` when uncertain

## Workflow

1. Inventory the complete available source and mark coverage `complete`, `partial`, or `unknown` without guessing.
2. Normalize provenance into top-level `sources` and privacy-clean top-level `evidence`.
3. Extract narrowly scoped claims as `signals`; questions alone are not signals.
4. Deduplicate evidence and link it through `evidence_links`; preserve contradictions explicitly.
5. Keep lifecycle separate from evidence maturity and review state.
6. Verify high-impact current claims when possible; otherwise record them as unverified.
7. Never store applicant-specific fit adjustments in Community Signals. Scoring belongs to Advisor policy.
8. Remove personal identifiers and set `quality.checks.privacy.status` to `pass` only after the check is actually complete.
9. Write `immigration_community_signals.json` using schema v3.
10. Run `python scripts/validate_output.py immigration_community_signals.json`.
11. If validation returns non-zero, fix the dataset and rerun. NEVER return, persist, publish, or describe the dataset as complete until validation exits 0.
12. For reusable signals run `python scripts/store_signals.py immigration_community_signals.json`; this repeats validation and refuses non-v3/privacy-failing data.

## Non-negotiable rules

- Official eligibility and Community Signal are separate layers.
- Do not infer approval rates from community samples.
- Do not generalize one applicant, institution, employer, or city to a whole country.
- Do not infer source completeness, official confirmation, or quality checks that were not actually established.
- Evidence belongs at top level; support/contradiction belongs on the signal-to-evidence link.
- The final dataset MUST validate successfully before return/store.

## Final output

Return the validated v3 JSON file and a brief validation result. Publishing a Git commit/push requires an explicit target and request.
