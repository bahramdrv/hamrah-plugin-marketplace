import Ajv from "ajv";

const text = (maxLength = 1000) => ({ type: "string", minLength: 1, maxLength });
const optionalText = (maxLength = 1000) => ({ anyOf: [text(maxLength), { type: "null" }] });
const url = { type: "string", pattern: "^https://[^\\s()\\[\\]<>]+$", maxLength: 500 };
const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const optionalDate = { anyOf: [date, { type: "null" }] };
const sourceEvidence = {
  type: "object", additionalProperties: false,
  required: ["sourceUrl", "sourceExcerpt"],
  properties: { sourceUrl: url, sourceExcerpt: text(500) }
};
const statedTerm = {
  type: "object", additionalProperties: false,
  required: ["value", "sourceUrl", "sourceExcerpt"],
  properties: { value: text(200), sourceUrl: url, sourceExcerpt: text(500) }
};
const searchScope = {
  type: "object", additionalProperties: false,
  required: ["countryCode", "degreeLevel", "field"],
  properties: { countryCode: { const: "DEU" }, degreeLevel: { const: "phd" }, field: { const: "Physics" } }
};
const coverage = {
  type: "object", additionalProperties: false,
  required: ["candidatesChecked", "excluded"],
  properties: {
    candidatesChecked: { type: "integer", minimum: 0 },
    excluded: { type: "array", maxItems: 20, items: {
      type: "object", additionalProperties: false, required: ["reason", "count"],
      properties: {
        reason: { enum: ["not_currently_open", "expired_deadline", "unverified_funding", "missing_official_posting", "out_of_scope", "unverified_conditions", "other_unverified", "iranian_nationality_restriction"] },
        count: { type: "integer", minimum: 1 }, title: text(200), officialPostingUrl: url,
        sourceUrl: url, sourceExcerpt: text(500)
      }
    } }
  }
};

export const OPPORTUNITY_PRESENTATION_TOOL = {
  name: "renderVerifiedOpenAcademicOpportunityShortlist",
  title: "Validate and render verified open academic opportunities",
  description: "Render request-scoped advertised openings using only public facts and caller-supplied official-page excerpts. Research the current pages first; this tool validates structure and consistency but does not fetch or authenticate a source. Do not send applicant profile details.",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["checkedAt", "searchScope", "coverage", "openings"],
    properties: {
      checkedAt: date,
      searchScope,
      coverage,
      openings: {
        type: "array", maxItems: 5,
        items: {
          type: "object", additionalProperties: false,
          required: ["title", "institution", "countryCode", "degreeLevel", "field", "officialPostingUrl", "postingEvidence", "application", "funding", "academicConditions", "nationalityEvidence"],
          properties: {
            title: text(200), institution: text(200), countryCode: text(3), degreeLevel: { const: "phd" },
            field: text(120), officialPostingUrl: url, postingEvidence: sourceEvidence,
            academicConditions: { type: "array", minItems: 1, maxItems: 10, items: {
              type: "object", additionalProperties: false,
              required: ["condition", "sourceUrl", "sourceExcerpt"],
              properties: { condition: text(300), sourceUrl: url, sourceExcerpt: text(500) }
            } },
            employmentTerms: {
              type: "object", additionalProperties: false, minProperties: 1,
              properties: { workload: statedTerm, contractDuration: statedTerm }
            },
            nationalityEvidence: {
              type: "object", additionalProperties: false,
              required: ["status", "sourceUrl", "sourceExcerpt"],
              properties: { status: { const: "unknown" }, sourceUrl: { type: "null" }, sourceExcerpt: { type: "null" } }
            },
            application: {
              type: "object", additionalProperties: false,
              required: ["status", "mode", "deadline", "sourceUrl", "sourceExcerpt"],
              properties: {
                status: { const: "open" }, mode: { enum: ["dated", "rolling"] },
                deadline: optionalDate, sourceUrl: url, sourceExcerpt: text(500)
              }
            },
            funding: {
              type: "object", additionalProperties: false,
              required: ["type", "amount", "currency", "period", "salaryScale", "packageName", "packageTerms", "sourceUrl", "sourceExcerpt"],
              properties: {
                type: { enum: ["salary", "stipend"] },
                amount: { anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }] },
                currency: optionalText(20), period: optionalText(50),
                salaryScale: optionalText(100), packageName: optionalText(150), packageTerms: optionalText(300),
                sourceUrl: url, sourceExcerpt: text(500)
              }
            }
          }
        }
      }
    }
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
};

const validateShape = new Ajv({ allErrors: true }).compile(OPPORTUNITY_PRESENTATION_TOOL.inputSchema);
const escapeMarkdown = (value) => String(value).replace(/[\\`*_[\]<>|\r\n]/g, "\\$&");
const cite = (url) => `[official page](${url})`;
const normalized = (value) => String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const excerptContains = (excerpt, fact) => normalized(excerpt).includes(normalized(fact));
const periodPhrases = {
  month: /\bmonth(?:ly)?\b|\bmonatlich\b|\bpro monat\b/,
  year: /\byear(?:ly)?\b|\bjährlich\b|\bpro jahr\b/,
  week: /\bweek(?:ly)?\b|\bwöchentlich\b|\bpro woche\b/,
  semester: /\bsemester\b|\bpro semester\b/,
  one_time: /\bone[- ]time\b|\bonce\b|\beinmalig\b/
};
const excerptContainsPeriod = (excerpt, period) => periodPhrases[period]
  ? periodPhrases[period].test(normalized(excerpt)) : excerptContains(excerpt, period);
const dateWords = (value) => normalized(value).replace(/[.,/\-]/g, " ").replace(/\s+/g, " ").trim();
function excerptContainsDate(excerpt, isoDate) {
  const [year, month, day] = isoDate.split("-");
  const actualDay = String(Number(day));
  const actualMonth = String(Number(month));
  const timestamp = new Date(`${isoDate}T00:00:00Z`);
  const monthNames = ["en-US", "de-DE"].flatMap((locale) => ["long", "short"].map((length) =>
    new Intl.DateTimeFormat(locale, { month: length, timeZone: "UTC" }).format(timestamp)));
  const variants = [isoDate, `${day}.${month}.${year}`, `${actualDay}.${actualMonth}.${year}`,
    `${month}/${day}/${year}`, ...monthNames.flatMap((name) => [
      `${actualDay} ${name} ${year}`, `${name} ${actualDay} ${year}`
    ])];
  const haystack = ` ${dateWords(excerpt)} `;
  return variants.some((value) => haystack.includes(` ${dateWords(value)} `));
}
const currentApplicationPhrases = [
  /\bapplications? (?:are|is) (?:now|currently) (?:open|being accepted)\b/,
  /\bapplications?\b.{0,120}\bare accepted on a rolling basis\b/,
  /\b(?:we are )?(?:now|currently) accepting applications\b/,
  /\bapply now\b/,
  /\bposition is (?:now|currently) open for applications\b/,
  /\bbewerbungen sind (?:ab sofort|derzeit|aktuell) möglich\b/,
  /\bwir nehmen (?:ab sofort|derzeit|aktuell) bewerbungen an\b/,
  /\bjetzt bewerben\b/,
  /\buse only the online application form to submit your application\b/
];
const acceptanceNow = (excerpt) => currentApplicationPhrases.some((pattern) => pattern.test(normalized(excerpt)));
const explicitIranianBar = (excerpt) => {
  const subject = "(?:iranian (?:applicants?|citizens?|nationals?)|(?:applicants?|candidates?) (?:with|holding) iranian (?:citizenship|nationality)|citizens? of iran|nationals? of iran|applicants? from iran)";
  const barred = "(?:(?:are|is) (?:not eligible|ineligible) (?:to apply|for (?:this|the) (?:position|opening|call))|(?:are|is) (?:barred|excluded) from applying|(?:are|is) not (?:permitted|allowed) to apply|(?:cannot|may not|must not) apply|(?:are|is) not accepted for (?:this|the) (?:position|opening|call))";
  const targetedBar = new RegExp(`\\b${subject}\\s+${barred}\\b`);
  const reverseBar = new RegExp(`\\b(?:this|the) (?:position|opening|call) is not open to ${subject}\\b`);
  const germanBar = /\biranische staatsangehörige\s+(?:sind (?:für diese stelle )?nicht zugelassen|dürfen sich nicht bewerben|sind ausgeschlossen)\b/;
  return normalized(excerpt).split(/\bbut\b|\bhowever\b|\bwhereas\b|[.!?;]+/)
    .some((clause) => !/\b(?:if|unless|without|provided|sofern|ohne)\b/.test(clause)
      && (targetedBar.test(clause) || reverseBar.test(clause) || germanBar.test(clause)));
};
const validDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function renderOpening(item, checkedAt) {
  const deadline = item.application.mode === "dated" ? item.application.deadline : "rolling call";
  const funding = item.funding.salaryScale ?? (item.funding.packageName ? `${item.funding.packageName}: ${item.funding.packageTerms}` : null)
    ?? `${item.funding.amount} ${item.funding.currency}/${item.funding.period}`;
  return [
    `### [${escapeMarkdown(item.title)}](${item.officialPostingUrl})`,
    `- institution: ${escapeMarkdown(item.institution)}`,
    `- scope: ${escapeMarkdown(item.countryCode)} · ${escapeMarkdown(item.degreeLevel)} · ${escapeMarkdown(item.field)}`,
    `- checked: ${checkedAt}`,
    `- advertised opening: ${escapeMarkdown(item.postingEvidence.sourceExcerpt)}, ${cite(item.postingEvidence.sourceUrl)}`,
    ...item.academicConditions.map((condition) =>
      `- academic condition: ${escapeMarkdown(condition.condition)} — ${escapeMarkdown(condition.sourceExcerpt)}, ${cite(condition.sourceUrl)}`),
    `- application: \`open\` — ${escapeMarkdown(item.application.sourceExcerpt)}, ${cite(item.application.sourceUrl)}`,
    `- deadline: ${deadline}`,
    `- ${item.funding.type}: ${escapeMarkdown(funding)} — ${escapeMarkdown(item.funding.sourceExcerpt)}, ${cite(item.funding.sourceUrl)}`,
    ...(item.employmentTerms?.workload ? [`- workload: ${escapeMarkdown(item.employmentTerms.workload.value)} — ${escapeMarkdown(item.employmentTerms.workload.sourceExcerpt)}, ${cite(item.employmentTerms.workload.sourceUrl)}`] : []),
    ...(item.employmentTerms?.contractDuration ? [`- contract duration: ${escapeMarkdown(item.employmentTerms.contractDuration.value)} — ${escapeMarkdown(item.employmentTerms.contractDuration.sourceExcerpt)}, ${cite(item.employmentTerms.contractDuration.sourceUrl)}`] : []),
    "- Iranian-nationality evidence: `unknown`"
  ].join("\n");
}

export function renderVerifiedOpenAcademicOpportunityShortlist(input) {
  if (!validateShape(input)) {
    return {
      error: "invalid_opportunity_presentation",
      details: (validateShape.errors ?? []).map((error) => {
        const path = error.instancePath.replaceAll("/", ".").replace(/^\./, "");
        return `${path || "root"}${error.params?.additionalProperty ? `.${error.params.additionalProperty}` : ""}: ${error.message}`;
      })
    };
  }
  const errors = [];
  const today = new Date().toISOString().slice(0, 10);
  if (!validDate(input.checkedAt)) errors.push("checkedAt needs a valid ISO date");
  else if (Math.abs(Date.parse(`${input.checkedAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) > 86_400_000) {
    errors.push("checkedAt must be within one calendar day of today");
  }
  input.openings.forEach((item, index) => {
    for (const [kind, term] of Object.entries(item.employmentTerms ?? {})) {
      if (!excerptContains(term.sourceExcerpt, term.value)) {
        errors.push(`openings.${index}.employmentTerms.${kind}.sourceExcerpt must state the displayed term`);
      }
    }
    if (item.countryCode !== input.searchScope.countryCode || item.degreeLevel !== input.searchScope.degreeLevel
      || normalized(item.field) !== normalized(input.searchScope.field)) {
      errors.push(`openings.${index} must match the requested country, degree and field`);
    }
    if (!excerptContains(item.postingEvidence.sourceExcerpt, item.title)) {
      errors.push(`openings.${index}.postingEvidence.sourceExcerpt must name the advertised opening`);
    }
    if (item.postingEvidence.sourceUrl !== item.officialPostingUrl) {
      errors.push(`openings.${index}.postingEvidence.sourceUrl must be the official posting URL`);
    }
    if (!acceptanceNow(item.application.sourceExcerpt)) {
      errors.push(`openings.${index}.application.sourceExcerpt must state that applications are accepted now`);
    }
    if (item.application.mode === "dated" && (!validDate(item.application.deadline)
      || item.application.deadline <= input.checkedAt || item.application.deadline <= today)) {
      errors.push(`openings.${index}.application.deadline must be a valid future date`);
    }
    if (item.application.mode === "dated" && validDate(item.application.deadline)
      && !excerptContainsDate(item.application.sourceExcerpt, item.application.deadline)) {
      errors.push(`openings.${index}.application.sourceExcerpt must state the complete deadline date`);
    }
    if (item.application.mode === "rolling" && item.application.deadline !== null) {
      errors.push(`openings.${index}.application.deadline must be null for a rolling call`);
    }
    if (item.application.mode === "rolling" && !/\brolling basis\b|\bfortlaufend\b|\blaufend\b|\bjederzeit\b/.test(normalized(item.application.sourceExcerpt))) {
      errors.push(`openings.${index}.application.sourceExcerpt must state that the call is rolling`);
    }
    const { funding } = item;
    if (funding.salaryScale && !excerptContains(funding.sourceExcerpt, funding.salaryScale)) {
      errors.push(`openings.${index}.funding.sourceExcerpt must state the salary scale`);
    }
    if (funding.packageName && (!excerptContains(funding.sourceExcerpt, funding.packageName)
      || !excerptContains(funding.sourceExcerpt, funding.packageTerms ?? ""))) {
      errors.push(`openings.${index}.funding.sourceExcerpt must state the named stipend package and its terms`);
    }
    if (funding.amount !== null && (!excerptContains(funding.sourceExcerpt, String(funding.amount))
      || !(excerptContains(funding.sourceExcerpt, funding.currency ?? "")
        || (funding.currency === "EUR" && funding.sourceExcerpt.includes("€")))
      || !excerptContainsPeriod(funding.sourceExcerpt, funding.period))) {
      errors.push(`openings.${index}.funding.sourceExcerpt must state the amount, currency, and period`);
    }
    const amountTerms = funding.amount !== null && funding.currency && funding.period;
    const basisCount = Number(Boolean(amountTerms)) + Number(Boolean(funding.salaryScale)) + Number(Boolean(funding.packageName));
    if (basisCount !== 1 || (funding.type === "salary" && funding.packageName) || (funding.type === "stipend" && funding.salaryScale)
      || (funding.packageName && !funding.packageTerms) || (!funding.packageName && funding.packageTerms)
      || (funding.amount === null && (funding.currency || funding.period))
      || (funding.amount !== null && (!funding.currency || !funding.period))) {
      errors.push(`openings.${index}.funding needs exactly one salary scale, named stipend package, or positive amount with currency and period matching its type`);
    }
  });
  input.coverage.excluded.forEach((item, index) => {
    const path = `coverage.excluded.${index}`;
    if (item.reason === "iranian_nationality_restriction") {
      if (item.count !== 1 || !item.title || !item.officialPostingUrl || !item.sourceUrl || !item.sourceExcerpt) {
        errors.push(`${path} needs one named opening and its official restriction excerpt`);
      } else {
        if (item.sourceUrl !== item.officialPostingUrl) errors.push(`${path}.sourceUrl must be the official posting URL`);
        if (!explicitIranianBar(item.sourceExcerpt)) errors.push(`${path}.sourceExcerpt must explicitly bar Iranian applicants`);
        if (input.openings.some((opening) => opening.officialPostingUrl === item.officialPostingUrl)) {
          errors.push(`${path} must not also appear as an opening when excluded by an official nationality restriction`);
        }
      }
    } else if (item.title || item.officialPostingUrl || item.sourceUrl || item.sourceExcerpt) {
      errors.push(`${path} only an official Iranian-nationality restriction may carry a named source-linked exclusion`);
    }
  });
  const excludedCount = input.coverage.excluded.reduce((sum, item) => sum + item.count, 0);
  if (input.coverage.candidatesChecked !== input.openings.length + excludedCount) {
    errors.push("coverage.candidatesChecked must equal displayed plus excluded candidates");
  }
  if (errors.length) return { error: "invalid_opportunity_presentation", details: errors };
  const count = input.openings.length;
  const coverageNote = `${count} verified openings from ${input.coverage.candidatesChecked} candidates checked in ${input.searchScope.countryCode} / ${input.searchScope.degreeLevel} / ${input.searchScope.field}.`;
  const exclusions = input.coverage.excluded.map((item) => item.reason === "iranian_nationality_restriction"
    ? `- excluded 1: ${item.reason} — ${escapeMarkdown(item.title)}: ${escapeMarkdown(item.sourceExcerpt)}, ${cite(item.sourceUrl)}`
    : `- excluded ${item.count}: ${item.reason}`).join("\n");
  const limitNote = count < 3 ? "This checked search returned fewer than three qualified openings; unsearched opportunities remain unknown." : null;
  return {
    status: "valid",
    openingCount: count,
    validationScope: "structure_and_caller_supplied_excerpt_only",
    markdown: [coverageNote, exclusions, limitNote, ...input.openings.map((item) => renderOpening(item, input.checkedAt))].filter(Boolean).join("\n\n")
  };
}
