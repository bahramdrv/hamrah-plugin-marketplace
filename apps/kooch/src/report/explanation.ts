import { z } from 'zod';
import type { GuidanceReport, State } from './evaluate';
export const explanationInput = z.object({ request_id: z.uuid() }).strict();
export const explanationContract = 'report-explanation-1';
export type ExplanationCard = { id: string; route_id: string; title: string; text: string; state?: State; source_ids: string[] };
export type ExplanationResult = { status: string; reasons?: ExplanationCard[]; actions?: ExplanationCard[]; accounting_policy?: string; model?: string; contract_version?: string; prompt_version?: string };
export type SavedExplanation = ExplanationResult & { id: string; report_id: string; report_version: number; version: number; created_at: string };
// Explicit projection: no case, raw answers, contact information or report history.
export function explanationProjection(report: GuidanceReport) {
  return { coverage: report.coverage, basis: 'confirmed_self_reported', routes: report.route_results.map(r => ({
    id: r.route_id, status: r.status, conditions: r.conditions.map(c => ({ id: `${r.route_id}/${c.id}`, state: c.state, title: c.title, source_ids: c.source_ids })),
    actions: r.next_actions.map(a => ({ id: `${r.route_id}/${a.id}`, title: a.title, source_ids: a.source_ids })),
  })) };
}
export function groundedSelection(report: GuidanceReport, value: unknown): Pick<ExplanationResult, 'reasons' | 'actions'> {
  const ids = z.array(z.string().max(150)).min(1).max(3).refine(a => new Set(a).size === a.length);
  const selected = z.object({ reasons: ids, actions: ids }).strict().parse(value);
  const cards = (kind: 'reasons' | 'actions') => selected[kind].map(id => {
    for (const route of report.route_results) {
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
