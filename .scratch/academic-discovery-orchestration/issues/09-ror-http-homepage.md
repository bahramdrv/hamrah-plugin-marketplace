# ROR HTTP homepage compatibility

Blocked by: 08
Status: done

Observed during the installed-tool product acceptance on 2026-10-03: `verifyAcademicEvidence` rejected the active Max Planck Society record (`01hhn8329`) with `institution_identity_not_confirmed`. Its ROR website is `http://www.mpg.de/en`; the current official call is served over HTTPS on `ai.mpg.de`. The same strict URL normalization also discarded university discovery candidates with HTTP ROR homepages.

Scope: normalize only the ROR website metadata to HTTPS before the existing canonical URL checks. Do not enable HTTP evidence retrieval or relax public DNS, publisher delegation, TLS, redirects, literal evidence, freshness, or private-domain tenant checks. No skill-resource or plugin-version changes are needed for this server correction.

- [x] Reproduce through the agreed `executeTool` seam before each implementation slice.
- [x] Verify an HTTP ROR homepage supports freshly fetched HTTPS institutional evidence; caller HTTP posting URLs remain rejected.
- [x] Preserve HTTPS university candidates and reject IP/credential URLs from ROR.
- [x] Retrieve the actual ROR record and official MP-AIX call after the local correction: `verified_open`, deadline `2026-10-31`, funding `guaranteed`.
- [x] All repository checks pass before commit: 364 JS tests, 47 Python tests, release and static checks. Python uses the existing Python 3.12 test environment; the default desktop Python has no pytest installation.
- [x] Authorized push, CI and exact-version Production acceptance pass: correction `d212c826c8c169d7021703e111c9dc9d65887fdc`; both [release checks](https://github.com/bahramdrv/hamrah-plugin-marketplace/actions/runs/37112459547) and [community validation](https://github.com/bahramdrv/hamrah-plugin-marketplace/actions/runs/37112459477) succeeded. Production health reports this exact commit, 54 tools and Redis.
- [x] Export the installed-tool [Persian report](../evidence/2026-10-03-product-sample-fa.md) and [public acceptance observations](../evidence/2026-10-03-product-acceptance.json) with actual coverage and source caveats. Connected native MCP verification/report calls succeeded after deployment; equivalent Persian/English input, unchanged-evidence replay, funded-only filtering, and two synthetic negative cases passed.

This is a public product sample for AI PhD opportunities in Germany, not an applicant eligibility assessment. The source's funded employment package applies to selected applicants; it does not promise admission or an award to the user. The call timeline page contains inconsistent October/November text; the year-specific dated news item establishes the reported deadline, and the discrepancy must be disclosed.

The plugin's installed 0.1.4 skills and MCP resource bundle did not change in this server correction. The Production bundle checker passed all 111 advertised resource digests and eight actual bodies for the correction commit. No API key or signed evidence token was exported.
