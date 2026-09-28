# 03: Official nationality exclusion and acceptance replay

**What to build:** The shortlist excludes a position when its current official advertisement explicitly bars Iranian applicants, explains that exclusion with a source, and passes bounded user-visible acceptance cases for the first Germany/physics/doctorate slice.

**Blocked by:** 02 — Verified opening shortlist and academic fit

**Status:** done

- [x] A current official restriction that excludes Iranian applicants removes that advertisement from the qualifying shortlist and records the source-linked reason; an unverified or absent restriction remains unknown.
- [x] An anonymous minimal-profile request and an anonymous request with material academic gaps are replayed against current official pages. Each expected behavior is graded pass, fail, or untested, including opening availability, funding, academic fit, nationality evidence, coverage, and the requested scope.
- [x] The replay checks displayed excerpts against the cited official pages, preserves the complete validated renderer blocks and private fit notes in the visible answer, and stops at the feature boundary.
- [x] The user-facing guidance explains how to request this search and what a missing result means. The replay and documentation make no claim of a standing catalog, visa outcome, or admission probability.
- [x] Required Node, release, static, and Python checks pass before a commit.

See the feature specification in the parent directory for scope, terminology, and privacy boundaries.
