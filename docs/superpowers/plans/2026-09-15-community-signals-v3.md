# Community Signals v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Community Signals v3, migrate all bundled datasets, enforce validation in Builder/store/CI, and merge only after fresh green verification.

**Architecture:** Separate source provenance, deduplicated evidence, claims, and assessments. Remove fit scoring from canonical datasets; runtime derives retrieval metadata only. Fail closed at every persistence boundary.

**Tech Stack:** JSON Schema draft 2020-12, Node.js 22, Ajv 8, Python 3 validator/store utilities, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-community-signals-v3-design.md`

## Global Constraints

- Canonical `schema_version` is exactly `3.0.0`.
- `taxonomy_version` is independent of schema version.
- No canonical signal may contain `suggested_fit_adjustment` or `conditional_adjustment`.
- Evidence is top-level and referenced by `evidence_links`.
- Privacy quality check must be `pass` before storage/runtime indexing.
- Unknown migration facts remain unknown/not-run, never inferred.
- All bundled datasets must validate before merge to `main`.

---

### Task 1: Add failing v3 store contract tests

**Files:**
- Modify: `plugins/hamrah/mcp/tests/community-signal-store.test.mjs`

**Interfaces:**
- Consumes: existing `loadCommunitySignalStore`, `searchCommunitySignals`, `getCommunitySignalDataset`.
- Produces: executable expectations for v3 datasets and evidence reference integrity.

- [ ] Replace v2 assertions with checks for schema `3.0.0`, three valid bundled datasets, no invalid datasets, top-level evidence, resolved evidence links, and absence of stored fit adjustments.
- [ ] Open/update the PR so GitHub Actions runs `npm test` against the unchanged v2 implementation.
- [ ] Confirm the test run fails for the expected v3-vs-v2 contract mismatch.

### Task 2: Implement the v3 schema and validator semantics

**Files:**
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/references/output_schema.json`
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/scripts/validate_output.py`
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/SKILL.md`
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/PACKAGE_NOTES.md`

**Interfaces:**
- Consumes: v3 design spec.
- Produces: strict schema plus semantic validator used by Builder/store.

- [ ] Replace the v2 schema with the v3 envelope and definitions from the spec.
- [ ] Make Python validation fail closed when `jsonschema` is unavailable.
- [ ] Add semantic checks for unique IDs, reference resolution, forbidden scoring fields, privacy pass, and lifecycle/review consistency.
- [ ] Update Builder instructions so final output is v3 and validation success is mandatory before return/store.

### Task 3: Update runtime retrieval for v3

**Files:**
- Modify: `plugins/hamrah/mcp/community-signals.mjs`
- Modify: `plugins/hamrah/mcp/server.mjs`
- Modify: `plugins/hamrah/mcp/tests/server.test.mjs`

**Interfaces:**
- Consumes: v3 schema datasets.
- Produces: search/fetch API that exposes claims and assessments without canonical scoring adjustments.

- [ ] Validate v3 schema and semantic references in `loadCommunitySignalStore`.
- [ ] Update filters to read `scope.routes`, `scope.process_stages`, applicant scope, and entities.
- [ ] Return compact assessment/verification/review fields plus derived first/last evidence dates and report counts.
- [ ] Return complete `sources`, `evidence`, `signals`, and `quality` from full dataset fetch.
- [ ] Update tool descriptions to state that route-fit adjustments are Advisor policy, not stored signal data.

### Task 4: Migrate all bundled datasets and gold standard

**Files:**
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/examples/gold_standard.json`
- Modify: `plugins/hamrah/data/community-signals/datasets/Global Talent ans Skilled Worker - UK - 2026-09-11.json`
- Modify: `plugins/hamrah/data/community-signals/datasets/hamrah_australia_study_signals.json`
- Modify: `plugins/hamrah/data/community-signals/datasets/hamrah_germany_community_signals.json`

**Interfaces:**
- Consumes: v2/candidate evidence already present in the repository.
- Produces: v3 datasets with no information-loss in evidence/counter-evidence and no invented scoring/verification claims.

- [ ] Lift evidence to top-level entities and replace embedded evidence with evidence links.
- [ ] Map destination/applicant/route/stage/entity metadata into v3 scope.
- [ ] Map status into lifecycle + evidence maturity + review, preserving uncertainty conservatively.
- [ ] Preserve counter-evidence as `relation: contradicts`.
- [ ] Remove all fit-adjustment fields.
- [ ] Use `partial`/`unknown` coverage and quality states when old metadata did not prove completeness.

### Task 5: Enforce repository validation

**Files:**
- Replace: `.github/workflows/schema-migration-verify.yml` with `.github/workflows/community-signals-validate.yml`
- Modify: `plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py`
- Modify: `plugins/hamrah/data/community-signals/README.md`

**Interfaces:**
- Consumes: v3 validator and repository datasets.
- Produces: persistence and CI gates that reject invalid datasets.

- [ ] Keep `store_signals.py` validation-before-write and require privacy check `pass`.
- [ ] Run `npm ci`, `npm test`, install Python `jsonschema`, and validate every bundled dataset in CI.
- [ ] Document that manual uploads must pass the same CI gate and are not considered valid merely because they are JSON.

### Task 6: Verify, merge, and retire the superseded v2 PR

**Files:**
- No production files beyond fixes revealed by verification.

**Interfaces:**
- Consumes: completed v3 branch.
- Produces: verified `main` and no stale open migration PR.

- [ ] Run fresh PR CI and confirm `npm test` and dataset validation succeed.
- [ ] Confirm Vercel/other required commit checks are successful or non-blocking.
- [ ] Merge the v3 PR to `main` with expected head SHA.
- [ ] Close the superseded v2 PR #1.
- [ ] Re-fetch `main`, confirm the merge commit is present, and verify post-merge workflow/status evidence before reporting completion.
