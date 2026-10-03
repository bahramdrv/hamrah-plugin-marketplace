# ROR HTTP homepage compatibility

Blocked by: 08
Status: claimed

Observed during the installed-tool product acceptance on 2026-10-03: `verifyAcademicEvidence` rejected the active Max Planck Society record (`01hhn8329`) with `institution_identity_not_confirmed`. Its ROR website is `http://www.mpg.de/en`; the current official call is served over HTTPS on `ai.mpg.de`. The same strict URL normalization also discarded university discovery candidates with HTTP ROR homepages.

Scope: normalize only the ROR website metadata to HTTPS before the existing canonical URL checks. Do not enable HTTP evidence retrieval or relax public DNS, publisher delegation, TLS, redirects, literal evidence, freshness, or private-domain tenant checks. No skill-resource or plugin-version changes are needed for this server correction.

- [x] Reproduce through the agreed `executeTool` seam before each implementation slice.
- [x] Verify an HTTP ROR homepage supports freshly fetched HTTPS institutional evidence; caller HTTP posting URLs remain rejected.
- [x] Preserve HTTPS university candidates and reject IP/credential URLs from ROR.
- [x] Retrieve the actual ROR record and official MP-AIX call after the local correction: `verified_open`, deadline `2026-10-31`, funding `guaranteed`.
- [x] All repository checks pass before commit: 364 JS tests, 47 Python tests, release and static checks. Python uses the existing Python 3.12 test environment; the default desktop Python has no pytest installation.
- [ ] Authorized push, CI and exact-version Production acceptance pass.
- [ ] Export the installed-tool Persian report with actual coverage and source caveats.

This is a public product sample for AI PhD opportunities in Germany, not an applicant eligibility assessment. The source's funded employment package applies to selected applicants; it does not promise admission or an award to the user. The call timeline page contains inconsistent October/November text; the year-specific dated news item establishes the reported deadline, and the discrepancy must be disclosed.
