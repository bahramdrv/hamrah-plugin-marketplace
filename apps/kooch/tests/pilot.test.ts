import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, saveInput } from './helpers/account';
import { createScopedQuestionAssistance } from '../src/ai/preview-acceptance';
import { AiBudgetLedger } from '../src/ai/budget';
import type { QuestionAssistance } from '../src/ai/question-assistance';
import policy from '../data/ai-gateway-policy.json';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
test('the personal pilot discloses its limits and uses the fixed form with zero public AI spending', { skip: !enabled }, async () => {
  let assistance: QuestionAssistance; let dispatches = 0;
  const h = await harness(() => new Date('2026-10-21T12:00:00Z'), (view, context) => assistance(view, context));
  assistance = createScopedQuestionAssistance({ policy, ledger: new AiBudgetLedger(h.pool, 'a'.repeat(64)), environment: { VERCEL_ENV: 'production' }, getCredential: () => 'never-send', now: () => new Date('2026-10-21T12:00:00Z'), transport: async () => { dispatches++; throw new Error('Pilot must not dispatch AI'); } });
  try {
    const c = await h.verifiedClient();
    const status = await (await c.request('status')).json();
    assert.equal(status.pilot.kind, 'personal_noncommercial');
    assert.equal(status.pilot.ai, 'disabled');
    assert.ok(status.pilot.privacy_notice_version);
    await c.request('case', saveInput());
    const response = await c.request('form', { expected_revision: 1, request_id: randomUUID(), question_id: 'age_exact', question_version: 1, answer: { state: 'known', value: 27 } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).question_assistance.status, 'budget_zero');
    assert.equal(dispatches, 0);
  } finally { await h.close(); }
});

test('production activation stays scoped during acceptance, supports both public tasks and preserves the shared cap', async () => {
  const { productionAcceptanceProfile } = await import('../src/ai/production-acceptance');
  const { policyGate } = await import('../src/ai/policy');
  const clock = new Date('2026-10-21T12:00:00Z');
  const env = { VERCEL_ENV: 'production', KOOCH_APP_ORIGIN: 'https://my.kooch.app', KOOCH_AI_ROLLOUT: 'public' };
  assert.equal(productionAcceptanceProfile(policy, { ...env, VERCEL_ENV: 'preview' }, clock), undefined);
  assert.equal(productionAcceptanceProfile(policy, { ...env, KOOCH_APP_ORIGIN: 'https://foreign.example' }, clock), undefined);
  const enabled = productionAcceptanceProfile(policy, env, clock)!;
  assert.equal(enabled.mode, 'public');
  assert.equal(enabled.policy.limits.monthly_global_minor, 500000);
  assert.equal(enabled.policy.limits.external_hold_minor, 47676);
  assert.equal(policyGate(enabled.policy, clock, 'question-wording').status, 'accepted');
  assert.equal(policyGate(enabled.policy, clock, 'answer-interpretation').status, 'accepted');
  assert.equal(productionAcceptanceProfile(policy, { ...env, KOOCH_AI_ROLLOUT: 'synthetic' }, clock), undefined);
  const synthetic = productionAcceptanceProfile(policy, { ...env, KOOCH_AI_ROLLOUT: 'synthetic', KOOCH_AI_ACCEPTANCE_CASE_ID: randomUUID() }, clock)!;
  assert.equal(synthetic.mode, 'synthetic'); assert.ok(synthetic.caseId);
  assert.equal(productionAcceptanceProfile(policy, env, new Date('2026-10-22T10:04:01Z')), undefined);
});
