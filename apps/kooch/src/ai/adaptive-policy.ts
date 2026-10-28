import source from '../../data/ai-gateway-policy.json';
import { acceptanceFingerprint, type GatewayPolicy } from './policy';

// Owner renewed the existing shared ceiling on October 28. This task sends
// only a bounded coarse projection, never free text or the saved case.
export function adaptiveInterviewPolicy(env: Readonly<Record<string, string | undefined>>, now: Date): GatewayPolicy | null {
  if (env.KOOCH_INTERVIEW_AI_ENABLED !== 'true') return null;
  const policy = structuredClone(source) as GatewayPolicy;
  const verified = '2026-10-28T15:33:00Z', expires = '2026-11-27T15:33:00Z';
  if (now.getTime() < Date.parse(verified) || now.getTime() >= Date.parse(expires)) return null;
  policy.version = 'interview-planning-arvan-20261028-1';
  policy.connection.authorization = 'apikey';
  policy.connection.upstream_identity = 'Existing Arvan gateway model; downstream processing remains owner-accepted unknown';
  policy.tariff = { version: 'arvan-public-pricing-20261028-plus20percent', verified_at: verified, expires_at: expires, currency: 'IRR', unit: 'minor', tokens_per_unit: 1000000,
    input_minor_per_unit: 10080000, output_minor_per_unit: 10080000, max_input_tokens: 4096, max_output_tokens: 128, max_request_minor: 43000, all_charges_included: false };
  // Keep the full conservative cap for the one external synthetic probe, even
  // though its reported token usage was much smaller. It is outside this ledger.
  policy.limits = { currency: 'IRR', monthly_global_minor: 500000, daily_global_minor: 500000, daily_user_minor: 129000, daily_user_requests: 3, external_hold_minor: Math.max(90676, policy.limits.external_hold_minor) };
  policy.acceptance = { fingerprint: null, expires_at: expires, iam_scope: 'workspace-owner', gateway_retry_policy: 'unknown-owner-accepted', published_tariff_accepted: true,
    tasks: { 'question-wording': false, 'answer-interpretation': false, 'report-explanation': false, 'interview-planning': true } };
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  return policy;
}
