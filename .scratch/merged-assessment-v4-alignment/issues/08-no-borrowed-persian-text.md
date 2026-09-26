# 08: Legacy datasets do not copy English text into Persian fields

**What to build:** A Persian-speaking applicant never sees English text presented as the Persian version of a legacy signal. When a version 2 or 3 source gives only one language, the other language is marked missing and the reader shows the available language with a clear label. Source: follow-up reported during ticket 01; spec ticket 09 ("no missing fields are fabricated").

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Normalizing a legacy dataset leaves a missing Persian or English field empty (or explicitly marked missing) instead of copying the other language.
- [x] Search and retrieval results show which language each text is in; a Persian summary is never English text.
- [x] Every published legacy dataset still loads; `npm run verify:release` passes.
- [x] Tests cover an English-only and a Persian-only legacy signal through the store reader and a search tool.
