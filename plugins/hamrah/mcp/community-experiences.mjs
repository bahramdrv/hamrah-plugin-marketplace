// Deterministic rules for Iranian Lived Experiences: an explicit public Iran connection, milestone discipline,
// scoped negative outcomes, and a narrow provenance exception for necessary public profile locators.

export const MILESTONES = {
  study: { progress: ["admission_received"], success: ["study_visa_granted", "enrolled"] },
  work: { progress: ["job_offer_received"], success: ["work_visa_granted", "employment_started"] },
  settlement: { progress: [], success: ["permanent_residence_granted", "citizenship_granted"] },
  process: { progress: ["application_submitted", "appointment_obtained", "interview_attended"], success: [] }
};
export const NEGATIVE_OUTCOMES = new Set(["refusal", "delay", "operational_failure"]);
const EXPLICIT_BASES = new Set(["self_declared", "documented"]);
// Evidence must state the connection in words; a name or a Persian-looking text is not enough.
const IRAN_TERMS = /\b(?:iran|iranian)\b|ایران/iu;
// A negated mention ("not Iranian", "non-Iranian", "not from Iran", or the Persian equivalents) never counts.
const NEGATED_IRAN = /\b(?:not|non)[- ](?:an? )?(?:iranian|from iran)\b|\u063a\u06cc\u0631 ?\u0627\u06cc\u0631\u0627\u0646\u06cc|\u0627\u06cc\u0631\u0627\u0646\u06cc ?\u0646\u06cc\u0633\u062a/iu;

export function milestoneFamily(milestone) {
  return Object.entries(MILESTONES).find(([, groups]) => [...groups.progress, ...groups.success].includes(milestone))?.[0] ?? null;
}

// A qualified success is an attained study, work, or settlement success milestone.
export function isQualifiedSuccess(experience) {
  const family = milestoneFamily(experience.milestone);
  return experience.outcome === "milestone_attained" && Boolean(family) && MILESTONES[family].success.includes(experience.milestone);
}

export function experienceEvidenceIds(experience) {
  return [...new Set([...experience.evidence_ids, ...experience.iran_connection.evidence_ids])];
}

export function experienceIssues(experiences, evidence, sources, collection = "lived_experiences") {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const isPublic = (id) => sourcesById.get(evidenceById.get(id)?.source_id)?.public === true;
  const hasLink = (id) => isPublic(id) && /^https:\/\//.test(evidenceById.get(id)?.source_url ?? "");
  const issues = [];
  experiences.forEach((experience, index) => {
    const at = `${collection}[${index}]`;
    const add = (message) => issues.push({ gate: "evidence", message: `${at}: ${message}` });
    const { iran_connection: connection } = experience;
    if (connection.status !== "explicit" || !EXPLICIT_BASES.has(connection.basis)) {
      add(`Iranian status is unknown: ${connection.status === "explicit" ? connection.basis : "an unknown connection"} cannot establish an Iran connection; only a self-declared or documented public statement can`);
    } else if (!connection.evidence_ids.length || !connection.evidence_ids.every(isPublic)) {
      add("the Iran connection needs public evidence");
    } else if (!connection.evidence_ids.some((id) => {
      const text = evidenceById.get(id)?.evidence_summary ?? "";
      return IRAN_TERMS.test(text) && !NEGATED_IRAN.test(text);
    })) {
      add("the cited evidence does not explicitly state an Iran connection");
    }
    const family = milestoneFamily(experience.milestone);
    if (experience.outcome === "milestone_attained") {
      if (family === "process") add(`${experience.milestone} is a process step, not an attained milestone; record it as claim_only`);
      if (!experience.evidence_ids.some(isPublic)) add("an attained milestone needs public evidence");
    }
    if (NEGATIVE_OUTCOMES.has(experience.outcome)) {
      if (!experience.event_date) add(`a ${experience.outcome} needs an event_date`);
      if (!experience.evidence_ids.some(hasLink)) add(`a ${experience.outcome} needs a public source link`);
    }
  });
  return issues;
}

// Profile URLs that look like personal names are allowed only on evidence marked public_person_locator that a
// Lived Experience cites, and on the source behind such evidence. Every use is recorded as an exception.
export function applyPublicPersonException(privacy, dataset) {
  const cited = new Set(dataset.lived_experiences.flatMap(experienceEvidenceIds));
  const excusedEvidence = new Set();
  const excusedSources = new Set();
  dataset.evidence.forEach((item, index) => {
    if (item.public_person_locator === true && cited.has(item.id)) {
      excusedEvidence.add(`evidence[${index}].source_url`);
      const sourceIndex = dataset.sources.findIndex((source) => source.id === item.source_id);
      if (sourceIndex >= 0 && dataset.sources[sourceIndex].source_url === item.source_url) excusedSources.add(`sources[${sourceIndex}].source_url`);
    }
  });
  const excused = (finding) => finding.rule === "possible_full_name_locator" && (excusedEvidence.has(finding.path) || excusedSources.has(finding.path));
  const findings = privacy.findings.filter((finding) => !excused(finding));
  const exceptions = [
    ...privacy.exceptions,
    ...privacy.findings.filter(excused).map((finding) => ({
      path: finding.path,
      rule: "public_person_locator",
      reason: "A public profile locator kept only as provenance for a cited Lived Experience; names are omitted from its text and ordinary output."
    }))
  ];
  return {
    status: findings.some((item) => item.status === "fail") ? "fail" : findings.length ? "needs_review" : "pass",
    findings,
    exceptions
  };
}
