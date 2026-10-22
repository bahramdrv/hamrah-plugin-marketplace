import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness, saveInput } from './helpers/account';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
const now = () => new Date('2026-10-21T12:00:00Z');
test('unaccepted report explanation preserves the saved base report and never starts inference on reads', { skip: !enabled }, async () => {
  const h = await harness(now);
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient();
    await alice.request('case', saveInput());
    const report = (await (await alice.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
    const response = await alice.request(`report/${report.id}/explanation`, { request_id: randomUUID() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).status, 'capability_unaccepted');
    assert.deepEqual((await (await alice.request(`report/${report.id}`)).json()).report, report);
    assert.equal((await bob.request(`report/${report.id}/explanation`)).status, 404);
    assert.equal((await h.client().request(`report/${report.id}/explanation`)).status, 401);
    assert.equal((await alice.request(`report/${report.id}/explanation`, {}, 'POST', 'https://foreign.example')).status, 403);
  } finally { await h.close(); }
});

test('a metered explanation selects grounded cards once, exports its immutable addition and rejects other owners', { skip: !enabled }, async () => {
  const { createGatewayReportExplanation } = await import('../src/ai/report-explanation');
  const { AiBudgetLedger } = await import('../src/ai/budget');
  const { acceptedPolicy, aiCompletion } = await import('./helpers/ai');
  const { acceptanceFingerprint } = await import('../src/ai/policy');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const policy = acceptedPolicy();
  policy.acceptance.tasks['report-explanation'] = true;
  policy.explanation = { contract_version: 'report-explanation-1', prompt_version: 'report-explanation-1', data_acceptance: { recipient: 'fixture Arvan', processing_location: 'fixture only', retention: 'fixture only', accepted_at: '2026-10-21T00:00:00Z', expires_at: '2026-10-22T00:00:00Z', reference: 'local synthetic task acceptance' } };
  policy.tariff!.verified_at = '2026-10-21T00:00:00Z'; policy.tariff!.expires_at = '2026-10-22T00:00:00Z';
  policy.tariff!.max_input_tokens = 24000; policy.tariff!.max_request_minor = 24128;
  policy.limits.monthly_global_minor = policy.limits.daily_global_minor = policy.limits.daily_user_minor = 100000;
  policy.acceptance.expires_at = policy.tariff!.expires_at;
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  const ledger = new AiBudgetLedger(pool, 'd'.repeat(64), now);
  let calls = 0;
  const engine = createGatewayReportExplanation({ policy, ledger, now, getCredential: () => 'fixture', transport: async (_url, init) => {
    calls++;
    const wire = String(init?.body);
    for (const forbidden of ['email', 'case_id', 'last_activity_at', 'dependencies', 'answers', 'delete_after', 'owner']) assert.ok(!wire.includes(`"${forbidden}"`), forbidden);
    const projection = JSON.parse(JSON.parse(wire).messages[1].content);
    assert.equal(projection.routes[0].conditions[0].state, 'unknown');
    return aiCompletion({ reasons: ['uk:student/scope'], actions: ['uk:student/scope'] });
  } });
  const h = await harness(now, undefined, ledger, undefined, undefined, {}, engine);
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient(); await alice.request('case', saveInput());
    const report = (await (await alice.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
    const input = { request_id: randomUUID() };
    const [a,b] = await Promise.all([alice.request(`report/${report.id}/explanation`, input), alice.request(`report/${report.id}/explanation`, input)]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const saved = (await a.json()).explanation;
    assert.equal(saved.status, 'ready'); assert.equal(saved.report_id, report.id); assert.equal(saved.version, 1);
    assert.equal(saved.reasons[0].state, 'unknown'); assert.match(saved.reasons[0].text, /روشن کن/);
    assert.deepEqual(saved.reasons[0].source_ids, ['rules', 'apply']);
    await alice.request(`report/${report.id}/explanation`, input);
    await alice.request(`report/${report.id}`); await alice.request(`report/${report.id}/print`);
    assert.equal(calls, 1);
    assert.equal((await bob.request(`report/${report.id}/explanation`, input)).status, 404);
    const exported = await (await alice.request('export')).json();
    assert.equal(exported.report_explanations.length, 1); assert.deepEqual(exported.report_explanations[0], saved);
    assert.equal(exported.ai_usage.length, 1);
    assert.deepEqual((await (await alice.request(`report/${report.id}`)).json()).report, report);
  } finally { await h.close(); await pool.end(); }
});

async function explanationHarness(transport: typeof fetch) {
  const { createGatewayReportExplanation } = await import('../src/ai/report-explanation');
  const { AiBudgetLedger } = await import('../src/ai/budget');
  const { acceptedPolicy, aiCompletion } = await import('./helpers/ai');
  const { acceptanceFingerprint } = await import('../src/ai/policy');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const policy = acceptedPolicy();
  policy.acceptance.tasks['report-explanation'] = true;
  policy.explanation = { contract_version: 'report-explanation-1', prompt_version: 'report-explanation-1', data_acceptance: { recipient: 'fixture Arvan', processing_location: 'fixture only', retention: 'fixture only', accepted_at: '2026-10-21T00:00:00Z', expires_at: '2026-10-22T00:00:00Z', reference: 'local synthetic task acceptance' } };
  policy.tariff!.verified_at = '2026-10-21T00:00:00Z'; policy.tariff!.expires_at = '2026-10-22T00:00:00Z';
  policy.tariff!.max_input_tokens = 24000; policy.tariff!.max_request_minor = 24128;
  policy.limits.monthly_global_minor = policy.limits.daily_global_minor = policy.limits.daily_user_minor = 100000;
  policy.acceptance.expires_at = policy.tariff!.expires_at;
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  const ledger = new AiBudgetLedger(pool, 'd'.repeat(64), now);
  const engine = createGatewayReportExplanation({ policy, ledger, now, getCredential: () => 'fixture', transport });
  const h = await harness(now, undefined, ledger, undefined, undefined, {}, engine);
  return { h, pool, policy };
}

test('invented identifiers, conclusions, numbers and URLs are rejected while the base report stays usable', { skip: !enabled }, async () => {
  const { aiCompletion } = await import('./helpers/ai');
  let output: unknown;
  const { h, pool } = await explanationHarness(async () => aiCompletion(output));
  try {
    const alice = await h.verifiedClient(); await alice.request('case', saveInput());
    for (const malicious of [
      { reasons: ['invented/visa-approved'], actions: ['uk:student/scope'] },
      { reasons: ['uk:student/scope'], actions: ['uk:student/scope'], probability: 99 },
      { reasons: ['uk:student/scope'], actions: ['https://evil.invalid'] },
      { reasons: ['uk:student/scope', 'uk:student/scope'], actions: ['uk:student/scope'] },
      { reasons: ['uk:student/scope'], actions: ['uk:student/scope'], text: 'تمام شرط‌ها تأیید شد' },
    ]) {
      output = malicious;
      const report = (await (await alice.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
      const response = await alice.request(`report/${report.id}/explanation`, { request_id: randomUUID() });
      assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.status, 'invalid_response');
      assert.ok(!data.explanation.reasons); assert.ok(!data.explanation.actions);
      assert.deepEqual((await (await alice.request(`report/${report.id}`)).json()).report, report);
    }
  } finally { await h.close(); await pool.end(); }
});

test('case edits and account deletion discard late explanations without resurrecting saved data', { skip: !enabled }, async () => {
  const { aiCompletion } = await import('./helpers/ai');
  let release!: () => void, dispatched!: () => void;
  let sent = new Promise<void>(resolve => { dispatched = resolve; });
  const { h, pool } = await explanationHarness(async () => {
    dispatched(); await new Promise<void>(resolve => { release = resolve; });
    return aiCompletion({ reasons: ['uk:student/scope'], actions: ['uk:student/scope'] });
  });
  try {
    const alice = await h.verifiedClient(); await alice.request('case', saveInput());
    let report = (await (await alice.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
    let response = alice.request(`report/${report.id}/explanation`, { request_id: randomUUID() });
    await sent;
    const pending = await (await alice.request(`report/${report.id}/explanation`)).json();
    assert.equal(pending.status, 'pending'); assert.ok(pending.request_id);
    assert.equal((await (await alice.request(`report/${report.id}/explanation`, { request_id: pending.request_id })).json()).status, 'pending');
    assert.equal((await alice.request('case', saveInput(1))).status, 200);
    release(); assert.equal((await response).status, 409);
    assert.equal((await (await alice.request('export')).json()).report_explanations.length, 0);
    sent = new Promise<void>(resolve => { dispatched = resolve; });
    report = (await (await alice.request('report', { expected_revision: 2, request_id: randomUUID() })).json()).report;
    response = alice.request(`report/${report.id}/explanation`, { request_id: randomUUID() });
    await sent;
    assert.equal((await alice.request('delete', { password: alice.password, confirmation: 'حذف حساب' })).status, 200);
    release(); assert.equal((await response).status, 401);
    assert.equal((await alice.request(`report/${report.id}/explanation`)).status, 401);
    const bob = await h.verifiedClient();
    assert.equal((await (await bob.request('export')).json()).report_explanations.length, 0);
  } finally { release?.(); await h.close(); await pool.end(); }
});

test('zero budget and missing task acceptance make no model request; a 429 keeps the unknown cost reserved', { skip: !enabled }, async () => {
  const { acceptanceFingerprint } = await import('../src/ai/policy');
  let calls = 0;
  const { h, pool, policy } = await explanationHarness(async () => { calls++; return new Response(null, { status: 429 }); });
  try {
    const alice = await h.verifiedClient(); await alice.request('case', saveInput());
    const request = async () => {
      const report = (await (await alice.request('report', { expected_revision: 1, request_id: randomUUID() })).json()).report;
      const response = await alice.request(`report/${report.id}/explanation`, { request_id: randomUUID() });
      assert.equal(response.status, 200); return (await response.json()).status;
    };
    const accepted = policy.explanation!.data_acceptance;
    policy.explanation!.data_acceptance = undefined;
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    assert.equal(await request(), 'capability_unaccepted'); assert.equal(calls, 0);
    policy.explanation!.data_acceptance = { ...accepted!, expires_at: '2026-10-21T01:00:00Z' };
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    assert.equal(await request(), 'capability_unaccepted'); assert.equal(calls, 0);
    policy.explanation!.data_acceptance = accepted;
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    policy.limits.daily_global_minor = 0;
    assert.equal(await request(), 'budget_zero'); assert.equal(calls, 0);
    policy.limits.daily_global_minor = 100000; policy.acceptance.tasks['report-explanation'] = false;
    policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    assert.equal(await request(), 'capability_unaccepted'); assert.equal(calls, 0);
    policy.acceptance.tasks['report-explanation'] = true; policy.acceptance.fingerprint = acceptanceFingerprint(policy);
    assert.equal(await request(), 'cooldown'); assert.equal(calls, 1);
    const exported = (await (await alice.request('export')).json());
    assert.equal(exported.ai_usage.length, 1); assert.equal(exported.ai_usage[0].state, 'unknown');
    assert.ok(exported.ai_usage[0].reserved_minor > 0);
  } finally { await h.close(); await pool.end(); }
});
