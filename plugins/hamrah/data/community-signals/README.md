# Hamrah shared Community Signal store

Only validated, privacy-clean Signal Builder outputs belong here. Raw Telegram, forum, email, or applicant exports must not be committed.

Add datasets anywhere below `datasets/` with a `.json` extension. The deployed MCP server discovers files recursively, validates them against the Signal Builder schema, and indexes only datasets with `schema_version: "2.0"` and `quality_control.personal_identifiers_removed: true`.

Recommended publication command from the repository root:

```sh
python plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py \
  immigration_community_signals.json \
  --store-root plugins/hamrah/data/community-signals \
  --label telegram-de-student
```

Commit and push the generated `datasets/` file and `catalog.json`. Vercel deploys the repository revision; then refresh Hamrah in ChatGPT so it reloads the updated tool inventory. The runtime scans `datasets/` directly, so a stale or missing `catalog.json` cannot hide a valid dataset.
