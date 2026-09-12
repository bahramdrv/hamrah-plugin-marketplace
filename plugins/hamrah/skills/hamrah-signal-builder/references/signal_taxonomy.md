# Visa Atlas Signal Taxonomy

This reference defines the normalized taxonomy for immigration Community Signals.

## Core rule

A signal is a repeated, specific, credible, or materially important observation that can affect immigration feasibility, execution, timing, cost, risk, selection, or route ranking.

A Community Signal is **not** automatically an official rule.

Positive evidence may resolve or weaken an earlier negative signal, but should not create a positive eligibility bonus.

---

## 1. Policy / Regulatory Implementation

Use for changes or implementation effects around immigration policy.

Signal types:

- `policy_implementation`
- `quota_pressure`
- `program_pause`
- `invitation_slowdown`
- `draw_pattern_change`
- `nomination_constraint`
- `enforcement_change`
- `transition_problem`
- `nationality_restriction`
- `regional_rule_variation`

Examples:
- a provincial program temporarily pauses nominations
- a new rule causes transition-period confusion
- invitation frequency drops materially
- a formally announced change is not yet operational

---

## 2. Application / Processing

Use for real-world case-processing behavior.

Signal types:

- `processing_delay`
- `processing_acceleration`
- `backlog`
- `security_check_delay`
- `administrative_processing`
- `interview_delay`
- `additional_information_request`
- `document_verification_delay`
- `case_transfer`
- `decision_batching`
- `reconsideration_pattern`

Examples:
- repeated 8–12 week delays where official baseline is shorter
- repeated mandatory/security checks
- cases moving in batches

---

## 3. Approval / Refusal / Adjudication

Use only for observed adjudication patterns, not inferred approval probabilities.

Signal types:

- `refusal_pattern`
- `approval_pattern`
- `credibility_scrutiny`
- `financial_scrutiny`
- `intent_scrutiny`
- `travel_history_scrutiny`
- `ties_scrutiny`
- `field_scrutiny`
- `nationality_scrutiny`
- `dependent_scrutiny`

Never convert community samples into approval rates unless the sample denominator and methodology are reliable.

---

## 4. Embassy / Consulate / VAC / Biometrics

Always distinguish:
**Embassy ≠ Consulate ≠ Visa Application Centre ≠ Immigration Authority**

Signal types:

- `embassy_status`
- `consulate_status`
- `vac_status`
- `biometrics_access`
- `appointment_availability`
- `passport_submission`
- `passport_return`
- `third_country_processing`
- `service_relocation`
- `priority_service_availability`

Examples:
- VAC closure/reopening
- biometrics requiring travel to another country
- appointment scarcity

---

## 5. Digital Systems / Portals

Signal types:

- `portal_outage`
- `portal_bug`
- `appointment_system_issue`
- `upload_problem`
- `payment_portal_problem`
- `account_access_problem`
- `digital_identity_problem`
- `evisa_system_issue`

---

## 6. Documents / Evidence

Signal types:

- `document_access`
- `document_verification`
- `translation_issue`
- `legalization_issue`
- `apostille_issue`
- `police_certificate_issue`
- `military_document_issue`
- `academic_document_issue`
- `employment_evidence_issue`
- `financial_document_issue`

---

## 7. Language / Testing / Professional Exams

Signal types:

- `language_test_access`
- `standardized_test_access`
- `score_reporting_issue`
- `licensing_exam_access`
- `professional_exam_delay`
- `test_provider_restriction`

Examples:
- TOEFL/GRE suspended in a country
- score reporting restricted
- licensing exam unavailable locally

---

## 8. Medical / Insurance

Signal types:

- `medical_exam_access`
- `medical_processing_delay`
- `vaccination_document_issue`
- `health_insurance_access`
- `insurance_restriction`
- `medical_admissibility_delay`

---

## 9. Money / Banking / Sanctions / Payments

Signal types:

- `payment_restriction`
- `sanctions_friction`
- `banking_restriction`
- `visa_fee_payment_issue`
- `tuition_payment_issue`
- `deposit_payment_issue`
- `proof_of_funds_practical_issue`
- `source_of_funds_scrutiny`
- `refund_problem`
- `foreign_exchange_issue`

Examples:
- payment provider blocks Iran-linked transactions
- university offers no alternative payment path
- repeated refund delays

---

## 10. Employer / Sponsor / Labour Market

Signal types:

- `employer_reluctance`
- `sponsor_availability`
- `sponsorship_delay`
- `job_offer_withdrawal`
- `visa_timeline_reluctance`
- `in_country_candidate_preference`
- `salary_market_mismatch`
- `occupation_demand_change`
- `employer_nationality_friction`

Examples:
- employers unwilling to wait for visa processing
- sponsor availability decreases
- preference for applicants already in-country

---

## 11. University / College / Academic Institution

Signal types:

- `institution_nationality_friction`
- `offer_withdrawal`
- `visa_document_delay`
- `cas_delay`
- `coe_delay`
- `i20_delay`
- `precas_screening`
- `admission_delay`
- `eoi_delay`
- `deposit_risk`
- `refund_risk`
- `practical_gpa_screen`
- `scholarship_competitiveness`
- `supervisor_availability`
- `supervisor_reluctance`
- `deferment_risk`
- `tuition_before_document`

Institution-specific claims must not be generalized to a whole country.

---

## 12. Research / PhD / Postdoc

Signal types:

- `research_supervisor_reluctance`
- `research_security_clearance`
- `technology_clearance_delay`
- `sensitive_field_friction`
- `export_control_friction`
- `fixed_start_funding_risk`
- `scholarship_expiry_risk`

---

## 13. Licensing / Credential Recognition

Signal types:

- `credential_assessment_delay`
- `credential_recognition_issue`
- `professional_licensing_delay`
- `licensing_exam_bottleneck`
- `supervised_practice_bottleneck`
- `regional_licensing_variation`

---

## 14. Travel / Border / Transport

Signal types:

- `airspace_disruption`
- `flight_disruption`
- `border_disruption`
- `transit_problem`
- `courier_problem`
- `travel_to_biometrics_problem`
- `airline_document_issue`

---

## 15. Geopolitical / Security / Diplomatic

Signal types:

- `geopolitical_disruption`
- `sanctions_operational_impact`
- `heightened_security_screening`
- `diplomatic_disruption`
- `embassy_staff_reduction`
- `conflict_related_processing_change`

---

## 16. Housing / Settlement / Arrival

Only extract when it materially affects immigration feasibility or execution.

Signal types:

- `housing_access`
- `accommodation_requirement`
- `arrival_registration_delay`
- `residence_card_delay`
- `newcomer_banking_access`
- `post_arrival_document_delay`

---

## 17. Family / Dependants

Signal types:

- `dependent_processing_delay`
- `spouse_work_rights_friction`
- `family_document_issue`
- `family_reunification_delay`
- `dependent_refusal_pattern`
- `child_access_issue`

---

## 18. Entrepreneur / Startup / Investor / Self-employed

Signal types:

- `endorsement_bottleneck`
- `incubator_access`
- `investment_transfer_issue`
- `source_of_wealth_scrutiny`
- `company_registration_issue`
- `business_banking_issue`
- `practical_revenue_requirement`
- `self_employment_execution_issue`

---

## 19. Humanitarian / Asylum / Protection

Signal types:

- `asylum_access`
- `protection_registration_delay`
- `reception_capacity`
- `humanitarian_document_issue`
- `protection_family_reunification_delay`
- `temporary_protection_implementation`
- `resettlement_backlog`

Do not infer protection eligibility from community discussion.

---

## 20. Agents / Fraud / Scams / Intermediaries

Signal types:

- `agent_fraud`
- `sponsor_scam`
- `job_offer_scam`
- `admission_scam`
- `appointment_resale`
- `document_fraud_risk`
- `refund_scam`

Extract only when materially relevant and sufficiently evidenced.

---

## 21. Practical Profile / Selection Signals

These are real-world selection patterns that may be stricter than formal minimum requirements.

Signal types:

- `practical_gpa_threshold`
- `practical_age_competitiveness`
- `practical_experience_threshold`
- `practical_research_threshold`
- `practical_language_threshold`
- `practical_points_competitiveness`
- `occupation_competitiveness`
- `profile_selection_pattern`

These are not official requirements unless verified officially.

---

## 22. Positive / Resolution Signals

Use these only to resolve, weaken, or contextualize earlier negative claims.

Signal types:

- `reopening`
- `normalization`
- `successful_counterexample`
- `resumed_processing`
- `restored_service`
- `restriction_removed`

Positive resolution signals should not create positive fit bonuses.

---

## Signal classes

Use one:

- `official_implementation`
- `operational`
- `processing`
- `adjudication`
- `market_behavior`
- `institution`
- `practical_selection`
- `financial`
- `testing`
- `travel`
- `geopolitical`
- `settlement`
- `fraud`
- `other`

## Impact direction

Use one:

- `negative`
- `positive_resolution`
- `mixed`
- `neutral`

## Status

Use one:

- `active`
- `monitoring`
- `uncertain`
- `resolved`
- `historical`

## Trend

Use one:

- `worsening`
- `stable`
- `improving`
- `resolved`
- `unknown`

## Severity

Use one:

- `low`
- `moderate`
- `high`
- `critical`

## Confidence

Use one:

- `low`
- `medium`
- `high`
