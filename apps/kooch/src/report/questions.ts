import type { ReportFacts } from './contract';
import type { Question } from '../form/contract';
type Field = { id: keyof ReportFacts; title: string; help: string; kind: 'choice' | 'number' | 'date'; options?: { value: string; label: string }[] };
const options = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
export const reportGroups: { title: string; fields: Field[] }[] = [
  { title: 'نوع درخواست و پذیرش', fields: [
    { id: 'application_scope', title: 'برای چه نوع درخواستی آماده می‌شوی؟', help: 'برای تابعیت دوگانه، سابقهٔ تحصیل/حمایت دولتی در بریتانیا یا وضعیت متفاوت، گزینهٔ دیگر را انتخاب کن.', kind: 'choice', options: options([['iran_entry_full_time_degree', 'متقاضی اصلی ایرانی از ایران؛ ورود اولیه برای دورهٔ تمام‌وقت دانشگاهی'], ['other', 'وضعیت دیگر؛ نیازمند بررسی مستقل']]) },
    { id: 'passport', title: 'گذرنامه یا مدرک سفر معتبر داری؟', help: 'شماره یا تصویر مدرک را وارد نکن.', kind: 'choice', options: options([['yes', 'بله'], ['no', 'خیر']]) },
    { id: 'cas', title: 'وضعیت CAS تو چیست؟', help: 'با نامهٔ پذیرش فرق دارد؛ باید از اسپانسر دارای مجوز، برای همین دوره، برداشت‌نشده و استفاده‌نشده در درخواست پذیرفته/ردشده باشد.', kind: 'choice', options: options([['valid_unused', 'CAS با شرایط گفته‌شده دارم'], ['absent', 'هنوز CAS ندارم']]) },
    { id: 'cas_issued_on', title: 'تاریخ صدور CAS', help: 'تاریخ میلادی؛ اگر معلوم نیست خالی بگذار.', kind: 'date' },
    { id: 'course_starts_on', title: 'تاریخ شروع دوره در CAS', help: 'تاریخ میلادی.', kind: 'date' },
    { id: 'application_on', title: 'تاریخ هدف برای ارسال درخواست', help: 'تاریخ میلادی؛ برای تاریخ خارج از اعتبار منابع، بررسی تازه لازم می‌شود.', kind: 'date' },
  ] },
  { title: 'زبان و گواهی‌های لازم', fields: [
    { id: 'english', title: 'اثبات زبان برای همین دوره', help: 'نمرهٔ کل فرم به‌تنهایی چهار مهارت و روش اثبات را تأیید نمی‌کند.', kind: 'choice', options: options([['cas_b2_all_skills', 'اسپانسر، B2 هر چهار مهارت و روش ارزیابی را در CAS تأیید کرده'], ['not_met', 'هنوز شرط زبان را ندارم'], ['other', 'روش دیگر یا معافیت؛ نیازمند بررسی']]) },
    { id: 'atas', title: 'نیاز ATAS را با دانشگاه بررسی کرده‌ای؟', help: 'بر اساس کد رشته و تابعیت؛ در صورت نیاز، گواهی باید معتبر و مربوط به همین دوره باشد.', kind: 'choice', options: options([['not_required_confirmed', 'بررسی کرده‌ام؛ لازم نیست'], ['valid_certificate', 'لازم است و گواهی معتبر همین دوره را دارم'], ['required_missing', 'لازم است ولی ندارم']]) },
    { id: 'atas_issued_on', title: 'تاریخ صدور گواهی ATAS، اگر لازم است', help: 'میلادی؛ در حالت «لازم نیست» خالی بگذار.', kind: 'date' },
    { id: 'tb', title: 'نیاز آزمایش سل را بررسی کرده‌ای؟', help: 'مدت اقامت و سابقهٔ زندگی در کشورهای فهرست رسمی تعیین‌کننده‌اند؛ ملیت ایران کافی نیست. هیچ نتیجهٔ پزشکی را وارد نکن.', kind: 'choice', options: options([['not_required_after_check', 'سوابق و فهرست رسمی را بررسی کرده‌ام؛ لازم نیست'], ['valid_certificate', 'لازم است و گواهی مرکز مورد تأیید را دارم'], ['required_missing', 'لازم است ولی ندارم']]) },
    { id: 'tb_issued_on', title: 'تاریخ عکسِ گواهی سل، اگر لازم است', help: 'میلادی؛ در حالت «لازم نیست» خالی بگذار.', kind: 'date' },
  ] },
  { title: 'هزینهٔ دوره و تمکن', fields: [
    { id: 'finance_method', title: 'روش اثبات تمکن', help: 'وجهِ فرم باید همان وجه قابل استفاده برای اثبات باشد؛ وام و حمایت مالی قواعد مستقل دارند.', kind: 'choice', options: options([['cash', 'وجه نقد'], ['loan_or_sponsorship', 'وام یا حمایت مالی رسمی'], ['exempt', 'فکر می‌کنم مشمول معافیت هستم']]) },
    { id: 'location', title: 'محل اصلی دوره', help: 'لندن یعنی City of London و ۳۲ borough لندن؛ از اسپانسر بپرس.', kind: 'choice', options: options([['london', 'لندن'], ['outside_london', 'بیرون لندن']]) },
    { id: 'course_months', title: 'مدت دوره به ماه', help: 'جزء ماه را یک ماه کامل حساب کن؛ برای تمکن حداکثر نه ماه مصرف می‌شود.', kind: 'number' },
    { id: 'tuition_gbp', title: 'شهریهٔ سال اول یا دورهٔ کوتاه‌تر، به پوند', help: 'طبق CAS؛ کل شهریهٔ دورهٔ چندساله را ننویس.', kind: 'number' },
    { id: 'tuition_paid_gbp', title: 'شهریهٔ پرداخت‌شده به اسپانسر، به پوند', help: 'فقط مبلغ ثبت‌شده در CAS یا رسید اسپانسر؛ اگر هیچ پرداختی نداشته‌ای صفر بنویس، نه وقتی نمی‌دانی.', kind: 'number' },
    { id: 'sponsor_accommodation_paid_gbp', title: 'پرداخت اقامتِ ترتیب‌داده‌شده توسط اسپانسر، به پوند', help: 'فقط پرداخت به خود اسپانسر؛ نه صاحب‌خانهٔ خصوصی. اگر هیچ پرداختی نداری صفر، اگر نامعلوم است خالی.', kind: 'number' },
  ] },
  { title: 'نگهداری وجه و همراهان', fields: [
    { id: 'funds_held_days', title: 'کل وجه لازم را چند روز متوالی نگه داشته‌ای؟', help: 'موجودی بودجه از پاسخ فرم خوانده می‌شود؛ پذیرش حساب و دسترسی به وجه باید جدا تأیید شوند.', kind: 'number' },
    { id: 'funds_period_ends_on', title: 'تاریخ پایان دورهٔ نگهداری وجه', help: 'میلادی؛ با تاریخ هدف درخواست سنجیده می‌شود.', kind: 'date' },
    { id: 'dependants', title: 'چند همراه می‌خواهی با خود ببری؟', help: 'صفر یعنی همراه نداری؛ خالی یعنی نمی‌دانی. حق همراه و مدارک رابطه جدا بررسی می‌شوند.', kind: 'number' },
  ] },
];
// Common facts keep a shared identity; only genuinely route-specific facts are namespaced.
export const routeQuestionId = (key: keyof ReportFacts) => ['passport', 'dependants'].includes(key) ? key : `uk_student_${key}`;
const dependencies: Partial<Record<keyof ReportFacts, string[]>> = {
  cas: ['study_offer'], cas_issued_on: ['uk_student_cas'], course_starts_on: ['uk_student_cas'],
  application_on: ['uk_student_course_starts_on'], english: ['language', 'uk_student_cas'],
  atas: ['uk_student_cas'], atas_issued_on: ['uk_student_atas'], tb_issued_on: ['uk_student_tb'],
  location: ['uk_student_cas'], course_months: ['uk_student_cas'], tuition_gbp: ['uk_student_cas'],
  tuition_paid_gbp: ['uk_student_tuition_gbp'], sponsor_accommodation_paid_gbp: ['uk_student_cas'],
  funds_held_days: ['budget', 'uk_student_finance_method', 'uk_student_location', 'uk_student_course_months', 'uk_student_tuition_gbp', 'uk_student_tuition_paid_gbp', 'uk_student_sponsor_accommodation_paid_gbp'],
  funds_period_ends_on: ['uk_student_funds_held_days', 'uk_student_application_on'],
};
export const routeQuestions: Question[] = reportGroups.flatMap(group => group.fields).map(field => ({
  id: routeQuestionId(field.id), version: 1, title: field.title, help: field.help,
  input: field.kind, options: field.options ?? [], allow_unknown: true, allow_declined: false,
  priority: 'impact', depends_on: ['goal', 'study_level', ...(dependencies[field.id] ?? [])],
  ...(!['passport', 'dependants'].includes(field.id) ? { route_id: 'uk:student' } : {}),
  ...(field.kind === 'number' ? { min: 0, max: field.id === 'course_months' ? 120 : field.id === 'dependants' ? 20 : field.id === 'funds_held_days' ? 36500 : 1e9,
    integer: !field.id.endsWith('_gbp'), unit: field.id.endsWith('_gbp') ? 'GBP' : field.id === 'course_months' ? 'months' : field.id === 'funds_held_days' ? 'days' : 'people' } : {}),
}));
