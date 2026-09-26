# Legacy dataset privacy review

Reviewed on 26 September 2026 after merging the 49 published datasets. The first scan held 44 files for review. We inspected the title-case phrases in their source context across each file. They refer to routes, countries, organizations, universities, programs, or ordinary sentence openings, not private applicants. The exact phrases are recorded in `plugins/hamrah/mcp/reviewed-domain-phrases.json`; two additional phrases support existing test fixtures. An unknown phrase still produces `needs_review`. The inspector checks names in narrative, name, title, and source-name fields, and scans every identifier occurrence in a string. All contact and locator checks remain active.

The full per-file audit is in [dataset-privacy-review-findings.json](dataset-privacy-review-findings.json): every title-case match has its dataset path and phrase. This allows the initial 50-finding cap to be audited without copying complete source messages. The two initial identifier failures were the phrase “national number” in `evidence[4].summary.en` in the two `hamrah_applyabroad_global_policy_signals_v3` copies; there is no identifier value in either string. The national-number exception requires a digit, and later identifier matches in the same string are still checked. No data file needed redaction after review.

Initial scan: 49 files; 5 accepted; 44 held for review. Current strict scan: 49 accepted; 0 rejected. The versioned schema, evidence-link, and privacy checks pass.

| Dataset | Initial status | Original findings by rule | First flagged paths | Reviewed title-case matches | Disposition |
| --- | --- | --- | --- | ---: | --- |
| Global Talent ans Skilled Worker - UK - 2026-09-11 | needs_review | possible_full_name (50) | source_coverage[0].source_name, signals[0].entities[0].name, signals[0].entities[1].name | 330 | pass; reviewed |
| hamrah_applyabroad_global_policy_signals_v3 (1) | fail | personal_identifier (1), possible_full_name (27) | evidence[4].summary.en, evidence[4].summary.fa, evidence[9].summary.en | 60 | pass; reviewed |
| hamrah_applyabroad_global_policy_signals_v3 | fail | personal_identifier (1), possible_full_name (27) | evidence[4].summary.en, evidence[4].summary.fa, evidence[9].summary.en | 60 | pass; reviewed |
| hamrah_art_architecture_community_signals_v3 (1) | needs_review | possible_full_name (2) | evidence[9].summary.en, evidence[9].summary.fa | 14 | pass; reviewed |
| hamrah_art_architecture_community_signals_v3 | needs_review | possible_full_name (2) | evidence[9].summary.en, evidence[9].summary.fa | 14 | pass; reviewed |
| hamrah_australia_news_community_signals_v3 | needs_review | possible_full_name (41) | sources[0].name, evidence[1].summary.en, evidence[1].summary.fa | 69 | pass; reviewed |
| hamrah_australia_work_community_signals_v3 (1) | needs_review | possible_full_name (8) | evidence[0].summary.en, evidence[20].summary.en, evidence[21].summary.en | 10 | pass; reviewed |
| hamrah_australia_work_community_signals_v3 | needs_review | possible_full_name (8) | evidence[0].summary.en, evidence[20].summary.en, evidence[21].summary.en | 10 | pass; reviewed |
| hamrah_belgium_migration_community_signals_v3 | needs_review | possible_full_name (24) | evidence[5].summary.en, evidence[5].summary.fa, evidence[6].summary.en | 37 | pass; reviewed |
| hamrah_build_abroad_community_signals_v3 | needs_review | possible_full_name (1) | sources[0].name | 16 | pass; reviewed |
| hamrah_canada_news_community_signals_v3 | needs_review | possible_full_name (36) | sources[0].name, evidence[0].summary.fa, evidence[3].summary.fa | 60 | pass; reviewed |
| hamrah_canada_work_community_signals_v3 | needs_review | possible_full_name (27) | evidence[15].summary.en, evidence[15].summary.fa, evidence[17].summary.en | 39 | pass; reviewed |
| hamrah_china_news_channel_signals_v3 | needs_review | possible_full_name (8) | evidence[3].summary.en, evidence[3].summary.fa, evidence[5].summary.en | 9 | pass; reviewed |
| hamrah_china_study_community_signals_v3_083403 | needs_review | possible_full_name (6) | evidence[1].summary.en, evidence[1].summary.fa, evidence[12].summary.en | 10 | pass; reviewed |
| hamrah_china_study_community_signals_v3 | needs_review | possible_full_name (6) | evidence[1].summary.en, evidence[1].summary.fa, evidence[12].summary.en | 10 | pass; reviewed |
| hamrah_china_work_community_signals_v3 | needs_review | possible_full_name (1) | signals[1].claim.recommended_action.en | 7 | pass; reviewed |
| hamrah_europe_phd_signals_result9 | needs_review | possible_full_name (6) | evidence[1].summary.en, evidence[1].summary.fa, signals[0].scope.entities[0].name | 10 | pass; reviewed |
| hamrah_france_signals_result16 | needs_review | possible_full_name (4) | signals[0].summary, signals[2].summary, signals[3].summary | 17 | pass; reviewed |
| hamrah_germany_ausbildung_community_signals_v3 | needs_review | possible_full_name (1) | sources[0].name | 3 | pass; reviewed |
| hamrah_germany_community_signals | needs_review | possible_full_name (2) | signals[5].recommended_action, watchlist[0].reason | 7 | pass; reviewed |
| hamrah_germany_news_community_signals_v3 | needs_review | possible_full_name (13) | sources[0].name, evidence[1].summary.en, evidence[15].summary.en | 30 | pass; reviewed |
| hamrah_germany_opportunity_card_community_signals_v3 | needs_review | possible_full_name (6) | evidence[15].summary.en, evidence[35].summary.en, signals[0].claim.recommended_action.en | 39 | pass; reviewed |
| hamrah_germany_work_community_signals_v3 | needs_review | possible_full_name (21) | evidence[1].summary.en, evidence[1].summary.fa, evidence[16].summary.en | 43 | pass; reviewed |
| hamrah_humanities_channel_signals_v3 | needs_review | possible_full_name (5) | evidence[0].summary.en, evidence[0].summary.fa, evidence[3].summary.en | 9 | pass; reviewed |
| hamrah_humanities_community_signals_v3 | needs_review | possible_full_name (4) | evidence[36].summary.en, evidence[37].summary.en, signals[1].claim.summary.en | 19 | pass; reviewed |
| hamrah_ielts_community_signals_v3 | needs_review | possible_full_name (5) | evidence[6].summary.en, evidence[6].summary.fa, evidence[24].summary.en | 9 | pass; reviewed |
| hamrah_italy_candidate_signals | needs_review | possible_full_name (1) | signals[3].summary | 5 | pass; reviewed |
| hamrah_italy_signals_result8 | needs_review | possible_full_name (1) | signals[4].scope.entities[0].name | 5 | pass; reviewed |
| hamrah_japan_migration_community_signals_v3 (1) | needs_review | possible_full_name (9) | evidence[4].summary.en, evidence[32].summary.en, evidence[32].summary.fa | 31 | pass; reviewed |
| hamrah_japan_migration_community_signals_v3 | needs_review | possible_full_name (9) | evidence[4].summary.en, evidence[32].summary.en, evidence[32].summary.fa | 31 | pass; reviewed |
| hamrah_lookup_canada_migration_signals_v3 | needs_review | possible_full_name (12) | evidence[2].summary.fa, evidence[24].summary.en, evidence[24].summary.fa | 28 | pass; reviewed |
| hamrah_medical_sciences_channel_signals_v3 | needs_review | possible_full_name (6) | evidence[1].summary.en, evidence[1].summary.fa, evidence[4].summary.en | 20 | pass; reviewed |
| hamrah_medical_sciences_community_signals_v3 | needs_review | possible_full_name (2) | evidence[10].summary.en, signals[2].claim.summary.en | 10 | pass; reviewed |
| hamrah_north_america_undergrad_community_signals_v3 | needs_review | possible_full_name (25) | evidence[1].summary.fa, evidence[6].summary.en, evidence[6].summary.fa | 53 | pass; reviewed |
| hamrah_russia_study_community_signals_v3 | needs_review | possible_full_name (11) | evidence[0].summary.en, evidence[0].summary.fa, evidence[3].summary.en | 17 | pass; reviewed |
| hamrah_scandinavia_community_signals_v3 | needs_review | possible_full_name (12) | evidence[0].summary.en, evidence[0].summary.fa, evidence[4].summary.en | 31 | pass; reviewed |
| hamrah_south_korea_migration_community_signals_v3 | needs_review | possible_full_name (6) | evidence[0].summary.fa, evidence[1].summary.fa, signals[0].claim.summary.en | 42 | pass; reviewed |
| hamrah_spain_signals_result10 | needs_review | possible_full_name (1) | signals[0].scope.entities[0].name | 5 | pass; reviewed |
| hamrah_switzerland_migration_community_signals_v3 | needs_review | possible_full_name (1) | signals[6].claim.who_should_care.en | 6 | pass; reviewed |
| hamrah_taiwan_study_channel_signals_v3 | needs_review | possible_full_name (18) | evidence[1].summary.en, evidence[1].summary.fa, evidence[4].summary.en | 35 | pass; reviewed |
| hamrah_testinno_ielts_community_signals_v3 | needs_review | possible_full_name (5) | evidence[25].summary.en, evidence[25].summary.fa, evidence[27].summary.en | 8 | pass; reviewed |
| hamrah_turkey_residence_community_signals_v3 | needs_review | possible_full_name (1) | signals[8].claim.recommended_action.en | 3 | pass; reviewed |
| hamrah_turkey_study_community_signals_v3 | needs_review | possible_full_name (1) | signals[9].claim.practical_impact.fa | 4 | pass; reviewed |
| hamrah_uk_global_talent_skilled_worker_community_signals_v3 | needs_review | possible_full_name (49) | sources[0].name, evidence[0].summary.en, evidence[0].summary.fa | 115 | pass; reviewed |

The original reported counts in the table are capped at 50 per dataset. The audit JSON records every current title-case match, including matches outside the original narrative-only scan, so its counts differ. Each of the 44 held files has an explicit passing disposition above; the other five also appear in the audit JSON. `npm run verify:release` verifies all 49 against the current fail-closed detector.
