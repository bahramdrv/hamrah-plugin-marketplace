import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import { readinessDefinitions, readinessDefinitionsFor } from '../src/readiness-registry';
import { routeReadiness, readinessEvidence } from '../src/route-readiness';
import { screeningProfile } from '../src/profile-constraints';
import { answersSchema } from '../src/questions';

const now = () => new Date('2026-10-26T12:00:00Z');
const source = { id: 'fixture', title: 'Fixture primary requirement', url: 'https://example.gov/requirements', checked_on: '2026-10-25' };
const check = (id: string, field: string, operator: string, value: number, extra = {}) => ({ id, answer_id: `de.${id}`, question: `Fixture ${id}`, reason: `Fixture criterion ${id}`, action: `Check ${id}`, source_ids: ['fixture'], profile_rule: { field, operator, value, scope_fa: 'Fixture scope only', ...extra } });
function registry(checks: unknown[]) { return { version: 'profile-fixture-1', sources: [source], routes: [{ route_id: 'de:eu-blue-card', scope_fa: 'Fixture only', limits_fa: 'Partial checks; no route eligibility conclusion', costs_fa: 'Unknown', cost_source_ids: [], dependants_fa: 'Unknown', dependant_source_ids: [], checks }] }; }
async function result(answers: unknown, readiness: unknown) {
  const api = createCompassApi({ snapshot, catalog, now, readiness });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) }));
  assert.equal(response.status, 200);
  return (await response.json()).personal_screening.routes.find((route: { id: string }) => route.id === 'de:eu-blue-card');
}
test('a common age band can establish a bounded criterion, but an overlapping range stays unknown', async () => {
  const rules = registry([check('fixture_age', 'age_exact', 'lte', 45)]);
  const younger = await result({ age: '30-39' }, rules);
  const overlapping = await result({ age: '40-plus' }, rules);
  assert.equal(younger.status, 'reported_checks_ready');
  assert.equal(overlapping.status, 'needs_information');
  assert.equal(younger.official_eligibility, 'UNKNOWN');
});
test('overall work duration, certified language, budget and income never substitute for one another', async () => {
  const rules = registry([check('fixture_income', 'monthly_income', 'gte', 1000, { currency: 'EUR', basis: 'net' })]);
  const r = await result({ work: '3-plus', language: 'certified', budget: { amount: 999999, currency: 'EUR' } }, rules);
  assert.equal(r.status, 'needs_information');
  assert.ok(r.missing_information.includes('Fixture fixture_income'));
});
test('stale source evidence cannot become a positive condition via a valid profile or explicit yes', async () => {
  const rules = registry([check('fixture_age', 'age_exact', 'lte', 45)]);
  rules.sources[0] = { ...source, checked_on: '2026-01-01' };
  const r = await result({ age: '30-39', facts: {} }, rules);
  assert.equal(r.status, 'needs_source_review');
});

test('an announced end of a rule window stops positive checks even while its source review is still fresh', async () => {
  const rules = registry([check('fixture_age', 'age_exact', 'lte', 45)]);
  Object.assign(rules.routes[0], { valid_until: '2026-10-31' });
  for (const [date, expected] of [['2026-10-31T12:00:00Z', 'reported_checks_ready'], ['2026-11-01T00:00:00Z', 'needs_source_review']]) {
    const api = createCompassApi({ snapshot, catalog, readiness: rules, now: () => new Date(date) });
    const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ age: '30-39' }) }));
    const data = await response.json();
    assert.equal(data.personal_screening.routes.find((route: { id: string }) => route.id === 'de:eu-blue-card').status, expected);
  }
  Object.assign(rules.routes[0], { valid_until: '2026-10-31T23:59:59+04:00' });
  const profile = screeningProfile(answersSchema.parse({ age: '30-39' }));
  const before = routeReadiness(rules, 'de:eu-blue-card', {}, new Date('2026-10-31T19:59:59Z'), {}, profile)!;
  const after = routeReadiness(rules, 'de:eu-blue-card', {}, new Date('2026-10-31T20:00:00Z'), {}, profile)!;
  assert.equal(before.counts.reported_ready, 1);
  assert.equal(after.checks[0].state_reason, 'rule_window_expired');
  assert.notDeepEqual(readinessEvidence(before), readinessEvidence(after), 'expiry must change the evidence used to explain saved reports');
});

test('an affirmative checkbox cannot overrule contradictory profile facts or a different money unit', async () => {
  const rules = registry([check('fixture_age', 'age_exact', 'gte', 35)]);
  rules.routes[0].checks = [{ ...check('fixture_age', 'age_exact', 'gte', 35), answer_id: 'de.job_offer' }];
  const r = await result({ age: 'under-30', facts: { 'de.job_offer': 'yes' } }, rules);
  assert.equal(r.status, 'needs_source_review');
  const api = createCompassApi({ snapshot, catalog, now, readiness: rules });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ focus_route: 'de:eu-blue-card', age: 'under-30', facts: { 'de.job_offer': 'yes' } }) }));
  const focused = await response.json();
  assert.ok(!focused.interview.answered_ids.includes('de.job_offer'), 'a conflicting answer must reopen the focused question');
  const money = registry([check('fixture_budget', 'budget', 'gte', 1000, { currency: 'EUR' })]);
  assert.equal((await result({ budget: { amount: 900000, currency: 'IRR' } }, money)).status, 'needs_information');
});

test('new editions do not rewrite historical rules and an expired criterion stops reporting readiness', () => {
  assert.equal(readinessDefinitionsFor(new Date('2026-10-24')).version, 'route-readiness-1');
  assert.equal(readinessDefinitionsFor(new Date('2026-10-26T12:00:00Z')).routes.length, 60);
  assert.equal(readinessDefinitionsFor(new Date('2026-10-27T12:00:00Z')).routes.length, 95);
  assert.equal(readinessDefinitionsFor(new Date('2026-10-28T12:00:00Z')).routes.length, 108);
  const plan = readinessDefinitions.routes.find(route => route.route_id === 'ke:class-k-ordinary-residents-permit')!;
  const answers = answersSchema.parse({ age: '40-plus' });
  const current = routeReadiness(readinessDefinitions, plan.route_id, {}, now(), {}, screeningProfile(answers))!;
  assert.equal(current.checks.find(check => check.id === 'age')!.state, 'reported_ready');
  const expired = routeReadiness(readinessDefinitions, plan.route_id, {}, new Date('2026-11-11T12:00:00Z'), {}, screeningProfile(answers))!;
  assert.equal(expired.checks.find(check => check.id === 'age')!.state, 'needs_review');
});

test('new primary sources reach global personal screening without pruning other purposes or destinations', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-27T12:00:00Z') });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'study', destinations: ['au'], age: 'under-30' }) }));
  const data = await response.json();
  assert.equal(data.personal_screening.total, 1414);
  for (const id of ['ie:critical-skills-employment-permit', 'om:employment-work-visa', 'py:temporary-residence', 'lu:salaried-worker']) {
    const route = data.personal_screening.routes.find((r: { id: string }) => r.id === id);
    assert.ok(route.reviewed_check_count >= 3, id);
    assert.equal(route.official_eligibility, 'UNKNOWN');
  }
});

test('a researched checklist retains its separate Iranian filing context and current references', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-28T12:00:00Z') });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'] }) }));
  const data = await response.json();
  const route = data.personal_screening.routes.find((route: { id: string }) => route.id === 'de:eu-blue-card');
  assert.ok(route.source_urls.includes('https://teheran.diplo.de/ir-de/2752046-2752046'));
  assert.ok(route.reasons.some((reason: string) => reason.includes('ظرفیت نمایندگی محدود')));
  assert.equal(route.official_eligibility, 'UNKNOWN');
});

test('Armenian employment checks stop at the announced local reform boundary', () => {
  const plan = readinessDefinitions.routes.find(route => route.route_id === 'am:work-residence-permit');
  assert.ok(plan);
  assert.equal(plan.valid_until, '2026-10-31T23:59:59+04:00');
  const facts = Object.fromEntries(plan.checks.map(check => [check.answer_id, 'yes' as const]));
  const versions = Object.fromEntries(plan.checks.map(check => [check.answer_id, plan.version!]));
  const before = routeReadiness(readinessDefinitions, plan.route_id, facts, new Date('2026-10-31T19:59:59Z'), versions)!;
  const after = routeReadiness(readinessDefinitions, plan.route_id, facts, new Date('2026-10-31T20:00:00Z'), versions)!;
  assert.equal(before.counts.reported_ready, plan.checks.length);
  assert.ok(after.checks.every(check => check.state_reason === 'rule_window_expired'));
  assert.equal(after.costs.current, false);
});

test('regional alternatives stay within one scoped Belgian check instead of asking all regions as mandatory', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-27T12:00:00Z') });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['be'], focus_route: 'be:single-permit' }) }));
  const data = await response.json();
  const questions = data.interview.questions.map((question: { id: string }) => question.id);
  for (const suffix of ['flanders_medium', 'brussels_market', 'wallonia_general']) assert.ok(!questions.includes(`be.next_single_permit_${suffix}`));
  const route = data.personal_screening.routes.find((route: { id: string }) => route.id === 'be:single-permit');
  assert.ok(route.reasons.some((reason: string) => reason.includes('دامنهٔ این بررسی')));
});

test('dated primary condition packs reference real routes and all sources, with no lost restrictions', async () => {
  const ids = new Set(catalog.routes.map(route => route.id));
  assert.ok(readinessDefinitions.routes.length > 30);
  for (const route of readinessDefinitions.routes) assert.ok(ids.has(route.route_id), `Unknown catalog route ${route.route_id}`);
  for (const id of ['hk:capital-investment-entrant-scheme', 'mt:nomad-residence-permit']) {
    const api = createCompassApi({ snapshot, catalog, now });
    const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: id.startsWith('mt') ? 'work' : 'investment', destinations: [id.slice(0, 2)], focus_route: id }) }));
    const data = await response.json();
    assert.ok(!data.routes.some((route: { id: string }) => route.id === id), 'restricted route must not enter ordinary briefing');
    assert.equal(data.personal_screening.routes.find((route: { id: string }) => route.id === id).status, 'restricted_context');
    const browse = await (await api.GET(new Request(`http://localhost/api/config?catalog=1&destination=${id.slice(0, 2)}&limit=50`))).json();
    assert.equal(browse.items.find((route: { id: string }) => route.id === id).ordinary, false);
  }
});

test('a closed Spanish investor route stays visible as legacy context and never becomes a fresh investment suggestion', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-28T12:00:00Z') });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'investment', destinations: ['es'], focus_route: 'es:golden-visa-ending' }) }));
  const data = await response.json();
  assert.ok(!data.routes.some((route: { id: string }) => route.id === 'es:golden-visa-ending'));
  const route = data.personal_screening.routes.find((route: { id: string }) => route.id === 'es:golden-visa-ending');
  assert.equal(route.status, 'restricted_context');
  assert.equal(route.can_answer_conditions, false);
  assert.equal(route.official_eligibility, 'UNKNOWN');
  assert.ok(route.source_urls.some((url: string) => url.startsWith('https://www.boe.es/')));
});

test('a general residence program can ask its researched conditions without inventing a work or investment classification', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'], focus_route: 'ke:class-k-ordinary-residents-permit', age: '30-39' }) }));
  const data = await response.json();
  const route = data.personal_screening.routes.find((r: { id: string }) => r.id === 'ke:class-k-ordinary-residents-permit');
  assert.equal(route.can_answer_conditions, true);
  assert.ok(data.interview.question_order.includes('ke.class_k_ordinary_residents_permit_age'));
});
