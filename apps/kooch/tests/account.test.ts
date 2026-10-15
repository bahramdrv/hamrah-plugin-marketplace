import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAccountApi } from '../src/account/api';
import { AuthProvider } from '../src/account/auth';
import { AccountStore } from '../src/account/store';
import { harness, saveInput } from './helpers/account';

const enabled = Boolean(process.env.KOOCH_DATABASE_URL);
test('verified guest saves with consent, signs out and resumes the same case after login', { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const auth = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100' });
  const api = createAccountApi({ store: new AccountStore(pool, process.env.KOOCH_SESSION_ENCRYPTION_KEY!), auth,
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
