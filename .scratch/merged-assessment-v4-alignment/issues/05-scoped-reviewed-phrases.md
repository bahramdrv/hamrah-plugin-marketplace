# 05: Reviewed privacy phrases are scoped, justified and auditable

**What to build:** A privacy reviewer can see, for every phrase exempted from the full-name detector, which dataset and field it applies to and why it was accepted. A phrase accepted for one dataset no longer masks the same text elsewhere. Source: Spec review finding 4 and the missing per-phrase audit; Standards finding 3; spec ("Whitelists are narrow, field-specific, justified, and auditable"); ADR 0001.

**Blocked by:** 01 — Legacy datasets keep only what their sources said (both change the legacy privacy path)

**Status:** ready-for-agent

- [ ] Each reviewed phrase records the dataset(s), field path pattern(s), a reason, and a review date.
- [ ] A reviewed phrase appearing in a dataset or field outside its scope is still reported as `needs_review`.
- [ ] Phrases that are only capitalised sentence openings are removed from the list or justified individually; phrases that look like personal names carry an explicit reason.
- [ ] The national-number exception is documented with its rationale next to the rule.
- [ ] `npm run verify:release` still passes with all published datasets accepted, or any newly held dataset is recorded with its disposition in `docs/dataset-privacy-review.md`.
