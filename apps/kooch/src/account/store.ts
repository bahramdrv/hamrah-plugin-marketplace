import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AccountError, unauthorized, type CaseInput, type SavedCase } from './contract';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export type AppSession = { owner: string; accessToken: string; purpose: 'account' | 'recovery'; deleted: boolean; expiresAt: Date };

export class AccountStore {
  private key: Buffer;
  constructor(private pool: Pool, key: string, private now: () => Date = () => new Date()) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Session encryption key must be 32 bytes in hex.');
    this.key = Buffer.from(key, 'hex');
  }
  private encrypt(token: string) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const value = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), value]).toString('base64');
  }
  private decrypt(value: string) {
    const buffer = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', this.key, buffer.subarray(0, 12));
    cipher.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8');
  }
  async validateRole() {
    const { rows } = await this.pool.query(`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`);
    if (rows[0]?.rolname !== 'kooch_account_api' || rows[0]?.rolsuper || rows[0]?.rolbypassrls) throw new Error('Application connection must use the restricted account role.');
  }
  async createSession(owner: string, accessToken: string, expiresIn: number, purpose: AppSession['purpose']) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO kooch.account_state(owner) VALUES($1) ON CONFLICT DO NOTHING', [owner]);
      const state = await client.query('SELECT deleted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      if (state.rows[0].deleted_at) throw unauthorized();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(this.now().getTime() + Math.min(expiresIn, purpose === 'recovery' ? 600 : 3600) * 1000);
      await client.query('INSERT INTO kooch.sessions(token_hash,owner,provider_session,purpose,expires_at) VALUES($1,$2,$3,$4,$5)',
        [hash(token), owner, this.encrypt(accessToken), purpose, expiresAt]);
      await client.query('COMMIT'); return { token, expiresAt };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async session(token: string | undefined, allowDeleted = false): Promise<AppSession> {
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) throw unauthorized();
    const { rows } = await this.pool.query(`SELECT s.owner,s.provider_session,s.purpose,s.expires_at,a.deleted_at FROM kooch.sessions s
      JOIN kooch.account_state a ON a.owner=s.owner WHERE s.token_hash=$1 AND s.expires_at>$2`, [hash(token), this.now()]);
    const row = rows[0]; if (!row || (row.deleted_at && !allowDeleted)) throw unauthorized();
    return { owner: row.owner, accessToken: this.decrypt(row.provider_session), purpose: row.purpose, deleted: !!row.deleted_at, expiresAt: row.expires_at };
  }
  async revoke(owner: string) { await this.pool.query('DELETE FROM kooch.sessions WHERE owner=$1', [owner]); }
  async rateLimit(identity: string) {
    const key = createHmac('sha256', this.key).update(identity).digest('hex');
    const now = this.now();
    const { rows } = await this.pool.query(`INSERT INTO kooch.rate_limits(key,count,reset_at) VALUES($1,1,$3)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN kooch.rate_limits.reset_at<=$2 THEN 1 ELSE kooch.rate_limits.count+1 END,
      reset_at=CASE WHEN kooch.rate_limits.reset_at<=$2 THEN $3 ELSE kooch.rate_limits.reset_at END RETURNING count`, [key, now, new Date(now.getTime() + 10 * 60000)]);
    if (rows[0].count > (identity === 'global' ? 200 : 20)) throw new AccountError('rate_limited', 429, 'تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.');
  }
  private async owned<T>(owner: string, action: (client: PoolClient) => Promise<T>, allowDeleted = false) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const state = await client.query('SELECT deleted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      if (!state.rows[0] || (state.rows[0].deleted_at && !allowDeleted)) throw unauthorized();
      await client.query('SET LOCAL ROLE kooch_runtime');
      await client.query("SELECT set_config('kooch.owner',$1,true)", [owner]);
      await client.query('DELETE FROM kooch.cases WHERE owner=$1 AND delete_after<=$2', [owner, this.now()]);
      const result = await action(client);
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private visible(row: Record<string, any>): SavedCase {
    return { id: row.id, revision: row.revision, answers: row.answers, step: row.step,
      consent_version: row.consent_version, last_activity_at: row.last_activity_at.toISOString(), delete_after: row.delete_after.toISOString() };
  }
  async read(owner: string, id?: string) {
    return this.owned(owner, async client => {
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1 AND ($2::uuid IS NULL OR id=$2)', [owner, id ?? null]);
      if (id && !rows[0]) throw new AccountError('not_found', 404, 'پرونده در دسترس نیست.');
      return rows[0] ? this.visible(rows[0]) : null;
    });
  }
  async save(owner: string, input: CaseInput) {
    return this.owned(owner, async client => {
      const payloadHash = hash(JSON.stringify(input));
      const receipt = await client.query('SELECT * FROM kooch.requests WHERE owner=$1 AND request_id=$2', [owner, input.request_id]);
      const { rows } = await client.query('SELECT * FROM kooch.cases WHERE owner=$1', [owner]);
      const current = rows[0];
      if (receipt.rows[0]) {
        if (receipt.rows[0].payload_hash !== payloadHash) throw new AccountError('request_conflict', 409, 'این درخواست قبلاً با پاسخ دیگری ثبت شده است.');
        if (!current || receipt.rows[0].revision !== current.revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
        return this.visible(current);
      }
      if ((current?.revision ?? 0) !== input.expected_revision) throw new AccountError('revision_conflict', 409, 'پاسخ‌ها در جای دیگری تغییر کرده‌اند؛ نسخهٔ تازه را دریافت کن.');
      const now = this.now(); const deleteAfter = new Date(now.getTime() + 90 * 86400000);
      const saved = await client.query(`INSERT INTO kooch.cases(owner,answers,step,consent_version,consented_at,last_activity_at,delete_after)
        VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT(owner) DO UPDATE SET answers=$2,step=$3,
        revision=kooch.cases.revision+1,consent_version=$4,last_activity_at=$5,delete_after=$6 RETURNING *`,
      [owner, input.answers, input.step, input.consent, now, deleteAfter]);
      const row = saved.rows[0];
      await client.query('INSERT INTO kooch.requests(owner,request_id,payload_hash,case_id,revision) VALUES($1,$2,$3,$4,$5)',
        [owner, input.request_id, payloadHash, row.id, row.revision]);
      return this.visible(row);
    });
  }
  async beginDelete(owner: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE kooch.account_state SET deleted_at=COALESCE(deleted_at,$2) WHERE owner=$1', [owner, this.now()]);
      await client.query('SET LOCAL ROLE kooch_runtime'); await client.query("SELECT set_config('kooch.owner',$1,true)", [owner]);
      await client.query('DELETE FROM kooch.cases WHERE owner=$1', [owner]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async finishDelete(owner: string) {
    await this.pool.query('UPDATE kooch.account_state SET auth_deleted=true WHERE owner=$1', [owner]);
    await this.revoke(owner);
  }
  async purgeInactive() {
    const { rows } = await this.pool.query('SELECT owner FROM kooch.account_state WHERE deleted_at IS NULL');
    for (const row of rows) await this.owned(row.owner, async () => {});
    await this.pool.query('DELETE FROM kooch.sessions WHERE expires_at<=$1', [this.now()]);
    await this.pool.query('DELETE FROM kooch.rate_limits WHERE reset_at<=$1', [this.now()]);
  }
}
