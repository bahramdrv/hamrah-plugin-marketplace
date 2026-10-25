import { pilotNotice } from './pilot';

type Environment = Readonly<Record<string, string | undefined>>;
export function serviceRelease(env: Environment = process.env) {
  const blockers: string[] = [];
  if (env.KOOCH_RELEASE_MODE !== 'public') blockers.push('launch_not_activated');
  if (env.VERCEL_ENV !== 'production' || env.KOOCH_ACCOUNT_MODE !== 'hosted' || env.KOOCH_APP_ORIGIN !== 'https://my.kooch.app') blockers.push('environment_unaccepted');
  let account = false;
  try {
    const auth = new URL(env.KOOCH_AUTH_URL ?? ''), database = new URL(env.KOOCH_DATABASE_URL ?? '');
    account = auth.protocol === 'https:' && ['postgres:', 'postgresql:'].includes(database.protocol) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && Boolean(env.KOOCH_AUTH_SERVICE_KEY) && /^[a-f0-9]{64}$/.test(env.KOOCH_SESSION_ENCRYPTION_KEY ?? '');
  } catch { /* Incomplete deployment remains a pilot. */ }
  if (!account) blockers.push('account_configuration_incomplete');
  const botId = Number((env.KOOCH_TELEGRAM_BOT_TOKEN ?? '').split(':')[0]);
  if (env.KOOCH_MEMBERSHIP_ENABLED !== 'true' || !Number.isSafeInteger(botId) || botId <= 0 || !/^[A-Za-z0-9_]{5,32}$/.test(env.KOOCH_TELEGRAM_BOT_USERNAME ?? '') ||
    !/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.KOOCH_TELEGRAM_BOT_TOKEN ?? '') || !/^[A-Za-z0-9_-]{43,256}$/.test(env.KOOCH_TELEGRAM_WEBHOOK_SECRET ?? '')) blockers.push('membership_configuration_incomplete');
  const ready = blockers.length === 0;
  return { stage: ready ? 'public' as const : 'pilot' as const, accepts_real_profiles: ready,
    privacy_notice_version: ready ? 'self-service-privacy-1' : pilotNotice.privacy_notice_version, blockers };
}

export function serviceNotice(release: ReturnType<typeof serviceRelease>) {
  return release.stage === 'public' ? { ...pilotNotice, kind: 'self_service_noncommercial', privacy_notice_version: release.privacy_notice_version } : { ...pilotNotice };
}
