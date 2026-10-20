import type { Usage, AiBudgetLedger } from './budget';
import { createQuestionAssistance, fixedQuestion, type QuestionAssistance, type Status } from './question-assistance';
import { policyGate, usageCost } from './policy';

function retryAfter(value: string | null, now: Date): Date | undefined {
  if (!value) return;
  const ms = /^\d+$/.test(value) ? now.getTime() + Number(value) * 1000 : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return;
  return new Date(Math.min(ms, now.getTime() + 86400000));
}
export type GatewayOptions = { policy: unknown; ledger: AiBudgetLedger; getCredential: () => string | undefined; transport?: typeof fetch; now?: () => Date; deadlineMs?: number };
export type TaskResult = { status: string; accounting_policy?: string };
export async function runGatewayTask<T extends TaskResult>(options: GatewayOptions, request: {
  task: 'question-wording' | 'answer-interpretation'; operation: string; draft?: { case_id: string; revision: number; id: string };
  context?: { owner: string; isCurrent?: () => Promise<boolean> };
  execute: (options: { transport: typeof fetch; deadlineMs: number; onUsage: (usage: Usage, model: unknown) => Promise<void> }) => Promise<T>;
  fallback: (status: Status) => T;
}): Promise<T> {
    const { context, fallback } = request;
    const now = options.now ?? (() => new Date());
    let gate;
    try { gate = policyGate(options.policy, now(), request.task); } catch { return fallback('configuration_invalid'); }
    if (gate.status !== 'accepted') return fallback(gate.status);
    const { policy, reservation } = gate;
    const accounted = (value: T): T => ({ ...value, accounting_policy: policy.version });
    if (!context?.owner || !context.isCurrent) return fallback('capability_unaccepted');
    const started = performance.now();
    const elapsed = () => Math.max(0, Math.round(performance.now() - started));
    const deadline = Math.min(8000, Math.max(1, options.deadlineMs ?? 8000));
    let credential: string | undefined;
    try { credential = options.getCredential(); } catch { return fallback('credentials_missing'); }
    if (!credential || !/^[a-zA-Z0-9+/_=.\-]+$/.test(credential)) return fallback('credentials_missing');
    let id: string | undefined, dispatched = false, settled = false;
    let failure: Status | undefined;
    const operation = request.operation;
    const ledger = options.ledger;
    const cancelUnsent = async (receipt: string) => {
      await ledger.cancelUnsent(receipt);
      if (request.task === 'answer-interpretation') await ledger.detachOperation(context.owner, operation, policy.version);
    };
    const result = await request.execute({ deadlineMs: Math.max(1, deadline - elapsed()),
      transport: async (_url, init) => {
        if (Buffer.byteLength(String(init?.body), 'utf8') + 512 > policy.tariff!.max_input_tokens) { failure = 'configuration_invalid'; throw Error('Input bound.'); }
        try {
          if (!await context.isCurrent!()) { failure = 'stale'; throw Error('Stale request.'); }
          if (init?.signal?.aborted || elapsed() >= deadline) throw Error('Deadline.');
          const reserved = await ledger.reserve({ owner: context.owner, operation, policy: policy.version, reserved_minor: reservation, limits: policy.limits, tariff: policy.tariff!, draft: request.draft });
          if (reserved.status !== 'reserved') {
            failure = reserved.status === 'duplicate' ? 'already_requested' : reserved.status === 'busy' ? 'accounting_unavailable' : reserved.status === 'owner_unavailable' ? 'stale' : reserved.status;
            throw Error('Reservation unavailable.');
          }
          id = reserved.id!;
          if (init?.signal?.aborted || elapsed() >= deadline) { await cancelUnsent(id); throw Error('Deadline.'); }
          if (!await ledger.markSent(id, policy.connection.model)) throw Error('Not reserved.');
          if (!await context.isCurrent!()) { failure = 'stale'; await cancelUnsent(id); throw Error('Stale request.'); }
          if (init?.signal?.aborted || elapsed() >= deadline) { await cancelUnsent(id); throw Error('Deadline.'); }
          dispatched = true;
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `${policy.connection.authorization} ${credential}`);
          const response = await (options.transport ?? fetch)(`${policy.connection.base_url}${policy.connection.api_path}`, { ...init, headers, redirect: 'error' });
          if ([401, 403, 429].includes(response.status)) {
            await ledger.markUnknown(id, `http_${response.status}`, elapsed(), { blocked: response.status !== 429, retryAfter: retryAfter(response.headers.get('Retry-After'), now()) });
          }
          return response;
        } catch (error) {
          if (!failure && !dispatched && !init?.signal?.aborted) failure = 'accounting_unavailable';
          throw error;
        }
      },
      onUsage: async (usage, reportedModel) => {
        if (!id) throw Error('Missing reservation.');
        if (reportedModel !== policy.connection.model) {
          await ledger.markUnknown(id, 'unexpected_model', elapsed(), { blocked: true });
          throw Error('Unaccepted model.');
        }
        await ledger.settle(id, usageCost(policy, usage), usage, 'response_received', elapsed(), policy.connection.model);
        settled = true;
      },
    });
    // Unknown post-dispatch costs stay reserved, including errors, absent usage and timeouts.
    const finalize = async () => {
      try {
        if (id && dispatched && !settled) await ledger.markUnknown(id, result.status, elapsed());
        else if (id && settled) await ledger.recordOutcome(id, result.status, elapsed());
        else if (id && !dispatched) await cancelUnsent(id);
      } catch { failure = 'accounting_unavailable'; }
    };
    // Bookkeeping may finish after the UI deadline; it must never extend the wait.
    const accounting = finalize();
    const remaining = deadline - elapsed();
    if (remaining <= 0) {
      void accounting;
      return accounted(fallback('timeout'));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = await Promise.race([accounting.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), remaining); })]);
    clearTimeout(timer);
    if (!done) return accounted(fallback('timeout'));
    if (failure) return accounted(fallback(failure));
    return accounted(result);
}


export function createGatewayQuestionAssistance(options: GatewayOptions): QuestionAssistance {
  return async (view, context) => {
    const question = view.next_question;
    if (!question) return fixedQuestion(view, 'no_question');
    const result = await runGatewayTask(options, {
      task: 'question-wording', operation: `${view.case_id}:${view.revision}:${question.id}:${question.version}`, context,
      fallback: status => ({ status, view: fixedQuestion(view, status) }),
      execute: async engineOptions => {
        const assisted = await createQuestionAssistance({ ...engineOptions, simulation: true })(view);
        const status = assisted.question_assistance.status === 'simulated_wording' ? 'worded' : assisted.question_assistance.status;
        assisted.question_assistance.status = status;
        return { status, view: assisted };
      },
    });
    const gate = policyGate(options.policy, (options.now ?? (() => new Date()))());
    if (gate.status === 'accepted') {
      result.view.question_assistance.inference_accepted = true;
      result.view.question_assistance.daily_request_limit = gate.policy.limits.daily_user_requests;
      result.view.question_assistance.answer_interpretation_accepted = policyGate(options.policy, (options.now ?? (() => new Date()))(), 'answer-interpretation').status === 'accepted';
    }
    return result.view;
  };
}
