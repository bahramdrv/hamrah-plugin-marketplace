import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchApi } from '../src/research/api';
const request = (body: unknown, origin = 'http://localhost') => new Request('http://localhost/api/research', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('route research sends only public route scope and never accepts an arbitrary tool or applicant facts', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const api = createResearchApi({ tool: async (name, args) => { calls.push({ name, args }); return { data: [{ name: 'هزینهٔ درخواست', description: 'مبلغ در صفحهٔ رسمی بررسی شود.', primarySource: { label: 'منبع رسمی', url: 'https://example.gov/fees' } }] }; } });
  const response = await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'costs' }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.cards.some((c: any) => c.links.some((l: any) => l.url === 'https://example.gov/fees')));
  assert.ok(calls.every(c => c.args.countryCode === 'DE' && c.args.slug === 'eu-blue-card'));
  const before = calls.length;
  assert.equal((await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'costs', profile: { name: 'private' } }))).status, 400);
  assert.equal((await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'executeTool' }))).status, 400);
  assert.equal(calls.length, before);
});

test('academic and lived-experience discovery require an explicit request and selected academic API', async () => {
  let calls = 0;
  const api = createResearchApi({ tool: async () => { calls++; return {}; } });
  for (const input of [{ topic: 'experiences' }, { topic: 'academic', explicit_request: true, field: 'Physics' }, { topic: 'academic', explicit_request: true, academic_api: 'hamrah', field: 'person@example.com' }]) {
    assert.equal((await api.POST(request({ route_id: 'de:student-de', ...input }))).status, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await api.POST(request({ route_id: 'de:student-de', topic: 'academic', explicit_request: true, academic_api: 'hamrah', field: 'Physics' }))).status, 200);
  assert.equal(calls, 1);
});

test('question demand is resolved through cited answers and failed sources stay partial', async () => {
  const api = createResearchApi({ tool: async (name) => name === 'searchCommunityQuestions' ? { questions: [{ questionId: 'q1', canonicalFa: 'پرسش بی‌پاسخ' }] } :
    { official: [{ titleFa: 'پاسخ مستند', explanationFa: 'پاسخ از منبع همین موضوع.', citations: [{ sourceUrl: 'https://example.gov/rule' }] }] } });
  const data = await (await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'questions' }))).json();
  assert.ok(data.cards.some((c: any) => c.title === 'پاسخ مستند'));
  assert.ok(!data.cards.some((c: any) => c.title === 'پرسش بی‌پاسخ'));
  const partial = createResearchApi({ tool: async name => { if (name === 'getCostToComplete') throw Error('offline'); return { data: [{ title: 'هزینه', description: 'دادهٔ موجود' }] }; } });
  assert.equal((await (await partial.POST(request({ route_id: 'de:eu-blue-card', topic: 'costs' }))).json()).status, 'partial');
});

test('foreign or malformed origins are refused before any evidence request', async () => {
  const api = createResearchApi({ tool: async () => { throw Error('must not be called'); } });
  for (const origin of ['https://other.test', 'not a URL']) assert.equal((await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'route' }, origin))).status, 403);
});

test('fulfilled partial packs and failed secondary answers retain their missing coverage', async () => {
  const partial = createResearchApi({ tool: async name => name === 'getRouteFactPack' ? { status: 'partial', coverage: { percentage: 100 }, datasets: [] } : {} });
  assert.equal((await (await partial.POST(request({ route_id: 'de:eu-blue-card', topic: 'route' }))).json()).status, 'partial');
  const unanswered = createResearchApi({ tool: async name => { if (name === 'searchCommunityQuestions') return { questions: [{ questionId: 'q1' }] }; throw Error('offline'); } });
  const data = await (await unanswered.POST(request({ route_id: 'de:eu-blue-card', topic: 'questions' }))).json();
  assert.equal(data.status, 'unavailable');
  assert.match(data.note, /دریافت/);
});

test('academic summaries are expanded through their stable ID and keep verification and public evidence', async () => {
  const api = createResearchApi({ tool: async name => name === 'searchAcademicOpportunities' ? { opportunities: [{ opportunityId: 'o1', program: 'Physics MSc', institution: 'Example University' }] } : {
    opportunity: { program: 'Physics MSc', institution: 'Example University', deadline: null, funding: { status: 'unknown' } },
    verification: { lifecycleStatus: 'monitoring', deadline: { status: 'unknown' }, funding: { effectiveStatus: 'unknown' } },
    evidence: [{ sourceUrl: 'https://example.edu/program', sourceName: 'صفحهٔ دانشگاه', summary: 'Published program details' }],
  } });
  const data = await (await api.POST(request({ route_id: 'de:student-de', topic: 'academic', explicit_request: true, academic_api: 'hamrah', field: 'Physics' }))).json();
  assert.ok(data.cards.some((card: any) => /Physics MSc/.test(card.title) && /فاند.*نامعلوم/.test(card.text) && card.links.some((link: any) => link.url === 'https://example.edu/program')));
});

test('planning-time indexes are scoped to the requested route and missing clocks stay unknown', async () => {
  const api = createResearchApi({ tool: async name => name === 'getProcessingReliability' ? { data: { rows: [
    { destinationIso: 'ca', visaSlug: 'other', visaName: 'Unrelated', decisionWindow: '7 months', sourceUrl: 'https://example.gov/other' },
    { destinationIso: 'de', visaSlug: 'eu-blue-card', visaName: 'EU Blue Card', notPublished: true, decisionWindow: 'Not centrally published', sourceUrl: 'https://example.gov/clock' },
  ] } } : { data: [] } });
  const data = await (await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'time' }))).json();
  assert.ok(data.cards.some((c: any) => /زمان رسیدگی/.test(c.title) && /منتشر نشده/.test(c.text)));
  assert.ok(!JSON.stringify(data.cards).includes('Unrelated'));
});

test('a viability index retains low confidence and unranked status without becoming a visa probability', async () => {
  const api = createResearchApi({ tool: async name => name === 'getIranianRouteViability' ? { measures: { irvi: { score: 63, confidence: { label: 'low' } } }, ranking: { rankable: false } } : {} });
  const data = await (await api.POST(request({ route_id: 'de:eu-blue-card', topic: 'viability' }))).json();
  assert.ok(data.cards.some((c: any) => /۶۳/.test(c.text) && /پایین/.test(c.text) && /رتبه‌بندی/.test(c.text)));
  assert.match(data.note, /احتمال دریافت ویزا نیست/);
});
