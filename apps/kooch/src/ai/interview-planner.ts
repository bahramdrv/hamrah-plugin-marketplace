import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Answers } from '../questions';
import type { buildJourney } from '../journey';
import { sharedPrerequisites } from '../shared-prerequisites';
import { runGatewayTask, type GatewayOptions } from './gateway';
import { gatewayProfile, readCompletion } from './question-assistance';

type Interview = ReturnType<typeof buildJourney>['interview'];
type PlannedInterview = Interview & { selection: { status: string; method: 'local' | 'model'; version: string } };
const selectedSchema = z.object({ question_id: z.string().max(150) }).strict();
const localGates = new Set(['goal', 'destinations', 'job_offer_countries', 'admission_countries', ...Object.keys(sharedPrerequisites)]);
export function interviewProjection(answers: Answers, interview: Interview) {
  const answered = new Set(interview.answered_ids);
  const candidates = interview.questions.filter(q => !answered.has(q.id)).slice(0, 6).map(q => ({ id: q.id, title: q.title }));
  return { goal: answers.goal, shared: Object.fromEntries(Object.keys(sharedPrerequisites).map(key => [key, answers[key as keyof typeof sharedPrerequisites]])),
    known_fields: interview.answered_ids.filter(id => !id.includes('.')).slice(0, 16), candidates };
}
const fallback = (interview: Interview, status: string): PlannedInterview => ({ ...interview, selection: { status, method: 'local', version: 'interview-planning-1' } });
export async function planInterview(answers: Answers, interview: Interview, select: (projection: ReturnType<typeof interviewProjection>) => Promise<unknown>, isCurrent: () => Promise<boolean>): Promise<PlannedInterview> {
  const projection = interviewProjection(answers, interview);
  if (!interview.next_question || projection.candidates.length < 2) return fallback(interview, 'no_selection_needed');
  if (localGates.has(interview.next_question.id)) return fallback(interview, 'shared_question_first');
  try {
    const selected = selectedSchema.parse(await select(projection));
    if (!await isCurrent()) return fallback(interview, 'stale');
    const question = interview.questions.find(q => q.id === selected.question_id && projection.candidates.some(c => c.id === q.id));
    if (!question) return fallback(interview, 'invalid_response');
    return { ...interview, next_question: question, selection: { status: 'model_selected', method: 'model', version: 'interview-planning-1' } };
  } catch { return fallback(interview, 'invalid_response'); }
}
export type InterviewPlanner = (answers: Answers, interview: Interview, context: { owner: string; caseId: string; revision: number; isCurrent: () => Promise<boolean> }) => Promise<PlannedInterview>;
export function createGatewayInterviewPlanner(options: GatewayOptions): InterviewPlanner {
  return async (answers, interview, context) => {
    const projection = interviewProjection(answers, interview);
    if (!interview.next_question || projection.candidates.length < 2 || localGates.has(interview.next_question.id)) return fallback(interview, 'shared_question_first');
    const identity = createHash('sha256').update(JSON.stringify({ case: context.caseId, revision: context.revision, projection })).digest('hex');
    return runGatewayTask(options, { task: 'interview-planning', operation: `interview-planning:${identity}`, context,
      fallback: status => ({ ...fallback(interview, status), status }),
      execute: async ({ transport, deadlineMs, onUsage }) => {
        const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const operation = planInterview(answers, interview, async input => {
            const response = await transport('https://arvan.invalid/v1/chat/completions', { method: 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal,
              headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: gatewayProfile.model, max_tokens: 128, temperature: 0, stream: false, chat_template_kwargs: { enable_thinking: false }, messages: [
                { role: 'system', content: 'Choose the most useful next immigration intake question from candidates, using only supplied goal, shared prerequisites and known field names. Prefer broad high-impact profile questions before route-specific details. Never infer answers, eligibility, rules, or ask a new question. Return only JSON with question_id from candidates.' },
                { role: 'user', content: JSON.stringify(input) },
              ] }) });
            const completion = await readCompletion(response, controller.signal, onUsage);
            return JSON.parse(completion.choices[0].message.content);
          }, context.isCurrent);
          const result = await Promise.race([operation, new Promise<PlannedInterview>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(fallback(interview, 'timeout')); }, deadlineMs); })]);
          return { ...result, status: result.selection.status };
        } catch { return { ...fallback(interview, controller.signal.aborted ? 'timeout' : 'unavailable'), status: controller.signal.aborted ? 'timeout' : 'unavailable' }; }
        finally { clearTimeout(timer); }
      },
    });
  };
}
