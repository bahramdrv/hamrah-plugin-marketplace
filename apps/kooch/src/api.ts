import { canadaCardFacts } from './report/canada-card';
import { answersSchema, questions, type Answers } from './questions';
import { channelState, snapshotSchema, type PublicRoute } from './snapshot';
import { countries, facts, goalLabels, policies, policyVersion, priorHistoryFacts, preparationSteps, factTitle, isPriorHistoryFact } from './policy';
import type { RetrievalStatus } from './retrieval';
import { iranContext } from './iran-context';
import { browseCatalog } from './catalog-browser-api';
import { buildJourney } from './journey';
import { readinessDefinitions, readinessSchema } from './readiness-registry';
import { routeReadiness, focusedReadinessQuestions } from './route-readiness';
import { catalogSchema, catalogPolicy, catalogSummary, type DiscoveryRoute } from './catalog';

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createCompassApi(options: { snapshot: unknown; catalog?: unknown; readiness?: unknown; blockedRouteIds?: readonly string[]; now?: () => Date; retrieval?: RetrievalStatus }) {

  return {
    async GET(request?: Request) {
      if (request && new URL(request.url).searchParams.get('catalog') === '1') {
        const result = browseCatalog(options.catalog, new URL(request.url).searchParams, (options.now ?? (() => new Date()))(), options.blockedRouteIds);
        return response(result.body, result.status);
      }
      const result = evaluateCompass(answersSchema.parse({}), options);
      return response({ questions, countries, goalLabels, data: result, retrieval: options.retrieval }, 'error' in result ? 503 : 200);
    },
    async POST(request: Request) {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'invalid_input', message: 'پاسخ‌ها باید به صورت JSON فرستاده شوند.' }, 415);
      const origin = request.headers.get('origin');
      if (origin) {
        // Next may reconstruct request.url with localhost; Host preserves the browser destination.
        try {
          const parsed = new URL(origin);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== (request.headers.get('host') ?? new URL(request.url).host)) throw new Error();
        } catch { return response({ error: 'invalid_origin', message: 'درخواست باید از همین اپ ارسال شود.' }, 403); }
      }
      let body: unknown;
      try {
        // Bound the stream before decoding; guest answers are never logged or persisted.
        const reader = request.body?.getReader();
        if (!reader) return response({ error: 'invalid_input', message: 'پاسخ‌ها دریافت نشد.' }, 400);
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 16000) { await reader.cancel(); return response({ error: 'invalid_input', message: 'حجم پاسخ بیش از حد مجاز است.' }, 413); }
          chunks.push(value);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { return response({ error: 'invalid_input', message: 'پاسخ‌ها خوانا نیستند؛ دوباره تلاش کن.' }, 400); }
      const answers = answersSchema.safeParse(body);
      if (!answers.success) return response({ error: 'invalid_input', message: 'یکی از پاسخ‌ها معتبر نیست؛ پاسخ‌ها را مرور کن.' }, 400);
      const result = evaluateCompass(answers.data, options);
      return response(result, 'error' in result ? 503 : 200);
    },
  };
}


export function evaluateCompass(answers: Answers, options: { snapshot: unknown; catalog?: unknown; readiness?: unknown; blockedRouteIds?: readonly string[]; now?: () => Date }) {
    const now = options.now ?? (() => new Date());
    const parsed = snapshotSchema.safeParse(options.snapshot);
    if (!parsed.success || (parsed.success && Date.parse(parsed.data.retrieved_at) > now().getTime()))
      return { error: 'invalid_snapshot', message: 'دادهٔ معتبر شروع از ایران در دسترس نیست؛ دریافت و بررسی تازه لازم است.' };
    const snapshot = parsed.data;
    const current = snapshot.routes.filter(r => channelState(r, snapshot, now()) === 'current');
    const expired = snapshot.routes.filter(r => channelState(r, snapshot, now()) === 'expired').length;
    const eligibleGoal = (r: PublicRoute) => policies[r.id] && (answers.goal === 'unknown' || policies[r.id].goal === answers.goal);
    const relevant = current.filter(r => eligibleGoal(r) && (!answers.destinations.length || answers.destinations.includes(r.destination)));
    const pending = relevant.filter(r => !policies[r.id].requires.some(id =>
      (priorHistoryFacts.has(id) && answers.facts[id] !== 'yes') ||
      (answers.facts[id] === 'no' && !preparationSteps[id])));
    const ready = pending.filter(r => policies[r.id].requires.every(id => answers.facts[id] === 'yes'));
    // Ordering expresses stated destination/goal preferences only, never visa likelihood.
    const ordered = [...pending].sort((a, b) => {
      const pref = (code: string) => answers.destinations.length ? answers.destinations.indexOf(code) : 0;
      const reported = (route: PublicRoute) => policies[route.id].requires.every(id => answers.facts[id] === 'yes') ? 0 : 1;
      return Number(b.id === answers.focus_route) - Number(a.id === answers.focus_route) || pref(a.destination) - pref(b.destination) || reported(a) - reported(b) || a.id.localeCompare(b.id);
    });
    const missingFacts = [...new Set(relevant.flatMap(r => policies[r.id].requires).filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown'))];
    const routes: DiscoveryRoute[] = ordered.slice(0, 5).map(r => {
      const remaining = policies[r.id].requires.filter(id => answers.facts[id] !== 'yes');
      const today = now().toISOString().slice(0, 10);
      const routeFacts = r.id === 'ca:study-permit-ca' ? canadaCardFacts(now()) : r.facts.filter(fact => fact.sources.every(source => source.checked_on <= today && Date.parse(today) - Date.parse(source.checked_on) <= 14 * 86400000));
      return {
      id: r.id, name_fa: r.name_fa, official_name: r.name, destination: r.destination,
      country: countries[r.destination]?.name ?? r.destination, flag: countries[r.destination]?.flag ?? '',
      category: goalLabels[policies[r.id].goal], page_url: r.page_url,
      reason: answers.goal === 'unknown' ? 'برای آشنایی و بررسی بیشتر؛ هدف تو هنوز مشخص نیست.' : `مرتبط با هدف «${goalLabels[policies[r.id].goal]}» تو.`,
      summary: r.summary_fa ?? policies[r.id].prerequisite,
      facts: routeFacts,
      preparation_status: remaining.length ? 'preparation_needed' : 'prerequisites_reported',
      next_step: remaining.length ? remaining.map(id => preparationSteps[id] ?? `این پیش‌نیاز را روشن کن: ${policies[r.id].prerequisite}`).join(' ') : 'مدارک، زبان، هزینه‌ها و سایر شروط این مسیر را بررسی کن.',
      application_method: r.application.start_from_iran === 'online' ? 'شروع آنلاین' : 'درخواست از نمایندگی در ایران',
      prerequisite: policies[r.id].prerequisite, coverage: 'application_channel_reviewed',
      coverage_label: 'روش اقدام بررسی‌شده؛ شرایط فردی ارزیابی نشده',
      checked_on: r.application.evidence_checked_on, valid_until: r.application.valid_until,
      channel_note: r.application.reason_fa, followup: r.application.in_person_followup_fa ?? null,
      sources: r.application.source_ids.map(id => snapshot.sources[id]),
    }; });
    const parsedCatalog = catalogSchema.safeParse(options.catalog);
    const catalog = parsedCatalog.success && Date.parse(parsedCatalog.data.retrieved_at) <= now().getTime() ? parsedCatalog.data : null;
    const routePolicies = { ...policies };
    const restrictedRoutes: DiscoveryRoute[] = [];
    const catalogCurrent = catalog && now().getTime() - Date.parse(catalog.retrieved_at) <= 14 * 86400000;
    const globalCandidates = (catalogCurrent ? catalog.routes : undefined)?.flatMap(record => {
      if (options.blockedRouteIds?.includes(record.id) || snapshot.routes.some(r => r.id === record.id) || (answers.destinations.length && !answers.destinations.includes(record.destination))) return [];
      const policy = catalogPolicy(record);
      if (!policy || (answers.goal !== 'unknown' && policy.goal !== answers.goal)) return [];
      routePolicies[record.id] = policy;
      const iran = iranContext(record, catalog!, now());
      if (!iran.ordinary) {
        const restricted = catalogSummary(record, policy, answers);
        restrictedRoutes.push({ ...restricted, preparation_status: iran.status, channel_note: iran.note, application_method: iran.method, sources: [...restricted.sources, ...iran.sources] });
        return [];
      }
      if (policy.requires.some(id => isPriorHistoryFact(id) && answers.facts[id] !== 'yes')) return [];
      return [{ record, policy }];
    }).sort((a, b) => {
      const pref = (code: string) => answers.destinations.length ? answers.destinations.indexOf(code) : 0;
      return Number(b.record.id === answers.focus_route) - Number(a.record.id === answers.focus_route) || pref(a.record.destination) - pref(b.record.destination) || a.record.id.localeCompare(b.record.id);
    }) ?? [];
    if (globalCandidates.some(r => r.record.id === answers.focus_route) && routes.length === 5) routes.pop();
    const remainingSlots = Math.max(0, 5 - routes.length);
    routes.push(...globalCandidates.slice(0, remainingSlots).map(({ record, policy }) => {
      const summary = catalogSummary(record, policy, answers); const iran = iranContext(record, catalog!, now());
      return { ...summary, application_method: iran.method, channel_note: `${summary.channel_note} ${iran.note}`, sources: [...summary.sources, ...iran.sources] };
    }));
    routes.sort((a, b) => Number(b.id === answers.focus_route) - Number(a.id === answers.focus_route));
    const focusedRecord = catalog?.routes.find(record => record.id === answers.focus_route && !options.blockedRouteIds?.includes(record.id) && (!answers.destinations.length || answers.destinations.includes(record.destination)));
    const focusedPolicy = focusedRecord ? catalogPolicy(focusedRecord) : null;
    const focusPolicy = focusedPolicy && (answers.goal === 'unknown' || focusedPolicy.goal === answers.goal) && iranContext(focusedRecord!, catalog!, now()).ordinary ? focusedPolicy : null;
    const readiness = readinessSchema.safeParse(options.readiness ?? readinessDefinitions);
    const focusedChecks = readiness.success && focusPolicy ? focusedReadinessQuestions(readiness.data, answers.focus_route) : [];
    for (const route of routes) {
      const detail = routeReadiness(options.readiness ?? readinessDefinitions, route.id, answers.facts, now(), answers.fact_versions);
      if (detail) { route.readiness = detail; route.next_step = detail.next_action?.detail ?? 'موارد ثبت‌شده را با مدارک و مرجع رسمی تطبیق بده؛ پاسخ خوداظهاری، تأیید احراز شرایط نیست.'; }
    }
    const prerequisiteIds = catalog ? [...new Set([...(focusPolicy?.requires ?? []), ...focusedChecks.map(check => check.answer_id), ...routes.flatMap(r => routePolicies[r.id].requires)])] : [...new Set(relevant.flatMap(r => policies[r.id].requires))];
    const unknowns = questions.filter(q => q.id === 'budget' ? answers.budget === null : q.id === 'destinations' ? !answers.destinations.length : answers[q.id as keyof Answers] === 'unknown').map(q => q.title);
    const nextSteps = [
      answers.age === 'unknown' ? 'سن دقیق را برای بررسی شرط سنی آماده کن.' : 'شرط سن هر مسیر باید با سن دقیق تو بررسی شود.',
      answers.education === 'unknown' ? 'مدرک تحصیلی‌ات را برای قدم بعد مشخص کن.' : 'عنوان، رشته و شناسایی مدرک را با شروط مسیر تطبیق بده.',
      answers.work === 'unknown' ? 'نوع شغل و مدت سابقهٔ کارت هنوز نامعلوم است.' : 'نوع شغل، وضعیت اشتغال و مدت سابقه را با شروط مسیر تطبیق بده.',
      answers.language === 'certified' ? 'نوع، نمره و اعتبار مدرک زبان را با شرط رسمی مسیر مقایسه کن.' : 'سطح و مدرک زبان موردنیاز هر مسیر را بررسی کن.',
      answers.budget ? `بودجهٔ خوداظهاری ${answers.budget.amount.toLocaleString('fa-IR')} ${answers.budget.currency} است؛ هزینه و تمکن مسیر جدا بررسی می‌شوند.` : 'بودجه و ارز هنوز مشخص نیست؛ دربارهٔ توان مالی نتیجه‌ای نمی‌دهیم.',
      answers.timeline === 'under-6' ? 'برای افق کمتر از شش ماه، وقت، مدارک و زمان رسمی بررسی را پیش از اقدام بررسی کن.' : 'زمان آماده‌سازی و رسیدگی رسمی را برای برنامهٔ زمانی خودت جدا بررسی کن.',
    ];
    const status = routes.length ? 'routes_to_investigate' : restrictedRoutes.length ? 'restricted_context' : current.length ? 'no_matches' : (expired ? 'review_required' : 'no_coverage');
    const focusedReadiness = focusPolicy ? routeReadiness(options.readiness ?? readinessDefinitions, answers.focus_route!, answers.facts, now(), answers.fact_versions) : null;
    const reviewAnswers = focusedReadiness?.checks.filter(check => check.state_reason === 'answer_version_changed').map(check => check.answer_id) ?? [];
    const journey = buildJourney(answers, routes.map(r => r.id), status, prerequisiteIds, routePolicies, reviewAnswers);
    const focusReadiness = routes.find(route => route.id === answers.focus_route)?.readiness;
    if (focusReadiness?.next_action) journey.guidance.main_action = focusReadiness.next_action.detail;
    for (const question of journey.interview.questions) {
      const check = focusedChecks.find(check => check.answer_id === question.id);
      if (check) { question.title = check.question; question.help = check.reason; question.answer_version = focusedReadiness?.version; }
    }
    return {
      status, ...journey,
      no_match_reason: relevant.length ? 'prerequisite_required' : 'coverage_gap',
      official_eligibility: 'not_assessed', policy_version: policyVersion,
      routes, restricted_routes: restrictedRoutes, omitted_by_limit: Math.max(0, ordered.length + globalCandidates.length - 5), needs_information: pending.length - ready.length,
      questions: (catalog ? prerequisiteIds.filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown') : missingFacts).map(id => ({ id, title: factTitle(id) })),
      editable_questions: prerequisiteIds.map(id => ({ id, title: factTitle(id) })),
      global_coverage: catalog ? { countries: Object.keys(catalog.destinations).length, routes: catalog.routes.length, status: catalogCurrent ? 'retrieved' : 'stale', research_candidates: globalCandidates.length, retrieved_at: catalog.retrieved_at } : null,
      unknowns, next_steps: nextSteps,
      coverage: { ...snapshot.coverage, current: current.length, expired, excluded: snapshot.total - current.length - expired,
        without_discovery_policy: current.filter(r => !policies[r.id]).length },
      evidence: { source_url: snapshot.source_url, retrieved_at: snapshot.retrieved_at,
        earliest_expiry: current.map(r => r.application.valid_until).sort()[0] ?? null,
        provider: snapshot.provider, provider_url: snapshot.provider_url, license: snapshot.license, license_url: snapshot.license_url,
        snapshot_version: `${snapshot.schema_version}:${snapshot.retrieved_at}` },
    };
  }
export type CompassResult = Exclude<ReturnType<typeof evaluateCompass>, { error: string }>;
export type CompassConfig = { questions: typeof questions; countries: typeof countries; goalLabels: typeof goalLabels; data: ReturnType<typeof evaluateCompass> };
