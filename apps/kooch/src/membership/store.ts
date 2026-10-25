import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AccountError, unauthorized } from '../account/contract';
import { channelUrl, instagramUrl, type ReportAccessStatus } from './contract';

export class ReportAccess {
  constructor(private pool: Pool, private key: string, private botUsername?: string, private now: () => Date = () => new Date()) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid membership signing key.');
    if (botUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(botUsername)) throw new Error('Invalid bot username.');
  }
  private digest(value: string) { return createHmac('sha256', Buffer.from(this.key, 'hex')).update(`kooch-membership-1:${value}`).digest('hex'); }
  private tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private invalidCode() { return new AccountError('invalid_membership_code', 400, 'کد معتبر نیست، منقضی شده یا تلاش‌ها تمام شده‌اند؛ از همین صفحه دوباره کد بگیر.'); }
  private async owned<T>(owner: string, action: (client: PoolClient, granted: boolean) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT deleted_at, report_access_granted_at FROM kooch.account_state WHERE owner=$1 FOR UPDATE', [owner]);
      if (!rows[0] || rows[0].deleted_at) throw unauthorized();
      const result = await action(client, Boolean(rows[0].report_access_granted_at));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async status(owner: string): Promise<ReportAccessStatus> {
    const { rows } = await this.pool.query('SELECT deleted_at, report_access_granted_at FROM kooch.account_state WHERE owner=$1', [owner]);
    if (!rows[0] || rows[0].deleted_at) throw unauthorized();
    const pending = await this.pool.query('SELECT expires_at FROM kooch.membership_challenges WHERE owner=$1 AND expires_at>$2 AND attempts<5', [owner, this.now()]);
    return { unlocked: Boolean(rows[0].report_access_granted_at), available: Boolean(this.botUsername), channel_url: channelUrl, instagram_url: instagramUrl,
      ...(pending.rows[0] ? { expires_at: pending.rows[0].expires_at.toISOString() } : {}) };
  }
  async start(owner: string) {
    if (!this.botUsername) throw new AccountError('membership_unavailable', 503, 'ربات فعلاً آماده نیست؛ پاسخ‌هایت محفوظ‌اند. کمی بعد دوباره تلاش کن.');
    return this.owned(owner, async (client, granted) => {
      if (granted) return { unlocked: true };
      const token = randomBytes(32).toString('base64url');
      const now = this.now(), expiresAt = new Date(now.getTime() + 10 * 60000);
      await client.query('UPDATE kooch.account_state SET instagram_declared_at=$2 WHERE owner=$1', [owner, now]);
      await client.query(`INSERT INTO kooch.membership_challenges(owner,token_hash,expires_at) VALUES($1,$2,$3)
        ON CONFLICT(owner) DO UPDATE SET token_hash=$2,expires_at=$3,telegram_hash=NULL,code_hash=NULL,attempts=0`, [owner, this.tokenHash(token), expiresAt]);
      return { unlocked: false, bot_url: `https://t.me/${this.botUsername}?start=${token}`, expires_at: expiresAt.toISOString() };
    });
  }
  // Called only after the trusted Telegram adapter confirms actual membership.
  async issueCode(token: string, userId: number) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw this.invalidCode();
    const tokenHash = this.tokenHash(token);
    const found = await this.pool.query('SELECT owner FROM kooch.membership_challenges WHERE token_hash=$1', [tokenHash]);
    if (!found.rows[0]) throw this.invalidCode();
    return this.owned(found.rows[0].owner, async (client, granted) => {
      const { rows } = await client.query('SELECT * FROM kooch.membership_challenges WHERE owner=$1 AND token_hash=$2', [found.rows[0].owner, tokenHash]);
      const row = rows[0], telegramHash = this.digest(`telegram:${userId}`);
      if (granted || !row || row.expires_at <= this.now() || row.attempts >= 5 || (row.telegram_hash && row.telegram_hash !== telegramHash)) throw this.invalidCode();
      // Stable for webhook retries; raw codes and numeric Telegram IDs are never stored.
      const code = String(parseInt(this.digest(`code:${token}:${userId}`).slice(0, 12), 16) % 100000000).padStart(8, '0');
      await client.query('UPDATE kooch.membership_challenges SET telegram_hash=$2,code_hash=$3 WHERE owner=$1', [row.owner, telegramHash, this.digest(`redeem:${row.owner}:${tokenHash}:${code}`)]);
      return code;
    });
  }
  async redeem(owner: string, code: string) {
    const accepted = await this.owned(owner, async (client, granted) => {
      if (granted) return true;
      const { rows } = await client.query('SELECT * FROM kooch.membership_challenges WHERE owner=$1', [owner]);
      const row = rows[0];
      if (!row || row.expires_at <= this.now() || row.attempts >= 5) return false;
      const submitted = this.digest(`redeem:${owner}:${row.token_hash}:${code}`);
      if (!row.code_hash || !timingSafeEqual(Buffer.from(submitted), Buffer.from(row.code_hash))) {
        await client.query('UPDATE kooch.membership_challenges SET attempts=attempts+1 WHERE owner=$1', [owner]);
        return false; // Commit the failed attempt before returning the error.
      }
      await client.query("UPDATE kooch.account_state SET report_access_granted_at=$2,report_access_basis='telegram' WHERE owner=$1", [owner, this.now()]);
      await client.query('DELETE FROM kooch.membership_challenges WHERE owner=$1', [owner]);
      return true;
    });
    if (!accepted) throw this.invalidCode();
    return this.status(owner);
  }
}
