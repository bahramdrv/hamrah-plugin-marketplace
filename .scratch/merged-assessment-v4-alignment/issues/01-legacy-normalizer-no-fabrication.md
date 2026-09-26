# 01: Legacy datasets keep only what their sources said

**What to build:** A facilitator reading a signal that came from a version 2 or 3 dataset sees only facts the dataset actually stated. Privacy status comes from inspection, never from a free-text redaction note or a `redacted` flag; evidence maturity is never promoted from confidence; a field the source did not give is marked unknown instead of defaulted; and every signal and evidence ID is deterministic. Source: Spec review finding 5 and Standards finding 2 on the changes since #26; spec ticket 09 ("no missing fields are fabricated") and the v4 spec ("A `redacted` flag … alone cannot produce `pass`", "Never use random IDs").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Privacy for a legacy dataset is decided only by the inspected privacy result; a declared `fail` stays `fail`, and a missing declaration is recorded as unknown rather than `pass`.
- [x] Evidence records are not blanket-marked as redacted.
- [x] Evidence maturity such as `corroborated` is carried over only when the source stated it; it is never derived from confidence or lifecycle labels.
- [x] A signal without a source ID gets a deterministic ID that matches the ID its linked evidence refers to; the same input always produces the same output.
- [x] Schema version strings come from the shared version constants.
- [x] `npm run verify:release` result is reported: every legacy dataset either still loads or is rejected with an explicit, per-dataset reason recorded in `docs/dataset-privacy-review.md`; no dataset is silently dropped.
- [x] Tests cover free-text redaction notes, an explicit privacy fail, a missing maturity, and a missing signal ID.
