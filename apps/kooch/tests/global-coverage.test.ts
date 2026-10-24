import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import { createResearchApi } from '../src/research/api';

const now = () => new Date('2026-10-24T20:00:00Z');
const post = (answers: unknown) => new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) });

test('the full destination catalog and an Australian study route reach the interview without claiming an Iranian application channel', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const config = await (await api.GET()).json();
  assert.equal(Object.keys(config.countries).length, 233);
  assert.equal(config.countries.no.name, 'نروژ');
  const response = await api.POST(post({ goal: 'study', destinations: ['au'] }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.interview.next_question.id, 'au.admission');
  assert.ok(result.routes.some((route: { id: string }) => route.id === 'au:student-au'));
  assert.equal(result.routes[0].coverage, 'catalog_research_required');
  assert.equal(result.official_eligibility, 'not_assessed');
  assert.match(result.routes[0].application_method, /بررسی/);
  assert.equal(result.global_coverage.routes, 1414);
});

test('US nationality restrictions remain visible outside ordinary suggestions without a personal visa verdict', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const result = await (await api.POST(post({ goal: 'study', destinations: ['us'] }))).json();
  assert.deepEqual(result.routes, []);
  assert.ok(result.restricted_routes.some((r: { id: string; channel_note: string }) => r.id === 'us:f-1' && /استثنا/.test(r.channel_note)));
  assert.equal(result.official_eligibility, 'not_assessed');
});

test('a visitor can browse every catalog record with stable pagination and a precise destination filter', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const all = await (await api.GET(new Request('http://localhost/api/config?catalog=1&limit=2'))).json();
  assert.equal(all.total, 1414);
  assert.equal(all.items.length, 2);
  const filtered = await (await api.GET(new Request('http://localhost/api/config?catalog=1&destination=au&limit=2'))).json();
  assert.ok(filtered.total > 2);
  assert.ok(filtered.items.every((r: { destination: string }) => r.destination === 'au'));
  const next = await (await api.GET(new Request('http://localhost/api/config?catalog=1&destination=au&limit=2&offset=2'))).json();
  assert.ok(!next.items.some((r: { id: string }) => filtered.items.some((p: { id: string }) => p.id === r.id)));
  assert.equal((await api.GET(new Request('http://localhost/api/config?catalog=1&offset=-1'))).status, 400);
});

test('new-country research uses the exact alpha-3 community scope and the opportunity-card alias', async () => {
  const scopes: Record<string, unknown>[] = [];
  const research = createResearchApi({ tool: async (_name, args) => { scopes.push(args); return { status: 'no_coverage' }; } });
  const request = (id: string) => new Request('http://localhost/api/research', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ route_id: id, topic: 'community' }) });
  assert.equal((await research.POST(request('no:skilled-worker-permit'))).status, 200);
  assert.ok(scopes.every(scope => scope.countryCode === 'NOR'));
  scopes.length = 0;
  assert.equal((await research.POST(request('de:chancenkarte'))).status, 200);
  assert.ok(scopes.every(scope => scope.countryCode === 'DEU'));
  assert.ok(scopes.filter(scope => scope.nationality === 'IRN').every(scope => scope.route === 'opportunity_card'));
});

test('an explicitly selected catalog route enters the saved shortlist ahead of the display limit', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const response = await api.POST(post({ goal: 'work', destinations: ['au'], focus_route: 'au:subclass-491-skilled-regional' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.routes[0].id, 'au:subclass-491-skilled-regional');
  assert.ok(result.interview.question_order.length < 14);
});

test('quarantined route evidence cannot re-enter from the broad catalog', async () => {
  const filtered = structuredClone(snapshot);
  filtered.routes = filtered.routes.filter(route => route.id !== 'de:eu-blue-card');
  filtered.total = filtered.coverage.documented_start = filtered.routes.length;
  const api = createCompassApi({ snapshot: filtered, catalog, blockedRouteIds: ['de:eu-blue-card'], now });
  const result = await (await api.POST(post({ goal: 'work', destinations: ['de'], focus_route: 'de:eu-blue-card' }))).json();
  assert.ok(!result.routes.some((route: { id: string }) => route.id === 'de:eu-blue-card'));
});

test('nationality-specific treaty routes and paused intake stay outside an ordinary Iranian shortlist', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const nl = await (await api.POST(post({ goal: 'business', destinations: ['nl'] }))).json();
  assert.ok(!nl.routes.some((route: { id: string }) => route.id === 'nl:daft'));
  assert.ok(nl.restricted_routes.some((route: { id: string }) => route.id === 'nl:daft'));
  const canada = await (await api.POST(post({ goal: 'business', destinations: ['ca'] }))).json();
  assert.ok(!canada.routes.some((route: { id: string }) => route.id === 'ca:start-up-visa'));
  assert.ok(canada.restricted_routes.some((route: { id: string; channel_note: string }) => route.id === 'ca:start-up-visa' && /همه تابعیت/.test(route.channel_note)));
});

test('a bounded source result discloses omitted matching community evidence', async () => {
  const research = createResearchApi({ tool: async () => ({ resultCount: 5, totalMatches: 90, coverage: { status: 'evidence_found', truncated: false }, signals: [] }) });
  const result = await (await research.POST(new Request('http://localhost/api/research', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ route_id: 'de:chancenkarte', topic: 'community' }) }))).json();
  assert.equal(result.status, 'partial');
});

test('country-wide community context is labelled separately and only selected dataset evidence supplies its citations', async () => {
  const api = createResearchApi({ now, tool: async (name, args) => {
    if (name === 'searchCommunitySignals') return args.nationality ? { signals: [], coverage: { status: 'no_coverage' } } : { signals: [{ datasetId: 'public-dataset', signalId: 'signal1' }] };
    if (name === 'getCommunitySignalDataset') return { canonicalSignals: [{ id: 'signal1', title: 'Public appointment context', summary_fa: 'توضیح عمومی صف', evidence_ids: ['ev1'], needs_recheck: true, lifecycle: { last_verified: '2026-09-01' } }, { id: 'unrelated', title: 'Must be excluded', evidence_ids: ['ev2'], lifecycle: { last_verified: '2026-10-24' } }], evidence: [{ id: 'ev1', source_url: 'https://example.gov/appointments', source_name: 'منبع صف' }, { id: 'ev2', source_url: 'https://example.gov/unrelated' }] };
    return { status: 'no_coverage' };
  } });
  const data = await (await api.POST(new Request('http://localhost/api/research', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ route_id: 'fr:student-visa-france', topic: 'community' }) }))).json();
  assert.ok(data.cards.some((c: { title: string; text: string; links: { url: string }[] }) => /زمینهٔ عمومی کشور/.test(c.title) && /بازبینی/.test(c.text) && c.links.some(link => link.url === 'https://example.gov/appointments')));
  assert.ok(!JSON.stringify(data.cards).includes('Must be excluded'));
  assert.equal(data.status, 'partial');
});

test('an old catalog stays browsable as research while its records no longer fill a fresh shortlist', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-11-10T20:00:00Z') });
  const result = await (await api.POST(post({ goal: 'study', destinations: ['au'] }))).json();
  assert.deepEqual(result.routes, []);
  assert.equal(result.global_coverage.status, 'stale');
  const page = await (await api.GET(new Request('http://localhost/api/config?catalog=1&destination=au'))).json();
  assert.ok(page.items.length > 0);
  assert.equal(page.review_required, true);
});

test('choosing a post-study route asks for prior history before it can enter the shortlist', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const input = { goal: 'work', destinations: ['nz'], focus_route: 'nz:post-study-work-visa' };
  const unknown = await (await api.POST(post(input))).json();
  assert.equal(unknown.interview.next_question.id, 'nz.local_study');
  assert.ok(!unknown.routes.some((r: { id: string }) => r.id === 'nz:post-study-work-visa'));
  const ready = await (await api.POST(post({ ...input, facts: { 'nz.local_study': 'yes' } }))).json();
  assert.equal(ready.routes[0].id, 'nz:post-study-work-visa');
});
