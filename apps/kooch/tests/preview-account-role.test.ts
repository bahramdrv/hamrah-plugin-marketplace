import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { AccountStore } from '../src/account/store';
import { AiBudgetLedger } from '../src/ai/budget';

const enabled = Boolean(process.env.KOOCH_MIGRATION_DATABASE_URL);
test('dedicated Preview login inherits app rights without becoming or modifying the Production login', { skip: !enabled }, async () => {
  const role = 'kooch_preview_account_api';
  const admin = new pg.Client({ connectionString: process.env.KOOCH_MIGRATION_DATABASE_URL });
  await admin.connect();
  const password = randomBytes(32).toString('hex');
  let pool: pg.Pool | undefined, created = false;
  const owner = randomUUID(), currency = randomUUID();
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}' VALID UNTIL '2099-01-01'`);
    created = true;
    await admin.query(`GRANT kooch_account_api TO ${role} WITH INHERIT TRUE, SET FALSE`);
    await admin.query(`GRANT kooch_runtime TO ${role} WITH INHERIT FALSE, SET TRUE`);
    const url = new URL(process.env.KOOCH_MIGRATION_DATABASE_URL!);
    url.username = role; url.password = password;
    pool = new pg.Pool({ connectionString: url.href, max: 1 });
    const store = new AccountStore(pool, 'd'.repeat(64));
    await store.validateRole();
    assert.equal((await pool.query('SELECT current_user')).rows[0].current_user, role);
    await assert.rejects(pool.query('SET ROLE kooch_account_api'), /permission denied/);
    await assert.rejects(pool.query('ALTER ROLE kooch_account_api CONNECTION LIMIT -1'), /permission denied/);
    const session = await store.createSession(owner, 'synthetic-preview-token', 60, 'account');
    assert.equal((await store.session(session.token)).owner, owner);
    const ledger = new AiBudgetLedger(pool, 'e'.repeat(64));
    assert.equal((await ledger.reserve({ owner, operation: 'preview', policy: 'preview-role-test', reserved_minor: 5,
      limits: { currency, monthly_global_minor: 100, daily_global_minor: 100, daily_user_minor: 100, daily_user_requests: 2, external_hold_minor: 0 } })).status, 'reserved');
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE kooch_runtime');
      assert.equal((await client.query('SELECT id FROM kooch.cases')).rowCount, 0);
      await assert.rejects(client.query('SELECT id FROM kooch.ai_budget_requests WHERE currency=$1', [currency]), /permission denied/);
    } finally { await client.query('ROLLBACK'); client.release(); }
    await admin.query(`GRANT kooch_account_api TO ${role} WITH SET TRUE`);
    await assert.rejects(store.validateRole(), /restricted account role/);
    await admin.query(`GRANT kooch_account_api TO ${role} WITH SET FALSE`);
    await admin.query(`ALTER ROLE ${role} VALID UNTIL '2000-01-01'`);
    await assert.rejects(store.validateRole(), /restricted account role/);
    await admin.query(`ALTER ROLE ${role} VALID UNTIL '2099-01-01'`);
    await admin.query(`ALTER ROLE ${role} CREATEROLE`);
    await assert.rejects(store.validateRole(), /restricted account role/);
  } finally {
    await pool?.end();
    await admin.query('DELETE FROM kooch.ai_budget_requests WHERE currency=$1', [currency]);
    await admin.query('DELETE FROM kooch.sessions WHERE owner=$1', [owner]);
    await admin.query('DELETE FROM kooch.account_state WHERE owner=$1', [owner]);
    if (created) await admin.query(`DROP ROLE ${role}`);
    await admin.end();
  }
});
