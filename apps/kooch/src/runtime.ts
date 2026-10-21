import snapshot from '../data/iran-start-snapshot.json';
import { createCompassApi } from './api';
import retrieval from '../data/retrieval-status.json';
import type { RetrievalStatus } from './retrieval';
import { accountConfigured, publicEvidenceStore } from './account/runtime';
import { consumableSnapshot } from './evidence/sync';
async function currentCompass() {
  if (!accountConfigured()) return createCompassApi({ snapshot, retrieval: retrieval as RetrievalStatus });
  try {
    const store = await publicEvidenceStore(); if (!store) throw new Error();
    const state = await store.read();
    return createCompassApi({ snapshot: consumableSnapshot(state), retrieval: {
      state: state.state === 'error' || state.reviews.length ? 'error' : 'ok',
      attempted_at: state.last_attempt_at ?? snapshot.retrieved_at, code: state.reviews.length ? 'review_required' : state.code,
    } });
  } catch { return createCompassApi({ snapshot: null }); }
}
export const compassApi = {
  async GET() { return (await currentCompass()).GET(); },
  async POST(request: Request) { return (await currentCompass()).POST(request); },
};
