import { z } from 'zod';
import type { GuidanceReport, State } from './evaluate';
import { policies, factTitle } from '../policy';
export const explanationInput = z.object({ request_id: z.uuid() }).strict();
export const explanationContract = 'report-explanation-1';
export type ExplanationCard = { id: string; route_id: string; title: string; text: string; state?: State; source_ids: string[] };
export type ExplanationResult = { status: string; reasons?: ExplanationCard[]; actions?: ExplanationCard[]; accounting_policy?: string; model?: string; contract_version?: string; prompt_version?: string };
export type SavedExplanation = ExplanationResult & { id: string; report_id: string; report_version: number; version: number; created_at: string };
export function explanationRoutes(report: GuidanceReport) {
  if (report.route_results.length) return report.route_results;
  return (report.discovery?.result?.routes ?? []).map(route => ({ route_id: route.id, status: 'discovery_only',
    conditions: route.readiness ? route.readiness.checks.map(check => ({ id: check.id, title: check.question, reason: check.reason, state: ({ reported_ready: 'self_reported_met', action_needed: 'action_needed', needs_information: 'unknown', needs_review: 'needs_review' } as const)[check.state], source_ids: check.source_ids })) : (route.prerequisite_ids ?? policies[route.id]?.requires ?? []).map(id => ({ id, title: factTitle(id), reason: route.prerequisite,
      state: (report.dependencies.case.answers.facts[id] === 'yes' ? 'self_reported_met' : report.dependencies.case.answers.facts[id] === 'no' ? 'action_needed' : 'unknown') as State,
      source_ids: route.sources.map(source => source.id) })),
    next_actions: [{ id: 'next_step', title: 'قدم بعدی این مسیر', detail: route.next_step, source_ids: route.readiness?.next_action?.source_ids ?? route.readiness?.sources.map(source => source.id) ?? route.sources.map(source => source.id) }],
  }));
}
// Explicit projection: no case, raw answers, contact information or report history.
export function explanationProjection(report: GuidanceReport) {
  return { coverage: report.coverage, basis: 'confirmed_self_reported', routes: explanationRoutes(report).map(r => ({
    id: r.route_id, status: r.status, conditions: r.conditions.map(c => ({ id: `${r.route_id}/${c.id}`, state: c.state, title: c.title, source_ids: c.source_ids })),
    actions: r.next_actions.map(a => ({ id: `${r.route_id}/${a.id}`, title: a.title, source_ids: a.source_ids })),
  })) };
}
export function groundedSelection(report: GuidanceReport, value: unknown): Pick<ExplanationResult, 'reasons' | 'actions'> {
  const ids = z.array(z.string().max(150)).min(1).max(3).refine(a => new Set(a).size === a.length);
  const selected = z.object({ reasons: ids, actions: ids }).strict().parse(value);
  const cards = (kind: 'reasons' | 'actions') => selected[kind].map(id => {
    for (const route of explanationRoutes(report)) {
      if (kind === 'reasons') {
        const card = route.conditions.find(c => `${route.route_id}/${c.id}` === id);
        if (card) return { id, route_id: route.route_id, title: card.title, text: card.reason, state: card.state, source_ids: card.source_ids };
      } else {
        const card = route.next_actions.find(c => `${route.route_id}/${c.id}` === id);
        if (card) return { id, route_id: route.route_id, title: card.title, text: card.detail, source_ids: card.source_ids };
      }
    }
    throw Error('Ungrounded selection.');
  });
  return { reasons: cards('reasons'), actions: cards('actions') };
}
