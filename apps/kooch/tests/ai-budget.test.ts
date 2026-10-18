import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { activeBudgetOwner } from './helpers/ai';
import { AiBudgetLedger } from '../src/ai/budget';

const enabled = Boolean(process.env.KOOCH_DATABASE_URL);
const limits = { currency: 'TST', monthly_global_minor: 10, daily_global_minor: 10, daily_user_minor: 10, daily_user_requests: 20 };

test('two server instances reserve one shared final allowance atomically; duplicate operations never reserve twice', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const key = 'c'.repeat(64);
  const now = () => new Date('2040-04-02T12:00:00Z');
  const one = new AiBudgetLedger(pool, key, now), two = new AiBudgetLedger(pool, key, now);
  const owner = await activeBudgetOwner(pool), scope = randomUUID();
  const input = { owner, operation: 'question-1', policy: scope, reserved_minor: 10, limits: { ...limits, currency: scope } };
  try {
    const results = await Promise.all([one.reserve(input), two.reserve(input)]);
    assert.equal(results.filter(r => r.status === 'reserved').length, 1);
    assert.ok(results.some(r => r.status === 'duplicate' || r.status === 'busy'));
    const blocked = await two.reserve({ ...input, operation: 'question-2', owner: await activeBudgetOwner(pool) });
    assert.equal(blocked.status, 'budget_exhausted');
  } finally { await pool.end(); }
});

test('real usage settles once; an unknown sent request stays reserved across midnight until explicitly reconciled', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  let clock = new Date('2040-05-31T23:59:00Z');
  const ledger = new AiBudgetLedger(pool, 'd'.repeat(64), () => clock);
  const scope = randomUUID(), owner = await activeBudgetOwner(pool);
  const input = { owner, operation: 'first', policy: scope, reserved_minor: 10, limits: { ...limits, currency: scope } };
  const usage = { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 };
  try {
    const reserved = await ledger.reserve(input);
    await ledger.markSent(reserved.id!, 'Qwen3.5-35B-A3B');
    await ledger.markUnknown(reserved.id!, 'timeout', 8000);
    clock = new Date('2040-06-01T00:01:00Z');
    assert.equal((await ledger.reserve({ ...input, operation: 'next' })).status, 'budget_exhausted');
    assert.equal((await ledger.receipt(owner, 'first', scope))?.state, 'unknown');
    await ledger.settle(reserved.id!, 4, usage, 'invalid_response', 300);
    await ledger.settle(reserved.id!, 4, usage, 'invalid_response', 300);
    await assert.rejects(ledger.settle(reserved.id!, 5, usage, 'invalid_response', 300));
    const receipt = await ledger.receipt(owner, 'first', scope);
    assert.equal(receipt?.state, 'settled');
    assert.equal(receipt?.charged_minor, 4);
    assert.equal((await ledger.receipt(randomUUID(), 'first', scope)), null);
    assert.equal((await ledger.reserve({ ...input, operation: 'next', reserved_minor: 6 })).status, 'reserved');
  } finally { await pool.end(); }
});

test('reconciliation uses the original tariff and account erasure removes subject access without releasing unresolved global costs', { skip: !enabled }, async () => {
  const { acceptedPolicy } = await import('./helpers/ai');
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'f'.repeat(64), () => new Date('2040-06-01T12:00:00Z'));
  const policy = acceptedPolicy(), owner = await activeBudgetOwner(pool);
  const input = { owner, operation: 'original', policy: policy.version, reserved_minor: 4224, limits: policy.limits, tariff: policy.tariff! };
  try {
    const reservation = await ledger.reserve(input);
    await ledger.markSent(reservation.id!, policy.connection.model);
    await ledger.markUnknown(reservation.id!, 'timeout', 8000);
    policy.tariff!.input_minor_per_unit = 1000;
    await ledger.reconcile(reservation.id!, { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }, 'synthetic-billing-proof');
    assert.equal((await ledger.receipt(owner, 'original', policy.version))?.charged_minor, 4);
    assert.equal((await ledger.exportOwner(owner)).length, 1);
    const pending = await ledger.reserve({ ...input, operation: 'pending', tariff: undefined });
    await ledger.markSent(pending.id!, policy.connection.model);
    await ledger.markUnknown(pending.id!, 'timeout', 8000);
    await ledger.forgetOwner(owner);
    assert.deepEqual(await ledger.exportOwner(owner), []);
    assert.equal(await ledger.receipt(owner, 'original', policy.version), null);
    assert.equal((await ledger.reserve(input)).status, 'budget_exhausted');
    assert.equal((await ledger.reserve({ ...input, owner: await activeBudgetOwner(pool), operation: 'global', reserved_minor: 8448 })).status, 'budget_exhausted');
  } finally { await pool.end(); }
});

test('daily per-user caps are independent, unsent reservations can be cancelled, and a cost overrun stops the policy', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, 'a'.repeat(64), () => new Date('2040-06-01T12:00:00Z'));
  const scope = randomUUID(), owner = await activeBudgetOwner(pool);
  const input = { owner, operation: 'first', policy: scope, reserved_minor: 5, limits: { ...limits, currency: scope, monthly_global_minor: 20, daily_global_minor: 20, daily_user_minor: 5, daily_user_requests: 1 } };
  try {
    const first = await ledger.reserve(input);
    assert.equal((await ledger.reserve({ ...input, operation: 'second', reserved_minor: 1 })).status, 'budget_exhausted');
    assert.equal((await ledger.reserve({ ...input, operation: 'other', owner: await activeBudgetOwner(pool) })).status, 'reserved');
    await ledger.cancelUnsent(first.id!);
    const next = await ledger.reserve({ ...input, operation: 'second' });
    assert.equal(next.status, 'reserved');
    await ledger.markSent(next.id!, 'Qwen3.5-35B-A3B');
    await ledger.settle(next.id!, 6, { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }, 'response_received', 30);
    assert.equal((await ledger.receipt(owner, 'second', scope))?.outcome, 'cost_overrun');
    assert.equal((await ledger.reserve({ ...input, operation: 'third', owner: await activeBudgetOwner(pool) })).status, 'policy_blocked');
  } finally { await pool.end(); }
});
