import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const DATASET_ROOT = fileURLToPath(new URL("../data/community-signals/datasets/", import.meta.url));
const SCHEMA = JSON.parse(readFileSync(new URL("../skills/hamrah-signal-builder/references/output_schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateSchema = ajv.compile(SCHEMA);
const MAX_DATASETS = 500;
const MAX_DATASET_BYTES = 2_000_000;

function walkJsonFiles(directory, output = []) {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return output; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length >= MAX_DATASETS) break;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkJsonFiles(absolutePath, output);
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(absolutePath);
  }
  return output;
}

function q(status, note = null) { return { status, note }; }
function arr(value) { return Array.isArray(value) ? value : []; }
function normalized(value) { return String(value ?? "").trim().toLowerCase(); }
function dateValue(value) { const ts = Date.parse(value || ""); return Number.isNaN(ts) ? 0 : ts; }
function local(en = "", fa = "") { return { en: String(en || ""), fa: String(fa || "") }; }
function oneOf(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function integerOrNull(value) { return Number.isInteger(value) && value >= 0 ? value : null; }
function stringOrNull(value) { return value === null || value === undefined || value === "" ? null : String(value); }

function localized(value, fallback = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const en = value.en ?? value.fa ?? fallback;
    const fa = value.fa ?? value.en ?? fallback;
    return local(en, fa);
  }
  return local(value ?? fallback, value ?? fallback);
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

function maturityFrom(value, confidence, officialStatus, communityStatus) {
  const v = normalized(value);
  if (["anecdotal", "emerging", "corroborated", "officially_verified", "contradicted"].includes(v)) return v;
  if (v.includes("contradict")) return "contradicted";
  if (v.includes("official") || normalized(officialStatus).includes("confirm")) return "officially_verified";
  if (v.includes("corrobor") || v.includes("confirm") || normalized(communityStatus).includes("corrobor") || normalized(confidence) === "high") return "corroborated";
  if (v.includes("emerg") || normalized(confidence) === "medium") return "emerging";
  return "anecdotal";
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
  if (["low", "moderate", "high", "critical"].includes(v)) return v;
  if (v === "medium") return "moderate";
  return "moderate";
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

function canonicalQuality(raw, evidence) {
  const checks = {};
  for (const [name, check] of Object.entries(raw.quality?.checks || {})) {
    checks[name] = q(qualityStatus(check?.status), stringOrNull(check?.note));
  }
  const existingPrivacy = checks.privacy?.status === "pass";
  const evidencePrivacy = evidence.length > 0 && evidence.every((item) => item.privacy_redacted === true);
  const legacyPrivacy = raw.quality_control?.personal_identifiers_removed === true;
  const privacyStatement = normalized(raw.extractionMethod?.privacy ?? raw.extraction_method?.privacy ?? "");
  const declaredPrivacy = /omitt|redact|remov|anonym|حذف|ناشناس/.test(privacyStatement);
  checks.privacy = q(existingPrivacy || evidencePrivacy || legacyPrivacy || declaredPrivacy ? "pass" : "fail",
    existingPrivacy ? checks.privacy.note : declaredPrivacy ? "Source extraction declares participant identifiers omitted or redacted." : evidencePrivacy ? "All evidence records declare privacy_redacted=true." : legacyPrivacy ? "Legacy quality control declares personal identifiers removed." : null);
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
    summary: localized(summaryValue),
    privacy_redacted: item?.privacy_redacted === true || item?.privacyRedacted === true
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

function canonicalSignal(signal, raw, generatedAt, nestedEvidenceLinks = []) {
  const signalId = String(signal?.signal_id || signal?.signalId || `signal-${Math.random().toString(36).slice(2)}`);
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
      routes: { families: routeFamilies.filter((route) => route !== "other").map(String), codes: routeCodes.filter((route) => route !== "other").map(String) },
      process_stages: arr(scope.process_stages ?? scope.processStages).map(String).length ? arr(scope.process_stages ?? scope.processStages).map(String) : signal?.processStage ? [String(signal.processStage)] : [],
      entities: entitiesRaw.map(canonicalEntity)
    },
    claim: {
      title: localized(title),
      summary: localized(summary),
      practical_impact: localized(claim.practical_impact ?? claim.practicalImpact ?? signal?.practical_impact ?? signal?.practicalImpact ?? ""),
      who_should_care: localized(claim.who_should_care ?? claim.whoShouldCare ?? signal?.who_should_care ?? signal?.whoShouldCare ?? ""),
      recommended_action: localized(claim.recommended_action ?? claim.recommendedAction ?? signal?.recommended_action ?? signal?.recommendedAction ?? ""),
      known_workaround: typeof (claim.known_workaround ?? claim.knownWorkaround ?? signal?.known_workaround ?? signal?.knownWorkaround) === "string" ? (claim.known_workaround ?? claim.knownWorkaround ?? signal?.known_workaround ?? signal?.knownWorkaround) : null
    },
    evidence_links: evidenceLinks,
    assessment: {
      lifecycle,
      evidence_maturity: maturityFrom(assessment.evidence_maturity ?? assessment.evidenceMaturity, confidence, official.status, community.status),
      trend: oneOf(normalized(assessment.trend ?? signal?.trend), ["worsening", "stable", "improving", "resolved", "unknown"], "unknown"),
      severity: severity(assessment.severity ?? signal?.severity),
      confidence: { level: confidence, rationale: String((typeof assessment.confidence === "object" ? assessment.confidence.rationale : null) || assessment.reason || signal?.reason_for_adjustment || "Imported community evidence; confidence preserved where available and otherwise kept conservative.") },
      impact_direction: impactDirection(assessment.impact_direction ?? assessment.impactDirection ?? signal?.impact_direction),
      assessed_at: String(assessment.assessed_at ?? assessment.assessedAt ?? signal?.last_verified ?? signal?.lastObservedAt ?? generatedAt),
      method: { name: String(assessment.method?.name || "hamrah-community-import"), version: String(assessment.method?.version || "3.0") }
    },
    verification: {
      official: canonicalVerificationState(official, signal?.officially_confirmed ? "confirmed" : "not_verified", []),
      community: canonicalVerificationState(community, confidence === "high" ? "corroborated" : "unverified", evidenceIds)
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
  for (const [signalIndex, signal] of arr(raw.signals).entries()) {
    const signalId = String(signal?.signal_id || signal?.signalId || `signal-${signalIndex + 1}`);
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
    signals.push(canonicalSignal(signal, raw, generatedAt, nestedLinks));
  }
  const privacyStatement = normalized(raw.extractionMethod?.privacy ?? raw.extraction_method?.privacy ?? "");
  const declaredPrivacy = /omitt|redact|remov|anonym|حذف|ناشناس/.test(privacyStatement);
  if (declaredPrivacy) for (const item of evidence) item.privacy_redacted = true;
  return {
    schema_version: "3.0.0",
    taxonomy_version: String(raw.taxonomy_version || raw.taxonomyVersion || "2026.09"),
    dataset: {
      dataset_id: String(raw.dataset?.dataset_id || raw.dataset?.datasetId || datasetId),
      generated_at: generatedAt,
      generator: { name: String(raw.dataset?.generator?.name || "hamrah-community-import"), version: String(raw.dataset?.generator?.version || "3.0") }
    },
    sources,
    evidence,
    signals,
    quality: canonicalQuality(raw, evidence),
    extensions: {
      ...(raw.extensions && typeof raw.extensions === "object" && !Array.isArray(raw.extensions) ? raw.extensions : {}),
      normalized_at_ingest: true,
      source_schema: raw.schema_version || "candidate-extraction"
    }
  };
}

function maturity(signal) {
  if (signal.officially_confirmed) return "officially_verified";
  if (signal.community_confirmed || signal.confidence === "high") return "corroborated";
  if (signal.confidence === "medium") return "emerging";
  return "anecdotal";
}

function lifecycle(signal) {
  if (signal.status === "resolved") return "resolved";
  if (signal.status === "historical") return "historical";
  if (signal.status === "uncertain") return "unknown";
  return "active";
}

function legacyQuality(raw) {
  const qc = raw.quality_control || {};
  const check = (name) => q(qc[name] === true ? "pass" : "not_run");
  return { checks: {
    privacy: q(qc.personal_identifiers_removed === true ? "pass" : "fail"),
    full_sources_processed: check("full_sources_processed"),
    reply_chains_considered: check("reply_chains_considered"),
    duplicates_merged: check("duplicates_merged"),
    contradictions_checked: check("contradictions_checked"),
    resolutions_checked: check("resolutions_checked"),
    country_scope_checked: check("country_scope_checked"),
    route_scope_checked: check("route_scope_checked"),
    institution_scope_checked: check("institution_scope_checked"),
    correlated_penalties_checked: check("correlated_penalties_checked")
  }};
}

function migrateV2(raw, datasetId) {
  const sources = arr(raw.source_coverage).map((source, index) => ({
    source_id: source.source_id || `source-${index + 1}`,
    name: source.source_name || source.source_id || `Source ${index + 1}`,
    source_type: sourceType(source.source_type),
    source_url: source.source_url ?? null,
    coverage: {
      status: source.coverage_complete === true ? "complete" : source.coverage_complete === false ? "partial" : "unknown",
      from: source.coverage_start || null,
      to: source.coverage_end || null,
      records_available: source.coverage_complete === true ? (source.records_processed ?? null) : null,
      records_processed: Number.isInteger(source.records_processed) ? source.records_processed : null
    }
  }));
  if (!sources.length) sources.push({ source_id: "legacy-source", name: "Legacy v2 source", source_type: "other", source_url: null, coverage: { status: "unknown", from: null, to: null, records_available: null, records_processed: null } });
  const defaultSourceId = sources[0].source_id;
  const evidenceById = new Map();
  const signals = arr(raw.signals).map((signal) => {
    const links = [];
    for (const item of arr(signal.evidence)) {
      const evidenceId = item.evidence_id || `${signal.signal_id}-E${links.length + 1}`;
      if (!evidenceById.has(evidenceId)) evidenceById.set(evidenceId, {
        evidence_id: evidenceId,
        source_id: defaultSourceId,
        locator: { type: item.source_message_id ? (String(item.source_message_id).includes("filecite") ? "citation" : "message_id") : item.source_url ? "url" : "none", value: item.source_message_id ?? item.source_url ?? null },
        published_at: item.date || null,
        event_date: item.date || null,
        collected_at: raw.generated_at || null,
        source_type: item.source_type || "unknown",
        firsthandness: item.direct_or_second_hand === "direct" ? "direct" : item.direct_or_second_hand === "second_hand" ? "second_hand" : "unknown",
        summary: local(item.evidence_summary || "", item.evidence_summary || ""),
        privacy_redacted: raw.quality_control?.personal_identifiers_removed === true
      });
      links.push({ evidence_id: evidenceId, relation: ["supports", "contradicts", "resolves"].includes(item.supports_or_contradicts) ? item.supports_or_contradicts : "context", independence_group: item.independence_group || evidenceId });
    }
    const officialStatus = signal.official_verification?.status || (signal.officially_confirmed ? "confirmed" : "not_verified");
    return {
      signal_id: signal.signal_id,
      issue_cluster_id: signal.root_cause_id || null,
      relationships: arr(signal.correlated_signal_ids).map((signalId) => ({ type: "correlates_with", signal_id: signalId })),
      classification: { family: signal.signal_family || "OTHER", type: signal.signal_type || "other", class: signal.signal_class || "other" },
      scope: {
        destination: { country: signal.destination?.country || "", country_code: signal.destination?.country_code || "", region: signal.destination?.region ?? null, city: signal.destination?.city ?? null },
        applicants: {
          origin_countries: arr(signal.applicant_scope?.origin_countries), nationalities: arr(signal.applicant_scope?.nationalities), residence_countries: arr(signal.applicant_scope?.residence_countries), applying_from: arr(signal.applicant_scope?.applying_from), age_groups: arr(signal.applicant_scope?.age_groups), occupations: arr(signal.applicant_scope?.occupations), fields: arr(signal.applicant_scope?.fields), education_levels: arr(signal.applicant_scope?.education_levels), regulated_professions: arr(signal.applicant_scope?.regulated_professions), other_conditions: arr(signal.applicant_scope?.other_conditions)
        },
        routes: { families: arr(signal.migration_route_family), codes: arr(signal.migration_routes).filter((route) => route !== "other") },
        process_stages: arr(signal.process_stages), entities: arr(signal.entities).map(canonicalEntity)
      },
      claim: {
        title: local(signal.title || signal.summary_en || signal.signal_id, signal.title || signal.summary_fa || ""), summary: local(signal.summary_en || "", signal.summary_fa || ""), practical_impact: local(signal.practical_impact || "", signal.practical_impact || ""), who_should_care: local(signal.who_should_care || "", signal.who_should_care || ""), recommended_action: local(signal.recommended_action || "", signal.recommended_action || ""), known_workaround: typeof signal.known_workaround === "string" ? signal.known_workaround : null
      },
      evidence_links: links,
      assessment: {
        lifecycle: lifecycle(signal), evidence_maturity: maturity(signal), trend: oneOf(signal.trend, ["worsening", "stable", "improving", "resolved", "unknown"], "unknown"), severity: severity(signal.severity), confidence: { level: confidenceLevel(signal.confidence), rationale: signal.reason_for_adjustment || "Migrated from the validated v2 assessment without adding new claims." }, impact_direction: impactDirection(signal.impact_direction), assessed_at: signal.last_verified || raw.generated_at, method: { name: "hamrah-signal-builder", version: "3.0" }
      },
      verification: {
        official: { status: officialStatus, evidence_ids: [], checked_at: signal.official_verification?.verified_at ?? null, note: signal.official_verification?.note ?? null }, community: { status: signal.community_confirmed ? "corroborated" : "unverified", evidence_ids: links.map((link) => link.evidence_id), checked_at: signal.last_verified || null, note: null }
      },
      review: { status: signal.status === "resolved" ? "resolved" : signal.needs_recheck || ["monitoring", "uncertain"].includes(signal.status) ? "recheck_required" : "no_recheck", last_checked_at: signal.last_verified || null, next_check_at: signal.suggested_recheck_date || null, reason: signal.reason_for_adjustment || "Migrated from v2 review state.", confirmation_criteria: [] },
      keywords: arr(signal.keywords)
    };
  });
  return { schema_version: "3.0.0", taxonomy_version: "2026.09", dataset: { dataset_id: datasetId, generated_at: raw.generated_at, generator: { name: "hamrah-v2-compat-migrator", version: "1.0" } }, sources, evidence: [...evidenceById.values()], signals, quality: legacyQuality(raw), extensions: { migrated_from_schema: "2.0" } };
}

export function normalizeCommunityDataset(raw, datasetId = "dataset") {
  if (raw?.schema_version === "2.0") return migrateV2(raw, datasetId);
  if (raw?.schema_version === "3.0.0" || Array.isArray(raw?.signals)) return canonicalizeLooseDataset(raw, datasetId);
  throw new Error(`unsupported community-signal schema ${raw?.schema_version ?? "<missing>"}; expected v3, explicit v2, or a signal candidate export`);
}

function compactSchemaErrors(errors = []) { return errors.slice(0, 12).map((error) => `${error.instancePath || "<root>"}: ${error.message}`); }

function semanticErrors(dataset) {
  const errors = [];
  if (dataset.quality?.checks?.privacy?.status !== "pass") errors.push("quality.checks.privacy.status must be pass");
  const sourceIds = new Set();
  for (const source of dataset.sources || []) { if (sourceIds.has(source.source_id)) errors.push(`duplicate source_id ${source.source_id}`); sourceIds.add(source.source_id); }
  const evidenceIds = new Set();
  for (const evidence of dataset.evidence || []) { if (evidenceIds.has(evidence.evidence_id)) errors.push(`duplicate evidence_id ${evidence.evidence_id}`); evidenceIds.add(evidence.evidence_id); if (!sourceIds.has(evidence.source_id)) errors.push(`${evidence.evidence_id}: unknown source_id ${evidence.source_id}`); }
  const signalIds = new Set();
  for (const signal of dataset.signals || []) {
    if (signalIds.has(signal.signal_id)) errors.push(`duplicate signal_id ${signal.signal_id}`);
    signalIds.add(signal.signal_id);
    if (Object.hasOwn(signal, "suggested_fit_adjustment") || Object.hasOwn(signal, "conditional_adjustment")) errors.push(`${signal.signal_id}: scoring adjustments are forbidden in v3 canonical signals`);
    for (const link of signal.evidence_links || []) if (!evidenceIds.has(link.evidence_id)) errors.push(`${signal.signal_id}: unknown evidence_id ${link.evidence_id}`);
  }
  return errors.slice(0, 12);
}

function datasetIdFor(filePath, root) { return path.relative(root, filePath).split(path.sep).join("/").replace(/\.json$/i, ""); }

export function loadCommunitySignalStore(root = DATASET_ROOT) {
  const datasets = [];
  const invalidDatasets = [];
  const files = walkJsonFiles(root);
  for (const filePath of files) {
    const datasetId = datasetIdFor(filePath, root);
    try {
      if (statSync(filePath).size > MAX_DATASET_BYTES) throw new Error(`file exceeds ${MAX_DATASET_BYTES} bytes`);
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const dataset = normalizeCommunityDataset(raw, datasetId);
      const schemaValid = validateSchema(dataset);
      const errors = [...(schemaValid ? [] : compactSchemaErrors(validateSchema.errors)), ...semanticErrors(dataset)];
      if (errors.length) throw new Error(errors.join("; "));
      datasets.push({ datasetId, dataset });
    } catch (error) {
      invalidDatasets.push({ datasetId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { root, scanned: files.length, datasets, invalidDatasets, truncated: files.length >= MAX_DATASETS };
}

function arrayIncludes(values, wanted) { return !wanted || (Array.isArray(values) && values.some((value) => normalized(value) === wanted)); }
function legacyStatus(signal) {
  if (signal.assessment.lifecycle === "resolved") return "resolved";
  if (signal.assessment.lifecycle === "historical") return "historical";
  if (signal.assessment.lifecycle === "unknown") return "uncertain";
  if (["recheck_required", "monitor"].includes(signal.review.status)) return "monitoring";
  return "active";
}
function statusMatches(signal, statuses) {
  const selected = Array.isArray(statuses) && statuses.length ? statuses : ["active", "monitoring", "uncertain"];
  return selected.includes(legacyStatus(signal)) || selected.includes(signal.assessment.lifecycle);
}
function searchableText(signal) {
  return [signal.claim.title.en, signal.claim.title.fa, signal.classification.family, signal.classification.type, signal.classification.class, signal.claim.summary.en, signal.claim.summary.fa, signal.claim.practical_impact.en, signal.claim.practical_impact.fa, ...(signal.keywords || [])].join(" ").toLowerCase();
}
function matchesSignal(signal, args) {
  const countryCode = normalized(args.countryCode), country = normalized(args.country), route = normalized(args.route), topic = normalized(args.topic), stage = normalized(args.processStage), origin = normalized(args.originCountry), nationality = normalized(args.nationality), entity = normalized(args.entity);
  if (countryCode && normalized(signal.scope.destination.country_code) !== countryCode) return false;
  if (country && !normalized(signal.scope.destination.country).includes(country)) return false;
  if (route && !arrayIncludes(signal.scope.routes.codes, route) && !arrayIncludes(signal.scope.routes.families, route)) return false;
  if (stage && !arrayIncludes(signal.scope.process_stages, stage)) return false;
  if (origin && ![...signal.scope.applicants.origin_countries, ...signal.scope.applicants.residence_countries, ...signal.scope.applicants.applying_from].some((value) => normalized(value) === origin)) return false;
  if (nationality && !arrayIncludes(signal.scope.applicants.nationalities, nationality)) return false;
  if (entity && !signal.scope.entities.some((item) => normalized(item.name).includes(entity))) return false;
  if (!statusMatches(signal, args.statuses)) return false;
  return !topic || searchableText(signal).includes(topic);
}
function evidenceStats(dataset, signal) {
  const map = new Map(dataset.evidence.map((item) => [item.evidence_id, item]));
  const listed = signal.evidence_links.map((link) => map.get(link.evidence_id)).filter(Boolean);
  const dates = listed.map((item) => item.event_date || item.published_at).filter(Boolean).sort();
  return { evidenceCount: listed.length, independentReportCount: new Set(signal.evidence_links.map((link) => link.independence_group)).size, firstSeen: dates[0] || null, lastSeen: dates.at(-1) || null };
}
function publicSignal(datasetId, dataset, signal) {
  const stats = evidenceStats(dataset, signal);
  return {
    datasetId, datasetGeneratedAt: dataset.dataset.generated_at, signalId: signal.signal_id, issueClusterId: signal.issue_cluster_id,
    title: signal.claim.title, classification: signal.classification, status: legacyStatus(signal), assessment: signal.assessment,
    destination: signal.scope.destination, applicantScope: signal.scope.applicants, migrationRoutes: signal.scope.routes.codes,
    migrationRouteFamily: signal.scope.routes.families, processStages: signal.scope.process_stages, entities: signal.scope.entities,
    summaryEn: signal.claim.summary.en, summaryFa: signal.claim.summary.fa, practicalImpact: signal.claim.practical_impact,
    whoShouldCare: signal.claim.who_should_care, recommendedAction: signal.claim.recommended_action, knownWorkaround: signal.claim.known_workaround,
    verification: signal.verification, review: signal.review, relationships: signal.relationships, ...stats
  };
}

export function searchCommunitySignals(args = {}, root = DATASET_ROOT) {
  const store = loadCommunitySignalStore(root);
  const newestBySignalId = new Map();
  for (const { datasetId, dataset } of store.datasets) for (const signal of dataset.signals) {
    if (!matchesSignal(signal, args)) continue;
    const existing = newestBySignalId.get(signal.signal_id);
    if (!existing || dateValue(dataset.dataset.generated_at) > dateValue(existing.dataset.dataset.generated_at)) newestBySignalId.set(signal.signal_id, { datasetId, dataset, signal });
  }
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const matches = [...newestBySignalId.values()].sort((a, b) => dateValue(b.signal.assessment.assessed_at) - dateValue(a.signal.assessment.assessed_at)).slice(0, limit).map(({ datasetId, dataset, signal }) => publicSignal(datasetId, dataset, signal));
  return { source: "Hamrah Community Signal Store v3", generatedAt: new Date().toISOString(), coverage: { filesScanned: store.scanned, validDatasets: store.datasets.length, invalidDatasets: store.invalidDatasets, truncated: store.truncated }, filters: args, resultCount: matches.length, signals: matches, usageNote: "Community signals provide evidence and assessment only. Applicant-specific fit scoring belongs to the Advisor scoring policy." };
}

export function getCommunitySignalDataset(args = {}, root = DATASET_ROOT) {
  if (typeof args.datasetId !== "string" || !args.datasetId.trim()) throw new Error("getCommunitySignalDataset requires a non-empty datasetId from searchCommunitySignals.");
  const store = loadCommunitySignalStore(root);
  const found = store.datasets.find(({ datasetId }) => datasetId === args.datasetId.trim());
  if (!found) throw new Error(`Community signal dataset not found: ${args.datasetId}`);
  const requested = Array.isArray(args.signalIds) && args.signalIds.length ? new Set(args.signalIds.map(String)) : null;
  const signals = requested ? found.dataset.signals.filter((signal) => requested.has(signal.signal_id)) : found.dataset.signals;
  const evidenceIds = new Set(signals.flatMap((signal) => signal.evidence_links.map((link) => link.evidence_id)));
  const evidence = found.dataset.evidence.filter((item) => evidenceIds.has(item.evidence_id));
  return {
    source: "Hamrah Community Signal Store v3", datasetId: found.datasetId, schemaVersion: found.dataset.schema_version,
    taxonomyVersion: found.dataset.taxonomy_version, dataset: found.dataset.dataset, sources: found.dataset.sources, evidence, signals,
    quality: found.dataset.quality, qualityControl: { personal_identifiers_removed: found.dataset.quality.checks.privacy.status === "pass" },
    missingSignalIds: requested ? [...requested].filter((signalId) => !signals.some((signal) => signal.signal_id === signalId)) : [],
    usageNote: "Canonical community signals do not store applicant-specific fit adjustments."
  };
}

export { DATASET_ROOT };
