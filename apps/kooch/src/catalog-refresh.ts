import { z } from 'zod';
import { catalogSchema, type GlobalCatalog } from './catalog';

const incomingSchema = z.array(z.object({ destination: z.string().regex(/^[a-z]{2}(?:_dest)?$/), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(150),
  name: z.string().min(1).max(1000), category: z.string().max(80), summary: z.string().max(16000),
  sponsorshipRequired: z.boolean().nullable(), leadsToSettlement: z.boolean(), typicalDuration: z.string().max(4000).nullable().optional(),
  primarySource: z.object({ label: z.string().max(1000), url: z.url(), authority: z.string().max(1000), lastVerified: z.iso.date() }),
  lastReviewed: z.iso.date().nullable().optional(),
})).min(1).max(2000);

// Only public catalog metadata is fetched. Primary rules and Iranian channel reviews
// are independent: successful retrieval cannot renew them or establish eligibility.
export async function refreshCatalog(input: unknown, options: { fetch?: typeof fetch; now?: () => Date } = {}): Promise<GlobalCatalog> {
  const previous = catalogSchema.parse(input);
  const now = (options.now ?? (() => new Date()))(); const attempted_at = now.toISOString();
  let reason = 'fetch_failed';
  try {
    const response = await (options.fetch ?? fetch)('https://visaatlas.org/api/public/visas', {
      redirect: 'error', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
    const reader = response.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 4_000_000) { await reader.cancel(); throw new Error(); } chunks.push(value); }
    reason = 'catalog_contract_changed';
    const incoming = incomingSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const old = new Map(previous.routes.map(route => [route.id, route]));
    const routes = incoming.map(route => {
      const destination = route.destination.replace(/_dest$/, ''); const id = `${destination}:${route.slug}`;
      if (!previous.destinations[destination] || route.primarySource.lastVerified > attempted_at.slice(0, 10) || route.lastReviewed && route.lastReviewed > attempted_at.slice(0, 10)) throw new Error();
      return { id, source_id: `${route.destination}:${route.slug}`, destination, slug: route.slug,
        name: route.name, name_fa: old.get(id)?.name_fa ?? route.name, category: route.category, summary: route.summary,
        sponsorship_required: route.sponsorshipRequired, settlement: route.leadsToSettlement, duration: route.typicalDuration ?? null,
        source: route.primarySource, reviewed_on: route.lastReviewed ?? null };
    });
    // A missing route may be a partial response or an actual removal. Require review,
    // rather than silently deleting it or announcing a route closure.
    const ids = new Set(routes.map(route => route.id));
    if (previous.routes.some(route => !ids.has(route.id))) { reason = 'incomplete_or_removed_routes'; throw new Error(); }
    return catalogSchema.parse({ ...previous, retrieved_at: attempted_at, routes, refresh: { state: 'updated', attempted_at, reason: null } });
  } catch {
    return { ...previous, refresh: { state: reason === 'fetch_failed' ? 'error' : 'review_required', attempted_at, reason } };
  }
}
