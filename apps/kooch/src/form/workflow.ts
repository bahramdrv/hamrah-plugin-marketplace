import type { SavedCase } from '../account/contract';
import { formQuestions, type FormState, type Question, type AnswerRecord, type FormInput } from './contract';
import { canadaFactsSchema, canadaQuestionId } from '../report/canada-policy';
import { reportFactsSchema } from '../report/contract';
import { routeQuestionId } from '../report/questions';

export function formRecords(saved: SavedCase): Record<string, AnswerRecord> {
  const records: Record<string, AnswerRecord> = {};
  for (const id of ['goal', 'education', 'language', 'budget', 'timeline'] as const) {
    const value = saved.answers[id];
    if (value !== null && value !== 'unknown') records[id] = { answer: { state: 'known', value }, question_version: 1, source: 'compass', answered_at: saved.last_activity_at };
  }
  if (saved.answers.work === 'none') records.work_years = { answer: { state: 'known', value: 0 }, question_version: 1, source: 'compass', answered_at: saved.last_activity_at };
  return { ...records, ...saved.form?.answers };
}
export function relevantQuestions(records: Record<string, AnswerRecord>, destinations: string[] = []): Question[] {
  const value = (id: string) => { const r = records[id]; return r && !r.needs_review && r.answer.state === 'known' ? r.answer.value : undefined; };
  return formQuestions.filter(q => {
    if (q.route_id && (value('goal') !== 'study' || (destinations.length > 0 && !destinations.includes(q.route_id.split(':')[0])))) return false;
    if (['passport', 'dependants'].includes(q.id)) return value('goal') === 'study';
    if (q.id === 'ca_study_caq') return value('ca_study_province') === 'quebec';
    if (['ca_study_pal', 'ca_study_pal_expires_on'].includes(q.id)) {
      if (value('ca_study_province') === 'quebec') return false;
      if (['master', 'phd'].includes(String(value('study_level'))) && value('ca_study_institution') === 'public') return false;
      if (q.id.endsWith('expires_on')) return value('ca_study_pal') === 'valid_2026';
    }
    if (q.id === 'ca_study_later_years') return typeof value('ca_study_duration_months') !== 'number' || Number(value('ca_study_duration_months')) > 12;
    if (q.id === 'uk_student_cas_issued_on') return value('uk_student_cas') === 'valid_unused';
    if (q.id === 'uk_student_atas_issued_on') return value('uk_student_atas') === 'valid_certificate';
    if (q.id === 'uk_student_tb_issued_on') return value('uk_student_tb') === 'valid_certificate';
    if (q.id === 'study_level') return value('goal') === 'study';
    if (q.id === 'study_offer') return ['bachelor', 'master', 'phd'].includes(String(value('study_level')));
    if (q.id === 'work_years') return ['work', 'business'].includes(String(value('goal')));
    if (q.id === 'language_exam') return value('language') === 'certified';
    if (q.id === 'language_score') return ['ielts', 'toefl'].includes(String(value('language_exam')));
    return true;
  }).map(q => q.id === 'language_score' ? { ...q, max: value('language_exam') === 'ielts' ? 9 : 120, unit: value('language_exam') === 'ielts' ? 'IELTS' : 'TOEFL iBT' } : q);
}
export function formView(saved: SavedCase) {
  const records = formRecords(saved);
  const questions = relevantQuestions(records, saved.answers.destinations);
  const review = questions.filter(q => records[q.id]?.needs_review);
  const unanswered = questions.filter(q => !records[q.id]);
  const order = { important: 0, impact: 1, optional: 2 };
  const next = review[0] ?? unanswered.sort((a, b) => order[a.priority] - order[b.priority])[0] ?? null;
  return {
    schema_version: 1, policy_version: 'fixed-intake-1', case_id: saved.id, revision: saved.revision,
    next_question: next, questions, draft: saved.form?.draft ?? null,
    answers: questions.filter(q => records[q.id]).map(question => ({ question, ...records[question.id] })),
    missing: questions.filter(q => !records[q.id] || records[q.id].needs_review || records[q.id].answer.state !== 'known'),
    review_required: review.map(q => q.id), assessment_status: 'not_evaluated',
    last_activity_at: saved.last_activity_at, delete_after: saved.delete_after,
    destinations: saved.answers.destinations,
  };
}
export type FormView = ReturnType<typeof formView>;

export function validateAnswer(question: Question, input: import('./contract').FormAnswer) {
  if (input.state === 'unknown') return question.allow_unknown;
  if (input.state === 'declined') return question.allow_declined;
  const value = input.value;
  const key = (Object.keys(reportFactsSchema.shape) as (keyof typeof reportFactsSchema.shape)[]).find(key => routeQuestionId(key) === question.id);
  if (key) return reportFactsSchema.shape[key].safeParse(value).success;
  const canadaKey = (Object.keys(canadaFactsSchema.shape) as (keyof typeof canadaFactsSchema.shape)[]).find(key => canadaQuestionId(key) === question.id);
  if (canadaKey) return canadaFactsSchema.shape[canadaKey].safeParse(value).success;
  if (question.input === 'choice') return typeof value === 'string' && question.options.some(o => o.value === value);
  if (question.input === 'number') return typeof value === 'number' && value >= (question.min ?? 0) && value <= (question.max ?? Infinity) && (!question.integer || Number.isInteger(value));
  return typeof value === 'object'; // Money shape, amount and currency are validated by the input schema.
}

const ageRange = (age: number) => age < 30 ? 'under-30' : age < 40 ? '30-39' : '40-plus';
export function applyFormAnswer(saved: SavedCase, input: FormInput, now: Date) {
  const form: FormState = structuredClone(saved.form ?? { schema_version: 1, answers: {} });
  const records = formRecords(saved);
  form.answers = structuredClone(records);
  delete form.draft;
  const previous = records[input.question_id];
  const changed = JSON.stringify(previous?.answer) !== JSON.stringify(input.answer);
  if (changed) {
    const affected = new Set([input.question_id]);
    for (const question of formQuestions) {
      if (question.depends_on.some(id => affected.has(id))) {
        affected.add(question.id);
        if (form.answers[question.id]) form.answers[question.id] = { ...form.answers[question.id], needs_review: true, review_reason: 'dependency_changed' };
      }
    }
  }
  const entry: AnswerRecord = { answer: input.answer, question_version: input.question_version, source: 'self_reported', answered_at: now.toISOString() };
  const answers = structuredClone(saved.answers);
  if (input.question_id === 'age_exact' && input.answer.state === 'known' && typeof input.answer.value === 'number') {
    const range = ageRange(input.answer.value);
    if (answers.age !== 'unknown' && answers.age !== range && !(input.confirm_conflict && previous?.review_reason === 'compass_conflict' && !changed)) {
      entry.needs_review = true; entry.review_reason = 'compass_conflict';
    } else answers.age = range;
  }
  if (input.question_id === 'work_years' && input.answer.state === 'known' && typeof input.answer.value === 'number') {
    const years = input.answer.value;
    const work = answers.work;
    const agrees = work === 'unknown' || (work === 'none' && years === 0) || (work === 'under-3' && years > 0 && years < 3) || (work === '3-plus' && years >= 3) || (work === 'not-working' && years > 0);
    if (!agrees && !(input.confirm_conflict && previous?.review_reason === 'compass_conflict' && !changed)) {
      entry.needs_review = true; entry.review_reason = 'compass_conflict';
    } else answers.work = work === 'not-working' && years > 0 ? 'not-working' : years === 0 ? 'none' : years < 3 ? 'under-3' : '3-plus';
  }
  if (['goal', 'education', 'language', 'timeline', 'budget'].includes(input.question_id)) {
    const shared = input.question_id as 'goal' | 'education' | 'language' | 'timeline' | 'budget';
    Object.assign(answers, { [shared]: input.answer.state === 'known' ? input.answer.value : shared === 'budget' ? null : 'unknown' });
  }
  form.answers[input.question_id] = entry;
  return { form, answers };
}

// Editing the original compass must not leave deeper answers silently authoritative.
export function reconcileCompass(saved: SavedCase, next: SavedCase['answers']): FormState {
  const form: FormState = structuredClone(saved.form ?? { schema_version: 1, answers: {} });
  delete form.draft;
  if (JSON.stringify(saved.answers) === JSON.stringify(next)) return form;
  for (const id of Object.keys(form.answers)) {
    if (['goal', 'education', 'language', 'timeline', 'budget'].includes(id)) delete form.answers[id];
    else form.answers[id] = { ...form.answers[id], needs_review: true, review_reason: 'dependency_changed' };
  }
  return form;
}
