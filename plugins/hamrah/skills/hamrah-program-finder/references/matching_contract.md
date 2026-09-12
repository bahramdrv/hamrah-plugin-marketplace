# Matching contract

Each result identifies the exact institution, degree/program title, degree level, field, country, official program URL, and check date. Verify separate official pages when program, admissions, tuition, scholarships, and deadlines are not co-located.

Match explicit profile facts and record prerequisites and unknowns as gaps. Keep these layers separate:

- `admission_fit`: academic background, GPA scale, prerequisite courses, research alignment, portfolio, and language.
- `affordability`: tuition currency/period, living-cost evidence, deposits, and applicant budget.
- `funding`: published terms and whether funding is guaranteed, competitive, unavailable, or unknown.
- `immigration_context`: connection to a previously assessed route; this is not a new eligibility decision.
- `preference_match`: stated preferences; this cannot change admission or immigration fit.

Deadline values require an intake/year and distinguish admission, scholarship, and supervisor-contact deadlines. For research degrees, record whether a supervisor is required and link to the department/faculty source; a faculty profile is not proof of an open position.

Use `program_matches_schema.json` as the output contract. Preserve unknown values as `null` and explain them in `gaps` or `warnings`.
