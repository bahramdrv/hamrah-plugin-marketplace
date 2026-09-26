import { readFileSync } from "node:fs";

import { countIndependentReports } from "./community-aggregation.mjs";
import { assessRouteClaim, CONFIDENCE_POLICY } from "./community-claim-confidence.mjs";

export const MATURITY_POLICY = JSON.parse(readFileSync(
  new URL("../skills/hamrah-signal-builder/references/community_maturity_policy.json", import.meta.url), "utf8"
));

// A v3 source states its own maturity. Legacy versions need an explicit, versioned interpretation.
export function evidenceMaturityForSignal(signal, dataset, datasetId, asOf) {
  if (dataset.schemaVersion === "3.0.0") return signal.evidence_maturity ?? null;
  if (!["2.0", "4.0.0"].includes(dataset.schemaVersion)) return null;
  if (signal.community_confirmed === null || signal.community_confirmed === undefined) return null;
  if (signal.community_confirmed !== MATURITY_POLICY.required_community_verification) return "emerging";

  const evidenceById = new Map(dataset.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(dataset.sources.map((item) => [item.id, item]));
  const linked = signal.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean);
  if (!linked.length) return null;
  const supporting = linked.filter((item) => item.supports_or_contradicts === "supports");
  const items = supporting.map((evidence) => ({ datasetId, evidence, source: sourcesById.get(evidence.source_id) }));
  if (countIndependentReports(items) < MATURITY_POLICY.minimum_independent_supporting_reports) return "emerging";

  if (dataset.schemaVersion === "2.0") return "corroborated";

  const publicItems = items.filter((item) => item.source?.public === true);
  if (countIndependentReports(publicItems) >= MATURITY_POLICY.minimum_independent_supporting_reports) {
    // Reuse the Route Claim Evidence Confidence computation for the signal's public evidence. Its
    // ordinary public-only rule still applies; private observations cannot raise that score.
    const publicOpposing = linked.filter((evidence) => evidence.supports_or_contradicts === "contradicts"
      && sourcesById.get(evidence.source_id)?.public === true);
    const claim = {
      id: signal.id, claim_type: "operational_pattern", country_code: signal.destination.country_code,
      routes: signal.migration_routes, process_stage: signal.process_stages[0] ?? null,
      applicant_scope: signal.applicant_scope, lifecycle: signal.lifecycle,
      evidence_ids: publicItems.map((item) => item.evidence.id),
      opposing_evidence_ids: publicOpposing.map((item) => item.id)
    };
    const canonical = { evidence: dataset.evidence, sources: dataset.sources };
    const assessment = assessRouteClaim({ datasetId, canonical, claim }, {}, asOf);
    const minimumScore = CONFIDENCE_POLICY.labels.find((item) =>
      item.label === MATURITY_POLICY.minimum_public_evidence_confidence_label)?.min;
    if (minimumScore === undefined) throw new Error("Community maturity policy names an unknown Evidence Confidence label.");
    if (assessment.evidenceConfidence.score >= minimumScore) return "corroborated";
  }

  // Private, de-identified reports can warn in an applicant's Practical Fit under ADR 0004.
  // They still need explicit community verification and independent reports; confidence is
  // the source's recorded assessment, not a replacement for either gate.
  if (linked.some((evidence) => evidence.supports_or_contradicts === "contradicts"
    && sourcesById.get(evidence.source_id)?.public === true)) return "emerging";
  const privateItems = items.filter((item) => item.source?.public !== true);
  return countIndependentReports(privateItems) >= MATURITY_POLICY.minimum_independent_supporting_reports
    && ["medium", "high"].includes(signal.confidence) ? "corroborated" : "emerging";
}
