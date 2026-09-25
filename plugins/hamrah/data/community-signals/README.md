# Hamrah shared Community Signal store

Only validated, privacy-clean Signal Builder outputs belong here. Raw Telegram, forum, email, or applicant exports must not be committed.

Add datasets anywhere below `datasets/` with a `.json` extension. The publisher and deployed MCP server both inspect dataset text and locators for personal details. They index schema-valid version 2 datasets with `quality_control.personal_identifiers_removed: true` **and** a privacy `pass` decision, version 3.0.0 datasets that match the installed contract (`skills/hamrah-signal-builder/references/community_signals_v3_schema.json`) with resolvable references and both a declared and an inspected privacy pass, and version 4.0.0 Community Datasets that pass the checks below. A version 3 file with extra fields or values outside that contract is reported as invalid rather than reinterpreted.

Each supported version is adapted to canonical internal artifacts with the version 4 field names (`plugins/hamrah/mcp/community-datasets.mjs`). Every artifact keeps its `source_schema_version`; a value the original schema cannot express, such as a version 2 content hash or a version 3 fit adjustment, stays `null` or `"unknown"`. `getCommunitySignalDataset` returns `signals` in the original schema and `canonicalSignals`, `evidence`, and `sources` in canonical form. A claimed redaction flag cannot override a `fail` or `needs_review` finding. Search coverage lists excluded files with field paths and finding rules, without repeating the private value.

A version 4.0.0 dataset (`skills/hamrah-signal-builder/references/community_dataset_v4_schema.json`, example `skills/hamrah-signal-builder/examples/v4_signal_dataset.json`) keeps Sources, Evidence, Signals, Questions, Academic Opportunities, Lived Experiences, and Route Claims in separate collections linked by IDs. `plugins/hamrah/mcp/community-dataset-v4.mjs` rejects the whole file when an ID is duplicated or a reference does not resolve; when evidence lacks `retrieved_at` or a `content_hash`; when a public source lacks an HTTPS locator or private-source evidence carries one; when a date is impossible or after `generated_at`; when any artifact's `validation` is not `validated` with privacy `pass`; or when privacy inspection does not pass. Stale and superseded artifacts remain in the file for history and are excluded from default search.

The privacy decision includes audited exceptions for institution names and exact domain phrases. Review the reported field and source before correcting a finding; automatic detection can miss names or context. Remove private material from the candidate before rerunning the publication command.

Recommended publication command from the repository root:

```sh
python plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py \
  immigration_community_signals.json \
  --store-root plugins/hamrah/data/community-signals \
  --label telegram-de-student
```

Commit and push the generated `datasets/` file and `catalog.json`. Vercel deploys the repository revision; then refresh Hamrah in ChatGPT so it reloads the updated tool inventory. The runtime scans `datasets/` directly, so a stale or missing `catalog.json` cannot hide a valid dataset.
