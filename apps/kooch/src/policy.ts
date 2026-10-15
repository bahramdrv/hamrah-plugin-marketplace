// Discovery prerequisites only; these are not a complete eligibility policy.
export const policyVersion = 'compass-discovery-1';
export const facts = {
  'am.job_offer': 'پیشنهاد کار از کارفرمای ارمنی داری؟',
  'ca.work': 'سابقهٔ کار واجد شرایط CEC در کانادا داری؟',
  'ca.study': 'از دورهٔ کانادایی واجد شرایط PGWP فارغ‌التحصیل شده‌ای؟',
  'ca.skilled_work': 'سابقهٔ کار تخصصی مرتبط با برنامهٔ نیروی متخصص فدرال کانادا داری؟',
  'ca.trade': 'برای مسیر مشاغل فنی کانادا، سابقهٔ فنی و پیشنهاد کار معتبر یا گواهی صلاحیت کانادایی داری؟',
  'ca.province': 'استان و جریان نامزدی مشخص و قابل اقدام از خارج کانادا را شناسایی کرده‌ای؟',
  'ca.family': 'همسر یا شریک واجد شرایط حمایت در کانادا داری؟',
  'ca.admission': 'پذیرش تحصیلی از مؤسسهٔ کانادایی مجاز داری؟',
  'de.job_offer': 'پیشنهاد یا قرارداد کار از کارفرمای آلمانی داری؟',
  'de.admission': 'پذیرش تحصیلی مرتبط از آلمان داری؟',
  'es.project': 'طرح کارآفرینی نوآورانه برای ارزیابی در اسپانیا داری؟',
  'es.family': 'عضو خانواده با اقامت واجد شرایط در اسپانیا داری؟',
  'es.job_offer': 'پیشنهاد کار تخصصی از کارفرمای اسپانیایی داری؟',
  'it.remote_work': 'کار حرفه‌ای از راه دور برای کارفرما یا مشتری خارج ایتالیا داری؟',
  'it.passive_income': 'درآمد مستقل و غیرفعال برای اقامت بدون کار در ایتالیا داری؟',
  'it.job_offer': 'پیشنهاد یا قرارداد کار تخصصی از ایتالیا داری؟',
  'it.admission': 'پذیرش تحصیلی از ایتالیا داری؟',
  'pt.investment': 'سرمایه و گزینهٔ سرمایه‌گذاری مجاز پرتغال را برای بررسی مشخص کرده‌ای؟',
  'uk.family': 'همسر یا شریک با وضعیت واجد شرایط در بریتانیا داری؟',
  'uk.talent': 'برای استعداد جهانی بریتانیا تأییدیه یا جایزهٔ مشمول داری؟',
  'uk.degree': 'مدرک تازه از دانشگاه فهرست واجد شرایط مسیر HPI بریتانیا داری؟',
  'uk.project': 'طرح کسب‌وکار نوآور و تأییدیهٔ نهاد مجاز بریتانیا داری؟',
  'uk.job_offer': 'پیشنهاد کار از حامی مجاز بریتانیا برای مسیر موردنظر داری؟',
  'uk.admission': 'پذیرش تحصیلی و گواهی حمایت تحصیلی بریتانیا داری؟',
} as const;
export type FactId = keyof typeof facts;
type Goal = 'work' | 'study' | 'family' | 'business' | 'investment';
export type DiscoveryPolicy = { goal: Goal; requires: FactId[]; prerequisite: string };
const route = (goal: Goal, requires: FactId[], prerequisite: string): DiscoveryPolicy => ({ goal, requires, prerequisite });
export const policies: Record<string, DiscoveryPolicy> = {
  'am:work-residence-permit': route('work', ['am.job_offer'], 'کارفرمای ارمنی باید فرایند مجوز را شروع کند.'),
  'ca:express-entry-cec': route('work', ['ca.work'], 'سابقهٔ کار واجد شرایط در کانادا؛ دعوت و سایر شروط جدا بررسی شوند.'),
  'ca:express-entry-fsw': route('work', ['ca.skilled_work'], 'سابقهٔ تخصصی، زبان، مدرک و دعوت؛ احراز جزئیات لازم است.'),
  'ca:express-entry-fst': route('work', ['ca.trade'], 'سابقهٔ فنی و پیشنهاد کار یا گواهی صلاحیت؛ جزئیات برنامه بررسی شود.'),
  'ca:pgwp': route('work', ['ca.study'], 'فارغ‌التحصیلی واجد شرایط کانادا؛ مهلت و زبان و شرایط دوره بررسی شود.'),
  'ca:pnp': route('work', ['ca.province'], 'استان و جریان مشخص؛ شرایط و پذیرش جاری جریان جدا بررسی شود.'),
  'ca:spousal-sponsorship': route('family', ['ca.family'], 'رابطه و وضعیت حامی باید با شروط برنامه تطبیق یابند.'),
  'ca:study-permit-ca': route('study', ['ca.admission'], 'پذیرش معتبر؛ تمکن و سایر مدارک برنامه جدا بررسی شوند.'),
  'de:eu-blue-card': route('work', ['de.job_offer'], 'قرارداد کار؛ مدرک، شغل و آستانهٔ حقوق نیازمند بررسی دقیق‌اند.'),
  'de:skilled-worker-de': route('work', ['de.job_offer'], 'پیشنهاد کار؛ صلاحیت و شناسایی مدرک باید بررسی شود.'),
  'de:student-de': route('study', ['de.admission'], 'پذیرش تحصیلی؛ زبان، معیشت و شرایط پرونده جدا بررسی شوند.'),
  'es:entrepreneur-visa': route('business', ['es.project'], 'ارزیابی طرح نوآورانه و سایر شروط رسمی لازم است.'),
  'es:family-reunification-es': route('family', ['es.family'], 'وضعیت حامی و رابطه؛ محل آغاز درخواست بررسی شود.'),
  'es:highly-qualified-professional': route('work', ['es.job_offer'], 'کارفرما و شغل تخصصی واجد شرایط باید احراز شوند.'),
  'it:digital-nomad-italy': route('work', ['it.remote_work'], 'کار حرفه‌ای دورکار؛ درآمد و صلاحیت باید جدا احراز شوند.'),
  'it:elective-residence': route('investment', ['it.passive_income'], 'درآمد مستقل و پایدار؛ این مسیر مجوز اشتغال نیست.'),
  'it:eu-blue-card-italy': route('work', ['it.job_offer'], 'قرارداد تخصصی؛ حقوق و صلاحیت و مجوز لازم بررسی شوند.'),
  'it:student-visa-italy': route('study', ['it.admission'], 'پذیرش و فرایند پیش‌ثبت‌نام؛ معیشت جدا بررسی شود.'),
  'pt:golden-visa': route('investment', ['pt.investment'], 'گزینهٔ سرمایه‌گذاری مجاز و پذیرش جاری باید احراز شوند.'),
  'uk:family-spouse': route('family', ['uk.family'], 'وضعیت حامی و رابطه؛ درآمد و زبان نیازمند بررسی دقیق‌اند.'),
  'uk:global-talent': route('work', ['uk.talent'], 'تأییدیه یا جایزهٔ مشمول و سایر شروط رسمی لازم است.'),
  'uk:high-potential-individual': route('work', ['uk.degree'], 'دانشگاه مشمول و تاریخ مدرک؛ فهرست سال مربوط بررسی شود.'),
  'uk:innovator-founder': route('business', ['uk.project'], 'تأییدیهٔ معتبر طرح و سایر شروط رسمی لازم است.'),
  'uk:health-and-care-worker': route('work', ['uk.job_offer'], 'حامی و شغل مجاز این مسیر؛ زبان و صلاحیت بررسی شوند.'),
  'uk:scale-up': route('work', ['uk.job_offer'], 'حامی مجاز Scale-up؛ شغل و حقوق باید بررسی شوند.'),
  'uk:skilled-worker': route('work', ['uk.job_offer'], 'حامی مجاز این مسیر؛ شغل، حقوق و زبان بررسی شوند.'),
  'uk:student': route('study', ['uk.admission'], 'گواهی CAS؛ زبان و معیشت و سایر شروط جدا بررسی شوند.'),
};
export const countries: Record<string, { name: string; flag: string }> = {
  am: { name: 'ارمنستان', flag: '🇦🇲' }, ca: { name: 'کانادا', flag: '🇨🇦' },
  de: { name: 'آلمان', flag: '🇩🇪' }, es: { name: 'اسپانیا', flag: '🇪🇸' },
  it: { name: 'ایتالیا', flag: '🇮🇹' }, pt: { name: 'پرتغال', flag: '🇵🇹' }, uk: { name: 'بریتانیا', flag: '🇬🇧' },
};
export const goalLabels = { work: 'کار', study: 'تحصیل', family: 'پیوستن به خانواده', business: 'کارآفرینی', investment: 'سرمایه و درآمد مستقل', unknown: 'هنوز نمی‌دانم' };
