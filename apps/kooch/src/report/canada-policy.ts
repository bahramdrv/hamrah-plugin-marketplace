import { createHash } from 'node:crypto';
import { z } from 'zod';
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable().optional();
const money = z.number().finite().min(0).max(1e9).multipleOf(0.01).nullable().optional();
export const canadaFactsSchema = z.object({
  scope: choice(['iran_initial_degree', 'extension', 'pgwp', 'other']),
  application_on: z.iso.date().nullable().optional(),
  province: choice(['outside_quebec', 'quebec']),
  loa: choice(['unconditional_dli', 'conditional', 'absent']),
  institution: choice(['public', 'private']),
  pal: choice(['valid_2026', 'missing', 'other_exemption']),
  pal_expires_on: z.iso.date().nullable().optional(),
  caq: choice(['valid', 'missing', 'exempt']),
  duration_months: z.number().int().min(1).max(120).nullable().optional(),
  tuition_cad: money, tuition_paid_cad: money, return_transport_cad: money,
  finance_method: choice(['available_funds', 'loan_scholarship_support']),
  funds_access: choice(['documented', 'not_ready']),
  later_years: choice(['documented_plan', 'not_ready']),
  biometrics: choice(['required', 'valid_or_exempt']),
}).strict();
export const canadaQuestionId = (key: string) => `ca_study_${key}`;
const source = (id: string, path: string, title: string, effective_from: string | null = null) => ({
  id, url: path.startsWith('https://') ? path : `https://www.canada.ca/en/immigration-refugees-citizenship/${path}`,
  title, checked_at: '2026-10-21T00:00:00Z', expires_at: '2026-10-28T00:00:00Z', effective_from,
  effective_date_note: effective_from ? 'تاریخ اجرای همین قاعده در منبع آمده است.' : 'شرط جاری در تاریخ بررسی؛ آغاز حقوقی این نسخه احراز نشده است.',
});
export const canadaPolicy = {
  version: 'ca-study-permit-guidance-1', route_id: 'ca:study-permit-ca',
  scope: 'درخواست اولیهٔ مجوز تحصیل متقاضی اصلی ایرانی از ایران، ۱۹ سال یا بیشتر، دورهٔ دانشگاهی؛ کبک، دورهٔ کوتاه‌تر از یک سال و وضعیت‌های خاص بررسی مستقل می‌خواهند. PGWP و تمدید در این برش نیستند.',
  sources: [
    source('eligibility', 'services/study-canada/study-permit/eligibility.html', 'شروط مجوز تحصیل'),
    source('minors', 'services/study-canada/study-permit/prepare/minor-children.html', 'سن قانونی و مراقبت از صغیر'),
    source('documents', 'services/study-canada/study-permit/get-documents.html', 'مدارک و پذیرش DLI'),
    source('pal', 'services/study-canada/study-permit/get-documents/provincial-attestation-letter.html', 'PAL/TAL و استثناهای آن', '2026-01-01'),
    source('money', 'services/study-canada/study-permit/get-documents/financial-support.html', 'تمکن و جدول زندگی از سپتامبر ۲۰۲۶', '2026-09-01'),
    source('fees', 'https://www.ircc.canada.ca/english/information/fees/fees.asp', 'هزینه‌های دولتی کانادا'),
    source('apply', 'services/study-canada/study-permit/apply.html', 'درخواست مجوز تحصیل از خارج کانادا'),
    source('biometrics', 'services/biometrics/where-to-give.html', 'محل و مهلت انگشت‌نگاری'),
    source('centres', 'corporate/contact-ircc/offices/find-visa-application-centre.html', 'فهرست مراکز درخواست ویزا'),
    source('family', 'services/study-canada/work/help-your-spouse-common-law-partner-work-canada.html', 'شروط مستقل اجازهٔ کار همسر', '2025-01-21'),
  ],
  values: { adult_scope_age: 19, visa_fee: 150, biometrics_fee: 85,
    living_annual: [23448, 29192, 35888, 43572, 49419, 55736, 62054], extra_family_member: 6318 },
  exceptions: 'کبک/CAQ و تمکن استانی، صغیر و قیم، معافیت‌های خاص PAL، پذیرش مشروط، دورهٔ زیر یک سال، وام/بورسیه و وضعیت‌های داخل کانادا جدا بررسی می‌شوند؛ این برچسب‌ها رد مسیر نیستند.',
};
export const canadaPolicyDigest = createHash('sha256').update(JSON.stringify(canadaPolicy)).digest('hex');
