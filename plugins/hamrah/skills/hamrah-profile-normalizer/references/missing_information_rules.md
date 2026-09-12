# Hamrah Missing Information Rules

The normalizer should identify missing information without turning intake into a long fixed questionnaire.

## Importance levels

Use:

- `critical` — initial screening cannot responsibly proceed without it
- `high` — likely to change eligibility or route ranking
- `medium` — useful for refining results
- `low` — optional detail; usually do not ask during first intake

## Baseline critical fields

For a general immigration scorecard, the following are normally critical:

- age or date of birth
- nationality/citizenship
- current country of residence
- highest education level
- field of education
- approximate work experience
- language ability/test status
- available budget or broad budget range
- primary migration goal

If the user has already selected a specific route, only ask for fields relevant to that route.

## Route-family additions

### Study / Academic
High-value fields:
- target study level
- field
- latest GPA + scale
- language test
- budget
- desired intake/timeline

For PhD/research:
- research experience
- publications
- thesis
- supervisor/offer status
- funding requirement

### Skilled / Employer-sponsored Work
High-value fields:
- exact current/recent job title
- years of relevant experience
- responsibilities
- language
- degree
- licence/registration where relevant
- existing job offer/sponsor status

### Points-based skilled migration
High-value fields:
- age
- language component scores
- education
- skilled work duration
- occupation
- partner profile where the system awards partner points
- skills assessment status

### Global Talent / Research Talent
High-value fields:
- field
- publications
- citations
- patents/grants/awards
- leadership/impact
- recommendation/recommender profile
- academic/professional seniority

### Startup / Entrepreneur / Investor
High-value fields:
- business ownership/leadership
- available capital
- source of funds
- business track record
- business model
- target market
- investment transfer constraints

### Family
High-value fields:
- relationship type
- sponsor status
- sponsor country/status
- relationship evidence stage
- dependant information
- financial requirement context where relevant

## Prioritization algorithm

When building `missing_information`:

1. Start with the applicant's stated goal.
2. Identify the 2–5 most likely route families.
3. Ask only for information that can materially change screening.
4. Prefer one question that fills multiple route gaps.
5. Do not ask more than 5 high/critical follow-up questions at once.
6. Mark lower-priority missing fields in JSON but do not necessarily surface them to the user.

## Intake status

### ready_for_initial_screening
Enough reliable information exists for a first-pass multi-route assessment.

### needs_more_information
Some screening is possible, but one or more critical/high fields are missing.

### insufficient_for_screening
Core identity/profile facts are too incomplete to produce a responsible initial scorecard.

This status describes data completeness only.
