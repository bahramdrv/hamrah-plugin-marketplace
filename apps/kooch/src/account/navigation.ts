// Only task names cross the sign-in boundary; never accept an arbitrary return URL.
export function continuationPath(value: string | null): '/form' | '/report' | '/?resume=1' | null {
  if (value === 'form') return '/form';
  if (value === 'report') return '/report';
  if (value === 'compass') return '/?resume=1';
  return null;
}
