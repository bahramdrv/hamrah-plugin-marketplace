import test from 'node:test';
import assert from 'node:assert/strict';
import { compassRequest } from '../src/compass-transport';

test('protected acceptance Preview can load compass APIs while public compass requests remain anonymous', async () => {
  for (const origin of ['https://my.kooch.app', 'https://kooch-gules.vercel.app', 'https://unrelated.example',
    'https://kooch-git-codex-kooch-arvan-acceptance-bahramd-s-projects2.vercel.app']) {
    const seen: { path: string; init?: RequestInit }[] = [];
    const transport: typeof fetch = async (path, init) => { seen.push({ path: String(path), init }); return Response.json({ ok: true }); };
    for (const path of ['/api/config', '/api/compass'] as const) {
      await compassRequest(path, { method: path === '/api/config' ? 'GET' : 'POST', credentials: 'include', cache: 'no-store' }, { origin, transport });
    }
    assert.equal(seen.length, 2);
    assert.equal(seen[0].path, '/api/config'); assert.equal(seen[1].path, '/api/compass');
    for (const request of seen) assert.equal(request.init?.credentials, origin.includes('kooch-arvan-acceptance') ? 'same-origin' : 'omit');
  }
});

test('new deployments owned by this Kooch project retain same-origin Vercel authentication', async () => {
  for (const [origin, expected] of [
    ['https://kooch-j1aijykx3-bahramd-s-projects2.vercel.app', 'same-origin'],
    ['https://kooch-git-main-bahramd-s-projects2.vercel.app', 'same-origin'],
    ['https://my.kooch.app', 'omit'],
    ['https://kooch-j1aijykx3-bahramd-s-projects2.vercel.app.attacker.example', 'omit'],
    ['http://kooch-j1aijykx3-bahramd-s-projects2.vercel.app', 'omit'],
    ['https://kooch-other-team.vercel.app', 'omit'],
  ] as const) {
    let credentials: RequestCredentials | undefined;
    const transport: typeof fetch = async (_path, init) => { credentials=init?.credentials; return Response.json({ ok: true }); };
    await compassRequest('/api/config', {}, { origin, transport });
    assert.equal(credentials, expected, origin);
  }
});
