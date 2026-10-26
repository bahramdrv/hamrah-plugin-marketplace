import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCompassApi } from '../src/api';
import snapshot from '../data/iran-start-snapshot.json';
import catalog from '../data/global-catalog.json';
import { buildReport } from '../src/report/evaluate';
import { reportState } from '../src/report/history';
import { SavedReport } from '../src/report/view';
import { answersSchema } from '../src/questions';

const now = new Date('2026-10-26T12:00:00Z');
const saved = { id: 'fixture', revision: 4, answers: answersSchema.parse({ goal: 'work', destinations: ['de', 'au', 'es', 'am'] }), step: 7,
  last_activity_at: now.toISOString(), delete_after: '2027-01-01T00:00:00Z', consent_version: 'account-save-1' };

test('multiple selected countries retain every matching Australian work route beyond the five-card briefing', async () => {
  const api = createCompassApi({ snapshot, catalog, now: () => now });
  const response = await api.POST(new Request('http://localhost/api/compass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved.answers) }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.matching_routes), 'full matching list must accompany the briefing');
  for (const id of ['au:subclass-482-tss', 'au:subclass-189-skilled-independent', 'au:subclass-190-skilled-nominated', 'au:subclass-491-skilled-regional', 'au:subclass-186-ens', 'au:global-talent-au'])
    assert.ok(result.matching_routes.some((route: { id: string }) => route.id === id), `missing ${id}`);
  assert.equal(result.routes.length, 5);
  assert.ok(result.matching_routes.length > result.routes.length);
  assert.ok(result.routes.some((route: { destination: string }) => route.destination === 'au'), 'one country must not monopolize the briefing');
  assert.equal(result.official_eligibility, 'not_assessed');
});

test('an old empty report is historical, offers rebuilding, and never claims to be current', () => {
  const { discovery: _oldMissingField, ...old } = { ...buildReport(saved, now), id: 'old-report', version: 3 };
  const state = reportState(old, saved.revision, old.version, now);
  assert.equal(state.current, false);
  assert.equal(state.evidence_current, false);
  const html = renderToStaticMarkup(createElement(SavedReport, { report: old, state }));
  assert.match(html, /قالب قدیمی/);
  assert.doesNotMatch(html, /پوشش ارزیابی فعلی شامل تحصیل بریتانیا/);
});

test('saved reports and print expose all matched destinations and source dates, not just three comparison columns', () => {
  const report = { ...buildReport(saved, now), id: 'new-report', version: 4 };
  const html = renderToStaticMarkup(createElement(SavedReport, { report, state: null, print: true }));
  assert.match(html, /غربال جهانی مسیرها برای شرایط تو/);
  assert.match(html, /استرالیا/);
  for (const id of ['au:subclass-189-skilled-independent', 'au:subclass-491-skilled-regional']) assert.ok(html.includes(catalog.routes.find(route => route.id === id)!.source.url));
  assert.match(html, /2026-07-01/);
});
