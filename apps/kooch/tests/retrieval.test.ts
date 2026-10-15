import { test } from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../data/iran-start-snapshot.json';
import raw from './fixtures/iran-start-response.json';
import { refreshSnapshot } from '../src/retrieval';
import { createCompassApi } from '../src/api';
const now = () => new Date('2026-10-15T12:00:00Z');

test('bounded public-only scoped retrieval retains reviewed evidence and actual links', async () => {
  const refreshed = await refreshSnapshot(snapshot, { now, fetch: async (url, init) => {
    assert.equal(String(url), 'https://kooch.app/wp-json/kooch/v1/visa-catalog?scope=iran-start&limit=100&offset=0');
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined);
    return Response.json(raw);
  } });
  assert.equal(refreshed.status.state, 'ok');
  const config = await (await createCompassApi({ snapshot: refreshed.snapshot, now }).GET()).json();
  assert.equal(config.data.coverage.current, 29);
});

test('failed or changed upstream data preserves the previous snapshot without extending review freshness', async () => {
  for (const body of [{ ...raw, total: 1414 }, { ...raw, routes: raw.routes.slice(1) },
    { ...raw, routes: raw.routes.map(r => ({ ...r, application_from_iran: { ...r.application_from_iran, valid_until: '2026-12-01' } })) }]) {
    const refreshed = await refreshSnapshot(snapshot, { now, fetch: async () => Response.json(body) });
    assert.equal(refreshed.status.state, 'error');
    assert.deepEqual(refreshed.snapshot, snapshot);
  }
  const refreshed = await refreshSnapshot(snapshot, { now, fetch: async () => { throw new Error('network secret should not leak'); } });
  assert.equal(refreshed.status.code, 'fetch_failed');
  assert.ok(!JSON.stringify(refreshed.status).includes('secret'));
  assert.deepEqual(refreshed.snapshot, snapshot);
});
