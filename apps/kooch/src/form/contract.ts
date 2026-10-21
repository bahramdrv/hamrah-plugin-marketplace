import { z } from 'zod';
import { questions as compassQuestions } from '../questions';
import { canadaQuestions } from '../report/canada-questions';
import { routeQuestions } from '../report/questions';

export type Question = {
  id: string; version: number; title: string; help: string;
  input: 'choice' | 'number' | 'money' | 'date'; options: { value: string; label: string }[];
  route_id?: string;
  unit?: string; min?: number; max?: number; integer?: boolean;
  allow_unknown: boolean; allow_declined: boolean;
  priority: 'important' | 'impact' | 'optional'; depends_on: string[];
};
const choice = (id: string): Question => {
  const q = compassQuestions.find(q => q.id === id)!;
  return { id, version: 1, title: q.title, help: q.help, input: 'choice', options: q.options.filter(o => o.value !== 'unknown'), allow_unknown: true, allow_declined: false, priority: 'impact', depends_on: [] };
};
const extra = (q: Partial<Question> & Pick<Question, 'id' | 'title' | 'help' | 'input'>): Question => ({
  version: 1, options: [], allow_unknown: true, allow_declined: false, priority: 'important', depends_on: [], ...q,
});
export const formQuestions: Question[] = [
  { ...choice('goal'), priority: 'important' },
  extra({ id: 'age_exact', title: 'سن دقیق تو چند سال است؟', help: 'بازهٔ قطب‌نما برای شرط‌های سنی کافی نیست؛ سن را به سال کامل وارد کن. این پاسخ خوداظهاری است.', input: 'number', unit: 'years', min: 0, max: 120, integer: true }),
  choice('education'),
  extra({ id: 'study_level', title: 'برای کدام مقطع می‌خواهی اقدام کنی؟', help: 'برای مرتبط‌ماندن سؤال‌های آماده‌سازی تحصیل؛ شرایط هر مسیر جداگانه بررسی می‌شوند.', input: 'choice', depends_on: ['goal'], options: [
    { value: 'bachelor', label: 'کارشناسی' }, { value: 'master', label: 'کارشناسی ارشد' }, { value: 'phd', label: 'دکتری' },
  ] }),
  extra({ id: 'study_offer', title: 'برای همین مقطع پذیرش تحصیلی داری؟', help: 'فقط وضعیت آماده‌سازی را ثبت می‌کنیم؛ اعتبار پذیرش و شروط ویزا هنوز بررسی نمی‌شوند.', input: 'choice', depends_on: ['study_level'], options: [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'هنوز پذیرش ندارم' }] }),
  extra({ id: 'work_years', title: 'چند سال سابقهٔ کار داری؟', help: 'سال کامل را ثبت کن؛ این مقدار به معنی سابقهٔ واجد شرایط یک مسیر نیست.', input: 'number', unit: 'years', min: 0, max: 80, integer: true, depends_on: ['goal'] }),
  choice('language'),
  extra({ id: 'language_exam', title: 'کدام آزمون زبان را داده‌ای؟', help: 'برای ثبت نتیجهٔ خوداظهاری؛ آزمون مورد قبول هر مسیر هنوز بررسی نشده است.', input: 'choice', priority: 'impact', depends_on: ['language'], options: [{ value: 'ielts', label: 'IELTS' }, { value: 'toefl', label: 'TOEFL iBT' }, { value: 'other', label: 'آزمون دیگر' }] }),
  extra({ id: 'language_score', title: 'نمرهٔ کل مدرکت چقدر است؟', help: 'فقط نمرهٔ کل را ثبت کن؛ مهارت‌ها، تاریخ اعتبار و پذیرش مدرک جداگانه لازم‌اند.', input: 'number', unit: 'score', priority: 'impact', depends_on: ['language_exam'], min: 0, max: 120 }),
  extra({ id: 'budget', title: 'بودجهٔ در دسترس تو چقدر است؟', help: 'مقدار دقیق و ارز خودت را بنویس؛ تبدیل ارز و تأیید تمکن انجام نمی‌شود.', input: 'money', unit: 'currency', allow_declined: true }),
  choice('timeline'),
  ...routeQuestions, ...canadaQuestions,
];
export const answerSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('known'), value: z.union([z.string().max(50), z.number().finite(), z.object({ amount: z.number().finite().min(0).max(1e15), currency: z.enum(['EUR', 'USD', 'CAD', 'AUD', 'GBP', 'IRR', 'IRT']) }).strict()]) }).strict(),
  z.object({ state: z.literal('unknown') }).strict(),
  z.object({ state: z.literal('declined') }).strict(),
]);
export type FormAnswer = z.infer<typeof answerSchema>;
export type AnswerRecord = { answer: FormAnswer; question_version: number; source: 'self_reported' | 'compass'; answered_at: string; needs_review?: boolean; review_reason?: 'compass_conflict' | 'dependency_changed' };
export type FormState = { schema_version: 1; answers: Record<string, AnswerRecord>; draft?: import('./interpretation').InterpretationDraft };
export const formInputSchema = z.object({
  expected_revision: z.number().int().positive(), request_id: z.uuid(),
  confirm_conflict: z.boolean().default(false), question_id: z.string().max(50), question_version: z.number().int().positive(), answer: answerSchema,
}).strict();
export type FormInput = z.infer<typeof formInputSchema>;
