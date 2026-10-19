import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import source from '../../data/ai-gateway-policy.json';
import { acceptanceFingerprint, type GatewayPolicy } from '../../src/ai/policy';
export const aiNow = () => new Date('2040-06-01T12:00:00Z');
export async function activeBudgetOwner(pool: Pool) {
  const owner = randomUUID();
  await pool.query('INSERT INTO kooch.account_state(owner) VALUES($1)', [owner]);
  return owner;
}
export function acceptedPolicy(): GatewayPolicy {
  const policy = structuredClone(source) as GatewayPolicy;
  policy.version = `fixture-${randomUUID()}`;
  policy.connection.base_url = 'https://arvan.invalid/v1';
  policy.connection.authorization = 'apikey'; policy.connection.upstream_identity = 'fixture-only';
  policy.tariff = { version: 'fixture-1', verified_at: '2040-06-01T00:00:00Z', expires_at: '2040-07-01T00:00:00Z', currency: `test-${randomUUID()}`, unit: 'minor', tokens_per_unit: 1, input_minor_per_unit: 1, output_minor_per_unit: 1, max_input_tokens: 4096, max_output_tokens: 128, max_request_minor: 4224, all_charges_included: true };
  policy.limits = { currency: policy.tariff.currency, monthly_global_minor: 8448, daily_global_minor: 8448, daily_user_minor: 8448, daily_user_requests: 20, external_hold_minor: 0 };
  policy.acceptance = { fingerprint: acceptanceFingerprint(policy), expires_at: '2040-07-01T00:00:00Z', iam_scoped: true, gateway_retry_disabled: true, tasks: { 'question-wording': true, 'answer-interpretation': false } };
  return policy;
}
export const aiCompletion = (content: unknown = { question_id: 'age_exact', question_version: 1, wording_id: 'plain-1' }) => Response.json({ model: 'Qwen3.5-35B-A3B', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } });
