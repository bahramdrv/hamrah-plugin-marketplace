import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { harness, saveInput } from './helpers/account';
import { TelegramBot, createTelegramWebhook } from '../src/membership/telegram';
const enabled = Boolean(process.env.KOOCH_DATABASE_URL && process.env.KOOCH_AUTH_URL);
const membershipHarness = (now = () => new Date()) => harness(now, undefined, undefined, undefined, undefined, {}, undefined, true);
function botFixture(h: Awaited<ReturnType<typeof membershipHarness>>) {
  const messages: { chat_id: number; text: string; reply_markup?: unknown }[] = [];
  let status = 'member', fail = false, admin = true, failAck = false;
  const bot = new TelegramBot('123456:synthetic_token_1234567890', async (url, init) => {
    const method = String(url).split('/').at(-1);
    const data = JSON.parse(String(init?.body));
    if (method === 'answerCallbackQuery' && failAck) return Response.json({ ok: false }, { status: 400 });
    if (fail) return Response.json({ ok: false, description: 'private provider error' }, { status: 500 });
    if (method === 'getChatMember') return Response.json({ ok: true, result: { status: data.user_id === 123456 ? admin ? 'administrator' : 'member' : status, user: { id: data.user_id } } });
    if (method === 'sendMessage') messages.push(data);
    return Response.json({ ok: true, result: true });
  });
  const secret = 's'.repeat(43);
  const handler = createTelegramWebhook({ access: h.reportAccess!, bot, secret, origin: 'http://127.0.0.1:3100', rateLimit: key => h.store.rateLimit(key) });
  return { messages, handler, setAckFailure(value: boolean) { failAck = value; }, setAdmin(value: boolean) { admin = value; }, setStatus(value: string) { status = value; }, setFailure(value: boolean) { fail = value; },
    async post(token: string, user = 7654321, suppliedSecret = secret) {
      return handler(new Request('http://127.0.0.1:3100/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': suppliedSecret },
        body: JSON.stringify({ update_id: 1, callback_query: { id: 'verify-1', from: { id: user, is_bot: false }, data: `verify:${token}`, message: { chat: { id: user, type: 'private' } } } }) }));
    },
    async start(token: string) {
      return handler(new Request('http://127.0.0.1:3100/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: JSON.stringify({ update_id: 0, message: { chat: { id: 7654321, type: 'private' }, from: { id: 7654321, is_bot: false }, text: `/start ${token}` } }) }));
    },
  };
}

test('the reference-style welcome shows Telegram and Instagram buttons before the explicit joined-and-continue action issues a code', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const start = await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json();
    const token = new URL(start.bot_url).searchParams.get('start')!;
    assert.equal((await bot.start(token)).status, 200);
    assert.doesNotMatch(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    assert.match(bot.messages.at(-1)!.text, /خوش آمدی/);
    assert.deepEqual(bot.messages.at(-1)!.reply_markup, { inline_keyboard: [
      [{ text: 'عضویت در کانال کوچ', url: 'https://t.me/kooch_ai' }],
      [{ text: 'دنبال‌کردن اینستاگرام کوچ', url: 'https://www.instagram.com/kooch.app/' }],
      [{ text: 'عضو شدم، ادامه', callback_data: `verify:${token}` }],
    ] });
    assert.equal((await bot.post(token)).status, 200);
    assert.match(bot.messages.at(-1)!.text, /کد تأیید کارنامهٔ کوچ: \d{8}/);
    assert.deepEqual(bot.messages.at(-1)!.reply_markup, { inline_keyboard: [[{ text: 'واردکردن کد و دیدن کارنامه', url: 'http://127.0.0.1:3100/report' }]] });
  } finally { await h.close(); }
});

test('a new applicant can save answers but cannot create, read, print or export a report before membership confirmation', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient();
    assert.equal((await c.request('case', saveInput())).status, 200);
    for (const path of ['report', 'reports', `report/${randomUUID()}/print`, `report/${randomUUID()}/explanation`]) {
      const response = await c.request(path);
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).error, 'membership_required');
    }
    assert.equal((await c.request('report', { expected_revision: 1, request_id: randomUUID() })).status, 403);
    const exported = await (await c.request('export')).json();
    assert.ok(exported.case);
    assert.deepEqual(exported.reports, []);
    assert.deepEqual(exported.report_explanations, []);
    assert.equal(exported.report_access_required, true);
    const status = await (await c.request('report-access')).json();
    assert.equal(status.unlocked, false);
    assert.equal(status.channel_url, 'https://t.me/kooch_ai');
    assert.equal(status.instagram_url, 'https://www.instagram.com/kooch.app/');
  } finally { await h.close(); }
});

test('resends preserve a code, a replacement invalidates the old link, and five wrong guesses survive retries', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const start = async () => new URL((await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json()).bot_url).searchParams.get('start')!;
    const token = await start();
    await bot.post(token);
    const code = bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    await bot.post(token);
    assert.match(bot.messages.at(-1)!.text, new RegExp(code));
    await bot.post(token, 9988776);
    assert.doesNotMatch(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    const next = await start();
    await bot.post(token);
    assert.doesNotMatch(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    await bot.post(next);
    const currentCode = bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    const wrongCode = currentCode === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i++) assert.equal((await c.request('report-access', { action: 'verify', code: wrongCode })).status, 400);
    assert.equal((await c.request('report-access', { action: 'verify', code: currentCode })).status, 400);
    await bot.post(next);
    assert.doesNotMatch(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    assert.equal((await c.request('report')).status, 403);
  } finally { await h.close(); }
});

test('expired codes cannot unlock access and simultaneous valid submissions are safe to retry', { skip: !enabled }, async () => {
  let clock = new Date();
  const h = await membershipHarness(() => clock);
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const getCode = async () => {
      const token = new URL((await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json()).bot_url).searchParams.get('start')!;
      await bot.post(token); return bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    };
    const old = await getCode();
    clock = new Date(clock.getTime() + 10 * 60000);
    assert.equal((await c.request('report-access', { action: 'verify', code: old })).status, 400);
    const code = await getCode();
    const results = await Promise.all([c.request('report-access', { action: 'verify', code }), c.request('report-access', { action: 'verify', code })]);
    assert.deepEqual(results.map(r => r.status), [200, 200]);
    assert.equal((await (await c.request('report-access')).json()).unlocked, true);
  } finally { await h.close(); }
});

test('join requests, non-admin bot configuration and Telegram failures never grant membership', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const token = new URL((await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json()).bot_url).searchParams.get('start')!;
    for (const state of ['left', 'kicked', 'restricted', 'pending', 'unknown']) {
      bot.setStatus(state);
      assert.equal((await bot.post(token)).status, 200);
      assert.doesNotMatch(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    }
    bot.setStatus('member'); bot.setAdmin(false);
    assert.equal((await bot.post(token)).status, 503);
    bot.setAdmin(true); bot.setFailure(true);
    const failed = await bot.post(token);
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), /private provider|synthetic_token/);
    assert.equal((await c.request('report')).status, 403);
  } finally { await h.close(); }
});

test('callback verification works only in a private chat for the actual sender and uses the same code on delivery retries', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const token = new URL((await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json()).bot_url).searchParams.get('start')!;
    const callback = { update_id: 2, callback_query: { id: 'callback-1', from: { id: 7654321, is_bot: false }, data: `verify:${token}`, message: { chat: { id: 7654321, type: 'private' } } } };
    const post = (body: unknown) => bot.handler(new Request('http://localhost/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 's'.repeat(43) }, body: JSON.stringify(body) }));
    assert.equal((await post({ ...callback, callback_query: { ...callback.callback_query, message: { chat: { id: 8765432, type: 'private' } } } })).status, 200);
    assert.equal(bot.messages.length, 0);
    assert.equal((await post(callback)).status, 200);
    assert.match(bot.messages.at(-1)!.text, /\b\d{8}\b/);
    const code = bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    bot.setAckFailure(true);
    assert.equal((await post(callback)).status, 200);
    assert.match(bot.messages.at(-1)!.text, new RegExp(code));
  } finally { await h.close(); }
});

test('migration exempts existing report owners once and rerunning never exempts a later report owner', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: process.env.KOOCH_MIGRATION_DATABASE_URL });
  await admin.connect();
  const schema = `membership_test_${randomUUID().replaceAll('-', '')}`;
  try {
    await admin.query('BEGIN');
    await admin.query(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.account_state(owner uuid PRIMARY KEY,deleted_at timestamptz); CREATE TABLE ${schema}.reports(owner uuid);`);
    const legacy = randomUUID(), fresh = randomUUID();
    await admin.query(`INSERT INTO ${schema}.account_state(owner) VALUES($1),($2)`, [legacy, fresh]);
    await admin.query(`INSERT INTO ${schema}.reports(owner) VALUES($1)`, [legacy]);
    const migration = (await readFile(new URL('../db/008-report-access.sql', import.meta.url), 'utf8')).replaceAll('kooch.', `${schema}.`);
    await admin.query(migration);
    assert.equal((await admin.query(`SELECT report_access_basis FROM ${schema}.account_state WHERE owner=$1`, [legacy])).rows[0].report_access_basis, 'legacy');
    await admin.query(`INSERT INTO ${schema}.reports(owner) VALUES($1)`, [fresh]);
    await admin.query(migration);
    assert.equal((await admin.query(`SELECT report_access_granted_at FROM ${schema}.account_state WHERE owner=$1`, [fresh])).rows[0].report_access_granted_at, null);
  } finally { await admin.query('ROLLBACK'); await admin.end(); }
});

test('account deletion removes membership proof and pending challenges from the active database', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), bot = botFixture(h);
    const owner = (await h.store.session(c.cookie.split('=')[1])).owner;
    const start = await (await c.request('report-access', { action: 'start', instagram_confirmed: true })).json();
    const token = new URL(start.bot_url).searchParams.get('start')!;
    await bot.post(token);
    const code = bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    assert.equal((await c.request('report-access', { action: 'verify', code })).status, 200);
    assert.equal((await c.request('delete', { password: c.password, confirmation: 'حذف حساب' })).status, 200);
    const state = await h.pool.query('SELECT report_access_granted_at,instagram_declared_at,report_access_basis FROM kooch.account_state WHERE owner=$1', [owner]);
    assert.deepEqual(state.rows[0], { report_access_granted_at: null, instagram_declared_at: null, report_access_basis: null });
    const pending = await h.verifiedClient();
    const pendingOwner = (await h.store.session(pending.cookie.split('=')[1])).owner;
    await pending.request('report-access', { action: 'start', instagram_confirmed: true });
    await pending.request('delete', { password: pending.password, confirmation: 'حذف حساب' });
    assert.equal((await h.pool.query('SELECT count(*)::int AS count FROM kooch.membership_challenges WHERE owner=$1', [pendingOwner])).rows[0].count, 0);
  } finally { await h.close(); }
});

test('the bot gives a site-bound code only after membership and one confirmation permanently unlocks that account', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const c = await h.verifiedClient(), other = await h.verifiedClient();
    await c.request('case', saveInput());
    assert.equal((await c.request('report-access', { action: 'start', instagram_confirmed: false })).status, 400);
    const start = await c.request('report-access', { action: 'start', instagram_confirmed: true });
    assert.equal(start.status, 200);
    const { bot_url } = await start.json();
    const token = new URL(bot_url).searchParams.get('start')!;
    const bot = botFixture(h);
    bot.setStatus('left');
    assert.equal((await bot.post(token)).status, 200);
    assert.ok(!bot.messages.at(-1)!.text.match(/\b\d{8}\b/));
    bot.setStatus('member');
    assert.equal((await bot.post(token)).status, 200);
    const code = bot.messages.at(-1)!.text.match(/\b\d{8}\b/)![0];
    assert.equal((await other.request('report-access', { action: 'verify', code })).status, 400);
    const persian = code.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    assert.equal((await c.request('report-access', { action: 'verify', code: persian })).status, 200);
    bot.setStatus('left'); bot.setFailure(true);
    assert.equal((await (await c.request('report-access')).json()).unlocked, true);
    assert.equal((await c.request('report', { expected_revision: 1, request_id: randomUUID() })).status, 200);
    assert.equal((await other.request('report')).status, 403);
  } finally { await h.close(); }
});

test('webhook rejects forged secrets including equal-length non-ASCII headers without crashing', { skip: !enabled }, async () => {
  const h = await membershipHarness();
  try {
    const bot = botFixture(h);
    assert.equal((await bot.post('a'.repeat(43), 7654321, 'wrong')).status, 401);
    assert.equal((await bot.post('a'.repeat(43), 7654321, 'é'.repeat(43))).status, 401);
    assert.equal(bot.messages.length, 0);
  } finally { await h.close(); }
});
