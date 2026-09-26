# Hamrah Signal Builder — Package Notes

Canonical output is Community Signals schema v3 (`schema_version: 3.0.0`).

Required runtime entry point: `SKILL.md`.
References include taxonomy, migration routes, evidence rules, and `references/output_schema.json`.

Required workflow:
1. Build `immigration_community_signals.json` in v3 form.
2. Run `python scripts/validate_output.py immigration_community_signals.json` and require exit code 0.
3. Persist reusable output only through `scripts/store_signals.py`, which validates again and requires privacy status `pass`.

Legacy v2 datasets may be read by Hamrah's explicit compatibility migrator, but Signal Builder MUST NOT create new v2/candidate outputs.
