import { renderDiscoveryMarkdown } from "../skills/hamrah-program-finder/scripts/academic_discovery_report_format.mjs";
export { renderDiscoveryMarkdown };
import { createHash } from "node:crypto";
import Ajv from "ajv";
import { collectAcademicSources } from "./academic-sources.mjs";
import { canonicalAcademicUrl } from "./academic-source-contract.mjs";
import { publicAcademicStoreFromEnv } from "./academic-public-store.mjs";

export const ACADEMIC_TYPES = ["university", "program", "supervisor", "masters", "phd", "postdoc", "research_job", "funding", "grant"];
const text = { type: "string", minLength: 2, maxLength: 160 };
const schema = { type: "object", additionalProperties: false, required: ["type", "field"], properties: {
  type: { enum: ACADEMIC_TYPES }, field: text, researchFocus: text, institution: text,
  countryCode: { type: "string", pattern: "^[A-Z]{2}$" }, fundingRequired: { type: "boolean" },
  limit: { type: "integer", minimum: 1, maximum: 10 }
} };
const validate = new Ajv({ allErrors: true }).compile(schema);
export const ACADEMIC_DISCOVERY_TOOL = { name: "discoverAcademicMatches", title: "Academic discovery with source coverage",
  description: "On an explicit academic request, discover universities, programs, supervisors, research positions, scholarships or research grants using APIs and bounded web search. Send only public field/topic/institution/country terms, never applicant facts. Returns a consistent Persian exploratory report and unverified candidates. Verify exact official pages with verifyAcademicEvidence, then renderAcademicDiscoveryReport; grant awards do not establish student funding. Continue host web research when source coverage is partial.",
  inputSchema: schema, annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false } };

const aliases = new Map([
  ["ai", "artificial intelligence"], ["هوش مصنوعی", "artificial intelligence"],
  ["یادگیری ماشین", "machine learning"], ["ml", "machine learning"],
  ["علوم کامپیوتر", "computer science"], ["فیزیک", "physics"], ["زیست شناسی", "biology"]
]);
export function canonicalTerm(value) {
  const term = value.normalize("NFKC").replace(/[\u200c\u200d]/g, " ").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک")
    .toLowerCase().replace(/\s+/g, " ").trim();
  return aliases.get(term) ?? term;
}
export function publicSearchText(value) {
  return !/[<>@`\r\n]|https?:|www\.|\b(?:passport|email|phone|address)\b|ایمیل|شماره|آدرس|\d[\d\s().+-]{6,}\d/iu.test(value);
}
export function academicId(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24); }
export function normalizeAcademicInput(input) {
  if (!validate(input) || [input.field, input.researchFocus, input.institution].filter(Boolean).some((v) => !publicSearchText(v))) return null;
  return { type: input.type, field: canonicalTerm(input.field), researchFocus: input.researchFocus ? canonicalTerm(input.researchFocus) : null,
    institution: input.institution ? canonicalTerm(input.institution) : null, countryCode: input.countryCode ?? null,
    fundingRequired: input.fundingRequired ?? false, limit: input.limit ?? 10 };
}
export async function discoverAcademicMatches(input, fetchImpl, signal, options = {}) {
  const scope = normalizeAcademicInput(input);
  if (!scope) return { error: "invalid_academic_discovery_input", message: "Use public academic terms only; applicant facts are not accepted." };
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const store = Object.hasOwn(options, "store") ? options.store : publicAcademicStoreFromEnv(options.env ?? process.env, fetchImpl);
  const collected = await collectAcademicSources(scope, fetchImpl, signal, { ...options, store, checkedAt });
  const queryPlan = collected.queryPlan;
  const byUrl = new Map();
  for (const result of collected.candidates.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"))) {
    const url = canonicalAcademicUrl(result.url);
    if (!url) continue;
    const key = `${result.kind}:${url}`;
    if (!byUrl.has(key)) byUrl.set(key, { ...result, url, id: academicId(key), fundingStatus: "unknown", applicationStatus: "unknown" });
  }
  const candidateRank = (r) => (scope.institution && canonicalTerm(r.institution ?? r.title) === scope.institution ? 100 : 0)
    + (r.discoverySource === "ror" ? 10 : 0) + ([scope.field, scope.researchFocus].filter(Boolean).filter((term) => canonicalTerm(r.title).includes(term)).length);
  const candidates = [...byUrl.values()].sort((a, b) => candidateRank(b) - candidateRank(a) || a.url.localeCompare(b.url, "en"));
  const report = { schemaVersion: "1.0.0", reportId: academicId({ scope, checkedAt, candidates, sources: collected.sources, researchContext: collected.researchContext }), checkedAt, scope,
    policyVersions: { query: "1", ranking: "1", evidence: "2" },
    inputCompleteness: { mode: "exploratory", missing: ["applicant_academic_facts", ...(!scope.countryCode ? ["country_scope"] : [])] },
    queryPlan, status: "partial", coverage: { sources: collected.sources, countriesChecked: collected.countriesChecked, failures: collected.failures, truncated: collected.truncated || candidates.length > scope.limit, globalCoverage: "not_established" },
    verifiedResults: [], discoveryCandidates: candidates.slice(0, scope.limit), researchContext: collected.researchContext, exclusions: [], changes: [],
    nextActions: ["جستجوی وب و بررسی صفحهٔ دقیق رسمی را ادامه دهید.", "برای تطبیق دقیق‌تر، سابقهٔ دانشگاهی و نیاز به فاند را مشخص کنید."] };
  report.markdown = renderDiscoveryMarkdown(report);
  return report;
}
