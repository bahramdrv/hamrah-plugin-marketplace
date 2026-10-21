import type { GuidanceReport } from './evaluate';
import { policyDigest } from './policy';
import type { ReportState, ReportChange, EvidenceReview } from './contract';
export function reportState(report: GuidanceReport, revision: number | undefined, latest: number, now: Date, review: EvidenceReview = { routeIds: [], retrievalFailed: false }): ReportState {
  const fresh = !review.retrievalFailed && report.route_results.every(route => !review.routeIds.includes(route.route_id) && route.route_id === 'uk:student' && route.evidence_current && route.evidence_version === policyDigest &&
    route.sources.every(s => Date.parse(s.checked_at) <= now.getTime() && now.getTime() < Date.parse(s.expires_at)));
  return { current: fresh && revision === report.case_revision && latest === report.version,
    evidence_current: fresh, answers_current: revision === report.case_revision, latest_version: latest };
}
export function reportChanges(report: GuidanceReport, previous?: GuidanceReport): ReportChange[] {
  if (!previous) return ['initial'];
  const changes: ReportChange[] = [];
  if (report.case_revision !== previous.case_revision) changes.push('answers_changed');
  const evidence = (r: GuidanceReport) => JSON.stringify(r.route_results.map(route => [route.route_id, route.policy_version, route.evidence_version, route.evidence_current]));
  // A changed selection of routes follows the answers; only compare shared modules' evidence.
  const shared = (r: GuidanceReport, other: GuidanceReport) => ({ ...r, route_results: r.route_results.filter(route => other.route_results.some(o => o.route_id === route.route_id)) });
  if (evidence(shared(report, previous)) !== evidence(shared(previous, report))) changes.push('evidence_changed');
  return changes.length ? changes : ['recreated'];
}
