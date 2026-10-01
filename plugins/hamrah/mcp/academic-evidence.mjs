import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Ajv from "ajv";
import { getDomain } from "tldts";
import { canonicalAcademicUrl, safeAcademicText, readBounded, safeSourceFailure, withinAcademicBudget } from "./academic-source-contract.mjs";
import { fetchOfficialAcademicPage } from "./academic-official-http.mjs";

const types = ["university", "program", "supervisor", "masters", "phd", "postdoc", "research_job", "funding", "grant"];
const claimSchema = { type: "object", additionalProperties: false, required: ["kind", "excerpt"], properties: {
  kind: { enum: ["title", "affiliation", "research", "program", "recruitment", "application", "funding", "requirement", "nationality"] },
  excerpt: { type: "string", minLength: 12, maxLength: 1200 }, mode: { enum: ["dated", "rolling"] },
  deadline: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, fundingStatus: { enum: ["guaranteed", "competitive", "none", "unknown"] }
} };
const schema = { type: "object", additionalProperties: false, required: ["type", "title", "institution", "countryCode", "url", "rorId", "claims"], properties: {
  type: { enum: types }, title: { type: "string", minLength: 2, maxLength: 300 }, institution: { type: "string", minLength: 2, maxLength: 200 },
  countryCode: { type: "string", pattern: "^[A-Z]{2}$" }, url: { type: "string", maxLength: 2000 }, rorId: { type: "string", pattern: "^https://ror\\.org/[a-z0-9]{9}$" },
  claims: { type: "array", minItems: 1, maxItems: 15, items: claimSchema }
} };
const validate = new Ajv({ allErrors: true }).compile(schema);
export const ACADEMIC_EVIDENCE_TOOL = { name: "verifyAcademicEvidence", title: "Check fresh official academic evidence",
  description: "Verify a public academic record against its ROR identity and freshly retrieved exact institutional page. Supply literal excerpts for each claim, never applicant facts. For supervisors, title is the public professional name/title and an affiliation excerpt must explicitly contain that name/title and institution and establish current membership; research relevance alone is insufficient. A supported future application window is required for open calls; research relevance never establishes recruitment or funding. External job boards require current official delegation. Returns signed, short-lived evidence for renderAcademicDiscoveryReport. Blocked or ambiguous sources stay unverified; continue host/browser research.",
  inputSchema: schema, annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false } };

export function academicEvidenceKey(options = {}) {
  const env = options.env ?? process.env;
  const key = options.evidenceKey ?? env.HAMRAH_ACADEMIC_EVIDENCE_KEY;
  if (key?.length >= 24) return key;
  // Domain separation: no credential itself is disclosed or included in tokens.
  const redis = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return redis ? createHmac("sha256", redis).update("hamrah-academic-evidence-signing-v1").digest() : null;
}
function signEvidence(record, key) {
  const payload = Buffer.from(JSON.stringify(record)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
export function readAcademicEvidenceToken(token, options = {}) {
  const key = academicEvidenceKey(options);
  if (!key || typeof token !== "string" || token.length > 40000) return null;
  try {
    const parts = token.split("."); if (parts.length !== 2) return null;
    const signature = Buffer.from(parts[1], "base64url"), expected = createHmac("sha256", key).update(parts[0]).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const record = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const now = (options.now?.() ?? new Date()).getTime();
    if ((options.allowHistorical ? !["1", "2"].includes(record.policyVersion) : record.policyVersion !== "2") || !Number.isFinite(Date.parse(record.checkedAt))
      || (!options.allowHistorical && (Date.parse(record.checkedAt) > now || now - Date.parse(record.checkedAt) > 15 * 60000))) return null;
    return record;
  } catch { return null; }
}
export function officialText(body) {
  return body.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (entity, hex, decimal) => {
      const point = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
    })
    .normalize("NFKC").replace(/\s+/g, " ").trim();
}
function hasText(text, excerpt) { return text.toLowerCase().includes(officialText(excerpt).toLowerCase()); }
function validDay(day) { return /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day; }
function applicationValid(claim, today) {
  if (!claim || /closed|no longer|not accepting|expired|بسته|پایان یافته/i.test(claim.excerpt)) return false;
  if (claim.mode === "rolling") return /rolling|applications? (?:are )?(?:open|accepted)|پذیرش مستمر/i.test(claim.excerpt);
  if (claim.mode !== "dated" || !claim.deadline || !validDay(claim.deadline) || claim.deadline <= today) return false;
  // Require a literal date in the fetched excerpt, rather than trusting a supplied date field.
  const date = new Date(`${claim.deadline}T00:00:00Z`);
  const forms = [claim.deadline, date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })];
  return /apply|applications?|deadline|closing|bewerb|frist|مهلت/i.test(claim.excerpt) && forms.some((f) => claim.excerpt.includes(f));
}
export async function verifyAcademicEvidence(input, fetchImpl, signal, options = {}) {
  if (!validate(input) || !safeAcademicText(input.title) || !safeAcademicText(input.institution, 200)
    || input.claims.some((c) => /[<>@`]/.test(c.excerpt))) return { error: "invalid_academic_evidence_input" };
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const base = { verificationStatus: "unverified", checkedAt, reasons: [], evidenceToken: null };
  try {
    return await withinAcademicBudget(async (child) => {
      const ror = JSON.parse(await readBounded(await fetchImpl(`https://api.ror.org/v2/organizations/${input.rorId.split("/").at(-1)}`,
        { redirect: "error", headers: { Accept: "application/json" }, signal: child })));
      const homepage = canonicalAcademicUrl(ror.links?.find((l) => l.type === "website")?.value);
      if (ror.id !== input.rorId || ror.status !== "active" || !ror.types?.some((t) => ["education", "government", "nonprofit", "facility"].includes(t))
        || !homepage || !ror.names?.some((n) => n.value?.toLowerCase() === input.institution.toLowerCase())
        || !ror.locations?.some((l) => l.geonames_details?.country_code === input.countryCode)) return { ...base, reasons: ["institution_identity_not_confirmed"] };
      const url = canonicalAcademicUrl(input.url);
      if (!url) return { ...base, reasons: ["unsafe_source_url"] };
      const websiteHost = new URL(homepage).hostname;
      const institutionHost = getDomain(websiteHost, { allowPrivateDomains: true }) ?? websiteHost;
      const sourceHost = new URL(url).hostname;
      const onInstitution = sourceHost === institutionHost || sourceHost.endsWith(`.${institutionHost}`);
      if (!onInstitution) {
        const home = await fetchOfficialAcademicPage(homepage, fetchImpl, child, options);
        const body = await readBounded(home.response, 500000);
        const delegated = [...body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].some((m) => {
          const link = canonicalAcademicUrl(new URL(m[1], homepage).href);
          if (!link) return false;
          const target = new URL(link), posting = new URL(url);
          return target.host === posting.host && target.pathname !== "/" && (posting.pathname === target.pathname || posting.pathname.startsWith(`${target.pathname.replace(/\/$/, "")}/`));
        });
        if (!delegated) return { ...base, reasons: ["publisher_delegation_not_confirmed"] };
      }
      const page = await fetchOfficialAcademicPage(url, fetchImpl, child, options);
      if (!/text\/html|application\/json|text\/plain/.test(page.response.headers.get("content-type") ?? "")) return { ...base, reasons: ["unsupported_official_document"] };
      const raw = await readBounded(page.response, 500000), content = officialText(raw);
      const missing = input.claims.filter((c) => !hasText(content, c.excerpt));
      const titleClaim = input.claims.find((c) => c.kind === "title" && hasText(c.excerpt, input.title));
      if (missing.length || !titleClaim) return { ...base, reasons: ["official_claim_not_found"] };
      if (input.type === "program" && !input.claims.some((c) => c.kind === "requirement")) return { ...base, reasons: ["admission_requirements_not_confirmed"] };
      const application = input.claims.find((c) => c.kind === "application");
      const call = ["masters", "phd", "postdoc", "research_job", "funding"].includes(input.type);
      const isOpen = applicationValid(application, checkedAt.slice(0, 10));
      if (call && (!isOpen || /(?:applications?|position|vacancy|call) (?:are |is )?(?:closed|filled)|no longer accepting applications/i.test(content))) return { ...base, reasons: ["current_open_call_not_confirmed"] };
      if (input.type === "supervisor" && !input.claims.some((c) => c.kind === "research")) return { ...base, reasons: ["research_relevance_not_confirmed"] };
      if (input.type === "supervisor") {
        const affiliation = input.claims.find((c) => c.kind === "affiliation" && hasText(c.excerpt, input.title) && hasText(c.excerpt, input.institution));
        const position = affiliation ? content.toLowerCase().indexOf(officialText(affiliation.excerpt).toLowerCase()) : -1;
        const context = position < 0 ? "" : content.slice(Math.max(0, position - 100), position + officialText(affiliation.excerpt).length + 100);
        if (!affiliation || /(?:former|previous)\s+(?:professor|researcher|faculty|member)|(?:not|no longer)\s+(?:affiliated|employed|at|a professor|a researcher)|سابق|پیشین|قبلاً/i.test(context)) return { ...base, reasons: ["current_affiliation_not_confirmed"] };
      }
      const funding = input.claims.find((c) => c.kind === "funding");
      const fundingPosition = funding ? content.toLowerCase().indexOf(officialText(funding.excerpt).toLowerCase()) : -1;
      const fundingContext = fundingPosition < 0 ? "" : content.slice(Math.max(0, fundingPosition - 160), fundingPosition + officialText(funding.excerpt).length + 160);
      const fundingStatus = input.type === "grant" ? "unknown" : funding?.fundingStatus === "guaranteed" && /salary|stipend|fully funded|tuition waiver|حقوق|کمک هزینه/i.test(funding.excerpt)
        && !["funding", "grant", "university"].includes(input.type) && !/\bno\b|\bnot\b|without|competitive|\bmay\b|subject to|conditional|depending on|مشروط|رقابتی|ندارد|بدون/i.test(fundingContext) ? "guaranteed"
        : funding?.fundingStatus === "competitive" ? "competitive" : "unknown";
      const record = { policyVersion: "2", type: input.type, title: input.title, institution: input.institution, countryCode: input.countryCode,
        rorId: input.rorId, url: page.url, checkedAt, verificationStatus: call ? "verified_open" : "verified_official_record",
        applicationStatus: isOpen ? "open" : "unknown", deadline: isOpen ? application.deadline ?? null : null,
        fundingStatus, recruitmentStatus: input.claims.some((c) => c.kind === "recruitment" && /accepting|recruiting|open position|جذب/i.test(c.excerpt)
          && !/\bnot\b|\bno\b|closed|ندارد|نمی|بسته/i.test(c.excerpt)) ? "documented" : "unknown",
        claims: input.claims.map((c) => ({ ...c, sourceUrl: page.url })), sourceHash: createHash("sha256").update(content).digest("hex") };
      const key = academicEvidenceKey(options);
      return { ...record, reasons: key ? [] : ["evidence_signing_not_configured"], evidenceToken: key ? signEvidence(record, key) : null };
    }, signal, options.verificationTimeoutMs ?? 12000);
  } catch (error) { return { ...base, reasons: [safeSourceFailure(error)] }; }
}
