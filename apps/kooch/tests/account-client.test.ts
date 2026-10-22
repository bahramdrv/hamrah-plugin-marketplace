import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, StaleAccountRequest } from '../src/account/client';

test('reading a report loads the current case revision without invoking question assistance', async () => {
  const requested: string[] = [];
  const client = createAccountClient(async (url, init) => {
    requested.push(String(url));
    assert.equal(init?.method, 'GET');
    if (url === '/api/account/case') return Response.json({ case: { revision: 8 } });
    if (url === '/api/account/report/saved-report') return Response.json({ report: { version: 2 }, report_state: { current: false } });
    throw Error('Reading a saved report must not request metered question assistance.');
  });
  const { currentCase, savedReport } = await client.readReportContext('saved-report');
  assert.equal(currentCase.data.case.revision, 8);
  assert.equal(savedReport.data.report.version, 2);
  assert.equal(savedReport.data.report_state.current, false);
  assert.deepEqual(requested.sort(), ['/api/account/case', '/api/account/report/saved-report']);
});

test('a private response delayed across logout never reaches the caller, while a new session can read again', async () => {
  let deliver: (response: Response) => void = () => {};
  const client = createAccountClient(async () => new Promise<Response>(resolve => { deliver = resolve; }));
  const previousSession = client.request('case');
  client.invalidate();
  deliver(Response.json({ case: { answers: { goal: 'study' } } }));
  await assert.rejects(previousSession, StaleAccountRequest);
  const nextSession = client.request('session');
  deliver(Response.json({ signed_in: true }));
  assert.equal((await nextSession).data.signed_in, true);
});
