import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
const post = (body: unknown) => new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const definitions = {
  version: 'test-readiness-1',
  sources: [{ id: 'test-bluecard', title: 'Fixture official requirements', url: 'https://example.gov/blue-card', checked_on: '2026-10-24' }],
  routes: [{ route_id: 'de:eu-blue-card', scope_fa: 'بررسی آمادگی بلوکارت؛ پاسخ‌ها خوداظهاری‌اند.', limits_fa: 'این چک‌لیست تمام شرط‌های مسیر نیست.', costs_fa: 'هزینه از تمکن جدا بررسی شود.', cost_source_ids: ['test-bluecard'], dependants_fa: 'همراهان بررسی جدا دارند.', dependant_source_ids: ['test-bluecard'],
    checks: [{ id: 'offer', answer_id: 'de.job_offer', question: 'پیشنهاد کار داری؟', reason: 'قرارداد واجد شرایط این برنامه باید بررسی شود.', action: 'پیشنهاد کار واجد شرایط آماده کن.', source_ids: ['test-bluecard'] },
      { id: 'qualification', answer_id: 'de.qualification', question: 'مدرک و شرط حقوق همین برنامه را بررسی کرده‌ای؟', reason: 'وجود پیشنهاد کار، شرط مدرک و حقوق را احراز نمی‌کند.', action: 'مدرک و حقوق قرارداد را با شروط رسمی همین برنامه تطبیق بده.', source_ids: ['test-bluecard'] }] }],
};
test('a selected route asks its unconfirmed decisive check and explains the resulting next action', async () => {
  const api = createCompassApi({ snapshot, catalog, readiness: definitions, now: () => new Date('2026-10-24T22:00:00Z') });
  const answers = { goal: 'work', destinations: ['de'], focus_route: 'de:eu-blue-card', facts: { 'de.job_offer': 'yes', 'de.qualification': 'no' } };
  const result = await (await api.POST(post(answers))).json();
  const route = result.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card');
  assert.equal(route.readiness.checks.find((c: { id: string }) => c.id === 'offer').state, 'reported_ready');
  assert.equal(route.readiness.checks.find((c: { id: string }) => c.id === 'qualification').state, 'action_needed');
  assert.match(result.guidance.main_action, /مدرک و حقوق/);
  assert.equal(result.official_eligibility, 'not_assessed');
  const unknown = await (await api.POST(post({ ...answers, facts: { 'de.job_offer': 'yes' } }))).json();
  assert.equal(unknown.interview.next_question.id, 'de.qualification');
  assert.equal(unknown.interview.next_question.title, 'مدرک و شرط حقوق همین برنامه را بررسی کرده‌ای؟');
});

test('expired primary checks never become ready from an affirmative self-report', async () => {
  const old = structuredClone(definitions); old.sources[0].checked_on = '2026-09-01';
  const api = createCompassApi({ snapshot, catalog, readiness: old, now: () => new Date('2026-10-24T22:00:00Z') });
  const result = await (await api.POST(post({ goal: 'work', destinations: ['de'], focus_route: 'de:eu-blue-card', facts: { 'de.job_offer': 'yes', 'de.qualification': 'yes' } }))).json();
  const detail = result.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').readiness;
  assert.equal(detail.counts.reported_ready, 0);
  assert.equal(detail.counts.needs_review, 2);
  assert.equal(detail.needs_review, true);
  assert.match(result.guidance.main_action, /دوباره بررسی/);
  assert.equal(result.official_eligibility, 'not_assessed');
});

test('a changed checklist requires reconfirmation of its earlier affirmative detailed answer', async () => {
  const changed = { ...definitions, version: 'test-readiness-2' };
  const api = createCompassApi({ snapshot, catalog, readiness: changed, now: () => new Date('2026-10-24T22:00:00Z') });
  const answers = { goal: 'work', destinations: ['de'], focus_route: 'de:eu-blue-card', facts: { 'de.job_offer': 'yes', 'de.qualification': 'yes' }, fact_versions: { 'de.qualification': 'test-readiness-1' } };
  const response = await api.POST(post(answers)); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.interview.next_question.id, 'de.qualification');
  assert.equal(result.interview.next_question.answer_version, 'test-readiness-2');
  const check = result.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').readiness.checks.find((c: { id: string }) => c.id === 'qualification');
  assert.equal(check.state, 'needs_review');
  const confirmed = await (await api.POST(post({ ...answers, fact_versions: { 'de.qualification': 'test-readiness-2' } }))).json();
  assert.ok(confirmed.interview.next_question.id !== 'de.qualification');
  assert.equal(confirmed.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').readiness.counts.reported_ready, 2);
});

test('existing talent endorsement answers never answer the new activity-field question', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-24T22:00:00Z') });
  const result = await (await api.POST(post({ goal: 'work', destinations: ['uk'], focus_route: 'uk:global-talent', facts: { 'uk.talent': 'no' } }))).json();
  const detail = result.routes.find((r: any) => r.id === 'uk:global-talent').readiness;
  assert.equal(detail.checks.find((c: any) => c.answer_id === 'uk.talent_field').state, 'needs_information');
  assert.equal(detail.checks.find((c: any) => c.answer_id === 'uk.talent').state, 'action_needed');
  assert.equal(result.interview.questions.filter((q: any) => q.id === 'uk.talent').length, 1);
  assert.ok(!result.interview.questions.some((q: any) => q.id === 'uk.talent_endorsement'));
  assert.ok(result.interview.questions.some((q: any) => q.id === 'uk.talent_field'));
});

test('indexed official text cannot mark an affirmative condition ready', async () => {
  const indexed = { ...definitions, sources: definitions.sources.map(source => ({ ...source, verification: 'indexed' })) };
  const api = createCompassApi({ snapshot, catalog, readiness: indexed, now: () => new Date('2026-10-24T22:00:00Z') });
  const result = await (await api.POST(post({ goal: 'work', destinations: ['de'], facts: { 'de.job_offer': 'yes', 'de.qualification': 'yes' }, fact_versions: { 'de.qualification': definitions.version } }))).json();
  const detail = result.routes.find((r: any) => r.id === 'de:eu-blue-card').readiness;
  assert.equal(detail.counts.reported_ready, 0);
  assert.equal(detail.counts.needs_review, 2);
});

test('all published preparation routes are reachable and only the selected route expands detailed questions', async () => {
  const { readinessDefinitions } = await import('../src/readiness-registry');
  const { catalogPolicy } = await import('../src/catalog');
  const { catalogSchema } = await import('../src/catalog');
  const { isStableCoarseFact } = await import('../src/policy');
  const parsedCatalog = catalogSchema.parse(catalog);
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-28T22:00:00Z') });
  assert.ok(readinessDefinitions.routes.length >= 108);
  for (const plan of readinessDefinitions.routes) {
    const record = parsedCatalog.routes.find(route => route.id === plan.route_id)!;
    const policy = catalogPolicy(record);
    if (!policy || plan.availability) continue; // General multi-purpose records remain in the global screening; restricted schemes are never ordinary suggestions.
    const response = await api.POST(post({ goal: policy.goal, destinations: [record.destination], focus_route: record.id, facts: Object.fromEntries(policy.requires.map(id => [id, 'yes'])) }));
    assert.equal(response.status, 200, record.id);
    const result = await response.json();
    assert.equal(result.routes[0].id, record.id);
    assert.ok(result.routes[0].readiness.checks.length >= 3);
    const selected = new Set(plan.checks.map(check => check.answer_id));
    const otherDetailed = new Set(readinessDefinitions.routes.filter(route => route.route_id !== record.id).flatMap(route => route.checks.map(check => check.answer_id)).filter(id => !selected.has(id) && !isStableCoarseFact(id)));
    assert.ok(result.interview.questions.every((question: { id: string }) => !otherDetailed.has(question.id)), record.id);
    assert.equal(result.official_eligibility, 'not_assessed');
  }
});
