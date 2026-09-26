# Community Signals source intake

The [Germany question review CSV](opportunity-card-question-review.csv) records ten distinct questions from five original Telegram posts supplied in the conversation on 2026-09-26. Each row has the original message ID, a short de-identified excerpt of the actual question, a normalized question, and the published version 4 question ID. Three questions from message 2036 belong to the skilled worker route; the other seven belong to the opportunity card route.

The CSV is a comparison record, not product data. The full Telegram export was not supplied. Message 2031, the parent of 2036, and later replies to several questions remain unavailable. Compare these excerpts and their reply chains with the original export when it is available. The published questions are marked unresolved; the community replies to messages 2594 and 974 are not official answers.

Keep names, handles, account IDs, phone numbers, contact links, and identifying case details out of public datasets. Message IDs, dates, and pseudonymous asker keys support deduplication and source comparison. An official answer needs a current authority URL and a check date.

Other useful source tables, in order:

1. **Academic opportunities:** institution, program, degree, official program URL, official funding URL, deadline, eligibility constraints, and date checked. Each row needs a current official source; community mentions alone are leads.
2. **Iranian lived experiences:** source URL or de-identified export locator, explicitly supported Iranian connection, observed milestone, event date, and what was directly observed versus reported. Do not include private identity fields.
3. **Official approval statistics:** publishing authority, source URL, population definition, period, application count, decision count, approval count, and the authority's definitions. Only compute a rate when numerator and denominator cover the same population and period.

For subsequent updates, create a new version 4 dataset and run `npm run verify:release` before publication. Preserve this CSV as the intake record; the MCP server reads the published dataset instead.
