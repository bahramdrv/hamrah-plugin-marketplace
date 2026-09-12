# Hamrah Applicant Profile Normalizer — Package Notes

Purpose:
Convert free-text immigration intake into a normalized Applicant Profile JSON.

This skill does NOT:
- determine official eligibility
- score routes
- recommend countries
- recommend universities
- apply community penalties

Main output:
`applicant_profile.json`

Key conventions:
- `null` = unknown/not provided
- `false` = explicit no
- `[]` = explicitly none
- original GPA/test/currency scales are preserved

Files:
- `SKILL.md`
- `references/applicant_profile_schema.json`
- `references/intake_fields.md`
- `references/normalization_rules.md`
- `references/missing_information_rules.md`
- `examples/academic_profile.json`
- `examples/skilled_worker_profile.json`
- `examples/incomplete_profile.json`
- `scripts/validate_profile.py`
- `tests/`

Recommended product flow:
User → Scorecard GPT → raw answers → this Skill → applicant_profile.json → route/score engine.
