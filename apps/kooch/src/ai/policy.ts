import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Usage } from './budget';
const positive = z.number().int().positive().safe();
const money = z.number().int().nonnegative().safe();
export const gatewayPolicySchema = z.object({
  schema_version: z.literal(1), version: z.string().min(1).max(100),
  connection: z.object({
    base_url: z.enum(['https://api.arvancloudai.ir/v1', 'https://arvan.invalid/v1']),
    api_path: z.literal('/chat/completions'), model: z.literal('Qwen3.5-35B-A3B'),
    authorization: z.enum(['apikey', 'Bearer']).nullable(), upstream_identity: z.string().min(1).nullable(),
    contract_version: z.literal('chat-completions-wording-5'), prompt_version: z.literal('question-wording-1'), guardrail_version: z.string().nullable(),
  }).strict(),
  acceptance: z.object({ fingerprint: z.string().nullable(), expires_at: z.iso.datetime().nullable(), iam_scope: z.enum(['resource-scoped', 'workspace-owner']).nullable(), gateway_retry_policy: z.enum(['disabled-confirmed', 'unknown-owner-accepted']).nullable(), published_tariff_accepted: z.boolean(),
    tasks: z.object({ 'question-wording': z.boolean(), 'answer-interpretation': z.boolean() }).strict(),
  }).strict(),
  tariff: z.object({ version: z.string().min(1), verified_at: z.iso.datetime(), expires_at: z.iso.datetime(), currency: z.string().min(3).max(64),
    unit: z.literal('minor'), tokens_per_unit: positive, input_minor_per_unit: money, output_minor_per_unit: money,
    max_input_tokens: positive.max(1000000), max_output_tokens: z.literal(128), max_request_minor: positive, all_charges_included: z.boolean(),
  }).strict().nullable(),
  limits: z.object({ currency: z.string().min(3).max(64), monthly_global_minor: money, daily_global_minor: money, daily_user_minor: money, daily_user_requests: money, external_hold_minor: money }).strict(),
}).strict();
export type GatewayPolicy = z.infer<typeof gatewayPolicySchema>;
export function acceptanceFingerprint(policy: GatewayPolicy) {
  return createHash('sha256').update(JSON.stringify({ version: policy.version, connection: policy.connection, tariff: policy.tariff, external_hold_minor: policy.limits.external_hold_minor, iam_scope: policy.acceptance.iam_scope, gateway_retry_policy: policy.acceptance.gateway_retry_policy, published_tariff_accepted: policy.acceptance.published_tariff_accepted })).digest('hex');
}
export function usageCost(policy: Pick<GatewayPolicy, 'tariff'>, usage: Pick<Usage, 'prompt_tokens' | 'completion_tokens'>) {
  const t = policy.tariff;
  if (!t || ![usage.prompt_tokens, usage.completion_tokens].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Unpriced usage.');
  const ceil = (n: bigint) => (n + BigInt(t.tokens_per_unit) - 1n) / BigInt(t.tokens_per_unit);
  const total = ceil(BigInt(usage.prompt_tokens) * BigInt(t.input_minor_per_unit)) + ceil(BigInt(usage.completion_tokens) * BigInt(t.output_minor_per_unit));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Cost out of range.');
  return Number(total);
}
export function policyGate(value: unknown, now: Date) {
  const parsed = gatewayPolicySchema.safeParse(value);
  if (!parsed.success) return { status: 'configuration_invalid' as const };
  const policy = parsed.data;
  if (Math.min(policy.limits.monthly_global_minor, policy.limits.daily_global_minor, policy.limits.daily_user_minor, policy.limits.daily_user_requests) === 0) return { status: 'budget_zero' as const };
  const t = policy.tariff;
  if (!t || (!t.all_charges_included && !policy.acceptance.published_tariff_accepted) || t.currency !== policy.limits.currency || Date.parse(t.verified_at) > now.getTime() || Date.parse(t.expires_at) <= now.getTime() ||
    (!policy.connection.base_url.includes('.invalid') && !/^[A-Z]{3}$/.test(t.currency))) return { status: 'pricing_unknown' as const };
  const a = policy.acceptance;
  if (!policy.connection.authorization || !policy.connection.upstream_identity || !a.iam_scope || !a.gateway_retry_policy || !a.tasks['question-wording'] ||
    !a.expires_at || Date.parse(a.expires_at) <= now.getTime() || a.fingerprint !== acceptanceFingerprint(policy)) return { status: 'capability_unaccepted' as const };
  const reservation = usageCost(policy, { prompt_tokens: t.max_input_tokens, completion_tokens: t.max_output_tokens });
  if (reservation <= 0 || reservation > t.max_request_minor) return { status: 'pricing_unknown' as const };
  const held = BigInt(policy.limits.external_hold_minor) + BigInt(reservation);
  if (held > BigInt(policy.limits.monthly_global_minor) || held > BigInt(policy.limits.daily_global_minor)) return { status: 'budget_exhausted' as const };
  return { status: 'accepted' as const, policy, reservation };
}
