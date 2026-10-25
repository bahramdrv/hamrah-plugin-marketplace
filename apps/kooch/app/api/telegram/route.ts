import { accountRuntime } from '../../../src/account/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const api = await accountRuntime();
    if (api?.telegramWebhook) return await api.telegramWebhook(request);
  } catch { /* Never log Telegram credentials, codes, or incoming user identifiers. */ }
  return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
