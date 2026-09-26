# Community Signals v3 Design

## Goal

Make Hamrah community signals a durable evidence/claim/assessment contract that preserves provenance, avoids scoring-policy coupling, and cannot enter the Git-backed store unless it validates.

## Architecture

The canonical dataset has four layers: `sources` describe coverage; `evidence` stores deduplicated observations; `signals` store claims and links to evidence; `assessment` inside each signal stores the Signal Builder's interpretation. Applicant-specific route-fit scoring is not stored in the dataset and remains an Advisor/runtime policy concern.

The top-level contract is JSON Schema draft 2020-12 with `schema_version: 3.0.0` and a separate `taxonomy_version`. The canonical file contains `dataset`, `sources`, `evidence`, `signals`, `quality`, and optional `extensions`. Derived counts and fit adjustments are intentionally excluded.

## Dataset envelope

`dataset` requires a stable `dataset_id`, ISO `generated_at`, and `generator {name, version}`. `sources` and `evidence` use stable IDs so signals can reference them without duplicating evidence text.

## Sources

Each source has `source_id`, `name`, `source_type`, optional `source_url`, and `coverage`. Coverage uses `status: complete|partial|unknown`, nullable date bounds, and nullable `records_available` / `records_processed`. This replaces the ambiguous v2 `coverage_complete` boolean.

## Evidence

Evidence is a top-level entity with `evidence_id`, `source_id`, `locator`, optional published/event/collected timestamps, typed source provenance, `firsthandness`, bilingual summary, and `privacy_redacted`. Evidence does not itself say it supports or contradicts a claim; that relation belongs to the signal-to-evidence link.

## Signals

A signal contains:
- identity: `signal_id`, optional `issue_cluster_id`, and typed `relationships`;
- `classification {family,type,class}`;
- `scope` for destination, applicants, routes, process stages, and entities;
- bilingual `claim` text and practical guidance;
- `evidence_links` with `relation: supports|contradicts|resolves|context` and `independence_group`;
- `assessment` with independent axes for lifecycle, evidence maturity, trend, severity, confidence, and impact direction;
- `verification` for official and community corroboration;
- `review` for recheck scheduling and confirmation criteria;
- `keywords`.

`lifecycle` is `active|resolved|historical|unknown`. `evidence_maturity` is `anecdotal|emerging|corroborated|officially_verified|contradicted`. Monitoring is not a lifecycle state; it is represented by `review.status`.

## Scoring boundary

Canonical community datasets MUST NOT contain `suggested_fit_adjustment`, `conditional_adjustment`, or applicant-specific score changes. Search/fetch APIs expose evidence and assessment. The Advisor may derive a profile-specific adjustment under a separately versioned scoring policy.

## Quality

`quality.checks` records named checks using `pass|fail|partial|not_run|not_available|not_applicable`, with optional notes. Privacy must be `pass` before a dataset can enter the reusable store. Validation results themselves are runtime/store metadata, not self-asserted canonical fields.

## Runtime behavior

The store validates JSON Schema plus semantic integrity: unique source/evidence/signal IDs, all references resolve, no forbidden scoring fields, privacy passes, relationship targets resolve when local, and dataset timestamps parse. Search returns a compact signal view plus derived first/last evidence dates and report counts. Full fetch returns sources, evidence, signals, and quality.

## Validation gates

The Signal Builder validator fails closed if full JSON Schema validation cannot run. `store_signals.py` validates before persistence. Repository CI validates every bundled dataset and runs MCP tests on every pull request to `main`. Invalid datasets must never be silently accepted into the runtime index.

## Migration

The existing UK v2 dataset and the Australia/Germany candidate migrations are converted to v3 without inventing official confirmation or fit penalties. Legacy `root_cause_id` values are preserved as `issue_cluster_id`; counter-evidence becomes an evidence link with relation `contradicts`; watchlist intent becomes each signal's `review` block. Unknown quality facts stay `not_run` or `unknown`, never inferred as pass.
