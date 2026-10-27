import { unstable_cache } from 'next/cache';
import baseline from '../data/global-catalog.json';
import { refreshCatalog } from './catalog-refresh';
import { createHash } from 'node:crypto';
import { catalogSchema } from './catalog';
import { fetchSourceMonitor } from './source-monitor';
const monitorCapture = unstable_cache(async () => {
  const status = await fetchSourceMonitor();
  if (status.state === 'unavailable') throw new Error('Public source monitor unavailable');
  return status;
}, ['kooch-public-source-monitor-1'], { revalidate: 3600 });

// Vercel's server data cache keeps one public capture per day, shared by guest
// discovery and saved reports. No profile fields or credentials enter its key.
const cachedCapture = unstable_cache(async () => {
  const result = await refreshCatalog(baseline);
  // A failed revalidation must not replace the last successful cached capture.
  if (result.refresh?.state !== 'updated') throw new Error('Public catalog refresh requires review.');
  return result;
}, ['kooch-public-global-catalog-1', createHash('sha256').update(JSON.stringify(baseline)).digest('hex')], { revalidate: 86400 });

export async function currentCatalog() {
  const catalog = await cachedCapture().catch(() => catalogSchema.parse({ ...baseline, refresh: { state: 'error', attempted_at: new Date().toISOString(), reason: 'refresh_unavailable' } }));
  const source_monitor = await monitorCapture().catch(() => undefined);
  return { ...catalog, ...(source_monitor ? { source_monitor } : {}) };
}
