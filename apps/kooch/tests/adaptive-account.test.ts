import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, saveInput } from './helpers/account';
import { evaluateCompass } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import { planInterview } from '../src/ai/interview-planner';
import { adaptiveInterviewPolicy } from '../src/ai/adaptive-policy';
import { policyGate } from '../src/ai/policy';

const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
test('shared absence survives account save/resume and suppresses offer-dependent study modules', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient();
    const saved = await c.request('case', { ...saveInput(), answers: { goal: 'study', admission: 'none', job_offer: 'none', answered: ['admission', 'job_offer'] } });
    assert.equal(saved.status, 200);
    const current = await (await c.request('case')).json();
    assert.equal(current.case.answers.admission, 'none');
    const form = await (await c.request('form')).json();
    assert.equal(form.answers.find((a: any) => a.question.id === 'admission').answer.value, 'none');
    assert.ok(!form.questions.some((q: any) => q.route_id));
    assert.ok(!form.questions.some((q: any) => q.id === 'study_offer'));
  } finally { await h.close(); }
});
test('planning requires the owner session, current revision and explicit model opt-in', { skip: !enabled }, async () => {
  let calls = 0;
  const h = await harness(undefined, undefined, undefined, undefined, undefined, {}, undefined, false, {
    interviewResult: async answers => evaluateCompass(answers, { snapshot, catalog, now: () => new Date('2026-10-28T12:00:00Z') }),
    interviewPlanner: async (answers, interview, context) => { calls++; return planInterview(answers, interview, async projection => ({ question_id: projection.candidates[0].id }), context.isCurrent); },
  });
  try {
    const owner = await h.verifiedClient(), other = await h.verifiedClient();
    const response = await owner.request('case', { ...saveInput(), answers: { goal: 'work' } });
    const { case: saved } = await response.json();
    const input = { case_id: saved.id, expected_revision: saved.revision, answers: { goal: 'work', destinations: ['de'], job_offer: 'none', remote_work: 'none' } };
    assert.equal((await h.client().request('interview', input)).status, 401);
    assert.notEqual((await other.request('interview', input)).status, 200);
    assert.equal((await owner.request('interview', { ...input, expected_revision: 999 })).status, 409);
    assert.equal(calls, 0);
    assert.equal((await owner.request('interview', input)).status, 200);
    assert.equal(calls, 0);
    assert.equal((await owner.request('interview', { ...input, use_model: true })).status, 200);
    assert.equal(calls, 1);
    assert.equal((await (await owner.request('case')).json()).case.revision, saved.revision, 'planning cannot silently persist a draft answer');
  } finally { await h.close(); }
});
test('the renewed planning budget is shared, opt-in, dated and cannot enable other inference tasks', () => {
  const now = new Date('2026-10-28T16:00:00Z');
  assert.equal(adaptiveInterviewPolicy({}, now), null);
  const policy = adaptiveInterviewPolicy({ KOOCH_INTERVIEW_AI_ENABLED: 'true' }, now)!;
  const gate = policyGate(policy, now, 'interview-planning');
  assert.equal(gate.status, 'accepted');
  assert.equal(policy.limits.monthly_global_minor, 500000);
  assert.ok(policy.limits.external_hold_minor >= 47676);
  assert.ok(policyGate(policy, now, 'answer-interpretation').status !== 'accepted');
  assert.equal(adaptiveInterviewPolicy({ KOOCH_INTERVIEW_AI_ENABLED: 'true' }, new Date('2026-11-28')), null);
});
