import { parseIsoDay } from "./community-dataset-v4.mjs";

// Deterministic rules for official approval statistics: an authoritative public source, a defined population and
// period, and counts whose arithmetic holds. A rate is reproduced only from a matching numerator and denominator.

const AUTHORITATIVE = new Set(["primary", "trusted"]);
const AUTHORITY_SOURCE_TYPES = new Set(["official_government", "official_immigration_authority", "official_embassy_or_consulate"]);
const OUTCOME_MEASURES = ["approvals", "refusals"];
// Allowed difference, in percentage points, between a published rate and the rate the counts give.
const RATE_TOLERANCE = 0.1;

export function isAuthoritativeStatisticEvidence(item, source) {
  return Boolean(item && AUTHORITATIVE.has(item.authority) && source?.public === true
    && /^https:\/\//.test(item.source_url ?? "") && AUTHORITY_SOURCE_TYPES.has(item.source_type));
}

const percent = (numerator, denominator) => Math.round((numerator / denominator) * 1000) / 10;
const samePeriod = (a, b) => a.start === b.start && a.end === b.end;
const samePopulation = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Why a numerator cannot be divided by the statistic's applications, or null when it can.
function mismatch(statistic, measure) {
  const { applications } = statistic.counts;
  const numerator = statistic.counts[measure];
  if (!numerator || !applications) return null;
  if (!samePopulation(numerator.population_en, applications.population_en) || !samePopulation(applications.population_en, statistic.population.description_en)) {
    return { code: "mismatched_population", measure, message: `${measure} count "${numerator.population_en}" and applications count "${applications.population_en}" do not describe the statistic's population "${statistic.population.description_en}".` };
  }
  if (!samePeriod(numerator.period, applications.period) || !samePeriod(applications.period, statistic.period)) {
    return { code: "mismatched_period", measure, message: `${measure} and applications do not cover the statistic's period ${statistic.period.start} to ${statistic.period.end}.` };
  }
  return null;
}

export function statisticIssues(statistics, evidence, sources, generatedAt, collection = "official_statistics") {
  const reference = parseIsoDay(generatedAt, false, true);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const issues = [];
  statistics.forEach((statistic, index) => {
    const at = `${collection}[${index}]`;
    const add = (gate, message) => issues.push({ gate, message: `${at}: ${message}` });
    for (const id of statistic.evidence_ids) {
      const item = evidenceById.get(id);
      if (item && !isAuthoritativeStatisticEvidence(item, sourcesById.get(item.source_id))) {
        add("evidence", `an official statistic needs an authoritative public HTTPS source; community samples cannot be official statistics (evidence ${id})`);
      }
    }
    const periods = [["period", statistic.period], ...Object.entries(statistic.counts).filter(([, value]) => value).map(([measure, value]) => [`counts.${measure}.period`, value.period])];
    for (const [field, period] of periods) {
      const start = parseIsoDay(period.start, true, false);
      const end = parseIsoDay(period.end, true, false);
      if (!start || !end) add("provenance", `${field} needs ISO start and end dates`);
      else if (start > end) add("provenance", `${field} starts after it ends`);
      else if (reference && end > reference) add("provenance", `${field} ends after generated_at`);
    }
    const { applications, approvals, refusals } = statistic.counts;
    if (!approvals && !refusals) {
      add("evidence", "an official statistic needs approvals or refusals");
      return;
    }
    const matched = OUTCOME_MEASURES.filter((measure) => statistic.counts[measure] && !mismatch(statistic, measure));
    if (!applications) return;
    for (const measure of matched) {
      if (statistic.counts[measure].count > applications.count) add("evidence", `${measure} exceed applications`);
    }
    if (matched.length === 2 && approvals.count + refusals.count > applications.count) add("evidence", "approvals and refusals exceed applications");
    if (statistic.published_success_rate === null || !matched.includes("approvals")) return;
    if (applications.count === 0) {
      add("evidence", "published_success_rate needs applications; none were recorded");
      return;
    }
    // Authorities state a success rate over all applications or over decided (approved plus refused) cases.
    const definitions = [(approvals.count / applications.count) * 100];
    if (matched.includes("refusals") && approvals.count + refusals.count > 0) definitions.push((approvals.count / (approvals.count + refusals.count)) * 100);
    if (!definitions.some((value) => Math.abs(statistic.published_success_rate - value) <= RATE_TOLERANCE)) {
      add("evidence", `published_success_rate ${statistic.published_success_rate} does not match ${definitions.map((value) => Math.round(value * 10) / 10).join(" or ")} (approvals / applications${definitions.length > 1 ? " or approvals / decided cases" : ""})`);
    }
  });
  return issues;
}

// Rates come only from counts that share the statistic's population and period; a published rate is never copied.
export function assessStatistic(statistic, hasAuthoritativeSource) {
  const reasons = [];
  const { applications } = statistic.counts;
  if (!hasAuthoritativeSource) reasons.push({ code: "no_authoritative_source", measure: null, message: "No remaining evidence is an authoritative public source." });
  if (!applications) reasons.push({ code: "missing_denominator", measure: "applications", message: "The authority's application count for this population and period is not recorded." });
  else if (applications.count === 0) reasons.push({ code: "zero_applications", measure: "applications", message: "No applications were recorded, so no rate exists." });
  if (!statistic.counts.approvals) reasons.push({ code: "missing_approvals", measure: "approvals", message: "The authority's approvals count is not recorded, so no official success rate exists." });
  const rates = {};
  for (const measure of OUTCOME_MEASURES) {
    const problem = mismatch(statistic, measure);
    if (problem) reasons.push(problem);
    const usable = hasAuthoritativeSource && applications?.count > 0 && statistic.counts[measure] && !problem;
    rates[measure] = usable ? percent(statistic.counts[measure].count, applications.count) : null;
  }
  return {
    status: rates.approvals !== null ? "official" : "unresolved",
    official_success_rate: rates.approvals,
    official_refusal_rate: rates.refusals,
    reasons
  };
}
