import { createHash } from 'node:crypto';
import baseline from '../../data/iran-start-snapshot.json';
import catalog from '../../data/global-catalog.json';
import { evaluateCompass, type CompassResult } from '../api';
import { snapshotSchema } from '../snapshot';
import { policyVersion } from '../policy';
import { answersSchema } from '../questions';
import type { SavedCase } from '../account/contract';
import type { EvidenceReview } from './contract';

export type DiscoveryBriefing = { version: string; result: CompassResult | null; evidence_fingerprint: string; source_fingerprint?: string; needs_review: boolean };
export function buildDiscovery(saved: SavedCase, now: Date, review: EvidenceReview): DiscoveryBriefing {
  const parsed = snapshotSchema.safeParse(review.discoverySnapshot ?? baseline);
  let snapshot: unknown = null;
  if (parsed.success && !review.retrievalFailed) {
    const routes = parsed.data.routes.filter(route => !review.routeIds.includes(route.id));
    snapshot = { ...parsed.data, routes, total: routes.length, coverage: { ...parsed.data.coverage, documented_start: routes.length } };
  }
  const evaluated = evaluateCompass(answersSchema.parse(saved.answers), { snapshot, catalog, blockedRouteIds: review.routeIds, now: () => now });
  const result = 'error' in evaluated ? null : evaluated;
  const sourceFingerprint = createHash('sha256').update(JSON.stringify({ policyVersion, version: 'saved-discovery-2', snapshot, catalog })).digest('hex');
  const fingerprint = createHash('sha256').update(JSON.stringify({ sourceFingerprint,
    consumed: result?.routes.map(route => [route.id, route.facts, route.sources, route.valid_until]) })).digest('hex');
  return { version: 'saved-discovery-2', result, evidence_fingerprint: fingerprint, source_fingerprint: sourceFingerprint,
    needs_review: !result || ['review_required', 'no_coverage', 'restricted_context'].includes(result.status) || result.routes.some(route => route.coverage !== 'application_channel_reviewed') };
}
