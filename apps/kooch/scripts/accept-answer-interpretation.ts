// Bounded local acceptance against the real model, using synthetic answers only.
// Default is an offline plan. Execution also needs a fresh hosted budget hold.
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { harness, saveInput } from '../tests/helpers/account';
import { createGatewayAnswerInterpretation } from '../src/ai/answer-interpretation';
import { AiBudgetLedger } from '../src/ai/budget';
import { acceptanceFingerprint, gatewayPolicySchema, policyGate } from '../src/ai/policy';
import source from '../data/ai-gateway-policy.json';

const originalCases = [
  { question_id: 'age_exact', text: '۲۷ سال دارم', expected_status: 'proposed', answer: { state: 'known', value: 27 } },
  { question_id: 'budget', text: '۱۲۰۰۰ یورو دارم', expected_status: 'proposed', answer: { state: 'known', value: { amount: 12000, currency: 'EUR' } } },
  { question_id: 'study_level', text: 'شاید ارشد یا دکتری؛ هنوز تصمیم نگرفته‌ام', expected_status: 'ambiguous', answer: undefined },
] as const;
const followUp = process.argv.includes('--rate-limit-follow-up');
const ambiguityFollowUp = process.argv.includes('--ambiguity-session-follow-up');
if (followUp && ambiguityFollowUp) throw Error('Select one fixed acceptance run.');
const runSuffix = ambiguityFollowUp ? '-ambiguity-session-follow-up' : followUp ? '-rate-limit-follow-up' : '';
const cases = ambiguityFollowUp ? originalCases.slice(2) : followUp ? originalCases.slice(1) : originalCases;
const maxCalls = cases.length, maxBatch = maxCalls * 18000;
const spacingMs = followUp ? 310000 : 0;
const date = new Date();
const policy = gatewayPolicySchema.parse(structuredClone(source));
policy.version = `arvan-kooch-interpretation-acceptance-20261021${runSuffix}`;
policy.connection.upstream_identity = 'ArvanCloud gateway; hosted label observed 2026-10-20; downstream not verified';
policy.acceptance.tasks = { 'question-wording': false, 'answer-interpretation': true };
policy.interpretation = {
  contract_version: 'answer-interpretation-1',
  processing_location: 'نامعلوم؛ با پذیرش صریح مالک سرویس',
  recipient: 'درگاه آروان؛ گیرندهٔ بالادستی همین مدل احراز نشده',
  retention: 'عدم ذخیرهٔ تاریخچه و متریک۳۰روزه در راهنمای عمومی؛ حدود نگهداری محتوایی همین اتصال احراز نشده',
  evidence: 'https://www.arvancloud.ir/fa/legal/privacy-policy',
  checked_at: '2026-10-20T15:23:42Z', expires_at: '2026-10-21T15:23:42Z',
  acceptance_basis: { kind: 'owner_accepted_unknowns', accepted_at: date.toISOString(), reference: 'docs/adr/0013-owner-accepted-ai-data-uncertainty.md', unknowns: ['processing_location', 'upstream_recipient', 'content_retention'] },
};
if (!policy.tariff) throw Error('Tariff missing.');
policy.tariff.version = 'arvan-qwen35-marketplace-rechecked-20261020';
policy.tariff.verified_at = '2026-10-20T15:23:42Z'; policy.tariff.expires_at = '2026-10-21T15:23:42Z';
policy.acceptance.expires_at = policy.tariff.expires_at;
policy.limits.daily_user_requests = maxCalls; policy.limits.daily_user_minor = maxBatch;
// These prior external calls and hosted wording charges are outside the local ledger.
policy.limits.external_hold_minor = 57754;
policy.acceptance.fingerprint = acceptanceFingerprint(policy);
const plan = { model: policy.connection.model, endpoint: `${policy.connection.base_url}${policy.connection.api_path}`, max_calls: maxCalls, max_batch_IRR: maxBatch, spacing_ms: spacingMs, shared_cap_IRR: 500000, max_output_tokens: 128, deadline_ms: 8000, retry: false, synthetic_only: true, cases };
if (!process.argv.includes('--execute')) {
  console.log(JSON.stringify({ mode: 'offline_plan', ...plan }, null, 2));
} else {
  if (process.env.KOOCH_ACCOUNT_MODE !== 'local' || ['KOOCH_DATABASE_URL', 'KOOCH_AUTH_URL', 'KOOCH_LOCAL_MAIL_URL'].some(key => !['127.0.0.1', 'localhost'].includes(new URL(process.env[key] ?? '').hostname))) throw Error('Only local synthetic accounts are permitted.');
  const holdSchema = z.object({ checked_at: z.iso.datetime(), cap_IRR: z.literal(500000), reserved_IRR: z.literal(maxBatch),
    receipt_ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).length(maxCalls), state: z.literal('reserved_in_hosted_ledger'), prior_exposure_IRR: z.number().int().nonnegative().max(500000 - 47676 - maxBatch) }).strict();
  const hold = holdSchema.parse(JSON.parse(await readFile(`/private/tmp/kooch6-hosted-interpretation-hold${runSuffix}.json`, 'utf8')));
  if (Date.parse(hold.checked_at) > date.getTime() || date.getTime() - Date.parse(hold.checked_at) > 30 * 60000) throw Error('Fresh hosted budget hold required.');
  policy.limits.external_hold_minor = 47676 + hold.prior_exposure_IRR;
  policy.acceptance.fingerprint = acceptanceFingerprint(policy);
  const gate = policyGate(policy, date, 'answer-interpretation');
  if (gate.status !== 'accepted') throw Error(`Acceptance blocked: ${gate.status}`);
  if (!process.env.KOOCH_AI_API_KEY || !/^[a-f0-9]{64}$/.test(process.env.KOOCH_AI_ACCOUNTING_KEY ?? '')) throw Error('Existing credential/accounting configuration missing.');
  const credential = process.env.KOOCH_AI_API_KEY!.replace(/^apikey /i, '');
  if (!/^[a-zA-Z0-9+/_=.\-]+$/.test(credential)) throw Error('Credential format invalid before dispatch.');
  const reportPath = new URL(`../../../.scratch/kooch-self-service-app/evidence/arvan-interpretation-acceptance-2026-10-21${runSuffix}.json`, import.meta.url);
  try {
    const previous = JSON.parse(await readFile(reportPath, 'utf8'));
    if (previous.dispatches > 0) throw Error('Bounded run already consumed; no retry permitted.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // Durable, exclusive consumption before any dispatch; crashes never reopen this hold.
  await writeFile(`/private/tmp/kooch6-interpretation-run-consumed${runSuffix}.json`, JSON.stringify({ policy: policy.version, consumed_at: date.toISOString(), receipt_ids: hold.receipt_ids }), { flag: 'wx', mode: 0o600 });
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const ledger = new AiBudgetLedger(pool, process.env.KOOCH_AI_ACCOUNTING_KEY!);
  let dispatches = 0;
  const httpMetadata: { status: number; retry_after: string | null }[] = [];
  const results: object[] = [];
  const interpretation = createGatewayAnswerInterpretation({ policy, ledger, getCredential: () => credential, transport: async (url, init) => {
    if (++dispatches > maxCalls || String(url) !== plan.endpoint || /"(?:owner|case_id|email)"/.test(String(init?.body))) throw Error('Probe scope exceeded.');
    const response = await fetch(url, init);
    httpMetadata.push({ status: response.status, retry_after: response.headers.get('Retry-After') });
    return response;
  } });
  const h = await harness(undefined, undefined, ledger, interpretation);
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const client = await h.verifiedClient();
    cleanup = async () => { await client.request('delete', { password: client.password, confirmation: 'حذف حساب' }); };
    const first = await client.request('case', saveInput());
    if (first.status !== 200) throw Error('Synthetic case unavailable.');
    let revision = (await first.json()).case.revision;
    for (const [index, scenario] of cases.entries()) {
      if (index && spacingMs) {
        console.log(JSON.stringify({ phase: 'spacing_before_independent_scenario', wait_ms: spacingMs }));
        for (let remaining = spacingMs; remaining > 0; remaining -= Math.min(30000, remaining)) await new Promise(resolve => setTimeout(resolve, Math.min(30000, remaining)));
      }
      // The local Auth fixture issues short-lived tokens; pacing must not reuse an expired session.
      const signedIn = await client.request('signin', { email: client.email, password: client.password });
      if (signedIn.status !== 200) throw Error('Synthetic session renewal failed before dispatch.');
      const cooldown = await pool.query("SELECT max(retry_after) AS until FROM kooch.ai_budget_requests WHERE currency='IRR'");
      if (cooldown.rows[0].until && new Date(cooldown.rows[0].until).getTime() > Date.now()) throw Error('Recorded provider cooldown still active.');
      const started = performance.now(); const requestId = randomUUID();
      const response = await client.request('interpretation', { action: 'submit', expected_revision: revision, request_id: requestId, question_id: scenario.question_id, question_version: 1, text: scenario.text, disclosure: 'answer-interpretation-1' });
      const data = await response.json();
      const accounting = await (await client.request('export')).json();
      const receipt = accounting.ai_usage?.at(-1);
      const passed = response.status === 200 && data.draft?.status === scenario.expected_status && JSON.stringify(data.draft?.answer) === JSON.stringify(scenario.answer) && receipt?.state === 'settled';
      const result = { resolution_passed: false, scenario: index + 1, question: scenario.question_id, status: data.draft?.status ?? data.error, passed, elapsed_ms: Math.round(performance.now() - started),
        state: receipt?.state, charged_IRR: receipt?.charged_minor, usage: receipt?.usage, outcome: receipt?.outcome, http: httpMetadata[index], hosted_hold_id: hold.receipt_ids[index] };
      results.push(result);
      console.log(JSON.stringify({ phase: 'scenario_finished', question: scenario.question_id, passed, http: httpMetadata[index] }));
      if (!passed) break; // Stop at first failure; no retry or replacement request.
      const resolved = await client.request('interpretation', scenario.answer ? { action: 'confirm', request_id: randomUUID(), question_id: scenario.question_id, question_version: 1, expected_revision: data.revision, draft_id: requestId, answer: scenario.answer } : { action: 'reject', request_id: randomUUID(), expected_revision: data.revision, draft_id: requestId });
      if (resolved.status !== 200) throw Error('Synthetic draft resolution failed.');
      result.resolution_passed = true;
      revision = (await resolved.json()).revision;
    }
  } finally {
    const report = { checked_at: new Date().toISOString(), policy: policy.version, acceptance_basis: 'owner_accepted_unknowns', ...plan, dispatches, results, completed: results.length === maxCalls && results.every((r: any) => r.passed && r.resolution_passed), raw_provider_text_recorded: false };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    try { await cleanup?.(); } finally { await h.close(); await pool.end(); }
    console.log(JSON.stringify({ dispatches, results, completed: report.completed }));
  }
}
