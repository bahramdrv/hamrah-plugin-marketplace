# 02: Validate and render open academic calls consistently

Blocked by: 01 — Free source discovery

Status: done

Add a versioned public result contract and Persian rendering for admission calls, funding calls, and research vacancies across Master's, PhD, postdoctoral, and research-job categories. API and web candidates share one verification gate: current exact official call, open application, future deadline or explicit rolling status, decisive conditions, and source/check date. Funding and nationality states remain distinct. Keep zero, partial, and missing-input responses structurally consistent.

- [x] `executeTool` tests cover public report categories, deadline and funding gates, competitive scholarship linkage, exclusions, stable ordering, and missing input. Discovery tests cover lead deduplication and source failure.
- [x] The workflow requires official-page verification before calling the renderer; its validation scope is explicit. The renderer itself cannot authenticate caller-supplied excerpts.
- [x] Text is generated from the validated structured output; private applicant facts do not enter the public renderer.
