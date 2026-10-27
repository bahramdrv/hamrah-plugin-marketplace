import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSourceMonitor } from '../src/source-monitor';
import { createCompassApi } from '../src/api';
import catalog from '../data/global-catalog.json';
import snapshot from '../data/iran-start-snapshot.json';
const now = () => new Date('2026-10-27T12:00:00Z');
const status = { schema_version: 1, generated_at: '2026-10-27T10:00:00Z', next_due_at: '2026-11-26T10:00:00Z', interval_days: 30, complete_global_conditions: false, legal_reviews_renewed: 0, blocked_route_ids: ['de:eu-blue-card'], coverage: { planned: 1000, captured: 800, unavailable: 200, review_required: 1, unreviewed_authority: 900 } };
test('the public monitor fetches only a fixed public status and never renews legal dates', async () => {
  const monitor = await fetchSourceMonitor({ now, fetch: async (url, init) => {
    assert.equal(url, 'https://raw.githubusercontent.com/bahramdrv/hamrah-plugin-marketplace/kooch-crawl-state/public-status.json');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.headers && Object.keys(init.headers).length, 1);
    return Response.json(status);
  } });
  assert.equal(monitor.state, 'current'); assert.deepEqual(monitor.blocked_route_ids, ['de:eu-blue-card']);
  assert.equal(monitor.legal_reviews_renewed, 0);
});
test('unavailable, oversized, future and malformed crawl status cannot masquerade as current evidence', async () => {
  for (const body of [{ ...status, generated_at: '2027-01-01T00:00:00Z' }, { ...status, legal_reviews_renewed: 3 }, { ...status, blocked_route_ids: ['bad'] }]) {
    const monitor = await fetchSourceMonitor({ now, fetch: async () => Response.json(body) });
    assert.equal(monitor.state, 'unavailable');
  }
  assert.equal((await fetchSourceMonitor({ now, fetch: async () => new Response('x'.repeat(300001), { headers: { 'content-type': 'application/json' } }) })).state, 'unavailable');
  const stale = await fetchSourceMonitor({ now: () => new Date('2026-12-01'), fetch: async () => Response.json(status) });
  assert.equal(stale.state, 'stale'); assert.deepEqual(stale.blocked_route_ids, ['de:eu-blue-card']);
});
test('a crawler review blocks both the personal screen and focused interview without hiding the indexed route', async () => {
  const monitor = await fetchSourceMonitor({ now, fetch: async () => Response.json(status) });
  const api = createCompassApi({ snapshot, catalog: { ...catalog, source_monitor: monitor }, now });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'], focus_route: 'de:eu-blue-card', facts: { 'de.job_offer': 'yes' } }) }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.personal_screening.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').status, 'needs_source_review');
  assert.equal(data.personal_screening.total, catalog.routes.length);
  assert.ok(!data.routes.some((r: { id: string }) => r.id === 'de:eu-blue-card'));
  assert.equal(data.source_monitor.state, 'current');
});
