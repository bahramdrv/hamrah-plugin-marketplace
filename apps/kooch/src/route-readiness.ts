import { readinessSchema, type ReadinessDefinitions } from './readiness-registry';
import { isStableCoarseFact } from './policy';
import type { DiscoverySource } from './catalog';
export type ReadinessState = 'reported_ready' | 'action_needed' | 'needs_information' | 'needs_review';
export function routeReadiness(input: unknown, routeId: string, facts: Record<string, 'yes' | 'no' | 'unknown'>, now: Date, factVersions: Record<string, string> = {}) {
  const parsed = readinessSchema.safeParse(input);
  if (!parsed.success) return null;
  const definitions = parsed.data;
  if (definitions.released_on && definitions.released_on > now.toISOString().slice(0, 10)) return null;
  const plan = definitions.routes.find(route => route.route_id === routeId); if (!plan) return null;
  const answerVersion = plan.version ?? definitions.version;
  const byId = new Map(definitions.sources.map(source => [source.id, source]));
  const sources = (ids: string[]): DiscoverySource[] => ids.flatMap(id => {
    const source = byId.get(id); return source ? [{ ...source, authority: 'primary' as const }] : [];
  });
  const current = (ids: string[]) => ids.length > 0 && ids.every(id => {
    const source = byId.get(id); const timestamp = source ? Date.parse(source.checked_on) : NaN;
    return source?.verification === 'direct' && Number.isFinite(timestamp) && timestamp <= now.getTime() && now.getTime() - timestamp < 15 * 86400000;
  });
  const checks = plan.checks.map(check => {
    const mismatch = !isStableCoarseFact(check.answer_id) && ((factVersions[check.answer_id] !== undefined && factVersions[check.answer_id] !== answerVersion) || (facts[check.answer_id] === 'yes' && factVersions[check.answer_id] !== answerVersion));
    const reason = !current(check.source_ids) ? 'source_stale' : mismatch ? 'answer_version_changed' : 'confirmed_answer';
    const state: ReadinessState = reason !== 'confirmed_answer' ? 'needs_review' : facts[check.answer_id] === 'yes' ? 'reported_ready' : facts[check.answer_id] === 'no' ? 'action_needed' : 'needs_information';
    return { ...check, state, state_reason: reason, answer_version: answerVersion, sources: sources(check.source_ids), action: reason === 'answer_version_changed' ? `این شرط نسبت به پاسخ قبلی نیازمند تأیید دوباره است: ${check.question}` : state === 'needs_review' ? `منبع این شرط را دوباره بررسی کن: ${check.question}` : check.action };
  });
  const next = checks.find(check => check.state === 'needs_review') ?? checks.find(check => check.state === 'action_needed') ?? checks.find(check => check.state === 'needs_information') ?? null;
  const counts = Object.fromEntries((['reported_ready', 'action_needed', 'needs_information', 'needs_review'] as const).map(state => [state, checks.filter(check => check.state === state).length])) as Record<ReadinessState, number>;
  const allSources = [...new Set([...plan.checks.flatMap(check => check.source_ids), ...plan.cost_source_ids, ...plan.dependant_source_ids])];
  return { version: answerVersion, scope: plan.scope_fa, limitations: plan.limits_fa, basis: 'self_reported' as const,
    checks, counts, needs_review: counts.needs_review > 0 || !current(allSources),
    status: counts.needs_review ? 'needs_review' : counts.action_needed ? 'action_needed' : counts.needs_information ? 'needs_information' : 'reported_checks_ready',
    next_action: next ? { id: next.id, answer_id: next.answer_id, title: next.question, detail: next.action, source_ids: next.source_ids } : null,
    costs: { text: plan.costs_fa, sources: sources(plan.cost_source_ids), current: current(plan.cost_source_ids) },
    dependants: { text: plan.dependants_fa, sources: sources(plan.dependant_source_ids), current: current(plan.dependant_source_ids) },
    sources: sources(allSources),
  };
}
export type RouteReadiness = NonNullable<ReturnType<typeof routeReadiness>>;
// Evidence identity excludes applicant answers and the next action chosen from them.
export function readinessEvidence(readiness?: RouteReadiness) {
  return readiness ? { version: readiness.version, sources: readiness.sources, costs: readiness.costs, dependants: readiness.dependants } : null;
}
export function focusedReadinessQuestions(definitions: ReadinessDefinitions, routeId: string | null) {
  return definitions.routes.find(route => route.route_id === routeId)?.checks ?? [];
}
