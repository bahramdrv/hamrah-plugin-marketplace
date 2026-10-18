import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const enabled = Boolean(process.env.KOOCH_MIGRATION_DATABASE_URL);
test('scheduled cleanup is bounded, cascades expired receipts and preserves active data and activity dates', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_MIGRATION_DATABASE_URL });
  const schema = `retention_${randomUUID().replaceAll('-', '')}`;
  const query = (sql: string, values?: unknown[]) => pool.query(sql.replaceAll('kooch.', `${schema}.`), values);
  const owners = Array.from({ length: 502 }, () => randomUUID());
  const activeOwner = owners[501]; const key = `retention-test-${randomUUID()}`;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    for (const table of ['account_state', 'cases', 'requests', 'sessions', 'rate_limits', 'ai_budget_requests']) {
      await pool.query(`CREATE TABLE ${schema}.${table} (LIKE kooch.${table} INCLUDING ALL)`);
    }
    await pool.query(`ALTER TABLE ${schema}.requests ADD FOREIGN KEY(case_id) REFERENCES ${schema}.cases(id) ON DELETE CASCADE`);
    await query('INSERT INTO kooch.account_state(owner) SELECT unnest($1::uuid[])', [owners]);
    await query(`INSERT INTO kooch.cases(owner,answers,step,consent_version,consented_at,last_activity_at,delete_after)
      SELECT owner,'{}',0,'account-save-1',now()-interval '91 days',now()-interval '91 days',
        CASE WHEN owner=$2::uuid THEN now()+interval '1 day' ELSE now()-interval '1 day' END
      FROM unnest($1::uuid[]) AS owner`, [owners, activeOwner]);
    const before = await query('SELECT id,last_activity_at,delete_after FROM kooch.cases WHERE owner=$1', [activeOwner]);
    await query(`INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision)
      SELECT owner,gen_random_uuid(),'synthetic',id,1 FROM kooch.cases WHERE owner=ANY($1::uuid[])`, [owners]);
    await query(`INSERT INTO kooch.sessions(token_hash,owner,provider_session,purpose,expires_at) VALUES
      ($1,$3,'synthetic','account',now()-interval '1 day'),($2,$3,'synthetic','account',now()+interval '1 day')`, [key, `${key}-active`, activeOwner]);
    await query(`INSERT INTO kooch.rate_limits(key,count,reset_at) VALUES ($1,1,now()-interval '1 day'),($2,1,now()+interval '1 day')`, [key, `${key}-active`]);
    await query(`INSERT INTO kooch.ai_budget_requests(id,subject,policy,currency,reserved_minor,charged_minor,state,blocked,created_at,updated_at) VALUES
      (repeat('1',64),repeat('a',64),'old','TST',10,4,'settled',false,now()-interval '100 days',now()-interval '100 days'),
      (repeat('2',64),repeat('a',64),'unknown','TST',10,NULL,'unknown',false,now()-interval '100 days',now()-interval '100 days'),
      (repeat('3',64),repeat('a',64),'blocked','TST',10,11,'settled',true,now()-interval '100 days',now()-interval '100 days'),
      (repeat('4',64),repeat('a',64),'recent','TST',10,4,'settled',false,now(),now())`);
    await query('UPDATE kooch.ai_budget_requests SET operation_hash=id');
    const sql = await readFile(new URL('../db/retention-cleanup.sql', import.meta.url), 'utf8');
    await query(sql);
    const accounting = await query('SELECT policy,subject,operation_hash FROM kooch.ai_budget_requests ORDER BY policy');
    assert.deepEqual(accounting.rows.map(r => r.policy), ['blocked','recent','unknown']);
    assert.equal(accounting.rows.find(r => r.policy === 'unknown').subject, '0'.repeat(64));
    assert.equal(accounting.rows.find(r => r.policy === 'blocked').subject, '0'.repeat(64));
    assert.equal(accounting.rows.find(r => r.policy === 'recent').subject, 'a'.repeat(64));
    assert.equal(accounting.rows.find(r => r.policy === 'unknown').operation_hash, null);
    assert.equal(accounting.rows.find(r => r.policy === 'blocked').operation_hash, null);
    assert.equal(accounting.rows.find(r => r.policy === 'recent').operation_hash, '4'.repeat(64));
    assert.equal(Number((await query('SELECT count(*) FROM kooch.cases WHERE owner=ANY($1::uuid[])', [owners])).rows[0].count), 2);
    await query(sql);
    assert.equal(Number((await query('SELECT count(*) FROM kooch.cases WHERE owner=ANY($1::uuid[])', [owners])).rows[0].count), 1);
    const after = await query('SELECT id,last_activity_at,delete_after FROM kooch.cases WHERE owner=$1', [activeOwner]);
    assert.deepEqual(after.rows, before.rows);
    assert.equal(Number((await query('SELECT count(*) FROM kooch.requests WHERE owner=ANY($1::uuid[])', [owners])).rows[0].count), 1);
    assert.deepEqual((await query('SELECT token_hash FROM kooch.sessions WHERE owner=$1', [activeOwner])).rows.map(r => r.token_hash), [`${key}-active`]);
    assert.deepEqual((await query('SELECT key FROM kooch.rate_limits WHERE key=ANY($1::text[])', [[key, `${key}-active`]])).rows.map(r => r.key), [`${key}-active`]);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
