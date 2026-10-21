import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { createAccountApi } from '../src/account/api';
import { AuthProvider } from '../src/account/auth';
import { AccountStore } from '../src/account/store';
import { harness, saveInput } from './helpers/account';
import { GoogleOAuth } from '../src/account/google';

const enabled = Boolean(process.env.KOOCH_DATABASE_URL);
test('Google callback creates the ordinary account session, clears PKCE state and refuses replay or foreign starts', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const owner = await h.verifiedClient(); const providerSession = await h.auth.signin(owner.email, owner.password);
    let redeemed = false;
    const auth = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100',
      fetch: async (url, init) => {
        if (String(url).endsWith('/token?grant_type=pkce')) {
          if (redeemed) return Response.json({ error: 'invalid_grant' }, { status: 400 });
          redeemed = true; return Response.json(providerSession);
        }
        return fetch(url, init);
      } });
    const origin = 'http://127.0.0.1:3100';
    const api = createAccountApi({ store: h.store, auth, origin, mode: 'local',
      google: new GoogleOAuth({ auth, origin, key: 'ab'.repeat(32), secure: false }) });
    const startRequest = (source = origin, body: unknown = {}) => api.handle(new Request(`${origin}/api/account/google`, {
      method: 'POST', headers: { origin: source, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), ['google']);
    assert.equal((await startRequest('https://foreign.example')).status, 403);
    assert.equal((await startRequest(origin, { next: 'https://foreign.example' })).status, 400);
    const start = await startRequest(); assert.equal(start.status, 200);
    const pendingCookie = start.headers.get('set-cookie')!.split(';')[0];
    const callback = (cookie: string) => api.handle(new Request(`${origin}/api/account/google-callback?code=synthetic-code&next=https://foreign.example`,
      { headers: { cookie } }), ['google-callback']);
    const missing = await callback(''); assert.equal(missing.status, 303);
    assert.equal(missing.headers.get('location'), `${origin}/account?signin=google-failed`);
    assert.ok(!missing.headers.getSetCookie().some(value => value.startsWith('kooch_session=')));
    // Unauthenticated callback spam must not spend a legitimate owner's login budget.
    for (let attempt = 0; attempt < 25; attempt++) assert.equal((await callback('')).status, 303);
    const signedIn = await callback(pendingCookie); assert.equal(signedIn.status, 303);
    assert.equal(signedIn.headers.get('location'), `${origin}/account`);
    assert.equal(signedIn.headers.get('cache-control'), 'no-store');
    assert.equal(signedIn.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(signedIn.headers.getSetCookie().some(value => value.startsWith('kooch_google=;') && value.includes('Max-Age=0')));
    const sessionCookie = signedIn.headers.getSetCookie().find(value => value.startsWith('kooch_session='))!;
    assert.match(sessionCookie, /HttpOnly/); assert.match(sessionCookie, /SameSite=Strict/);
    const current = await api.handle(new Request(`${origin}/api/account/session`, { headers: { cookie: sessionCookie.split(';')[0] } }), ['session']);
    assert.equal(current.status, 200); assert.equal((await current.json()).email, owner.email);
    const replay = await callback(pendingCookie);
    assert.equal(replay.headers.get('location'), `${origin}/account?signin=google-failed`);
    assert.ok(!replay.headers.getSetCookie().some(value => value.startsWith('kooch_session=')));
  } finally { await h.close(); }
});
test('an OAuth-only account can reauthenticate with the same Google owner and delete without an app password', { skip: !enabled }, async () => {
  const h = await harness(); const email = `google-${randomUUID()}@example.test`;
  const created = await fetch(`${process.env.KOOCH_AUTH_URL}/admin/users`, { method: 'POST', headers: {
    'content-type': 'application/json', authorization: `Bearer ${process.env.KOOCH_AUTH_SERVICE_KEY}`,
  }, body: JSON.stringify({ email, email_confirm: true }) });
  assert.equal(created.status, 200); const user = await created.json();
  try {
    const auth = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100',
      fetch: async (url, init) => {
        if (String(url).endsWith('/token?grant_type=pkce')) return Response.json({ access_token: 'synthetic-google-token', expires_in: 3600, user });
        if (String(url).endsWith('/user')) return Response.json(user);
        if (String(url).includes('grant_type=password')) throw new Error('OAuth-only user has no app password');
        return fetch(url, init);
      } });
    const origin = 'http://127.0.0.1:3100'; const google = new GoogleOAuth({ auth, origin, key: 'ab'.repeat(32), secure: false });
    const api = createAccountApi({ store: h.store, auth, origin, mode: 'local', google });
    const request = (path: string, cookie: string, body?: unknown) => api.handle(new Request(`${origin}/api/account/${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), [path.split('?')[0]]);
    const callback = await request('google-callback?code=synthetic-signin', google.begin().cookie.split(';')[0]);
    const accountCookie = callback.headers.getSetCookie().find(value => value.startsWith('kooch_session='))!.split(';')[0];
    assert.equal((await request('delete', accountCookie, { confirmation: 'حذف حساب' })).status, 401);
    const start = await request('google-delete', accountCookie, {}); assert.equal(start.status, 200);
    const pending = start.headers.get('set-cookie')!.split(';')[0];
    const reauthenticated = await request('google-callback?code=synthetic-reauth', pending);
    assert.equal(reauthenticated.headers.get('location'), `${origin}/account?delete=google-ready`);
    const proof = reauthenticated.headers.getSetCookie().find(value => value.startsWith('kooch_google_delete='))!.split(';')[0];
    const deleted = await request('delete', `${accountCookie}; ${proof}`, { confirmation: 'حذف حساب' });
    assert.equal(deleted.status, 200);
    assert.equal((await request('case', accountCookie)).status, 401);
    assert.ok(deleted.headers.getSetCookie().some(value => value.startsWith('kooch_google_delete=;') && value.includes('Max-Age=0')));
  } finally {
    try { await h.store.beginDelete(user.id); await h.auth.deleteUser(user.id); await h.store.finishDelete(user.id); } catch { /* already removed */ }
    await h.close();
  }
});
test('verified guest saves with consent, signs out and resumes the same case after login', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const auth = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100' });
  const api = createAccountApi({ store: new AccountStore(pool, randomBytes(32).toString('hex')), auth,
    origin: 'http://127.0.0.1:3100', mode: 'local' });
  let cookie = '';
  const request = async (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const response = await api.handle(new Request(`http://127.0.0.1:3100/api/account/${path}`, {
      method, headers: { cookie, origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), path.split('/'));
    const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };
  const email = `test-${randomUUID()}@example.test`; const password = `Test-${randomUUID()}!`;
  try {
    assert.equal((await request('case')).status, 401);
    const signup = await request('signup', { email, password });
    assert.equal(signup.status, 200);
    assert.equal((await request('signin', { email, password })).status, 401);
    const mailList = await (await fetch(`${process.env.KOOCH_LOCAL_MAIL_URL}/api/v1/messages`)).json();
    const message = mailList.messages.find((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === email));
    assert.ok(message, 'Confirmation delivered to the local SMTP sink');
    const mail = await (await fetch(`${process.env.KOOCH_LOCAL_MAIL_URL}/api/v1/message/${message.ID}`)).json();
    const token = mail.HTML.match(/token_hash=([a-f0-9]+)/)?.[1];
    assert.ok(token);
    assert.equal((await request('verify', { token_hash: token, type: 'signup' })).status, 200);
    assert.equal((await request('case')).status, 200);
    assert.equal((await (await request('case')).json()).case, null);
    assert.equal((await request('case', { answers: { goal: 'study' } })).status, 400);
    const save = await request('case', { answers: { goal: 'study' }, step: 2, expected_revision: 0, request_id: randomUUID(), consent: 'account-save-1' });
    assert.equal(save.status, 200);
    const saved = (await save.json()).case;
    assert.equal(saved.answers.goal, 'study'); assert.equal(saved.revision, 1);
    assert.equal(save.headers.get('cache-control'), 'no-store');
    assert.equal((await request('signout', {})).status, 200);
    assert.equal((await request('case')).status, 401);
    assert.equal((await request('signin', { email, password })).status, 200);
    const resumed = await (await request('case')).json();
    assert.equal(resumed.case.id, saved.id); assert.equal(resumed.case.step, 2);
    assert.equal(resumed.case.last_activity_at, saved.last_activity_at);
    assert.equal((await request('delete', { password, confirmation: 'حذف حساب' })).status, 200);
    assert.equal((await request('case')).status, 401);
  } finally { await pool.end(); }
});

test('two accounts cannot read, overwrite, export or delete each other; RLS also rejects direct cross-owner reads', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const alice = await h.verifiedClient(), bob = await h.verifiedClient();
    const a = (await (await alice.request('case', saveInput())).json()).case;
    const b = (await (await bob.request('case', saveInput(0, 'work'))).json()).case;
    assert.notEqual(a.id, b.id);
    for (const path of [`case/${a.id}`, `export/${a.id}`]) assert.ok([400, 404].includes((await bob.request(path)).status));
    assert.equal((await bob.request(`case/${a.id}`, saveInput(1))).status, 404);
    assert.equal((await bob.request('case', { ...saveInput(1), owner: a.id })).status, 400);
    assert.equal((await bob.request('delete', { password: bob.password, confirmation: 'حذف حساب', owner: a.id })).status, 400);
    const exported = await bob.request('export');
    assert.equal(exported.headers.get('cache-control'), 'no-store');
    const content = await exported.json(); assert.equal(content.case.id, b.id); assert.equal(content.email, bob.email);
    const session = await h.store.session(bob.cookie.split('=')[1]);
    const client = await h.pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE kooch_runtime');
      await client.query("SELECT set_config('kooch.owner',$1,true)", [session.owner]);
      const rows = await client.query('SELECT id FROM kooch.cases WHERE id=$1', [a.id]);
      assert.deepEqual(rows.rows, []);
      const updated = await client.query('UPDATE kooch.cases SET revision=999 WHERE id=$1', [a.id]);
      assert.equal(updated.rowCount, 0);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await (await alice.request('case')).json()).case.revision, 1);
    assert.equal((await bob.request('case', saveInput(1), 'POST', 'https://evil.example')).status, 403);
  } finally { await h.close(); }
});

test('duplicate and racing requests preserve one case and reject stale revisions without extending read-only activity', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); const input = saveInput();
    const [first, duplicate] = await Promise.all([c.request('case', input), c.request('case', input)]);
    assert.equal(first.status, 200); assert.equal(duplicate.status, 200);
    const a = (await first.json()).case, b = (await duplicate.json()).case;
    assert.equal(a.id, b.id); assert.equal(a.revision, 1); assert.equal(a.last_activity_at, b.last_activity_at);
    assert.equal((await c.request('case', { ...input, answers: { goal: 'work' } })).status, 409);
    const races = await Promise.all([c.request('case', saveInput(1)), c.request('case', saveInput(1, 'work'))]);
    assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
    const current = (await (await c.request('case')).json()).case;
    assert.equal(current.revision, 2);
    assert.equal((await (await c.request('export')).json()).case.last_activity_at, current.last_activity_at);
  } finally { await h.close(); }
});

test('recovery uses a one-time email link and a restricted session, then revokes all prior sessions', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput());
    const priorCookie = c.cookie;
    const actual = await c.request('recover', { email: c.email });
    const absent = await c.request('recover', { email: `missing-${randomUUID()}@example.test` });
    assert.deepEqual(await actual.json(), await absent.json());
    const token = await h.mailToken(c.email, 'recovery');
    assert.equal((await c.request('verify', { token_hash: token, type: 'recovery' })).status, 200);
    const recoveryCookie = c.cookie;
    const recoveryStatus = await c.request('session');
    assert.equal(recoveryStatus.status, 200);
    assert.deepEqual(await recoveryStatus.json(), { signed_in: false, recovery: true });
    assert.equal((await c.request('case')).status, 401); assert.equal((await c.request('export')).status, 401);
    assert.equal((await c.request('verify', { token_hash: token, type: 'recovery' })).status, 401);
    const newPassword = `Changed-${randomUUID()}!`;
    assert.equal((await c.request('reset', { password: newPassword })).status, 200);
    c.cookie = priorCookie; assert.equal((await c.request('case')).status, 401);
    c.cookie = recoveryCookie; assert.equal((await c.request('reset', { password: c.password })).status, 401);
    assert.equal((await c.request('signin', { email: c.email, password: c.password })).status, 401);
    assert.equal((await c.request('signin', { email: c.email, password: newPassword })).status, 200);
    c.password = newPassword;
    assert.equal((await (await c.request('case')).json()).case.revision, 1);
  } finally { await h.close(); }
});

test('expired sessions and 90 days of inactivity fail closed; viewing and cleanup never renew activity', { skip: !enabled }, async () => {
  let time = new Date(); const h = await harness(() => time);
  try {
    const c = await h.verifiedClient(); const saved = (await (await c.request('case', saveInput())).json()).case;
    assert.equal(Date.parse(saved.delete_after) - Date.parse(saved.last_activity_at), 90 * 86400000);
    time = new Date(time.getTime() + 2 * 3600000);
    assert.equal((await c.request('case')).status, 401);
    assert.equal((await c.request('signin', { email: c.email, password: c.password })).status, 200);
    assert.equal((await (await c.request('case')).json()).case.delete_after, saved.delete_after);
    time = new Date(Date.parse(saved.delete_after));
    await h.store.purgeInactive();
    assert.equal((await c.request('signin', { email: c.email, password: c.password })).status, 200);
    assert.equal((await (await c.request('case')).json()).case, null);
  } finally { await h.close(); }
});

test('logout invalidates a copied session and deletion cannot resurrect the account data', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput()); const old = c.cookie;
    await c.request('signout', {}); c.cookie = old;
    assert.equal((await c.request('case')).status, 401);
    await c.request('signin', { email: c.email, password: c.password });
    const current = c.cookie;
    assert.equal((await c.request('delete', { password: 'incorrect-password', confirmation: 'حذف حساب' })).status, 401);
    assert.equal((await c.request('delete', { password: c.password, confirmation: 'حذف حساب' })).status, 200);
    c.cookie = current; assert.equal((await c.request('case')).status, 401);
    assert.equal((await c.request('signin', { email: c.email, password: c.password })).status, 401);
  } finally { await h.close(); }
});

test('failed provider deletion closes case access and allows a safe retry without resurrecting data', { skip: !enabled }, async () => {
  const h = await harness();
  try {
    const c = await h.verifiedClient(); await c.request('case', saveInput());
    const provider = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100',
      fetch: async (url, init) => String(url).includes('/admin/users/') ? Response.json({}, { status: 503 }) : fetch(url, init) });
    const failureApi = createAccountApi({ store: h.store, auth: provider, origin: 'http://127.0.0.1:3100', mode: 'local' });
    const response = await failureApi.handle(new Request('http://127.0.0.1:3100/api/account/delete', {
      method: 'POST', headers: { cookie: c.cookie, origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      body: JSON.stringify({ password: c.password, confirmation: 'حذف حساب' }),
    }), ['delete']);
    assert.equal(response.status, 503);
    assert.equal((await c.request('case')).status, 401);
    assert.equal((await c.request('export')).status, 401);
    assert.equal((await c.request('delete', { password: c.password, confirmation: 'حذف حساب' })).status, 200);
    assert.equal((await c.request('case')).status, 401);
  } finally { await h.close(); }
});
