import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, saveInput } from './helpers/account';

const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
test('saved compass answers are reused and the next question exposes a versioned exact input without AI', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient();
    await c.request('case', { ...saveInput(), answers: { goal: 'study', age: 'under-30', education: 'bachelor', language: 'learning', budget: { amount: 12000, currency: 'EUR' } } });
    const response = await c.request('form');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const form = await response.json();
    assert.equal(form.schema_version, 1);
    assert.equal(form.revision, 1);
    assert.equal(form.next_question.id, 'age_exact');
    assert.equal(form.next_question.version, 1);
    assert.equal(form.next_question.input, 'number');
    assert.equal(form.next_question.unit, 'years');
    assert.equal(form.answers.find((a: any) => a.question.id === 'education').source, 'compass');
    assert.deepEqual(form.answers.find((a: any) => a.question.id === 'budget').answer.value, { amount: 12000, currency: 'EUR' });
    assert.equal(form.progress_percent, undefined);
    assert.equal(form.assessment_status, 'not_evaluated');
    assert.ok(form.missing.some((q: any) => q.id === 'study_level'));
  } finally { await h.close(); }
});

const answerInput = (revision: number, id: string, value: unknown = 27) => ({ expected_revision: revision, request_id: randomUUID(), question_id: id, question_version: 1, answer: { state: 'known', value } });
test('answers are validated, saved once across retries and resumed after signout; stale answers never overwrite a newer revision', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', { ...saveInput(), answers: { goal: 'study', age: 'under-30' } });
    const input = answerInput(1, 'age_exact');
    assert.equal((await c.request('form', { ...input, question_version: 99 })).status, 409);
    assert.equal((await c.request('form', { ...input, answer: { state: 'known', value: 27.5 } })).status, 400);
    assert.equal((await c.request('form', { ...input, answer: { state: 'declined' } })).status, 400);
    const [first, duplicate] = await Promise.all([c.request('form', input), c.request('form', input)]);
    assert.equal(first.status, 200); assert.equal(duplicate.status, 200);
    const a = await first.json(), b = await duplicate.json();
    assert.equal(a.revision, 2); assert.deepEqual(a, b);
    assert.equal((await c.request('form', { ...input, answer: { state: 'known', value: 28 } })).status, 409);
    assert.equal((await c.request('form', answerInput(1, 'education', 'master'))).status, 409);
    await c.request('signout', {});
    assert.equal((await c.request('form')).status, 401);
    await c.request('signin', { email: c.email, password: c.password });
    const resumed = await (await c.request('form')).json();
    assert.equal(resumed.revision, 2);
    assert.deepEqual(resumed.answers.find((r: any) => r.question.id === 'age_exact').answer, { state: 'known', value: 27 });
    assert.equal(resumed.last_activity_at, a.last_activity_at);
    const exported = await (await c.request('export')).json();
    assert.equal(exported.case.form.answers.age_exact.source, 'self_reported');
    assert.equal((await c.request('form', answerInput(2, 'study_offer', 'yes'))).status, 400);
  } finally { await h.close(); }
});

test('conflicts precede missing information and editing an upstream answer reopens dependent answers', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', { ...saveInput(), answers: { goal: 'study', age: 'under-30' } });
    let form = await (await c.request('form', answerInput(1, 'age_exact', 38))).json();
    assert.equal(form.next_question.id, 'age_exact');
    assert.deepEqual(form.review_required, ['age_exact']);
    assert.equal(form.answers.find((r: any) => r.question.id === 'age_exact').review_reason, 'compass_conflict');
    form = await (await c.request('form', { ...answerInput(form.revision, 'age_exact', 38), confirm_conflict: true })).json();
    assert.deepEqual(form.review_required, []);
    assert.equal((await (await c.request('case')).json()).case.answers.age, '30-39');
    form = await (await c.request('form', answerInput(form.revision, 'study_level', 'master'))).json();
    form = await (await c.request('form', answerInput(form.revision, 'study_offer', 'yes'))).json();
    form = await (await c.request('form', answerInput(form.revision, 'study_level', 'phd'))).json();
    assert.equal(form.next_question.id, 'study_offer');
    assert.deepEqual(form.review_required, ['study_offer']);
    assert.ok(form.missing.some((q: any) => q.id === 'study_offer'));
    form = await (await c.request('form', { ...answerInput(form.revision, 'study_offer'), answer: { state: 'unknown' } })).json();
    assert.notEqual(form.next_question.id, 'study_offer');
    assert.ok(form.missing.some((q: any) => q.id === 'study_offer'));
    assert.equal((await c.request('form', answerInput(form.revision, 'study_offer', 'invented'))).status, 400);
    form = await (await c.request('form', answerInput(form.revision, 'goal', 'work'))).json();
    assert.ok(!form.questions.some((q: any) => q.id === 'study_offer'));
    assert.ok(form.questions.some((q: any) => q.id === 'work_years'));
    assert.equal((await (await c.request('case')).json()).case.answers.goal, 'work');
  } finally { await h.close(); }
});

test('unknown and declined answers remain gaps, money keeps its currency and private form data stays owner-scoped', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient();
    const a = (await (await alice.request('case', saveInput())).json()).case;
    await bob.request('case', saveInput());
    let form = await (await alice.request('form', { ...answerInput(1, 'budget'), answer: { state: 'declined' } })).json();
    assert.ok(form.missing.some((q: any) => q.id === 'budget'));
    assert.equal((await alice.request('form', answerInput(form.revision, 'budget', { amount: 500, currency: 'BTC' }))).status, 400);
    form = await (await alice.request('form', answerInput(form.revision, 'budget', { amount: 1500000000, currency: 'IRT' }))).json();
    assert.deepEqual(form.answers.find((r: any) => r.question.id === 'budget').answer.value, { amount: 1500000000, currency: 'IRT' });
    assert.equal((await bob.request(`form/${a.id}`)).status, 400);
    assert.equal((await bob.request('form', { ...answerInput(1, 'age_exact'), owner: a.id })).status, 400);
    const other = await (await bob.request('form')).json();
    assert.equal(other.revision, 1);
    assert.ok(!other.answers.some((r: any) => r.question.id === 'budget'));
    assert.equal((await alice.request('form', answerInput(form.revision, 'goal', 'study'), 'POST', 'https://foreign.example')).status, 403);
    const originalActivity = form.last_activity_at;
    assert.equal((await (await alice.request('form')).json()).last_activity_at, originalActivity);
    const legacy = await alice.request('case', { ...saveInput(form.revision, 'work'), answers: { goal: 'work', budget: { amount: 2000, currency: 'EUR' } } });
    assert.equal(legacy.status, 200);
    const revised = await (await alice.request('form')).json();
    assert.equal(revised.answers.find((r: any) => r.question.id === 'budget').answer.value.currency, 'EUR');
  } finally { await h.close(); }
});

test('known zero work experience is reused and conflicting exact years require confirmation before replacing the compass range', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', { ...saveInput(), answers: { goal: 'work', work: 'none' } });
    let form = await (await c.request('form')).json();
    assert.deepEqual(form.answers.find((r: any) => r.question.id === 'work_years')?.answer, { state: 'known', value: 0 });
    form = await (await c.request('form', answerInput(1, 'work_years', 5))).json();
    assert.equal(form.next_question.id, 'work_years');
    assert.ok(form.review_required.includes('work_years'));
    form = await (await c.request('form', { ...answerInput(form.revision, 'work_years', 5), confirm_conflict: true })).json();
    assert.ok(!form.review_required.includes('work_years'));
    assert.equal((await (await c.request('case')).json()).case.answers.work, '3-plus');
  } finally { await h.close(); }
});
