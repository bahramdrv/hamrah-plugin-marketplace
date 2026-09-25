import { CURRENT_STATUSES } from "./community-aggregation.mjs";
import { countIndependentAskers, normalizeQuestionText } from "./community-questions.mjs";
import { DATASET_ROOT, loadCommunitySignalStore } from "./community-signals.mjs";

export class QuestionNotFoundError extends Error {}

function dateValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function inScope(values, wanted) {
  return !wanted || values.length === 0 || values.some((value) => normalizeQuestionText(value) === wanted);
}

function evidenceDate(item) {
  return item.event_date ?? item.published_at ?? item.retrieved_at?.slice(0, 10) ?? null;
}

// The newest copy of every Question in the store, with its evidence counted from what is still published.
function currentQuestions(store) {
  const newest = new Map();
  for (const { datasetId, canonical } of store.datasets) {
    const evidenceById = new Map(canonical.evidence.map((item) => [item.id, item]));
    for (const question of canonical.questions) {
      const existing = newest.get(question.id);
      if (!existing || dateValue(canonical.generatedAt) > dateValue(existing.canonical.generatedAt)) {
        newest.set(question.id, {
          datasetId,
          canonical,
          question,
          askers: countIndependentAskers(question.evidence_ids, evidenceById)
        });
      }
    }
  }
  return [...newest.values()];
}

function coverage(store, matchingDatasets) {
  return {
    status: matchingDatasets > 0 ? "evidence_found" : "no_coverage",
    note: matchingDatasets > 0
      ? "Counts are independent askers in validated datasets; they describe how often a question is asked, not its answer."
      : "No validated Hamrah dataset has community questions for this scope yet. This is missing coverage, not evidence that nobody asks it.",
    filesScanned: store.scanned,
    validDatasets: store.datasets.length,
    invalidDatasets: store.invalidDatasets,
    withdrawnDatasets: store.withdrawnDatasets,
    matchingDatasets
  };
}

function summary({ datasetId, canonical, question, askers }) {
  return {
    questionId: question.id,
    datasetId,
    schemaVersion: question.source_schema_version,
    canonicalEn: question.canonical_en,
    canonicalFa: question.canonical_fa,
    variants: question.variants,
    countryCodes: question.country_codes,
    routes: question.routes,
    topics: question.topics,
    processStages: question.process_stages,
    independentAskerCount: askers,
    evidenceCount: question.evidence_ids.length,
    trend: question.trend,
    answerStatus: question.answer_status,
    firstSeen: question.lifecycle.first_seen,
    lastSeen: question.lifecycle.last_seen,
    lifecycle: question.lifecycle,
    datasetGeneratedAt: canonical.generatedAt
  };
}

export function searchCommunityQuestions(args = {}, root = DATASET_ROOT, maxDatasets) {
  const store = loadCommunitySignalStore(root, maxDatasets);
  const countryCode = normalizeQuestionText(args.countryCode);
  const route = normalizeQuestionText(args.route);
  const topic = normalizeQuestionText(args.topic);
  const processStage = normalizeQuestionText(args.processStage);
  const tokens = normalizeQuestionText(args.query).split(" ").filter((token) => token.length >= 2);
  const statuses = Array.isArray(args.statuses) && args.statuses.length ? new Set(args.statuses) : CURRENT_STATUSES;

  const scoped = currentQuestions(store).filter(({ question }) =>
    inScope(question.country_codes, countryCode)
    && inScope(question.routes, route)
    && inScope(question.process_stages, processStage)
    && (!topic || question.topics.some((item) => normalizeQuestionText(item) === topic))
    && (!args.answerStatus || question.answer_status === args.answerStatus)
    && statuses.has(question.lifecycle.status));
  const matches = scoped.filter(({ question }) => {
    if (!tokens.length) return true;
    const text = normalizeQuestionText([question.canonical_en, question.canonical_fa, ...question.variants, ...question.topics].join(" "));
    return tokens.every((token) => text.includes(token));
  });
  const limit = Math.max(1, Math.min(50, Number.isInteger(args.limit) ? args.limit : 20));
  const ordered = matches
    .sort((a, b) => b.askers - a.askers || dateValue(b.question.lifecycle.last_seen) - dateValue(a.question.lifecycle.last_seen) || a.question.id.localeCompare(b.question.id))
    .slice(0, limit)
    .map(summary);
  return {
    source: "Hamrah Community Question Store",
    generatedAt: new Date().toISOString(),
    coverage: coverage(store, new Set(scoped.map((item) => item.datasetId)).size),
    filters: args,
    resultCount: ordered.length,
    questions: ordered,
    usageNote: "Questions show what applicants ask. answerStatus says whether an answer is established; a question is not evidence of any rule."
  };
}

export function getCommunityQuestion(args = {}, root = DATASET_ROOT, maxDatasets) {
  if (typeof args.questionId !== "string" || !args.questionId.trim()) {
    throw new Error("getCommunityQuestion requires a questionId from searchCommunityQuestions.");
  }
  const questionId = args.questionId.trim();
  const store = loadCommunitySignalStore(root, maxDatasets);
  const copies = store.datasets
    .filter(({ datasetId }) => !args.datasetId || datasetId === args.datasetId)
    .flatMap(({ datasetId, canonical }) => canonical.questions
      .filter((question) => question.id === questionId)
      .map((question) => ({ datasetId, canonical, question })))
    .sort((a, b) => dateValue(b.canonical.generatedAt) - dateValue(a.canonical.generatedAt));
  if (!copies.length) throw new QuestionNotFoundError(`Community question not found: ${questionId}`);

  const { datasetId, canonical, question } = copies[0];
  const sourcesById = new Map(canonical.sources.map((source) => [source.id, source]));
  const evidence = canonical.evidence
    .filter((item) => question.evidence_ids.includes(item.id))
    .map((item) => ({
      ...item,
      source_family: sourcesById.get(item.source_id)?.source_family ?? null,
      public: sourcesById.get(item.source_id)?.public ?? null
    }));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const dates = evidence.map(evidenceDate).filter(Boolean).sort();
  return {
    source: "Hamrah Community Question Store",
    datasetId,
    schemaVersion: question.source_schema_version,
    generatedAt: canonical.generatedAt,
    question,
    evidence,
    sources: canonical.sources.filter((source) => evidence.some((item) => item.source_id === source.id)),
    evidenceCoverage: {
      evidenceRecords: evidence.length,
      independentAskers: countIndependentAskers(question.evidence_ids, evidenceById),
      sourceFamilies: [...new Set(evidence.map((item) => item.source_family).filter(Boolean))].sort(),
      privateRecords: evidence.filter((item) => item.public === false).length,
      timeWindow: { earliest: dates[0] ?? null, latest: dates.at(-1) ?? null }
    },
    snapshots: copies.map((copy) => ({ datasetId: copy.datasetId, generatedAt: copy.canonical.generatedAt })),
    usageNote: "Evidence records are the posts where this question was asked; private-source records are context and are not publicly inspectable."
  };
}
