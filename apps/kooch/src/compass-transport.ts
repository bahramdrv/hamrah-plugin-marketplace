// Public compass traffic stays anonymous. Our protected Kooch deployment origins
// need their existing Vercel Authentication cookie for same-origin API paths.
export function compassRequest(path: '/api/config' | `/api/config?${string}` | '/api/compass', init: RequestInit,
  options: { origin: string; transport?: typeof fetch }) {
  const protectedPreview = /^https:\/\/kooch-[a-z0-9-]+-bahramd-s-projects2\.vercel\.app$/.test(options.origin);
  return (options.transport ?? fetch)(path, { ...init, credentials: protectedPreview ? 'same-origin' : 'omit' });
}
