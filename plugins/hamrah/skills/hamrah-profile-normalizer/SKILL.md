---
name: hamrah-profile-normalizer
description: Use when a person's free-text immigration intake answers, questionnaire responses, notes, or mixed profile information need to be converted into a normalized Hamrah applicant profile with explicit missing information and ambiguities.
---

# Hamrah Applicant Profile Normalizer

## Overview

Convert raw applicant answers into a normalized, route-neutral Applicant Profile JSON for downstream Hamrah scoring.

This skill **does not** decide immigration eligibility, rank countries, score routes, or recommend universities. It standardizes facts and identifies what is missing.

## Required References

Use these files as the contract:

- `references/applicant_profile_schema.json` — required JSON structure
- `references/intake_fields.md` — supported profile domains
- `references/normalization_rules.md` — how to normalize facts without guessing
- `references/missing_information_rules.md` — how to identify and prioritize missing information

Use examples when uncertain:
- `examples/academic_profile.json`
- `examples/skilled_worker_profile.json`
- `examples/incomplete_profile.json`

## Core Rules

1. **Never invent applicant facts.**
2. `null` means **unknown / not provided**.
3. `false` means the applicant explicitly said **no**.
4. `[]` means the applicant explicitly indicated **none** for that list.
5. Preserve original measurement scales where relevant:
   - GPA value + GPA scale
   - test overall + component scores
   - money amount + currency
6. Normalize obvious labels only when meaning is unambiguous:
   - MSc → masters
   - PhD → doctorate
   - IELTS Academic → IELTS
7. Do not convert GPA, language score, salary, or currency unless explicitly requested by a downstream tool.
8. Do not infer nationality from language, location, university, name, or phone number.
9. Do not infer relationship status, dependants, refusals, criminal history, medical issues, finances, or immigration history.
10. Keep preference data separate from feasibility facts.
11. Sensitive declarations are optional and user-supplied only.

## Workflow

### 1. Parse the supplied intake
Identify explicit facts about:
- identity and residence
- household
- education
- language
- employment
- research and achievements
- professional licensing/certifications
- finances/funding
- immigration history
- goals
- constraints
- country/route preferences

### 2. Normalize facts
Map explicit information into the schema.

Where a source phrase is normalized, record the transformation in `normalization_log` if the normalized value is not obvious from the output alone.

### 3. Detect ambiguity
If two interpretations are plausible, do not choose one silently.

Add an item to `ambiguities` with:
- `field_path`
- `issue`
- `possible_values`
- `suggested_question`

### 4. Detect contradictions
If supplied answers conflict, keep the safest neutral field value as `null` and record the conflict in `contradictions`.

### 5. Identify missing information
Use `references/missing_information_rules.md`.

Each missing item must include:
- field path
- importance
- reason
- affected route families
- one concise suggested question

Do not ask for every possible field. Prioritize only information that materially affects initial route screening or the applicant's stated goal.

### 6. Set intake status
Use one:

- `ready_for_initial_screening`
- `needs_more_information`
- `insufficient_for_screening`

This is a **data completeness status**, not an immigration outcome.

### 7. Validate
Run:

`python scripts/validate_profile.py applicant_profile.json`

Fix all validation errors before returning the profile.

## Output

Default output filename:

`applicant_profile.json`

Return the JSON file and, if requested, a short list of the highest-priority missing questions.

Do not produce an immigration scorecard in this skill.
