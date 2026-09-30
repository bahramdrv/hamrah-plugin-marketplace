# 03: Live API and cache acceptance

Blocked by: 02 — Anonymous live acceptance

Status: in-progress

Verify the owner-approved API-assisted Supervisor Discovery Candidate path after deployment. Use public search terms only. A live check must establish that the new tool is deployed, the shared Redis configuration is active, a bounded OpenAlex/ROR search can store minimal names, and a later identical request reads those names as unverified candidates. It must reject a deployment at a different commit when an expected commit is supplied. It must report provider outages as failures rather than claim an empty complete search.

- [x] Add a repeatable live verifier with a bounded public search scope.
- [x] Confirm the verifier checks Redis write and subsequent read, without showing candidates as verified Academic Supervisor Leads.
- [x] Run required repository checks before commit (332 Node tests, release verification, static checks, 47 Python tests).
- [ ] After the new commit is deployed, run the live verifier against that exact commit and record the result.

The deployed `/health` reported `rateLimitStore: redis` and 50 tools on 2026-09-30. The new live verifier correctly rejected that deployment because `discoverAcademicSupervisorCandidates` was absent. Full cache acceptance remains pending deployment of the new commit.
