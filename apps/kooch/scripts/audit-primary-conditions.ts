// Read-only public-source audit. HTTP success and an unchanged hash NEVER renew a legal review.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { readinessDefinitions } from '../src/readiness-registry';

const destination = resolve(process.argv[2] ?? 'outputs/primary-condition-audit.json');
const baselinePath = process.argv[3];
let previous: { captures: { url: string; sha256?: string }[] } | null = null;
if (baselinePath) previous = JSON.parse(await readFile(resolve(baselinePath), 'utf8'));
const captures: { url: string; source_ids: string[]; status: string; http_status?: number; sha256?: string; changed?: boolean; verified: false }[] = [];
const groups = new Map<string, string[]>();
for (const source of readinessDefinitions.sources) groups.set(source.url, [...groups.get(source.url) ?? [], source.id]);
// Sequential by design: do not overload issuing authorities or fetch any applicant data.
for (const [url, ids] of groups) {
  const row: typeof captures[number] = { url, source_ids: ids, status: 'unavailable', verified: false };
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443' || isIP(target.hostname) || target.hostname.endsWith('.local') || !target.hostname.includes('.')) throw new Error();
    const addresses = await lookup(target.hostname, { all: true });
    if (!addresses.length || addresses.some(address => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address.address))) throw new Error();
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'text/html,application/pdf', 'user-agent': 'Kooch-Primary-Source-Audit/1.0' } });
    row.http_status = response.status;
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 2_000_000) { await reader.cancel(); throw new Error(); } chunks.push(value); }
    row.sha256 = createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
    const prior = previous?.captures.find(capture => capture.url === url)?.sha256;
    row.changed = prior ? prior !== row.sha256 : undefined;
    row.status = row.changed ? 'page_changed_review_required' : 'captured_unreviewed';
  } catch { /* No response body or credentials enter logs; failure never becomes legal evidence. */ }
  captures.push(row);
}
const expired = readinessDefinitions.sources.filter(source => Date.parse(source.checked_on) + 15 * 86400000 <= Date.now()).map(source => source.id);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify({ contract: 'public-primary-audit-1', captured_at: new Date().toISOString(), legal_reviews_renewed: 0, expired_review_source_ids: expired, captures }, null, 2) + '\n');
console.log(JSON.stringify({ sources: captures.length, unavailable: captures.filter(row => row.status === 'unavailable').length, changed: captures.filter(row => row.changed).length, expired_reviews: expired.length, legal_reviews_renewed: 0, output: destination }));
