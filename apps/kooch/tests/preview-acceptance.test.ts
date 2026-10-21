import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import shippedPolicy from '../data/ai-gateway-policy.json';
// Historical Preview authorization is a fixture; the shipped pilot defaults to zero.
const policy = structuredClone(shippedPolicy);
policy.limits = { ...policy.limits, monthly_global_minor: 500000, daily_global_minor: 500000, daily_user_minor: 500000, daily_user_requests: 20 };
import { previewAcceptanceProfile, createScopedQuestionAssistance } from '../src/ai/preview-acceptance';
import { acceptanceFingerprint, policyGate } from '../src/ai/policy';
import { AiBudgetLedger } from '../src/ai/budget';
import { formView } from '../src/form/workflow';
import { answersSchema } from '../src/questions';
const now = () => new Date('2026-10-20T06:00:00Z');
const caseId = 'cf191060-7329-48c4-af19-44b116aa649b';
const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/kooch-arvan-acceptance',
  KOOCH_APP_ORIGIN: 'https://kooch-git-codex-kooch-arvan-acceptance-bahramd-s-projects2.vercel.app',
  KOOCH_AI_PREVIEW_ACCEPTANCE: '2026-10-20-three-synthetic', KOOCH_AI_PREVIEW_CASE_ID: caseId };

test('temporary acceptance is bound to the exact Preview branch, origin, case and current tariff window', () => {
  const profile = previewAcceptanceProfile(policy, env, now());
  assert.ok(profile);
  assert.equal(profile.caseId, caseId);
  assert.equal(policyGate(profile.policy, now()).status, 'accepted');
  assert.equal(profile.policy.acceptance.fingerprint, acceptanceFingerprint(profile.policy));
  assert.equal(profile.policy.acceptance.expires_at, policy.tariff.expires_at);
  assert.equal(profile.policy.limits.daily_user_requests, 3);
  assert.equal(profile.policy.limits.monthly_global_minor - profile.policy.limits.external_hold_minor, 60000);
  assert.equal(profile.policy.limits.daily_global_minor - profile.policy.limits.external_hold_minor, 60000);
  assert.equal(profile.policy.acceptance.tasks['answer-interpretation'], false);
  assert.equal(policy.acceptance.tasks['question-wording'], false);
  for (const changed of [{ ...env, VERCEL_ENV: 'production' }, { ...env, VERCEL_ENV: 'development' },
    { ...env, VERCEL_GIT_COMMIT_REF: 'main' }, { ...env, KOOCH_APP_ORIGIN: 'https://my.kooch.app' },
    { ...env, KOOCH_AI_PREVIEW_CASE_ID: '' }, { ...env, KOOCH_AI_PREVIEW_ACCEPTANCE: '' }]) {
    assert.equal(previewAcceptanceProfile(policy, changed, now()), undefined);
  }
  assert.equal(previewAcceptanceProfile(policy, env, new Date(policy.tariff.expires_at)), undefined);
  const unaccepted = structuredClone(policy); unaccepted.acceptance.published_tariff_accepted = false;
  assert.equal(previewAcceptanceProfile(unaccepted, env, now()), undefined);
});

test('other cases and Production cannot read credentials or touch accounting under the Preview switch', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  let calls = 0;
  const view = formView({ id: 'other-case', revision: 1, answers: answersSchema.parse({ goal: 'study' }), step: 2,
    consent_version: 'account-save-1', last_activity_at: '2026-10-20T06:00:00Z', delete_after: '2027-01-18T06:00:00Z' });
  try {
    for (const environment of [env, { ...env, VERCEL_ENV: 'production' }]) {
      const assist = createScopedQuestionAssistance({ policy, environment, now, ledger: new AiBudgetLedger(pool, 'a'.repeat(64)),
        getCredential: () => { calls++; return 'never'; }, transport: async () => { calls++; throw Error('never'); } });
      const result = await assist(view, { owner: 'synthetic-owner', isCurrent: async () => true });
      assert.equal(result.question_assistance.status, 'capability_unaccepted');
      assert.equal(calls, 0);
    }
    const allowed = createScopedQuestionAssistance({ policy, environment: env, now,
      ledger: new AiBudgetLedger(pool, 'a'.repeat(64)), getCredential: () => { calls++; return undefined; } });
    assert.equal((await allowed({ ...view, case_id: caseId }, { owner: 'synthetic-owner', isCurrent: async () => true })).question_assistance.status, 'credentials_missing');
    assert.equal(calls, 1);
  } finally { await pool.end(); }
});
