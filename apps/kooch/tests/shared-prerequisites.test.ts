import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import { readinessDefinitions } from '../src/readiness-registry';

const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-28T12:00:00Z') });
async function result(answers: unknown) {
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) }));
  assert.equal(response.status, 200);
  return response.json();
}
test('a multi-country work interview asks once about having any job offer before repeating country checks', async () => {
  const data = await result({ goal: 'work', destinations: ['de', 'uk'] });
  assert.equal(data.interview.next_question.id, 'job_offer');
  assert.ok(!data.interview.question_order.includes('de.job_offer'));
  assert.ok(!data.interview.question_order.includes('uk.job_offer'));
});
test('an explicit absence of offers resolves country prerequisites without closing the route universe', async () => {
  const data = await result({ goal: 'work', destinations: ['de', 'uk'], job_offer: 'none' });
  assert.ok(!data.interview.question_order.some((id: string) => id.endsWith('.job_offer')));
  assert.equal(data.personal_screening.total, catalog.routes.length);
  const blue = data.personal_screening.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card');
  assert.equal(blue.official_eligibility, 'UNKNOWN');
  assert.notEqual(blue.status, 'reported_checks_ready');
  assert.notEqual(data.personal_screening.routes.find((r: { id: string }) => r.id === 'de:chancenkarte').status, 'restricted_context');
});
test('an offer in one country does not pass another country and unknown inventory does not invent absence', async () => {
  const general = await result({ goal: 'work', destinations: ['de', 'uk'], job_offer: 'some' });
  assert.equal(general.interview.next_question.id, 'job_offer_countries');
  const located = await result({ goal: 'work', destinations: ['de', 'uk'], job_offer: 'some', job_offer_countries: ['de'] });
  assert.ok(located.interview.question_order.includes('de.job_offer'));
  assert.ok(!located.interview.question_order.includes('uk.job_offer'));
  assert.equal(located.personal_screening.routes.find((r: { id: string }) => r.id === 'uk:skilled-worker').status, 'preparation_needed');
  const unknown = await result({ goal: 'work', destinations: ['de'], job_offer: 'unknown', answered: ['job_offer'] });
  assert.notEqual(unknown.interview.next_question.id, 'job_offer');
  assert.notEqual(unknown.personal_screening.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').status, 'preparation_needed');
});
test('a shared negative suppresses downstream readiness questions, while conflicts reopen the common question', async () => {
  const no = await result({ goal: 'work', destinations: ['de'], job_offer: 'none', focus_route: 'de:eu-blue-card' });
  const detailed = readinessDefinitions.routes.find(r => r.route_id === 'de:eu-blue-card')!.checks.map(c => c.answer_id);
  assert.ok(!no.interview.question_order.some((id: string) => detailed.includes(id)));
  const conflict = await result({ goal: 'work', destinations: ['de'], job_offer: 'none', facts: { 'de.job_offer': 'yes' } });
  assert.equal(conflict.interview.next_question.id, 'job_offer');
  assert.notEqual(conflict.personal_screening.routes.find((r: { id: string }) => r.id === 'de:eu-blue-card').status, 'reported_checks_ready');
});
test('no admission is asked once for all selected destinations without turning it into permanent ineligibility', async () => {
  const data = await result({ goal: 'study', destinations: ['uk', 'ca'], admission: 'none' });
  assert.ok(!data.interview.question_order.some((id: string) => id.endsWith('.admission')));
  assert.equal(data.personal_screening.total, catalog.routes.length);
  for (const id of ['uk:student', 'ca:study-permit-ca']) assert.equal(data.personal_screening.routes.find((r: { id: string }) => r.id === id).status, 'preparation_needed');
});
