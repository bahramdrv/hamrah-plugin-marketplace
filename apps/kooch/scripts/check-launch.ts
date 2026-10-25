// Read-only launch checks. Credentials and provider error bodies are never printed.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { TelegramBot } from '../src/membership/telegram';
import { channelId } from '../src/membership/contract';

async function main() {
  const phase = process.argv[2];
  if (phase === '--database') {
    const source = new URL(process.env.KOOCH_BACKUP_DATABASE_URL ?? '');
    if (source.hostname !== 'aws-0-eu-west-1.pooler.supabase.com' || decodeURIComponent(source.username) !== 'postgres.ifjtceqlcsmypuuflwlx' || source.search || !process.env.KOOCH_BACKUP_CA_FILE) throw new Error();
    const db = new pg.Client({ connectionString: source.href, ssl: { rejectUnauthorized: true, ca: await readFile(process.env.KOOCH_BACKUP_CA_FILE, 'utf8') }, connectionTimeoutMillis: 15000, statement_timeout: 15000 });
    try {
      await db.connect(); await db.query('BEGIN READ ONLY');
      const membership = await db.query("SELECT to_regclass('kooch.membership_challenges') IS NOT NULL AS installed");
      const columns = await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='kooch' AND table_name='account_state' AND column_name IN ('report_access_granted_at','report_access_basis','instagram_declared_at')");
      const security = await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='kooch' AND c.relname IN ('cases','reports','report_explanations') AND c.relrowsecurity AND c.relforcerowsecurity");
      const role = await db.query("SELECT NOT rolsuper AND NOT rolbypassrls AS limited FROM pg_roles WHERE rolname='kooch_account_api'");
      const retention = await db.query("SELECT active AND position('membership_challenges' IN command)>0 AS current FROM cron.job WHERE jobname='kooch-retention-hourly'");
      await db.query('COMMIT');
      const checks = { membership_migrated: membership.rows[0]?.installed === true && columns.rows[0]?.n === 3, private_tables_force_rls: security.rows[0]?.n === 3, runtime_role_limited: role.rows[0]?.limited === true, retention_job_updated: retention.rows[0]?.current === true };
      console.log(JSON.stringify({ phase: 'database', checked_at: new Date().toISOString(), checks, ready: Object.values(checks).every(Boolean) }));
      if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
    } finally { await db.end(); }
    return;
  }
  if (phase !== '--live') throw new Error();
  const origin = 'https://my.kooch.app';
  const statusResponse = await fetch(`${origin}/api/account/status`, { cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!statusResponse.ok) throw new Error();
  const status = await statusResponse.json();
  const bot = new TelegramBot(process.env.KOOCH_TELEGRAM_BOT_TOKEN ?? '');
  const identity = await bot.call('getMe', {});
  const admin = await bot.call('getChatMember', { chat_id: channelId, user_id: bot.id });
  const webhook = await bot.call('getWebhookInfo', {});
  const checks = { account_connected: status.configured === true && status.mode === 'hosted' && status.email_delivery === 'configured', public_release: status.service?.stage === 'public' && status.service?.accepts_real_profiles === true,
    membership_enabled: status.membership_enabled === true, bot_identity: identity?.username === process.env.KOOCH_TELEGRAM_BOT_USERNAME, channel_admin: ['administrator', 'creator'].includes(admin?.status), webhook_registered: webhook?.url === `${origin}/api/telegram` && !webhook?.last_error_date };
  console.log(JSON.stringify({ phase: 'live', checked_at: new Date().toISOString(), checks, ready: Object.values(checks).every(Boolean) }));
  if (!Object.values(checks).every(Boolean)) process.exitCode = 2;
}
main().catch(() => { console.error('Launch check failed. Check the private configuration and provider availability; no credentials or provider bodies are logged.'); process.exitCode = 1; });
