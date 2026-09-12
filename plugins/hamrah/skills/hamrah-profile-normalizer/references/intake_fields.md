# Hamrah Applicant Intake Fields

This reference describes the supported profile domains. Not every field is required for every applicant.

## 1. Identity and residence

Useful fields:
- age or date of birth
- nationality / citizenships
- current country of residence
- current immigration status
- country applying from

Do not infer nationality or citizenship from residence.

## 2. Household

Useful fields:
- marital/partner status
- accompanying partner
- dependants
- dependant ages
- whether partner plans to work/study

Unknown household information should remain `null`, not `false`.

## 3. Education

For each qualification:
- level
- field
- institution
- country
- start/end dates
- completion status
- GPA/value
- GPA scale
- honours/classification
- thesis/research component

Keep GPA on its original scale.

## 4. Language

For each language/test:
- language
- test name
- test type if relevant
- overall score
- component scores
- test date
- expiry date if known

Do not convert IELTS/PTE/TOEFL scores into one another.

## 5. Employment

For each role:
- job title
- occupation/functional area
- sector
- employer name if supplied
- country
- start/end dates
- full-time/part-time
- hours per week if supplied
- salary amount/currency/period if supplied
- main responsibilities
- sponsorship/job offer status

Preserve multiple roles rather than collapsing everything into one number.

## 6. Research and achievements

Potentially relevant to PhD, academic, research, and Global Talent routes:
- publications
- citation count
- h-index
- patents
- grants
- awards
- peer review
- invited talks
- major projects
- research leadership
- teaching
- recommendation/recommender information

Use `null` if unknown and `[]` if the applicant explicitly has none.

## 7. Professional profile

Potential fields:
- professional licences
- regulated-profession status
- skills assessments
- certifications
- memberships
- portfolio
- major professional achievements

## 8. Financial capacity

Potential fields:
- available migration/study budget
- currency
- source of funds
- annual income
- scholarship/funding status
- financial sponsor
- ability to pay deposits/fees

Do not convert currencies during normalization.

## 9. Immigration history

Potential fields:
- previous visas
- previous refusals
- overstays/breaches if explicitly supplied
- removals/deportations if explicitly supplied
- prior residence/study/work abroad

Do not assume "no refusal" merely because none was mentioned.

## 10. Optional admissibility declarations

Only store when explicitly supplied:
- criminal conviction declaration
- serious immigration breach declaration
- health-related admissibility concern declaration

Use tri-state values:
- true
- false
- null

Do not solicit detailed medical or criminal information unless a downstream route assessment actually requires it.

## 11. Goals

Potential fields:
- primary migration goal
- desired route types
- study level
- desired field
- target occupation
- long-term settlement goal
- target start date / migration timeline
- whether temporary residence is acceptable

## 12. Constraints

Potential fields:
- maximum budget
- hard deadline
- must work while studying
- cannot relocate alone
- travel/biometrics limitations
- cannot use third-country processing
- licensing constraints
- family constraints

## 13. Preferences

Preferences are stored separately from feasibility:
- preferred countries
- excluded countries
- climate/lifestyle preferences
- language preferences
- city size
- cultural proximity
- labour-market preference

Preferences must not alter factual eligibility data.

## 14. Missing-information principle

Do not ask for every field in this reference.

Prioritize:
1. information needed for the applicant's stated goal
2. information that can change route eligibility
3. information that can materially change route ranking
4. information needed to distinguish between two likely routes
