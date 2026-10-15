import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, StaleAccountRequest } from '../src/account/client';

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
