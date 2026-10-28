import evidence from '../data/iran-context-evidence.json';
import type { CatalogRecord, DiscoverySource, GlobalCatalog } from './catalog';
export type IranContext = { status: string; ordinary: boolean; note: string; method: string; sources: DiscoverySource[]; review_required: boolean };
const primary = (id: string): DiscoverySource => {
  const source = evidence.sources.find(source => source.id === id);
  if (!source) throw new Error(`Unlinked Iranian context source: ${id}`);
  return { ...source, authority: 'primary' };
};
const needsSourceReview = (sources: DiscoverySource[], now: Date) => !sources.length || sources.some(source => now.getTime() < Date.parse(source.checked_on) || now.getTime() - Date.parse(source.checked_on) > 14 * 86400000);
const special: Record<string, { note: string }> = {
  'nl:daft': { note: 'DAFT بر مبنای تابعیت آمریکا است؛ گذرنامهٔ صرفاً ایرانی مبنای این معاهده نیست. داشتن تابعیت مشمول و شرایط همان مبنا باید جدا بررسی شود؛ مسیر عادی خوداشتغالی هلند برنامهٔ متفاوتی است.' },
  'uk:youth-mobility-scheme': { note: 'تابعیت ایران به‌تنهایی در فهرست Youth Mobility نیست؛ تابعیت مشمول دیگر و شروط همان برنامه باید جدا احراز شوند.' },
  'au:working-holiday': { note: 'گذرنامهٔ صرفاً ایرانی در جدول مجاز Working Holiday نیست؛ داشتن گذرنامهٔ مشمول دیگر و شروط همان زیرگروه باید بررسی شود.' },
  'nz:working-holiday-nz': { note: 'تابعیت ایران به‌تنهایی در فهرست Working Holiday نیوزیلند نیست؛ تابعیت مشمول دیگر و سهمیهٔ همان برنامه لازم است.' },
};
export function iranContext(route: CatalogRecord, catalog: GlobalCatalog, now: Date): IranContext {
  const contextSources = evidence.routes.find(binding => binding.route_id === route.id)?.source_ids.map(primary) ?? [];
  const review_required = needsSourceReview(contextSources, now);
  if (['us', 'pr', 'vi', 'gu', 'mp'].includes(route.destination)) return { status: 'restricted_exception_review', ordinary: false, review_required,
    method: 'محدودیت صدور/ورود؛ بررسی استثنای معتبر لازم است', sources: contextSources,
    note: `فرمان۱۰۹۹۸ برای اتباع ایران محدودیت صدور و ورود دارد؛ استثناهایی مانند پاسپورت دوم غیرمشمول، اقامت دائم یا وضعیت ویزای معتبر در تاریخ مؤثر نیازمند بررسی دقیق‌اند. این وضعیت FAIL فردی نیست و ثبت درخواست، امکان صدور را اثبات نمی‌کند.${route.slug === 'tn' ? ' TN تابعیت کانادا یا مکزیک می‌خواهد؛ اقامت دائم آن دو کشور کافی نیست.' : route.slug === 'e-2' ? ' ایران مبنای معاهدهٔ E-2 ندارد؛ تابعیت کشور معاهده و شروط همان مبنا باید جدا بررسی شود.' : ''}${review_required ? ' بررسی این محدودیت باید تازه شود.' : ''}` };
  const rule = special[route.id];
  if (rule) return { status: 'eligible_nationality_required', ordinary: false, review_required, sources: contextSources, note: rule.note, method: 'نیازمند تابعیت یا گذرنامهٔ مشمول برنامه' };
  if (/\bclosed\b|discontinued|terminated/i.test(route.name)) return { status: 'closure_confirmation_required', ordinary: false, review_required: true, sources: [], note: 'منبع کاتالوگ برای این رکورد توقف یا خاتمه ثبت کرده است؛ وضعیت و جایگزین جاری باید از مرجع رسمی تأیید شود.', method: 'توقف ثبت‌شده؛ نیازمند تأیید جاری' };
  const application = catalog.iran_application[route.id];
  let context: IranContext = { status: 'iran_channel_unknown', ordinary: true, review_required: true, sources: [], method: 'نیازمند بررسی روش اقدام از ایران', note: 'وجود مسیر در کاتالوگ، پذیرش گذرنامهٔ ایران یا امکان درخواست از ایران را تأیید نمی‌کند.' };
  if (application) {
    const sources = application.source_ids.flatMap(id => catalog.iran_sources[id] ? [catalog.iran_sources[id]] : []);
    const fresh = application.evidence_checked_on <= now.toISOString().slice(0, 10) && application.valid_until >= now.toISOString().slice(0, 10) && sources.every(s => now.getTime() - Date.parse(s.checked_on) <= 14 * 86400000);
    const restricted = application.iran_passport_status === 'restricted' || ['closed', 'not_applicable'].includes(application.application_acceptance) && application.start_from_iran !== 'destination_only';
    const methods: Record<string, string> = { third_country: 'ارائه در کشور ثالث؛ صلاحیت محل درخواست باید احراز شود', destination_only: 'اقدام حضوری در مقصد؛ شرایط ورود قانونی جدا بررسی شود', online: 'آغاز آنلاین؛ شروط و مراحل حضوری جدا بررسی شوند', iran_office: 'نمایندگی در ایران؛ پذیرش و وقت جاری باید بررسی شوند' };
    context = { status: restricted ? 'restricted_application_channel' : 'iran_channel_context', ordinary: !restricted, review_required: !fresh,
      sources, method: `${fresh ? '' : 'بررسی قدیمی؛ '}${methods[application.start_from_iran] ?? context.method}`,
      note: `${application.reason_fa}${fresh ? '' : ' تاریخ این بررسی گذشته یا ناقص است؛ روش اقدام را پیش از برنامه‌ریزی دوباره تأیید کن.'}` };
  }
  if (route.destination === 'de') context = { ...context, sources: [...context.sources, ...contextSources], note: `${context.note} ظرفیت نمایندگی محدود است؛ سفر خودسرانه به کشور همسایه مجوز درخواست ایجاد نمی‌کند. ارجاع خانواده به استانبول فقط با هماهنگی رسمی مربوط است.` };
  if (route.destination === 'cz') context = { ...context, sources: [...context.sources, ...contextSources], note: `${context.note} پذیرش تهران به دسته‌های اعلام‌شدهٔ تحصیل، پژوهش، خانواده، Blue Card و درخواست‌های برنامهٔ «نیروی بسیارماهر» یا «کارکنان کلیدی و علمی» محدود است؛ سایر درخواست‌های ویزا/اقامت تهران فعلاً تعلیق‌اند. این محدودیتِ محل ارائه است؛ وضعیت فرد، نمایندگی صالح، برنامه و وقت جاری باید جدا احراز شوند. برنامهٔ کلیدی/علمی می‌تواند برخی درخواست‌های انتقال شرکتی، سرمایه‌گذاری یا تجارت را نیز پوشش دهد؛ منع کلی تجارت از این اطلاعیه نتیجه نمی‌شود.` };
  return { ...context, review_required: context.review_required || needsSourceReview(context.sources, now) };
}
