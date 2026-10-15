import { z } from 'zod';

export const sourceUrl = 'https://kooch.app/wp-json/kooch/v1/visa-catalog?scope=iran-start&limit=100&offset=0';
const day = z.iso.date();
const publicUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
});
const pageUrl = publicUrl.refine(value => {
  const url = new URL(value);
  return url.origin === 'https://kooch.app' && url.pathname.startsWith('/visas/') && !url.search && !url.hash;
});
const sourceSchema = z.object({ id: z.string(), url: publicUrl, title: z.string(), authority: z.literal('primary'), checked_on: day }).passthrough();
const applicationSchema = z.object({
  route_key: z.string(), iran_passport_status: z.string(), start_from_iran: z.string(),
  application_acceptance: z.string(), legal_status: z.string().optional(),
  evidence_checked_on: day, valid_until: day, source_ids: z.array(z.string()).min(1),
  reason_fa: z.string().min(1), in_person_followup_fa: z.string().optional(),
}).passthrough();
export const routeSchema = z.object({
  id: z.string(), destination: z.string().regex(/^[a-z]{2}$/), slug: z.string(),
  name_fa: z.string().min(1), name: z.string(), category: z.string(),
  summary_fa: z.string().min(1).optional(),
  facts: z.array(z.object({ label: z.string().min(1), value: z.string().min(1), sources: z.array(sourceSchema).min(1) })).max(5).default([]),
  page_url: pageUrl.nullable(), application: applicationSchema,
});
export const snapshotSchema = z.object({
  schema_version: z.literal(2), scope: z.literal('iran-start'), source_url: z.literal(sourceUrl),
  retrieved_at: z.iso.datetime({ offset: true }), provider: z.string(), license: z.string(),
  license_url: publicUrl, provider_url: publicUrl, total: z.number().int().min(0).max(100),
  coverage: z.object({ catalog: z.number().int().nonnegative(), reviewed: z.number().int().nonnegative(),
    unreviewed: z.number().int().nonnegative(), documented_start: z.number().int().nonnegative(),
    scope: z.literal('application_channel_only'), freshness_days: z.literal(14) }),
  routes: z.array(routeSchema).max(100),
  sources: z.record(z.string(), sourceSchema),
}).superRefine((value, ctx) => {
  if (value.total !== value.routes.length || value.total !== value.coverage.documented_start ||
      value.coverage.catalog !== value.coverage.reviewed + value.coverage.unreviewed ||
      new Set(value.routes.map(r => r.id)).size !== value.routes.length)
    ctx.addIssue({ code: 'custom', message: 'Inconsistent snapshot coverage' });
  for (const route of value.routes) {
    if (route.id !== `${route.destination}:${route.slug}` || route.application.route_key !== route.id ||
        route.application.source_ids.some(id => value.sources[id]?.id !== id))
      ctx.addIssue({ code: 'custom', message: 'Missing or mismatched route evidence' });
  }
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type PublicRoute = z.infer<typeof routeSchema>;

export function channelState(route: PublicRoute, snapshot: Snapshot, now: Date): 'current' | 'expired' | 'excluded' {
  const e = route.application;
  const today = now.toISOString().slice(0, 10);
  if (e.iran_passport_status !== 'supported' || !['online', 'iran_office'].includes(e.start_from_iran) ||
      !['confirmed', 'conditional'].includes(e.application_acceptance) ||
      (e.legal_status && !['active', 'active_conditional', 'open'].includes(e.legal_status))) return 'excluded';
  const checked = Date.parse(e.evidence_checked_on);
  const until = Date.parse(e.valid_until);
  if (e.evidence_checked_on > today || e.valid_until < today || until < checked || until - checked > 14 * 86400000 ||
      e.source_ids.some(id => {
        const s = snapshot.sources[id];
        return !s || s.checked_on > today || Date.parse(today) - Date.parse(s.checked_on) > 14 * 86400000;
      })) return 'expired';
  return 'current';
}
