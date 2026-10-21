import { z } from 'zod';
import { routeSchema, snapshotSchema, sourceManifestUrl } from '../snapshot';
export const evidenceOrigin = 'https://kooch.app';
export const manifestUrl = sourceManifestUrl;
export const pageUrl = (id: string, index: number) => `${evidenceOrigin}/wp-json/kooch/v2/evidence-page/${id}/${index}`;
export const shaSchema = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(4000);
const publicSource = snapshotSchema.shape.sources.valueType.extend({ retrieval_method: text.optional() }).strict();
const application = routeSchema.shape.application.extend({
  additional_notes: z.array(z.object({ id: z.string().max(160), body_fa: text, source_ids: z.array(z.string()).max(40) }).strict()).max(40).optional(), conditions_fa: text.optional(), unknowns: z.array(text).max(40).optional(),
  application_fee: z.object({ amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/), scope_fa: text, source_ids: z.array(z.string()).max(40) }).strict().optional(),
}).strict();
export const publicRouteSchema = routeSchema.extend({ application,
  facts: z.array(z.object({ label: text, value: text, sources: z.array(publicSource).min(1).max(40) }).strict()).max(5).default([]),
}).strict();
export const manifestSchema = z.object({
  contract_version: z.literal(1), mapping_version: z.literal('iran-start-route-key-1'), scope: z.literal('iran-start'),
  generated_at: z.iso.datetime({ offset: true }), expires_at: z.iso.datetime({ offset: true }), freshness_policy: z.literal('iran-channel-14-days-1'),
  total: z.number().int().min(0).max(500), coverage: snapshotSchema.shape.coverage.strict(),
  sources: z.record(z.string().max(160), publicSource).refine(s => Object.keys(s).length <= 1000),
  pages: z.array(z.object({ index: z.number().int().min(0).max(24), sha256: shaSchema, count: z.number().int().min(1).max(20) }).strict()).max(25),
}).strict().superRefine((m, ctx) => {
  if (m.pages.reduce((n, p) => n + p.count, 0) !== m.total || m.total !== m.coverage.documented_start ||
      m.pages.some((p, i) => p.index !== i) || m.coverage.catalog !== m.coverage.reviewed + m.coverage.unreviewed ||
      Object.entries(m.sources).some(([id, s]) => id !== s.id)) ctx.addIssue({code: 'custom', message: 'Inconsistent manifest'});
});
export const manifestEnvelope = z.object({ snapshot_id: shaSchema, payload: z.string().max(2_000_000) }).strict();
export const pageEnvelope = manifestEnvelope.extend({ index: z.number().int().min(0).max(24) });
export const publicPageSchema = z.object({ index: z.number().int().min(0).max(24), routes: z.array(publicRouteSchema).max(20) }).strict();
export type Manifest = z.infer<typeof manifestSchema>;
export type PublicPage = z.infer<typeof publicPageSchema>;
export type ReviewItem = { route_id: string; reason: 'added' | 'removed' | 'evidence_changed'; fields: string[]; candidate_id: string };
