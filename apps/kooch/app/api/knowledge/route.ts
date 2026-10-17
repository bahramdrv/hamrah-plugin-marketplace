import { retrieveKnowledge } from '../../../src/knowledge/retrieval';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
const input = z.object({ query: z.string().trim().min(2).max(200) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } });
export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_type', message: 'پرسش باید به صورت JSON فرستاده شود.' }, 415);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== (request.headers.get('host') ?? new URL(request.url).host)) throw new Error();
    } catch { return reply({ error: 'invalid_origin', message: 'درخواست باید از همین اپ ارسال شود.' }, 403); }
  }
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return reply({ error: 'too_large', message: 'حجم پرسش بیش از حد مجاز است.' }, 413); }
      chunks.push(value);
    }
    const { query } = input.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return reply(retrieveKnowledge(query));
  } catch { return reply({ error: 'invalid_input', message: 'یک پرسش کوتاه دربارهٔ استفاده از کوچ بنویس؛ حداکثر ۲۰۰ نویسه.' }, 400); }
}
