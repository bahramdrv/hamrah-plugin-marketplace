import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountApi } from '../src/account/api';
import { harness } from './helpers/account';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
const publicEnvironment = { VERCEL_ENV: 'production', KOOCH_ACCOUNT_MODE: 'hosted', KOOCH_APP_ORIGIN: 'https://my.kooch.app', KOOCH_RELEASE_MODE: 'public',
  KOOCH_AUTH_URL: 'https://example.supabase.co', KOOCH_AUTH_SERVICE_KEY: 'synthetic-service-key', KOOCH_DATABASE_URL: 'postgresql://runtime:synthetic@database.example/kooch', KOOCH_SESSION_ENCRYPTION_KEY: 'a'.repeat(64),
  KOOCH_MEMBERSHIP_ENABLED: 'true', KOOCH_TELEGRAM_BOT_USERNAME: 'kooch_test_bot', KOOCH_TELEGRAM_BOT_TOKEN: '123456:synthetic_token_1234567890', KOOCH_TELEGRAM_WEBHOOK_SECRET: 's'.repeat(43) };
test('public account status distinguishes a usable public release from a pilot without advertising AI or complete evidence', { skip: !enabled }, async () => {
  const h = await harness(undefined, undefined, undefined, undefined, undefined, {}, undefined, true);
  try {
    const api = createAccountApi({ store: h.store, auth: h.auth, origin: 'https://my.kooch.app', mode: 'hosted', reportAccess: h.reportAccess, releaseEnvironment: publicEnvironment });
    const response = await api.handle(new Request('https://my.kooch.app/api/account/status'), ['status']);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const status = await response.json();
    assert.equal(status.service.stage, 'public'); assert.equal(status.service.accepts_real_profiles, true);
    assert.equal(status.pilot.kind, 'self_service_noncommercial'); assert.equal(status.pilot.ai, 'disabled'); assert.equal(status.pilot.coverage, 'partial');
    assert.equal(status.service.privacy_notice_version, 'self-service-privacy-1');
    assert.doesNotMatch(JSON.stringify(status), /synthetic-service-key|synthetic_token|ssssssss/);
  } finally { await h.close(); }
});

test('a launch flag cannot make local, preview, wrong-origin or disconnected membership deployments accept real profiles', { skip: !enabled }, async () => {
  const h = await harness(undefined, undefined, undefined, undefined, undefined, {}, undefined, true);
  try {
    for (const changes of [{ VERCEL_ENV: 'preview' }, { KOOCH_APP_ORIGIN: 'https://other.example' }, { KOOCH_RELEASE_MODE: 'pilot' }, { KOOCH_TELEGRAM_BOT_TOKEN: '' }, { KOOCH_SESSION_ENCRYPTION_KEY: '' }]) {
      const api = createAccountApi({ store: h.store, auth: h.auth, origin: 'https://my.kooch.app', mode: 'hosted', reportAccess: h.reportAccess, releaseEnvironment: { ...publicEnvironment, ...changes } });
      const status = await (await api.handle(new Request('https://my.kooch.app/api/account/status'), ['status'])).json();
      assert.equal(status.service.accepts_real_profiles, false, JSON.stringify(Object.keys(changes))); assert.equal(status.service.stage, 'pilot');
    }
    for (const mode of ['local', 'hosted'] as const) {
      const api = createAccountApi({ store: h.store, auth: h.auth, origin: 'https://my.kooch.app', mode, releaseEnvironment: publicEnvironment });
      const status = await (await api.handle(new Request('https://my.kooch.app/api/account/status'), ['status'])).json();
      assert.equal(status.service.accepts_real_profiles, false);
    }
  } finally { await h.close(); }
});
