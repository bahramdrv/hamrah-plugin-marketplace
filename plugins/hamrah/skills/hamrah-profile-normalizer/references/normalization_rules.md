# Hamrah Profile Normalization Rules

## 1. Unknown vs explicit negative

This distinction is mandatory.

- `null` = not known / not provided
- `false` = applicant explicitly said no
- `true` = applicant explicitly said yes
- `[]` = applicant explicitly said none for a list
- non-empty array = one or more explicit items

Examples:

Applicant says nothing about visa refusals:
```json
"previous_refusals": null
```

Applicant says "I have never had a visa refusal":
```json
"previous_refusals": []
```

Applicant says "I do not have publications":
```json
"publications": []
```

No publication information provided:
```json
"publications": null
```

## 2. Dates

Prefer ISO formats when enough information is supplied:

- exact date: `YYYY-MM-DD`
- month known: `YYYY-MM`
- year only: `YYYY`

Do not fabricate day/month values.

## 3. Age

If exact date of birth is provided, store it.

If only age is provided:
- store `age`
- leave `date_of_birth` null

Do not reverse-engineer an exact birth date.

## 4. Education

Normalize degree levels to:

- `secondary`
- `diploma`
- `associate`
- `bachelor`
- `postgraduate_diploma`
- `masters`
- `doctorate`
- `professional_degree`
- `other`

Examples:
- BSc/BA/BEng → `bachelor`
- MSc/MA/MEng → `masters`
- PhD/DPhil → `doctorate`

Store the original label in `source_label` when available.

## 5. GPA

Always preserve:
- value
- scale

Example:
```json
"gpa": {
  "value": 17.8,
  "scale": 20,
  "classification": null
}
```

Never normalize to 4.0 or percentages in this skill.

## 6. Language tests

Normalize common test names:
- IELTS Academic / General → `IELTS`
- TOEFL iBT → `TOEFL`
- PTE Academic → `PTE`
- CELPIP → `CELPIP`
- TEF Canada → `TEF`
- TCF Canada → `TCF`

Preserve test subtype in `test_type`.

Store components separately where supplied.

Do not infer component scores from overall score.

## 7. Employment

Keep each role separately.

Do not infer:
- occupation code
- NOC/SOC/ANZSCO code
- regulated-profession status
- full-time equivalency

unless an authoritative downstream classifier explicitly performs that task.

If total work years are supplied without role dates, store the explicit total in `declared_total_years` and do not fabricate job dates.

## 8. Money

Store:
- amount
- currency
- period if relevant

Do not convert currencies.

Do not assume all available assets are liquid proof of funds.

## 9. Country names

Normalize country names to common English short names where unambiguous.

Examples:
- UK → United Kingdom
- UAE → United Arab Emirates
- US/USA → United States

Do not infer nationality from country of residence.

## 10. Relationship status

Normalize only explicit statements.

Suggested values:
- `single`
- `married`
- `partnered`
- `engaged`
- `divorced`
- `widowed`
- `other`
- null

Do not infer accompanying status from marital status.

## 11. Goals vs preferences

Facts:
- current nationality
- education
- budget
- work experience

Goals:
- "I want permanent residence"
- "I want a PhD"

Preferences:
- "I prefer Germany"
- "I dislike cold climates"

Keep these separate.

## 12. Inferences

Unsupported inference is prohibited.

Allowed normalization is deterministic label mapping, not inference.

If a non-trivial interpretation is unavoidable:
- keep the target field `null`
- record it under `ambiguities`
- propose one clarification question

## 13. Contradictions

When two explicit facts conflict:
- do not silently pick one
- set the affected normalized field to `null` when necessary
- record both claims under `contradictions`
- ask one clarifying question

## 14. Sensitive declarations

Criminal, medical, and immigration-breach declarations:
- store only if explicitly volunteered or specifically requested for a route
- keep as tri-state
- avoid unnecessary detail
- never infer
