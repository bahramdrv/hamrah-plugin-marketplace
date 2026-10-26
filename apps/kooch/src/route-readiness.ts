import { readinessSchema, type ReadinessDefinitions } from './readiness-registry';
import { isStableCoarseFact } from './policy';
import type { DiscoverySource } from './catalog';
import { evaluateProfileRule, type ScreeningProfile } from './profile-constraints';
export type ReadinessState = 'reported_ready' | 'action_needed' | 'needs_information' | 'needs_review';
export function routeAvailability(definitions: ReadinessDefinitions, routeId: string, now: Date) {
  const plan = definitions.routes.find(route => route.route_id === routeId);
  if (plan?.released_on && plan.released_on > now.toISOString().slice(0, 10)) return null;
  const availability = plan?.availability;
  if (!availability || availability.effective_from && availability.effective_from > now.toISOString().slice(0, 10)) return null;
  const sources = definitions.sources.filter(source => availability.source_ids.includes(source.id));
  const current = sources.length === availability.source_ids.length && sources.every(source => source.verification === 'direct' && Date.parse(source.checked_on) <= now.getTime() && now.getTime() - Date.parse(source.checked_on) < 15 * 86400000);
  return { ...availability, current, sources: sources.map(source => ({ ...source, authority: 'primary' as const })) };
}
export function routeReadiness(input: unknown, routeId: string, facts: Record<string, 'yes' | 'no' | 'unknown'>, now: Date, factVersions: Record<string, string> = {}, profile: ScreeningProfile = {}) {
  const parsed = readinessSchema.safeParse(input);
  if (!parsed.success) return null;
  const definitions = parsed.data;
  if (definitions.released_on && definitions.released_on > now.toISOString().slice(0, 10)) return null;
  const plan = definitions.routes.find(route => route.route_id === routeId); if (!plan) return null;
  if (plan.released_on && plan.released_on > now.toISOString().slice(0, 10)) return null;
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
    const matched = check.profile_rule ? evaluateProfileRule(check.profile_rule, profile) : null;
    const mismatch = !isStableCoarseFact(check.answer_id) && ((factVersions[check.answer_id] !== undefined && factVersions[check.answer_id] !== answerVersion) || (facts[check.answer_id] === 'yes' && factVersions[check.answer_id] !== answerVersion));
    const conflict = matched !== null && facts[check.answer_id] && facts[check.answer_id] !== 'unknown' && (facts[check.answer_id] === 'yes') !== matched;
    const reason = !current(check.source_ids) ? 'source_stale' : conflict ? 'profile_answer_conflict' : matched !== null ? 'profile_criterion' : mismatch ? 'answer_version_changed' : 'confirmed_answer';
    const state: ReadinessState = !['confirmed_answer', 'profile_criterion'].includes(reason) ? 'needs_review' : matched === true ? 'reported_ready' : matched === false ? 'action_needed' : facts[check.answer_id] === 'yes' ? 'reported_ready' : facts[check.answer_id] === 'no' ? 'action_needed' : 'needs_information';
    return { ...check, state, state_reason: reason, answer_version: answerVersion, sources: sources(check.source_ids), action: conflict ? `پاسخ این شرط با مشخصات ثبت‌شده تعارض دارد: ${check.question}` : reason === 'answer_version_changed' ? `این شرط نسبت به پاسخ قبلی نیازمند تأیید دوباره است: ${check.question}` : state === 'needs_review' ? `منبع این شرط را دوباره بررسی کن: ${check.question}` : check.action };
  });
  const next = checks.find(check => check.state === 'needs_review') ?? checks.find(check => check.state === 'action_needed') ?? checks.find(check => check.state === 'needs_information') ?? null;
  const counts = Object.fromEntries((['reported_ready', 'action_needed', 'needs_information', 'needs_review'] as const).map(state => [state, checks.filter(check => check.state === state).length])) as Record<ReadinessState, number>;
  const allSources = [...new Set([...plan.checks.flatMap(check => check.source_ids), ...plan.cost_source_ids, ...plan.dependant_source_ids, ...(plan.availability?.source_ids ?? [])])];
  const availability = routeAvailability(definitions, routeId, now);
  return { version: answerVersion, scope: plan.scope_fa, limitations: plan.limits_fa, basis: 'self_reported' as const,
    checks, counts, availability, needs_review: counts.needs_review > 0 || !current(allSources),
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
