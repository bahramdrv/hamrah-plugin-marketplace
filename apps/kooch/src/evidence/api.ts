import { createHash, timingSafeEqual } from 'node:crypto';
import type { EvidenceStore } from './store';
import { syncStep, evidenceStatus } from './sync';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Authorization' } });
function authorized(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 43) return false;
  const value = request.headers.get('authorization') ?? '';
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(value), hash(`Bearer ${secret}`));
}
// Server adapters can expose a zero-byte POST as a stream. Reject content,
// not the stream itself; never wait indefinitely or buffer applicant input.
async function emptyBody(request: Request) {
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        for (let chunks = 0; chunks < 16; chunks++) {
          const { done, value } = await reader.read();
          if (done) return true;
          if (value?.byteLength) return false;
        }
        return false;
      })(),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 1000); }),
    ]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export function createEvidenceApi(options: { store: EvidenceStore; adminSecret?: string; syncSecret?: string; fetch?: typeof fetch; deadlineMs?: number; operations?: () => import('../operations/status').OperationStatus }) {
  return { async handle(request: Request, path: string) {
    try {
      if (!['status', 'candidate', 'sync'].includes(path)) return reply({ error: 'not_found' }, 404);
      if (new URL(request.url).search) return reply({ error: 'invalid_input' }, 400);
      if (!authorized(request, path === 'sync' ? options.syncSecret : options.adminSecret) || options.adminSecret === options.syncSecret) return reply({ error: 'unauthorized' }, 401);
      if (request.method !== (path === 'sync' ? 'POST' : 'GET')) return reply({ error: 'method_not_allowed' }, 405);
      if (!await emptyBody(request)) return reply({ error: 'invalid_input' }, 400);
      if (path === 'candidate') return reply({ candidate: (await options.store.read()).candidate });
      const state = path === 'status' ? await options.store.read() : await syncStep(options.store, options.fetch, options.deadlineMs);
      if (!state) return reply({ error: 'sync_busy' }, 409);
      return reply({ ...evidenceStatus(state, options.store.now()), ...(path === 'status' && options.operations ? { operations: options.operations() } : {}) });
    } catch { return reply({ error: 'evidence_unavailable' }, 503); }
  } };
}
