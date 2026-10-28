import test from 'node:test';
import assert from 'node:assert/strict';
import { planInterview, interviewProjection } from '../src/ai/interview-planner';
import { createCompassApi } from '../src/api';
import { answersSchema } from '../src/questions';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import pg from 'pg';
import { createGatewayInterviewPlanner } from '../src/ai/interview-planner';
import { AiBudgetLedger } from '../src/ai/budget';
import { acceptedPolicy, activeBudgetOwner, aiNow, aiCompletion } from './helpers/ai';
import { acceptanceFingerprint } from '../src/ai/policy';

async function fixture() {
  const answers = answersSchema.parse({ goal: 'work', destinations: ['de'], job_offer: 'none', remote_work: 'none', business_plan: 'none', investment_basis: 'none', family_connection: 'none', admission: 'none', budget: { amount: 12345678, currency: 'USD' } });
  const api = createCompassApi({ snapshot, catalog, now: () => new Date('2026-10-28T12:00:00Z') });
  const data = await (await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) }))).json();
  return { answers, interview: data.interview };
}
test('the model selects an unanswered applicable question and receives no monetary values, documents or country facts', async () => {
  const f = await fixture(); const projection = interviewProjection(f.answers, f.interview);
  assert.ok(!JSON.stringify(projection).includes('12345678'));
  assert.ok(!JSON.stringify(projection).includes('de.job_offer'));
  const candidate = projection.candidates.find(q => q.id === 'language')!;
  const selected = await planInterview(f.answers, f.interview, async () => ({ question_id: candidate.id }), async () => true);
  assert.equal(selected.next_question?.id, 'language');
  assert.equal(selected.selection.status, 'model_selected');
  assert.deepEqual(selected.questions, f.interview.questions);
});
test('invented, answered, removed and late selections fall back without changing answers or official rules', async () => {
  const f = await fixture();
  for (const id of ['invented', 'goal', 'de.job_offer']) {
    const selected = await planInterview(f.answers, f.interview, async () => ({ question_id: id }), async () => true);
    assert.equal(selected.next_question?.id, f.interview.next_question.id);
    assert.equal(selected.selection.status, 'invalid_response');
  }
  const late = await planInterview(f.answers, f.interview, async () => ({ question_id: 'language' }), async () => false);
  assert.equal(late.selection.status, 'stale');
  assert.equal(late.next_question?.id, f.interview.next_question.id);
});

test('planning reserves and settles the existing shared ledger once, and never retries a duplicate projection', { skip: !process.env.KOOCH_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  try {
    const owner = await activeBudgetOwner(pool), policy = acceptedPolicy();
    policy.acceptance.tasks['interview-planning'] = true;
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    const ledger = new AiBudgetLedger(pool, 'd'.repeat(64), aiNow);
    let calls = 0;
    const planner = createGatewayInterviewPlanner({ policy, ledger, now: aiNow, getCredential: () => 'fixture', transport: async (_url, init) => {
      calls++;
      assert.equal(new Headers(init?.headers).get('Authorization'), 'apikey fixture');
      const payload = JSON.parse(String(init?.body));
      assert.ok(!JSON.stringify(payload).includes('12345678'));
      const choices = JSON.parse(payload.messages[1].content);
      return aiCompletion({ question_id: choices.candidates.find((q: { id: string }) => q.id === 'language').id });
    } });
    const f = await fixture(), context = { owner, caseId: 'fixture-private-case', revision: 1, isCurrent: async () => true };
    const first = await planner(f.answers, f.interview, context);
    assert.equal(first.selection.status, 'model_selected');
    const retry = await planner(f.answers, f.interview, context);
    assert.equal(retry.selection.status, 'already_requested');
    assert.equal(calls, 1);
    const receipts = await ledger.exportOwner(owner);
    assert.ok(JSON.stringify(receipts).includes('settled'));
    assert.ok(!JSON.stringify(receipts).includes('fixture-private-case'));
  } finally { await pool.end(); }
});
