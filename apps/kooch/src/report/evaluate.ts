import { evaluateCanada } from './canada-evaluate';
import type { SavedCase } from '../account/contract';
import { reportFactsSchema, type EvidenceReview } from './contract';
import { routeQuestionId } from './questions';
import { reportPolicy, policyDigest } from './policy';
import { formRecords, formView } from '../form/workflow';
import { buildDiscovery, type DiscoveryBriefing } from './discovery';
export type State = 'self_reported_met' | 'action_needed' | 'unknown' | 'needs_review' | 'not_applicable' | 'not_assessed';
export type Condition = { id: string; title: string; state: State; reason: string; document_verified: false; source_ids: string[];
  rule: { version: string; value: string | number | null; unit: string | null; exceptions: string } };
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
// Calendar months, clamped at month-end; never substitute 180 days for six months.
function addMonths(date: string, months: number) {
  const result = new Date(`${date}T00:00:00Z`); const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const end = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, end)); return result.toISOString().slice(0, 10);
}
const round = (n: number) => Math.round(n * 100) / 100;
function evaluateStudent(saved: SavedCase, now: Date, sourceReview: boolean, retrievalFailed: boolean) {
  const p = reportPolicy.values; const records = formRecords(saved);
  const value = (id: string) => { const r = records[id]; return r && !r.needs_review && r.answer.state === 'known' ? r.answer.value : undefined; };
  const active = new Set(formView(saved).questions.map(q => q.id));
  const f = reportFactsSchema.parse(Object.fromEntries((Object.keys(reportFactsSchema.shape) as (keyof typeof reportFactsSchema.shape)[])
    .map(key => [key, active.has(routeQuestionId(key)) ? value(routeQuestionId(key)) ?? null : null])));
  const conditions: Condition[] = [];
  function condition(id: string, title: string, state: State, reason: string, sources: string[], threshold: string | number | null = null, unit: string | null = null, exceptions = reportPolicy.exceptions.scope) {
    conditions.push({ id, title, state, reason, document_verified: false, source_ids: sources,
      rule: { version: reportPolicy.version, value: threshold, unit, exceptions } });
  }
  condition('scope', 'دامنهٔ درخواست', f.application_scope === 'iran_entry_full_time_degree' ? 'self_reported_met' : f.application_scope === 'other' ? 'needs_review' : 'unknown',
    f.application_scope === 'iran_entry_full_time_degree' ? 'اعلام کرده‌ای ایرانی هستی و از ایران برای ورود اولیه و دورهٔ تمام‌وقت دانشگاهی اقدام می‌کنی.' : 'نوع درخواست، تابعیت و محل اقدام را روشن کن؛ سایر حالت‌ها بررسی مستقل لازم دارند.', ['rules', 'apply']);
  const age = value('age_exact');
  condition('age', 'سن و رضایت والدین', typeof age !== 'number' ? 'unknown' : age < p.min_age ? 'action_needed' : age < p.adult_scope_age ? 'needs_review' : 'self_reported_met',
    'حداقل سن مسیر ۱۶ است؛ برای ۱۶ و ۱۷ سال، رضایت و ترتیبات مراقبت لازم است و این برش آن‌ها را ارزیابی نمی‌کند.', ['overview', 'documents'], p.min_age, 'years');
  const goal = value('goal'), level = value('study_level');
  condition('study', 'هدف و مقطع', goal === 'study' && ['bachelor', 'master', 'phd'].includes(String(level)) ? 'self_reported_met' : goal && goal !== 'study' ? 'needs_review' : 'unknown',
    'این گزارش برای هدف تحصیل و دورهٔ دانشگاهی است؛ مجازبودن خود دوره و محل تحصیل باید در CAS بررسی شود.', ['course']);
  condition('passport', 'مدرک سفر معتبر', f.passport === 'yes' ? 'self_reported_met' : f.passport === 'no' ? 'action_needed' : 'unknown', 'اعتبار و مشخصات گذرنامه یا مدرک سفر باید پیش از درخواست بررسی شوند؛ مدرکی دریافت نشده است.', ['documents']);
  const application = f.application_on;
  if (application && reportPolicy.sources.some(s => application < s.checked_at.slice(0, 10) || application >= s.expires_at.slice(0, 10)))
    condition('evidence_window', 'تاریخ هدف خارج از بازهٔ بررسی منابع', 'needs_review', 'این نسخه فقط برنامه‌ریزی جاری را پوشش می‌دهد. برای تاریخ گذشته یا پس از انقضای منابع، قواعد همان زمان باید جدا بررسی شوند.', ['rules']);
  const offer = value('study_offer');
  let casState: State = f.cas === 'absent' ? 'action_needed' : !f.cas ? 'unknown' : offer === 'no' ? 'needs_review' : !application || !f.cas_issued_on ? 'unknown' :
    f.cas_issued_on > application || f.cas_issued_on < addMonths(application, -p.cas_months) ? 'action_needed' : 'self_reported_met';
  condition('cas', 'پذیرش و CAS', casState, offer === 'no' && f.cas === 'valid_unused' ? 'CAS با پاسخ «پذیرش ندارم» تعارض دارد؛ فرم و این بخش را اصلاح کن.' :
    'CAS باید از اسپانسر دارای مجوز، استفاده‌نشده برای درخواست پذیرفته/ردشده و برداشت‌نشده باشد؛ هنگام درخواست بیش از شش ماه از صدورش نگذشته باشد. صرف پذیرش، CAS نیست.', ['course', 'rules'], p.cas_months, 'calendar_months');
  condition('application_window', 'زمان درخواست', !application || !f.course_starts_on ? 'unknown' : application > f.course_starts_on || application < addMonths(f.course_starts_on, -p.advance_months) ? 'action_needed' : 'self_reported_met',
    'درخواست از خارج بریتانیا حداکثر شش ماه پیش از شروع دوره است. شروع گذشته یا نامعلوم نیازمند هماهنگی با اسپانسر است.', ['overview', 'rules'], p.advance_months, 'calendar_months');
  condition('english', 'اثبات زبان دورهٔ دانشگاهی', f.english === 'cas_b2_all_skills' ? 'self_reported_met' : f.english === 'not_met' ? 'action_needed' : 'unknown',
    'در این برش فقط خوداظهاریِ ثبت تأیید B2 هر چهار مهارت و روش ارزیابی اسپانسر در CAS تطبیق داده می‌شود؛ نمرهٔ کل فرم جای آن را نمی‌گیرد.', ['english', 'rules'], 'B2 in all four skills', 'CEFR', reportPolicy.exceptions.english);
  for (const kind of ['atas', 'tb'] as const) {
    const state = f[kind], issued = kind === 'atas' ? f.atas_issued_on : f.tb_issued_on;
    const exempt = state === 'not_required_confirmed' || state === 'not_required_after_check';
    condition(kind, kind === 'atas' ? 'بررسی ATAS' : 'بررسی آزمایش سل', exempt ? 'not_applicable' : state === 'required_missing' ? 'action_needed' : state !== 'valid_certificate' || !issued || !application ? 'unknown' :
      issued > application || application > addMonths(issued, p.certificate_months) ? 'action_needed' : 'self_reported_met',
      kind === 'atas' ? 'نیاز ATAS را با کد رشته و تابعیت و پاسخ دانشگاه بررسی کن؛ در صورت نیاز، گواهی معتبرِ منطبق با همین دوره پیش از درخواست لازم است.' :
        'نیاز سل تابع مدت اقامت و سابقهٔ زندگی در کشورهای فهرست رسمی است، نه فقط تابعیت ایران. گواهی از مرکز مورد تأیید و تاریخ عکس لازم است؛ سوابق پزشکی دریافت نمی‌کنیم.', [kind, 'documents'], p.certificate_months, 'calendar_months');
  }
  const cashMethod = f.finance_method === 'cash';
  condition('finance_method', 'روش اثبات منابع مالی', cashMethod ? 'self_reported_met' : f.finance_method ? 'needs_review' : 'unknown',
    'محاسبهٔ این برش برای وجه نقد است. وام، حمایت رسمی یا معافیت، قواعد و مدارک جدا دارد؛ بودجهٔ کلی به معنی موجودی بانکی قابل قبول نیست.', ['money', 'rules'], null, null, reportPolicy.exceptions.finance);
  const months = f.course_months == null ? null : Math.min(f.course_months, p.max_maintenance_months);
  const monthly = f.location === 'london' ? p.living_london : f.location === 'outside_london' ? p.living_outside : null;
  const tuitionConflict = f.tuition_gbp != null && f.tuition_paid_gbp != null && f.tuition_paid_gbp > f.tuition_gbp;
  const living = monthly != null && months != null ? monthly * months : null;
  const tuition = !tuitionConflict && f.tuition_gbp != null && f.tuition_paid_gbp != null ? round(f.tuition_gbp - f.tuition_paid_gbp) : null;
  const accommodation = f.sponsor_accommodation_paid_gbp == null || living == null ? null : Math.min(f.sponsor_accommodation_paid_gbp, p.accommodation_cap, living);
  const maintenance = cashMethod && living != null && tuition != null && accommodation != null ? round(tuition + living - accommodation) : null;
  const budget = value('budget');
  const funds = budget && typeof budget === 'object' && budget.currency === 'GBP' ? budget.amount : null;
  condition('cash_funds', 'مقدار وجه نقد مورد نیاز', tuitionConflict ? 'needs_review' : maintenance == null || funds == null ? 'unknown' : funds < maintenance ? 'action_needed' : 'self_reported_met',
    tuitionConflict ? 'شهریهٔ پرداختی از شهریهٔ اعلام‌شده بیشتر است؛ اعداد CAS و رسید را اصلاح کن.' :
      funds == null ? 'مقدار و ارز بودجه در فرم باید معلوم باشد؛ ارز غیر GBP را بدون نرخ معتبر تبدیل نمی‌کنیم. مبلغ CAS، شهر، ماه‌های دوره و پرداخت‌ها هم لازم‌اند.' :
        'ماندهٔ شهریهٔ سال اول/دورهٔ کوتاه‌تر طبق CAS، به‌علاوهٔ زندگی حداکثر نه ماه، با کسر مجاز اقامت اسپانسر؛ پذیرش حساب و دسترسی واقعی به وجه تأیید نشده است.', ['money', 'rules'], maintenance, 'GBP', reportPolicy.exceptions.finance);
  condition('holding_period', 'مدت نگهداری وجه', !cashMethod || f.funds_held_days == null || !f.funds_period_ends_on || !application ? 'unknown' :
    f.funds_held_days < p.held_days || daysBetween(f.funds_period_ends_on, application) < 0 || daysBetween(f.funds_period_ends_on, application) > p.statement_days ? 'action_needed' : 'self_reported_met',
    'کل مبلغ لازم باید ۲۸ روز متوالی نگهداری شده باشد و پایان دوره حداکثر ۳۱ روز پیش از درخواست باشد؛ عدد روز، خوداظهاری است.', ['money', 'rules'], p.held_days, 'days', reportPolicy.exceptions.finance);
  condition('dependants', 'همراهان', f.dependants === 0 ? 'not_applicable' : f.dependants == null ? 'unknown' : 'needs_review',
    f.dependants === 0 ? 'اعلام کرده‌ای همراه نداری.' : 'حق همراه به نوع دوره یا حمایت دولتی و شروط مستقل رابطه و فرزند وابسته است؛ هر همراه درخواست جداگانه دارد. ارشد آموزشی به‌خودی‌خود حق همراه نمی‌دهد.', ['family'], null, null, reportPolicy.exceptions.family);
  if (formView(saved).review_required.length) condition('answer_conflict', 'پاسخ‌های نیازمند بازبینی', 'needs_review', 'در فرم، تعارض یا پاسخ وابستهٔ بررسی‌نشده وجود دارد؛ پیش از نتیجه‌گیری آن‌ها را دوباره تأیید کن.', ['rules']);
  condition('unassessed', 'بررسی‌های مستقل باقی‌مانده', 'not_assessed', 'اصالت و پذیرش مدارک، Genuine Student، Part Suitability، محدودیت سابقهٔ تحصیل/حمایت مالی و ارزیابی خود اسپانسر و دوره در این گزارش تأیید نمی‌شوند.', ['rules', 'documents']);
  if (sourceReview) condition('source_change', 'تغییر شواهد در انتظار بازبینی', 'needs_review', 'تغییر مؤثر در دادهٔ عمومی این مسیر تشخیص داده شده است؛ تا بازبینی منابع و قواعد، نتیجهٔ تازه قطعی نمی‌شود.', ['rules']);
  if (retrievalFailed) condition('source_sync', 'دریافت شواهد نیازمند بازبینی است', 'needs_review', 'دریافت تازه یا دسترسی به وضعیت شواهد ممکن نشد؛ این خطا به‌تنهایی وقوع تغییر در شرط‌ها را ثابت نمی‌کند. برای نتیجهٔ تازه بازبینی لازم است.', ['rules']);
  const fresh = !sourceReview && !retrievalFailed && reportPolicy.sources.every(s => Date.parse(s.checked_at) <= now.getTime() && now.getTime() < Date.parse(s.expires_at));
  if (!fresh) for (const c of conditions) if (!['unknown', 'not_assessed'].includes(c.state)) { c.state = 'needs_review'; c.reason = `منبع نیازمند بازبینی است؛ تطبیق قطعی تازه انجام نشد. ${c.reason}`; }
  const state = !fresh || conditions.some(c => c.state === 'needs_review') ? 'needs_review' : conditions.some(c => c.state === 'action_needed') ? 'action_needed' : conditions.some(c => c.state === 'unknown') ? 'needs_information' : 'preliminary_conditions_met';
  const dependantRate = f.location === 'london' ? p.dependant_london : f.location === 'outside_london' ? p.dependant_outside : null;
  return { schema_version: 1, kind: 'self_service_guidance', assessment: 'preliminary',
    route_id: reportPolicy.route_id, scope: reportPolicy.scope, status: state, coverage: 'partial', official_eligibility: 'not_determined',
    created_at: now.toISOString(), case_revision: saved.revision, score: null,
    policy_version: reportPolicy.version, evidence_version: policyDigest,
    dependencies: { facts: f, policy: reportPolicy },
    conditions,
    sources: reportPolicy.sources,
    evidence_current: fresh,
    costs: {
      government_fee: { amount: fresh ? p.visa_fee : null, currency: 'GBP', source_ids: ['fees'], note: 'برای متقاضی اصلی؛ مبلغ و ارز پرداخت نهایی در سامانهٔ درخواست تعیین می‌شود.' },
      healthcare: { amount: null, annual_rate: fresh ? p.healthcare_annual : null, currency: 'GBP', source_ids: ['healthcare'], note: 'کل IHS به طول اجازهٔ اقامت وابسته است و با طول دوره برابر فرض نمی‌شود؛ از محاسبه‌گر رسمی استفاده کن.' },
      maintenance: { amount: fresh ? maintenance : null, currency: 'GBP', living_before_deduction: fresh ? living : null, tuition_outstanding: tuition,
        accommodation_deduction: fresh ? accommodation : null, source_ids: ['money', 'rules'], note: 'تمکن، هزینهٔ مصرفی نیست؛ این مقدار برای روش نقدی متقاضی اصلی است.' },
      dependants: { count: f.dependants ?? null, permission: f.dependants === 0 ? 'not_applicable' : 'not_determined',
        maintenance: f.dependants === 0 ? 0 : null, monthly_rate: fresh ? dependantRate : null,
        visa_fees: fresh && f.dependants != null ? f.dependants * p.visa_fee : null, currency: 'GBP', source_ids: ['family', 'fees'],
        note: 'تمکن همراه بر پایهٔ مدت اجازهٔ اقامت درخواستی تا سقف نه ماه است؛ مدت دوره جای آن نیست و کل نامعلوم می‌ماند. نرخ ماهانه برای هر همراه است؛ مجوز همراه، IHS و سفر جدا بررسی می‌شوند.' },
      other: [{ id: 'biometrics', amount: null, note: 'هزینهٔ مرکز/خدمات اختیاری؛ بسته به مرکز.' }, { id: 'translation', amount: null, note: 'ترجمه و آماده‌سازی مدارک.' }, { id: 'travel', amount: null, note: 'سفر، اقامت و کشور ثالث احتمالی.' }],
      spending_total: null,
    },
    next_actions: [
      ...conditions.filter(c => ['action_needed', 'unknown', 'needs_review'].includes(c.state)).map(c => ({ id: c.id, title: c.title, detail: c.reason, source_ids: c.source_ids })),
      { id: 'sponsor_check', title: 'CAS و مدارک را با اسپانسر بررسی کن', detail: 'مجوز اسپانسر، دوره، زبان و پرداخت‌ها را از خود دانشگاه تأیید بگیر؛ هیچ شمارهٔ CAS یا تصویر مدرکی در کوچ وارد نکن.', source_ids: ['course', 'documents'] },
      { id: 'iran_start', title: 'شروع درخواست از ایران', detail: 'از صفحهٔ رسمی درخواست آنلاین شروع کن؛ روش احراز هویت را همان سامانه مشخص می‌کند. مرکز و وقت ایران را از فهرست رسمی بررسی کن؛ وجود پیوند ایران به معنی وقتِ فعال نیست. کشور ثالث و حق ورود به آن باید جدا بررسی شوند.', source_ids: ['apply', 'centres'] },
      { id: 'payment_check', title: 'هزینه و پرداخت را پیش از ارسال دوباره بررسی کن', detail: 'IHS را با مدت اجازهٔ اقامت در سامانهٔ رسمی محاسبه کن و امکان قانونی پرداخت و انتقال وجه از ایران را مستقل بررسی کن؛ هزینهٔ سفر و ترجمه نامعلوم است.', source_ids: ['healthcare', 'overview'] },
    ],
    limitations: ['این گزارش مقدماتی و بر پایهٔ خوداظهاری است؛ تأیید رسمی صلاحیت یا مدرک و احتمال ویزا نیست.',
      'پوشش جزئی است؛ رعایت موارد بررسی‌شده به معنی آماده‌بودن برای ارسال درخواست یا برآورده‌شدن همهٔ شروط نیست.',
      'تاریخ‌های مؤثر احرازنشده صریحاً null هستند؛ این مجموعه برای برنامه‌ریزی جاری است و قواعد گذشته/آینده را بازسازی نمی‌کند.',
      'هیچ نمرهٔ ترکیبی، IRVI، Practical Fit یا امتیاز Immi در این گزارش ساخته نمی‌شود.'],
  };
}
// Each evaluation contributes a route result to the same case report; it owns no intake.
export function buildReport(saved: SavedCase, now: Date, review: EvidenceReview = { routeIds: [], retrievalFailed: false }) {
  const goal = formRecords(saved).goal;
  const study = goal?.answer.state === 'known' && goal.answer.value === 'study' && !goal.needs_review;
  const destinations = saved.answers.destinations;
  return { schema_version: 1, kind: 'self_service_guidance', assessment: 'preliminary',
    created_at: now.toISOString(), case_revision: saved.revision, coverage: 'partial',
    dependencies: { case: saved },
    discovery: buildDiscovery(saved, now, review),
    route_results: study ? [
      ...(!destinations.length || destinations.includes('uk') ? [evaluateStudent(saved, now, review.routeIds.includes('uk:student'), review.retrievalFailed)] : []),
      ...(!destinations.length || destinations.includes('ca') ? [evaluateCanada(saved, now, review.routeIds.includes('ca:study-permit-ca'), review.retrievalFailed)] : []),
    ] : [],
    coverage_note: 'این کارنامه غربال جهانیِ مسیرهای فهرست‌شده را با پوشش جزئی ثبت می‌کند؛ شرط‌های بررسی‌شده و اطلاعات نامعلوم برای هر مسیر جدا مشخص‌اند. نبود نتیجه برای مقصد یا هدف دیگر به معنی بسته‌بودن مسیر نیست.',
  };
}
export type GuidanceReport = Omit<ReturnType<typeof buildReport>, 'discovery'> & { id: string; version: number; discovery?: DiscoveryBriefing };
export type RouteReport = GuidanceReport['route_results'][number];
