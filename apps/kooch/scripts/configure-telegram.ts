import { TelegramBot } from '../src/membership/telegram';
import { channelId } from '../src/membership/contract';

try {
  const action = process.argv[2];
  if (!['--check', '--register'].includes(action)) throw new Error('Use --check or --register.');
  const token = process.env.KOOCH_TELEGRAM_BOT_TOKEN;
  const username = process.env.KOOCH_TELEGRAM_BOT_USERNAME;
  const secret = process.env.KOOCH_TELEGRAM_WEBHOOK_SECRET;
  if (!token || !username || !/^[a-zA-Z0-9_-]{43,256}$/.test(secret ?? '')) throw new Error('Private Telegram configuration is incomplete.');
  const bot = new TelegramBot(token);
  const me = await bot.call('getMe', {});
  if (me?.id !== bot.id || me?.is_bot !== true || me?.username?.toLowerCase() !== username.toLowerCase()) throw new Error('Bot username does not match the credential.');
  const membership = await bot.call('getChatMember', { chat_id: channelId, user_id: bot.id });
  if (membership?.user?.id !== bot.id || !['administrator', 'creator'].includes(membership.status)) throw new Error('Make this bot an administrator of @kooch_ai first.');
  if (action === '--register') {
    if (process.env.KOOCH_APP_ORIGIN !== 'https://my.kooch.app') throw new Error('Registration is restricted to the production Kooch origin.');
    const origin = process.env.KOOCH_APP_ORIGIN;
    const status = await fetch(`${origin}/api/account/status`, { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
    if (!status.ok || (await status.json()).membership_enabled !== true) throw new Error('Deploy the enabled membership gate before registering its webhook.');
    const ready = await fetch(`${origin}/api/telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret! }, body: JSON.stringify({ update_id: 0 }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!ready.ok) throw new Error('The deployed webhook did not accept its secret.');
    const url = `${origin}/api/telegram`;
    if (await bot.call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }) !== true) throw new Error('Webhook registration failed.');
    const info = await bot.call('getWebhookInfo', {});
    if (info?.url !== url) throw new Error('Webhook registration could not be confirmed.');
    console.log('Production webhook registered; test a new applicant account before announcing activation.');
  } else console.log('Bot identity and channel administrator status confirmed. No webhook changed.');
} catch {
  // Network exceptions can contain credential-bearing URLs: never print their message or stack.
  console.error('Telegram setup failed. Check the private configuration, bot username, channel administrator status and deployed membership gate.');
  process.exitCode = 1;
}
