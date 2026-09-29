import Ajv from "ajv";

const text = (maxLength = 500) => ({ type: "string", minLength: 1, maxLength });
const url = { type: "string", pattern: "^https://[^\\s()\\[\\]<>]+$", maxLength: 500 };
const nullableUrl = { anyOf: [url, { type: "null" }] };
const nullableExcerpt = { anyOf: [text(800), { type: "null" }] };
const evidence = {
  type: "object", additionalProperties: false,
  required: ["status", "sourceUrl", "sourceExcerpt"],
  properties: { status: { type: "string" }, sourceUrl: nullableUrl, sourceExcerpt: nullableExcerpt }
};

export const SUPERVISOR_PRESENTATION_TOOL = {
  name: "renderAcademicSupervisorShortlist",
  title: "Validate and render academic supervisor leads",
  description: "Render request-scoped public professor or group evidence. Research current official pages first; this tool checks caller-supplied structure and excerpts, not the source pages themselves. Do not send applicant details. A research match is not student recruitment, admission, funding, or an open position.",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["checkedAt", "searchScope", "coverage", "leads"],
    properties: {
      checkedAt: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      searchScope: { type: "object", additionalProperties: false,
        required: ["countryCode", "field", "researchFocus"],
        properties: { countryCode: { type: "string", pattern: "^[A-Z]{3}$" }, field: text(120), researchFocus: text(200) } },
      coverage: { type: "object", additionalProperties: false, required: ["candidatesChecked", "excluded"],
        properties: {
          candidatesChecked: { type: "integer", minimum: 0 },
          excluded: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false,
            required: ["reason", "count"],
            properties: { reason: { enum: ["no_topic_evidence", "not_current", "out_of_scope", "other_unverified"] },
              count: { type: "integer", minimum: 1 } } } }
        } },
      leads: { type: "array", maxItems: 5, items: {
        type: "object", additionalProperties: false,
        required: ["name", "institution", "countryCode", "field", "officialProfileUrl", "research", "recruitment", "contact", "iranianStudent"],
        properties: {
          name: text(200), institution: text(200), countryCode: { type: "string", pattern: "^[A-Z]{3}$" },
          field: text(120), officialProfileUrl: url,
          research: { type: "object", additionalProperties: false, required: ["focus", "sourceUrl", "sourceExcerpt"],
            properties: { focus: text(200), sourceUrl: url, sourceExcerpt: text(800) } },
          recruitment: { ...evidence, properties: { ...evidence.properties,
            status: { enum: ["explicitly_accepting", "explicitly_not_accepting", "unknown"] } } },
          contact: { ...evidence, properties: { ...evidence.properties,
            status: { enum: ["published", "unknown"] } } },
          iranianStudent: { ...evidence, properties: { ...evidence.properties,
            status: { enum: ["documented", "unknown"] } } }
        }
      } }
    }
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
};

const validateShape = new Ajv({ allErrors: true }).compile(SUPERVISOR_PRESENTATION_TOOL.inputSchema);
const normalized = (value) => String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const escapeMarkdown = (value) => String(value).replace(/[\\`*_[\]<>|\r\n]/g, "\\$&");
const cite = (value) => `[official page](${value})`;
const validDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const accepting = /\b(?:currently|now|actively) (?:accepting|recruiting|seeking) (?:new )?(?:phd|doctoral|graduate) students?\b|\b(?:phd|doctoral|graduate) students? (?:are )?(?:currently|now) (?:accepted|recruited)\b|\b(?:ich|wir) (?:nehme|nehmen) (?:derzeit|aktuell) (?:doktorand(?:innen)?|promovierende) auf\b/;
const notAccepting = /\bnot (?:currently )?accepting (?:new )?(?:phd|doctoral|graduate) students?\b|\b(?:phd|doctoral|graduate) students? (?:are )?not (?:currently )?accepted\b|\b(?:ich|wir) (?:nehme|nehmen) (?:derzeit|aktuell) keine (?:doktorand(?:innen)?|promovierende) auf\b/;
const contactChannel = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const phoneChannel = /\b(?:tel\.?|telephone|telefon|phone)\s*:?\s*\+?\d[\d\s()/-]{5,}\d/i;
const formerStudent = /\b(?:former|past|previous|alumn(?:us|a|i))\b.{0,120}\b(?:phd|doctoral|graduate|student|doktorand|promovier)|\b(?:phd|doctoral|graduate|student|doktorand|promovier)\b.{0,120}\b(?:former|past|previous|alumn(?:us|a|i))\b/;
const fromIran = /\b(?:iran|iranian|iranisch(?:e|er|es|en|em)?)\b/;
const knownOrNull = (value, known, path, errors) => {
  if (known && (!value.sourceUrl || !value.sourceExcerpt)) errors.push(`${path} needs a source URL and excerpt`);
  if (!known && (value.sourceUrl !== null || value.sourceExcerpt !== null)) errors.push(`${path} must leave unsupported evidence null`);
};

export function renderAcademicSupervisorShortlist(input) {
  if (!validateShape(input)) return {
    error: "invalid_supervisor_presentation",
    details: (validateShape.errors ?? []).map((item) => `${item.instancePath || "root"}: ${item.message}`)
  };
  const errors = [];
  const today = new Date().toISOString().slice(0, 10);
  if (!validDate(input.checkedAt) || Math.abs(Date.parse(`${input.checkedAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) > 86_400_000) {
    errors.push("checkedAt must be a valid date within one calendar day of today");
  }
  input.leads.forEach((lead, index) => {
    const path = `leads.${index}`;
    if (lead.countryCode !== input.searchScope.countryCode || normalized(lead.field) !== normalized(input.searchScope.field)) {
      errors.push(`${path} must match the requested country and field`);
    }
    if (!normalized(lead.research.sourceExcerpt).includes(normalized(lead.research.focus))) {
      errors.push(`${path}.research must cite the stated focus on the official research page`);
    }
    knownOrNull(lead.recruitment, lead.recruitment.status !== "unknown", `${path}.recruitment`, errors);
    if (lead.recruitment.status === "explicitly_accepting"
      && (!accepting.test(normalized(lead.recruitment.sourceExcerpt)) || notAccepting.test(normalized(lead.recruitment.sourceExcerpt)))) {
      errors.push(`${path}.recruitment needs an explicit current accepting-students statement`);
    }
    if (lead.recruitment.status === "explicitly_not_accepting" && !notAccepting.test(normalized(lead.recruitment.sourceExcerpt))) {
      errors.push(`${path}.recruitment needs an explicit not-accepting-students statement`);
    }
    knownOrNull(lead.contact, lead.contact.status === "published", `${path}.contact`, errors);
    if (lead.contact.status === "published"
      && !(contactChannel.test(lead.contact.sourceExcerpt) || phoneChannel.test(lead.contact.sourceExcerpt))) {
      errors.push(`${path}.contact needs a published institutional email or phone channel`);
    }
    knownOrNull(lead.iranianStudent, lead.iranianStudent.status === "documented", `${path}.iranianStudent`, errors);
    if (lead.iranianStudent.status === "documented"
      && !(fromIran.test(normalized(lead.iranianStudent.sourceExcerpt))
        && formerStudent.test(normalized(lead.iranianStudent.sourceExcerpt)))) {
      errors.push(`${path}.iranianStudent needs an explicit former-student and Iran connection`);
    }
  });
  const excludedCount = input.coverage.excluded.reduce((sum, item) => sum + item.count, 0);
  if (input.coverage.candidatesChecked !== input.leads.length + excludedCount) {
    errors.push("coverage.candidatesChecked must equal displayed plus excluded candidates");
  }
  if (errors.length) return { error: "invalid_supervisor_presentation", details: errors };
  const lines = [
    `${input.leads.length} supervisor ${input.leads.length === 1 ? "lead" : "leads"} from ${input.coverage.candidatesChecked} official ${input.coverage.candidatesChecked === 1 ? "candidate" : "candidates"} checked in ${input.searchScope.countryCode} / ${escapeMarkdown(input.searchScope.field)} / ${escapeMarkdown(input.searchScope.researchFocus)}.`,
    ...input.coverage.excluded.map((item) => `- excluded ${item.count}: ${item.reason}`),
    ...(input.leads.length < 3 ? ["This bounded search returned fewer than three leads; unsearched faculty remain unknown."] : []),
    ...input.leads.map((lead) => [
      `### [${escapeMarkdown(lead.name)}](${lead.officialProfileUrl})`,
      `- institution: ${escapeMarkdown(lead.institution)}`,
      `- checked: ${input.checkedAt}`,
      `- research relevance: ${escapeMarkdown(lead.research.focus)} — ${escapeMarkdown(lead.research.sourceExcerpt)}, ${cite(lead.research.sourceUrl)}`,
      `- student recruitment: \`${lead.recruitment.status}\`${lead.recruitment.sourceUrl ? ` — ${escapeMarkdown(lead.recruitment.sourceExcerpt)}, ${cite(lead.recruitment.sourceUrl)}` : ""}`,
      `- institutional contact: \`${lead.contact.status}\`${lead.contact.sourceUrl ? ` — ${cite(lead.contact.sourceUrl)}` : ""}`,
      `- former Iranian student: \`${lead.iranianStudent.status}\`${lead.iranianStudent.sourceUrl ? ` — ${cite(lead.iranianStudent.sourceUrl)}` : ""}`,
      "- research relevance does not establish admission, funding, or an open position"
    ].join("\n"))
  ];
  return { status: "valid", leadCount: input.leads.length,
    validationScope: "structure_and_caller_supplied_excerpt_only", markdown: lines.join("\n\n") };
}
