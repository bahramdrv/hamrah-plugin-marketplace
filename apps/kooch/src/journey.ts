import { questions, type Answers } from './questions';
import { countries, facts, goalLabels, policies, preparationSteps, type FactId } from './policy';

export type InterviewQuestion = { id: string; title: string; help: string; kind: 'base' | 'fact'; options: { value: string; label: string }[] };
const sequences: Record<string, string[]> = {
  work: ['work', 'education', 'language', 'budget', 'timeline'],
  study: ['education', 'language', 'budget', 'timeline'],
  family: ['timeline'], business: ['work', 'budget', 'timeline'], investment: ['budget', 'timeline'],
  unknown: ['education', 'work', 'language', 'budget', 'timeline'],
};

export function buildJourney(answers: Answers, routeIds: string[], status: string, prerequisiteIds: FactId[]) {
  const hasAnswer = (id: string) => (answers.answered ?? []).includes(id as Answers['answered'][number]) ||
    (id === 'destinations' ? answers.destinations.length > 0 : id === 'budget' ? answers.budget !== null : answers[id as keyof Answers] !== 'unknown');
  const required = [...new Set(prerequisiteIds)];
  const base = ['goal', 'destinations', ...(sequences[answers.goal] ?? sequences.unknown)];
  const order = [...base.slice(0, 2), ...required, ...base.slice(2)];
  const descriptors: InterviewQuestion[] = order.map(id => {
    const question = questions.find(q => q.id === id);
    return question ? { ...question, kind: 'base' as const } : {
      id, title: facts[id as FactId], kind: 'fact' as const,
      help: 'این پاسخ کمک می‌کند قدم بعدی همین مسیر را مشخص کنیم.',
      options: [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }, { value: 'unknown', label: 'هنوز نمی‌دانم' }],
    };
  });
  const answered = (q: InterviewQuestion) => q.kind === 'fact' ? Object.hasOwn(answers.facts, q.id) : hasAnswer(q.id);
  const next = descriptors.find(q => !answered(q)) ?? null;
  const profile = questions.flatMap(q => {
    const value = answers[q.id as keyof Answers];
    const label = q.id === 'destinations' ? answers.destinations.map(c => countries[c]?.name ?? c).join('، ') :
      q.id === 'budget' ? answers.budget ? `${answers.budget.amount.toLocaleString('fa-IR')} ${answers.budget.currency}` : null :
      q.options.find(o => o.value === value && o.value !== 'unknown')?.label;
    return label ? [{ id: q.id, title: q.title, value: label }] : [];
  });
  const actions = required.flatMap(id => {
    if (answers.facts[id] === 'yes') return [];
    const associated = routeIds.filter(routeId => policies[routeId]?.requires.includes(id));
    if (!associated.length) return [];
    return [{ id, title: facts[id], detail: answers.facts[id] === 'no' && preparationSteps[id] ? preparationSteps[id]! :
      `این موضوع را روشن کن: ${facts[id]}`, route_ids: associated }];
  });
  const main = actions[0]?.detail ?? (routeIds.length ? 'شرط‌های باقی‌ماندهٔ مسیر و مدارک لازم را از منابع همین نتیجه بررسی کن.' :
    status === 'review_required' || status === 'no_coverage' ? 'شواهد مسیرها به دریافت و بازبینی تازه نیاز دارند.' : 'هدف و مقصدها را مرور کن؛ برای این انتخاب هنوز مسیر دارای پوشش نداریم.');
  return {
    interview: { version: 'guided-interview-1', next_question: next, questions: descriptors,
      question_order: order, answered_ids: descriptors.filter(answered).map(q => q.id), complete: next === null },
    guidance: { version: 'compass-guidance-1', profile, main_action: main, actions: actions.slice(0, 3),
      open_questions: required.filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown').map(id => ({ id, title: facts[id] })),
      report_kind: routeIds.some(id => ['uk:student', 'ca:study-permit-ca'].includes(id)) ? 'route_modules' : 'discovery',
      summary: routeIds.length ? `بر پایهٔ هدف «${goalLabels[answers.goal as keyof typeof goalLabels]}»${answers.destinations.length ? ` و مقصدهای ${answers.destinations.map(c => countries[c]?.name ?? c).join('، ')}` : ''}، این مسیرها برای بررسی بیشتر مرتبط‌اند.` : 'برای این انتخاب، نتیجهٔ مستند کافی در دسترس نیست.',
    },
  };
}
