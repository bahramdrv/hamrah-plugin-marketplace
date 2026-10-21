import { z } from 'zod';
import type { FormView } from '../form/workflow';
import type { Usage } from './budget';

// Fallback metadata only. Paid inference requires a separately validated gateway policy.
export const gatewayProfile = Object.freeze({
  version: 'arvan-kooch-preparation-1',
  base_url: 'https://api.arvancloudai.ir/v1',
  api_path: '/chat/completions',
  model: 'Qwen3.5-35B-A3B',
  model_listed: true,
  header_contract: 'unverified',
  limited_iam: 'unverified',
  tariff: 'unknown',
  monthly_budget_minor: 0,
  tasks: Object.freeze({ 'question-wording': 'unaccepted', 'answer-interpretation': 'unaccepted' }),
} as const);

const policyVersion = 'question-wording-1';
// Only reviewed title variants can be selected. Help, options, units and rules stay fixed.
const plainTitles: Record<string, string> = {
  age_exact: 'چند سالت است؟',
  work_years: 'چند سال کامل کار کرده‌ای؟',
  study_level: 'می‌خواهی در چه مقطعی درس بخوانی؟',
  study_offer: 'برای این مقطع، پذیرش گرفته‌ای؟',
  language_exam: 'در کدام آزمون زبان شرکت کرده‌ای؟',
  language_score: 'نمرهٔ کل آزمونت چند است؟',
  budget: 'چه مقدار پول در دسترس داری؟',
};
const selectionSchema = z.object({ question_id: z.string(), question_version: z.number().int(), wording_id: z.string() }).strict();
const completionSchema = z.object({
  model: z.literal(gatewayProfile.model),
  choices: z.array(z.object({
    index: z.literal(0).optional(), logprobs: z.null().optional(), stop_reason: z.null().optional(),
    token_ids: z.null().optional(), routed_experts: z.null().optional(),
    finish_reason: z.literal('stop'),
    message: z.object({
      role: z.literal('assistant'), content: z.string().min(1).max(1000), refusal: z.null().optional(),
      annotations: z.array(z.never()).max(0).nullable().optional(), audio: z.null().optional(), function_call: z.null().optional(),
      reasoning: z.null().optional(), reasoning_content: z.null().optional(), tool_calls: z.null().optional(),
    }).strict(),
  }).strict()).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative().max(128), total_tokens: z.number().int().nonnegative() }),
});
export type Status = 'budget_zero' | 'simulated_wording' | 'worded' | 'invalid_response' | 'unavailable' | 'timeout' | 'no_question' | 'stale' |
  'configuration_invalid' | 'pricing_unknown' | 'capability_unaccepted' | 'budget_exhausted' | 'cooldown' | 'policy_blocked' | 'already_requested' | 'accounting_unavailable' | 'credentials_missing';
export type AssistedFormView = FormView & { interpretation_disclosure?: { recipient: string; processing_location: string; retention: string; evidence: string; acceptance_notice?: string } | null; question_assistance: {
  policy_version: string; status: Status; model_listed: boolean;
  inference_accepted: boolean; answer_interpretation_accepted: boolean;
  daily_request_limit?: number;
} };
export type QuestionAssistance = (view: FormView, context?: { owner: string; isCurrent?: () => Promise<boolean> }) => Promise<AssistedFormView>;
export function fixedQuestion(view: FormView, status: Status = 'budget_zero'): AssistedFormView {
  return { ...view, question_assistance: {
    policy_version: policyVersion, status, model_listed: gatewayProfile.model_listed,
    inference_accepted: false, answer_interpretation_accepted: false,
  } };
}

type UsageObserver = (usage: Usage, reportedModel: unknown) => Promise<void>;
const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().safe(), completion_tokens: z.number().int().nonnegative().safe(), total_tokens: z.number().int().nonnegative().safe() });
export async function readCompletion(response: Response, signal: AbortSignal, onUsage?: UsageObserver) {
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) {
    void response.body?.cancel().catch(() => {});
    throw Error('unavailable');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_response');
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16000) throw Error('invalid_response');
      chunks.push(value);
    }
    const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const usage = usageSchema.safeParse(raw?.usage);
    // Billing is independent of whether the proposed wording is usable.
    if (usage.success && usage.data.total_tokens === usage.data.prompt_tokens + usage.data.completion_tokens) await onUsage?.(usage.data, raw?.model);
    return completionSchema.parse(raw);
  } finally { signal.removeEventListener('abort', cancel); cancel(); }
}

export function createQuestionAssistance(options: { transport?: typeof fetch; simulation?: boolean; deadlineMs?: number; onUsage?: UsageObserver } = {}): QuestionAssistance {
  return async view => {
    // The standalone engine uses a credential-free placeholder. The metered server
    // adapter may replace it only after policy acceptance and budget reservation.
    if (!options.simulation || !options.transport) return fixedQuestion(view);
    const question = view.next_question;
    if (!question) return fixedQuestion(view, 'no_question');
    const wordings = [{ id: 'fixed-1', title: question.title }];
    if (plainTitles[question.id]) wordings.push({ id: 'plain-1', title: plainTitles[question.id] });
    const { id, version, title, help, priority } = question;
    const payload = {
      model: gatewayProfile.model, max_tokens: 128, temperature: 0, stream: false,
      chat_template_kwargs: { enable_thinking: false },
      messages: [
        { role: 'system', content: 'Select one supplied Persian wording. Return only JSON with question_id, question_version, wording_id. Never add prose or fields.' },
        { role: 'user', content: JSON.stringify({ question: { id, version, title, help, priority }, wordings }) },
      ],
    };
    const controller = new AbortController();
    const deadline = Math.min(8000, Math.max(1, options.deadlineMs ?? 8000));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = (async () => {
        const response = await options.transport!('https://arvan.invalid/v1/chat/completions', {
          method: 'POST', redirect: 'error', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
        }).catch(() => { throw Error('unavailable'); });
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw Error('timeout'); }
        const completion = await readCompletion(response, controller.signal, options.onUsage);
        if (completion.usage.total_tokens !== completion.usage.prompt_tokens + completion.usage.completion_tokens) throw Error('invalid_response');
        const selected = selectionSchema.parse(JSON.parse(completion.choices[0].message.content));
        const wording = wordings.find(w => w.id === selected.wording_id);
        if (!wording || selected.question_id !== id || selected.question_version !== version) throw Error('invalid_response');
        return { ...fixedQuestion(view, 'simulated_wording'), next_question: { ...question, title: wording.title } };
      })();
      const timeout = new Promise<AssistedFormView>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(fixedQuestion(view, 'timeout')); }, deadline);
      });
      return await Promise.race([operation, timeout]);
    } catch (error) {
      return fixedQuestion(view, error instanceof Error && error.message === 'unavailable' ? 'unavailable' : 'invalid_response');
    } finally { clearTimeout(timer); }
  };
}
