import { accountRuntime } from '../../../../src/account/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  try {
    const api = await accountRuntime();
    if (api) return api.handle(request, path);
  } catch { /* Never expose configuration, connection strings or provider errors. */ }
  const status = path.join('/') === 'status' && request.method === 'GET';
  return Response.json(status ? { configured: false } : { error: 'account_unavailable', message: 'حساب هنوز متصل نشده است؛ پاسخ‌های مهمان در همین نشست باقی می‌مانند.' },
    { status: status ? 200 : 503, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
}
export const GET = handle;
export const POST = handle;
