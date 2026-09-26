# Hamrah agent guide

Hamrah is an MCP plugin that presents source-linked immigration evidence for Iranian applicants. Read `CONTEXT.md` for the domain vocabulary; each term lists aliases to avoid. Respect the decisions in `docs/adr/`.

## Where things are

- MCP server and tools: `plugins/hamrah/mcp/` (tool registry and dispatch in `server.mjs`; tests in `tests/`). The root `server.mjs` is the deployed app.
- Skills the MCP host follows: `plugins/hamrah/skills/`. The scorecard validator is Python: `plugins/hamrah/skills/hamrah-scorecard-engine/scripts/validate_scorecard.py`.
- Versioned policies shared by the JS tools and the Python validator: `plugins/hamrah/skills/hamrah-scorecard-engine/references/source_authority_policy.json` and the freshness policy beside it. Keep one copy.
- Published evidence: `plugins/hamrah/data/community-signals/` (`catalog.json` and immutable snapshots under `datasets/`). Evidence intake records: `docs/data-intake/`. Privacy review: `docs/dataset-privacy-review.md`.
- Work tracker: local files under `.scratch/<feature>/issues/NN-*.md`, each with a Blocked by line and Status. Work the tickets whose blockers are done.

## Checks

Run before every commit; CI (`.github/workflows/verify-release.yml`) runs the same set:

```bash
npm test
npm run verify:release
npm run check:static
python3 -m pytest -q plugins/hamrah/skills/hamrah-profile-normalizer/tests plugins/hamrah/skills/hamrah-scorecard-engine/tests plugins/hamrah/skills/hamrah-signal-builder/tests
```

`npm run verify:live` checks the deployed MCP endpoint; it only reflects a change after deployment.

## Rules that are easy to break

- Privacy fails closed (ADR 0001). Never widen `plugins/hamrah/mcp/reviewed-domain-phrases.json` to make a dataset pass; each phrase needs a dataset and field scope and a reason. Keep names, handles, phone numbers and contact links out of datasets.
- Missing evidence is missing coverage, not proof of no friction or of route closure. Never report full coverage when evidence was excluded.
- Official PASS or FAIL needs primary confirmation of every decisive requirement; Visa Atlas alone is trusted and gives at most POSSIBLE (ADR 0005).
- Community friction only lowers Practical Fit; it never feeds the Iranian Route Viability Index, thresholds, or route ranking (ADR 0004).
- Never present IRVI or community counts as a visa chance or approval probability.
- Academic program search and searches for people who took a route run only on the user's explicit request; program data comes from an API the user chooses (see `docs/hamrah-user-guide-fa.md`).

## Publishing evidence

Published snapshots are never edited. To change published answers, build a new version 4 candidate and publish it through `plugins/hamrah/mcp/community-publication.mjs` (CLI `publish candidate.json --store-root plugins/hamrah/data/community-signals --label <label> --now <ISO>`, or `publishCandidate`). IDs are content-derived, so the latest snapshot's published IDs can serve as candidate keys when republishing it with changes; keep `schema_version` and set `generated_at`. The privacy gate flags unreviewed title-case word pairs in claims, so rephrase rather than allowlist. Add a seed test in `plugins/hamrah/mcp/tests/community-seed.test.mjs`, update the matching review in `docs/data-intake/`, and run `npm run verify:release`.

## Working style

The product owner writes in Persian; reply in Persian. Use test-first changes at public seams (`executeTool` in `plugins/hamrah/mcp/server.mjs`, the dataset reader, the Python validator entry point). Commit to `main` only after the checks pass, and push only when asked.
