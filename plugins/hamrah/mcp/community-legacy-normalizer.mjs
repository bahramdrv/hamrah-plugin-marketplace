// Compatibility normalization for legacy community exports from origin/main. The output follows the
// 3.0.0 contract, except that values the source never stated stay unknown (see
// validateNormalizedLegacyDatasetV3).
import { createHash } from "node:crypto";

import { V3_SCHEMA_VERSION } from "./community-dataset-v3.mjs";

function q(status, note = null) { return { status, note }; }
function arr(value) { return Array.isArray(value) ? value : []; }
function normalized(value) { return String(value ?? "").trim().toLowerCase(); }
function oneOf(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function integerOrNull(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
function stringOrNull(value) { return value === null || value === undefined || value === "" ? null : String(value); }
function booleanOrNull(value) { return typeof value === "boolean" ? value : null; }

// The 3.0.0 contract needs both languages as strings, unlike the canonical `localized` helper, which
// returns null for a missing language.
function bilingualText(value) {
  const text = (part) => String(part || "");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { en: text(value.en ?? value.fa), fa: text(value.fa ?? value.en) };
  }
  return { en: text(value), fa: text(value) };
}

function sourceType(value) {
  const v = normalized(value);
  if (["json", "forum", "url", "text", "social", "mixed", "community_export", "other"].includes(v)) return v;
  if (v.includes("telegram") || v.includes("community") || v.includes("export") || v.includes("channel") || v.includes("supergroup")) return "community_export";
  if (v.includes("web") || v.includes("http") || v.includes("website")) return "url";
  if (v.includes("social")) return "social";
  return "other";
}

function coverageStatus(value, coverage = {}) {
  const v = normalized(value);
  if (["complete", "full", "full_export", "complete_export", "complete_scan"].includes(v)) return "complete";
  if (["partial", "truncated", "incomplete"].includes(v)) return "partial";
  if (coverage.truncated === false) return "complete";
  if (coverage.truncated === true) return "partial";
  return "unknown";
}

function locatorType(value, locatorValue) {
  const v = normalized(value);
  if (["message_id", "url", "citation", "record_id", "none"].includes(v)) return v;
  if (v.includes("message") || v.includes("telegram")) return "message_id";
  if (v.includes("record")) return "record_id";
  if (v.includes("cite") || v.includes("citation")) return "citation";
  if (v.includes("url") || normalized(locatorValue).startsWith("http")) return "url";
  return locatorValue ? "citation" : "none";
}

function firsthandness(value) {
  const v = normalized(value);
  if (["direct", "first_hand", "firsthand", "first-hand", "first_hand_applicant_experience"].includes(v)) return "direct";
  if (["second_hand", "secondhand", "second-hand", "indirect", "reported", "community_admin"].includes(v)) return "second_hand";
  return "unknown";
}

function lifecycleFrom(value) {
  const v = normalized(value);
  if (v === "resolved") return "resolved";
  if (v === "historical") return "historical";
  if (["unknown", "uncertain"].includes(v)) return "unknown";
  return "active";
}

// Only a maturity the source stated in the shared vocabulary is carried over. Other labels (such as
// "established"), confidence, and verification states never set it; it is otherwise unknown (null).
function maturityFrom(value) {
  const v = normalized(value);
  return ["anecdotal", "emerging", "corroborated", "officially_verified", "contradicted"].includes(v) ? v : null;
}

// A verification state the source did not give is unknown, not inferred from confidence.
function statedStatus(flag, whenTrue, whenFalse) {
  if (flag === true) return whenTrue;
  if (flag === false) return whenFalse;
  return "unknown";
}

function impactDirection(value) {
  const v = normalized(value);
  if (["negative", "positive_resolution", "mixed", "neutral"].includes(v)) return v;
  if (v === "positive" || v.includes("resolved") || v.includes("improv")) return "positive_resolution";
  if (v.includes("negative") || v.includes("adverse") || v.includes("friction")) return "negative";
  if (v.includes("mixed")) return "mixed";
  return "neutral";
}

function severity(value) {
  const v = normalized(value);
  // Recognized levels pass through; "medium" and anything unrecognized become "moderate".
  return ["low", "moderate", "high", "critical"].includes(v) ? v : "moderate";
}

function confidenceLevel(value) {
  const v = normalized(value && typeof value === "object" ? value.level : value);
  return oneOf(v, ["low", "medium", "high"], "low");
}

function reviewStatus(value, lifecycle, needsRecheck) {
  const v = normalized(value);
  if (["recheck_required", "monitor", "no_recheck", "resolved"].includes(v)) return v;
  if (lifecycle === "resolved") return "resolved";
  if (needsRecheck || ["monitoring", "uncertain", "candidate", "unvalidated_candidate"].includes(v)) return "recheck_required";
  return "no_recheck";
}

function qualityStatus(value) {
  const v = normalized(value);
  return oneOf(v, ["pass", "fail", "partial", "not_run", "not_available", "not_applicable"], "not_run");
}

function canonicalQuality(raw) {
  const checks = {};
  for (const [name, check] of Object.entries(raw.quality?.checks || {})) {
    checks[name] = q(qualityStatus(check?.status), stringOrNull(check?.note));
  }
  // Only a declared check result is carried over. Redaction notes and flags are claims, not a check, so
  // without a declaration the privacy result is unknown and publication rests on inspection alone.
  checks.privacy ??= q("unknown", "The source declared no privacy check result; the inspected privacy result decides.");
  return { checks };
}

function canonicalSource(source, index, raw) {
  const coverage = source?.coverage || {};
  return {
    source_id: String(source?.source_id || source?.sourceId || `source-${index + 1}`),
    name: String(source?.name || source?.source_name || source?.sourceName || raw.input?.groupName || raw.source || `Source ${index + 1}`),
    source_type: sourceType(source?.source_type || source?.sourceType || raw.input?.groupType || raw.source),
    source_url: stringOrNull(source?.source_url ?? source?.sourceUrl),
    coverage: {
      status: coverageStatus(coverage.status, coverage),
      from: stringOrNull(coverage.from ?? coverage.start ?? coverage.coverage_start ?? raw.input?.dateRange?.from),
      to: stringOrNull(coverage.to ?? coverage.end ?? coverage.coverage_end ?? raw.input?.dateRange?.to),
      records_available: integerOrNull(coverage.records_available ?? coverage.recordsAvailable ?? source?.records_available ?? source?.recordsAvailable ?? raw.input?.messageCount),
      records_processed: integerOrNull(coverage.records_processed ?? coverage.recordsProcessed ?? source?.records_processed ?? source?.recordsProcessed ?? raw.coverage?.messagesScanned)
    }
  };
}

function canonicalEvidence(item, index, defaultSourceId, generatedAt, fallbackId) {
  const locatorValue = item?.locator?.value ?? item?.source_message_id ?? item?.sourceMessageId ?? item?.source_url ?? item?.sourceUrl ?? null;
  const summaryValue = item?.summary ?? item?.evidence_summary ?? item?.claim ?? item?.excerpt ?? "";
  return {
    evidence_id: String(item?.evidence_id || item?.evidenceId || `${fallbackId}-E${index + 1}`),
    source_id: String(item?.source_id || item?.sourceId || defaultSourceId),
    locator: {
      type: locatorType(item?.locator?.type ?? item?.locatorType ?? (item?.sourceMessageId || item?.source_message_id ? "message_id" : item?.sourceUrl || item?.source_url ? "url" : null), locatorValue),
      value: stringOrNull(locatorValue)
    },
    published_at: stringOrNull(item?.published_at ?? item?.publishedAt ?? item?.sourceDate ?? item?.date),
    event_date: stringOrNull(item?.event_date ?? item?.eventDate ?? item?.sourceDate ?? item?.date),
    collected_at: stringOrNull(item?.collected_at ?? item?.collectedAt ?? generatedAt),
    source_type: String(item?.source_type || item?.sourceType || "unknown"),
    firsthandness: firsthandness(item?.firsthandness ?? item?.direct_or_second_hand ?? item?.sourceType),
    summary: bilingualText(summaryValue),
    privacy_redacted: booleanOrNull(item?.privacy_redacted ?? item?.privacyRedacted)
  };
}

function canonicalEntity(item) {
  if (typeof item === "string") return { entity_type: "organization", name: item };
  return { entity_type: String(item?.entity_type || item?.entityType || item?.type || "organization"), name: String(item?.name || item?.label || "Unknown entity") };
}

function canonicalRelationship(item) {
  if (typeof item === "string") return { type: "related_to", signal_id: item };
  const type = oneOf(normalized(item?.type), ["correlates_with", "same_issue_cluster", "caused_by", "supersedes", "contradicts", "related_to"], "related_to");
  const signalId = item?.signal_id ?? item?.signalId;
  return signalId ? { type, signal_id: String(signalId) } : null;
}

function canonicalEvidenceLink(item) {
  const evidenceId = item?.evidence_id ?? item?.evidenceId;
  if (!evidenceId) return null;
  return {
    evidence_id: String(evidenceId),
    relation: oneOf(normalized(item?.relation ?? item?.supports_or_contradicts), ["supports", "contradicts", "resolves", "context"], "context"),
    independence_group: String(item?.independence_group || item?.independenceGroup || evidenceId)
  };
}

function canonicalVerificationState(value, fallbackStatus, evidenceIds) {
  return {
    status: String(value?.status || fallbackStatus),
    evidence_ids: arr(value?.evidence_ids ?? value?.evidenceIds).map(String).length ? arr(value?.evidence_ids ?? value?.evidenceIds).map(String) : evidenceIds,
    checked_at: stringOrNull(value?.checked_at ?? value?.checkedAt),
    note: stringOrNull(value?.note)
  };
}

// A signal the source left unnamed is identified by a SHA-256 digest of its own content, so the same input
// always yields the same ID. The digest is spelled in letters only (0-9 become g-p) so that privacy
// inspection never mistakes a run of digits in it for a phone number or account ID.
function derivedSignalId(signal) {
  const digest = createHash("sha256").update(JSON.stringify(signal ?? null)).digest("hex").slice(0, 16);
  return `signal-${digest.replace(/\d/gu, (digit) => String.fromCharCode(103 + Number(digit)))}`;
}

function canonicalSignal(signal, signalId, raw, generatedAt, nestedEvidenceLinks = []) {
  const scope = signal?.scope || {};
  const destination = scope.destination || signal?.destination || {};
  const applicants = scope.applicants || signal?.applicant_scope || signal?.applicantScope || {};
  const routes = scope.routes || {};
  const assessment = signal?.assessment || {};
  const confidence = confidenceLevel(assessment.confidence ?? signal?.confidence);
  const official = signal?.verification?.official || signal?.official_verification || {};
  const community = signal?.verification?.community || {};
  const lifecycle = lifecycleFrom(assessment.lifecycle ?? signal?.status);
  const evidenceLinks = arr(signal?.evidence_links ?? signal?.evidenceLinks).map(canonicalEvidenceLink).filter(Boolean);
  if (!evidenceLinks.length) evidenceLinks.push(...nestedEvidenceLinks);
  const evidenceIds = evidenceLinks.map((link) => link.evidence_id);
  const entitiesRaw = arr(scope.entities).length ? arr(scope.entities) : arr(signal?.entities).length ? arr(signal?.entities) : signal?.entity ? [signal.entity] : [];
  const routeCodes = arr(routes.codes).length ? arr(routes.codes) : arr(signal?.migration_routes).length ? arr(signal.migration_routes) : signal?.route ? [signal.route] : [];
  const routeFamilies = arr(routes.families).length ? arr(routes.families) : arr(signal?.migration_route_family).length ? arr(signal.migration_route_family) : signal?.route ? [signal.route] : [];
  const claim = signal?.claim || {};
  const summary = claim.summary ?? signal?.summary ?? signal?.summary_en ?? "";
  const title = claim.title ?? signal?.title ?? signal?.topic ?? signalId;
  const review = signal?.review || {};
  const reviewValue = review.status ?? signal?.validationStatus ?? signal?.status;
  const needsRecheck = assessment.needsFreshnessCheck === true || signal?.needs_recheck === true || signal?.needsRecheck === true || normalized(raw.coverage?.validationStatus).includes("candidate");

  return {
    signal_id: signalId,
    issue_cluster_id: stringOrNull(signal?.issue_cluster_id ?? signal?.issueClusterId ?? signal?.root_cause_id),
    relationships: arr(signal?.relationships).map(canonicalRelationship).filter(Boolean).concat(arr(signal?.correlated_signal_ids).map((id) => ({ type: "correlates_with", signal_id: String(id) }))),
    classification: {
      family: String(signal?.classification?.family || signal?.signal_family || assessment.signalFamily || "OTHER"),
      type: String(signal?.classification?.type || signal?.signal_type || assessment.signalType || signal?.topic || "other"),
      class: String(signal?.classification?.class || signal?.signal_class || assessment.signalClass || "other")
    },
    scope: {
      destination: {
        country: String(destination.country || signal?.country || signal?.countryCode || raw.filters?.country || raw.filters?.countryCode || ""),
        country_code: String(destination.country_code || destination.countryCode || signal?.countryCode || raw.filters?.countryCode || ""),
        region: stringOrNull(destination.region ?? signal?.region),
        city: stringOrNull(destination.city ?? signal?.city)
      },
      applicants: {
        origin_countries: arr(applicants.origin_countries ?? applicants.originCountries).map(String).length ? arr(applicants.origin_countries ?? applicants.originCountries).map(String) : signal?.originCountry ? [String(signal.originCountry)] : raw.filters?.originCountry ? [String(raw.filters.originCountry)] : [],
        nationalities: arr(applicants.nationalities).map(String).length ? arr(applicants.nationalities).map(String) : signal?.nationality ? [String(signal.nationality)] : raw.filters?.nationality ? [String(raw.filters.nationality)] : [],
        residence_countries: arr(applicants.residence_countries ?? applicants.residenceCountries).map(String),
        applying_from: arr(applicants.applying_from ?? applicants.applyingFrom).map(String),
        age_groups: arr(applicants.age_groups ?? applicants.ageGroups).map(String),
        occupations: arr(applicants.occupations).map(String),
        fields: arr(applicants.fields).map(String),
        education_levels: arr(applicants.education_levels ?? applicants.educationLevels).map(String),
        regulated_professions: arr(applicants.regulated_professions ?? applicants.regulatedProfessions).map(String),
        other_conditions: arr(applicants.other_conditions ?? applicants.otherConditions).map(String)
      },
      routes: { families: routeFamilies.filter((route) => route !== "other").map(String), codes: routeCodes.filter((route) => route !== "other").map((route) => normalized(route).replace(/\s+/gu, "_")) },
      process_stages: arr(scope.process_stages ?? scope.processStages).map(String).length ? arr(scope.process_stages ?? scope.processStages).map(String) : signal?.processStage ? [String(signal.processStage)] : [],
      entities: entitiesRaw.map(canonicalEntity)
    },
    claim: {
      title: bilingualText(title),
      summary: bilingualText(summary),
      practical_impact: bilingualText(claim.practical_impact ?? claim.practicalImpact ?? signal?.practical_impact ?? signal?.practicalImpact ?? ""),
      who_should_care: bilingualText(claim.who_should_care ?? claim.whoShouldCare ?? signal?.who_should_care ?? signal?.whoShouldCare ?? ""),
      recommended_action: bilingualText(claim.recommended_action ?? claim.recommendedAction ?? signal?.recommended_action ?? signal?.recommendedAction ?? ""),
      known_workaround: typeof (claim.known_workaround ?? claim.knownWorkaround ?? signal?.known_workaround ?? signal?.knownWorkaround) === "string" ? (claim.known_workaround ?? claim.knownWorkaround ?? signal?.known_workaround ?? signal?.knownWorkaround) : null
    },
    evidence_links: evidenceLinks,
    assessment: {
      lifecycle,
      evidence_maturity: maturityFrom(assessment.evidence_maturity ?? assessment.evidenceMaturity),
      trend: oneOf(normalized(assessment.trend ?? signal?.trend), ["worsening", "stable", "improving", "resolved", "unknown"], "unknown"),
      severity: severity(assessment.severity ?? signal?.severity),
      confidence: { level: confidence, rationale: String((typeof assessment.confidence === "object" ? assessment.confidence.rationale : null) || assessment.reason || signal?.reason_for_adjustment || "Imported community evidence; confidence preserved where available and otherwise kept conservative.") },
      impact_direction: impactDirection(assessment.impact_direction ?? assessment.impactDirection ?? signal?.impact_direction),
      assessed_at: String(assessment.assessed_at ?? assessment.assessedAt ?? signal?.last_verified ?? signal?.lastObservedAt ?? generatedAt),
      method: { name: String(assessment.method?.name || "hamrah-community-import"), version: String(assessment.method?.version || "3.0") }
    },
    verification: {
      official: canonicalVerificationState(official, statedStatus(signal?.officially_confirmed, "confirmed", "not_verified"), []),
      community: canonicalVerificationState(community, statedStatus(signal?.community_confirmed, "corroborated", "unverified"), evidenceIds)
    },
    review: {
      status: reviewStatus(reviewValue, lifecycle, needsRecheck),
      last_checked_at: stringOrNull(review.last_checked_at ?? review.lastCheckedAt ?? signal?.last_verified ?? signal?.lastObservedAt),
      next_check_at: stringOrNull(review.next_check_at ?? review.nextCheckAt ?? signal?.suggested_recheck_date),
      reason: String(review.reason || (needsRecheck ? "Imported candidate/community signal; freshness or confirmation recheck remains required." : "Imported into the canonical Community Signal Store.")),
      confirmation_criteria: arr(review.confirmation_criteria ?? review.confirmationCriteria).map(String)
    },
    keywords: arr(signal?.keywords).map(String).length ? arr(signal.keywords).map(String) : [signal?.topic, signal?.route, signal?.countryCode].filter(Boolean).map(String)
  };
}

function canonicalizeLooseDataset(raw, datasetId) {
  const generatedAt = String(raw.dataset?.generated_at ?? raw.dataset?.generatedAt ?? raw.generated_at ?? raw.generatedAt ?? new Date(0).toISOString());
  let sources = arr(raw.sources).map((source, index) => canonicalSource(source, index, raw));
  if (!sources.length) {
    sources = [canonicalSource({
      source_id: "import-source",
      name: raw.input?.groupName || raw.source || datasetId,
      source_type: raw.input?.groupType || "community_export",
      coverage: {
        status: coverageStatus(raw.coverage?.status, raw.coverage || {}),
        from: raw.input?.dateRange?.from,
        to: raw.input?.dateRange?.to,
        records_available: raw.input?.messageCount,
        records_processed: raw.coverage?.messagesScanned
      }
    }, 0, raw)];
  }
  const sourceIds = new Set(sources.map((source) => source.source_id));
  const defaultSourceId = sources[0].source_id;
  const evidence = arr(raw.evidence).map((item, index) => {
    const canonical = canonicalEvidence(item, index, defaultSourceId, generatedAt, datasetId);
    if (!sourceIds.has(canonical.source_id)) canonical.source_id = defaultSourceId;
    return canonical;
  });
  const evidenceIds = new Set(evidence.map((item) => item.evidence_id));
  const signals = [];
  const derivedIds = new Set();
  for (const [signalIndex, signal] of arr(raw.signals).entries()) {
    const statedId = signal?.signal_id || signal?.signalId;
    let signalId = statedId ? String(statedId) : derivedSignalId(signal);
    // Identical unnamed signals get a positional suffix so their IDs stay unique and reproducible.
    if (!statedId && derivedIds.has(signalId)) signalId = `${signalId}-${signalIndex + 1}`;
    if (!statedId) derivedIds.add(signalId);
    const nestedLinks = [];
    for (const [evidenceIndex, item] of arr(signal?.evidence).entries()) {
      const canonical = canonicalEvidence(item, evidenceIndex, defaultSourceId, generatedAt, signalId);
      if (!sourceIds.has(canonical.source_id)) canonical.source_id = defaultSourceId;
      let evidenceId = canonical.evidence_id;
      if (evidenceIds.has(evidenceId)) evidenceId = `${signalId}-E${evidenceIndex + 1}`;
      canonical.evidence_id = evidenceId;
      evidenceIds.add(evidenceId);
      evidence.push(canonical);
      nestedLinks.push({ evidence_id: evidenceId, relation: "supports", independence_group: evidenceId });
    }
    signals.push(canonicalSignal(signal, signalId, raw, generatedAt, nestedLinks));
  }
  return {
    schema_version: V3_SCHEMA_VERSION,
    taxonomy_version: String(raw.taxonomy_version || raw.taxonomyVersion || "2026.09"),
    dataset: {
      dataset_id: String(raw.dataset?.dataset_id || raw.dataset?.datasetId || datasetId),
      generated_at: generatedAt,
      generator: { name: String(raw.dataset?.generator?.name || "hamrah-community-import"), version: String(raw.dataset?.generator?.version || "3.0") }
    },
    sources,
    evidence,
    signals,
    quality: canonicalQuality(raw),
    extensions: {
      ...(raw.extensions && typeof raw.extensions === "object" && !Array.isArray(raw.extensions) ? raw.extensions : {}),
      normalized_at_ingest: true,
      source_schema: raw.schema_version || "candidate-extraction"
    }
  };
}

// Version 2 datasets have their own adapter; only version 3 exports carrying legacy blocks and schema-less
// signal candidate exports are normalized here.
export function normalizeCommunityDataset(raw, datasetId = "dataset") {
  const version = raw?.schema_version ?? null;
  if (version === V3_SCHEMA_VERSION || (version === null && Array.isArray(raw?.signals))) return canonicalizeLooseDataset(raw, datasetId);
  throw new Error(`unsupported legacy community-signal export ${version ?? "<missing>"}; expected a ${V3_SCHEMA_VERSION} export or a signal candidate export`);
}
