import { readFileSync } from "node:fs";

const NARRATIVE_FIELDS = new Set([
  "summary", "summary_en", "summary_fa", "evidence_summary", "resolution_summary", "current_evidence",
  "practical_impact", "who_should_care", "recommended_action", "known_workaround",
  "reason", "what_would_confirm_it",
  "statement_en", "canonical_en", "canonical_fa", "variants", "milestone"
]);
const ID_FIELDS = new Set([
  "id", "source_id", "supersedes", "superseded_by",
  "evidence_ids", "opposing_evidence_ids", "correlated_signal_ids", "artifact_id"
]);
const STABLE_ID = /^(?:sig|qst|opp|exp|clm|src|evd)_[0-9a-f]{32}$/;
// Exact title-case phrases reviewed in the publication corpus. Each is accepted only inside its recorded scopes:
// a dataset id (or "*" for any dataset) and a field path pattern in which "[*]" stands for any array index.
// Outside those scopes, and for any new phrase, the full-name rule still reports needs_review.
const REVIEWED_PHRASES = loadReviewedPhrases(
  JSON.parse(readFileSync(new URL("./reviewed-domain-phrases.json", import.meta.url), "utf8"))
);

function loadReviewedPhrases(file) {
  const reviewed = new Map();
  for (const entry of file.phrases ?? []) {
    const complete = typeof entry.phrase === "string" && typeof entry.reason === "string" && entry.reason.trim()
      && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_on ?? "") && Array.isArray(entry.scopes) && entry.scopes.length
      && entry.scopes.every((scope) => Array.isArray(scope.datasets) && scope.datasets.length
        && Array.isArray(scope.fields) && scope.fields.length);
    // A malformed entry must never widen into an unscoped exemption, so the whole list is refused.
    if (!complete || reviewed.has(entry.phrase)) throw new Error(`Invalid reviewed phrase entry: ${JSON.stringify(entry.phrase)}`);
    reviewed.set(entry.phrase, {
      reason: entry.reason,
      reviewedOn: entry.reviewed_on,
      scopes: entry.scopes.map((scope) => ({
        datasets: new Set(scope.datasets),
        fields: scope.fields.map((pattern) => new RegExp(
          `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\[\\\*\\\]/g, "\\[\\d+\\]")}$`
        ))
      }))
    });
  }
  return reviewed;
}

// Common English words that are capitalised only because they open a sentence (or a list item). None is used as
// a given name, so at a sentence start they are lowercased before the full-name rule runs; the words after them
// are still paired and checked, so "The Reza Ahmadi case" is held. Mid-sentence the words keep their capital.
// Words that can be names or name parts in some languages (for example Low, Will, Grant, June) are deliberately absent.
const SENTENCE_OPENERS = new Set([
  "The", "For", "From", "One", "Some", "All", "Not", "Using", "Current", "Recent", "Past", "Historical", "Repeated",
  "Separate", "Specialized", "Limited", "Online", "Pending", "Eligible", "Accepted", "Equivalent", "Multiple",
  "Speculative", "Official", "Overseas", "Direct", "Top", "Treat", "Start", "Get", "Improve", "Improving", "Provide",
  "Document", "Submitting", "Track", "Build", "Anchor"
]);

function withoutSentenceOpeners(text) {
  return text.replace(/(^|[.!?؟;:]\s+|\n)([\s"'“‘(•*–—-]*)([A-Z][a-z]+)\b/gu, (match, lead, prefix, word) => (
    SENTENCE_OPENERS.has(word) ? `${lead}${prefix}${word.toLowerCase()}` : match
  ));
}

function reviewedPhrase(phrase, datasetId, path) {
  const entry = REVIEWED_PHRASES.get(phrase);
  const inScope = entry?.scopes.some((scope) => (scope.datasets.has("*") || (datasetId && scope.datasets.has(datasetId)))
    && scope.fields.some((pattern) => pattern.test(path)));
  return inScope ? entry : null;
}
const KNOWN_INSTITUTIONS = new Map([
  ["vac", new Set(["Tehran UK Visa Application Centre"])],
  ["embassy", new Set(["German Embassy Tehran"])]
]);

function inspectString(value, path, field, parent, findings, exceptions, datasetId) {
  if (ID_FIELDS.has(field) && STABLE_ID.test(value)) {
    exceptions.push({ path, rule: "stable_id", reason: "A SHA-256-derived publication ID, not a contact detail." });
    return;
  }
  if (field === "content_hash" && /^sha256:[0-9a-f]{64}$/.test(value)) {
    exceptions.push({ path, rule: "content_hash", reason: "A SHA-256 digest of source content, not a contact detail." });
    return;
  }
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Invalid escapes remain inspectable as raw text. */ }
  const digitsNormalized = decoded.replace(/[۰-۹٠-٩]/gu, (digit) => {
    const code = digit.codePointAt(0);
    return String(code - (code <= 0x0669 ? 0x0660 : 0x06f0));
  });
  const add = (status, rule) => findings.push({ status, rule, path });
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(decoded)) add("fail", "email");
  if ((field !== "source_message_id" || !/^\d{8,}$/.test(decoded))
    && /(?:\+|00)\d[\d\s().-]{7,}\d|(?<!\d)\d{9,15}(?!\d)/u.test(digitsNormalized)) add("fail", "phone");
  if (/@[A-Za-z0-9_]{3,}/u.test(decoded)) add("fail", "handle");
  if (/(?:t\.me|telegram\.me)\/|tg:\/\//i.test(decoded)) add("fail", "telegram_locator");
  // Every labelled identifier in the string is checked, not only the first. Exception: after "national id/number/no"
  // the captured token must contain a digit. National identifiers (Iranian کد ملی and others) are numeric, whereas
  // the English phrase also names national quotas and planning figures in policy prose, e.g. "A higher national
  // number does not mean..." in the reviewed hamrah_applyabroad_global_policy_signals_v3 copies, where the
  // captured word ("does") is not an identifier. A later identifier in the same string ("...; passport number
  // ABCD1234") is still a fail, and the Persian rule below covers labelled national numbers independently.
  for (const identifier of decoded.matchAll(/\b(telegram|account|chat|user|application|passport|national)[ _-]?(id|number|no\.?)[\s:#=-]*([A-Za-z0-9_-]{4,})\b/gi)) {
    if (identifier[1].toLowerCase() !== "national" || /\d/u.test(identifier[3])) add("fail", "personal_identifier");
  }
  if (/(?:کد\s*ملی|شماره\s*ملی|شماره\s*(?:گذرنامه|پاسپورت|درخواست))\s*[:：]?\s*\d{6,15}/u.test(digitsNormalized)) {
    add("fail", "personal_identifier");
  }
  if (/\b\d{1,6}\s+[^\n,]{2,60}\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|lane|drive|boulevard|blvd\.?)\b/i.test(digitsNormalized)
    || /(?:خیابان|کوچه|پلاک)\s*.{2,60}\d/u.test(digitsNormalized)) add("fail", "address");
  if (field === "source_message_id" && /^\d{8,}$/.test(decoded)) add("needs_review", "possible_account_id");
  if (field === "source_message_id" && /(?:telegram|account|user)[_-]/i.test(decoded)) add("fail", "telegram_account_id");
  else if (field === "source_message_id" && /^[A-Za-z0-9_-]{8,}$/.test(decoded) && !/^\d{8,}$/.test(decoded)) {
    add("needs_review", "possible_account_id");
  }

  if (field === "name" && KNOWN_INSTITUTIONS.get(parent?.entity_type)?.has(value)) {
    exceptions.push({ path, rule: "institution_name", reason: `Reviewed ${parent.entity_type} institution label; contact details remain scanned.` });
    return;
  }
  const baseField = field.replace(/_(?:en|fa)$/, "");
  if (NARRATIVE_FIELDS.has(field) || NARRATIVE_FIELDS.has(baseField) || baseField === "name" || baseField === "title" || field === "source_name") {
    const explicitName = /\b(?:[Mm]r\.?|[Mm]rs\.?|[Mm]s\.?|[Dd]r\.?|[Nn]amed|[Aa]pplicant named|[Pp]erson named)\s+[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/u.test(decoded);
    const titleName = baseField === "title" && /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\s+(?:applied|filed|reported|said|shared)\b/.test(decoded);
    const prose = withoutSentenceOpeners(decoded);
    const englishNames = prose.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g) || [];
    const personAction = /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\s+(?:applied|confirmed|enrolled|filed|graduated|obtained|received|reported|said|shared|submitted)\b/u.exec(prose);
    const namedAction = /\b(?:[Aa]sk|[Cc]ontact|[Ee]mail|[Cc]all)\s+([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/u.exec(prose);
    const candidates = [...new Set([...englishNames, personAction?.[1], namedAction?.[1]].filter(Boolean))];
    let unreviewed = false;
    for (const phrase of candidates) {
      const entry = reviewedPhrase(phrase, datasetId, path);
      if (entry) exceptions.push({ path, rule: "reviewed_phrase", reason: `${phrase}: ${entry.reason} (reviewed ${entry.reviewedOn})` });
      else unreviewed = true;
    }
    if (explicitName || titleName || unreviewed) add("needs_review", "possible_full_name");
    if (/(?:آقای|خانم|نام(?:\s+متقاضی)?\s*[:：])\s*[؀-ۿ]{2,}\s+[؀-ۿ]{2,}/u.test(decoded)) {
      add("needs_review", "possible_full_name");
    }
    if ((field.endsWith("_fa") || NARRATIVE_FIELDS.has(field)) && /(?:^|[.!؟]\s*)[\p{Script=Arabic}]{2,}\s+[\p{Script=Arabic}]{2,}\s+(?:پرونده\s+را\s+(?:ثبت|ارسال)|درخواست\s+(?:داد|کرد)|گفت|اعلام\s+کرد)(?:\s|$)/u.test(decoded)) {
      add("needs_review", "possible_full_name");
    }
  }
  // Any URL is inspected, whatever its field name (for example a version 3 locator.value).
  if (/^https?:/i.test(decoded)) {
    try {
      const url = new URL(decoded);
      if (url.username || url.password) add("fail", "embedded_contact_locator");
      if (/[?&#](?:email|phone|user|account|passport|application|national)[_=]/i.test(url.search + url.hash)) {
        add("fail", "embedded_contact_locator");
      }
      if (/\/(?:u|users?|profiles?|people)\/[A-Za-z]+-[A-Za-z]+(?:\/|$)/i.test(url.pathname)) {
        add("needs_review", "possible_full_name_locator");
      }
    } catch {
      add("needs_review", "unparseable_locator");
    }
  }
}

export function inspectDatasetPrivacy(dataset, { datasetId = null } = {}) {
  const findings = [];
  const exceptions = [];
  function visit(value, path, field = "", parent = null) {
    if (typeof value === "string") inspectString(value, path, field, parent, findings, exceptions, datasetId);
    else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`, field, parent));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        // Localized {en, fa} values inherit their parent field's rules, e.g. claim.summary.fa is inspected as summary_fa.
        const inspectedField = (key === "en" || key === "fa") && field ? `${field}_${key}` : key;
        visit(item, path ? `${path}.${key}` : key, inspectedField, value);
      }
    }
  }
  visit(dataset, "");
  return {
    status: findings.some((item) => item.status === "fail") ? "fail" : findings.length ? "needs_review" : "pass",
    findings: findings.slice(0, 50),
    exceptions: exceptions.slice(0, 50)
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    // An optional store dataset id applies that dataset's reviewed phrases; without one only "*" scopes apply.
    const result = inspectDatasetPrivacy(JSON.parse(readFileSync(process.argv[2], "utf8")), { datasetId: process.argv[3] ?? null });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Privacy inspection failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
