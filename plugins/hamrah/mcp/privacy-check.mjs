import { readFileSync } from "node:fs";

const NARRATIVE_FIELDS = new Set([
  "summary_en", "summary_fa", "evidence_summary", "resolution_summary", "current_evidence",
  "practical_impact", "who_should_care", "recommended_action", "known_workaround",
  "reason", "what_would_confirm_it"
]);
const DOMAIN_PHRASES = new Set(["Global Talent", "United Kingdom", "Peer Review", "Example Community"]);
const KNOWN_INSTITUTIONS = new Map([
  ["vac", new Set(["Tehran UK Visa Application Centre"])]
]);

function inspectString(value, path, field, parent, findings, exceptions) {
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
  if (/\b(?:telegram|account|chat|user|application|passport|national)[ _-]?(?:id|number|no\.?)[\s:#=-]*[A-Za-z0-9_-]{4,}\b/i.test(decoded)) {
    add("fail", "personal_identifier");
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
  if (NARRATIVE_FIELDS.has(field) || field === "name" || field === "title" || field === "source_name") {
    const explicitName = /\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|named|applicant named|person named)\s+[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/i.test(decoded);
    const titleName = field === "title" && /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\s+(?:applied|filed|reported|said|shared)\b/.test(decoded);
    const englishNames = NARRATIVE_FIELDS.has(field) || field === "name" || field === "source_name"
      ? (decoded.match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g) || [])
      : [];
    for (const phrase of englishNames.filter((candidate) => DOMAIN_PHRASES.has(candidate))) {
      exceptions.push({ path, rule: "domain_phrase", reason: `${phrase} is an exact route, country, or process label.` });
    }
    if (explicitName || titleName || englishNames.some((candidate) => !DOMAIN_PHRASES.has(candidate))) add("needs_review", "possible_full_name");
    if (/(?:آقای|خانم|نام(?:\s+متقاضی)?\s*[:：])\s*[؀-ۿ]{2,}\s+[؀-ۿ]{2,}/u.test(decoded)) {
      add("needs_review", "possible_full_name");
    }
    if ((field.endsWith("_fa") || NARRATIVE_FIELDS.has(field)) && /(?:^|[.!؟]\s*)[\p{Script=Arabic}]{2,}\s+[\p{Script=Arabic}]{2,}\s+(?:پرونده|درخواست|گفت|اعلام)(?:\s|$)/u.test(decoded)) {
      add("needs_review", "possible_full_name");
    }
  }
  if (field.endsWith("_url") && /^https?:/i.test(decoded)) {
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

export function inspectDatasetPrivacy(dataset) {
  const findings = [];
  const exceptions = [];
  function visit(value, path, field = "", parent = null) {
    if (typeof value === "string") inspectString(value, path, field, parent, findings, exceptions);
    else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`, field, parent));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key, key, value);
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
    const result = inspectDatasetPrivacy(JSON.parse(readFileSync(process.argv[2], "utf8")));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Privacy inspection failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
