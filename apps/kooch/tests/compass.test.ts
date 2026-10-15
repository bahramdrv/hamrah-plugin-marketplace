import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';

const now = () => new Date('2026-10-15T12:00:00Z');
const post = (answers: unknown = {}) => new Request('http://localhost/api/compass', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers),
});

test('guest discovers only documented Iran-start routes for the stated goal and follows actual page_url', async () => {
  const api = createCompassApi({ snapshot, now });
  const response = await api.POST(post({ goal: 'study', destinations: ['de'], facts: { 'de.admission': 'yes' } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.deepEqual(result.routes.map((r: { id: string }) => r.id), ['de:student-de']);
  assert.equal(result.routes[0].page_url, 'https://kooch.app/visas/de/student-de-catalog/');
  assert.equal(result.routes[0].coverage, 'application_channel_reviewed');
  assert.equal(result.coverage.catalog, 1414);
  assert.equal(result.coverage.unreviewed, 1338);
  assert.equal(result.official_eligibility, 'not_assessed');
});

test('CEC and PGWP stay out of the shortlist without the relevant Canadian history', async () => {
  const api = createCompassApi({ snapshot, now });
  const unknown = await (await api.POST(post({ goal: 'work', destinations: ['ca'] }))).json();
  assert.deepEqual(unknown.routes, []);
  assert.ok(unknown.questions.some((q: { id: string }) => q.id === 'ca.work'));
  const denied = await (await api.POST(post({ goal: 'work', destinations: ['ca'], facts: { 'ca.work': 'no', 'ca.study': 'no' } }))).json();
  assert.ok(!denied.questions.some((q: { id: string }) => ['ca.work', 'ca.study'].includes(q.id)));
  const prior = await (await api.POST(post({ goal: 'work', destinations: ['ca'], facts: { 'ca.work': 'yes', 'ca.study': 'yes' } }))).json();
  assert.deepEqual(prior.routes.map((r: { id: string }) => r.id), ['ca:express-entry-cec', 'ca:pgwp']);
  assert.equal(prior.official_eligibility, 'not_assessed');
});

test('expired evidence never falls back to the full catalog or fills a result quota', async () => {
  const api = createCompassApi({ snapshot, now: () => new Date('2026-10-30T00:00:00Z') });
  const result = await (await api.POST(post({ goal: 'study', facts: { 'de.admission': 'yes' } }))).json();
  assert.equal(result.status, 'review_required');
  assert.deepEqual(result.routes, []);
  assert.equal(result.coverage.expired, 29);
});

test('closed routes and destination-only applications do not appear even with claimed prerequisites', async () => {
  const changed = structuredClone(snapshot);
  changed.routes.find(r => r.id === 'ca:pgwp')!.application.start_from_iran = 'destination_only';
  Object.assign(changed.routes.find(r => r.id === 'ca:express-entry-cec')!.application, { legal_status: 'closed' });
  const result = await (await createCompassApi({ snapshot: changed, now }).POST(post({ goal: 'work', destinations: ['ca'], facts: { 'ca.work': 'yes', 'ca.study': 'yes' } }))).json();
  assert.deepEqual(result.routes, []);
  assert.equal(result.coverage.excluded, 2);
});

test('tourism and ancestry never enter a work or study shortlist, including when goal is unknown', async () => {
  for (const goal of ['work', 'study', 'unknown']) {
    const allFacts = Object.fromEntries(Object.keys((await import('../src/policy')).facts).map(id => [id, 'yes']));
    const result = await (await createCompassApi({ snapshot, now }).POST(post({ goal, facts: allFacts }))).json();
    assert.ok(result.routes.length <= 5);
    assert.ok(result.routes.every((r: { id: string }) => !['uk:visit-visa-standard', 'it:citizenship-by-descent'].includes(r.id)));
    assert.equal(result.coverage.without_discovery_policy, 2);
  }
});

test('no selected-country coverage is a truthful zero, not proof of route closure', async () => {
  const result = await (await createCompassApi({ snapshot, now }).POST(post({ goal: 'work', destinations: ['au'] }))).json();
  assert.equal(result.status, 'no_matches');
  assert.equal(result.coverage.current, 29);
  assert.deepEqual(result.routes, []);
});

test('unscoped, incomplete, future or unlinked snapshots fail closed', async () => {
  const variants = [ { ...snapshot, scope: 'catalog' }, { ...snapshot, total: 30 },
    { ...snapshot, retrieved_at: '2026-11-01T12:00:00Z' }, { ...snapshot, sources: {} } ];
  for (const invalid of variants) {
    const response = await createCompassApi({ snapshot: invalid, now }).POST(post({}));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'invalid_snapshot');
  }
});

test('unknown budget is distinct from zero and only structured minimal answers are accepted', async () => {
  const api = createCompassApi({ snapshot, now });
  assert.equal((await api.POST(post({ budget: { amount: 0, currency: 'IRR' } }))).status, 200);
  for (const input of [{ name: 'private' }, { goal: 'invalid' }, { facts: { arbitrary: 'yes' } },
    { budget: { amount: 100, currency: '???' } }, { budget: { amount: -1, currency: 'EUR' } }]) {
    const response = await api.POST(post(input));
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('private'));
  }
});

test('guest requests cannot use another origin, submit oversized data or access previous answers', async () => {
  const api = createCompassApi({ snapshot, now });
  const foreign = post({}); foreign.headers.set('origin', 'https://elsewhere.test');
  assert.equal((await api.POST(foreign)).status, 403);
  assert.equal((await api.POST(post({ name: 'a'.repeat(17000) }))).status, 413);
  await api.POST(post({ goal: 'study', facts: { 'de.admission': 'yes' } }));
  const otherGuest = await (await api.POST(post({}))).json();
  assert.deepEqual(otherGuest.routes, []);
});

test('same-origin guest request remains valid when Next reconstructs its internal URL with localhost', async () => {
  const request = post({ goal: 'study' });
  request.headers.set('origin', 'http://127.0.0.1:3100');
  request.headers.set('host', '127.0.0.1:3100');
  assert.equal((await createCompassApi({ snapshot, now }).POST(request)).status, 200);
});

test('a guest can revise yes and no prerequisites without clearing the base answers', async () => {
  const api = createCompassApi({ snapshot, now });
  for (const admission of ['yes', 'no']) {
    const response = await api.POST(post({ goal: 'study', destinations: ['de'], facts: { 'de.admission': admission } }));
    const result = await response.json();
    assert.ok(result.editable_questions.some((q: { id: string }) => q.id === 'de.admission'));
    assert.deepEqual(result.questions, []);
    const revised = await (await api.POST(post({ goal: 'study', destinations: ['de'], facts: { 'de.admission': admission === 'yes' ? 'no' : 'yes' } }))).json();
    assert.equal(revised.routes.length, admission === 'yes' ? 0 : 1);
  }
});
