import type { Question } from '../form/contract';
import { canadaQuestionId } from './canada-policy';
const fields: { id: string; title: string; help: string; input?: Question['input']; options?: [string, string][]; depends?: string[] }[] = [
  { id: 'scope', title: 'نوع درخواست کانادای تو چیست؟', help: 'هویت مسیر مجوز تحصیل اولیه است؛ سابقهٔ کانادا پیش‌نیاز ورود اولیه نیست.', options: [['iran_initial_degree', 'درخواست اولیه از ایران، با تابعیت ایرانی، برای دورهٔ دانشگاهی'], ['extension', 'تمدید یا تغییر شرایط داخل کانادا'], ['pgwp', 'اجازهٔ کار پس از تحصیل (PGWP)'], ['other', 'تابعیت دوگانه، دوره یا وضعیت دیگر']] },
  { id: 'application_on', title: 'تاریخ هدف درخواست کانادا', help: 'میلادی؛ منابع این نسخه برای برنامه‌ریزی جاری بررسی شده‌اند.', input: 'date' },
  { id: 'province', title: 'محل دورهٔ کانادا کجاست؟', help: 'کبک CAQ و قواعد مالی جدا دارد.', options: [['outside_quebec', 'بیرون کبک'], ['quebec', 'کبک']] },
  { id: 'loa', title: 'نامهٔ پذیرش کانادا (LOA) چه وضعی دارد؟', help: 'پذیرش همان دوره از DLI را بررسی کن؛ پذیرش مشروط، CAS بریتانیا و PGWP جای آن نیستند. شماره یا تصویر مدرک وارد نکن.', options: [['unconditional_dli', 'پذیرش بدون شرطِ لازمِ پیش‌دوره از DLI دارم'], ['conditional', 'پذیرش مشروط به پیش‌دوره دارم'], ['absent', 'هنوز نامهٔ پذیرش ندارم']], depends: ['study_offer'] },
  { id: 'institution', title: 'مؤسسهٔ کانادایی دولتی است یا خصوصی؟', help: 'برای معافیت PAL/TAL ارشد و دکتری، دولتی‌بودن DLI مهم است.', options: [['public', 'DLI دولتی'], ['private', 'DLI خصوصی']], depends: ['loa'] },
  { id: 'pal', title: 'وضعیت نامهٔ PAL/TAL کانادا', help: 'برای معافیت خاص باید مدرک مستقل ارائه شود؛ داشتن پذیرش کافی نیست.', options: [['valid_2026', 'نامهٔ صادرشده در سال ۲۰۲۶ برای همین درخواست دارم'], ['missing', 'نامه ندارم'], ['other_exemption', 'استثنای دیگری دارم؛ بازبینی لازم است']], depends: ['institution', 'application_on', 'province'] },
  { id: 'pal_expires_on', title: 'تاریخ انقضای PAL/TAL کانادا', help: 'میلادی؛ نامه باید هنگام دریافت درخواست معتبر باشد و از سال قبلی نباشد.', input: 'date', depends: ['pal'] },
  { id: 'caq', title: 'وضعیت CAQ کبک', help: 'گواهی معتبر و متن لازم است؛ معافیت PAL لزوماً معافیت CAQ نیست. این برش اعتبار CAQ را تأیید نمی‌کند.', options: [['valid', 'گواهی معتبر دارم'], ['missing', 'ندارم'], ['exempt', 'فکر می‌کنم معاف هستم']], depends: ['province'] },
  { id: 'duration_months', title: 'طول دورهٔ کانادا به ماه', help: 'برای دورهٔ کوتاه‌تر از یک سال محاسبهٔ مالی این برش انجام نمی‌شود.', input: 'number', depends: ['loa'] },
  { id: 'tuition_cad', title: 'شهریهٔ سال اول کانادا، به دلار کانادا', help: 'از پذیرش همین دوره؛ صفر فقط وقتی هزینه واقعاً صفر است.', input: 'number', depends: ['loa'] },
  { id: 'tuition_paid_cad', title: 'شهریهٔ پرداخت‌شدهٔ سال اول کانادا، به دلار کانادا', help: 'فقط پرداخت مستند به مؤسسه؛ اگر نپرداخته‌ای صفر، اگر نامعلوم است «نمی‌دانم».', input: 'number', depends: ['tuition_cad'] },
  { id: 'return_transport_cad', title: 'بودجهٔ رفت‌وبرگشت کانادا برای خودت و همراهان، به دلار کانادا', help: 'عدد برنامه‌ریزی خودت؛ تعرفهٔ دولتی یا قیمت تأییدشده نیست. هزینهٔ رفت‌وبرگشت همه را لحاظ کن.', input: 'number', depends: ['dependants'] },
  { id: 'finance_method', title: 'روش تأمین مالی کانادا چیست؟', help: 'بودجهٔ مشترک دوباره پرسیده نمی‌شود؛ روش و مدارک هر کشور جداست.', options: [['available_funds', 'وجه در دسترس برای اثبات'], ['loan_scholarship_support', 'وام، بورسیه یا حمایت دیگر؛ نیازمند بازبینی']] },
  { id: 'funds_access', title: 'منشأ و امکان قانونی انتقال وجه کانادا مستند است؟', help: 'باید وجه بدون کار در کانادا در دسترس باشد؛ اصالت مدارک یا امکان انتقال در کوچ تأیید نمی‌شود.', options: [['documented', 'منشأ و دسترسی/انتقال کل وجه را مستند کرده‌ام'], ['not_ready', 'هنوز آماده نیست']], depends: ['budget', 'tuition_paid_cad', 'return_transport_cad', 'finance_method', 'duration_months', 'province', 'dependants'] },
  { id: 'later_years', title: 'برنامهٔ مالی سال‌های بعد کانادا را مستند کرده‌ای؟', help: 'موجودی سال اول جای برنامهٔ کل دوره نیست.', options: [['documented_plan', 'برنامهٔ مستند دارم'], ['not_ready', 'هنوز ندارم']], depends: ['duration_months', 'finance_method'] },
  { id: 'biometrics', title: 'نیاز انگشت‌نگاری کانادا را بررسی کرده‌ای؟', help: 'اعتبار قبلی یا معافیت را با ابزار رسمی بررسی کن؛ بدون BIL برای انگشت‌نگاری اقدام نکن.', options: [['required', 'باید انجام دهم'], ['valid_or_exempt', 'اعتبار قبلی یا معافیت را بررسی کرده‌ام']] },
];
export const canadaQuestions: Question[] = fields.map(f => ({
  id: canadaQuestionId(f.id), version: 1, title: f.title, help: f.help, input: f.input ?? 'choice',
  route_id: 'ca:study-permit-ca', options: (f.options ?? []).map(([value, label]) => ({ value, label })),
  priority: 'impact', allow_unknown: true, allow_declined: false,
  depends_on: ['goal', 'study_level', ...(f.depends ?? []).map(id => ['budget', 'dependants', 'study_offer'].includes(id) ? id : canadaQuestionId(id))],
  ...(f.input === 'number' ? { min: f.id === 'duration_months' ? 1 : 0, max: f.id === 'duration_months' ? 120 : 1e9, integer: f.id === 'duration_months', unit: f.id === 'duration_months' ? 'months' : 'CAD' } : {}),
}));
