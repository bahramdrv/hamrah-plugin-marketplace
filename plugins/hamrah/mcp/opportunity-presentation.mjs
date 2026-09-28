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

export const OPPORTUNITY_PRESENTATION_TOOL = {
  name: "renderVerifiedOpenAcademicOpportunityShortlist",
  title: "Validate and render verified open academic opportunities",
  description: "Render request-scoped advertised openings using only public facts and caller-supplied official-page excerpts. Research the current pages first; this tool validates structure and consistency but does not fetch or authenticate a source. Do not send applicant profile details.",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["checkedAt", "openings"],
    properties: {
      checkedAt: date,
      openings: {
        type: "array", minItems: 1, maxItems: 5,
        items: {
          type: "object", additionalProperties: false,
          required: ["title", "institution", "countryCode", "degreeLevel", "field", "officialPostingUrl", "postingEvidence", "application", "funding"],
          properties: {
            title: text(200), institution: text(200), countryCode: text(3), degreeLevel: { const: "phd" },
            field: text(120), officialPostingUrl: url, postingEvidence: sourceEvidence,
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
  /\bjetzt bewerben\b/
];
const acceptanceNow = (excerpt) => currentApplicationPhrases.some((pattern) => pattern.test(normalized(excerpt)));
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
    `- application: \`open\` — ${escapeMarkdown(item.application.sourceExcerpt)}, ${cite(item.application.sourceUrl)}`,
    `- deadline: ${deadline}`,
    `- ${item.funding.type}: ${escapeMarkdown(funding)} — ${escapeMarkdown(item.funding.sourceExcerpt)}, ${cite(item.funding.sourceUrl)}`
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
  if (errors.length) return { error: "invalid_opportunity_presentation", details: errors };
  return {
    status: "valid",
    openingCount: input.openings.length,
    validationScope: "structure_and_caller_supplied_excerpt_only",
    markdown: input.openings.map((item) => renderOpening(item, input.checkedAt)).join("\n\n")
  };
}
