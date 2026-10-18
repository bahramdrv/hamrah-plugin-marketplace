import type { QuestionAssistance } from '../../src/ai/question-assistance';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAccountApi } from '../../src/account/api';
import { AuthProvider } from '../../src/account/auth';
import { AccountStore } from '../../src/account/store';
export async function harness(now: () => Date = () => new Date(), questionAssistance?: QuestionAssistance) {
  const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
  const auth = new AuthProvider({ url: process.env.KOOCH_AUTH_URL!, serviceKey: process.env.KOOCH_AUTH_SERVICE_KEY!, origin: 'http://127.0.0.1:3100' });
  const store = new AccountStore(pool, process.env.KOOCH_SESSION_ENCRYPTION_KEY!, now);
  await store.validateRole();
  const api = createAccountApi({ store, auth, origin: 'http://127.0.0.1:3100', mode: 'local', questionAssistance });
  const clients: ReturnType<typeof client>[] = [];
  function client() {
    let cookie = '';
    return {
      email: `test-${randomUUID()}@example.test`, password: `Test-${randomUUID()}!`,
      get cookie() { return cookie; }, set cookie(value: string) { cookie = value; },
      async request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', origin = 'http://127.0.0.1:3100') {
        const response = await api.handle(new Request(`http://127.0.0.1:3100/api/account/${path}`, {
          method, headers: { cookie, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }), path.split('/'));
        const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
        return response;
      },
    };
  }
  async function mailToken(email: string, type: 'signup' | 'recovery') {
    const list = await (await fetch(`${process.env.KOOCH_LOCAL_MAIL_URL}/api/v1/messages`)).json();
    for (const message of list.messages.filter((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === email))) {
      const mail = await (await fetch(`${process.env.KOOCH_LOCAL_MAIL_URL}/api/v1/message/${message.ID}`)).json();
      if (mail.HTML.includes(`type=${type}`)) {
        const token = mail.HTML.match(/token_hash=([a-f0-9]+)/)?.[1]; if (token) return token as string;
      }
    }
    throw new Error('Expected local SMTP message was not delivered.');
  }
  async function verifiedClient() {
    const c = client(); clients.push(c);
    const signup = await c.request('signup', { email: c.email, password: c.password });
    if (signup.status !== 200) throw new Error('Fixture signup failed.');
    const token = await mailToken(c.email, 'signup');
    const verified = await c.request('verify', { token_hash: token, type: 'signup' });
    if (verified.status !== 200) throw new Error('Fixture verification failed.');
    return c;
  }
  async function close() {
    for (const c of clients) {
      try {
        const session = await auth.signin(c.email, c.password);
        await store.beginDelete(session.user.id); await auth.deleteUser(session.user.id); await store.finishDelete(session.user.id);
      } catch { /* already deleted, reset, or test simulated expiry */ }
    }
    await pool.end();
  }
  return { pool, auth, store, api, client, verifiedClient, mailToken, close };
}
export const saveInput = (expected_revision = 0, goal = 'study') => ({ answers: { goal }, step: 2, expected_revision, request_id: randomUUID(), consent: 'account-save-1' });
