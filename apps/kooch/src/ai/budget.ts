import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { gatewayPolicySchema, usageCost, type GatewayPolicy } from './policy';

export type BudgetLimits = { currency: string; monthly_global_minor: number; daily_global_minor: number; daily_user_minor: number; daily_user_requests: number; external_hold_minor: number };
export type ReservationInput = { owner: string; operation: string; policy: string; reserved_minor: number; limits: BudgetLimits; tariff?: NonNullable<GatewayPolicy['tariff']>; draft?: { case_id: string; revision: number; id: string } };
export type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };
type Receipt = { id: string; state: 'reserved' | 'sent' | 'unknown' | 'settled' | 'cancelled'; reserved_minor: number; charged_minor: number | null; usage: Usage | null; outcome: string | null };
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;

export class AiBudgetLedger {
  constructor(private pool: Pool, private key: string, private now: () => Date = () => new Date()) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid accounting key.');
  }
  private subject(owner: string) { return createHmac('sha256', this.key).update(`ai-budget:${owner}`).digest('hex'); }
  private operationHash(owner: string, operation: string, policy: string) { return createHash('sha256').update(JSON.stringify([this.subject(owner), operation, policy])).digest('hex'); }
  private async transaction<T>(action: (db: PoolClient) => Promise<T>, wait = false): Promise<T | null> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout='1000ms'");
      // No public generation queue: contention immediately falls back to the fixed form.
      if (wait) {
        await db.query("SET LOCAL lock_timeout='500ms'");
        await db.query('SELECT pg_advisory_xact_lock(18051005)');
      } else {
        const lock = await db.query('SELECT pg_try_advisory_xact_lock(18051005) AS locked');
        if (!lock.rows[0].locked) { await db.query('ROLLBACK'); return null; }
      }
      const result = await action(db);
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async reserve(input: ReservationInput): Promise<{ status: 'reserved' | 'duplicate' | 'budget_exhausted' | 'busy' | 'cooldown' | 'policy_blocked' | 'owner_unavailable'; id?: string }> {
    const { limits } = input;
    if (![input.reserved_minor, limits.monthly_global_minor, limits.daily_global_minor, limits.daily_user_minor, limits.daily_user_requests, limits.external_hold_minor].every(integer)) throw Error('Invalid accounting limits.');
    if (input.reserved_minor === 0 || Math.min(limits.monthly_global_minor, limits.daily_global_minor, limits.daily_user_minor, limits.daily_user_requests) === 0) return { status: 'budget_exhausted' };
    const operationHash = this.operationHash(input.owner, input.operation, input.policy), subject = this.subject(input.owner), now = this.now();
    return await this.transaction(async db => {
      // Share AccountStore's owner lock: deletion either waits for this insert and
      // erases it, or commits first and prevents any later identity-bearing insert.
      const owner = await db.query('SELECT owner FROM kooch.account_state WHERE owner=$1 AND deleted_at IS NULL FOR UPDATE', [input.owner]);
      if (!owner.rowCount) return { status: 'owner_unavailable' as const };
      const existing = await db.query('SELECT id FROM kooch.ai_budget_requests WHERE operation_hash=$1', [operationHash]);
      if (existing.rowCount) return { status: 'duplicate' as const, id: existing.rows[0].id as string };
      const gates = await db.query(`SELECT bool_or(blocked) AS blocked, max(retry_after) AS retry_after FROM kooch.ai_budget_requests WHERE policy=$1`, [input.policy]);
      if (gates.rows[0].blocked) return { status: 'policy_blocked' as const };
      if (gates.rows[0].retry_after > now) return { status: 'cooldown' as const };
      const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
      const month = new Date(day); month.setUTCDate(1);
      const sums = await db.query(`SELECT
        coalesce(sum(CASE WHEN state='settled' THEN charged_minor ELSE reserved_minor END) FILTER(WHERE created_at >= $2 OR state IN ('reserved','sent','unknown')),0) AS month,
        coalesce(sum(CASE WHEN state='settled' THEN charged_minor ELSE reserved_minor END) FILTER(WHERE created_at >= $3 OR state IN ('reserved','sent','unknown')),0) AS day,
        coalesce(sum(CASE WHEN state='settled' THEN charged_minor ELSE reserved_minor END) FILTER(WHERE subject=$4 AND (created_at >= $3 OR state IN ('reserved','sent','unknown'))),0) AS user_day,
        count(*) FILTER(WHERE subject=$4 AND (created_at >= $3 OR state IN ('reserved','sent','unknown'))) AS user_requests
        FROM kooch.ai_budget_requests WHERE currency=$1 AND state<>'cancelled'`, [limits.currency, month, day, subject]);
      const detached = await db.query(`SELECT coalesce(sum(held_minor + CASE WHEN day >= $3::date THEN charged_minor ELSE 0 END),0) AS amount,
        coalesce(sum(held_requests + CASE WHEN day >= $3::date THEN requests ELSE 0 END),0) AS requests
        FROM kooch.ai_detached_quota WHERE subject=$1 AND currency=$2`, [subject, limits.currency, day]);
      sums.rows[0].user_day = BigInt(sums.rows[0].user_day) + BigInt(detached.rows[0].amount);
      sums.rows[0].user_requests = BigInt(sums.rows[0].user_requests) + BigInt(detached.rows[0].requests);
      const s = sums.rows[0], reservation = BigInt(input.reserved_minor);
      // Unreconciled acceptance calls made outside this ledger share the same budget.
      const external = BigInt(limits.external_hold_minor);
      if (BigInt(s.month) + external + reservation > BigInt(limits.monthly_global_minor) || BigInt(s.day) + external + reservation > BigInt(limits.daily_global_minor) ||
          BigInt(s.user_day) + reservation > BigInt(limits.daily_user_minor) || BigInt(s.user_requests) >= BigInt(limits.daily_user_requests)) return { status: 'budget_exhausted' as const };
      const id = randomBytes(32).toString('hex');
      if (input.draft) {
        // Bind the anonymous receipt before sending, under the same owner lock
        // as case edits. Deleting a pending draft can now detach it immediately.
        await db.query('SET LOCAL ROLE kooch_runtime');
        await db.query("SELECT set_config('kooch.owner',$1,true)", [input.owner]);
        const bound = await db.query(`UPDATE kooch.cases SET form=jsonb_set(form,'{draft}',(form->'draft') || jsonb_build_object('accounting_policy',$5::text,'accounting_id',$6::text))
          WHERE owner=$1 AND id=$2 AND revision=$3 AND form->'draft'->>'id'=$4 AND form->'draft'->>'status'='pending' RETURNING id`,
        [input.owner, input.draft.case_id, input.draft.revision, input.draft.id, input.policy, id]);
        await db.query('SET LOCAL ROLE NONE');
        if (!bound.rowCount) return { status: 'owner_unavailable' as const };
      }
      await db.query(`INSERT INTO kooch.ai_budget_requests(id,subject,policy,currency,reserved_minor,state,created_at,updated_at,tariff,operation_hash) VALUES($1,$2,$3,$4,$5,'reserved',$6,$6,$7,$8)`,
        [id, subject, input.policy, limits.currency, input.reserved_minor, now, input.tariff ?? null, operationHash]);
      return { status: 'reserved' as const, id };
    }) ?? { status: 'busy' };
  }
  async receipt(owner: string, operation: string, policy: string): Promise<Receipt | null> {
    const { rows } = await this.pool.query('SELECT id,state,reserved_minor,charged_minor,usage,outcome FROM kooch.ai_budget_requests WHERE operation_hash=$1 AND subject=$2', [this.operationHash(owner, operation, policy), this.subject(owner)]);
    const row = rows[0];
    return row ? { ...row, reserved_minor: Number(row.reserved_minor), charged_minor: row.charged_minor === null ? null : Number(row.charged_minor) } : null;
  }
  async markSent(id: string, model: string) {
    const result = await this.pool.query("UPDATE kooch.ai_budget_requests SET state='sent',requested_model=$2,updated_at=$3 WHERE id=$1 AND state='reserved' RETURNING id", [id, model, this.now()]);
    return result.rowCount === 1;
  }
  // Caller must prove that no transport invocation took place, even if markSent ran.
  async cancelUnsent(id: string) {
    await this.transaction(async db => {
      await db.query("UPDATE kooch.ai_budget_requests SET state='cancelled',outcome='not_sent',updated_at=$2 WHERE id=$1 AND state IN ('reserved','sent')", [id, this.now()]);
    }, true);
  }
  async markUnknown(id: string, outcome: string, latency: number, gates: { blocked?: boolean; retryAfter?: Date } = {}) {
    await this.transaction(async db => {
      await db.query(`UPDATE kooch.ai_budget_requests SET state='unknown',outcome=$2,latency_ms=$3,blocked=blocked OR $4,
        retry_after=greatest(retry_after,$5),updated_at=$6 WHERE id=$1 AND state IN ('sent','unknown')`,
      [id, outcome, Math.max(0, Math.round(latency)), gates.blocked ?? false, gates.retryAfter ?? null, this.now()]);
    }, true);
  }
  async recordOutcome(id: string, outcome: string, latency: number) {
    await this.pool.query(`UPDATE kooch.ai_budget_requests SET outcome=CASE WHEN blocked THEN outcome ELSE $2 END,
      latency_ms=$3 WHERE id=$1 AND state='settled'`, [id, outcome, Math.max(0, Math.round(latency))]);
  }
  async settle(id: string, charged: number, usage: Usage, outcome: string, latency: number, reportedModel = 'Qwen3.5-35B-A3B') {
    if (!integer(charged) || ![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(integer) || usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) throw Error('Invalid settlement.');
    await this.transaction(async db => {
      const { rows } = await db.query('SELECT state,charged_minor,usage,reserved_minor,tariff FROM kooch.ai_budget_requests WHERE id=$1 FOR UPDATE', [id]);
      const row = rows[0];
      if (!row || !['sent','unknown','settled'].includes(row.state)) throw Error('Request was not sent.');
      if (row.tariff && usageCost({ tariff: gatewayPolicySchema.shape.tariff.unwrap().parse(row.tariff) }, usage) !== charged) throw Error('Historical tariff mismatch.');
      if (row.state === 'settled') {
        if (Number(row.charged_minor) !== charged || row.usage.prompt_tokens !== usage.prompt_tokens || row.usage.completion_tokens !== usage.completion_tokens) throw Error('Settlement conflict.');
        return;
      }
      const overrun = charged > Number(row.reserved_minor);
      await db.query(`UPDATE kooch.ai_budget_requests SET state='settled',charged_minor=$2,usage=$3,outcome=$4,
        latency_ms=$5,reported_model=$6,blocked=blocked OR $7,updated_at=$8 WHERE id=$1`,
      [id, charged, usage, overrun ? 'cost_overrun' : outcome, Math.max(0, Math.round(latency)), reportedModel, overrun, this.now()]);
    }, true);
  }
  async reconcile(id: string, usage: Usage, reference: string) {
    if (!/^[a-f0-9]{64}$/.test(id) || !reference.trim() || reference.length > 500) throw Error('Reconciliation requires a billing reference.');
    const { rows } = await this.pool.query('SELECT tariff,requested_model FROM kooch.ai_budget_requests WHERE id=$1', [id]);
    if (!rows[0]?.tariff) throw Error('Original tariff unavailable.');
    const tariff = gatewayPolicySchema.shape.tariff.unwrap().parse(rows[0].tariff);
    await this.settle(id, usageCost({ tariff }, usage), usage, 'reconciled', 0, rows[0].requested_model);
    await this.pool.query('UPDATE kooch.ai_budget_requests SET reconciliation_hash=$2 WHERE id=$1', [id, createHash('sha256').update(reference).digest('hex')]);
  }
  async detachOperation(owner: string, operation: string, policy: string, client?: PoolClient) {
    const detach = async (db: PoolClient) => {
      const subject = this.subject(owner);
      const state = await db.query('SELECT deleted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      const active = state.rowCount && !state.rows[0].deleted_at;
      const result = await db.query('SELECT * FROM kooch.ai_budget_requests WHERE operation_hash=$1 AND subject=$2 FOR UPDATE', [this.operationHash(owner, operation, policy), subject]);
      const row = result.rows[0]; if (!row) return;
      if (active && row.state !== 'cancelled') {
        const settled = row.state === 'settled';
        await db.query(`INSERT INTO kooch.ai_detached_quota(subject,currency,day,charged_minor,held_minor,requests,held_requests)
          VALUES($1,$2,($3::timestamptz AT TIME ZONE 'UTC')::date,$4,$5,$6,$7)
          ON CONFLICT(subject,currency,day) DO UPDATE SET charged_minor=kooch.ai_detached_quota.charged_minor+EXCLUDED.charged_minor,
          held_minor=kooch.ai_detached_quota.held_minor+EXCLUDED.held_minor,requests=kooch.ai_detached_quota.requests+EXCLUDED.requests,
          held_requests=kooch.ai_detached_quota.held_requests+EXCLUDED.held_requests`,
        [subject, row.currency, row.created_at, settled ? row.charged_minor : 0, settled ? 0 : row.reserved_minor, settled ? 1 : 0, settled ? 0 : 1]);
      }
      // Random id remains usable for late settlement. Quota totals deliberately
      // have no receipt link; an unknown detached charge keeps a conservative hold.
      await db.query("UPDATE kooch.ai_budget_requests SET subject=repeat('0',64),operation_hash=NULL WHERE id=$1", [row.id]);
    };
    // A case mutation supplies its already owner-locked transaction so erasing
    // a draft and detaching its billing receipt commit or roll back together.
    if (client) {
      // Case storage is currently using the narrower RLS runtime role. Return
      // briefly to the validated login role (including scoped Preview logins),
      // then restore case RLS before the caller continues its mutation.
      await client.query('SET LOCAL ROLE NONE');
      await detach(client);
      await client.query('SET LOCAL ROLE kooch_runtime');
    } else await this.transaction(detach, true);
  }
  async exportOwner(owner: string) {
    const { rows } = await this.pool.query(`SELECT policy,currency,state,reserved_minor,charged_minor,usage,outcome,created_at,updated_at FROM kooch.ai_budget_requests WHERE subject=$1 ORDER BY created_at`, [this.subject(owner)]);
    return rows;
  }
  async forgetOwner(owner: string) {
    await this.pool.query('DELETE FROM kooch.ai_detached_quota WHERE subject=$1', [this.subject(owner)]);
    // Random receipt ids remain usable for late billing; both identity links are erased.
    await this.pool.query("UPDATE kooch.ai_budget_requests SET subject=repeat('0',64),operation_hash=NULL WHERE subject=$1", [this.subject(owner)]);
  }
  async purgeClosed() {
    const cutoff = new Date(this.now().getTime() - 90 * 86400000);
    await this.pool.query('DELETE FROM kooch.ai_detached_quota WHERE day<$1::date', [cutoff]);
    await this.pool.query("UPDATE kooch.ai_budget_requests SET subject=repeat('0',64),operation_hash=NULL WHERE id IN (SELECT id FROM kooch.ai_budget_requests WHERE updated_at<$1 AND subject<>repeat('0',64) ORDER BY updated_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED)", [cutoff]);
    await this.pool.query("DELETE FROM kooch.ai_budget_requests WHERE id IN (SELECT id FROM kooch.ai_budget_requests WHERE state IN ('settled','cancelled') AND NOT blocked AND updated_at<$1 ORDER BY updated_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED)", [cutoff]);
  }
}
