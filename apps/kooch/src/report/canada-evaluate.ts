import type { SavedCase } from '../account/contract';
import { formRecords, formView } from '../form/workflow';
import { canadaFactsSchema, canadaPolicy, canadaPolicyDigest, canadaQuestionId } from './canada-policy';
import type { Condition, State } from './evaluate';
export function evaluateCanada(saved: SavedCase, now: Date, sourceReview: boolean, retrievalFailed: boolean) {
  const records = formRecords(saved), active = new Set(formView(saved).questions.map(q => q.id));
  const value = (id: string) => { const r = records[id]; return r && !r.needs_review && r.answer.state === 'known' ? r.answer.value : undefined; };
  const f = canadaFactsSchema.parse(Object.fromEntries(Object.keys(canadaFactsSchema.shape).map(key => [key, active.has(canadaQuestionId(key)) ? value(canadaQuestionId(key)) ?? null : null])));
  const fresh = !sourceReview && !retrievalFailed && canadaPolicy.sources.every(s => Date.parse(s.checked_at) <= now.getTime() && now.getTime() < Date.parse(s.expires_at));
  const conditions: Condition[] = [];
  const condition = (id: string, title: string, state: State, reason: string, source_ids: string[], threshold: string | number | null = null, unit: string | null = null) =>
    conditions.push({ id, title, state, reason, source_ids, document_verified: false, rule: { version: canadaPolicy.version, value: threshold, unit, exceptions: canadaPolicy.exceptions } });
  condition('scope', 'نوع درخواست کانادا', f.scope === 'iran_initial_degree' ? 'self_reported_met' : f.scope ? 'needs_review' : 'unknown',
    'این مسیر درخواست اولیهٔ تحصیل از ایران است؛ سابقهٔ تحصیل کانادا لازم فرض نمی‌شود. تمدید، PGWP، تابعیت یا نوع دورهٔ دیگر بررسی جدا می‌خواهند.', ['apply', 'eligibility']);
  const age = value('age_exact'), level = value('study_level');
  condition('adult_scope', 'سن و دامنهٔ دانشگاهی', typeof age !== 'number' || !level ? 'unknown' : age < canadaPolicy.values.adult_scope_age ? 'needs_review' : 'self_reported_met',
    'برش حاضر ۱۹ سال به بالا و مقطع دانشگاهی است؛ سن قانونی بعضی استان‌ها ۱۸ و بعضی ۱۹ است. برای ۱۸ سال یا کمتر، استان و قواعد مراقبت/قیم جدا بررسی می‌شوند؛ این برچسب رد مسیر نیست.', ['minors', 'documents'], canadaPolicy.values.adult_scope_age, 'years');
  condition('passport', 'مدرک سفر', value('passport') === 'yes' ? 'self_reported_met' : value('passport') === 'no' ? 'action_needed' : 'unknown', 'اعتبار گذرنامه و مدارک هویتی باید بررسی شود؛ شماره یا تصویر مدرکی دریافت نشده است.', ['documents']);
  condition('loa', 'پذیرش کانادا از DLI', f.loa === 'absent' ? 'action_needed' : f.loa === 'conditional' || f.loa === 'unconditional_dli' && value('study_offer') === 'no' ? 'needs_review' : f.loa === 'unconditional_dli' ? 'self_reported_met' : 'unknown',
    'نامهٔ پذیرش همان دوره از DLI و تأیید آن توسط مؤسسه لازم است؛ پذیرش مشروط به پیش‌دوره و تعارض با پاسخ مشترک بررسی جدا می‌خواهند. PGWP از داشتن LOA نتیجه نمی‌شود.', ['documents']);
  condition('province', 'استان و CAQ', f.province === 'outside_quebec' ? 'self_reported_met' : f.province === 'quebec' ? 'needs_review' : 'unknown',
    f.province === 'quebec' ? 'کبک CAQ، متن گواهی، استثناها و تمکن استانی مستقل دارد؛ پاسخ CAQ ثبت می‌شود ولی این برش آن را تأیید یا مبلغ فدرال را جایگزین نمی‌کند.' : 'جدول فدرال این نسخه فقط بیرون کبک مصرف می‌شود.', ['pal', 'money']);
  condition('application_date', 'تاریخ درخواست و اعتبار قواعد', !f.application_on ? 'unknown' : canadaPolicy.sources.some(s => f.application_on! < s.checked_at.slice(0, 10) || f.application_on! >= s.expires_at.slice(0, 10)) ? 'needs_review' : 'self_reported_met',
    'تاریخ هدف باید در بازهٔ بررسی منابع باشد؛ این نسخه قواعد گذشته یا آینده را بازسازی نمی‌کند.', ['apply', 'money']);
  // Eligibility for an exemption needs BOTH a degree level and a public DLI.
  const palExempt = ['master', 'phd'].includes(String(level)) && f.institution === 'public';
  let pal: State = 'unknown';
  if (f.province === 'quebec') pal = 'needs_review';
  else if (f.province === 'outside_quebec') {
    if (palExempt) pal = 'not_applicable';
    else if (f.pal === 'other_exemption') pal = 'needs_review';
    else if (level && f.institution) pal = f.pal === 'missing' ? 'action_needed' : f.pal === 'valid_2026' && f.application_on && f.pal_expires_on ?
      f.application_on.slice(0, 4) !== '2026' || f.pal_expires_on < f.application_on ? 'action_needed' : 'self_reported_met' : 'unknown';
  }
  condition('pal', 'PAL/TAL و معافیت', pal, palExempt ? 'از ۱ ژانویهٔ ۲۰۲۶ برای دورهٔ منتهی به مدرک ارشد یا دکتری در DLI دولتی معافیت PAL/TAL پیش‌بینی شده؛ مدرک معافیت همچنان لازم است. CAQ کبک جداست.' :
    'نامهٔ PAL/TAL معتبر همان سال سهمیه برای همین درخواست لازم است؛ صادرشدن در ۲۰۲۶ و اعتبار هنگام درخواست باید بررسی شود. سایر استثناها خودکار پذیرفته نمی‌شوند.', ['pal'], '2026-01-01');
  const count = value('dependants');
  const familySize = typeof count === 'number' ? count + 1 : null;
  const annual = familySize == null ? null : familySize <= 7 ? canadaPolicy.values.living_annual[familySize - 1] : canadaPolicy.values.living_annual[6] + (familySize - 7) * canadaPolicy.values.extra_family_member;
  const moneyScope = f.scope === 'iran_initial_degree' && typeof age === 'number' && age >= canadaPolicy.values.adult_scope_age && f.province === 'outside_quebec' && f.duration_months != null && f.duration_months >= 12 &&
    f.application_on != null && canadaPolicy.sources.every(s => f.application_on! >= s.checked_at.slice(0, 10) && f.application_on! < s.expires_at.slice(0, 10));
  const conflict = f.tuition_cad != null && f.tuition_paid_cad != null && f.tuition_paid_cad > f.tuition_cad;
  const tuition = conflict || f.tuition_cad == null || f.tuition_paid_cad == null ? null : Math.round((f.tuition_cad - f.tuition_paid_cad) * 100) / 100;
  const required = fresh && moneyScope && !conflict && f.finance_method === 'available_funds' && annual != null && tuition != null && f.return_transport_cad != null ? Math.round((annual + tuition + f.return_transport_cad) * 100) / 100 : null;
  const budget = value('budget');
  const funds = budget && typeof budget === 'object' && budget.currency === 'CAD' ? budget.amount : null;
  condition('finance_method', 'روش تأمین مالی', f.finance_method === 'available_funds' ? 'self_reported_met' : f.finance_method ? 'needs_review' : 'unknown',
    'وام، بورسیه و حمایت مالی می‌توانند مدرک مالی باشند ولی در این برش مقدار قابل قبول آن‌ها تأیید نمی‌شود؛ درآمد کار آیندهٔ کانادا جای تمکن نیست.', ['money']);
  condition('duration', 'دوره و برنامهٔ مالی', f.duration_months == null ? 'unknown' : f.duration_months < 12 ? 'needs_review' : f.duration_months === 12 ? 'self_reported_met' : f.later_years === 'documented_plan' ? 'self_reported_met' : f.later_years === 'not_ready' ? 'action_needed' : 'unknown',
    'برای سال اول منابع مالی و برای دورهٔ طولانی‌تر برنامهٔ تأمین کل مدت لازم است؛ دورهٔ کوتاه‌تر جدا بررسی می‌شود.', ['money']);
  condition('funds', 'تمکن کانادا و هزینهٔ رفت‌وبرگشت', conflict ? 'needs_review' : required == null || funds == null ? 'unknown' : funds < required ? 'action_needed' : 'self_reported_met',
    conflict ? 'پرداخت شهریه از شهریهٔ سال اول بیشتر است؛ اعداد را بازبینی کن.' : 'محاسبهٔ سال اول: ماندهٔ شهریه، زندگی برای کل خانواده و بودجهٔ رفت‌وبرگشت خوداظهاری. فقط CAD مقایسه می‌شود؛ بودجهٔ مشترک برای چند کشور هم‌زمان تخصیص‌یافته فرض نمی‌شود.', ['money'], required, 'CAD');
  condition('funds_access', 'منشأ و دسترسی به وجه', f.funds_access === 'documented' ? 'self_reported_met' : f.funds_access === 'not_ready' ? 'action_needed' : 'unknown',
    'منشأ پول و امکان قانونی انتقال تمام هزینه‌ها از ایران باید مستند شود. قاعدهٔ ۲۸ روز بریتانیا به کانادا اعمال نمی‌شود؛ مدارک مالی و دستورالعمل محلی را جدا بررسی کن.', ['money', 'apply']);
  condition('dependants', 'وضعیت همراهان', count === 0 ? 'not_applicable' : count == null ? 'unknown' : 'needs_review',
    'عدد جدول زندگی حق همراه یا اجازهٔ کار نمی‌سازد؛ رابطه، نوع درخواست همراه و شرایط کار همسر جدا بررسی می‌شوند.', ['family', 'money']);
  condition('biometrics', 'انگشت‌نگاری', f.biometrics === 'required' ? 'action_needed' : f.biometrics === 'valid_or_exempt' ? 'self_reported_met' : 'unknown',
    'نیاز و اعتبار قبلی را با IRCC بررسی کن؛ در صورت نیاز پس از نامهٔ BIL وقت بگیر. هزینهٔ مرکز و سفر از هزینهٔ دولتی جداست.', ['biometrics', 'centres', 'fees']);
  condition('unassessed', 'بررسی‌های مستقل باقی‌مانده', 'not_assessed', 'اصالت پذیرش و مدارک، شرایط پذیرش/زبان مؤسسه، هدف موقت و خروج در پایان مجوز، سوءپیشینه، نیاز معاینه و دستورالعمل محلی دفتر ویزا تأیید نشده‌اند؛ نمرهٔ زبان عمومی فرم جای آن‌ها نیست.', ['eligibility', 'documents']);
  if (formView(saved).review_required.length) condition('answer_conflict', 'پاسخ نیازمند بازبینی', 'needs_review', 'در همان پرونده پاسخ وابسته یا متعارض نیازمند تأیید دوباره است.', ['documents']);
  if (sourceReview || retrievalFailed) condition('source_change', 'بازبینی شواهد', 'needs_review', 'تغییر شواهد یا خطای دریافت نیازمند بازبینی است؛ خطا به معنی تغییر قانون یا بسته‌بودن مسیر نیست.', ['eligibility']);
  if (!fresh) for (const c of conditions) if (!['unknown', 'not_assessed'].includes(c.state)) c.state = 'needs_review';
  const status = !fresh || conditions.some(c => c.state === 'needs_review') ? 'needs_review' : conditions.some(c => c.state === 'action_needed') ? 'action_needed' : conditions.some(c => c.state === 'unknown') ? 'needs_information' : 'preliminary_conditions_met';
  return { schema_version: 1, kind: 'self_service_guidance', assessment: 'preliminary', route_id: canadaPolicy.route_id, scope: canadaPolicy.scope,
    status, coverage: 'partial', official_eligibility: 'not_determined', created_at: now.toISOString(), case_revision: saved.revision, score: null,
    policy_version: canadaPolicy.version, evidence_version: canadaPolicyDigest, dependencies: { facts: f, policy: canadaPolicy },
    conditions, sources: canadaPolicy.sources, evidence_current: fresh,
    costs: {
      government_fee: { amount: fresh ? canadaPolicy.values.visa_fee : null, currency: 'CAD', source_ids: ['fees'], note: 'فقط متقاضی اصلی؛ ویزای ورود در صورت نیاز همراه مجوز بدون هزینهٔ درخواست جدا صادر می‌شود.' },
      healthcare: { amount: null, annual_rate: null, currency: 'CAD', source_ids: ['documents'], note: 'بیمه و هزینهٔ پزشکی/معاینه جداست؛ IHS بریتانیا به کانادا اعمال نمی‌شود.' },
      maintenance: { amount: fresh ? required : null, currency: 'CAD', living_before_deduction: fresh && moneyScope ? annual : null, tuition_outstanding: tuition, accommodation_deduction: null, return_transport: f.return_transport_cad ?? null,
        source_ids: ['money'], note: 'تمکن سال اول برای متقاضی و تمام همراهان؛ شامل ماندهٔ شهریه، زندگی سالانه بدون کسر اقامت و بودجهٔ رفت‌وبرگشت خوداظهاری است. صفرِ نامعلوم نداریم؛ کبک و دورهٔ کوتاه جدا هستند.' },
      dependants: { count: typeof value('dependants') === 'number' ? Number(value('dependants')) : null, permission: value('dependants') === 0 ? 'not_applicable' : 'not_determined', maintenance: null, monthly_rate: null, visa_fees: null, currency: 'CAD', source_ids: ['family', 'money'],
        note: 'حق ورود/تحصیل/کار همراه مستقل است؛ ارشد حداقل ۱۶ ماه، دکتری و برخی دوره‌های منتخب برای کار همسر شروط جدا دارند. از تعداد همراه حق کار یا هزینهٔ یکسان ویزا نتیجه نمی‌شود.' },
      other: [{ id: 'biometrics', amount: fresh && f.biometrics === 'required' ? canadaPolicy.values.biometrics_fee : null, note: 'هزینهٔ دولتی انگشت‌نگاری متقاضی اصلی در صورت نیاز؛ اعتبار قبلی یا معافیت و هزینهٔ خانوادگی مستقل بررسی شود.' }, { id: 'travel', amount: null, note: 'سفر به مرکز، ترجمه، معاینه و بیمه؛ مبلغ نامعلوم.' }], spending_total: null,
    },
    next_actions: [
      ...conditions.filter(c => ['unknown', 'action_needed', 'needs_review'].includes(c.state)).map(c => ({ id: c.id, title: c.title, detail: c.reason, source_ids: c.source_ids })),
      { id: 'iran_start', title: 'شروع آنلاین از ایران و برنامهٔ مرکز', detail: 'از IRCC و چک‌لیست محل اقدام شروع کن. پس از BIL، مرکز رسمی و وقت را بررسی کن؛ مهلت معمول نامه ۳۰ روز است. اگر مرکز در محل زندگی نیست سفر کشور ثالث، حق ورود و هزینهٔ آن جدا لازم است؛ فهرست مرکز وعدهٔ وقت نیست.', source_ids: ['apply', 'biometrics', 'centres'] },
      { id: 'payment', title: 'پرداخت و دسترسی به وجه', detail: 'امکان قانونی پرداخت هزینهٔ درخواست و انتقال وجه از ایران، مدارک منشأ پول و برنامهٔ کل دوره را مستقل بررسی کن.', source_ids: ['money', 'apply', 'fees'] },
    ],
    limitations: ['کارنامه مقدماتی و بر پایهٔ خوداظهاری است؛ مدرکی تأیید نشده و نمره یا احتمال ویزا ساخته نمی‌شود.', 'پوشش جزئی است؛ این ماژول PGWP، تمدید، تمام کانادا یا تمام شروط مجوز تحصیل را پوشش نمی‌دهد.', canadaPolicy.exceptions],
  };
}
