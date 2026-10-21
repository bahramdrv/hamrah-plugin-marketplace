import { z } from 'zod';
import { gatewayPolicySchema, acceptanceFingerprint, policyGate } from './policy';
// Same model/contracts accepted independently in tickets 05/06. This window is
// the recorded 21 Oct marketplace check, not an automatic tariff renewal.
export function productionActivation(value: unknown, env: Readonly<Record<string, string | undefined>>, now: Date) {
  const mode = env.KOOCH_AI_ROLLOUT;
  if (!['synthetic', 'public'].includes(mode ?? '')) return { status: 'disabled_by_operator' as const };
  if (env.VERCEL_ENV !== 'production' || env.KOOCH_APP_ORIGIN !== 'https://my.kooch.app') return { status: 'environment_unaccepted' as const };
  const caseId = env.KOOCH_AI_ACCEPTANCE_CASE_ID;
  if (mode === 'synthetic' && !z.uuid().safeParse(caseId).success) return { status: 'acceptance_case_invalid' as const };
  const parsed = gatewayPolicySchema.safeParse(value);
  if (!parsed.success) {
    const paths = parsed.error.issues.map(issue => issue.path.join('.'));
    if (paths.includes('connection.model')) return { status: 'model_unaccepted' as const };
    if (paths.some(path => ['schema_version', 'connection.contract_version', 'connection.prompt_version', 'interpretation.contract_version'].includes(path))) return { status: 'schema_unsupported' as const };
    return { status: 'configuration_invalid' as const };
  }
  const policy = parsed.data;
  if (policy.connection.base_url !== 'https://api.arvancloudai.ir/v1' || policy.connection.authorization !== 'apikey' || policy.connection.model !== 'Qwen3.5-35B-A3B') return { status: 'capability_unaccepted' as const };
  if (!policy.tariff || policy.tariff.currency !== 'IRR' || policy.tariff.input_minor_per_unit !== 4200000 || policy.tariff.output_minor_per_unit !== 4200000 || policy.tariff.tokens_per_unit !== 1000000 || policy.tariff.max_input_tokens !== 4096 || policy.tariff.max_request_minor !== 18000) return { status: 'pricing_unknown' as const };
  const externalHold = Math.max(47676, policy.limits.external_hold_minor);
  policy.version = 'arvan-kooch-production-20261021';
  policy.connection.upstream_identity = 'ArvanCloud gateway; hosted label observed 2026-10-21; downstream not verified';
  policy.tariff = { ...policy.tariff, version: 'arvan-qwen35-marketplace-rechecked-20261021', verified_at: '2026-10-21T10:04:01Z', expires_at: '2026-10-22T10:04:01Z' };
  policy.acceptance.tasks = { 'question-wording': true, 'answer-interpretation': true };
  policy.acceptance.expires_at = policy.tariff.expires_at;
  policy.interpretation = { contract_version: 'answer-interpretation-1',
    processing_location: 'نامعلوم؛ با پذیرش صریح مالک سرویس', recipient: 'درگاه آروان؛ گیرندهٔ بالادستی همین مدل احراز نشده',
    retention: 'حدود نگهداری محتوایی و کشور پردازش احراز نشده‌اند؛ متریک و تاریخچه دو موضوع متفاوت‌اند.',
    evidence: 'https://www.arvancloud.ir/fa/legal/privacy-policy', checked_at: '2026-10-21T10:04:01Z', expires_at: policy.tariff.expires_at,
    acceptance_basis: { kind: 'owner_accepted_unknowns', accepted_at: '2026-10-21T09:56:17Z', reference: 'docs/adr/0013-owner-accepted-ai-data-uncertainty.md; ticket 10 public activation instruction', unknowns: ['processing_location', 'upstream_recipient', 'content_retention'] },
  };
  // 50,000 toman total, including prior local tests and the shared hosted ledger.
  // Hosted receipts are NOT added to external_hold again.
  policy.limits = { currency: 'IRR', monthly_global_minor: 500000, daily_global_minor: 500000,
    daily_user_minor: 60000, daily_user_requests: 3, external_hold_minor: externalHold };
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  for (const task of ['question-wording', 'answer-interpretation'] as const) {
    const gate = policyGate(policy, now, task);
    if (gate.status !== 'accepted') return { status: gate.status };
  }
  return { status: 'accepted' as const, profile: { policy, mode: mode as 'synthetic' | 'public', caseId: mode === 'synthetic' ? caseId : undefined } };
}

export function productionAcceptanceProfile(value: unknown, env: Readonly<Record<string, string | undefined>>, now: Date) {
  const activation = productionActivation(value, env, now);
  return activation.status === 'accepted' ? activation.profile : undefined;
}
