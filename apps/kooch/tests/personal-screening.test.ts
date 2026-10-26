import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';

const now = () => new Date('2026-10-26T12:00:00Z');
import type { PersonalScreening } from '../src/personal-screening';
const readiness = { version: 'screening-fixture-1', sources: [{ id: 'official', title: 'Fixture official condition', url: 'https://example.gov/condition', checked_on: '2026-10-25' }],
  routes: [{ route_id: 'de:eu-blue-card', scope_fa: 'Fixture scope', limits_fa: 'Partial checks only', costs_fa: 'Costs not assessed', cost_source_ids: ['official'], dependants_fa: 'Dependants not assessed', dependant_source_ids: ['official'],
    checks: [{ id: 'offer', answer_id: 'de.job_offer', question: 'پیشنهاد کار داری؟', reason: 'پیشنهاد کار این مسیر باید بررسی شود.', action: 'پیشنهاد کار واجد شرایط آماده کن.', source_ids: ['official'] }] }] };
async function screen(facts: Record<string, string> = {}, age = 'unknown') {
  const api = createCompassApi({ snapshot, catalog, readiness, now });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'], age, facts }) }));
  assert.equal(response.status, 200);
  return (await response.json()).personal_screening;
}

test('personal screening examines the entire catalog across countries and route families; preferences never discard routes', async () => {
  const result = await screen();
  assert.ok(result, 'global personal screening is missing');
  assert.equal(result.total, catalog.routes.length);
  assert.equal(result.routes.length, new Set(catalog.routes.map(route => route.id)).size);
  assert.ok(result.routes.some((route: { id: string }) => route.id === 'au:subclass-189-skilled-independent'));
  assert.ok(result.routes.some((route: { id: string }) => route.id === 'uk:student'));
  assert.ok(result.routes.some((route: { category: string }) => route.category === 'family'));
  assert.equal(result.scope, 'all_indexed_destinations_and_routes');
  assert.equal(result.complete_global_eligibility, false);
});

test('two people with identical destination preferences get different source-backed reasons and preparation states', async () => {
  const [ready, missing, unknown] = await Promise.all([screen({ 'de.job_offer': 'yes' }), screen({ 'de.job_offer': 'no' }), screen()]);
  const route = (result: PersonalScreening) => result.routes.find(route => route.id === 'de:eu-blue-card')!;
  assert.equal(route(ready).status, 'reported_checks_ready');
  assert.equal(route(missing).status, 'preparation_needed');
  assert.equal(route(unknown).status, 'needs_information');
  assert.notDeepEqual(route(ready).reasons, route(missing).reasons);
  assert.equal(route(ready).official_eligibility, 'UNKNOWN');
  assert.ok(route(missing).source_urls.includes('https://example.gov/condition'));
});

test('a person can inspect a route outside the preferred country and purpose without rewriting those preferences', async () => {
  const api = createCompassApi({ snapshot, catalog, now });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'], focus_route: 'au:student-au' }) }));
  const result = await response.json();
  assert.equal(result.routes[0].id, 'au:student-au');
  assert.ok(result.interview.question_order.includes('au.admission'));
  assert.equal(result.personal_screening.total, catalog.routes.length);
});

test('unimplemented profile criteria and stale evidence are declared, never converted to personal suitability', async () => {
  const result = await screen({}, '40-plus');
  assert.ok(result.unassessed_profile_fields.includes('age'));
  const au = result.routes.find((route: { id: string }) => route.id === 'au:subclass-189-skilled-independent');
  assert.equal(au.status, 'needs_source_review');
  assert.equal(au.official_eligibility, 'UNKNOWN');
  assert.ok(au.missing_information.length > 0);
  assert.equal(result.counts.reported_checks_ready, 0);
});
