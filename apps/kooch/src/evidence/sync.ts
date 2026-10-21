import { isDeepStrictEqual } from 'node:util';
import { snapshotSchema, channelState, type Snapshot } from '../snapshot';
import { manifestUrl, pageUrl, manifestEnvelope, pageEnvelope, manifestSchema, publicPageSchema, type ReviewItem } from './contract';
import { digest, decodeCheckpoint, EvidenceStore, type EvidenceState } from './store';
class ExpiredCapture extends Error {}
async function readJson(url: string, fetcher: typeof fetch, signal: AbortSignal) {
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => { abort = () => reject(new Error('deadline')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
  const reading = (async () => {
    const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store', headers: { accept: 'application/json' }, signal });
    if (response.status === 410) throw new ExpiredCapture();
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('fetch_failed');
    const reader = response.body?.getReader(); if (!reader) throw new Error('fetch_failed');
    const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, {once:true});
    try {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 2_000_000) { await reader.cancel(); throw new Error('response_too_large'); } chunks.push(value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { signal.removeEventListener('abort', cancel); }
  })();
  try { return await Promise.race([reading, aborted]); } finally { signal.removeEventListener('abort', abort); }
}

function changes(candidate: Snapshot, baseline: Snapshot, id: string): ReviewItem[] {
  const queue: ReviewItem[] = [];
  for (const route of candidate.routes) {
    const old = baseline.routes.find(r => r.id === route.id);
    if (!old) { queue.push({ route_id: route.id, reason: 'added', fields: ['identity'], candidate_id: id }); continue; }
    const fields: string[] = [];
    for (const field of ['application', 'facts', 'summary_fa'] as const) if (!isDeepStrictEqual(route[field], old[field])) fields.push(field);
    if (route.application.source_ids.some(source => !isDeepStrictEqual(candidate.sources[source], baseline.sources[source]))) fields.push('sources');
    if (fields.length) queue.push({ route_id: route.id, reason: 'evidence_changed', fields, candidate_id: id });
  }
  for (const route of baseline.routes) if (!candidate.routes.some(r => r.id === route.id)) queue.push({ route_id: route.id, reason: 'removed', fields: ['identity'], candidate_id: id });
  return queue;
}
function publishCandidate(state: EvidenceState, candidate: Snapshot, baseline: Snapshot, id: string, attempted: string): EvidenceState {
  const reviews = changes(candidate, baseline, id);
  const safe = snapshotSchema.parse({ ...baseline, source_url: candidate.source_url, retrieved_at: candidate.retrieved_at,
    coverage: reviews.length ? baseline.coverage : candidate.coverage,
    routes: baseline.routes.map(old => { const incoming = candidate.routes.find(r => r.id === old.id); return incoming ? { ...old, name: incoming.name, name_fa: incoming.name_fa, category: incoming.category, page_url: incoming.page_url } : old; }) });
  return { ...state, active: { id, snapshot: safe }, candidate: { id, snapshot: candidate }, reviews, checkpoint: null, last_attempt_at: attempted, last_success_at: attempted,
    state: reviews.length ? 'review_required' : 'ok', code: null };
}
export async function syncStep(store: EvidenceStore, fetcher: typeof fetch = fetch, deadlineMs = 25000) {
  return store.advance(async state => {
    const now = store.now(), attempted = now.toISOString();
    const controller = new AbortController(); const signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(deadlineMs, 25000))); let code = 'fetch_failed';
    try {
      let checkpoint = state.checkpoint;
      if (!checkpoint || Date.parse(decodeCheckpoint(checkpoint).manifest.expires_at) <= now.getTime()) {
        const envelope = manifestEnvelope.parse(await readJson(manifestUrl, fetcher, signal)); code = 'invalid_contract';
        if (digest(envelope.payload) !== envelope.snapshot_id) throw new Error('hash_mismatch');
        const manifest = manifestSchema.parse(JSON.parse(envelope.payload));
        if (Date.parse(manifest.generated_at) > now.getTime() || Date.parse(manifest.expires_at) <= now.getTime() ||
            Date.parse(manifest.expires_at) - Date.parse(manifest.generated_at) > 48 * 3600000) throw new Error('expired_manifest');
        if (envelope.snapshot_id === state.candidate?.id) return publishCandidate(state, state.candidate.snapshot, store.baseline, envelope.snapshot_id, attempted);
        checkpoint = { id: envelope.snapshot_id, manifest_payload: envelope.payload, page_payloads: [] };
        state = { ...state, checkpoint };
      }
      const { manifest, pages } = decodeCheckpoint(checkpoint);
      const next = pages.length;
      if (next < manifest.pages.length) {
        code = 'fetch_failed'; const envelope = pageEnvelope.parse(await readJson(pageUrl(checkpoint.id, next), fetcher, signal)); code = 'invalid_contract';
        if (envelope.snapshot_id !== checkpoint.id || envelope.index !== next || digest(envelope.payload) !== manifest.pages[next].sha256) throw new Error('hash_mismatch');
        const page = publicPageSchema.parse(JSON.parse(envelope.payload));
        if (page.index !== next || page.routes.length !== manifest.pages[next].count) throw new Error('invalid_page');
        if (Buffer.byteLength(JSON.stringify([...checkpoint.page_payloads, envelope.payload])) > 8_000_000) throw new Error('snapshot_too_large');
        checkpoint = { ...checkpoint, page_payloads: [...checkpoint.page_payloads, envelope.payload] }; state = { ...state, checkpoint };
      }
      if (checkpoint.page_payloads.length < manifest.pages.length) return { ...state, last_attempt_at: attempted, state: 'fetching', code: null };
      const decoded = decodeCheckpoint(checkpoint); const m = decoded.manifest;
      const candidate = snapshotSchema.parse({ ...store.baseline, source_url: manifestUrl, retrieved_at: attempted, total: m.total, coverage: m.coverage, sources: m.sources, routes: decoded.pages.flatMap(p => p.routes) });
      return publishCandidate(state, candidate, store.baseline, checkpoint.id, attempted);
    } catch (error) { return { ...state, ...(error instanceof ExpiredCapture ? { checkpoint: null } : {}), last_attempt_at: attempted, state: 'error', code: error instanceof ExpiredCapture ? 'snapshot_expired' : code }; } finally { clearTimeout(timer); }
  });
}
export function evidenceStatus(state: EvidenceState, now: Date) {
  const snapshot = state.active.snapshot;
  const blocked = new Set(state.reviews.map(r => r.route_id));
  return { state: state.state, code: state.code, last_attempt_at: state.last_attempt_at, last_success_at: state.last_success_at,
    active_id: state.active.id, checkpoint: state.checkpoint?.page_payloads.length ?? null, expected_pages: state.checkpoint ? decodeCheckpoint(state.checkpoint).manifest.pages.length : null,
    coverage: { total: snapshot.total, current: snapshot.routes.filter(r => !blocked.has(r.id) && channelState(r, snapshot, now) === 'current').length,
      expired: snapshot.routes.filter(r => channelState(r, snapshot, now) === 'expired').length, review_required: blocked.size }, reviews: state.reviews };
}

export function consumableSnapshot(state: EvidenceState): Snapshot {
  const blocked = new Set(state.reviews.map(r => r.route_id));
  const snapshot = state.active.snapshot;
  const routes = snapshot.routes.filter(r => !blocked.has(r.id));
  return snapshotSchema.parse({ ...snapshot, total: routes.length, coverage: { ...snapshot.coverage, documented_start: routes.length }, routes });
}
