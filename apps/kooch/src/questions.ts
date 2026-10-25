import { z } from 'zod';
import { isFactId, goalLabels } from './policy';

const unknown = ['unknown', 'نمی‌دانم'] as const;
const options = (items: readonly (readonly [string, string])[]) => [...items, unknown].map(([value, label]) => ({ value, label }));
export const questions = [
  { id: 'goal', title: 'هدف اصلی تو از مهاجرت چیست؟', help: 'مسیرها را بر اساس هدف تو جدا می‌کنیم.', options: Object.entries(goalLabels).map(([value, label]) => ({ value, label })) },
  { id: 'age', title: 'در کدام بازهٔ سنی هستی؟', help: 'سن دقیق برای بررسی شرط‌های مسیر بعداً لازم می‌شود.', options: options([['under-30', 'کمتر از ۳۰ سال'], ['30-39', '۳۰ تا ۳۹ سال'], ['40-plus', '۴۰ سال و بیشتر']]) },
  { id: 'education', title: 'آخرین مقطع تحصیلی‌ات چیست؟', help: 'برای مشخص‌کردن مدارکی که در قدم بعد باید بررسی شوند.', options: options([['diploma', 'دیپلم یا کمتر'], ['bachelor', 'کارشناسی'], ['master', 'کارشناسی ارشد'], ['phd', 'دکتری']]) },
  { id: 'work', title: 'وضعیت و سابقهٔ کارت چگونه است؟', help: 'سابقهٔ خوداظهاری با سابقهٔ واجد شرایط هر برنامه یکی نیست.', options: options([['none', 'هنوز سابقه ندارم'], ['under-3', 'کمتر از سه سال'], ['3-plus', 'سه سال و بیشتر'], ['not-working', 'پیش‌تر کار کرده‌ام؛ اکنون شاغل نیستم']]) },
  { id: 'language', title: 'وضعیت زبانت در چه مرحله‌ای است؟', help: 'برای قدم بعدی آمادگی زبان؛ مدرک و نمره اینجا تأیید نمی‌شود.', options: options([['none', 'هنوز شروع نکرده‌ام'], ['learning', 'در حال یادگیری'], ['certified', 'مدرک زبان دارم']]) },
  { id: 'budget', title: 'بودجهٔ اولیه‌ات چقدر است؟', help: 'مقدار و ارز را با هم بنویس. تبدیل ارز یا تأیید تمکن انجام نمی‌دهیم.', options: [] },
  { id: 'destinations', title: 'کدام مقصدها را ترجیح می‌دهی؟', help: 'چند مقصد را انتخاب کن یا بدون ترجیح ادامه بده. کشورها و قلمروهای کاتالوگ را جست‌وجو کن؛ پوشش شرایط اقدام در هر مسیر جدا مشخص می‌شود.', options: [] },
  { id: 'timeline', title: 'برای شروع چه زمانی در نظر داری؟', help: 'برای ترتیب آماده‌سازی؛ این پاسخ زمان صدور ویزا را پیش‌بینی نمی‌کند.', options: options([['under-6', 'کمتر از شش ماه'], ['6-12', 'شش تا دوازده ماه'], ['over-12', 'بیشتر از یک سال']]) },
];
const choice = (id: string) => z.enum(questions.find(q => q.id === id)!.options.map(o => o.value) as [string, ...string[]]).default('unknown');
export const answersSchema = z.object({
  goal: choice('goal'), age: choice('age'), education: choice('education'), work: choice('work'), language: choice('language'), timeline: choice('timeline'),
  budget: z.object({ amount: z.number().finite().min(0).max(1e15), currency: z.enum(['EUR', 'USD', 'CAD', 'AUD', 'GBP', 'IRR', 'IRT']) }).strict().nullable().default(null),
  focus_route: z.string().regex(/^[a-z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$/).max(150).nullable().default(null),
  destinations: z.array(z.string().regex(/^[a-z]{2}$/)).max(10).refine(a => new Set(a).size === a.length).default([]),
  fact_versions: z.record(z.string(), z.string().min(1).max(100)).refine(value => Object.keys(value).every(k => isFactId(k))).default({}),
  facts: z.record(z.string(), z.enum(['yes', 'no', 'unknown'])).refine(value => Object.keys(value).every(k => isFactId(k))).default({}),
  answered: z.array(z.enum(['goal', 'age', 'education', 'work', 'language', 'budget', 'destinations', 'timeline'])).max(8).refine(a => new Set(a).size === a.length).default([]),
}).strict();
export type Answers = z.infer<typeof answersSchema>;
export const emptyAnswers = answersSchema.parse({});

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
