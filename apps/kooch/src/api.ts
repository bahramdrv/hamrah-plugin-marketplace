import { canadaCardFacts } from './report/canada-card';
import { answersSchema, questions, type Answers } from './questions';
import { channelState, snapshotSchema, type PublicRoute } from './snapshot';
import { countries, facts, goalLabels, policies, policyVersion, priorHistoryFacts, preparationSteps, factTitle, isPriorHistoryFact } from './policy';
import type { RetrievalStatus } from './retrieval';
import { iranContext } from './iran-context';
import { browseCatalog } from './catalog-browser-api';
import { buildJourney } from './journey';
import { readinessDefinitionsFor, readinessSchema } from './readiness-registry';
import { routeReadiness, routeAvailability, focusedReadinessQuestions } from './route-readiness';
import { catalogSchema, catalogPolicy, catalogSummary, type DiscoveryRoute } from './catalog';
import { screenPersonalRoutes } from './personal-screening';
import { screeningProfile, type ScreeningProfile } from './profile-constraints';

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


export function evaluateCompass(answers: Answers, options: { snapshot: unknown; catalog?: unknown; readiness?: unknown; blockedRouteIds?: readonly string[]; now?: () => Date; profile?: ScreeningProfile }) {
    const now = options.now ?? (() => new Date());
    const monitorCatalog = catalogSchema.safeParse(options.catalog);
    options = { ...options, blockedRouteIds: [...new Set([...(options.blockedRouteIds ?? []), ...(monitorCatalog.success ? monitorCatalog.data.source_monitor?.blocked_route_ids ?? [] : [])])] };
    const parsed = snapshotSchema.safeParse(options.snapshot);
    if (!parsed.success || (parsed.success && Date.parse(parsed.data.retrieved_at) > now().getTime()))
      return { error: 'invalid_snapshot', message: 'دادهٔ معتبر شروع از ایران در دسترس نیست؛ دریافت و بررسی تازه لازم است.' };
    const snapshot = parsed.data;
    const current = snapshot.routes.filter(r => !options.blockedRouteIds?.includes(r.id) && channelState(r, snapshot, now()) === 'current');
    const expired = snapshot.routes.filter(r => channelState(r, snapshot, now()) === 'expired').length;
    const eligibleGoal = (r: PublicRoute) => policies[r.id] && (answers.goal === 'unknown' || policies[r.id].goal === answers.goal || r.id === answers.focus_route);
    const relevant = current.filter(r => eligibleGoal(r) && (!answers.destinations.length || answers.destinations.includes(r.destination) || r.id === answers.focus_route));
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
    const routes: DiscoveryRoute[] = ordered.map(r => {
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
    const readinessInput = options.readiness ?? readinessDefinitionsFor(now());
    const readiness = readinessSchema.safeParse(readinessInput);
    const restrictedRoutes: DiscoveryRoute[] = [];
    const catalogCurrent = catalog && now().getTime() - Date.parse(catalog.retrieved_at) <= 14 * 86400000;
    const globalCandidates = catalog?.routes.flatMap(record => {
      if (options.blockedRouteIds?.includes(record.id) || snapshot.routes.some(r => r.id === record.id) || (answers.destinations.length && !answers.destinations.includes(record.destination) && record.id !== answers.focus_route)) return [];
      const policy = catalogPolicy(record);
      if (!policy || (answers.goal !== 'unknown' && policy.goal !== answers.goal && record.id !== answers.focus_route)) return [];
      routePolicies[record.id] = policy;
      const availability = readiness.success ? routeAvailability(readiness.data, record.id, now()) : null;
      if (availability) {
        const restricted = catalogSummary(record, policy, answers);
        restrictedRoutes.push({ ...restricted, preparation_status: availability.state, channel_note: `${availability.reason_fa}${availability.current ? '' : ' منبع این محدودیت نیازمند بازبینی تازه است.'}`, application_method: 'امکان اقدام تازه نیازمند بررسی محدودیت برنامه', sources: availability.sources });
        return [];
      }
      const iran = iranContext(record, catalog!, now());
      if (!iran.ordinary) {
        const restricted = catalogSummary(record, policy, answers);
        restrictedRoutes.push({ ...restricted, preparation_status: iran.status, channel_note: iran.note, application_method: iran.method, sources: [...restricted.sources, ...iran.sources] });
        return [];
      }
      if (policy.requires.some(id => isPriorHistoryFact(id) && answers.facts[id] !== 'yes')) {
        const restricted = catalogSummary(record, policy, answers);
        restrictedRoutes.push({ ...restricted, preparation_status: 'prior_history_required', channel_note: `این مسیر به سابقهٔ تحصیل، کار یا وضعیت قبلی در مقصد وابسته است؛ آن سابقه در پاسخ‌ها تأیید نشده و مسیر به‌عنوان شروع معمول از ایران پیشنهاد نمی‌شود. ${iran.note}`, application_method: iran.method, sources: [...restricted.sources, ...iran.sources] });
        return [];
      }
      return [{ record, policy }];
    }).sort((a, b) => {
      const pref = (code: string) => answers.destinations.length ? answers.destinations.indexOf(code) : 0;
      return Number(b.record.id === answers.focus_route) - Number(a.record.id === answers.focus_route) || pref(a.record.destination) - pref(b.record.destination) || a.record.id.localeCompare(b.record.id);
    }) ?? [];
    routes.push(...globalCandidates.map(({ record, policy }) => {
      const summary = catalogSummary(record, policy, answers); const iran = iranContext(record, catalog!, now());
      return { ...summary, application_method: iran.method, channel_note: `${summary.channel_note} ${iran.note}`, sources: [...summary.sources, ...iran.sources] };
    }));
    const preference = (code: string) => answers.destinations.length ? answers.destinations.indexOf(code) : 0;
    routes.sort((a, b) => Number(b.id === answers.focus_route) - Number(a.id === answers.focus_route) || preference(a.destination) - preference(b.destination));
    const matchingRoutes = [...routes];
    // Keep the interview bounded, while retaining every match for browsing and saving.
    // Represent destinations before repeating a country's routes in the brief overview.
    const represented = new Set<string>();
    const diverse = routes.filter(route => { if (represented.has(route.destination)) return false; represented.add(route.destination); return true; });
    const briefing = [...new Set([...diverse, ...routes])].filter(route => catalogCurrent || route.coverage === 'application_channel_reviewed').slice(0, 5);
    if (answers.focus_route) {
      const focused = matchingRoutes.find(route => route.id === answers.focus_route);
      if (focused && (catalogCurrent || focused.coverage === 'application_channel_reviewed') && !briefing.includes(focused)) briefing.splice(4, 1, focused);
      briefing.sort((a, b) => Number(b.id === answers.focus_route) - Number(a.id === answers.focus_route));
    }
    routes.splice(0, routes.length, ...briefing);
    const focusedRecord = catalog?.routes.find(record => record.id === answers.focus_route && !options.blockedRouteIds?.includes(record.id));
    const focusedPolicy = focusedRecord ? catalogPolicy(focusedRecord) : null;
    const focusAllowed = Boolean(focusedRecord && iranContext(focusedRecord, catalog!, now()).ordinary && !(readiness.success && routeAvailability(readiness.data, focusedRecord.id, now())));
    const focusPolicy = focusAllowed ? focusedPolicy : null;
    const focusedChecks = readiness.success && focusAllowed ? focusedReadinessQuestions(readiness.data, answers.focus_route) : [];
    for (const route of routes) {
      const detail = routeReadiness(readinessInput, route.id, answers.facts, now(), answers.fact_versions, options.profile ?? screeningProfile(answers));
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
    const focusedReadiness = focusAllowed ? routeReadiness(readinessInput, answers.focus_route!, answers.facts, now(), answers.fact_versions, options.profile ?? screeningProfile(answers)) : null;
    const reviewAnswers = focusedReadiness?.checks.filter(check => ['answer_version_changed', 'profile_answer_conflict'].includes(check.state_reason)).map(check => check.answer_id) ?? [];
    const derivedFacts = Object.fromEntries((focusedReadiness?.checks ?? []).filter(check => check.state_reason === 'profile_criterion').map(check => [check.answer_id, check.state === 'reported_ready' ? 'yes' as const : 'no' as const]));
    const journey = buildJourney({ ...answers, facts: { ...answers.facts, ...derivedFacts } }, routes.map(r => r.id), status, prerequisiteIds, routePolicies, reviewAnswers);
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
      routes, matching_routes: matchingRoutes, restricted_routes: restrictedRoutes, omitted_by_limit: Math.max(0, matchingRoutes.length - routes.length), needs_information: pending.length - ready.length,
      personal_screening: screenPersonalRoutes(answers, catalog, now(), { readiness: readinessInput, blockedRouteIds: options.blockedRouteIds, profile: options.profile ?? screeningProfile(answers) }),
      source_monitor: catalog?.source_monitor ?? null,
      destination_coverage: answers.destinations.map(code => ({ code, name: countries[code]?.name ?? code,
        catalog: catalog?.routes.filter(route => route.destination === code).length ?? 0,
        matching: matchingRoutes.filter(route => route.destination === code).length,
        restricted: restrictedRoutes.filter(route => route.destination === code).length })),
      questions: (catalog ? prerequisiteIds.filter(id => answers.facts[id] === undefined || answers.facts[id] === 'unknown') : missingFacts).map(id => ({ id, title: factTitle(id) })),
      editable_questions: prerequisiteIds.map(id => ({ id, title: factTitle(id) })),
      global_coverage: catalog ? { countries: Object.keys(catalog.destinations).length, routes: catalog.routes.length, status: catalogCurrent ? 'retrieved' : 'stale', research_candidates: globalCandidates.length, retrieved_at: catalog.retrieved_at,
        refresh: catalog.refresh ?? null, primary_sources_due_review: catalog.routes.filter(route => Date.parse(route.source.lastVerified) + 14 * 86400000 < now().getTime()).length } : null,
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
