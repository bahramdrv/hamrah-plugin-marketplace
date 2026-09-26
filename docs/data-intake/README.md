# Community Signals source intake

The [Opportunity Card question review CSV](opportunity-card-question-review.csv) is a review queue, not published product data. Its five rows come from evidence references in the existing Germany Opportunity Card version 3 dataset. The current records contain redacted summaries and message IDs; they do not contain enough of the original question and reply chain to publish a version 4 `questions` record faithfully.

For each row, find the original Telegram message by `message_id` and supply the question, parent message, and relevant replies in de-identified form. Keep message IDs, dates, a stable pseudonymous asker key for counting independent askers, and the export reference. Remove names, handles, phone numbers, contact links, and identifying case details. Leave `review_status` unchanged until a reviewer checks the source against the redacted fields. Do not infer an official rule from a community reply; add an official URL and check date separately if the answer depends on one.

Other useful source tables, in order:

1. **Academic opportunities:** institution, program, degree, official program URL, official funding URL, deadline, eligibility constraints, and date checked. Each row needs a current official source; community mentions alone are leads.
2. **Iranian lived experiences:** source URL or de-identified export locator, explicitly supported Iranian connection, observed milestone, event date, and what was directly observed versus reported. Do not include private identity fields.
3. **Official approval statistics:** publishing authority, source URL, population definition, period, application count, decision count, approval count, and the authority's definitions. Only compute a rate when numerator and denominator cover the same population and period.

After source review, create a new version 4 dataset and run `npm run verify:release` before publication. Preserve this CSV as the intake record; it is not loaded by the MCP server.
