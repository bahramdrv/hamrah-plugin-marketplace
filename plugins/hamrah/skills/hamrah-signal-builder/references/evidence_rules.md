# Visa Atlas Evidence Rules

This reference defines how to evaluate, merge, verify, and score evidence for Community Signals.

---

## 1. Evidence source types

Use one of:

- `official_government`
- `official_immigration_authority`
- `official_embassy_or_consulate`
- `official_vac_or_service_provider`
- `official_university`
- `official_employer`
- `official_professional_regulator`
- `official_test_provider`
- `official_payment_provider`
- `official_airline_or_border_authority`
- `recognized_news`
- `community_admin`
- `licensed_or_identified_professional`
- `shared_direct_institution_email`
- `shared_direct_employer_email`
- `first_hand_applicant_experience`
- `second_hand_report`
- `community_opinion`
- `unknown`

A community message containing an official URL is still community evidence until the official source is checked.

---

## 2. Direct vs second-hand

Use:

- `direct`
- `second_hand`

Direct examples:
- applicant describing their own application
- copied email received by the applicant
- official notice
- university written response

Second-hand examples:
- "my friend said"
- "people are saying"
- "I heard from an agent"

---

## 3. Independent evidence

Count independent sources, not raw message count.

Rules:
- multiple posts by the same person = one independence group
- reply repetitions by the same person = one source
- forwarded copies of the same notice = one underlying source
- reactions/upvotes do not count as independent reports
- copied official notice and the original official notice should not be double-counted as two independent official sources

Use:
`independence_group`

---

## 4. Confidence

### Low
Use when:
- single anecdote
- vague claim
- second-hand report
- no date/context
- meaningful contradiction remains unresolved

### Medium
Use when:
- 2+ independent recent reports
- one strong direct institutional/employer email
- admin/professional confirmation
- repeated similar reports over time

### High
Use when:
- current official evidence confirms the operational fact, OR
- multiple recent independent direct reports plus strong corroboration

Confidence describes evidence reliability, not impact size.

---

## 5. Severity

### Low
Small inconvenience with limited practical effect.

### Moderate
Meaningful extra time, cost, documentation, or planning.

### High
Can materially change route ranking, deadline success, funding, admission, employment, or execution.

### Critical
Can currently prevent completion of the route or process.

Severity describes practical impact, not evidence quality.

---

## 6. Recency

Use:

- `very_current`: 0–30 days
- `current`: 31–90 days
- `supporting`: 91–365 days
- `historical`: >365 days unless reconfirmed

Always store:
- `first_seen`
- `last_seen`
- `last_verified`

---

## 7. Status

Use:

### active
Enough current evidence indicates the issue exists now.

### monitoring
Potentially important pattern but evidence is not strong enough for a current penalty.

### uncertain
Conflicting evidence cannot be resolved.

### resolved
Reliable newer evidence confirms the issue ended, reopened, normalized, or no longer applies.

### historical
Old context with no current relevance.

Resolved and historical signals must have current adjustment `0`.

---

## 8. Contradiction resolution

Actively look for evidence against the dramatic interpretation.

Priority order:

1. newest authoritative official evidence
2. direct evidence
3. multiple independent reports
4. community admin / identified professional
5. second-hand/community opinion

Preserve meaningful contradictions in `evidence`.

Use:
- `supports`
- `contradicts`
- `resolves`

Do not silently delete counterexamples.

---

## 9. Official verification

For every high/critical active signal that can materially affect route ranking, verify with current official sources when possible.

Preferred sources:

1. immigration authority / government
2. embassy / consulate
3. VAC/service provider
4. university
5. professional regulator
6. test provider
7. payment provider
8. official employer
9. recognized news only when primary sources are unavailable

Do not use search snippets as final authority.

Official verification status:

- `confirmed`
- `partly_confirmed`
- `contradicted`
- `not_verified`
- `not_applicable`

---

## 10. Questions are not evidence

Examples:

"Is the embassy open?"
→ not a signal.

"I heard visas take a year now."
→ not enough for an active signal.

"Three independent applicants report 10–14 month processing and one university email says it will not wait."
→ candidate signal.

---

## 11. Institution / employer claims

A named institution or employer should receive a penalty only when supported by:

- multiple independent recent reports, OR
- current written institutional policy, OR
- direct institutional communication that clearly describes the relevant practice.

Otherwise:

- `status = monitoring`
- `suggested_fit_adjustment = 0`

Never generalize one institution to an entire country.

---

## 12. Fit adjustment

Allowed values:

- `0`
- `-5`
- `-10`
- `-15`
- `-20`

Interpretation:

- `0`: no reliable current downside / monitoring / resolved / historical
- `-5`: moderate repeated relevant friction
- `-10`: strong recent repeated friction
- `-15`: severe operational or market barrier
- `-20`: practically near-blocked for the exact applicant/process

Rules:

- single anecdote → `0`
- monitoring → normally `0`
- resolved → `0`
- historical → `0`
- positive-resolution evidence → never above `0`
- community evidence never increases official eligibility
- adjustment is never approval probability

---

## 13. Conditional adjustment

Every non-zero penalty should state exactly when it applies.

Example:

```json
{
  "adjustment": -10,
  "apply_when": "Applicant uses Global Talent Route 4 through Royal Academy of Engineering and has an immovable start deadline that cannot absorb a 10–14 week Stage 1 delay."
}
```

Avoid broad penalties when the issue is conditional.

---

## 14. Correlated signals / double counting

If one root problem creates multiple secondary effects, do not stack all penalties.

Example:

- visa delay
- supervisor reluctance caused by visa delay
- scholarship expiry caused by visa delay

Use:

- `root_cause_id`
- `correlated_signal_ids`

Apply the strongest justified combined penalty rather than blindly adding all three.

Recommended total community penalty cap per route: `-20`.

---

## 15. Positive / resolution evidence

Positive evidence can:

- disprove a rumor
- resolve a closure
- show normalization
- show a successful counterexample
- remove an old penalty

Positive evidence must not:

- add bonus fit points
- improve official eligibility
- imply higher approval probability

---

## 16. Privacy

Never output:

- private member names
- usernames
- Telegram/Discord IDs
- phone numbers
- private emails
- passport numbers
- application numbers
- private addresses

Allowed:

- anonymous message/source IDs
- public organization names
- public institution names
- public official URLs

Summarize personal evidence instead of copying long messages verbatim.

---

## 17. Coverage rules

Record whether the source was fully processed.

If full source was not processed:

```json
"coverage_complete": false
```

Never state "no signal exists" from a partial sample.

---

## 18. Quality-control checklist

Before final output confirm:

- full available source processed
- questions separated from evidence
- reply chains considered
- duplicates merged
- independent reporters counted correctly
- contradictions checked
- later resolution checked
- country scope correct
- route scope correct
- institution scope correct
- official/community evidence separated
- correlated penalties checked
- personal identifiers removed
