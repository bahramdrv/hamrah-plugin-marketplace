import type { AiBudgetLedger } from './budget';
import { createQuestionAssistance, fixedQuestion, type QuestionAssistance, type Status } from './question-assistance';
import { policyGate, usageCost } from './policy';

function retryAfter(value: string | null, now: Date): Date | undefined {
  if (!value) return;
  const ms = /^\d+$/.test(value) ? now.getTime() + Number(value) * 1000 : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= now.getTime()) return;
  return new Date(Math.min(ms, now.getTime() + 86400000));
}
export function createGatewayQuestionAssistance(options: { policy: unknown; ledger: AiBudgetLedger; getCredential: () => string | undefined; transport?: typeof fetch; now?: () => Date; deadlineMs?: number }): QuestionAssistance {
  return async (view, context) => {
    const now = options.now ?? (() => new Date());
    let gate;
    try { gate = policyGate(options.policy, now()); } catch { return fixedQuestion(view, 'configuration_invalid'); }
    if (gate.status !== 'accepted') return fixedQuestion(view, gate.status);
    const { policy, reservation } = gate;
    const accepted = (result: ReturnType<typeof fixedQuestion>) => {
      result.question_assistance.inference_accepted = true;
      result.question_assistance.answer_interpretation_accepted = policy.acceptance.tasks['answer-interpretation'];
      result.question_assistance.daily_request_limit = policy.limits.daily_user_requests;
      return result;
    };
    if (!context?.owner || !context.isCurrent) return fixedQuestion(view, 'capability_unaccepted');
    const question = view.next_question;
    if (!question) return accepted(fixedQuestion(view, 'no_question'));
    const started = performance.now();
    const elapsed = () => Math.max(0, Math.round(performance.now() - started));
    const deadline = Math.min(8000, Math.max(1, options.deadlineMs ?? 8000));
    let credential: string | undefined;
    try { credential = options.getCredential(); } catch { return accepted(fixedQuestion(view, 'credentials_missing')); }
    if (!credential || !/^[a-zA-Z0-9+/_=.\-]+$/.test(credential)) return accepted(fixedQuestion(view, 'credentials_missing'));
    let id: string | undefined, dispatched = false, settled = false;
    let failure: Status | undefined;
    const operation = `${view.case_id}:${view.revision}:${question.id}:${question.version}`;
    const ledger = options.ledger;
    const assistance = createQuestionAssistance({ simulation: true, deadlineMs: Math.max(1, deadline - elapsed()),
      transport: async (_url, init) => {
        if (Buffer.byteLength(String(init?.body), 'utf8') + 512 > policy.tariff!.max_input_tokens) { failure = 'configuration_invalid'; throw Error('Input bound.'); }
        try {
          if (!await context.isCurrent!()) { failure = 'stale'; throw Error('Stale request.'); }
          if (init?.signal?.aborted || elapsed() >= deadline) throw Error('Deadline.');
          const reserved = await ledger.reserve({ owner: context.owner, operation, policy: policy.version, reserved_minor: reservation, limits: policy.limits, tariff: policy.tariff! });
          if (reserved.status !== 'reserved') {
            failure = reserved.status === 'duplicate' ? 'already_requested' : reserved.status === 'busy' ? 'accounting_unavailable' : reserved.status === 'owner_unavailable' ? 'stale' : reserved.status;
            throw Error('Reservation unavailable.');
          }
          id = reserved.id!;
          if (init?.signal?.aborted || elapsed() >= deadline) { await ledger.cancelUnsent(id); throw Error('Deadline.'); }
          if (!await ledger.markSent(id, policy.connection.model)) throw Error('Not reserved.');
          if (!await context.isCurrent!()) { failure = 'stale'; await ledger.cancelUnsent(id); throw Error('Stale request.'); }
          if (init?.signal?.aborted || elapsed() >= deadline) { await ledger.cancelUnsent(id); throw Error('Deadline.'); }
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
    const result = await assistance(view);
    // Unknown post-dispatch costs stay reserved, including errors, absent usage and timeouts.
    const finalize = async () => {
      try {
        if (id && dispatched && !settled) await ledger.markUnknown(id, result.question_assistance.status, elapsed());
        else if (id && settled) await ledger.recordOutcome(id, result.question_assistance.status === 'simulated_wording' ? 'worded' : result.question_assistance.status, elapsed());
        else if (id && !dispatched) await ledger.cancelUnsent(id);
      } catch { failure = 'accounting_unavailable'; }
    };
    // Bookkeeping may finish after the UI deadline; it must never extend the wait.
    const accounting = finalize();
    const remaining = deadline - elapsed();
    if (remaining <= 0) {
      void accounting;
      return accepted(fixedQuestion(view, 'timeout'));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = await Promise.race([accounting.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), remaining); })]);
    clearTimeout(timer);
    if (!done) return accepted(fixedQuestion(view, 'timeout'));
    if (failure) return accepted(fixedQuestion(view, failure));
    if (result.question_assistance.status === 'simulated_wording') result.question_assistance.status = 'worded';
    return accepted(result);
  };
}
