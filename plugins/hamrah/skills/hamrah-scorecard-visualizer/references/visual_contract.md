# Visual contract

Create JSON matching `scorecard_visual_schema.json`. The 1600×2000 card is suitable for screen sharing and export. Select up to three routes in validated ranking order. A requested blocked route may replace a ranked route when a facilitator needs to explain it, with its official status visible.

Every route shows country and route, official status, Base Fit, Community Adjustment, Practical Fit, confidence, up to two reasons, one blocker/warning, and one next action. Use `null` for unscored values. UNKNOWN and FAIL routes remain unranked.

Use the scorecard presentation language and concise text. The footer states that fit scores are not visa approval probabilities and time-sensitive requirements need current official verification.

## ChatGPT image-generation prompt

Use case: `infographic-diagram`. Asset type: portrait immigration scorecard. Ask for a restrained, trustworthy editorial infographic with the Hamrah blue palette, strong hierarchy, generous spacing, and clearly separated route cards. Supply every visible string from the validated JSON as verbatim text. Require the exact numeric scores and status labels, no invented logos, seals, flags, statistics, people, passports, or decorative legal symbols. State that missing values display as an em dash and FAIL/UNKNOWN routes must not look recommended.

Inspect at full resolution. Compare every visible route name, status, number, blocker, and next action against the JSON. A mismatch requires a targeted retry; after two failed text-accuracy attempts, use the deterministic SVG renderer.
