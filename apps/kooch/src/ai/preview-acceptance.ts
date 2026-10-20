import { createHash } from 'node:crypto';
import { z } from 'zod';
import { acceptanceFingerprint, gatewayPolicySchema, policyGate } from './policy';
import { createGatewayQuestionAssistance } from './gateway';
import { fixedQuestion, type QuestionAssistance } from './question-assistance';
type Environment = Readonly<Record<string, string | undefined>>;

// Operator-authorized synthetic acceptance only. This never changes the shipped policy.
export function previewAcceptanceProfile(value: unknown, env: Environment, now: Date) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== 'codex/kooch-arvan-acceptance' ||
    env.KOOCH_APP_ORIGIN !== 'https://kooch-git-codex-kooch-arvan-acceptance-bahramd-s-projects2.vercel.app' ||
    env.KOOCH_AI_PREVIEW_ACCEPTANCE !== '2026-10-20-three-synthetic' || !z.uuid().safeParse(env.KOOCH_AI_PREVIEW_CASE_ID).success) return;
  const parsed = gatewayPolicySchema.safeParse(value);
  if (!parsed.success) return;
  const policy = parsed.data, caseId = env.KOOCH_AI_PREVIEW_CASE_ID!;
  if (!policy.tariff || policy.connection.base_url !== 'https://api.arvancloudai.ir/v1' ||
    Date.parse(policy.tariff.expires_at) <= now.getTime()) return;
  policy.version = `arvan-kooch-preview-20261020-${createHash('sha256').update(caseId).digest('hex').slice(0, 12)}`;
  // Marketplace hosting label observed 18 Oct; this is not an immutable weights identity.
  policy.connection.upstream_identity = 'ArvanCloud-hosted/Qwen3.5-35B-A3B/marketplace-observed-2026-10-18';
  policy.acceptance.tasks = { 'question-wording': true, 'answer-interpretation': false };
  policy.acceptance.expires_at = policy.tariff.expires_at;
  const globalCap = Math.min(policy.limits.monthly_global_minor, policy.limits.daily_global_minor);
  const available = Math.min(60000, Math.max(0, globalCap - policy.limits.external_hold_minor));
  policy.limits.monthly_global_minor = policy.limits.daily_global_minor = policy.limits.external_hold_minor + available;
  policy.limits.daily_user_minor = Math.min(policy.limits.daily_user_minor, 60000);
  policy.limits.daily_user_requests = Math.min(policy.limits.daily_user_requests, 3);
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  if (policyGate(policy, now).status !== 'accepted') return;
  return { policy, caseId };
}

export function createScopedQuestionAssistance(options: Parameters<typeof createGatewayQuestionAssistance>[0] & { environment: Environment }): QuestionAssistance {
  const preview = previewAcceptanceProfile(options.policy, options.environment, (options.now ?? (() => new Date()))());
  const gateway = createGatewayQuestionAssistance({ ...options, policy: preview?.policy ?? options.policy });
  return (view, context) => {
    if (preview && view.case_id !== preview.caseId) return Promise.resolve(fixedQuestion(view, 'capability_unaccepted'));
    return gateway(view, context);
  };
}
