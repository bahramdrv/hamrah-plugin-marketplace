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
export function createEvidenceApi(options: { store: EvidenceStore; adminSecret?: string; syncSecret?: string; fetch?: typeof fetch; deadlineMs?: number }) {
  return { async handle(request: Request, path: string) {
    try {
      if (!['status', 'candidate', 'sync'].includes(path)) return reply({ error: 'not_found' }, 404);
      if (new URL(request.url).search || request.body) return reply({ error: 'invalid_input' }, 400);
      if (!authorized(request, path === 'sync' ? options.syncSecret : options.adminSecret) || options.adminSecret === options.syncSecret) return reply({ error: 'unauthorized' }, 401);
      if (request.method !== (path === 'sync' ? 'POST' : 'GET')) return reply({ error: 'method_not_allowed' }, 405);
      if (path === 'candidate') return reply({ candidate: (await options.store.read()).candidate });
      const state = path === 'status' ? await options.store.read() : await syncStep(options.store, options.fetch, options.deadlineMs);
      if (!state) return reply({ error: 'sync_busy' }, 409);
      return reply(evidenceStatus(state, options.store.now()));
    } catch { return reply({ error: 'evidence_unavailable' }, 503); }
  } };
}
