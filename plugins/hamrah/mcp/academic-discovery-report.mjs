import Ajv from "ajv";
import { ACADEMIC_TYPES, ACADEMIC_DISCOVERY_TOOL, academicId, canonicalTerm, canonicalResearchText, normalizeAcademicInput, renderDiscoveryMarkdown } from "./academic-discovery.mjs";
import { readAcademicEvidenceToken } from "./academic-evidence.mjs";
import { canonicalAcademicUrl, safeAcademicText } from "./academic-source-contract.mjs";

const candidateSchema = { type: "object", additionalProperties: false, required: ["kind", "title", "url"], properties: {
  kind: { enum: ACADEMIC_TYPES }, title: { type: "string", minLength: 2, maxLength: 300 }, url: { type: "string", maxLength: 2000 },
  institution: { type: ["string", "null"], maxLength: 200 }, countryCode: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
  reason: { type: "string", maxLength: 160 }
} };
const schema = { type: "object", additionalProperties: false, required: ["request", "evidenceTokens", "candidates"], properties: {
  request: ACADEMIC_DISCOVERY_TOOL.inputSchema,
  evidenceTokens: { type: "array", maxItems: 20, items: { type: "string", maxLength: 40000 } },
  candidates: { type: "array", maxItems: 20, items: candidateSchema },
  sourceCoverage: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["source", "status"], properties: {
    source: { type: "string", maxLength: 120 }, status: { enum: ["ok", "failed", "unavailable"] }, query: { type: "string", maxLength: 300 } } } },
  previousEvidenceTokens: { type: "array", maxItems: 20, items: { type: "string", maxLength: 40000 } }
} };
const validate = new Ajv({ allErrors: true }).compile(schema);
export const ACADEMIC_DISCOVERY_REPORT_TOOL = { name: "renderAcademicDiscoveryReport", title: "Render a consistent Persian academic report",
  description: "Render a consistent public-evidence Persian academic report from fresh verifyAcademicEvidence tokens. Tokens are checked, not caller verification flags. Separate verified records from candidates, research fit from funding, and unknown eligibility from exclusions. Send public facts only; compare private applicant facts locally using the academic discovery fit-note script. Include actual source coverage. Export the final report in this conversation/file and continue web research for missing coverage; no admission probability.",
  inputSchema: schema, annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false } };

export function renderAcademicDiscoveryReport(input, options = {}) {
  const scope = normalizeAcademicInput(input?.request);
  if (!validate(input) || !scope) return { error: "invalid_academic_report_input" };
  const checkedAt = (options.now?.() ?? new Date()).toISOString(), failures = [], exclusions = [];
  const records = new Map();
  for (const token of input.evidenceTokens) {
    const record = readAcademicEvidenceToken(token, options);
    if (!record) { failures.push({ source: "evidence", reason: "invalid_or_expired_evidence_token" }); continue; }
    if (record.type !== scope.type || (scope.countryCode && record.countryCode !== scope.countryCode)
      || (scope.institution && canonicalTerm(record.institution) !== scope.institution)) { exclusions.push({ url: record.url, reason: "outside_requested_scope" }); continue; }
    if (scope.fundingRequired && record.fundingStatus !== "guaranteed") { exclusions.push({ url: record.url, reason: "guaranteed_funding_not_confirmed" }); continue; }
    const publicEvidence = canonicalResearchText([record.title, ...record.claims.filter((c) => ["research", "program"].includes(c.kind)).map((c) => c.excerpt)].join(" "));
    const topics = [scope.field, scope.researchFocus].filter(Boolean);
    const matchedTopics = topics.filter((term) => publicEvidence.includes(term));
    if (!matchedTopics.length && !["university", "grant"].includes(scope.type)) { exclusions.push({ url: record.url, reason: "research_relevance_not_confirmed" }); continue; }
    const id = academicId([record.type, record.url]);
    records.set(id, { ...record, id, researchFit: { matchedTopics, status: matchedTopics.length === topics.length ? "relevant" : "partial", explanation: "ارتباط بر اساس عنوان و شواهد پژوهشی رسمی ثبت‌شده است؛ معادل واجدشرایط‌بودن یا پذیرش نیست." },
      applicantFit: { status: "not_fully_assessed", gaps: ["بررسی همهٔ شرایط رسمی، زبان و سابقهٔ تحصیلی هنوز لازم است."] } });
  }
  const ordered = [...records.values()].sort((a, b) => b.researchFit.matchedTopics.length - a.researchFit.matchedTopics.length || a.id.localeCompare(b.id, "en"));
  const seen = new Set(ordered.map((r) => r.url));
  const candidates = input.candidates.flatMap((r) => {
    const url = canonicalAcademicUrl(r.url);
    if (!url || !safeAcademicText(r.title) || seen.has(url) || r.kind !== scope.type
      || (scope.countryCode && r.countryCode && scope.countryCode !== r.countryCode)
      || (scope.institution && r.institution && canonicalTerm(r.institution) !== scope.institution)) return [];
    seen.add(url); return [{ ...r, url, id: academicId([r.kind, url]), verificationStatus: "unverified", fundingStatus: "unknown", applicationStatus: "unknown" }];
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const sources = [...(input.sourceCoverage ?? [])].sort((a, b) => a.source.localeCompare(b.source, "en"));
  for (const source of sources.filter((s) => s.status !== "ok")) failures.push({ source: source.source, reason: "source_not_successfully_checked" });
  const report = { schemaVersion: "1.0.0", reportId: academicId({ scope, checkedAt, records: ordered.map((r) => [r.id, r.sourceHash]) }), checkedAt, scope,
    policyVersions: { query: "2", ranking: "2", evidence: "3" },
    inputCompleteness: { mode: "exploratory", missing: ["complete_requirement_comparison"] },
    status: "partial", coverage: { sources, countriesChecked: [...new Set(ordered.map((r) => r.countryCode))].sort(), failures,
      truncated: ordered.length > scope.limit || candidates.length > scope.limit, globalCoverage: "not_established" },
    verifiedResults: ordered.slice(0, scope.limit), discoveryCandidates: candidates.slice(0, scope.limit), exclusions: exclusions.sort((a, b) => a.url.localeCompare(b.url, "en")),
    changes: [], nextActions: ["شرایط دقیق زبان، مدرک و مهلت را پیش از اقدام بررسی کنید.", "برای پوشش بیشتر، جستجوی وب و بررسی رسمی را ادامه دهید."] };
  // Old signatures establish prior evidence provenance; their freshness is not reused for current verification.
  for (const token of input.previousEvidenceTokens ?? []) {
    const old = readAcademicEvidenceToken(token, { ...options, now: () => new Date(0), allowHistorical: true });
    if (!old) continue;
    const current = ordered.find((r) => r.url === old.url);
    report.changes.push({ url: old.url, status: !current ? "not_reverified" : old.sourceHash !== current.sourceHash ? "official_evidence_changed" : "unchanged" });
  }
  report.changes.sort((a, b) => a.url.localeCompare(b.url, "en"));
  report.markdown = renderDiscoveryMarkdown(report);
  return report;
}
