# 10 — Validated publication and stable IDs

**What to build:** A dataset publisher can import vetted evidence into the Git-backed store through an explicit command, and repeated imports retain stable IDs without exposing raw candidates.

Blocked by: 08 — Version 4 Signal path

Status: done

**Phase:** 2

- [ ] Publication performs normalization, deduplication, privacy, provenance, evidence, contradiction, and schema gates before writing.
- [ ] Artifact IDs derive deterministically from normalized source, claim, country, route, event date, and entity as applicable; repeated imports produce the same identities.
- [ ] The published destination is explicit and matches what the deployed reader scans; raw or needs_review candidates remain outside it.
- [ ] A withdrawal or supersession operation preserves history and removes unsafe artifacts from current search; publisher-to-search tests prove the behavior.

