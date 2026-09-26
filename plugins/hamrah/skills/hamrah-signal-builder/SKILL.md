---
name: hamrah-signal-builder
description: Use when the user asks to analyze a specified immigration community source for signals; extract its questions in the same source pass.
---

# Hamrah Signal Builder

## Contract

Create evidence-aware Community Signals. Community evidence is practical context, never an official rule merely because it is repeated.

New public evidence uses the version 4 Community Dataset contract in `references/community_dataset_v4_schema.json` and the publication gate described below. The version 3 contract in `references/output_schema.json` remains supported for existing signal-only exports. Candidate notes and legacy version 2 shapes are not final public evidence.

## Required references

Read the references needed for the task:
- `references/signal_taxonomy.md`
- `references/migration_routes.md`
- `references/evidence_rules.md`
- `references/output_schema.json`
- `references/community_dataset_v4_schema.json` and `examples/v4_signal_dataset.json` for new public evidence
- `references/community_signals_v3_schema.json` for the installed version 3 compatibility contract
- `examples/gold_standard.json` when uncertain

## Workflow

1. Inventory the complete available source and mark coverage `complete`, `partial`, or `unknown` without guessing.
2. Normalize provenance into top-level `sources` and privacy-clean top-level `evidence`.
3. Extract narrowly scoped claims as `signals`; questions alone are not signals. In the same user-requested source pass, extract distinct applicant Questions into the version 4 `questions` collection, merge wording variants, preserve their source evidence and independent asker counts, and mark unsupported answers unresolved. Do not research unrelated sources or countries as a follow-on task.
4. Deduplicate evidence and link it through `evidence_links`; preserve contradictions explicitly.
5. Keep lifecycle separate from evidence maturity and review state.
6. Verify high-impact current claims when possible; otherwise record them as unverified.
7. Never store applicant-specific fit adjustments in Community Signals. Scoring belongs to Advisor policy.
8. Remove personal identifiers and set `quality.checks.privacy.status` to `pass` only after the check is actually complete.
9. Write `immigration_community_signals.json` using schema v4 for new public evidence, or v3 when maintaining a legacy signal-only export.
10. Run `python scripts/validate_output.py immigration_community_signals.json`.
11. If validation returns non-zero, fix the dataset and rerun. NEVER return, persist, publish, or describe the dataset as complete until validation exits 0.
12. Publish version 4 with `node plugins/hamrah/mcp/community-publication.mjs publish <candidate.json> --store-root <root>` so normalization, privacy, provenance, stable IDs, and schema gates run. `scripts/store_signals.py` accepts validated version 2/3 compatibility files and refuses version 4.

## Non-negotiable rules

- Official eligibility and Community Signal are separate layers.
- Do not infer approval rates from community samples.
- Do not generalize one applicant, institution, employer, or city to a whole country.
- Do not infer source completeness, official confirmation, or quality checks that were not actually established.
- Evidence belongs at top level; support/contradiction belongs on the signal-to-evidence link.
- The final dataset MUST validate successfully before return/store.

## Final output

Return the validated JSON file and a brief validation result. Publishing a Git commit/push requires an explicit target and request.
