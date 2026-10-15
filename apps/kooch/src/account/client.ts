export class StaleAccountRequest extends Error {}
export function createAccountClient(fetcher: typeof fetch = fetch) {
  let generation = 0;
  return {
    invalidate() { generation++; },
    async request(path: string, body?: unknown): Promise<{ response: Response; data: Record<string, any> }> {
      const started = generation;
      const response = await fetcher(`/api/account/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
      const data = await response.json();
      if (started !== generation) throw new StaleAccountRequest('این درخواست متعلق به نشست قبلی است.');
      return { response, data };
    },
  };
}
const client = createAccountClient();
export const accountRequest = client.request;
export const invalidateAccountRequests = client.invalidate;
export function notifySignout() {
  invalidateAccountRequests();
  const channel = new BroadcastChannel('kooch.account'); channel.postMessage('signed-out'); channel.close();
}
