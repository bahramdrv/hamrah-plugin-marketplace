# Resolve retention and free-plan evidence

Blocked by: None

Status: in-progress

See [design](../../../../docs/shared-academic-opening-store.md).

- [ ] Record actual existing Redis product/plan and auto-upgrade configuration without exposing credentials.
- [ ] Account for rate limiter and supervisor cache usage; reserve capacity and verify zero paid overages.
- [ ] Resolve the Upstash daily/monthly documentation discrepancy against the actual account.
- [ ] Establish retention, attribution, access terms and quota for one exact public publisher; unknown terms keep persistence disabled.
- [ ] Record the ten-minute API freshness tradeoff in a proposed ADR before runtime adoption; preserve fresh bounded web search and request-local official verification.

Progress 2026-10-01: reviewed three priority API candidates (JobTech, France Travail, NAV), one reserve (USAJOBS), and three web/feed sources. See `docs/academic-source-expansion-2026-10-01.md`. NAV permits republication but requires immediate inactive removal and update propagation; the generic ten-minute snapshot policy cannot activate NAV without resolving that requirement. Actual Redis plan is not available from repository configuration; a non-secret owner clarification is pending. No provider or persistence activated.

Browser follow-up: actual connected Upstash Free plan verified through Vercel SSO; 500000 monthly commands, 256 MB, roughly 1.4K commands and $0.00 at observation. No Auto-upgrade control was exposed in either settings page, so do not claim its disabled state. No account mutation. Shared usage forecasts and source activation conditions remain outstanding.

Source follow-up: official Arbetsförmedlingen dataset catalog explicitly licenses current/historical Platsbanken ads as CC0; official API page states free use. This clears retention for minimal JobTech source metadata, not the other seven families. Proposed freshness tradeoff is recorded in ADR 0007. Account usage forecast, Redis acceptance and activation conditions remain open; the old pending-owner-clarification note above is superseded by browser evidence.
