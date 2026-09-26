# 09 — Version 2 and 3 migration

**What to build:** A facilitator can search valid legacy version 2 and actual version 3 Community Signal datasets alongside version 4 data without losing provenance or misreading fields.

Blocked by: 08 — Version 4 Signal path

Status: done

**Phase:** 2

- [ ] Explicit adapters use the real version 2 and installed version 3 contracts and emit canonical internal artifacts with their original schema version retained.
- [ ] Legacy evidence, source coverage, status, and identity are preserved or marked unknown when not representable; no missing fields are fabricated.
- [ ] Existing search and get tools read all supported versions and report invalid files separately.
- [ ] Fixtures for both old versions and version 4 verify equivalent observable retrieval and compatibility.

