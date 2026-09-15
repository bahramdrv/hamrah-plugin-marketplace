# Signal store

Store only a completed dataset that passes `scripts/validate_output.py` and has `quality_control.personal_identifiers_removed: true`. The store keeps immutable datasets plus a rebuildable `catalog.json`; scorecards consume matching records from this store, never raw community exports.

Default local location is `.hamrah/community-signals` under the active workspace. The facilitator may provide another explicit path. To share through GitHub, use a local checkout of the chosen repository as `--store-root`; the script writes portable files there. Commit and push only when the user explicitly requests publication and confirms the target repository. GitHub synchronization is not automatic.

For the Hamrah plugin repository, the shared production store is `plugins/hamrah/data/community-signals`. Its MCP server scans every `.json` file below `datasets/`, validates schema version 2.0 and privacy controls, and exposes valid records through `searchCommunitySignals` and `getCommunitySignalDataset`. A push to the connected main branch must deploy successfully before ChatGPT Web can read the new revision; refresh the Hamrah app after tool metadata changes.

Store a dataset:

```sh
python scripts/store_signals.py immigration_community_signals.json
```

Choose a store or label:

```sh
python scripts/store_signals.py immigration_community_signals.json --store-root /path/to/repo/community-signals --label telegram-iran
```

Publish into the Hamrah repository from its root:

```sh
python plugins/hamrah/skills/hamrah-signal-builder/scripts/store_signals.py immigration_community_signals.json --store-root plugins/hamrah/data/community-signals --label telegram-iran
```

Find candidate datasets for later scoring:

```sh
python scripts/query_signal_store.py --country-code DEU --route opportunity_card
```

Query output identifies dataset files and candidate signal IDs. Applicability still requires the Scorecard Engine's applicant, route, stage, entity, location, time, and condition checks. Re-run extraction with the full newer source when updating a dataset; stored historical copies provide auditability.
