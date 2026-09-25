import { readFileSync } from "node:fs";

import { countIndependentReports, CURRENT_STATUSES } from "./community-aggregation.mjs";
import { parseIsoDay } from "./community-dataset-v4.mjs";
import { QuestionNotFoundError } from "./community-question-tools.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

// Deterministic FAQ answers. A Question's answer_links name the Route Claims and Signals a researcher linked to
// it; this engine decides which of them currently support an answer and what kind of answer that is.

// The versioned fact-type freshness policy shared with the scorecard validator.
const FRESHNESS_POLICY = JSON.parse(readFileSync(
  new URL("../skills/hamrah-scorecard-engine/references/freshness_policy.json", import.meta.url), "utf8"
));
const CLAIM_FACT_TYPES = { official_rule: "statutory_condition" };
const AUTHORITATIVE = new Set(["primary", "trusted"]);
const EXPLANATIONS_FA = {
  official: "پاسخ بر پایه قاعده رسمی جاری با منبع معتبر است. شرایط فردی را جداگانه بررسی کنید.",
  evidence_based: "پاسخ بر پایه چند شاهد عمومی و مستقل است، اما منبع رسمی جاری آن را تأیید نکرده است.",
  community_observation: "این فقط مشاهده جامعه کاربران است و قاعده رسمی یا احتمال موفقیت نیست.",
  partially_answered: "شواهد فعلی فقط بخشی از پرسش را پاسخ می‌دهد و بخش‌های دیگر نامعلوم است.",
  outdated: "شواهد موجود قدیمی است و تا بررسی دوباره منبع نمی‌توان به آن تکیه کرد.",
  unresolved: "شواهد موجود متناقض یا ناکافی است و پاسخ قطعی داده نمی‌شود.",
  research_required: "هنوز شاهد معتبر و مرتبطی برای این پرسش ثبت نشده است؛ این به معنای منفی بودن پاسخ نیست."
};

function dayNumber(day) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function claimFreshness(claim, evidence, asOf) {
  const factType = CLAIM_FACT_TYPES[claim.claim_type] ?? claim.claim_type;
  const rule = FRESHNESS_POLICY.fact_types[factType];
  const retrieved = evidence.map((item) => parseIsoDay(item.retrieved_at, false, true)).filter(Boolean).sort().at(-1);
  if (!rule || !retrieved) return { status: "unknown", ageDays: null, maxAgeDays: rule?.max_age_days ?? null, factType: rule ? factType : null };
  const ageDays = dayNumber(asOf) - dayNumber(retrieved);
  const status = ageDays > rule.max_age_days ? "stale" : ageDays > rule.aging_after_days ? "aging" : "current";
  return { status, ageDays, maxAgeDays: rule.max_age_days, factType };
}

function signalFreshness(signal, asOf) {
  const recheck = signal.suggested_recheck_date;
  if (!parseIsoDay(recheck, true, false)) return { status: "unknown", recheckBy: recheck ?? null };
  return { status: asOf > recheck ? "stale" : "current", recheckBy: recheck };
}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

// The newest published copy of every Signal and Route Claim, with the dataset it came from.
function artifactIndex(store) {
  const index = new Map();
  for (const entry of store.datasets) {
    const { canonical } = entry;
    for (const [kind, artifacts] of [["signal", canonical.signals], ["route_claim", canonical.routeClaims]]) {
      for (const artifact of artifacts) {
        const existing = index.get(artifact.id);
        if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) {
          index.set(artifact.id, { kind, artifact, datasetId: entry.datasetId, canonical });
        }
      }
    }
  }
  return index;
}

function inScope(question, countryCode, routes) {
  const countryOk = question.country_codes.length === 0 || question.country_codes.includes(countryCode);
  const routesOk = question.routes.length === 0 || routes.length === 0 || routes.some((route) => question.routes.includes(route));
  return countryOk && routesOk;
}

function citation(item, sourcesById, role) {
  const source = sourcesById.get(item.source_id);
  return {
    evidenceId: item.id,
    role,
    sourceName: item.source_name ?? source?.source_name ?? null,
    sourceFamily: source?.source_family ?? null,
    sourceUrl: item.source_url,
    public: source?.public ?? null,
    authority: item.authority,
    retrievedAt: item.retrieved_at,
    contentHash: item.content_hash
  };
}

function evaluateLink(link, question, index, asOf) {
  const found = index.get(link.artifact_id);
  if (!found) return { link, excluded: "not_found" };
  const { kind, artifact, datasetId, canonical } = found;
  const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  const evidence = artifact.evidence_ids.map((id) => evidenceById.get(id)).filter(Boolean);
  const base = { link, kind, artifact, datasetId, evidence, sourcesById };
  if (!CURRENT_STATUSES.has(artifact.lifecycle.status)) return { ...base, excluded: "not_current" };
  const scoped = kind === "route_claim"
    ? inScope(question, artifact.country_code, artifact.routes)
    : inScope(question, artifact.destination.country_code, artifact.migration_routes);
  if (!scoped) return { ...base, excluded: "out_of_scope" };
  const freshness = kind === "route_claim" ? claimFreshness(artifact, evidence, asOf) : signalFreshness(artifact, asOf);
  if (freshness.status === "stale") return { ...base, freshness, excluded: "stale" };
  if (freshness.status === "unknown") return { ...base, freshness, excluded: "unknown_freshness" };
  if (kind !== "route_claim") return { ...base, freshness, official: false };
  // An official rule needs a Route Claim whose authoritative, publicly inspectable HTTPS source is itself fresh;
  // fresher community evidence on the same claim cannot stand in for it.
  const authoritative = evidence.filter((item) => AUTHORITATIVE.has(item.authority)
    && sourcesById.get(item.source_id)?.public === true && /^https:\/\//.test(item.source_url ?? ""));
  const officialFreshness = authoritative.length ? claimFreshness(artifact, authoritative, asOf) : null;
  const official = ["current", "aging"].includes(officialFreshness?.status);
  return { ...base, freshness: official ? officialFreshness : freshness, official };
}

function lastVerified(items) {
  const dates = items.flatMap(({ artifact, evidence }) => [
    artifact.lifecycle.last_verified,
    ...evidence.map((item) => item.retrieved_at?.slice(0, 10))
  ]).filter(Boolean).sort();
  return dates.at(-1) ?? null;
}

function decide(supporting, partial, contradictions, excluded, publicSources) {
  const officialAnswers = supporting.filter((item) => item.official);
  const officialConflict = contradictions.some((item) => item.kind === "official");
  if (officialAnswers.length && officialConflict) {
    return { answerType: "unresolved", confidence: "low", reasons: ["conflicting official evidence"] };
  }
  if (officialAnswers.length) {
    return contradictions.length
      ? { answerType: "official", confidence: "medium", reasons: ["current official rule; community evidence disagrees"] }
      : { answerType: "official", confidence: "high", reasons: ["current official rule with authoritative source"] };
  }
  if (supporting.length) {
    if (contradictions.length) return { answerType: "unresolved", confidence: "low", reasons: ["conflicting community evidence"] };
    return publicSources >= 2
      ? { answerType: "evidence_based", confidence: "medium", reasons: [`${publicSources} independent public sources and no current official rule`] }
      : { answerType: "community_observation", confidence: "low", reasons: ["community evidence only"] };
  }
  if (partial.length) {
    return { answerType: "partially_answered", confidence: partial.some((item) => item.official) ? "medium" : "low", reasons: ["linked evidence answers only part of the question"] };
  }
  if (excluded.some((item) => item.excluded === "stale")) {
    return { answerType: "outdated", confidence: "low", reasons: ["all supporting evidence is past its freshness limit"] };
  }
  if (excluded.some((item) => ["unknown_freshness", "not_current"].includes(item.excluded))) {
    return { answerType: "unresolved", confidence: "low", reasons: ["linked evidence cannot be confirmed as current"] };
  }
  return { answerType: "research_required", confidence: "low", reasons: ["no current, in-scope evidence is linked to this question"] };
}

export function answerCommunityQuestion(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.questionId !== "string" || !args.questionId.trim()) {
    throw new Error("answerCommunityQuestion requires a questionId from searchCommunityQuestions.");
  }
  const asOf = args.asOf ?? new Date().toISOString().slice(0, 10);
  if (!parseIsoDay(asOf, true, false)) throw new Error(`asOf ${asOf} is not an ISO date.`);
  const store = loadCommunitySignalStore(root, maxDatasets);
  const copies = store.datasets
    .flatMap(({ datasetId, canonical }) => canonical.questions.filter((item) => item.id === args.questionId.trim()).map((question) => ({ datasetId, canonical, question })))
    .sort((a, b) => dateValue(b.canonical.generatedAt) - dateValue(a.canonical.generatedAt));
  if (!copies.length) throw new QuestionNotFoundError(`Community question not found: ${args.questionId}`);
  const { datasetId, question } = copies[0];

  const index = artifactIndex(store);
  const evaluated = (question.answer_links ?? []).map((link) => evaluateLink(link, question, index, asOf));
  const usable = evaluated.filter((item) => !item.excluded);
  const supporting = usable.filter((item) => item.link.relation === "answers");
  const partial = usable.filter((item) => item.link.relation === "partially_answers");
  const contradicting = usable.filter((item) => item.link.relation === "contradicts");
  const excluded = evaluated.filter((item) => item.excluded);
  const contradictions = [
    ...contradicting.map((item) => ({ artifactId: item.artifact.id, kind: item.official ? "official" : "community", source: "answer_link" })),
    ...[...supporting, ...partial].filter((item) => item.kind === "route_claim" && item.artifact.opposing_evidence_ids.length)
      .map((item) => ({ artifactId: item.artifact.id, kind: "community", source: "opposing_evidence", evidenceIds: item.artifact.opposing_evidence_ids }))
  ];
  const community = [...supporting, ...partial].filter((item) => !item.official);
  const communityEvidence = community.flatMap((item) => item.evidence.map((evidence) => ({ datasetId: item.datasetId, evidence, source: item.sourcesById.get(evidence.source_id) })));
  const decision = decide(supporting, partial, contradictions, excluded,
    countIndependentReports(communityEvidence.filter((item) => item.source?.public === true)));

  const cite = (items, role) => items.flatMap((item) => item.evidence.map((evidence) => citation(evidence, item.sourcesById, role)));
  const citations = [...cite(supporting, "supports"), ...cite(partial, "partially_supports"), ...cite(contradicting, "contradicts")];
  return {
    source: "Hamrah Community Answer Engine",
    questionId: question.id,
    datasetId,
    asOf,
    question: {
      canonicalEn: question.canonical_en,
      canonicalFa: question.canonical_fa,
      countryCodes: question.country_codes,
      routes: question.routes,
      topics: question.topics
    },
    ...decision,
    explanationFa: EXPLANATIONS_FA[decision.answerType],
    official: [...supporting, ...partial].filter((item) => item.official).map((item) => ({
      claimId: item.artifact.id,
      relation: item.link.relation,
      datasetId: item.datasetId,
      statementEn: item.artifact.statement_en,
      claimType: item.artifact.claim_type,
      routes: item.artifact.routes,
      processStage: item.artifact.process_stage,
      freshness: item.freshness,
      citations: cite([item], item.link.relation === "answers" ? "supports" : "partially_supports")
    })),
    communityObservations: community.map((item) => ({
      artifactId: item.artifact.id,
      kind: item.kind,
      relation: item.link.relation,
      datasetId: item.datasetId,
      title: item.kind === "signal" ? item.artifact.title : item.artifact.statement_en,
      summaryFa: item.kind === "signal" ? item.artifact.summary_fa : null,
      freshness: item.freshness,
      citations: cite([item], item.link.relation === "answers" ? "supports" : "partially_supports")
    })),
    contradictions,
    excluded: excluded.map((item) => ({
      artifactId: item.link.artifact_id,
      relation: item.link.relation,
      reason: item.excluded,
      ...(item.freshness ? { freshness: item.freshness } : {})
    })),
    citations,
    independentCommunitySources: countIndependentReports(communityEvidence),
    lastVerifiedAt: lastVerified([...supporting, ...partial]),
    storedAnswerStatus: question.answer_status,
    usageNote: "Official rules come only from current Route Claims with authoritative public sources. Community observations are context, not rules or probabilities; research_required means unknown, not a negative answer."
  };
}
