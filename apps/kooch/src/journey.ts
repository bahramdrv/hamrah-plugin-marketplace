import { questions, type Answers } from './questions';
import { countries, factTitle, goalLabels, policies, preparationSteps, isPriorHistoryFact, type FactId } from './policy';
import { sharedPrerequisites, sharedConceptForFact, sharedConflicts, projectSharedFacts, type SharedPrerequisite } from './shared-prerequisites';

export type InterviewQuestion = { id: string; title: string; help: string; kind: 'base' | 'fact'; answer_version?: string; options: { value: string; label: string }[] };
const sequences: Record<string, string[]> = {
  work: ['work', 'education', 'language', 'budget', 'timeline'],
  study: ['education', 'language', 'budget', 'timeline'],
  family: ['timeline'], business: ['work', 'budget', 'timeline'], investment: ['budget', 'timeline'],
  unknown: ['education', 'work', 'language', 'budget', 'timeline'],
};

export function buildJourney(answers: Answers, routeIds: string[], status: string, prerequisiteIds: FactId[], routePolicies = policies, reviewIds: string[] = []) {
  const hasAnswer = (id: string) => (answers.answered ?? []).includes(id as Answers['answered'][number]) ||
    (id.endsWith('_countries') ? answers[id as 'job_offer_countries' | 'admission_countries'] !== null : id === 'destinations' ? answers.destinations.length > 0 : id === 'budget' ? answers.budget !== null : answers[id as keyof Answers] !== 'unknown');
  const required = [...new Set(prerequisiteIds)];
  const base = ['goal', 'destinations', ...(sequences[answers.goal] ?? sequences.unknown)];
  const concepts = [...new Set(required.flatMap(id => sharedConceptForFact(id) ?? []))].filter(key =>
    answers[key] !== 'unknown' || !required.filter(id => sharedConceptForFact(id) === key).every(id => Object.hasOwn(answers.facts, id)));
  const conflicts = sharedConflicts(answers);
  answers = projectSharedFacts(answers, Object.keys(countries));
  const countryQuestion = (key: SharedPrerequisite) => `${key}_countries`;
  const sharedOrder = concepts.flatMap(key => [key, ...(['job_offer', 'admission'].includes(key) && answers[key] === 'some' ? [countryQuestion(key)] : [])]);
  const countryRequired = required.filter(id => {
    const key = sharedConceptForFact(id);
    if (!key) return true;
    if (conflicts.includes(key)) return false;
    if (!concepts.includes(key)) return true;
    if (answers[key] !== 'some') return false;
    if (key === 'job_offer' || key === 'admission') {
      const inventory = answers[`${key}_countries`];
      return inventory !== null && inventory.includes(id.split('.')[0]);
    }
    return true;
  });
  const focusedHistory = answers.focus_route ? countryRequired.filter(isPriorHistoryFact) : [];
  const order = [...new Set([...base.slice(0, 1), ...focusedHistory, ...sharedOrder, ...base.slice(1, 2), ...countryRequired, ...base.slice(2)])];
  const descriptors: InterviewQuestion[] = order.map(id => {
    const question = questions.find(q => q.id === id);
    return question ? { ...question, kind: 'base' as const } : {
      id, title: factTitle(id), kind: 'fact' as const,
      help: 'این پاسخ کمک می‌کند قدم بعدی همین مسیر را مشخص کنیم.',
      options: [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }, { value: 'unknown', label: 'هنوز نمی‌دانم' }],
    };
  });
  const answered = (q: InterviewQuestion) => q.kind === 'fact' ? !reviewIds.includes(q.id) && Object.hasOwn(answers.facts, q.id) : !conflicts.includes(q.id as SharedPrerequisite) && hasAnswer(q.id);
  const next = descriptors.find(q => !answered(q)) ?? null;
  const profile = questions.flatMap(q => {
    const value = answers[q.id as keyof Answers];
    const label = q.id === 'destinations' || q.id.endsWith('_countries') ? ((value as string[] | null) ?? []).map(c => countries[c]?.name ?? c).join('، ') :
      q.id === 'budget' ? answers.budget ? `${answers.budget.amount.toLocaleString('fa-IR')} ${answers.budget.currency}` : null :
      q.options.find(o => o.value === value && o.value !== 'unknown')?.label;
    return label ? [{ id: q.id, title: q.title, value: label }] : [];
  });
  const grouped = new Set<string>();
  const actions = required.flatMap(id => {
    if (answers.facts[id] === 'yes') return [];
    const associated = routeIds.filter(routeId => routePolicies[routeId]?.requires.includes(id));
    if (!associated.length) return [];
    const common = sharedConceptForFact(id);
    if (common && answers[common] === 'none') {
      if (grouped.has(common)) return [];
      grouped.add(common);
      return [{ id: common, title: sharedPrerequisites[common].title, detail: `این پیش‌نیاز را هنوز نداری؛ برای مسیرهای وابسته ابتدا آن را آماده کن. مسیرهای مستقل از این پیش‌نیاز همچنان در کارنامه بررسی می‌شوند.`, route_ids: routeIds.filter(routeId => routePolicies[routeId]?.requires.some(key => sharedConceptForFact(key) === common)) }];
    }
    return [{ id, title: factTitle(id), detail: answers.facts[id] === 'no' && preparationSteps[id] ? preparationSteps[id]! :
      `این موضوع را روشن کن: ${factTitle(id)}`, route_ids: associated }];
  });
  const main = actions[0]?.detail ?? (routeIds.length ? 'شرط‌های باقی‌ماندهٔ مسیر و مدارک لازم را از منابع همین نتیجه بررسی کن.' :
    status === 'review_required' || status === 'no_coverage' ? 'شواهد مسیرها به دریافت و بازبینی تازه نیاز دارند.' : 'هدف و مقصدها را مرور کن؛ برای این انتخاب هنوز مسیر دارای پوشش نداریم.');
  return {
    interview: { version: 'guided-interview-2', next_question: next, questions: descriptors.map(q => conflicts.includes(q.id as SharedPrerequisite) ? { ...q, help: 'این پاسخ با پاسخ مثبت قبلی برای یک کشور تعارض دارد؛ وضعیت فعلی را اصلاح کن. پاسخ متعارض، تأیید هیچ شرطی نیست.' } : q),
      question_order: order, answered_ids: descriptors.filter(answered).map(q => q.id), complete: next === null },
    guidance: { version: 'compass-guidance-1', profile, main_action: main, actions: actions.slice(0, 3),
      open_questions: required.filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown').map(id => ({ id, title: factTitle(id) })),
      report_kind: routeIds.some(id => ['uk:student', 'ca:study-permit-ca'].includes(id)) ? 'route_modules' : 'discovery',
      summary: routeIds.length ? `بر پایهٔ هدف «${goalLabels[answers.goal as keyof typeof goalLabels]}»${answers.destinations.length ? ` و مقصدهای ${answers.destinations.map(c => countries[c]?.name ?? c).join('، ')}` : ''}، این مسیرها برای بررسی بیشتر مرتبط‌اند.` : 'برای این انتخاب، نتیجهٔ مستند کافی در دسترس نیست.',
    },
  };
}
