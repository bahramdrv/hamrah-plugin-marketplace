# 04 — Requirement dates and freshness

**What to build:** An applicant sees whether a decisive official fact is current, aging, stale, or unknown, and a stale or impossible-dated requirement cannot support ranking.

Blocked by: 03 — Official Source Authority

Status: done

**Phase:** 1

- [ ] ISO date and date-time fields reject impossible calendar values and inconsistent effective periods.
- [ ] A versioned fact-type policy reports status, age_days, and max_age_days for changing thresholds, fees, lists, deadlines, quotas, processing times, and financial requirements.
- [ ] Stale decisive requirements block ranking and preserve an explanatory reason; unknown dates are not silently current.
- [ ] Scorecard boundary tests cover fresh, aging, stale, missing, and invalid dates.

