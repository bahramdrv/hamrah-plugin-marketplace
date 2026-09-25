# Hamrah shared Community Signal store

Only validated, privacy-clean Signal Builder outputs belong here. Raw Telegram, forum, email, or applicant exports must not be committed.

Add datasets anywhere below `datasets/` with a `.json` extension. The publisher and deployed MCP server both inspect dataset text and locators for personal details. They index only schema-valid version 2 datasets with `quality_control.personal_identifiers_removed: true` **and** a privacy `pass` decision. A claimed redaction flag cannot override a `fail` or `needs_review` finding. Search coverage lists excluded files with field paths and finding rules, without repeating the private value.

The privacy decision includes audited exceptions for institution names and exact domain phrases. Review the reported field and source before correcting a finding; automatic detection can miss names or context. Remove private material from the candidate before rerunning the publication command.

Recommended publication command from the repository root:

```sh
python plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py \
  immigration_community_signals.json \
  --store-root plugins/hamrah/data/community-signals \
  --label telegram-de-student
```

Commit and push the generated `datasets/` file and `catalog.json`. Vercel deploys the repository revision; then refresh Hamrah in ChatGPT so it reloads the updated tool inventory. The runtime scans `datasets/` directly, so a stale or missing `catalog.json` cannot hide a valid dataset.
