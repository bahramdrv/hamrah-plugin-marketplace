import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createGatewayQuestionAssistance } from '../src/ai/gateway';
import { AiBudgetLedger } from '../src/ai/budget';
import policy from '../data/ai-gateway-policy.json';
import { formView } from '../src/form/workflow';
import { answersSchema } from '../src/questions';
import { acceptanceFingerprint } from '../src/ai/policy';

const view = () => formView({ id: 'private-case', revision: 7, answers: answersSchema.parse({ goal: 'study' }), step: 2, consent_version: 'account-save-1', last_activity_at: '2026-10-18T00:00:00Z', delete_after: '2027-01-16T00:00:00Z' });

test('the unaccepted deployed policy cannot read credentials, touch the ledger or contact a provider', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  let calls = 0;
  try {
    const assistance = createGatewayQuestionAssistance({ policy, now: () => new Date('2026-10-18T15:00:00Z'), ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), getCredential: () => { calls++; return 'must-not-read'; }, transport: async () => { calls++; throw Error('must-not-connect'); } });
    const result = await assistance(view(), { owner: 'private-owner' });
    assert.equal(result.question_assistance.status, 'capability_unaccepted');
    assert.equal(calls, 0);
    assert.deepEqual(result.next_question, view().next_question);
  } finally { await pool.end(); }
});

import { acceptedPolicy, aiNow, aiCompletion, activeBudgetOwner } from './helpers/ai';
import { randomUUID } from 'node:crypto';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL);
const currentOwner = (owner: string) => ({ owner, isCurrent: async () => true });
test('published tariffs need explicit owner acceptance without pretending all invoice charges were confirmed', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  const policy = acceptedPolicy();
  policy.tariff!.all_charges_included = false;
  let calls = 0;
  const assist = () => createGatewayQuestionAssistance({ policy, ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), now: aiNow,
    getCredential: () => { calls++; return undefined; } })(view(), currentOwner(randomUUID()));
  try {
    assert.equal((await assist()).question_assistance.status, 'pricing_unknown');
    assert.equal(calls, 0);
    policy.acceptance.published_tariff_accepted = true;
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    assert.equal((await assist()).question_assistance.status, 'credentials_missing');
    assert.equal(calls, 1);
  } finally { await pool.end(); }
});

test('explicit workspace owner acceptance is recorded as broad access and changing its scope invalidates acceptance', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  const policy = acceptedPolicy();
  policy.acceptance.iam_scope = 'workspace-owner';
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  let calls = 0;
  try {
    const assist = () => createGatewayQuestionAssistance({ policy, ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), now: aiNow,
      getCredential: () => { calls++; return undefined; } })(view(), currentOwner(randomUUID()));
    assert.equal((await assist()).question_assistance.status, 'credentials_missing');
    assert.equal(calls, 1);
    policy.acceptance.iam_scope = 'resource-scoped';
    assert.equal((await assist()).question_assistance.status, 'capability_unaccepted');
    assert.equal(calls, 1);
    Reflect.deleteProperty(policy.acceptance, 'iam_scope');
    Object.assign(policy.acceptance, { iam_scoped: true });
    assert.equal((await assist()).question_assistance.status, 'configuration_invalid');
    assert.equal(calls, 1);
  } finally { await pool.end(); }
});

test('external acceptance holds can exhaust the shared budget before credentials or database access', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  const policy = acceptedPolicy();
  policy.limits.external_hold_minor = policy.limits.monthly_global_minor;
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  let calls = 0;
  try {
    const result = await createGatewayQuestionAssistance({ policy, ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), now: aiNow,
      getCredential: () => { calls++; return 'must-not-read'; }, transport: async () => { calls++; return aiCompletion(); } })(view(), currentOwner(randomUUID()));
    assert.equal(result.question_assistance.status, 'budget_exhausted');
    assert.equal(calls, 0);
    assert.deepEqual(result.next_question, view().next_question);
  } finally { await pool.end(); }
});

test('accepted synthetic policy reserves before dispatch, authenticates one fixed endpoint and settles actual usage once', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'e'.repeat(64), aiNow), policy = acceptedPolicy(), owner = await activeBudgetOwner(pool);
  let calls = 0;
  const assist = createGatewayQuestionAssistance({ policy, ledger, getCredential: () => 'fixture-key', now: aiNow, transport: async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://arvan.invalid/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), 'apikey fixture-key');
    assert.equal(init?.redirect, 'error');
    assert.deepEqual(JSON.parse(String(init?.body)).chat_template_kwargs, { enable_thinking: false });
    const receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version);
    assert.equal(receipt?.state, 'sent');
    assert.equal(receipt?.reserved_minor, 4224);
    const raw = await aiCompletion().json();
    Object.assign(raw.choices[0].message, { annotations: null, audio: null, function_call: null, reasoning: null });
    Object.assign(raw.choices[0], { index: 0, logprobs: null, stop_reason: null, token_ids: null, routed_experts: null });
    return Response.json(raw);
  } });
  try {
    const result = await assist(view(), currentOwner(owner));
    assert.equal(result.question_assistance.status, 'worded');
    assert.equal(result.next_question?.title, 'چند سالت است؟');
    assert.equal(result.question_assistance.inference_accepted, true);
    const receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version);
    assert.equal(receipt?.state, 'settled'); assert.equal(receipt?.charged_minor, 4);
    const repeated = await assist(view(), currentOwner(owner));
    assert.equal(repeated.question_assistance.status, 'already_requested');
    assert.equal(calls, 1);
  } finally { await pool.end(); }
});

test('missing prices, expired acceptance or a changed connection never reads a key or sends a request', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  const variants = [
    (p: ReturnType<typeof acceptedPolicy>) => { p.tariff = null; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.version += '-renamed'; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.acceptance.published_tariff_accepted = true; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.limits.external_hold_minor = 1; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.limits.monthly_global_minor = 0; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.tariff!.all_charges_included = false; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.tariff!.expires_at = '2040-05-01T00:00:00Z'; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.acceptance.tasks['question-wording'] = false; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.acceptance.iam_scope = null; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.acceptance.gateway_retry_disabled = false; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.connection.authorization = 'Bearer'; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.connection.upstream_identity = 'changed'; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.connection.guardrail_version = 'changed'; },
    (p: ReturnType<typeof acceptedPolicy>) => { p.acceptance.expires_at = '2040-05-01T00:00:00Z'; },
  ];
  try {
    for (const mutate of variants) {
      const policy = acceptedPolicy(); mutate(policy);
      let calls = 0;
      const result = await createGatewayQuestionAssistance({ policy, ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), now: aiNow,
        getCredential: () => { calls++; return undefined; }, transport: async () => { calls++; return aiCompletion(); } })(view(), currentOwner(randomUUID()));
      assert.ok(['budget_zero', 'capability_unaccepted', 'pricing_unknown'].includes(result.question_assistance.status));
      assert.equal(calls, 0);
    }
  } finally { await pool.end(); }
});

test('a previously accepted response contract cannot enable the new response envelope', async () => {
  const pool = new pg.Pool({ connectionString: 'postgres://invalid.invalid/never' });
  const oldPolicy = acceptedPolicy();
  let calls = 0;
  try {
    for (const version of ['chat-completions-wording-1', 'chat-completions-wording-2', 'chat-completions-wording-3', 'chat-completions-wording-4']) {
      const legacy = { ...oldPolicy, connection: { ...oldPolicy.connection, contract_version: version } };
      const result = await createGatewayQuestionAssistance({ policy: legacy, ledger: new AiBudgetLedger(pool, 'e'.repeat(64)), now: aiNow,
        getCredential: () => { calls++; return 'must-not-read'; }, transport: async () => { calls++; return aiCompletion(); },
      })(view(), currentOwner(randomUUID()));
      assert.equal(result.question_assistance.status, 'configuration_invalid');
      assert.equal(calls, 0);
      assert.deepEqual(result.next_question, view().next_question);
    }
  } finally { await pool.end(); }
});

test('missing usage and post-send timeout preserve reservations while invalid prose with valid usage is billed', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'e'.repeat(64), aiNow);
  try {
    for (const kind of ['no-usage', 'invalid-prose', 'timeout'] as const) {
      const policy = acceptedPolicy(), owner = await activeBudgetOwner(pool);
      let release: () => void = () => {};
      const result = await createGatewayQuestionAssistance({ policy, ledger, getCredential: () => 'fixture', now: aiNow, deadlineMs: 100,
        transport: async () => {
          if (kind === 'timeout') return new Promise<Response>(resolve => { release = () => resolve(aiCompletion()); });
          if (kind === 'invalid-prose') return aiCompletion('unusable text');
          const raw = await aiCompletion().json(); delete raw.usage; return Response.json(raw);
        },
      })(view(), currentOwner(owner));
      assert.equal(result.question_assistance.status, kind === 'timeout' ? 'timeout' : 'invalid_response');
      // Post-timeout accounting can finish after returning the fixed question.
      let receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version);
      for (let n = 0; n < 20 && receipt?.state === 'sent'; n++) { await new Promise(r => setTimeout(r, 10)); receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version); }
      assert.equal(receipt?.state, kind === 'invalid-prose' ? 'settled' : 'unknown');
      assert.equal(receipt?.charged_minor, kind === 'invalid-prose' ? 4 : null);
      release();
      const retry = await createGatewayQuestionAssistance({ policy, ledger, now: aiNow, getCredential: () => 'fixture', transport: async () => { throw Error('must not retry'); } })(view(), currentOwner(owner));
      assert.equal(retry.question_assistance.status, 'already_requested');
    }
  } finally { await pool.end(); }
});

test('the owner-scoped form continues after its daily AI allowance is spent and another owner has independent allowance', { skip: !enabled }, async () => {
  const { harness, saveInput } = await import('./helpers/account');
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'b'.repeat(64), aiNow), policy = acceptedPolicy();
  policy.limits.daily_user_requests = 1;
  let calls = 0;
  const assist = createGatewayQuestionAssistance({ policy, ledger, now: aiNow, getCredential: () => 'fixture', transport: async () => { calls++; return aiCompletion(); } });
  const h = await harness(undefined, assist, ledger);
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient();
    await alice.request('case', saveInput()); await bob.request('case', saveInput());
    const first = await (await alice.request('form')).json();
    assert.equal(first.question_assistance.status, 'worded');
    assert.equal(first.question_assistance.daily_request_limit, 1);
    assert.equal((await (await alice.request('form')).json()).question_assistance.status, 'already_requested');
    const nextResponse = await alice.request('form', { expected_revision: 1, request_id: randomUUID(), question_id: 'age_exact', question_version: 1, answer: { state: 'known', value: 27 } });
    const next = await nextResponse.json();
    assert.equal(nextResponse.status, 200); assert.equal(next.revision, 2); assert.equal(next.next_question.id, 'study_level');
    assert.equal(next.question_assistance.status, 'budget_exhausted');
    assert.equal((await (await bob.request('form')).json()).question_assistance.status, 'worded');
    assert.equal(calls, 2);
    const exported = await (await alice.request('export')).json();
    assert.equal(exported.ai_usage.length, 1);
    assert.equal(exported.ai_usage[0].charged_minor, '4');
    assert.equal(exported.ai_usage[0].subject, undefined);
    assert.equal(exported.ai_usage[0].id, undefined);
    const owner = (await h.store.session(alice.cookie.split('=')[1])).owner;
    assert.equal((await alice.request('delete', { password: alice.password, confirmation: 'حذف حساب' })).status, 200);
    assert.deepEqual(await ledger.exportOwner(owner), []);
  } finally { await h.close(); await pool.end(); }
});

test('authorization failures stop the accepted policy and Retry-After gates fresh requests without retry', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'e'.repeat(64), aiNow);
  try {
    for (const status of [401, 403, 429]) {
      const policy = acceptedPolicy(), owner = await activeBudgetOwner(pool); let calls = 0;
      const assist = createGatewayQuestionAssistance({ policy, ledger, now: aiNow, getCredential: () => 'fixture', transport: async () => { calls++; return new Response('private error', { status, headers: { 'Retry-After': '300' } }); } });
      const result = await assist(view(), currentOwner(owner));
      assert.equal(result.question_assistance.status, 'unavailable');
      const fresh = await assist({ ...view(), revision: 8 }, currentOwner(owner));
      assert.equal(fresh.question_assistance.status, status === 429 ? 'cooldown' : 'policy_blocked');
      assert.equal(calls, 1);
      assert.ok(!JSON.stringify(result).includes('private error'));
    }
  } finally { await pool.end(); }
});

test('the complete assistance deadline includes waiting for a database connection and never sends after expiry', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL, max: 1 });
  const ledger = new AiBudgetLedger(pool, 'e'.repeat(64), aiNow), policy = acceptedPolicy(), owner = await activeBudgetOwner(pool);
  const held = await pool.connect(); let calls = 0, released = false;
  try {
    const started = performance.now();
    const result = await createGatewayQuestionAssistance({ policy, ledger, now: aiNow, getCredential: () => 'fixture', deadlineMs: 30,
      transport: async () => { calls++; return aiCompletion(); },
    })(view(), currentOwner(owner));
    assert.equal(result.question_assistance.status, 'timeout');
    assert.ok(performance.now() - started < 300);
    held.release(); released = true;
    let receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version);
    for (let n = 0; n < 30 && receipt?.state !== 'cancelled'; n++) { await new Promise(r => setTimeout(r, 10)); receipt = await ledger.receipt(owner, 'private-case:7:age_exact:1', policy.version); }
    assert.equal(receipt?.state, 'cancelled');
    assert.equal(calls, 0);
  } finally { if (!released) held.release(); await pool.end(); }
});

test('deleting an account while its reservation waits cannot recreate accounting identity links', { skip: !enabled }, async () => {
  const { harness, saveInput } = await import('./helpers/account');
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL, max: 1 });
  const controlPool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'e'.repeat(64), aiNow), eraser = new AiBudgetLedger(controlPool, 'e'.repeat(64), aiNow), policy = acceptedPolicy();
  let calls = 0;
  const h = await harness(undefined, createGatewayQuestionAssistance({ policy, ledger, now: aiNow, getCredential: () => 'fixture', transport: async () => { calls++; return aiCompletion(); } }), eraser);
  const held = await pool.connect(); let released = false;
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput());
    const owner = (await h.store.session(c.cookie.split('=')[1])).owner;
    const delayed = c.request('form');
    for (let n = 0; n < 100 && pool.waitingCount === 0; n++) await new Promise(r => setTimeout(r, 5));
    assert.equal(pool.waitingCount, 1);
    assert.equal((await c.request('delete', { password: c.password, confirmation: 'حذف حساب' })).status, 200);
    held.release(); released = true;
    assert.equal((await delayed).status, 401);
    assert.equal(calls, 0);
    assert.deepEqual(await eraser.exportOwner(owner), []);
  } finally { if (!released) held.release(); await h.close(); await pool.end(); await controlPool.end(); }
});
