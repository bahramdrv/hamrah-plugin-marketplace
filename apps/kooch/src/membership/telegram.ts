import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AccountError } from '../account/contract';
import { channelId, channelUrl, instagramUrl } from './contract';
import type { ReportAccess } from './store';

export class TelegramBot {
  readonly id: number;
  constructor(private token: string, private fetcher: typeof fetch = fetch) {
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Invalid Telegram credential.');
    this.id = Number(token.split(':')[0]);
    if (!Number.isSafeInteger(this.id) || this.id <= 0) throw new Error('Invalid Telegram bot id.');
  }
  async call(method: 'getMe' | 'getWebhookInfo' | 'setWebhook' | 'getChatMember' | 'sendMessage' | 'answerCallbackQuery', data: Record<string, unknown>) {
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(6000), redirect: 'error' });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body.ok !== true) throw new Error();
      return body.result;
    } catch { throw new AccountError('telegram_unavailable', 503, 'بررسی تلگرام فعلاً ممکن نیست؛ کمی بعد دوباره تلاش کن.'); }
  }
  async isMember(userId: number) {
    const admin = await this.call('getChatMember', { chat_id: channelId, user_id: this.id });
    if (admin?.user?.id !== this.id || !['creator', 'administrator'].includes(admin.status)) throw new AccountError('telegram_unavailable', 503, 'ربات برای بررسی عضویت آماده نیست.');
    const member = await this.call('getChatMember', { chat_id: channelId, user_id: userId });
    return member?.user?.id === userId && ['creator', 'administrator', 'member'].includes(member.status);
  }
}
const user = z.object({ id: z.number().int().positive().safe(), is_bot: z.literal(false) });
const message = z.object({ chat: z.object({ id: z.number().int().positive().safe(), type: z.literal('private') }), from: user, text: z.string().max(256) });
const callback = z.object({ id: z.string().max(256), from: user, data: z.string().max(64), message: z.object({ chat: z.object({ id: z.number().int().positive().safe(), type: z.literal('private') }) }) });
export function createTelegramWebhook(options: { access: ReportAccess; bot: TelegramBot; secret: string; origin: string; rateLimit: (key: string) => Promise<void> }) {
  if (!/^[a-zA-Z0-9_-]{43,256}$/.test(options.secret)) throw new Error('Invalid Telegram webhook secret.');
  const reply = (status = 200) => Response.json({ ok: status === 200 }, { status, headers: { 'Cache-Control': 'no-store' } });
  const joinKeyboard = (token?: string) => ({ inline_keyboard: [
    [{ text: 'عضویت در کانال کوچ', url: channelUrl }],
    [{ text: 'دنبال‌کردن اینستاگرام کوچ', url: instagramUrl }],
    token ? [{ text: 'عضو شدم، ادامه', callback_data: `verify:${token}` }] : [{ text: 'رفتن به سایت و دریافت کد', url: `${options.origin}/report` }],
  ] });
  return async (request: Request) => {
    const supplied = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') ?? '');
    const expected = Buffer.from(options.secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401);
    if (request.method !== 'POST') return reply(405);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(400);
    let update: Record<string, unknown>;
    try {
      const reader = request.body?.getReader(); if (!reader) return reply(400);
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); return reply(413); } chunks.push(value); }
      update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!update || typeof update !== 'object') return reply(400);
    } catch { return reply(400); }
    const parsedMessage = message.safeParse(update.message), parsedCallback = callback.safeParse(update.callback_query);
    const actor = parsedCallback.success ? parsedCallback.data : parsedMessage.success ? parsedMessage.data : null;
    if (!actor) return reply();
    const chat = 'chat' in actor ? actor.chat : actor.message.chat;
    if (chat.id !== actor.from.id) return reply();
    const token = parsedCallback.success ? /^verify:([a-zA-Z0-9_-]{43})$/.exec(parsedCallback.data.data)?.[1]
      : parsedMessage.success ? /^\/start(?:@[a-zA-Z0-9_]+)? ([a-zA-Z0-9_-]{43})$/.exec(parsedMessage.data.text)?.[1] : undefined;
    try {
      await options.rateLimit(`telegram:${actor.from.id}`);
      if (parsedCallback.success) {
        // A replay may arrive after Telegram has already expired/acknowledged the query.
        try { await options.bot.call('answerCallbackQuery', { callback_query_id: parsedCallback.data.id }); } catch { /* Code delivery must remain retryable. */ }
      }
      if (!token || !parsedCallback.success) {
        await options.bot.call('sendMessage', { chat_id: chat.id,
          text: `به کوچ خوش آمدی!\nبرای دیدن کارنامه‌ات، عضو کانال کوچ شو و اینستاگرام کوچ را دنبال کن؛ بعد «عضو شدم، ادامه» را بزن تا کد تأیید را بگیری.\nعضویت تلگرام بررسی می‌شود؛ فالو اینستاگرام با تأیید خودت در سایت ثبت می‌شود.\n${token ? 'کد را در همان حساب سایتی وارد کن که از آن وارد ربات شدی.' : `برای دریافت کد مخصوص حسابت، ابتدا از صفحهٔ کارنامه وارد ربات شو: ${options.origin}/report`}\nپاسخ‌ها و کارنامه‌ات در سایت می‌مانند. حذف اطلاعات از بخش حساب سایت انجام می‌شود.`,
          reply_markup: joinKeyboard(token) });
        return reply();
      }
      if (!await options.bot.isMember(actor.from.id)) {
        await options.bot.call('sendMessage', { chat_id: chat.id, text: 'عضویتت در کانال کوچ هنوز تأیید نشده. ابتدا عضو کانال شو و بعد دوباره «عضو شدم، ادامه» را بزن.', reply_markup: joinKeyboard(token) });
        return reply();
      }
      const code = await options.access.issueCode(token, actor.from.id);
      await options.bot.call('sendMessage', { chat_id: chat.id, text: `عضویتت در کانال کوچ تأیید شد.\nکد تأیید کارنامهٔ کوچ: ${code}\nاین کد را فقط در همان حساب سایت وارد کن. اعتبار آن تا ۱۰ دقیقه پس از درخواست در سایت است. کد را به دیگران نده.`,
        reply_markup: { inline_keyboard: [[{ text: 'واردکردن کد و دیدن کارنامه', url: `${options.origin}/report` }]] } });
      return reply();
    } catch (error) {
      if (error instanceof AccountError && error.status === 400) {
        try { await options.bot.call('sendMessage', { chat_id: chat.id, text: 'پیوند معتبر نیست یا منقضی شده؛ از صفحهٔ کارنامه در سایت دوباره شروع کن.' }); } catch { return reply(503); }
        return reply();
      }
      // Telegram retries transient failures; no provider payloads or credentials escape.
      return reply(error instanceof AccountError && error.status === 429 ? 429 : 503);
    }
  };
}
