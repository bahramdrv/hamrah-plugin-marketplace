import { readFileSync } from "node:fs";
import Ajv from "ajv";

const matchSchema = JSON.parse(readFileSync(
  new URL("../skills/hamrah-program-finder/references/program_matches_schema.json", import.meta.url),
  "utf8"
));
const program = matchSchema.properties.programs.items.properties;
const statuses = {
  match: program.match_status.enum,
  application: program.admissions.properties.application.properties.status.enum,
  deadline: program.admissions.properties.deadline.properties.status.enum,
  funding: matchSchema.$defs.funding.properties.status.enum,
  tuition: program.affordability.properties.tuition.properties.status.enum,
  iranianEvidence: matchSchema.$defs.iranian_evidence.properties.status.enum
};

const text = (maxLength = 1000) => ({ type: "string", minLength: 1, maxLength });
const optionalText = (maxLength = 1000) => ({ anyOf: [text(maxLength), { type: "null" }] });
const url = { type: "string", pattern: "^https://", maxLength: 500 };
const optionalUrl = { anyOf: [url, { type: "null" }] };
const isoDate = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const optionalDate = { anyOf: [isoDate, { type: "null" }] };
const applicationSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "intake", "sourceUrl", "sourceExcerpt"],
  properties: {
    status: { enum: statuses.application }, intake: optionalText(100),
    sourceUrl: optionalUrl, sourceExcerpt: optionalText()
  }
};
const deadlineSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "date", "intake", "sourceUrl", "sourceExcerpt"],
  properties: {
    status: { enum: statuses.deadline }, date: optionalDate, intake: optionalText(100),
    sourceUrl: optionalUrl, sourceExcerpt: optionalText()
  }
};

export const PROGRAM_PRESENTATION_TOOL = {
  name: "renderAcademicProgramShortlist",
  title: "Validate and render an academic program shortlist",
  description: "Validate and render a request-scoped academic program shortlist with at least one source-linked published admission requirement per program. Classify each academic fact as admission_requirement or program_context and supply a short exact source excerpt. Supply only public program facts and categorical fit, not an applicant profile or personalized reasons. The tool checks caller-supplied excerpts but does not fetch or authenticate the cited page; research official pages first.",
  inputSchema: {
    type: "object", additionalProperties: false,
    required: ["checkedAt", "programs"],
    properties: {
      checkedAt: isoDate,
      programs: {
        type: "array", minItems: 1, maxItems: 5,
        items: {
          type: "object", additionalProperties: false,
          required: ["title", "officialProgramUrl", "matchStatus", "academicEvidence", "application", "admissionDeadline", "scholarshipDeadline", "funding", "tuition", "iranianEvidence"],
          properties: {
            title: text(200), officialProgramUrl: url,
            matchStatus: { enum: statuses.match },
            academicEvidence: {
              type: "array", minItems: 1, maxItems: 5,
              items: {
                type: "object", additionalProperties: false,
                required: ["kind", "fact", "sourceExcerpt", "sourceUrl"],
                properties: {
                  kind: { enum: ["admission_requirement", "program_context"] },
                  fact: text(300), sourceExcerpt: text(300), sourceUrl: url
                }
              }
            },
            application: applicationSchema,
            admissionDeadline: deadlineSchema,
            scholarshipDeadline: deadlineSchema,
            funding: {
              type: "object", additionalProperties: false,
              required: ["status", "coverage", "sourceUrl"],
              properties: {
                status: { enum: statuses.funding }, coverage: optionalText(300), sourceUrl: optionalUrl
              }
            },
            tuition: {
              type: "object", additionalProperties: false,
              required: ["status", "amount", "currency", "period", "sourceUrl"],
              properties: {
                status: { enum: statuses.tuition },
                amount: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                currency: optionalText(20), period: optionalText(50), sourceUrl: optionalUrl
              }
            },
            iranianEvidence: {
              type: "object", additionalProperties: false,
              required: ["status", "sourceUrl"],
              properties: { status: { enum: statuses.iranianEvidence }, sourceUrl: optionalUrl }
            }
          }
        }
      }
    }
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
};

const validateShape = new Ajv({ allErrors: true }).compile(PROGRAM_PRESENTATION_TOOL.inputSchema);
const yearIn = (value) => typeof value === "string" ? value.match(/\b(?:19|20)\d{2}\b/g) || [] : [];
const hasYear = (value, year) => yearIn(value).includes(year);
const validDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const markdownSafe = (value) => String(value).replace(/[\\`*_[\]<>|\r\n]/g, "\\$&");
const linked = (label, sourceUrl) => sourceUrl ? `${label} ([source](${sourceUrl}))` : label;

function checkCall(call, path, checkedAt, errors, { application = false } = {}) {
  if (call.status === "unknown") {
    if (call.date !== undefined && call.date !== null) errors.push(`${path}.date must be null when status is unknown`);
    return;
  }
  if (!call.intake || yearIn(call.intake).length === 0) errors.push(`${path}.intake needs a named intake and year`);
  if (!call.sourceUrl) errors.push(`${path}.sourceUrl needs an official-page URL`);
  if (!call.sourceExcerpt || !yearIn(call.intake).some((year) => hasYear(call.sourceExcerpt, year))) {
    errors.push(`${path}.sourceExcerpt must state the named intake year`);
  }
  if (application) return;
  if (!call.date || !validDate(call.date)) {
    errors.push(`${path}.date needs a valid ISO date`);
    return;
  }
  if (!hasYear(call.sourceExcerpt, call.date.slice(0, 4))) {
    errors.push(`${path}.sourceExcerpt must state the deadline year`);
  }
  if (validDate(checkedAt)) {
    if (call.status === "verified" && call.date < checkedAt) errors.push(`${path}.status must be expired after the deadline`);
    if (call.status === "expired" && call.date >= checkedAt) errors.push(`${path}.status cannot be expired before the deadline`);
  }
}

function checkProgram(item, index, checkedAt, errors) {
  const path = `programs.${index}`;
  if (!item.academicEvidence.some((evidence) => evidence.kind === "admission_requirement")) {
    errors.push(`${path}.academicEvidence needs at least one published admission requirement`);
  }
  checkCall(item.application, `${path}.application`, checkedAt, errors, { application: true });
  checkCall(item.admissionDeadline, `${path}.admissionDeadline`, checkedAt, errors);
  checkCall(item.scholarshipDeadline, `${path}.scholarshipDeadline`, checkedAt, errors);
  const applicationIntake = item.application.status !== "unknown" ? item.application.intake : null;
  const deadlineIntake = item.admissionDeadline.status !== "unknown" ? item.admissionDeadline.intake : null;
  if (applicationIntake && deadlineIntake && applicationIntake.trim().toLowerCase() !== deadlineIntake.trim().toLowerCase()) {
    errors.push(`${path}.admissionDeadline.intake must match application.intake`);
  }
  if (item.application.status === "open" && item.admissionDeadline.status === "expired") {
    errors.push(`${path}.application.status cannot be open with an expired admission deadline`);
  }
  if (["verified", "competitive"].includes(item.funding.status) && (!item.funding.coverage || !item.funding.sourceUrl)) {
    if (!item.funding.coverage) errors.push(`${path}.funding.coverage is required for published funding`);
    if (!item.funding.sourceUrl) errors.push(`${path}.funding.sourceUrl is required for published funding`);
  }
  if (item.funding.status === "none" && !item.funding.sourceUrl) {
    errors.push(`${path}.funding.sourceUrl is required for a no-funding claim`);
  }
  if (item.tuition.status === "verified" && (item.tuition.amount === null || !item.tuition.currency || !item.tuition.period || !item.tuition.sourceUrl)) {
    errors.push(`${path}.tuition needs amount, currency, period and sourceUrl`);
  }
  if (item.tuition.status === "none" && (item.tuition.amount !== 0 || !item.tuition.sourceUrl)) {
    errors.push(`${path}.tuition needs zero amount and sourceUrl when status is none`);
  }
  if (item.tuition.status === "unknown" && item.tuition.amount !== null) errors.push(`${path}.tuition.amount must be null when status is unknown`);
  if (item.iranianEvidence.status !== "unknown" && !item.iranianEvidence.sourceUrl) {
    errors.push(`${path}.iranianEvidence.sourceUrl is required for an explicit claim`);
  }
}

function renderDeadline(label, deadline) {
  if (deadline.status === "unknown") return `- ${label}: \`unknown\``;
  return `- ${label}: \`${deadline.status}\` — ${deadline.date} (${markdownSafe(deadline.intake)}), ${linked("official page", deadline.sourceUrl)}`;
}

function renderProgram(item, checkedAt) {
  const application = item.application.status === "unknown"
    ? "- application: `unknown`"
    : `- application: \`${item.application.status}\` — ${markdownSafe(item.application.intake)}, ${linked("official page", item.application.sourceUrl)}`;
  const funding = item.funding.status === "unknown"
    ? "- funding: `unknown`"
    : `- funding: \`${item.funding.status}\`${item.funding.coverage ? ` — ${markdownSafe(item.funding.coverage)}` : ""}${item.funding.sourceUrl ? `, ${linked("official page", item.funding.sourceUrl)}` : ""}`;
  const tuition = item.tuition.status === "verified"
    ? `\`verified\` — ${item.tuition.amount} ${markdownSafe(item.tuition.currency)}/${markdownSafe(item.tuition.period)}, ${linked("official page", item.tuition.sourceUrl)}`
    : item.tuition.status === "none" ? `\`none\` — 0, ${linked("official page", item.tuition.sourceUrl)}` : "`unknown`";
  const iranian = item.iranianEvidence.status === "unknown"
    ? "`unknown`"
    : `\`${item.iranianEvidence.status}\` — ${linked("official page", item.iranianEvidence.sourceUrl)}`;
  return [
    `### [${markdownSafe(item.title)}](${item.officialProgramUrl})`,
    `- checked: ${checkedAt}`,
    `- match: \`${item.matchStatus}\``,
    ...item.academicEvidence.map((evidence) =>
      `- ${evidence.kind === "admission_requirement" ? "admission requirement" : "program context"}: ${markdownSafe(evidence.fact)}, ${linked("official page", evidence.sourceUrl)}`),
    application,
    renderDeadline("admission deadline", item.admissionDeadline),
    renderDeadline("scholarship deadline", item.scholarshipDeadline),
    funding,
    `- tuition: ${tuition}`,
    `- Iranian-nationality evidence: ${iranian}`
  ].join("\n");
}

export function renderAcademicProgramShortlist(input) {
  const errors = [];
  if (!validateShape(input)) {
    for (const error of validateShape.errors || []) {
      const path = error.instancePath.replaceAll("/", ".").replace(/^\./, "");
      errors.push(`${path || "root"}${error.params?.additionalProperty ? `.${error.params.additionalProperty}` : ""}: ${error.message}`);
    }
  } else {
    if (!validDate(input.checkedAt)) errors.push("checkedAt needs a valid ISO date");
    input.programs.forEach((item, index) => checkProgram(item, index, input.checkedAt, errors));
  }
  if (errors.length) return { error: "invalid_program_presentation", details: errors };
  return {
    status: "valid",
    programCount: input.programs.length,
    validationScope: "structure_and_caller_supplied_excerpt_only",
    markdown: input.programs.map((item) => renderProgram(item, input.checkedAt)).join("\n\n")
  };
}
