import { z } from 'zod';
import { catalogSchema, catalogPolicy, catalogSummary } from './catalog';
import { iranContext } from './iran-context';
import { emptyAnswers } from './questions';
import { readinessDefinitionsFor } from './readiness-registry';
import { routeAvailability } from './route-readiness';
export const catalogCategories: Record<string, string> = { 'work-sponsored': 'کار با کارفرما', 'work-unsponsored': 'کار بدون حمایت کارفرما', 'skilled-migration': 'مهاجرت مهارتی', 'digital-nomad': 'دورکاری', 'intra-company': 'انتقال درون‌شرکتی', 'youth-mobility': 'کار و سفر جوانان', study: 'تحصیل', family: 'خانواده', entrepreneur: 'کارآفرینی', investor: 'سرمایه‌گذاری', 'citizenship-by-investment': 'تابعیت با سرمایه‌گذاری', 'citizenship-by-descent': 'تابعیت با تبار', humanitarian: 'حمایت بشردوستانه', 'short-term-business': 'سفر و فعالیت کوتاه‌مدت', 'residence-general': 'اقامت و وضعیت‌های دیگر' };
export function browseCatalog(input: unknown, params: URLSearchParams, now: Date, blockedRouteIds: readonly string[] = []) {
  const catalog = catalogSchema.safeParse(input);
  if (!catalog.success || Date.parse(catalog.data.retrieved_at) > now.getTime()) return { status: 503, body: { message: 'کاتالوگ معتبر در دسترس نیست.' } };
  const schema = z.object({ destination: z.string().max(8).default(''), q: z.string().trim().max(120).default(''), category: z.string().max(60).default(''), offset: z.coerce.number().int().min(0).max(2000).default(0), limit: z.coerce.number().int().min(1).max(50).default(12) });
  const parsed = schema.safeParse(Object.fromEntries([...params].filter(([key]) => key !== 'catalog')));
  if (!parsed.success) return { status: 400, body: { message: 'فیلتر یا شمارهٔ صفحه معتبر نیست.' } };
  const filter = parsed.data, data = catalog.data;
  if (filter.destination && !data.destinations[filter.destination] || filter.category && !catalogCategories[filter.category]) return { status: 400, body: { message: 'مقصد یا گروه مسیر شناخته‌شده نیست.' } };
  const normalize = (text: string) => text.toLowerCase().replaceAll('ي', 'ی').replaceAll('ك', 'ک').replaceAll('‌', ' ');
  const matching = data.routes.filter(r => (!filter.destination || r.destination === filter.destination) && (!filter.category || r.category === filter.category) && (!filter.q || normalize(`${r.name} ${r.name_fa} ${r.slug} ${data.destinations[r.destination].name} ${data.destinations[r.destination].official_name}`).includes(normalize(filter.q)))).sort((a, b) => a.id.localeCompare(b.id));
  const items = matching.slice(filter.offset, filter.offset + filter.limit).map(record => {
    const blocked = blockedRouteIds.includes(record.id) || Boolean(data.source_monitor?.blocked_route_ids.includes(record.id)) || Boolean(data.official_supplement_conflicts?.includes(record.id));
    const policy = catalogPolicy(record), iran = iranContext(record, data, now);
    const availability = routeAvailability(readinessDefinitionsFor(now), record.id, now);
    const summary = catalogSummary(record, policy ?? { goal: 'work', requires: [], prerequisite: 'این رکورد یک مرجع کاتالوگ است؛ نوع مجوز، شرایط اختصاصی و امکان اقدام ایرانیان باید جدا بررسی شوند.' }, emptyAnswers);
    return { ...summary, origin: record.origin ?? 'visa_atlas', category: catalogCategories[record.category] ?? record.category, category_id: record.category, policy_goal: blocked || availability ? null : policy?.goal ?? null,
      official_summary: record.summary, iran_status: availability?.state ?? iran.status, ordinary: !blocked && !availability && iran.ordinary,
      channel_note: blocked ? 'شواهد این مسیر در صف بازبینی است؛ از این رکورد برای نتیجهٔ جاری استفاده نمی‌شود.' : availability ? `${availability.reason_fa}${availability.current ? '' : ' منبع محدودیت نیازمند بازبینی است.'}` : iran.note, application_method: blocked ? 'شواهد نیازمند بازبینی' : availability ? 'محدودیت پذیرش؛ شرایط همین برنامه بررسی شود' : iran.method, sources: [...summary.sources, ...iran.sources, ...(availability?.sources ?? [])],
      prior_history_required: policy?.requires.some(id => /\.(local_study|local_work|prior_status)$/.test(id)) ?? false };
  });
  return { status: 200, body: { total: matching.length, offset: filter.offset, limit: filter.limit,
    next_offset: filter.offset + filter.limit < matching.length ? filter.offset + filter.limit : null,
    items, categories: catalogCategories, catalog_total: data.routes.length, countries_total: Object.keys(data.destinations).length,
    retrieved_at: data.retrieved_at, license: data.license, license_url: data.license_url, official_supplement_version: data.official_supplement_version ?? null,
    review_required: now.getTime() - Date.parse(data.retrieved_at) > 14 * 86400000, coverage: 'catalog_only', note: 'تمام رکوردهای منبع برای مرور؛ وجود رکورد، امکان اقدام ایرانی یا احراز شرایط فردی نیست.' } };
}
