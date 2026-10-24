import type { CatalogRecord, DiscoverySource, GlobalCatalog } from './catalog';
export type IranContext = { status: string; ordinary: boolean; note: string; method: string; sources: DiscoverySource[]; review_required: boolean };
const checked = '2026-10-24';
const primary = (id: string, title: string, url: string): DiscoverySource => ({ id, title, url, authority: 'primary', checked_on: checked });
const us = primary('iran:us-10998', 'U.S. Department of State — Proclamation 10998', 'https://travel.state.gov/en/newsroom/visas/2026/suspension-of-visa-issuance-to-foreign-nationals-to-protect-the-security-of-the-united-states.html');
const special: Record<string, { note: string; source: DiscoverySource }> = {
  'nl:daft': { note: 'DAFT بر مبنای تابعیت آمریکا است؛ گذرنامهٔ صرفاً ایرانی مبنای این معاهده نیست. داشتن تابعیت مشمول و شرایط همان مبنا باید جدا بررسی شود؛ مسیر عادی خوداشتغالی هلند برنامهٔ متفاوتی است.', source: primary('iran:nl-daft', 'IND — Self-employed person and treaties', 'https://ind.nl/en/residence-permits/work/residence-permit-self-employed-person') },
  'uk:youth-mobility-scheme': { note: 'تابعیت ایران به‌تنهایی در فهرست Youth Mobility نیست؛ تابعیت مشمول دیگر و شروط همان برنامه باید جدا احراز شوند.', source: primary('iran:uk-yms', 'GOV.UK — YMS eligible nationals', 'https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-youth-mobility-scheme-eligible-nationals') },
  'au:working-holiday': { note: 'گذرنامهٔ صرفاً ایرانی در جدول مجاز Working Holiday نیست؛ داشتن گذرنامهٔ مشمول دیگر و شروط همان زیرگروه باید بررسی شود.', source: primary('iran:au-whm', 'Australia — LIN 26/048', 'https://www.legislation.gov.au/F2026L00878/asmade/2026-06-30/text/original/pdf') },
  'nz:working-holiday-nz': { note: 'تابعیت ایران به‌تنهایی در فهرست Working Holiday نیوزیلند نیست؛ تابعیت مشمول دیگر و سهمیهٔ همان برنامه لازم است.', source: primary('iran:nz-whm', 'INZ — Working Holiday eligibility', 'https://www.immigration.govt.nz/work/working-holiday-visas/who-can-apply-for-a-working-holiday-visa/') },
};
export function iranContext(route: CatalogRecord, catalog: GlobalCatalog, now: Date): IranContext {
  const review_required = now.getTime() - Date.parse(checked) > 14 * 86400000 || now.getTime() < Date.parse(checked);
  if (['us', 'pr', 'vi', 'gu', 'mp'].includes(route.destination)) return { status: 'restricted_exception_review', ordinary: false, review_required,
    method: 'محدودیت صدور/ورود؛ بررسی استثنای معتبر لازم است', sources: [us],
    note: `فرمان۱۰۹۹۸ برای اتباع ایران محدودیت صدور و ورود دارد؛ استثناهایی مانند پاسپورت دوم غیرمشمول، اقامت دائم یا وضعیت ویزای معتبر در تاریخ مؤثر نیازمند بررسی دقیق‌اند. این وضعیت FAIL فردی نیست و ثبت درخواست، امکان صدور را اثبات نمی‌کند.${route.slug === 'tn' ? ' TN تابعیت کانادا یا مکزیک می‌خواهد؛ اقامت دائم آن دو کشور کافی نیست.' : route.slug === 'e-2' ? ' ایران مبنای معاهدهٔ E-2 ندارد؛ تابعیت کشور معاهده و شروط همان مبنا باید جدا بررسی شود.' : ''}${review_required ? ' بررسی این محدودیت باید تازه شود.' : ''}` };
  const rule = special[route.id];
  if (rule) return { status: 'eligible_nationality_required', ordinary: false, review_required, sources: [rule.source, ...(route.id === 'au:working-holiday' ? [primary('iran:au-whm462', 'Australia — LIN 26/072', 'https://www.legislation.gov.au/F2026L00883/asmade/2026-06-30/text/original/pdf')] : [])], note: rule.note, method: 'نیازمند تابعیت یا گذرنامهٔ مشمول برنامه' };
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
  if (route.destination === 'de') context = { ...context, sources: [...context.sources, primary('iran:de-tehran', 'سفارت آلمان — فعالیت محدود', 'https://teheran.diplo.de/ir-de/2752046-2752046')], note: `${context.note} ظرفیت نمایندگی محدود است؛ سفر خودسرانه به کشور همسایه مجوز درخواست ایجاد نمی‌کند. ارجاع خانواده به استانبول فقط با هماهنگی رسمی مربوط است.` };
  if (route.destination === 'cz') context = { ...context, sources: [...context.sources, primary('iran:cz-tehran', 'سفارت چک تهران — خدمات ویزا', 'https://mzv.gov.cz/teheran/en/visa_and_consular_information/')], note: `${context.note} تهران فقط دسته‌های اعلام‌شدهٔ تحصیل، پژوهش، خانواده، Blue Card و برنامه‌های شغلی مشخص را می‌پذیرد؛ پذیرش به همهٔ ویزاهای کاری تعمیم ندارد.` };
  return context;
}
