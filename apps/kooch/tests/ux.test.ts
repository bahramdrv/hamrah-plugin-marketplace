import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCompassApi, type CompassResult } from '../src/api';
import { Results, RouteComparison } from '../src/result';
import snapshot from '../data/iran-start-snapshot.json';
import { continuationPath } from '../src/account/navigation';
import { Destinations } from '../src/controls';

test('no destination preference submits the interview; clearing a selection does not submit', () => {
  for (const value of [[], ['de']]) {
    const html = renderToStaticMarkup(createElement(Destinations, {
      countries: { de: { name: 'آلمان', flag: '🇩🇪' } }, value, onChange() {},
    }));
    const label = value.length ? 'پاک‌کردن انتخاب مقصدها' : 'هنوز نمی‌دانم / بدون ترجیح';
    const button = html.match(new RegExp(`<button\\b[^>]*>${label}</button>`))?.[0];
    assert.ok(button, `Missing ${label} action`);
    assert.match(button, new RegExp(`type="${value.length ? 'button' : 'submit'}"`));
  }
});

async function workResult(): Promise<CompassResult> {
  const api = createCompassApi({ snapshot, now: () => new Date('2026-10-15T12:00:00Z') });
  const response = await api.POST(new Request('http://localhost/api/compass', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: 'work', destinations: ['de'], facts: { 'de.job_offer': 'no' } }),
  }));
  assert.equal(response.status, 200);
  return response.json();
}

test('the real shortlist offers comparison without treating a missing job offer as route closure', async () => {
  const result = await workResult();
  assert.equal(result.routes.length, 2);
  const html = renderToStaticMarkup(createElement(Results, {
    result, edit() {}, editPrerequisites() {}, busy: false,
  }));
  assert.match(html, /مقایسهٔ مسیرها/);
  assert.match(html, /مقایسهٔ بلوکارت آلمان/);
  assert.match(html, /ابتدا پیشنهاد کار تخصصی/);
  assert.match(html, /تأیید شرایط یا احتمال ویزا نیست/);
  assert.doesNotMatch(result.routes[0].reason, /پیش‌نیازها در گام بعد/);
});

test('comparison preserves sourced facts, leaves missing facts unknown and exposes original sources', async () => {
  const result = await workResult();
  const routes = [result.routes[0], { ...result.routes[1], facts: [] }];
  const html = renderToStaticMarkup(createElement(RouteComparison, { routes }));
  const text = html.replace(/<[^>]*>/g, '');
  assert.match(text, /از ۵۰٬۷۰۰ یورو درسال/);
  assert.match(text, /در اطلاعات این مسیر ثبت نشده/);
  assert.match(text, /نبود اطلاعات به معنی نداشتن شرط نیست/);
  assert.match(html, /https:\/\/teheran\.diplo\.de\//);
  assert.match(html, /scope="row"/);
});

test('expired coverage keeps the shortlist empty and offers neither comparison nor invented action tasks', async () => {
  const api = createCompassApi({ snapshot, now: () => new Date('2026-10-30T12:00:00Z') });
  const result: CompassResult = await (await api.POST(new Request('http://localhost/api/compass', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }))).json();
  const html = renderToStaticMarkup(createElement(Results, { result, edit() {}, editPrerequisites() {}, busy: false }));
  assert.match(html, /به بازبینی تازه نیاز دارند/);
  assert.doesNotMatch(html, /مقایسهٔ انتخاب‌ها|action-task/);
});

test('account continuation preserves internal tasks and refuses arbitrary redirect destinations', () => {
  assert.equal(continuationPath('report'), '/report');
  assert.equal(continuationPath('form'), '/form');
  assert.equal(continuationPath('compass'), '/?resume=1');
  for (const value of [null, '', '/report', 'https://evil.test', '//evil.test', '__proto__', 'report?owner=other']) assert.equal(continuationPath(value), null);
});
