# Hamrah shared Community Signal store

Only validated, privacy-clean Signal Builder outputs belong here. Raw Telegram, forum, email, or applicant exports must not be committed.

Add datasets anywhere below `datasets/` with a `.json` extension. The publisher and deployed MCP server both inspect dataset text and locators for personal details. They index schema-valid version 2 datasets with `quality_control.personal_identifiers_removed: true` **and** a privacy `pass` decision, version 3.0.0 datasets that match the installed contract (`skills/hamrah-signal-builder/references/community_signals_v3_schema.json`) with resolvable references and both a declared and an inspected privacy pass, and version 4.0.0 Community Datasets that pass the checks below. A version 3 file with extra fields or values outside that contract is reported as invalid rather than reinterpreted.

Each supported version is adapted to canonical internal artifacts with the version 4 field names (`plugins/hamrah/mcp/community-datasets.mjs`). Every artifact keeps its `source_schema_version`; a value the original schema cannot express, such as a version 2 content hash or a version 3 fit adjustment, stays `null` or `"unknown"`. `getCommunitySignalDataset` returns `signals` in the original schema and `canonicalSignals`, `evidence`, and `sources` in canonical form. A claimed redaction flag cannot override a `fail` or `needs_review` finding. Search coverage lists excluded files with field paths and finding rules, without repeating the private value.

A version 4.0.0 dataset (`skills/hamrah-signal-builder/references/community_dataset_v4_schema.json`, example `skills/hamrah-signal-builder/examples/v4_signal_dataset.json`) keeps Sources, Evidence, Signals, Questions, Academic Opportunities, Lived Experiences, and Route Claims in separate collections linked by IDs. `plugins/hamrah/mcp/community-dataset-v4.mjs` rejects the whole file when an ID is duplicated or a reference does not resolve; when evidence lacks `retrieved_at` or a `content_hash`; when a public source lacks an HTTPS locator or private-source evidence carries one; when a date is impossible or after `generated_at`; when any artifact's `validation` is not `validated` with privacy `pass`; or when privacy inspection does not pass. Stale and superseded artifacts remain in the file for history and are excluded from default search.

The privacy decision includes audited exceptions for institution names and exact domain phrases. Review the reported field and source before correcting a finding; automatic detection can miss names or context. Remove private material from the candidate before rerunning the publication command.

## Seeded German evidence

The first published dataset (`datasets/2026/09/20260925174655-de-study-opportunity-card-78f7f8bd21.json`) covers German study routes (`student_bachelor`, `student_masters_taught`, `student_masters_research`, `student_phd`) and the `opportunity_card`. It was retrieved on 2026-09-25 from Residence Act sections 2, 16b, and 20a (gesetze-im-internet.de), the Federal Foreign Office blocked-account page, and German embassy in Tehran notices, and published through the same command and gates as later data. Official rules are Route Claims; the embassy's restricted visa operation and the closed Iranian airspace are officially confirmed Signals for applicants resident in Iran, flagged for recheck by 2026-10-09. Every artifact links evidence with primary authority, an HTTPS URL, retrieval time, and a SHA-256 hash of the retrieved page. Facts the sources did not state, such as the study blocked-account amount and which Tehran waiting list covers the Opportunity Card, are recorded in the watchlist as unknown rather than claimed. Search for any other country or route reports `coverage.status: "no_coverage"`, which means missing coverage, not a closed route.

`searchCommunitySignals` also returns `routeClaimCoverage` (matching Route Claims by `countryCode`, route, process stage, and topic; a country name, origin, nationality, or entity filter cannot be checked against a claim, so claims are then not counted and the filter is listed in `notEvaluated`), and `getCommunitySignalDataset` returns each dataset's `routeClaims` with their evidence.

## Community Questions

Questions are published with the same command. A model may propose which phrasings belong to one Question by listing them as `variants`; publication then decides deterministically (`plugins/hamrah/mcp/community-questions.mjs`). Records whose normalized English canonical text and scope match receive the same stable ID and are merged, with variants, evidence, and seen dates combined; conflicting answer status, trend, Persian canonical text, or lifecycle stops publication. Each record's `independent_asker_count` must equal the number of distinct askers in its evidence, where posts in one independence group or with the same content hash count once, and the published count is recomputed after merging. The same wording assigned to two Questions with overlapping country and route scope is an unresolved merge and is refused as `needs_review`, as is any candidate that declares a `needs_review` validation state. The reader re-checks counts and ambiguity. `searchCommunityQuestions` and `getCommunityQuestion` read them, normalizing Persian letter variants, diacritics, digits, and punctuation.

## FAQ answers

A Question may list `answer_links` to Route Claims or Signals that answer, partially answer, or contradict it; links may name artifacts already published in another dataset, and publication refuses links that resolve nowhere. `answerCommunityQuestion` (`plugins/hamrah/mcp/community-answers.mjs`) takes the newest copy of each linked artifact and excludes it when it is missing, not current, out of the question's country or route scope, stale, or of unknown freshness. Route Claim freshness uses the scorecard's versioned fact-type policy (`official_rule` maps to `statutory_condition`) measured from the newest evidence retrieval; Signal freshness uses its `suggested_recheck_date`. An answer is `official` only when a remaining Route Claim has primary or trusted authority from a public HTTPS source; community contradiction then lowers confidence to medium, and an official contradiction makes it `unresolved`. Without an official rule, conflicting community support is `unresolved`, two or more independent public sources are `evidence_based`, and anything less is a `community_observation`; copies count once. Partial-only support is `partially_answered`, only-stale support is `outdated`, and no usable evidence is `research_required`. Each answer lists citations with authority, URL, retrieval time, and content hash, excluded links with reasons, a Persian explanation, and the last verification date. Pass `asOf` for reproducible freshness checks.

## Cross-dataset evidence

`searchCommunitySignals` returns `evidenceAggregation` for the requested scope across every valid dataset (`plugins/hamrah/mcp/community-aggregation.mjs`). Records that share a version 4 ID, content hash, normalized summary text, or message locator form one evidence cluster, so cross-posted copies are listed together with their source families, copy risk, and time window. Clusters are one independent report when a dataset declares a shared independence group or they cite the same URL. Only records linked from active, monitoring, or uncertain signals, and not superseded by newer evidence, count toward `currentSupport`; historical, stale, resolved, and superseded records stay in `clusters` with a `historicalReason`. Contradicting records are kept and counted separately, each signal reports its own `evidenceSupport`, and `datasetCoverage` names the matching datasets with their sources and coverage. Text matching is exact after normalization; paraphrased copies are not yet detected.

## Publishing version 4 evidence

Version 4 data is published only through the explicit command below, from the repository root. The candidate uses the version 4 layout with local keys as IDs (validation blocks are optional; a declared `needs_review` or non-`pass` state is refused):

```sh
node plugins/hamrah/mcp/community-publication.mjs publish candidate.json \
  --store-root plugins/hamrah/data/community-signals \
  --label telegram-de-student
```

`--store-root` is required. The report states `readerScans: true` only for this deployed store; any other root is a local store the deployed server never reads. Publication runs the normalization, deduplication, privacy, provenance, evidence, contradiction, and schema gates, printing each failure as `[gate] message` and writing nothing when any gate fails. Artifact IDs are SHA-256 digests of normalized identity fields (source locator or family, content hash, country, routes, claim or question text, event date, and entity as applicable), so re-importing the same material yields the same IDs, and re-importing unchanged content is a no-op. Each changed import adds a new immutable snapshot under `datasets/`; search uses the newest copy of each signal, so a later `superseded` or `resolved` snapshot hides the older current one.

To withdraw an artifact or a whole snapshot after a later review, append to the ledger:

```sh
node plugins/hamrah/mcp/community-publication.mjs withdraw \
  --store-root plugins/hamrah/data/community-signals \
  --artifact evd_<id> --reason privacy --note "Direct identifier found."
```

Use `--dataset <datasetId>` for a whole snapshot. Reasons are `privacy`, `incorrect`, `superseded`, or `other`. `withdrawals.json` is append-only and published snapshots are never rewritten; the server removes withdrawn artifacts from search and retrieval, drops a signal left with no evidence, and fails closed if the ledger is unreadable. Because Git keeps history, a privacy withdrawal hides content from Hamrah but does not erase it from the repository.

Version 2 and version 3 datasets can still be stored with `skills/hamrah-signal-builder/scripts/store_signals.py`, which refuses version 4 input. Commit and push the generated `datasets/` file, `catalog.json`, and any `withdrawals.json` change. Vercel deploys the repository revision; then refresh Hamrah in ChatGPT so it reloads the updated tool inventory. The runtime scans `datasets/` directly, so a stale or missing `catalog.json` cannot hide a valid dataset.
