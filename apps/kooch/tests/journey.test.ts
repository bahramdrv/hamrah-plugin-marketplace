import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';

const api = createCompassApi({ snapshot, now: () => new Date('2026-10-24T10:00:00Z') });
async function result(answers: unknown) {
  const response = await api.POST(new Request('http://localhost/api/compass', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers),
  }));
  assert.equal(response.status, 200);
  return response.json();
}

test('a work interview asks the decisive route prerequisite before general profile details', async () => {
  const start = await result({});
  assert.equal(start.interview.next_question.id, 'goal');
  const work = await result({ goal: 'work', destinations: ['de'] });
  assert.equal(work.interview.next_question.id, 'job_offer');
  assert.equal(work.interview.next_question.kind, 'base');
  const answered = await result({ goal: 'work', destinations: ['de'], facts: { 'de.job_offer': 'no' } });
  assert.equal(answered.interview.next_question.id, 'work');
  assert.equal(answered.guidance.main_action, 'ابتدا پیشنهاد کار تخصصی از کارفرمای آلمانی پیدا کن.');
  assert.equal(answered.guidance.actions.filter((a: { id: string }) => a.id === 'de.job_offer').length, 1);
  assert.equal(answered.guidance.report_kind, 'discovery');
});

test('study omits unrelated work questions and an explicit unknown is not asked repeatedly', async () => {
  const study = await result({ goal: 'study', destinations: ['de'], facts: { 'de.admission': 'unknown' }, answered: ['education'] });
  assert.equal(study.interview.next_question.id, 'language');
  assert.ok(!study.interview.question_order.includes('work'));
  assert.ok(!study.interview.question_order.includes('age'));
  assert.ok(study.guidance.open_questions.some((q: { id: string }) => q.id === 'de.admission'));
  const noPreference = await result({ goal: 'family', answered: ['destinations'], facts: { 'ca.family': 'unknown', 'es.family': 'unknown', 'uk.family': 'unknown' } });
  assert.equal(noPreference.interview.next_question.id, 'timeline');
});

test('expired route evidence produces no invented action or detailed report promise', async () => {
  const expired = createCompassApi({ snapshot, now: () => new Date('2026-10-30T10:00:00Z') });
  const r = await (await expired.POST(new Request('http://localhost/api/compass', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'work', destinations: ['de'] }),
  }))).json();
  assert.deepEqual(r.guidance.actions, []);
  assert.equal(r.guidance.report_kind, 'discovery');
  assert.match(r.guidance.main_action, /بازبینی/);
});
