# Source adapters and bounded web search

Blocked by: 01
Status: done

Spec: [design](../spec.md); [details](../../../docs/academic-discovery-plan-fa.md).

- [x] Reuse current OpenAlex/ROR/ATS/JSearch; add selected Crossref and web-search adapters behind independent flags.
- [x] Search programs, exact institutional pages and scholarship calls; awarded grants stay a separate evidence type.
- [x] Register country/type/source coverage; provider query carries only public search terms.
- [x] Test byte/page/time/credit limits, schema errors, quota exhaustion and provider failure at executeTool.
- [x] Configure needed free credentials securely only after actual plan/terms are verified; never duplicate existing accounts.

- [x] Diagnose the observed live JSearch source failure before relying on existing configuration; record a successful real-source replay or a truthful unavailable state.

Acceptance note: selected keyless APIs and Tavily passed Preview real-source acceptance. JSearch remains a compatible optional lead source; record its actual Production status before relying on it. HTTP/quota/schema/time failures reduce coverage rather than create a verified result.
