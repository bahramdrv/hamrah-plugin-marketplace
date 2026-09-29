import Ajv from "ajv";

const str = (maxLength = 500) => ({ type: "string", minLength: 1, maxLength });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const url = { type: "string", pattern: "^https://[^\\s()\\[\\]<>]+$", maxLength: 500 };
const day = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const evidence = { type: "object", additionalProperties: false, required: ["sourceUrl", "sourceExcerpt"],
  properties: { sourceUrl: url, sourceExcerpt: str(500) } };
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const category = { enum: ["masters", "phd", "postdoc", "research_job"] };
const call = {
  type: "object", additionalProperties: false,
  required: ["id", "kind", "targetCategory", "title", "institution", "countryCode", "field", "officialUrl",
    "titleEvidence", "application", "conditions", "funding", "nationalityEvidence", "linkedAdmissionId", "applicabilityEvidence"],
  properties: {
    id: str(120), kind: { enum: ["admission_call", "funding_call", "research_vacancy"] },
    targetCategory: category, title: str(250), institution: str(200), countryCode: country,
    field: str(120), officialUrl: url, titleEvidence: evidence,
    application: { type: "object", additionalProperties: false,
      required: ["mode", "deadline", "sourceUrl", "sourceExcerpt"],
      properties: { mode: { enum: ["dated", "rolling"] }, deadline: nullable(day),
        sourceUrl: url, sourceExcerpt: str(500) } },
    conditions: { type: "array", minItems: 1, maxItems: 15, items: {
      type: "object", additionalProperties: false, required: ["text", "sourceUrl", "sourceExcerpt"],
      properties: { text: str(300), sourceUrl: url, sourceExcerpt: str(500) }
    } },
    funding: { type: "object", additionalProperties: false,
      required: ["status", "terms", "sourceUrl", "sourceExcerpt"],
      properties: { status: { enum: ["verified", "competitive", "unknown"] },
        terms: nullable(str(300)), sourceUrl: nullable(url), sourceExcerpt: nullable(str(500)) } },
    nationalityEvidence: { type: "object", additionalProperties: false,
      required: ["status", "sourceUrl", "sourceExcerpt"],
      properties: { status: { enum: ["unknown", "explicit_permission"] },
        sourceUrl: nullable(url), sourceExcerpt: nullable(str(500)) } },
    linkedAdmissionId: nullable(str(120)), applicabilityEvidence: nullable(evidence)
  }
};
const inputSchema = {
  type: "object", additionalProperties: false, required: ["checkedAt", "scope", "coverage", "calls"],
  properties: {
    checkedAt: day,
    scope: { type: "object", additionalProperties: false, required: ["field", "targetCategory", "countryCodes", "fundingRequired"],
      properties: { field: nullable(str(120)), targetCategory: nullable(category),
        countryCodes: { type: "array", maxItems: 30, uniqueItems: true, items: country }, fundingRequired: { type: "boolean" } } },
    coverage: { type: "object", additionalProperties: false,
      required: ["apiSources", "webSearches", "countriesChecked", "candidatesChecked", "excluded", "failures", "truncated"],
      properties: {
        apiSources: { type: "array", maxItems: 20, items: str(100) },
        webSearches: { type: "array", maxItems: 20, items: str(200) },
        countriesChecked: { type: "array", maxItems: 100, uniqueItems: true, items: country },
        candidatesChecked: { type: "integer", minimum: 0 },
        excluded: { type: "array", maxItems: 100, items: {
          type: "object", additionalProperties: false, required: ["reason", "count"],
          properties: { reason: { enum: ["expired_deadline", "not_open", "unverified_official_page",
            "unverified_conditions", "unverified_funding", "out_of_scope", "nationality_restriction", "duplicate"] },
            count: { type: "integer", minimum: 1 }, title: str(250), sourceUrl: url, sourceExcerpt: str(500) }
        } },
        failures: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false,
          required: ["source", "reason"], properties: { source: str(100), reason: str(300) } } },
        truncated: { type: "boolean" }
      }
    },
    calls: { type: "array", maxItems: 20, items: call }
  }
};

export const OPEN_ACADEMIC_CALL_REPORT_TOOL = {
  name: "renderOpenAcademicCallReport",
  title: "Validate and render open academic calls",
  description: "Render a consistent Persian report from public, current official-page evidence for admissions, funding and research vacancies. The caller must inspect official sources first. This tool checks the supplied evidence structure, not the live page; do not send an applicant profile.",
  inputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
};

const validate = new Ajv({ allErrors: true }).compile(inputSchema);
const normalized = (value) => String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const safe = (value) => String(value).replace(/[\\`*_[\]<>|\r\n]/g, "\\$&");
const validDay = (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const names = { admission_call: "فراخوان پذیرش", funding_call: "فراخوان فاند", research_vacancy: "آگهی پژوهشی" };
const fundingNames = { verified: "شرایط مالی تأییدشده", competitive: "فاند رقابتی؛ دریافت آن قطعی نیست", unknown: "فاند نامعلوم" };
const fundingRank = { verified: 0, competitive: 1, unknown: 2 };

function rankedCalls(calls, field) {
  const query = normalized(field);
  return structuredClone(calls).sort((a, b) =>
    Number(normalized(b.title).includes(query)) - Number(normalized(a.title).includes(query))
    || fundingRank[a.funding.status] - fundingRank[b.funding.status]
    || (a.application.deadline ?? "9999-12-31").localeCompare(b.application.deadline ?? "9999-12-31")
    || a.officialUrl.localeCompare(b.officialUrl));
}

function checkCall(item, input, ids, errors) {
  if (ids.has(item.id)) errors.push(`calls.${item.id}: duplicate id`);
  ids.add(item.id);
  if (item.kind !== "research_vacancy" && !["masters", "phd"].includes(item.targetCategory)) {
    errors.push(`calls.${item.id}: admission/funding calls require masters or phd`);
  }
  if (item.kind === "research_vacancy" && item.targetCategory === "masters") {
    errors.push(`calls.${item.id}: a masters research job uses research_job category`);
  }
  if (input.scope.targetCategory && item.targetCategory !== input.scope.targetCategory) errors.push(`calls.${item.id}: outside requested category`);
  if (input.scope.countryCodes.length && !input.scope.countryCodes.includes(item.countryCode)) errors.push(`calls.${item.id}: outside requested country`);
  if (normalized(item.field) !== normalized(input.scope.field)) errors.push(`calls.${item.id}: field differs from search scope`);
  if (!normalized(item.titleEvidence.sourceExcerpt).includes(normalized(item.title))) errors.push(`calls.${item.id}: title not found in official excerpt`);
  if (!validDay(input.checkedAt) || input.checkedAt !== new Date().toISOString().slice(0, 10)) errors.push("checkedAt: must be today's UTC date");
  const app = item.application;
  if (app.mode === "dated" && (!app.deadline || !validDay(app.deadline) || app.deadline <= input.checkedAt)) {
    errors.push(`calls.${item.id}: deadline is not future and valid`);
  }
  if (app.mode === "rolling" && app.deadline !== null) errors.push(`calls.${item.id}: rolling call must have null deadline`);
  const fund = item.funding;
  if (fund.status === "unknown" && [fund.terms, fund.sourceUrl, fund.sourceExcerpt].some((value) => value !== null)) {
    errors.push(`calls.${item.id}: unknown funding cannot carry verified terms`);
  }
  if (fund.status !== "unknown" && (!fund.terms || !fund.sourceUrl || !fund.sourceExcerpt
    || !normalized(fund.sourceExcerpt).includes(normalized(fund.terms)))) {
    errors.push(`calls.${item.id}: funding terms require a matching official excerpt`);
  }
  const nationality = item.nationalityEvidence;
  if (nationality.status === "unknown" && (nationality.sourceUrl !== null || nationality.sourceExcerpt !== null)) {
    errors.push(`calls.${item.id}: unknown nationality evidence must have null source`);
  }
  if (nationality.status === "explicit_permission" && (!nationality.sourceUrl || !nationality.sourceExcerpt)) {
    errors.push(`calls.${item.id}: explicit permission requires official evidence`);
  }
  if (item.linkedAdmissionId || item.applicabilityEvidence) {
    if (item.kind !== "funding_call" || !item.linkedAdmissionId || !item.applicabilityEvidence) {
      errors.push(`calls.${item.id}: linked admission requires funding call and applicability evidence`);
    }
  }
  if (input.scope.fundingRequired && item.kind === "research_vacancy" && fund.status === "unknown") {
    errors.push(`calls.${item.id}: funding required but vacancy funding is unknown`);
  }
  if (input.scope.fundingRequired && item.kind === "funding_call" && fund.status === "unknown") {
    errors.push(`calls.${item.id}: funding call has no verified terms`);
  }
}

function renderCall(item) {
  return [
    `### ${names[item.kind]}: [${safe(item.title)}](${item.officialUrl})`,
    `- نوع: ${safe(item.targetCategory)} · کشور: ${item.countryCode} · مؤسسه: ${safe(item.institution)}`,
    `- موضوع: ${safe(item.field)}`,
    `- مدرک عنوان: ${safe(item.titleEvidence.sourceExcerpt)} ([منبع رسمی](${item.titleEvidence.sourceUrl}))`,
    `- پذیرش درخواست: باز؛ ${safe(item.application.sourceExcerpt)} ([منبع رسمی](${item.application.sourceUrl}))`,
    `- مهلت: ${item.application.mode === "rolling" ? "شناور" : item.application.deadline}`,
    ...item.conditions.map((condition) => `- شرط: ${safe(condition.text)} — ${safe(condition.sourceExcerpt)} ([منبع رسمی](${condition.sourceUrl}))`),
    `- فاند: ${fundingNames[item.funding.status]}${item.funding.terms ? `؛ ${safe(item.funding.terms)} ([منبع رسمی](${item.funding.sourceUrl}))` : ""}`,
    `- وضعیت شرط تابعیت ایرانی: ${item.nationalityEvidence.status === "unknown" ? "نامعلوم" : `مجوز صریح؛ ${safe(item.nationalityEvidence.sourceExcerpt)} ([منبع رسمی](${item.nationalityEvidence.sourceUrl}))`}`,
    ...(item.applicabilityEvidence ? [`- ارتباط بورسیه با پذیرش ${safe(item.linkedAdmissionId)}: ${safe(item.applicabilityEvidence.sourceExcerpt)} ([منبع رسمی](${item.applicabilityEvidence.sourceUrl}))`] : [])
  ].join("\n");
}

export function renderOpenAcademicCallReport(input) {
  if (!validate(input)) return { error: "invalid_open_academic_call_report", details: validate.errors?.map((e) =>
    `${e.instancePath || "root"}${e.params?.additionalProperty ? `.${e.params.additionalProperty}` : ""}: ${e.message}`) ?? [] };
  const errors = [];
  const missing = !input.scope.field || !input.scope.targetCategory;
  if (!validDay(input.checkedAt) || input.checkedAt !== new Date().toISOString().slice(0, 10)) errors.push("checkedAt: must be today's UTC date");
  if (missing && (input.calls.length || input.coverage.candidatesChecked)) errors.push("missing scope requires no results or candidates");
  if (input.calls.length > input.coverage.candidatesChecked) errors.push("results exceed candidates checked");
  const ids = new Set();
  const urls = new Set();
  for (const item of input.calls) {
    checkCall(item, input, ids, errors);
    if (urls.has(item.officialUrl)) errors.push(`calls.${item.id}: duplicate official URL`);
    urls.add(item.officialUrl);
  }
  for (const item of input.calls) if (item.linkedAdmissionId && !input.calls.some((other) =>
    other.id === item.linkedAdmissionId && other.kind === "admission_call")) {
    errors.push(`calls.${item.id}: linked admission is absent`);
  }
  if (input.scope.fundingRequired) for (const item of input.calls) if (item.kind === "admission_call"
    && item.funding.status === "unknown" && !input.calls.some((other) =>
      other.kind === "funding_call" && other.linkedAdmissionId === item.id && other.funding.status !== "unknown")) {
    errors.push(`calls.${item.id}: funded admission lacks a linked sourced funding call`);
  }
  for (const excluded of input.coverage.excluded) if (excluded.reason === "nationality_restriction"
    && (!excluded.title || !excluded.sourceUrl || !excluded.sourceExcerpt)) {
    errors.push("nationality restriction exclusion requires a cited title and official excerpt");
  }
  const accounted = input.calls.length + input.coverage.excluded.reduce((sum, item) => sum + item.count, 0);
  if (accounted !== input.coverage.candidatesChecked) errors.push("coverage: candidates checked must equal results plus exclusions");
  if (errors.length) return { error: "invalid_open_academic_call_report", details: [...new Set(errors)] };

  const excludedByReason = Object.fromEntries([...new Set(input.coverage.excluded.map((item) => item.reason))]
    .map((reason) => [reason, input.coverage.excluded.filter((item) => item.reason === reason).reduce((sum, item) => sum + item.count, 0)]));
  const coverage = { ...input.coverage, excludedByReason,
    status: input.coverage.failures.length || input.coverage.truncated ? "partial" : "complete_within_budget" };
  const status = missing ? "needs_input" : input.calls.length ? "results"
    : (!coverage.apiSources.length && !coverage.webSearches.length) || coverage.failures.length ? "research_required" : "no_verified_results";
  const nextQuestion = missing ? !input.scope.field ? "رشته یا موضوع پژوهشی مدنظرتان چیست؟" : "مقطع یا نوع موقعیت مدنظرتان چیست؟" : null;
  const nextAction = missing ? null : input.calls.length ? "پیش از اقدام، صفحهٔ رسمی هر فراخوان را دوباره بررسی کنید."
    : "دامنه یا منابع جست‌وجو را گسترش دهید و صفحه‌های رسمی را دوباره بررسی کنید.";
  const ordered = rankedCalls(input.calls, input.scope.field);
  const report = { schemaVersion: "1.0.0", status, checkedAt: input.checkedAt, scope: structuredClone(input.scope),
    coverage: structuredClone(coverage), results: ordered, nextQuestion, nextAction,
    validationScope: "structure_and_caller_supplied_excerpt_only" };
  const header = `وضعیت جست‌وجو: ${status}؛ ${input.calls.length} نتیجهٔ تأییدشده از ${input.coverage.candidatesChecked} نامزد بررسی‌شده (${input.checkedAt}).`;
  report.markdown = [header,
    `پوشش: ${coverage.status}؛ API: ${coverage.apiSources.length ? coverage.apiSources.map(safe).join("، ") : "بدون پوشش"}؛ جست‌وجوی وب: ${coverage.webSearches.length}؛ کشورها: ${coverage.countriesChecked.length ? coverage.countriesChecked.join("، ") : "ثبت‌نشده"}.`,
    ...(input.coverage.excluded.map((item) => item.reason === "nationality_restriction"
      ? `- کنارگذاشته‌شده (${safe(item.reason)}): ${safe(item.title)} — ${safe(item.sourceExcerpt)} ([منبع رسمی](${item.sourceUrl}))`
      : `- کنارگذاشته‌شده (${safe(item.reason)}): ${item.count}`)),
    ...(coverage.failures.map((failure) => `- منبع ناموفق: ${safe(failure.source)} — ${safe(failure.reason)}`)),
    ...ordered.map(renderCall),
    nextQuestion ? `سؤال بعدی: ${nextQuestion}` : `قدم بعدی: ${nextAction}`,
    "این فهرست فقط دامنهٔ بررسی‌شده را نشان می‌دهد؛ نبود نتیجه به معنی نبود فرصت نیست."
  ].join("\n\n");
  return report;
}
