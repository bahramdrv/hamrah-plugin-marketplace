import { createHash } from 'node:crypto';
import { formQuestions } from '../form/contract';
import articles from '../../data/knowledge/articles.json';

const aliases: Record<string, string> = {
  budget: 'پول هزینه ارز تومان ریال تمکن', age_exact: 'سن سال تولد', work_years: 'سابقه کار تجربه',
  language_exam: 'آزمون زبان آیلتس تافل', language_score: 'نمره زبان آیلتس تافل', study_offer: 'پذیرش دانشگاه',
};
export const knowledgeDocuments = [
  ...formQuestions.filter(q => !q.route_id).map(q => ({ id: `question-${q.id}`, title: q.title,
    keywords: aliases[q.id] ?? '', text: q.help,
    source: { path: 'apps/kooch/src/form/contract.ts', version: `question-${q.version}` } })),
  ...articles,
].map(doc => ({ ...doc, url: `/knowledge#${doc.id}`, reviewed_on: '2026-10-17' }));
const documents = knowledgeDocuments;
const corpusVersion = createHash('sha256').update(JSON.stringify(documents)).digest('hex');
const stopWords = new Set('و یا را از به با برای این آن در است هست من تو یک چند چطور چگونه کنم کنم؟ می شود می‌شود'.split(' '));
function tokens(text: string) {
  return text.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1 && !stopWords.has(word));
}
const index = documents.map(doc => {
  const words = tokens(`${doc.title} ${doc.title} ${doc.keywords} ${doc.text}`);
  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  return { doc, frequency, length: words.length };
});
const averageLength = index.reduce((n, entry) => n + entry.length, 0) / index.length;

export function retrieveKnowledge(query: string) {
  const words = [...new Set(tokens(query))].slice(0, 32);
  const ranked = index.map(entry => ({ entry, score: words.reduce((score, word) => {
    const frequency = entry.frequency.get(word) ?? 0;
    const count = index.filter(item => item.frequency.has(word)).length;
    const idf = Math.log(1 + (index.length - count + 0.5) / (count + 0.5));
    return score + idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * entry.length / averageLength));
  }, 0) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.entry.doc.id.localeCompare(b.entry.doc.id));
  const results = ranked.slice(0, 3).map(({ entry: { doc } }) => ({
    id: doc.id, title: doc.title, text: doc.text.slice(0, 900), url: doc.url, source: doc.source, reviewed_on: doc.reviewed_on,
  }));
  return { schema_version: 1, corpus_version: corpusVersion, scope: 'product_help', status: results.length ? 'matched' : 'no_coverage',
    generation: { enabled: false, reason: 'budget_zero' }, results,
    context: { scope: 'product_help', passages: results.map(({ id, text }) => ({ id, text })) } };
}
export type KnowledgeResult = ReturnType<typeof retrieveKnowledge>;
