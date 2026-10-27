import { z } from 'zod';
const routeId = z.string().regex(/^[a-z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const sourceMonitorSchema = z.object({ schema_version: z.literal(1), state: z.enum(['current', 'stale', 'unavailable']),
  generated_at: z.iso.datetime({ offset: true }).nullable(), next_due_at: z.iso.datetime({ offset: true }).nullable(), interval_days: z.literal(30),
  complete_global_conditions: z.literal(false), legal_reviews_renewed: z.literal(0), blocked_route_ids: z.array(routeId).max(2000),
  coverage: z.object({ planned: z.number().int().min(0).max(5000), captured: z.number().int().min(0).max(5000), unavailable: z.number().int().min(0).max(5000), review_required: z.number().int().min(0).max(5000), unreviewed_authority: z.number().int().min(0).max(5000) }).strict().nullable(),
}).strict();
export type SourceMonitor = z.infer<typeof sourceMonitorSchema>;
export const unavailableMonitor = (): SourceMonitor => ({ schema_version: 1, state: 'unavailable', generated_at: null, next_due_at: null, interval_days: 30,
  complete_global_conditions: false, legal_reviews_renewed: 0, blocked_route_ids: [], coverage: null });
const publicStatus = sourceMonitorSchema.omit({ state: true }).extend({ generated_at: z.iso.datetime({ offset: true }), next_due_at: z.iso.datetime({ offset: true }), coverage: sourceMonitorSchema.shape.coverage.unwrap() });
export async function fetchSourceMonitor(options: { now?: () => Date; fetch?: typeof fetch } = {}): Promise<SourceMonitor> {
  try {
    const response = await (options.fetch ?? fetch)('https://raw.githubusercontent.com/bahramdrv/hamrah-plugin-marketplace/kooch-crawl-state/public-status.json', {
      redirect: 'error', headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(6000),
    });
    if (!response.ok || !response.headers.get('content-type')?.match(/json|text\/plain/)) throw new Error();
    const reader = response.body?.getReader(); if (!reader) throw new Error();
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 300000) { await reader.cancel(); throw new Error(); } chunks.push(value); }
    const data = publicStatus.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const now = (options.now ?? (() => new Date()))().getTime(); const generated = Date.parse(data.generated_at);
    if (generated > now || data.coverage.captured + data.coverage.unavailable !== data.coverage.planned) throw new Error();
    return { ...data, state: now - generated > 32 * 86400000 ? 'stale' : 'current' };
  } catch { return unavailableMonitor(); }
}
