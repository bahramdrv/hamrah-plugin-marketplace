# Community Signals source intake

The [Germany question review CSV](opportunity-card-question-review.csv) records ten distinct questions from five original Telegram posts. On 2026-09-26, each excerpt and its reply chain were compared with the private `result(20260917-061909).json` export. The CSV records the export's SHA-256 digest so a later reviewer can verify that they have the same file. Each row has the original message ID, an exact short excerpt of the question, a normalized question, and the published version 4 question ID. Three questions from message 2036 belong to the skilled worker route; the other seven belong to the opportunity card route.

The CSV is a comparison record, not product data. The original export has 1,535 messages; this review curates the ten questions supplied for review, not every question in that export. Message 2020 confirms the skilled worker route of the thread containing message 2036. Replies 1328, 2041, and 2290 add community advice or personal experience. They do not establish official rules. The [German answer review](germany-answer-review.md) records the subsequent official-source pass: two questions have official answers, five have partial answers, and three still require research.

Keep names, handles, account IDs, phone numbers, contact links, and identifying case details out of public datasets. Message IDs, dates, and pseudonymous asker keys support deduplication and source comparison. An official answer needs a current authority URL and a check date.

Other useful source tables, in order:

1. **Academic opportunities:** institution, program, degree, official program URL, official funding URL, deadline, eligibility constraints, and date checked. Each row needs a current official source; community mentions alone are leads.
2. **Iranian lived experiences:** source URL or de-identified export locator, explicitly supported Iranian connection, observed milestone, event date, and what was directly observed versus reported. Do not include private identity fields.
3. **Official approval statistics:** publishing authority, source URL, population definition, period, application count, decision count, approval count, and the authority's definitions. Only compute a rate when numerator and denominator cover the same population and period.

For subsequent updates, create a new version 4 dataset and run `npm run verify:release` before publication. Preserve this CSV as the intake record; the MCP server reads the published dataset instead.
