import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthProvider } from '../src/account/auth';

test('hosted Auth uses secret API keys only for admin calls and never as a bearer JWT', async () => {
  const requests: { url: string; headers: Headers }[] = [];
  const auth = new AuthProvider({ url: 'https://project.supabase.co/auth/v1', origin: 'https://my.kooch.app',
    key: 'sb_publishable_test', serviceKey: 'sb_secret_test',
    fetch: async (url, init) => { requests.push({ url: String(url), headers: new Headers(init?.headers) }); return new Response(null, { status: 204 }); },
  });
  await auth.signup('synthetic@example.test', 'synthetic-password');
  await auth.deleteUser('00000000-0000-4000-8000-000000000001');
  assert.equal(requests[0].headers.get('apikey'), 'sb_publishable_test');
  assert.equal(requests[0].headers.get('authorization'), null);
  assert.equal(requests[1].headers.get('apikey'), 'sb_secret_test');
  assert.equal(requests[1].headers.get('authorization'), null);
});

test('local Auth retains JWT authorization for its service role', async () => {
  let headers: Headers | undefined;
  const auth = new AuthProvider({ url: 'http://127.0.0.1:59999', origin: 'http://127.0.0.1:3100', serviceKey: 'local.service.jwt',
    fetch: async (_url, init) => { headers = new Headers(init?.headers); return new Response(null, { status: 204 }); },
  });
  await auth.deleteUser('00000000-0000-4000-8000-000000000001');
  assert.equal(headers?.get('authorization'), 'Bearer local.service.jwt');
});
