import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../data/global-catalog.json';
import { refreshCatalog } from '../src/catalog-refresh';
import { catalogSchema } from '../src/catalog';

const previous = { ...baseline, routes: baseline.routes.slice(0, 2) };
const incoming = () => previous.routes.map(route => ({ destination: route.destination, slug: route.slug, name: route.name,
  category: route.category, summary: route.summary, sponsorshipRequired: route.sponsorship_required,
  leadsToSettlement: route.settlement, typicalDuration: route.duration, primarySource: route.source, lastReviewed: route.reviewed_on }));
const now = () => new Date('2026-10-26T12:00:00Z');

test('a complete public refresh updates the catalog but never renews primary review dates or Iranian channel evidence', async () => {
  let requested = '';
  const result = await refreshCatalog(previous, { now, fetch: async (url, init) => { requested = String(url); assert.equal(init?.redirect, 'error'); return Response.json(incoming()); } });
  assert.equal(requested, 'https://visaatlas.org/api/public/visas');
  assert.equal(result.refresh?.state, 'updated');
  assert.equal(result.retrieved_at, now().toISOString());
  assert.deepEqual(result.iran_application, catalogSchema.parse(previous).iran_application);
  assert.deepEqual(result.routes.map(route => route.source), previous.routes.map(route => route.source));
});

test('new source-backed routes in known destinations enter discovery as research, not official eligibility', async () => {
  const routes = incoming(); routes.push({ ...routes[0], slug: 'new-route', name: 'New source-linked route' });
  const result = await refreshCatalog(previous, { now, fetch: async () => Response.json(routes) });
  assert.equal(result.routes.length, 3);
  assert.equal(result.routes[2].name_fa, 'New source-linked route');
  assert.equal(result.routes[2].source.lastVerified, routes[0].primarySource.lastVerified);
});

test('truncation, unknown destinations, future dates and upstream failures preserve the last catalog with an explicit refresh error', async () => {
  for (const payload of [incoming().slice(0, 1), [...incoming(), { ...incoming()[0], destination: 'zz' }], incoming().map(route => ({ ...route, primarySource: { ...route.primarySource, lastVerified: '2027-01-01' } }))]) {
    const result = await refreshCatalog(previous, { now, fetch: async () => Response.json(payload) });
    assert.notEqual(result.refresh?.state, 'updated');
    assert.equal(result.retrieved_at, previous.retrieved_at);
    assert.deepEqual(result.routes, previous.routes);
  }
  const failed = await refreshCatalog(previous, { now, fetch: async () => { throw new Error('offline'); } });
  assert.equal(failed.refresh?.state, 'error');
  assert.equal(failed.retrieved_at, previous.retrieved_at);
});
