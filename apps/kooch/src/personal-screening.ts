import { catalogPolicy, catalogSchema } from './catalog';
import { countries, factTitle, isPriorHistoryFact } from './policy';
import { iranContext } from './iran-context';
import { readinessDefinitions, readinessSchema } from './readiness-registry';
import { routeReadiness } from './route-readiness';
import type { Answers } from './questions';

export const screeningLabels = {
  reported_checks_ready: 'موارد بررسی‌شده با پاسخ تو سازگارند',
  preparation_needed: 'طبق پاسخ تو، آماده‌سازی لازم دارد',
  needs_information: 'برای بررسی شرایط تو، پاسخ بیشتری لازم است',
  restricted_context: 'محدودیت یا سابقهٔ خاص باید بررسی شود',
  needs_source_review: 'شواهد تازه برای ارزیابی شخصی کافی نیست',
  not_evaluated: 'قواعد ارزیابی فردی این مسیر هنوز پوشش ندارند',
} as const;
export type ScreeningStatus = keyof typeof screeningLabels;

export function screenPersonalRoutes(answers: Answers, input: unknown, now: Date, options: { readiness?: unknown; blockedRouteIds?: readonly string[] } = {}) {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) return null;
  const catalog = parsed.data;
  const registry = readinessSchema.safeParse(options.readiness ?? readinessDefinitions);
  const reviewedIds = new Set(registry.success ? registry.data.routes.map(route => route.route_id) : []);
  const counts: Record<ScreeningStatus, number> = { reported_checks_ready: 0, preparation_needed: 0, needs_information: 0, restricted_context: 0, needs_source_review: 0, not_evaluated: 0 };
  const catalogCurrent = Date.parse(catalog.retrieved_at) <= now.getTime() && now.getTime() - Date.parse(catalog.retrieved_at) <= 14 * 86400000;
  // Enumerate first. Neither purpose nor destination preferences may prune the universe.
  const routes = catalog.routes.map(record => {
    const policy = catalogPolicy(record);
    const context = iranContext(record, catalog, now);
    const detail = reviewedIds.has(record.id) ? routeReadiness(registry.success ? registry.data : null, record.id, answers.facts, now, answers.fact_versions) : null;
    const missing = policy?.requires.filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown').map(factTitle) ?? [];
    let status: ScreeningStatus = 'not_evaluated';
    let reasons = ['برای این مسیر هنوز مجموعهٔ کافی از شروط اختصاصی و نگاشت آن‌ها به مشخصات تو ثبت نشده است.'];
    let missingInformation = missing.length ? missing : ['شروط اختصاصی مسیر و اطلاعات فردی لازم برای آن باید از منبع رسمی روشن شوند.'];
    if (!context.ordinary) {
      status = context.review_required ? 'needs_source_review' : 'restricted_context';
      reasons = [context.note];
    } else if (options.blockedRouteIds?.includes(record.id)) {
      status = 'needs_source_review'; reasons = ['شواهد این مسیر در صف بازبینی است؛ از آن نتیجهٔ فردی نمی‌گیریم.'];
    } else if (detail) {
      status = detail.needs_review ? 'needs_source_review' : detail.counts.action_needed ? 'preparation_needed' : detail.counts.needs_information ? 'needs_information' : 'reported_checks_ready';
      reasons = detail.checks.map(check => `${check.question} ${check.state === 'reported_ready' ? 'پاسخ تو: بله.' : check.state === 'action_needed' ? 'پاسخ تو: خیر؛ آماده‌سازی لازم است.' : check.state === 'needs_information' ? 'پاسخ تو هنوز روشن نیست.' : 'منبع یا نسخهٔ پاسخ نیازمند بازبینی است.'}`);
      missingInformation = detail.checks.filter(check => check.state !== 'reported_ready').map(check => check.question);
    } else if (!catalogCurrent || Date.parse(record.source.lastVerified) > now.getTime() || now.getTime() - Date.parse(record.source.lastVerified) > 14 * 86400000) {
      status = 'needs_source_review'; reasons = ['تاریخ بررسی ثبت‌شدهٔ منبع گذشته است؛ وجود رکورد برای نتیجه‌گیری دربارهٔ شرایط تو کافی نیست.'];
    } else if (policy?.requires.some(id => isPriorHistoryFact(id) && answers.facts[id] !== 'yes')) {
      status = 'needs_information'; reasons = ['سابقهٔ تحصیل، کار یا وضعیت قبلیِ موردنیاز این مسیر در پاسخ‌های تو روشن نشده است.'];
    }
    counts[status]++;
    return { id: record.id, title: record.name_fa, destination: record.destination, country: countries[record.destination]?.name ?? record.destination,
      flag: countries[record.destination]?.flag ?? '', category: record.category, goal: policy?.goal ?? null, status, reasons,
      missing_information: missingInformation, official_eligibility: 'UNKNOWN' as const,
      source_urls: [...new Set([record.source.url, ...(detail?.sources.map(source => source.url) ?? context.sources.map(source => source.url))])],
      source_checked_on: detail?.sources.map(source => source.checked_on).sort()[0] ?? record.source.lastVerified,
      reviewed_check_count: detail?.checks.length ?? 0 };
  });
  const priority: Record<ScreeningStatus, number> = { reported_checks_ready: 0, preparation_needed: 1, needs_information: 2, restricted_context: 3, needs_source_review: 4, not_evaluated: 5 };
  routes.sort((a, b) => priority[a.status] - priority[b.status] || Number(b.goal === answers.goal) - Number(a.goal === answers.goal) || Number(answers.destinations.includes(b.destination)) - Number(answers.destinations.includes(a.destination)) || a.id.localeCompare(b.id));
  return { version: 'global-personal-screening-1', scope: 'all_indexed_destinations_and_routes' as const,
    total: routes.length, destinations: new Set(routes.map(route => route.destination)).size, counts, routes,
    complete_global_eligibility: false as const, reviewed_routes: routes.filter(route => route.reviewed_check_count > 0).length,
    // Do not pretend the broad intake bands have decisive route rules behind them.
    unassessed_profile_fields: ['age', 'education', 'work', 'language', 'budget', 'timeline'],
    consumed_profile_fields: ['facts', 'fact_versions'], preference_fields: ['goal', 'destinations'],
  };
}
export type PersonalScreening = NonNullable<ReturnType<typeof screenPersonalRoutes>>;
