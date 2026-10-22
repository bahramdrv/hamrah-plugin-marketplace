import source from '../../data/ai-gateway-policy.json';
import { productionActivation } from '../ai/production-acceptance';
import { policyGate } from '../ai/policy';
export function operationStatus(environment: Readonly<Record<string, string | undefined>> = process.env, now = new Date(), configuration: unknown = source) {
  const activation = productionActivation(configuration, environment, now);
  const release = activation.status === 'accepted' ? activation.profile : undefined;
  const reason = (task: 'question-wording' | 'answer-interpretation' | 'report-explanation') => {
    if (!release) return activation.status;
    const gate = policyGate(release.policy, now, task);
    if (gate.status !== 'accepted') return gate.status;
    if (!/^[a-f0-9]{64}$/.test(environment.KOOCH_AI_ACCOUNTING_KEY ?? '') || !environment.KOOCH_ARVAN_API_KEY) return 'credentials_missing';
    return release.mode === 'synthetic' ? 'synthetic_acceptance_only' : 'bounded_arvan';
  };
  return { release: environment.VERCEL_GIT_COMMIT_SHA?.match(/^[a-f0-9]{40}$/)?.[0] ?? null,
    checked_at: now.toISOString(), rollout: release?.mode ?? 'off',
    ai: { wording: reason('question-wording'), interpretation: reason('answer-interpretation'), report_explanation: reason('report-explanation'),
      acceptance_expires_at: release?.policy.acceptance.expires_at ?? null,
      limits: release?.policy.limits ?? source.limits,
      note: 'این وضعیت مجوز و پیکربندی است؛ سلامت لحظه‌ای upstream یا باقی‌ماندهٔ واقعی دفتر مالی را تضمین نمی‌کند.' },
  };
}
export type OperationStatus = ReturnType<typeof operationStatus>;
