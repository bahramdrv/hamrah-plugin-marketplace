import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AuthProvider } from '../src/account/auth';
import { GoogleOAuth } from '../src/account/google';

const origin = 'https://my.kooch.app';
const session = { access_token: 'synthetic-access-token', expires_in: 3600,
  user: { id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.test', email_confirmed_at: '2026-10-17T00:00:00Z' } };
function setup() {
  let now = Date.parse('2026-10-17T00:00:00Z');
  const requests: { url: string; body: Record<string, string>; headers: Headers }[] = [];
  const auth = new AuthProvider({ url: 'https://project.supabase.co/auth/v1', origin,
    key: 'sb_publishable_synthetic', serviceKey: 'sb_secret_synthetic',
    fetch: async (url, init) => { requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) }); return Response.json(session); } });
  return { flow: new GoogleOAuth({ auth, origin, key: 'ab'.repeat(32), secure: true, now: () => now }), requests,
    advance() { now += 601000; } };
}
test('Google sign-in exchanges a browser-bound PKCE code without exposing provider tokens to the browser', async () => {
  const { flow, requests } = setup();
  const start = flow.begin(); const target = new URL(start.url);
  assert.equal(target.origin, 'https://project.supabase.co');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), `${origin}/api/account/google-callback`);
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.match(start.cookie, /HttpOnly/); assert.match(start.cookie, /Secure/); assert.match(start.cookie, /SameSite=Lax/);
  assert.match(start.cookie, /Max-Age=600/);
  const result = await flow.complete(new Request(`${origin}/api/account/google-callback?code=synthetic-code`, { headers: { cookie: start.cookie.split(';')[0] } }));
  assert.equal(result.session.user.email, 'synthetic@example.test');
  assert.equal(requests[0].url, 'https://project.supabase.co/auth/v1/token?grant_type=pkce');
  assert.equal(requests[0].body.auth_code, 'synthetic-code');
  assert.equal(createHash('sha256').update(requests[0].body.code_verifier).digest('base64url'), target.searchParams.get('code_challenge'));
  assert.equal(requests[0].headers.get('apikey'), 'sb_publishable_synthetic');
  assert.equal(requests[0].headers.get('authorization'), null);
  assert.ok(!start.url.includes('code_verifier')); assert.ok(!start.cookie.includes(session.access_token));
});
test('missing, tampered and expired Google login cookies never reach the Auth provider', async () => {
  const { flow, requests, advance } = setup(); const start = flow.begin();
  const cookie = start.cookie.split(';')[0];
  const callback = (value: string) => new Request(`${origin}/api/account/google-callback?code=synthetic-code`, { headers: { cookie: value } });
  await assert.rejects(flow.complete(callback('')));
  await assert.rejects(flow.complete(callback(`${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}`)));
  advance(); await assert.rejects(flow.complete(callback(cookie)));
  assert.equal(requests.length, 0);
});
test('Google cancellation, missing code and oversized callbacks cannot create a session', async () => {
  const { flow, requests } = setup(); const cookie = flow.begin().cookie.split(';')[0];
  for (const query of ['error=access_denied', '', `code=${'x'.repeat(2049)}`]) {
    await assert.rejects(flow.complete(new Request(`${origin}/api/account/google-callback?${query}`, { headers: { cookie } })));
  }
  assert.equal(requests.length, 0);
});

test('Google deletion proof binds the reauthenticated owner and original app session and expires', async () => {
  const { flow, advance } = setup(); const owner = session.user.id;
  const start = flow.beginDeletion(owner, 'original-app-session');
  const result = await flow.complete(new Request(`${origin}/api/account/google-callback?code=synthetic-code`, { headers: { cookie: start.cookie.split(';')[0] } }));
  assert.ok(result.deletionCookie);
  const request = new Request(`${origin}/api/account/delete`, { headers: { cookie: result.deletionCookie.split(';')[0] } });
  assert.equal(flow.isDeletionAuthorized(request, owner, 'original-app-session'), true);
  assert.equal(flow.isDeletionAuthorized(request, owner, 'another-session'), false);
  assert.equal(flow.isDeletionAuthorized(request, '00000000-0000-4000-8000-000000000002', 'original-app-session'), false);
  advance(); assert.equal(flow.isDeletionAuthorized(request, owner, 'original-app-session'), false);
});
test('Google deletion reauthentication refuses a different Google account', async () => {
  const { flow } = setup();
  const start = flow.beginDeletion('00000000-0000-4000-8000-000000000002', 'original-app-session');
  await assert.rejects(flow.complete(new Request(`${origin}/api/account/google-callback?code=synthetic-code`, { headers: { cookie: start.cookie.split(';')[0] } })));
});
