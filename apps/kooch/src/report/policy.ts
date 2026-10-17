import { createHash } from 'node:crypto';
const source = (id: string, path: string, title: string, effectiveFrom: string | null = null) => ({ id, url: `https://www.gov.uk/${path}`, title,
  checked_at: '2026-10-17T00:00:00Z', expires_at: '2026-10-24T00:00:00Z', effective_from: effectiveFrom,
  effective_date_note: 'شرط جاری در تاریخ بررسی؛ آغاز حقوقی این نسخه جداگانه احراز نشده است.' });
export const reportPolicy = {
  version: 'uk-student-guidance-1', route_id: 'uk:student',
  scope: 'متقاضی اصلی ایرانی از ایران؛ entry clearance برای دورهٔ تمام‌وقت دانشگاهی؛ گزارش مقدماتی بدون تأیید مدارک.',
  sources: [
    source('overview', 'student-visa', 'Student visa'),
    source('rules', 'guidance/immigration-rules/immigration-rules-appendix-student', 'Immigration Rules: Appendix Student'),
    source('course', 'student-visa/course', 'Your course'),
    source('money', 'student-visa/money', 'Money you need'),
    source('english', 'student-visa/knowledge-of-english', 'Knowledge of English'),
    source('documents', 'student-visa/documents-you-must-provide', 'Documents you must provide'),
    source('atas', 'guidance/academic-technology-approval-scheme', 'Academic Technology Approval Scheme'),
    source('tb', 'tb-test-visa', 'Tuberculosis tests'),
    source('family', 'student-visa/family-members', 'Your partner and children'),
    source('healthcare', 'healthcare-immigration-application/how-much-pay', 'Healthcare surcharge'),
    source('apply', 'student-visa/apply-online', 'Apply online'),
    source('centres', 'find-a-visa-application-centre', 'Find a visa application centre'),
    source('fees', 'government/publications/visa-regulations-revised-table/home-office-immigration-and-nationality-fees-8-october-2026', 'Fees from 8 October 2026', '2026-10-08'),
  ],
  values: { min_age: 16, adult_scope_age: 18, cas_months: 6, advance_months: 6,
    living_london: 1529, living_outside: 1171, max_maintenance_months: 9, accommodation_cap: 1529,
    held_days: 28, statement_days: 31, visa_fee: 558, healthcare_annual: 776,
    dependant_london: 845, dependant_outside: 680, certificate_months: 6 },
  exceptions: {
    scope: 'زیر ۱۸ سال، تابعیت دیگر/دوگانه، درخواست داخل بریتانیا، دورهٔ غیرتمام‌وقت یا غیردانشگاهی، سابقهٔ تحصیل و حمایت دولتی بریتانیا به بررسی جدا نیاز دارند.',
    finance: 'وام و حمایت مالی رسمی، معافیت اثبات تمکن، حساب والدین/شریک، مؤسسهٔ مالی و دسترسی قانونی به وجه در این محاسبه تأیید نمی‌شوند؛ کسر اقامت فقط پرداخت به اسپانسر برای اقامتِ ترتیب‌داده‌شدهٔ اوست.',
    english: 'مسیرهای معافیت، SELT و Ecctis جداگانه‌اند؛ صرف نمرهٔ کل IELTS/TOEFL اثبات چهار مهارت یا اعتبار روش نیست.',
    family: 'داشتن همراه فقط با نوع دوره/حمایت مجاز و شروط مستقل رابطه، سن و اقامت بررسی می‌شود؛ محاسبهٔ مالی مجوز همراه نیست.',
  },
};
export const policyDigest = createHash('sha256').update(JSON.stringify(reportPolicy)).digest('hex');
