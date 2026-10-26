import { unstable_cache } from 'next/cache';
import baseline from '../data/global-catalog.json';
import { refreshCatalog } from './catalog-refresh';
import { createHash } from 'node:crypto';
import { catalogSchema } from './catalog';

// Vercel's server data cache keeps one public capture per day, shared by guest
// discovery and saved reports. No profile fields or credentials enter its key.
const cachedCapture = unstable_cache(async () => {
  const result = await refreshCatalog(baseline);
  // A failed revalidation must not replace the last successful cached capture.
  if (result.refresh?.state !== 'updated') throw new Error('Public catalog refresh requires review.');
  return result;
}, ['kooch-public-global-catalog-1', createHash('sha256').update(JSON.stringify(baseline)).digest('hex')], { revalidate: 86400 });

export async function currentCatalog() {
  try { return await cachedCapture(); }
  catch { return catalogSchema.parse({ ...baseline, refresh: { state: 'error', attempted_at: new Date().toISOString(), reason: 'refresh_unavailable' } }); }
}
