import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/knowledge/route';

const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://my.kooch.app/api/knowledge', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://my.kooch.app', ...headers }, body: JSON.stringify(body),
});

test('Persian spelling variants and everyday vocabulary retrieve the same source; absent coverage stays empty', async () => {
  for (const query of ['بُودجه و ارز', 'پول به كدام ارز', 'بودجه\u200cو ارز']) {
    const result = await (await POST(request({ query }))).json();
    assert.equal(result.results[0].id, 'question-budget');
    assert.ok(result.results.length <= 3);
    assert.ok(result.context.passages.map((p: { text: string }) => p.text).join('').length <= 2700);
  }
  const missing = await (await POST(request({ query: 'شطرنج فوتبال بسکتبال' }))).json();
  assert.equal(missing.status, 'no_coverage');
  assert.deepEqual(missing.results, []);
  assert.deepEqual(missing.context.passages, []);
});

test('knowledge API rejects malformed, oversized and foreign-origin requests without echoing text', async () => {
  for (const payload of [{}, { query: 42 }, { query: ' ' }, { query: 'x'.repeat(201) }, { query: 'بودجه', endpoint: 'https://evil.example' }]) {
    assert.equal((await POST(request(payload))).status, 400);
  }
  const foreign = await POST(request({ query: 'بودجه' }, { origin: 'https://foreign.example' }));
  assert.equal(foreign.status, 403);
  assert.equal((await POST(request({ query: 'بودجه' }, { 'content-type': 'text/plain' }))).status, 415);
  const oversized = await POST(request({ query: 'س'.repeat(10000) }));
  assert.equal(oversized.status, 413);
  const broken = await POST(new Request('https://my.kooch.app/api/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }));
  assert.equal(broken.status, 400);
  assert.equal((await broken.json()).error, 'invalid_input');
});

test('public knowledge retrieves cited Persian product help without generating an answer or sending data to AI', async () => {
  const response = await POST(request({ query: 'بودجه و ارز را چطور وارد کنم؟' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.status, 'matched');
  assert.equal(result.scope, 'product_help');
  assert.equal(result.generation.enabled, false);
  assert.equal(result.results[0].id, 'question-budget');
  assert.match(result.results[0].text, /تبدیل ارز.*انجام نمی‌دهیم/);
  assert.equal(result.results[0].url, '/knowledge#question-budget');
  assert.equal(result.results[0].source.path, 'apps/kooch/src/questions.ts');
  assert.match(result.corpus_version, /^[a-f0-9]{64}$/);
  assert.ok(result.context.passages.some((p: { id: string }) => p.id === 'question-budget'));
  assert.equal('query' in result, false);
});


test('published guidance only describes current compass controls and explicit account saves', async () => {
  const result = await (await POST(request({ query: 'سن سابقه مقطع پذیرش' }))).json();
  assert.ok(result.results.every((r: { id: string }) => !['question-age_exact', 'question-work_years', 'question-study_level', 'question-study_offer'].includes(r.id)));
  const edit = await (await POST(request({ query: 'اصلاح پاسخ' }))).json();
  assert.match(edit.results.find((r: { id: string }) => r.id === 'review-and-edit').text, /قطب‌نما/);
  assert.doesNotMatch(edit.context.passages.map((p: { text: string }) => p.text).join(' '), /تأیید همان مقدار|تغییر مقطع/);
});
