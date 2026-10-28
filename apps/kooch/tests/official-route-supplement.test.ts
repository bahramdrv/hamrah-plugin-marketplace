import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../data/global-catalog.json';
import snapshot from '../data/iran-start-snapshot.json';
import { mergeOfficialRoutes } from '../src/official-route-supplement';
import { refreshCatalog } from '../src/catalog-refresh';
import { createCompassApi } from '../src/api';
import { publishedCatalog } from '../src/published-catalog';

const now = new Date('2026-10-28T12:00:00Z');
const route = { id: 'ge:it-residence-permit', source_id: 'kooch:ge-it-residence-permit', destination: 'ge', slug: 'it-residence-permit',
  name: 'Temporary residence permit for persons employed in IT', name_fa: 'اقامت متخصصان فناوری اطلاعات گرجستان', category: 'residence-general',
  summary: 'Official route identity; individual conditions require a separate review.', origin: 'official_supplement',
  sponsorship_required: null, settlement: null, duration: null, reviewed_on: '2026-10-28',
  source: { label: 'Georgia Public Service Development Agency — IT residence', url: 'https://sda.gov.ge/en/products/migration-residence-permits/', authority: 'Public Service Development Agency of Georgia', lastVerified: '2026-10-28' } };
const supplement = { version: 'official-fixture-1', released_on: '2026-10-28', routes: [route] };

test('a directly reviewed route outside Atlas enters the whole personal screening with distinct primary attribution and no eligibility assumption', async () => {
  const mixed = mergeOfficialRoutes(baseline, supplement, now);
  const api = createCompassApi({ snapshot, catalog: mixed, now: () => now });
  const result = await (await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'study', destinations: ['au'] }) }))).json();
  assert.equal(result.personal_screening.total, baseline.routes.length + 1);
  const personal = result.personal_screening.routes.find((r: { id: string }) => r.id === route.id);
  assert.ok(personal, 'destination and purpose preferences cannot hide an official supplement');
  assert.equal(personal.official_eligibility, 'UNKNOWN');
  const browse = await (await api.GET(new Request('http://localhost/api/config?catalog=1&destination=ge&limit=50'))).json();
  const item = browse.items.find((r: { id: string }) => r.id === route.id);
  assert.equal(item.sources[0].authority, 'primary');
  assert.ok(!item.channel_note.includes('تاریخ بررسی ثبت‌شده در ویزا اطلس'));
  assert.equal(mixed.routes.find(r => r.id === baseline.routes[0].id)?.source.lastVerified, baseline.routes[0].source.lastVerified);
});

test('an Atlas refresh preserves the separately published route and its primary review date', async () => {
  const base = { ...baseline, routes: baseline.routes.slice(0, 2) };
  const mixed = mergeOfficialRoutes(base, supplement, now);
  const incoming = base.routes.map(r => ({ destination: r.destination, slug: r.slug, name: r.name, category: r.category, summary: r.summary, sponsorshipRequired: r.sponsorship_required, leadsToSettlement: r.settlement, typicalDuration: r.duration, primarySource: r.source, lastReviewed: r.reviewed_on }));
  const refreshed = await refreshCatalog(mixed, { now: () => now, fetch: async () => Response.json(incoming) });
  assert.equal(refreshed.refresh?.state, 'updated');
  assert.equal(refreshed.routes.length, 3);
  assert.equal(refreshed.routes.find(r => r.id === route.id)?.source.lastVerified, '2026-10-28');
  assert.equal(refreshed.routes.find(r => r.id === route.id)?.origin, 'official_supplement');
  const collision = await refreshCatalog(mixed, { now: () => now, fetch: async () => Response.json([...incoming, { destination: route.destination, slug: route.slug, name: 'New Atlas identity', category: route.category, summary: route.summary, sponsorshipRequired: null, leadsToSettlement: false, typicalDuration: null, primarySource: route.source, lastReviewed: route.reviewed_on }]) });
  assert.equal(collision.refresh?.state, 'review_required');
  assert.deepEqual(collision.official_supplement_conflicts, [route.id]);
  assert.equal(collision.routes.find(r => r.id === route.id)?.origin, 'official_supplement');
});

test('supplement releases are dated, idempotent and cannot admit unknown destinations and future source reviews', () => {
  assert.equal(mergeOfficialRoutes(baseline, supplement, new Date('2026-10-27T12:00:00Z')).routes.length, baseline.routes.length);
  const mixed = mergeOfficialRoutes(baseline, supplement, now);
  assert.equal(mergeOfficialRoutes(mixed, supplement, now).routes.length, mixed.routes.length);
  assert.throws(() => mergeOfficialRoutes(baseline, { ...supplement, routes: [{ ...route, id: 'zz:it-residence-permit', destination: 'zz' }] }, now));
  assert.throws(() => mergeOfficialRoutes(baseline, { ...supplement, routes: [{ ...route, source: { ...route.source, lastVerified: '2026-10-29' } }] }, now));
});

test('an upstream identity collision keeps the original record visible and blocks only that route for review', async () => {
  const existing = baseline.routes[0];
  const conflicting = { ...supplement, routes: [{ ...route, id: existing.id, slug: existing.slug, destination: existing.destination }] };
  const mixed = mergeOfficialRoutes(baseline, conflicting, now);
  assert.equal(mixed.routes.length, baseline.routes.length);
  assert.deepEqual(mixed.routes.find(r => r.id === existing.id), existing);
  assert.deepEqual(mixed.official_supplement_conflicts, [existing.id]);
  const api = createCompassApi({ snapshot, catalog: mixed, now: () => now });
  const result = await (await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).json();
  assert.equal(result.personal_screening.routes.find((r: { id: string }) => r.id === existing.id).status, 'needs_source_review');
  assert.ok(!result.routes.some((r: { id: string }) => r.id === existing.id));
  assert.equal(result.personal_screening.total, baseline.routes.length);
});

test('the published supplement exposes its actual IT branches and focused questions without a fabricated goal or eligibility result', async () => {
  const mixed = publishedCatalog(baseline, now);
  const api = createCompassApi({ snapshot, catalog: mixed, now: () => now });
  const result = await (await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'study', destinations: ['au'], focus_route: route.id }) }))).json();
  const personal = result.personal_screening.routes.find((r: { id: string }) => r.id === route.id);
  assert.equal(result.personal_screening.total, baseline.routes.length + 1);
  assert.equal(personal.reviewed_check_count, 8);
  assert.equal(personal.can_answer_conditions, true);
  assert.equal(personal.official_eligibility, 'UNKNOWN');
  assert.equal(personal.goal, null);
  assert.ok(result.interview.question_order.includes('ge.geit28_branch'));
  assert.equal(result.global_coverage.official_supplement_routes, 1);
});
