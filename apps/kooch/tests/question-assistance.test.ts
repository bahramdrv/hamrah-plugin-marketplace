import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionAssistance } from '../src/ai/question-assistance';
import { formView } from '../src/form/workflow';
import { answersSchema } from '../src/questions';

const view = () => formView({ id: 'private-case', revision: 7, answers: answersSchema.parse({ goal: 'study', age: 'under-30' }), step: 2, consent_version: 'account-save-1', last_activity_at: '2026-10-18T00:00:00Z', delete_after: '2027-01-16T00:00:00Z' });

test('zero budget does not invoke any transport and immediately preserves the fixed next question', async () => {
  let calls = 0;
  const assistance = createQuestionAssistance({ transport: async () => { calls++; throw Error('must not connect'); } });
  const original = view();
  const result = await assistance(original);
  assert.equal(calls, 0);
  assert.deepEqual(result.next_question, original.next_question);
  assert.equal(result.question_assistance.status, 'budget_zero');
  assert.equal(result.question_assistance.model_listed, true);
  assert.equal(result.question_assistance.inference_accepted, false);
  assert.equal(result.question_assistance.answer_interpretation_accepted, false);
});

const completion = (content: unknown, extra: Record<string, unknown> = {}) => Response.json({
  model: 'Qwen3.5-35B-A3B',
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }, ...extra,
});
const selection = { question_id: 'age_exact', question_version: 1, wording_id: 'plain-1' };

test('empty provider message metadata preserves a valid selection while nonempty metadata is rejected', async () => {
  const empty = { refusal: null, annotations: [], audio: null, function_call: null, reasoning: null, reasoning_content: null, tool_calls: null };
  const response = (metadata: Record<string, unknown>) => completion(selection, { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(selection), ...metadata } }] });
  const original = view();
  const valid = await createQuestionAssistance({ simulation: true, transport: async () => response(empty) })(original);
  assert.equal(valid.question_assistance.status, 'simulated_wording');
  assert.equal(valid.next_question?.title, 'چند سالت است؟');
  for (const metadata of [
    { ...empty, annotations: [{ type: 'url_citation', url: 'https://example.com' }] },
    { ...empty, audio: {} }, { ...empty, function_call: {} },
    { ...empty, reasoning: 'hidden prose' }, { ...empty, reasoning_content: 'hidden prose' },
    { ...empty, tool_calls: [] }, { ...empty, unrecognized: null },
  ]) {
    const invalid = await createQuestionAssistance({ simulation: true, transport: async () => response(metadata) })(original);
    assert.equal(invalid.question_assistance.status, 'invalid_response');
    assert.deepEqual(invalid.next_question, original.next_question);
  }
});

test('simulated wording selects reviewed Persian copy using descriptors only; controls and all facts remain unchanged', async () => {
  let payload: any;
  const assistance = createQuestionAssistance({ simulation: true, transport: async (url, init) => {
    assert.equal(String(url), 'https://arvan.invalid/v1/chat/completions');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    payload = JSON.parse(String(init?.body));
    return completion(selection);
  } });
  const original = view();
  const result = await assistance(original);
  assert.equal(result.next_question?.title, 'چند سالت است؟');
  assert.deepEqual({ ...result.next_question, title: original.next_question!.title }, original.next_question);
  assert.deepEqual(result.answers, original.answers);
  assert.equal(result.revision, 7);
  assert.equal(result.question_assistance.status, 'simulated_wording');
  const descriptors = JSON.parse(payload.messages[1].content);
  assert.deepEqual(Object.keys(descriptors).sort(), ['question', 'wordings']);
  assert.deepEqual(Object.keys(descriptors.question).sort(), ['help', 'id', 'priority', 'title', 'version']);
  assert.equal(descriptors.question.id, 'age_exact');
  const serialized = JSON.stringify(payload);
  for (const forbidden of ['private-case', 'under-30', 'last_activity_at', 'case_id', 'revision', 'email', 'answers']) assert.ok(!serialized.includes(forbidden), forbidden);
  assert.equal(payload.stream, false);
  assert.equal(payload.model, 'Qwen3.5-35B-A3B');
  assert.equal(payload.max_tokens, 128);
  assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
});

test('the deadline cancels an unfinished response body and late output cannot change the displayed question', async () => {
  let cancelled = false;
  const original = view();
  const assistance = createQuestionAssistance({ simulation: true, deadlineMs: 15, transport: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }) });
  const result = await assistance(original);
  assert.equal(result.question_assistance.status, 'timeout');
  assert.deepEqual(result.next_question, original.next_question);
  assert.equal(cancelled, true);
});

test('invalid or invented output, reasoning, refusal, tools, truncation and missing usage all keep the fixed contract', async () => {
  const cases = [
    () => completion('متن آزاد'),
    () => completion('```json\n' + JSON.stringify(selection) + '\n```'),
    () => completion({ ...selection, question_id: 'invented' }),
    () => completion({ ...selection, question_version: 99 }),
    () => completion({ ...selection, wording_id: 'invented' }),
    ...['options', 'unit', 'input', 'help', 'title', 'html', 'rule', 'url', 'code'].map(key => () => completion({ ...selection, [key]: '<a href="https://evil.example">متن تازه</a>' })),
    () => completion(selection, { model: 'another-model' }),
    () => completion(selection, { usage: undefined }),
    () => completion(selection, { usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 0 } }),
    () => completion(selection, { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: JSON.stringify(selection) } }] }),
    ...['reasoning', 'reasoning_content', 'tool_calls', 'refusal'].map(key => () => completion(selection, { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(selection), [key]: 'unsupported' } }] })),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('x'.repeat(16001), { headers: { 'Content-Type': 'application/json' } }),
  ];
  for (const fixture of cases) {
    let attempts = 0;
    const original = view();
    const result = await createQuestionAssistance({ simulation: true, transport: async () => { attempts++; return fixture(); } })(original);
    assert.equal(result.question_assistance.status, 'invalid_response');
    assert.deepEqual(result.next_question, original.next_question);
    assert.equal(attempts, 1);
  }
});

test('provider failures and a hung transport never retry or use another provider; late output is discarded', async () => {
  for (const status of [301, 401, 403, 429, 500, 502, 503]) {
    let attempts = 0;
    const result = await createQuestionAssistance({ simulation: true, transport: async () => {
      attempts++; return new Response('private provider error', { status, headers: { 'Retry-After': '300', Location: 'https://elsewhere.example' } });
    } })(view());
    assert.equal(attempts, 1);
    assert.equal(result.question_assistance.status, 'unavailable');
    assert.ok(!JSON.stringify(result).includes('private provider error'));
  }
  let deliver: (r: Response) => void = () => {};
  let aborted = false;
  const result = await createQuestionAssistance({ simulation: true, deadlineMs: 10, transport: async (_url, init) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; });
    return new Promise<Response>(resolve => { deliver = resolve; });
  } })(view());
  assert.equal(aborted, true);
  assert.equal(result.question_assistance.status, 'timeout');
  deliver(completion(selection));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.next_question?.title, 'سن دقیق تو چند سال است؟');
  assert.equal(result.question_assistance.status, 'timeout');
});

test('a connection failure is reported as unavailable rather than invalid model prose', async () => {
  const result = await createQuestionAssistance({ simulation: true, transport: async () => { throw Error('private network detail'); } })(view());
  assert.equal(result.question_assistance.status, 'unavailable');
  assert.ok(!JSON.stringify(result).includes('private network detail'));
});
