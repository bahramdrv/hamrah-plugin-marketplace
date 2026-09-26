# 02 — Privacy gate for current datasets

**What to build:** A dataset publisher and signal reader receive a real privacy decision for current community evidence, so a metadata claim of redaction cannot make unsafe data searchable or scoreable.

Blocked by: None — can start immediately

Status: done

**Phase:** 1

- [ ] Privacy status is pass, fail, or needs_review, based on inspection of content and locators rather than a redaction flag.
- [ ] Email, phone, handle, Telegram or account IDs, application and national identifiers, address, embedded contacts, and uncertain full names are flagged; justified field-specific exceptions are auditable.
- [ ] Datasets with fail or needs_review are excluded from search and scoring, and publication diagnostics explain the finding.
- [ ] A dataset-to-MCP test proves a fake privacy flag does not bypass the gate.

