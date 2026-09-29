# 01: Discover academic call candidates from no-cost sources

Blocked by: None

Status: done

Build a bounded public MCP discovery tool that queries validated no-cost source adapters on request. Start with DAAD PhDGermany RSS and public publisher job-board APIs where a real board identifier is known. Use only fixed provider origins and caller-supplied public search terms; no applicant profile goes to providers. Return candidate identity, source, URL, date, and explicit source/country/failure coverage. API responses are leads, not verified-open results.

- [x] `executeTool` tests cover matching candidates, country/type scope, zero matches, timeout/failure coverage, and no private profile fields.
- [x] A dated live feed/board check establishes actual endpoint response shapes and useful candidate mapping.
- [x] Unknown or unverified no-cost terms are not activated as connectors.
