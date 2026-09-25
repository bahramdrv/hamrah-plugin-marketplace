// Deterministic rules for Community Questions. A model may propose which phrasings belong together; these rules
// decide identity, independent asker counts, and whether a proposed merge is ambiguous.

// Normalizes English and Persian question text: letter variants, diacritics, digits, punctuation, case, and spacing.
export function normalizeQuestionText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064a\u0649]/gu, "\u06cc")
    .replace(/\u0643/gu, "\u06a9")
    .replace(/[\u064b-\u065f\u0670\u0640]/gu, "")
    .replace(/[\u06f0-\u06f9]/gu, (digit) => String(digit.codePointAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/gu, (digit) => String(digit.codePointAt(0) - 0x0660))
    .replace(/[\u200c\u200d]/gu, " ")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

// Posts in one independence group come from one asker, and posts sharing a content hash are copies of one post.
export function countIndependentAskers(evidenceIds, evidenceById) {
  const parent = new Map();
  const find = (item) => {
    if (!parent.has(item)) parent.set(item, item);
    while (parent.get(item) !== item) item = parent.get(item);
    return item;
  };
  const firstByKey = new Map();
  for (const id of evidenceIds) {
    const evidence = evidenceById.get(id);
    if (!evidence) continue;
    find(id);
    for (const key of [evidence.independence_group && `group:${evidence.independence_group}`, evidence.content_hash && `hash:${evidence.content_hash}`]) {
      if (!key) continue;
      if (firstByKey.has(key)) parent.set(find(id), find(firstByKey.get(key)));
      else firstByKey.set(key, id);
    }
  }
  return new Set([...parent.keys()].map(find)).size;
}

function overlaps(a, b) {
  return a.length === 0 || b.length === 0 || a.some((item) => b.includes(item));
}

export function scopesOverlap(a, b) {
  return overlaps(a.country_codes, b.country_codes) && overlaps(a.routes, b.routes);
}

function phrasings(question) {
  return new Set([question.canonical_en, question.canonical_fa, ...question.variants].map(normalizeQuestionText).filter(Boolean));
}

export function askerCountIssues(questions, evidence, collection = "questions") {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return questions.flatMap((question, index) => {
    const counted = countIndependentAskers(question.evidence_ids, evidenceById);
    return counted === question.independent_asker_count
      ? []
      : [{ gate: "evidence", message: `${collection}[${index}] declares ${question.independent_asker_count} independent askers but its evidence shows ${counted}` }];
  });
}

// The same wording mapped to two different Questions with overlapping scope is an unresolved merge decision.
export function ambiguityIssues(questions, collection = "questions") {
  const issues = [];
  // Only questions sharing a normalized wording can conflict, so compare within each wording bucket.
  const byPhrasing = new Map();
  questions.forEach((question, index) => {
    for (const text of phrasings(question)) {
      if (!byPhrasing.has(text)) byPhrasing.set(text, []);
      byPhrasing.get(text).push(index);
    }
  });
  const reported = new Set();
  for (const [text, indexes] of byPhrasing) {
    for (let a = 0; a < indexes.length; a++) {
      for (let b = a + 1; b < indexes.length; b++) {
        const [i, j] = [indexes[a], indexes[b]];
        const pair = `${i}:${j}`;
        if (reported.has(pair) || questions[i].id === questions[j].id || !scopesOverlap(questions[i], questions[j])) continue;
        reported.add(pair);
        issues.push({
          gate: "deduplication",
          message: `${collection}[${i}] and ${collection}[${j}]: ambiguous merge, the wording "${text}" belongs to both; resolve it before publishing (needs_review)`
        });
      }
    }
  }
  return issues;
}

// Merges two records that normalize to the same Question identity, or explains why they cannot be merged.
export function mergeQuestions(first, second) {
  for (const field of ["answer_status", "trend", "canonical_fa"]) {
    if (normalizeQuestionText(first[field]) !== normalizeQuestionText(second[field])) {
      return { issue: `conflicting ${field} for ${first.id}: ${first[field]} vs ${second[field]}` };
    }
  }
  if (first.lifecycle.status !== second.lifecycle.status) {
    return { issue: `conflicting lifecycle status for ${first.id}: ${first.lifecycle.status} vs ${second.lifecycle.status}` };
  }
  const union = (a, b) => [...new Set([...a, ...b])];
  const variants = union(first.variants, [second.canonical_en, ...second.variants]).filter((text) => text !== first.canonical_en);
  const earliest = (a, b) => (a && b ? (a < b ? a : b) : a ?? b);
  const latest = (a, b) => (a && b ? (a > b ? a : b) : a ?? b);
  return {
    merged: {
      ...first,
      variants,
      topics: union(first.topics, second.topics),
      process_stages: union(first.process_stages, second.process_stages),
      evidence_ids: union(first.evidence_ids, second.evidence_ids).sort(),
      lifecycle: {
        ...first.lifecycle,
        first_seen: earliest(first.lifecycle.first_seen, second.lifecycle.first_seen),
        last_seen: latest(first.lifecycle.last_seen, second.lifecycle.last_seen),
        last_verified: latest(first.lifecycle.last_verified ?? null, second.lifecycle.last_verified ?? null)
      }
    }
  };
}
