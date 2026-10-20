// Public compass traffic stays anonymous. Only this protected acceptance origin
// needs its existing Vercel Authentication cookie for the same-origin API paths.
export function compassRequest(path: '/api/config' | '/api/compass', init: RequestInit,
  options: { origin: string; transport?: typeof fetch }) {
  const protectedPreview = options.origin === 'https://kooch-git-codex-kooch-arvan-acceptance-bahramd-s-projects2.vercel.app';
  return (options.transport ?? fetch)(path, { ...init, credentials: protectedPreview ? 'same-origin' : 'omit' });
}
