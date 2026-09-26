# 13 — Question extraction and retrieval

**What to build:** A researcher can propose canonical Persian and English community questions from source material, publish valid Questions, and an applicant can search or retrieve them through MCP.

Blocked by: 12 — First German route evidence

Status: done

**Phase:** 3

- [ ] Question artifacts carry canonical text, variants, country and route scope, topic, process stage, independent asker count, first and last seen dates, trend, evidence links, and answer status.
- [ ] Model interpretation may propose semantic merges, but deterministic validation checks identities, evidence, counts, and ambiguity; uncertain merges remain unpublished needs_review.
- [ ] The read-only searchCommunityQuestions and getCommunityQuestion tools return evidence coverage and stable IDs.
- [ ] End-to-end tests show wording variants merge while repeated posts from one asker do not inflate counts.

