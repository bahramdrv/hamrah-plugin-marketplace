import { z } from 'zod';
import { countries, policies } from '../policy';
import globalCatalog from '../../data/global-catalog.json';
const routeIds = new Set([...Object.keys(policies), ...globalCatalog.routes.map(route => route.id)]);

import { researchTopics, type Topic, type EvidenceCard, type ResearchResult } from './contract';
import { expandCommunityContext } from './community';
export { researchTopics } from './contract';
export type { ResearchResult } from './contract';
type Tool = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const schema = z.object({ route_id: z.string().max(100).refine(id => routeIds.has(id)), topic: z.enum(Object.keys(researchTopics) as [Topic, ...Topic[]]),
  explicit_request: z.boolean().default(false), academic_api: z.literal('hamrah').optional(), field: z.string().trim().min(2).max(120).optional(),
}).strict();
const alpha3 = Object.fromEntries(Object.entries(countries).map(([code, value]) => [code, value.alpha3 ?? code.toUpperCase()]));
const routeAliases: Record<string, string> = { 'de:chancenkarte': 'opportunity_card', 'de:recognition-partnership': 'recognition_partnership', 'de:eu-blue-card': 'eu_blue_card', 'de:skilled-worker-de': 'skilled_worker', 'de:student-de': 'student_masters_taught', 'uk:student': 'student_masters_taught', 'ca:study-permit-ca': 'student_masters_taught' };

function safePublicLink(url: unknown, title: unknown): EvidenceCard['links'] {
  try { const u = new URL(String(url)); return u.protocol === 'https:' && !u.username && !u.password ? [{ title: String(title ?? 'منبع').slice(0, 160), url: u.href }] : []; } catch { return []; }
}

function contextualCards(value: unknown, country: string, slug: string): EvidenceCard[] | null {
  if (!value || typeof value !== 'object') return null;
  const index = z.object({ data: z.object({ rows: z.array(z.object({ destinationIso: z.string(), visaSlug: z.string(), notPublished: z.boolean().optional(), sourceUrl: z.string().optional(), sourceName: z.string().optional() }).passthrough()) }).passthrough() }).safeParse(value);
  if (index.success) return index.data.data.rows.filter(row => row.destinationIso === country && row.visaSlug === slug).map(row => ({ title: 'زمان رسیدگی و امکان برنامه‌ریزی',
    text: row.notPublished ? 'زمان رسیدگی مرکزی برای این مسیر منتشر نشده است؛ زمان و صف نمایندگی مسئول را جدا بررسی کن.' : 'منبع این مسیر اطلاعات زمان رسیدگی دارد؛ رقم جاری و دامنهٔ آن را در صفحهٔ منبع بررسی کن. صف وقت و آماده‌سازی مدارک ممکن است جدا باشند.',
    links: safePublicLink(row.sourceUrl, row.sourceName) }));
  const viability = z.object({ measures: z.object({ irvi: z.object({ score: z.number().min(0).max(100), confidence: z.object({ label: z.string() }).passthrough(), components: z.record(z.string(), z.unknown()).optional() }).passthrough() }), ranking: z.object({ rankable: z.boolean() }).passthrough() }).safeParse(value);
  if (viability.success) {
    const { irvi } = viability.data.measures;
    const confidence = ({ low: 'پایین', moderate: 'متوسط', medium: 'متوسط', high: 'بالا' } as Record<string, string>)[irvi.confidence.label] ?? 'نیازمند بررسی';
    const links = Object.values(irvi.components ?? {}).flatMap(component => {
      const evidence = z.object({ evidence: z.array(z.object({ sourceUrl: z.string().nullable().optional(), sourceName: z.string().optional() }).passthrough()) }).safeParse(component);
      return evidence.success ? evidence.data.evidence.flatMap(source => safePublicLink(source.sourceUrl, source.sourceName)) : [];
    });
    return [{ title: 'شاخص امکان‌پذیری مسیر برای ایرانیان', text: `${irvi.score.toLocaleString('fa-IR')} از ۱۰۰ · اعتماد شواهد: ${confidence}. این عدد احتمال ویزا یا تناسب پروندهٔ شخصی تو نیست.${viability.data.ranking.rankable ? '' : ' شواهد فعلی برای رتبه‌بندی این مسیر کافی نیست.'}`,
      links: [...new Map(links.map(link => [link.url, link])).values()].slice(0, 5) }];
  }
  return null;
}

function incompleteEvidence(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 5) return false;
  if (Array.isArray(value)) return value.some(item => incompleteEvidence(item, depth + 1));
  const r = value as Record<string, unknown>;
  if (typeof r.totalMatches === 'number' && typeof r.resultCount === 'number' && r.totalMatches > r.resultCount ||
      typeof r.total === 'number' && typeof r.returned === 'number' && r.total > r.returned) return true;
  if (['partial', 'unavailable', 'no_coverage', 'missing', 'timeout', 'failed', 'failure', 'error'].includes(String(r.status)) ||
      ['partially_answered', 'unresolved', 'outdated', 'research_required'].includes(String(r.answerType)) || r.truncated === true || r.scanLimited === true ||
      (typeof r.excluded === 'number' && r.excluded > 0) || (typeof r.unknownDeadlineExcluded === 'number' && r.unknownDeadlineExcluded > 0)) return true;
  return ['coverage', 'datasets', 'signalCoverage'].some(key => incompleteEvidence(r[key], depth + 1));
}

const academicDetail = z.object({ opportunity: z.object({ program: z.string().nullable(), institution: z.string(), deadline: z.string().nullable().optional() }).passthrough(),
  evidence: z.array(z.object({ sourceUrl: z.string().nullable(), sourceName: z.string().nullable().optional() }).passthrough()),
  verification: z.object({ deadline: z.object({ status: z.string() }).passthrough(), funding: z.object({ effectiveStatus: z.string() }).passthrough() }).passthrough(),
}).passthrough();
function opportunityCards(values: unknown[]): EvidenceCard[] {
  return values.flatMap(value => {
    const result = academicDetail.safeParse(value); if (!result.success) return [];
    const { opportunity: o, verification: v, evidence } = result.data;
    const links = evidence.flatMap(e => safePublicLink(e.sourceUrl, e.sourceName ?? 'منبع فرصت'));
    const funding = ({ verified: 'تأییدشده در منبع', unknown: 'نامعلوم', unverified: 'تأییدنشده' } as Record<string, string>)[v.funding.effectiveStatus] ?? 'نیازمند بررسی';
    return [{ title: [o.program, o.institution].filter(Boolean).join(' · '), text: `مهلت ثبت‌شده: ${o.deadline ?? 'نامعلوم'} · فاند: ${funding}. بازبودن پذیرش و شرایط فعلی را در منبع همان فرصت بررسی کن.`, links }];
  });
}

function publicCards(value: unknown): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  function walk(item: unknown, depth: number) {
    if (!item || depth > 6 || cards.length >= 12) return;
    if (Array.isArray(item)) { for (const entry of item.slice(0, 12)) walk(entry, depth + 1); return; }
    if (typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const firstText = (keys: string[]) => keys.map(k => record[k]).find(v => typeof v === 'string' && v.trim()) as string | undefined;
    const title = firstText(['canonicalFa', 'titleFa', 'summaryFa', 'name_fa', 'title', 'canonicalEn', 'name', 'program_title']);
    const text = firstText(['explanationFa', 'summaryFa', 'statementFa', 'answerFa', 'summary', 'description', 'statementEn', 'summaryEn', 'detail', 'reason']);
    const links: EvidenceCard['links'] = [];
    const seen = new Set<string>();
    function sources(source: unknown, level: number) {
      if (!source || level > 4 || links.length >= 5) return;
      if (Array.isArray(source)) { source.slice(0, 10).forEach(s => sources(s, level + 1)); return; }
      if (typeof source !== 'object') return;
      const s = source as Record<string, unknown>;
      for (const key of ['url', 'sourceUrl', 'source_url', 'official_program_url', 'claimUrl']) {
        if (typeof s[key] !== 'string') continue;
        try { const u = new URL(s[key]); if (u.protocol === 'https:' && !u.username && !u.password && !seen.has(u.href)) { seen.add(u.href); links.push({ title: String(s.title ?? s.sourceName ?? s.label ?? 'منبع').slice(0, 160), url: u.href }); } } catch { /* source has no usable public URL */ }
      }
      for (const key of ['source', 'primarySource', 'sources', 'citations', 'evidence', 'supporting']) sources(s[key], level + 1);
    }
    sources(record, 0);
    const heading = title ?? (text && links.length ? 'یافتهٔ مرتبط' : undefined);
    if (heading && (text || links.length)) cards.push({ title: heading.slice(0, 240), text: (text ?? '').slice(0, 1600), links });
    for (const key of ['data', 'records', 'datasets', 'signals', 'questions', 'claims', 'statistics', 'opportunities', 'experiences', 'official', 'community', 'characteristics', 'ranked', 'unranked']) walk(record[key], depth + 1);
  }
  walk(value, 0);
  return [...new Map(cards.map(card => [JSON.stringify(card), card])).values()];
}

export function createResearchApi(options: { tool: Tool; now?: () => Date }) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  return { async POST(request: Request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ message: 'درخواست خوانا نیست.' }, 415);
    const origin = request.headers.get('origin');
    try {
      if (!origin || !['https:', 'http:'].includes(new URL(origin).protocol) || new URL(origin).host !== (request.headers.get('host') ?? new URL(request.url).host)) throw Error();
    } catch { return reply({ message: 'از همین صفحه درخواست بده.' }, 403); }
    let input: z.infer<typeof schema>;
    try {
      const reader = request.body?.getReader(); if (!reader) throw Error();
      let raw = ''; let size = 0; const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 2048) { await reader.cancel(); throw Error(); } raw += decoder.decode(chunk.value, { stream: true }); }
      raw += decoder.decode(); input = schema.parse(JSON.parse(raw));
    } catch { return reply({ message: 'درخواست را از گزینه‌های همین مسیر انتخاب کن.' }, 400); }
    if (['academic', 'experiences'].includes(input.topic) && !input.explicit_request) return reply({ message: 'این جست‌وجو فقط با درخواست خودت انجام می‌شود.' }, 400);
    if (input.topic === 'academic' && (input.academic_api !== 'hamrah' || !input.field || /[@\n\r]|(?:\d[\s-]*){7,}/u.test(input.field))) return reply({ message: 'منبع جست‌وجو و رشتهٔ عمومی را مشخص کن؛ اطلاعات شخصی لازم نیست.' }, 400);
    const [country, slug] = input.route_id.split(':');
    const scope = { countryCode: alpha3[country], route: routeAliases[input.route_id] ?? slug.replaceAll('-', '_'), nationality: 'IRN', originCountry: 'IRN' };
    const atlas = { countryCode: country === 'uk' ? 'GB' : country.toUpperCase(), slug, limit: 3 };
    const plans: Record<Topic, [string, Record<string, unknown>][]> = {
      route: [['getRouteFactPack', { countryCode: atlas.countryCode, slug }], ['searchRouteClaims', { ...scope, limit: 3 }]],
      costs: ['getVisaFees', 'getCostToComplete', 'getSalaryThresholds'].map(name => [name, atlas]),
      time: ['getProcessingTimes', 'getProcessingReliability'].map(name => [name, atlas]),
      questions: [['searchCommunityQuestions', { countryCode: scope.countryCode, route: scope.route, limit: 3 }]],
      community: [['searchCommunitySignals', { ...scope, limit: 5 }], ['evaluateCommunityAdjustment', { ...scope, limit: 10 }], ['searchCommunitySignals', { countryCode: scope.countryCode, limit: 3 }]],
      viability: [['getIranianRouteViability', scope], ['getIdealCandidateProfile', scope]],
      statistics: [['searchOfficialApprovalStatistics', { ...scope, limit: 3 }]],
      changes: ['getPolicyUpdates', 'getFactChanges', 'getSourceFreshness'].map(name => [name, atlas]),
      experiences: [['searchIranianLivedExperiences', { ...scope, limit: 3 }]],
      academic: [['searchAcademicOpportunities', { countryCode: scope.countryCode, query: input.field, limit: 3 }]],
    };
    const results = await Promise.allSettled(plans[input.topic].map(([name, args]) => options.tool(name, args)));
    const values = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    let failure = results.some(r => r.status === 'rejected');
    let partial = values.some(value => incompleteEvidence(value));
    // A recurring question is demand. Fetch its evidence-backed answer before presentation.
    if (input.topic === 'questions') {
      const questions = (values[0] as { questions?: { questionId: string }[] } | undefined)?.questions ?? [];
      const answers = await Promise.allSettled(questions.slice(0, 3).map(q => options.tool('answerCommunityQuestion', { questionId: q.questionId })));
      failure ||= answers.some(r => r.status === 'rejected');
      values.length = 0; for (const answer of answers) if (answer.status === 'fulfilled') values.push(answer.value);
    }
    if (input.topic === 'academic') {
      const opportunities = (values[0] as { opportunities?: { opportunityId: string }[] } | undefined)?.opportunities ?? [];
      const details = await Promise.allSettled(opportunities.slice(0, 3).map(o => options.tool('getAcademicOpportunity', { opportunityId: o.opportunityId })));
      failure ||= details.some(r => r.status === 'rejected');
      values.length = 0; for (const detail of details) if (detail.status === 'fulfilled') values.push(detail.value);
      partial ||= values.some(value => !academicDetail.safeParse(value).success);
    }
    partial ||= values.some(value => incompleteEvidence(value));
    const community = input.topic === 'community' ? await expandCommunityContext(results, options.tool, (options.now ?? (() => new Date()))()) : null;
    partial ||= community?.partial ?? false;
    const cards = community?.cards ?? (input.topic === 'academic' ? opportunityCards(values) : values.flatMap(value => contextualCards(value, country === 'uk' ? 'gb' : country, slug) ?? publicCards(value)));
    const note = input.topic === 'statistics' ? 'آمار فقط برای جمعیت و دورهٔ منبع رسمی است؛ احتمال نتیجهٔ شخصی نیست. نبود آمار، نرخ صفر نیست.' : input.topic === 'viability' ? 'زمینهٔ مسیر و اعتماد شواهد، احتمال دریافت ویزا نیستند. این بخش شرایط فردی تو را ارزیابی نمی‌کند.' : input.topic === 'academic' ? 'منبع انتخاب‌شده: API داده‌های بررسی‌شدهٔ همراه. بازبودن فراخوان و فاند را در منبع رسمی همان فرصت بررسی کن.' : 'اطلاعات عمومی همین مسیر؛ موارد پوشش‌داده‌نشده نامعلوم می‌مانند.';
    return reply({ title: researchTopics[input.topic], checked_at: (options.now ?? (() => new Date()))().toISOString(), status: failure ? values.length ? 'partial' : 'unavailable' : partial ? 'partial' : 'available', cards,
      note: cards.length ? note : `${failure ? 'دریافت بخشی از اطلاعات ممکن نشد.' : partial ? 'پوشش شواهد این موضوع ناقص است.' : 'برای این موضوع، دادهٔ قابل ارائه در این جست‌وجو پیدا نشد.'} ${note}` } satisfies ResearchResult);
  } };
}

export async function publicHamrahTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch('https://hamrah-plugin-marketplace.vercel.app/mcp', { method: 'POST', redirect: 'error', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('Public evidence unavailable');
  const reader = response.body?.getReader(); if (!reader) throw Error('No evidence');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const c = await reader.read(); if (c.done) break; size += c.value.byteLength; if (size > 1_000_000) { await reader.cancel(); throw Error('Evidence response too large'); } chunks.push(c.value); }
  const raw = Buffer.concat(chunks).toString('utf8');
  const message = JSON.parse(response.headers.get('content-type')?.includes('text/event-stream') ? raw.split('\n').find(line => line.startsWith('data: '))?.slice(6) ?? 'null' : raw);
  if (!message?.result || message.result.isError) throw Error('Evidence tool failed');
  return message.result.structuredContent ?? JSON.parse(message.result.content?.find((c: { type: string }) => c.type === 'text')?.text ?? 'null');
}
