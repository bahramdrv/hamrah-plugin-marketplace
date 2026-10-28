import { z } from 'zod';
import { catalogSchema, catalogRecordSchema, type GlobalCatalog } from './catalog';

export const officialSupplementSchema = z.object({ version: z.string().min(1).max(120), released_on: z.iso.date(), routes: z.array(catalogRecordSchema).min(1).max(500) }).strict().superRefine((data, ctx) => {
  const ids = new Set<string>();
  for (const route of data.routes) {
    const url = new URL(route.source.url);
    if (ids.has(route.id) || !/^[a-z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.id) || route.origin !== 'official_supplement' || !route.source_id.startsWith('kooch:') || route.reviewed_on !== route.source.lastVerified || url.protocol !== 'https:' || url.username || url.password || route.source.lastVerified > data.released_on)
      ctx.addIssue({ code: 'custom', message: `Unreviewed or inconsistent official route: ${route.id}` });
    ids.add(route.id);
  }
});

// The supplement is published evidence, not an upstream discovery response.
// Merging never renews source dates or overwrites an Atlas identity.
export function mergeOfficialRoutes(input: unknown, supplement: unknown, now: Date): GlobalCatalog {
  const catalog = catalogSchema.parse(input), edition = officialSupplementSchema.parse(supplement);
  if (edition.released_on > now.toISOString().slice(0, 10)) return catalog;
  const byId = new Map(catalog.routes.map(route => [route.id, route]));
  const conflicts = new Set(catalog.official_supplement_conflicts ?? []);
  for (const route of edition.routes) {
    const existing = byId.get(route.id);
    if (existing && existing.origin !== 'official_supplement') { conflicts.add(route.id); continue; }
    if (existing && JSON.stringify(existing) !== JSON.stringify(route)) throw new Error(`Official route edition requires review: ${route.id}`);
    byId.set(route.id, route);
  }
  return catalogSchema.parse({ ...catalog, routes: [...byId.values()], official_supplement_version: edition.version,
    ...(conflicts.size ? { official_supplement_conflicts: [...conflicts].sort(), refresh: { state: 'review_required', attempted_at: now.toISOString(), reason: 'official_route_identity_collision' } } : {}) });
}
