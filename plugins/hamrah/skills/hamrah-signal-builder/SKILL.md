---
name: hamrah-signal-builder
description: Use when immigration-related community sources such as JSON exports, forum threads, Reddit posts, URLs, pasted conversations, shared emails, or mixed evidence need to be converted into normalized Visa Atlas Community Signals.
---

# Hamrah Signal Builder

## Overview

Convert raw immigration community evidence into a small, structured, evidence-aware JSON dataset for downstream Visa Atlas analysis.

The skill extracts **practical signals**, not general chat summaries. Community evidence never becomes an official legal rule merely because it is repeated.

## When to Use

Use for:
- Telegram/WhatsApp/Discord/community JSON exports
- Reddit or immigration forum threads
- pasted conversations or shared emails
- URLs containing immigration experiences or operational updates
- mixed community + official-source material

Do **not** use this skill to:
- produce a user immigration scorecard
- recommend a country or university
- decide official eligibility
- estimate visa approval probability

## Required References

Read only the references needed for the task:

- `references/signal_taxonomy.md` — signal families/types
- `references/migration_routes.md` — normalized route codes and process stages
- `references/evidence_rules.md` — confidence, recency, contradiction, privacy, scoring
- `references/output_schema.json` — required output contract

Use `examples/gold_standard.json` when uncertain about how active, monitoring, and resolved signals should look.

## Workflow

1. **Inventory the source**
   - Identify source type, destination countries, date coverage, and record count.
   - Process the entire available source. If coverage is partial, mark it explicitly.

2. **Normalize evidence**
   - Follow reply/thread context where available.
   - Separate first-hand experience, shared direct email, admin guidance, rumor, question, and official notice.
   - Questions alone are not signals.

3. **Extract candidate signals**
   - Use the signal taxonomy.
   - Assign the narrowest supported country, applicant, route, process-stage, institution, and provider scope.

4. **Merge and deduplicate**
   - One underlying issue becomes one signal.
   - Count independent reporters, not raw message count.
   - Use `root_cause_id` and `correlated_signal_ids` for related issues.

5. **Check contradictions**
   - Search for successful counterexamples and later corrections.
   - Prefer newer authoritative evidence over older community claims.
   - Preserve meaningful contradictory evidence.

6. **Check resolution**
   - Search later evidence for reopening, normalization, restored access, or removal of a restriction.
   - Resolved and historical signals must have current fit adjustment `0`.

7. **Verify high-impact current claims**
   - When browsing is available, verify high/critical active signals using current primary sources.
   - If verification is unavailable, use `not_verified`; do not invent confirmation.

8. **Assign status and impact**
   - Follow `references/evidence_rules.md`.
   - Single anecdote normally stays `monitoring` with adjustment `0`.
   - Community adjustments are downside-only: `0, -5, -10, -15, -20`.
   - Do not double-count correlated penalties.

9. **Protect privacy**
   - Remove community member names, usernames, IDs, phone numbers, private emails, addresses, passport numbers, and application numbers.
   - Preserve anonymous message IDs only for traceability.

10. **Create output**
    - Write the result as `immigration_community_signals.json`.
    - For more than 5 destination countries or more than 200 final signals, also create country-specific files and a global index.

11. **Validate**
    - Run:
      `python scripts/validate_output.py immigration_community_signals.json`
    - Fix all errors before returning the dataset.
    - Warnings should be reviewed, not silently ignored.

12. **Persist when requested or when the workflow needs reusable signals**
    - Read `references/signal_store.md`.
    - Store only the validated, privacy-clean dataset with `scripts/store_signals.py`.
    - Default to the active workspace's `.hamrah/community-signals`; use a user-specified local or Git checkout path when supplied.
    - Return the stored dataset path and catalog path. Publishing a Git commit/push requires an explicit target and request.

## Non-Negotiable Rules

- Official eligibility and Community Signal are separate layers.
- Do not generalize one applicant, institution, employer, or city to a whole country.
- Do not infer approval rates from community samples.
- Positive evidence may resolve a negative signal but never creates a positive fit bonus.
- Never keep a resolved disruption active merely because older messages were severe.
- If the full source was not processed, never claim that no signal exists.

## Final Output

Return the generated JSON file. Keep any chat summary brief unless the user asks for analysis.
