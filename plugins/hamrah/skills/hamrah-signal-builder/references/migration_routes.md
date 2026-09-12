# Visa Atlas Migration Route Taxonomy

Use the most specific route code supported by the source.  
If exact route is unknown, use the broader route family and do not guess.

---

## 1. Study / Academic

Route family: `STUDY / ACADEMIC`

Codes:

- `student_secondary`
- `student_language`
- `student_vocational`
- `student_bachelor`
- `student_masters_taught`
- `student_masters_research`
- `student_phd`
- `exchange_student`
- `research_visitor`
- `postdoc`
- `academic_researcher`
- `scholarship_route`
- `post_study_work`

Typical process stages:

- `university_search`
- `supervisor_contact`
- `eoi`
- `admission`
- `scholarship`
- `offer`
- `deposit`
- `cas`
- `coe`
- `i20`
- `visa_application`
- `financial_evidence`
- `medical`
- `biometrics`
- `interview`
- `security_checks`
- `visa_decision`
- `travel`
- `arrival`

---

## 2. Employment / Work

Route family: `EMPLOYMENT / WORK`

Codes:

- `employer_sponsored_work`
- `skilled_worker`
- `shortage_occupation`
- `points_based_skilled`
- `regional_skilled`
- `provincial_or_state_nomination`
- `healthcare_worker`
- `tech_worker`
- `global_talent`
- `intra_company_transfer`
- `seasonal_worker`
- `temporary_worker`
- `job_seeker`
- `opportunity_card`
- `graduate_work`
- `domestic_worker`
- `religious_worker`
- `volunteer_worker`

Typical process stages:

- `job_search`
- `employer_screening`
- `sponsorship`
- `nomination`
- `certificate_of_sponsorship`
- `points_assessment`
- `skills_assessment`
- `licensing`
- `visa_application`
- `financial_evidence`
- `medical`
- `biometrics`
- `security_checks`
- `visa_decision`
- `travel`
- `arrival`

---

## 3. Business / Entrepreneurship / Capital

Route family: `BUSINESS / ENTREPRENEURSHIP`

Codes:

- `startup`
- `entrepreneur`
- `innovator`
- `self_employed`
- `freelancer`
- `digital_nomad`
- `investor`
- `business_owner`
- `passive_income`
- `retirement`

Typical process stages:

- `business_plan`
- `endorsement`
- `incubator`
- `investment_transfer`
- `source_of_wealth`
- `company_registration`
- `business_banking`
- `visa_application`
- `residence_registration`

---

## 4. Family / Dependants

Route family: `FAMILY / DEPENDANTS`

Codes:

- `spouse_partner`
- `fiance`
- `child`
- `parent`
- `dependent`
- `family_reunification`
- `accompanying_family`
- `adoption`

Typical process stages:

- `relationship_evidence`
- `sponsorship`
- `financial_evidence`
- `family_documents`
- `visa_application`
- `biometrics`
- `interview`
- `visa_decision`
- `arrival`

---

## 5. Permanent / Long-term Migration

Route family: `PERMANENT / LONG-TERM`

Codes:

- `permanent_residence_skilled`
- `permanent_residence_employer`
- `long_term_residence`
- `settlement`
- `ancestry_descent`
- `citizenship_path`
- `regularization`

Typical process stages:

- `eligibility`
- `points_assessment`
- `nomination`
- `invitation`
- `permanent_residence_application`
- `residence_requirement`
- `settlement`
- `citizenship`

---

## 6. Humanitarian / Protection

Route family: `HUMANITARIAN / PROTECTION`

Codes:

- `asylum`
- `refugee`
- `humanitarian`
- `resettlement`
- `temporary_protection`
- `special_humanitarian_program`
- `family_reunification_protection`

Typical process stages:

- `access`
- `registration`
- `interview`
- `documentation`
- `reception`
- `decision`
- `resettlement`
- `family_reunification`

---

## 7. Mobility / Other

Route family: `MOBILITY / OTHER`

Codes:

- `working_holiday`
- `youth_mobility`
- `au_pair`
- `cultural_exchange`
- `visitor`
- `transit`
- `medical_visa`
- `diplomatic_official`
- `other`

---

## Route-tagging rules

1. Tag only routes actually affected by the evidence.
2. Do not tag all routes because a country is mentioned.
3. If an operational issue affects all visa categories, use all relevant routes or `other_conditions` to state the broad scope.
4. A university-specific student signal must not be applied to work routes.
5. A work-sponsorship issue must not be applied to study routes.
6. If a route-specific official name exists, preserve it in `other_conditions` or `entities` even when the normalized route code is broader.

---

## Applicant scope examples

Examples of narrow, correct scopes:

- Iranian nationals applying from Iran
- applicants physically in Iran regardless of nationality
- PhD applicants needing ATAS
- applicants using Tehran VAC
- healthcare workers needing local registration
- digital-technology Global Talent applicants
- users dependent on a specific payment provider
- applicants to a named university
