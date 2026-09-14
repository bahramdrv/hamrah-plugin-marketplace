---
name: hamrah
description: Guide a facilitator or applicant through Hamrah intake, profile normalization, current immigration-route screening, community context, scorecards, academic matching, and scorecard visuals; route raw community sources to the independent signal workflow.
---

# Hamrah

Read `references/workflow.md` first. It is the source of truth for routing and stage gates. When a facilitator relays another person's answers, also read `references/facilitator_operation.md`. Use `references/package_v1/index.md` to select the minimum additional reference from the supplied Hamrah Main GPT package. Match the user's language; use Persian for Persian input.

## Skill handoffs

Use the named Skill as the implementation contract for each output:

- Raw community evidence → `../hamrah-signal-builder/SKILL.md`; validate and optionally persist it in the signal store.
- Applicant facts → `../hamrah-profile-normalizer/SKILL.md`; its JSON is canonical.
- Current route evidence → `references/api_access.md` and `references/case_to_scorecard.md`; prefer the bundled Visa Atlas MCP tools.
- Immigration scorecard → `../hamrah-scorecard-engine/SKILL.md`, then `references/scorecard_presentation.md`.
- Academic program shortlist → `../hamrah-program-finder/SKILL.md`, after a relevant study/research route assessment.
- Shareable scorecard image → `../hamrah-scorecard-visualizer/SKILL.md`, after scorecard validation.

Track progress with `references/hamrah_state_schema.json`. Reevaluate only affected downstream outputs when facts change.

The supplied GPT instructions are preserved in `references/main_instructions.md`. This Skill and `references/workflow.md` resolve later capability additions. The Action contract was replaced by the bundled `visa-atlas` MCP server, which builds its tools from `references/visa_atlas_core_openapi.json`. Never say the standard Hamrah profile is unavailable while this Skill is active: intake and normalization work without live API access. If a live tool fails, continue the interview and keep only the affected eligibility or current-data claims UNKNOWN.
