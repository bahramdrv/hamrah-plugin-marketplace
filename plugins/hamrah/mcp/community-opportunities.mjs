import { parseIsoDay } from "./community-dataset-v4.mjs";

const AUTHORITATIVE = new Set(["primary", "trusted"]);
const INSTITUTION_SOURCE_TYPES = new Set(["official_university", "official_government", "official_employer"]);

// An official institution source: primary or trusted authority, a public source, an HTTPS locator, and an
// institution, government, or employer source type.
export function isOfficialInstitutionEvidence(item, source) {
  return Boolean(item && AUTHORITATIVE.has(item.authority) && source?.public === true
    && /^https:\/\//.test(item.source_url ?? "") && INSTITUTION_SOURCE_TYPES.has(item.source_type));
}

// Evidence references nested inside an Academic Opportunity, as [field path, evidence id] pairs.
export function opportunityEvidenceRefs(opportunity) {
  return [
    ...opportunity.deadline_evidence_ids.map((id) => ["deadline_evidence_ids", id]),
    ...opportunity.funding.components.flatMap((component, index) => [
      ...component.evidence_ids.map((id) => [`funding.components[${index}].evidence_ids`, id]),
      ...component.opposing_evidence_ids.map((id) => [`funding.components[${index}].opposing_evidence_ids`, id])
    ]),
    ...(opportunity.admission_conditions ?? []).flatMap((condition, index) => condition.evidence_ids.map((id) => [`admission_conditions[${index}].evidence_ids`, id])),
    ...opportunity.nationality_restrictions.evidence_ids.map((id) => ["nationality_restrictions.evidence_ids", id]),
    ...opportunity.iranian_evidence.evidence_ids.map((id) => ["iranian_evidence.evidence_ids", id])
  ];
}

// Applies transform to every evidence list on an Academic Opportunity, including nested ones.
export function mapOpportunityEvidence(opportunity, transform) {
  return {
    ...opportunity,
    evidence_ids: transform(opportunity.evidence_ids),
    deadline_evidence_ids: transform(opportunity.deadline_evidence_ids),
    funding: {
      ...opportunity.funding,
      components: opportunity.funding.components.map((component) => ({
        ...component,
        evidence_ids: transform(component.evidence_ids),
        opposing_evidence_ids: transform(component.opposing_evidence_ids)
      }))
    },
    admission_conditions: opportunity.admission_conditions?.map((condition) => ({ ...condition, evidence_ids: transform(condition.evidence_ids) })) ?? null,
    nationality_restrictions: { ...opportunity.nationality_restrictions, evidence_ids: transform(opportunity.nationality_restrictions.evidence_ids) },
    iranian_evidence: { ...opportunity.iranian_evidence, evidence_ids: transform(opportunity.iranian_evidence.evidence_ids) }
  };
}

// A stated fact needs evidence; a verified fact cannot rest on a verified-looking status alone.
export function opportunityConsistencyIssues(opportunities, evidence, sources, collection = "academic_opportunities") {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const publicSources = new Set(sources.filter((source) => source.public).map((source) => source.id));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const issues = [];
  opportunities.forEach((opportunity, index) => {
    const at = `${collection}[${index}]`;
    const add = (message) => issues.push({ gate: "evidence", message: `${at}: ${message}` });
    if (opportunity.deadline !== null && !parseIsoDay(opportunity.deadline, true, false)) {
      issues.push({ gate: "provenance", message: `${at}.deadline is not a valid ISO date` });
    }
    const { funding } = opportunity;
    if (funding.status === "verified" && !funding.components.some((component) => component.status === "verified")) {
      add("funding.status verified needs a verified component");
    }
    if (funding.status === "none" && funding.components.length) add("funding.status none cannot list funding components");
    funding.components.forEach((component, componentIndex) => {
      if (component.status !== "verified") return;
      if (!component.evidence_ids.length) add(`verified funding component ${componentIndex} needs evidence`);
      else if (!component.evidence_ids.some((id) => isOfficialInstitutionEvidence(evidenceById.get(id), sourcesById.get(evidenceById.get(id)?.source_id)))) {
        add(`verified funding component ${componentIndex} needs an official institution source`);
      }
    });
    (opportunity.admission_conditions ?? []).forEach((condition, conditionIndex) => {
      if (condition.status === "verified" && !condition.evidence_ids.length) add(`verified admission condition ${conditionIndex} needs evidence`);
    });
    if (opportunity.nationality_restrictions.status === "restricted" && !opportunity.nationality_restrictions.evidence_ids.length) {
      add("restricted nationality_restrictions needs evidence");
    }
    const iranian = opportunity.iranian_evidence;
    if (iranian.status === "explicit_public_evidence") {
      if (!iranian.evidence_ids.length) add("iranian_evidence explicit_public_evidence needs evidence");
      else if (!iranian.evidence_ids.every((id) => publicSources.has(evidenceById.get(id)?.source_id))) {
        add("iranian_evidence explicit_public_evidence needs public evidence that states the Iran connection");
      }
    } else if (iranian.evidence_ids.length) {
      add(`iranian_evidence ${iranian.status} cannot list evidence`);
    }
  });
  return issues;
}

// After evidence is withdrawn, a fact that has lost all of its evidence can no longer be reported as established.
export function downgradeUnsupported(opportunity) {
  const components = opportunity.funding.components.map((component) =>
    component.status === "verified" && !component.evidence_ids.length ? { ...component, status: "unverified" } : component);
  const fundingStatus = opportunity.funding.status === "verified" && !components.some((component) => component.status === "verified")
    ? "unverified" : opportunity.funding.status;
  return {
    ...opportunity,
    funding: { status: fundingStatus, components },
    admission_conditions: opportunity.admission_conditions?.map((condition) =>
      condition.status === "verified" && !condition.evidence_ids.length ? { ...condition, status: "unverified" } : condition) ?? null,
    nationality_restrictions: opportunity.nationality_restrictions.status === "restricted" && !opportunity.nationality_restrictions.evidence_ids.length
      ? { ...opportunity.nationality_restrictions, status: "unknown" } : opportunity.nationality_restrictions,
    iranian_evidence: opportunity.iranian_evidence.status === "explicit_public_evidence" && !opportunity.iranian_evidence.evidence_ids.length
      ? { status: "not_checked", evidence_ids: [] } : opportunity.iranian_evidence
  };
}
