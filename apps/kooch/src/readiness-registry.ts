import { z } from 'zod';
import definitions from '../data/route-readiness.json';
const publicUrl = z.url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; });
const source = z.object({ id: z.string().min(1), title: z.string().min(1), url: publicUrl, checked_on: z.iso.date(), verification: z.enum(['direct', 'indexed', 'historical']).default('direct'), verification_note: z.string().min(1).optional() }).strict();
const check = z.object({ id: z.string().regex(/^[a-z][a-z0-9_]*$/), answer_id: z.string().regex(/^[a-z]{2}\.[a-z][a-z0-9_]*$/), question: z.string().min(1), reason: z.string().min(1), action: z.string().min(1), source_ids: z.array(z.string()).min(1).max(8) }).strict();
const route = z.object({ route_id: z.string().regex(/^[a-z]{2}:[a-z0-9]+(?:-[a-z0-9]+)*$/), version: z.string().min(1).max(100).optional(), scope_fa: z.string().min(1), limits_fa: z.string().min(1),
  costs_fa: z.string().min(1), cost_source_ids: z.array(z.string()).max(8), dependants_fa: z.string().min(1), dependant_source_ids: z.array(z.string()).max(8), checks: z.array(check).min(1).max(8) }).strict();
export const readinessSchema = z.object({ version: z.string().min(1), released_on: z.iso.date().optional(), sources: z.array(source).max(300), routes: z.array(route).max(100) }).strict().superRefine((data, ctx) => {
  const sources = new Set(data.sources.map(s => s.id));
  if (sources.size !== data.sources.length || new Set(data.routes.map(r => r.route_id)).size !== data.routes.length) ctx.addIssue({ code: 'custom', message: 'Duplicate readiness identity' });
  for (const r of data.routes) {
    if (new Set(r.checks.map(c => c.id)).size !== r.checks.length || new Set(r.checks.map(c => c.answer_id)).size !== r.checks.length ||
      r.checks.some(c => c.answer_id.split('.')[0] !== r.route_id.split(':')[0]) ||
      [...r.cost_source_ids, ...r.dependant_source_ids, ...r.checks.flatMap(c => c.source_ids)].some(id => !sources.has(id))) ctx.addIssue({ code: 'custom', message: `Unlinked or inconsistent readiness: ${r.route_id}` });
  }
});
export type ReadinessDefinitions = z.infer<typeof readinessSchema>;
export const readinessDefinitions = readinessSchema.parse(definitions);
export const readinessQuestions = Object.fromEntries(readinessDefinitions.routes.flatMap(route => route.checks.map(check => [check.answer_id, check.question])));
