# Visa Atlas Signal Builder — Package Notes

Required runtime entry point:
- `SKILL.md`

References:
- `references/signal_taxonomy.md`
- `references/migration_routes.md`
- `references/evidence_rules.md`
- `references/output_schema.json`

Example:
- `examples/gold_standard.json`

Utilities:
- `scripts/validate_output.py`
- `scripts/make_compact.py`

Tests:
- `tests/test_validate_output.py`
- `tests/fixtures/`

Recommended workflow:
1. Install/upload the folder as one skill package.
2. Give the skill raw immigration community sources as task inputs.
3. Have it create `immigration_community_signals.json`.
4. Validate the output with `scripts/validate_output.py`.
5. Optionally create a smaller retrieval copy with `scripts/make_compact.py`.

The full signal file is evidence-rich. The compact file is intended for downstream Visa Atlas Advisor retrieval.
