import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { snapshotSchema, sourceUrl, type Snapshot } from './snapshot';

export type RetrievalStatus = { state: 'ok' | 'error'; attempted_at: string; code: string | null };
const incomingSchema = z.object({
  coverage: z.literal('catalog_only'), total: z.number().int().min(0).max(100), limit: z.literal(100), offset: z.literal(0),
  application_coverage: snapshotSchema.shape.coverage,
  sync: z.object({ last_attempt_status: z.literal('ok') }),
  routes: z.array(z.object({ destination: z.string(), slug: z.string(), name: z.string(), name_fa: z.string(),
    category: z.string(), page_url: z.string().nullable(), application_from_iran: z.unknown() })).max(100),
});

// Manual public refresh only. No applicant data can enter this adapter.
// A source or decision-bearing change needs review; fetching never renews a review date.
export async function refreshSnapshot(previous: unknown, options: { fetch?: typeof fetch; now?: () => Date } = {}): Promise<{ snapshot: Snapshot; status: RetrievalStatus }> {
  const snapshot = snapshotSchema.parse(previous);
  const attempted_at = (options.now ?? (() => new Date()))().toISOString();
  let code = 'fetch_failed';
  try {
    const result = await (options.fetch ?? fetch)(sourceUrl, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json' }, cache: 'no-store',
    });
    if (!result.ok || !result.headers.get('content-type')?.includes('application/json')) throw new Error();
    const reader = result.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    code = 'review_required';
    const incoming = incomingSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (incoming.routes.length !== incoming.total) throw new Error();
    const routes = incoming.routes.map(route => {
      const id = `${route.destination}:${route.slug}`;
      const reviewed = snapshot.routes.find(r => r.id === id);
      if (!reviewed || !isDeepStrictEqual(route.application_from_iran, reviewed.application)) throw new Error();
      // Reviewed route summaries/facts have their own sources; a catalog fetch cannot replace them.
      return { ...reviewed, id, destination: route.destination, slug: route.slug, name: route.name,
        name_fa: route.name_fa, category: route.category, page_url: route.page_url, application: reviewed.application };
    });
    const next = snapshotSchema.parse({ ...snapshot, retrieved_at: attempted_at, total: incoming.total,
      coverage: incoming.application_coverage, routes });
    return { snapshot: next, status: { state: 'ok', attempted_at, code: null } };
  } catch {
    return { snapshot, status: { state: 'error', attempted_at, code } };
  }
}
