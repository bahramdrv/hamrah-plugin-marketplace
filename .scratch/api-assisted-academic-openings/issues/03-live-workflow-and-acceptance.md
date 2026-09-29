# 03: Use API and web discovery in the live Hamrah workflow

Blocked by: 01 — Free source discovery; 02 — Verified call contract

Status: done

Route explicit academic call requests through free API/feed discovery and bounded live web search. Verify decisive fields against current official publisher pages, compare only supplied applicant facts locally, and return the validated Persian response. Make source and country gaps visible when no connector exists, a provider fails, or fewer than three calls qualify. Preserve the separate professor and immigration paths.

- [x] Anonymous dated replay covers global and country-scoped requests, verified Master's and PhD admission, an applicable competitive Master's scholarship, a doctoral funding call, and a postdoctoral vacancy. See `../replays/2026-09-29-acceptance.md`.
- [x] The workflow requires official evidence and check date; zero/partial responses never imply no opportunities exist.
- [x] Full required checks passed before the source commit. Commit `fac016e6ed1ee54a8bb9a52374962a6a7f4e747e` was deployed; `npm run verify:live:opportunities` passed against that exact commit. A live public-only MCP call returned Ai2 Greenhouse and TRI Lever leads with `verificationStatus: "unverified"` and no source failures.
