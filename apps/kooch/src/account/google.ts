import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AuthProvider } from './auth';
import { unauthorized } from './contract';

const cookieName = 'kooch_google';
const callbackPath = '/api/account/google-callback';
const pendingSchema = z.object({ verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expires: z.number().int(), deletion: z.object({ owner: z.uuid(), sessionHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional() }).strict();
const proofSchema = z.object({ owner: z.uuid(), sessionHash: z.string().regex(/^[a-f0-9]{64}$/), expires: z.number().int() }).strict();
const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Browser-bound PKCE flow. Supabase owns Google identity verification and one-time code redemption. */
export class GoogleOAuth {
  constructor(private config: { auth: AuthProvider; origin: string; key: string; secure: boolean; now?: () => number }) {
    if (!/^[a-f0-9]{64}$/.test(config.key)) throw new Error('OAuth signing key must be 32 bytes in hex.');
  }
  private now() { return (this.config.now ?? Date.now)(); }
  private sign(value: string, purpose = 'google') { return createHmac('sha256', Buffer.from(this.config.key, 'hex')).update(`${purpose}:${value}`).digest('base64url'); }
  private cookie(value: string, age: number) {
    return `${cookieName}=${value}; Path=${callbackPath}; HttpOnly; SameSite=Lax; ${this.config.secure ? 'Secure; ' : ''}Max-Age=${age}`;
  }
  clearCookie() { return this.cookie('', 0); }
  clearDeletionCookie() { return this.deletionCookie('', 0); }
  private deletionCookie(value: string, age: number) {
    return `kooch_google_delete=${value}; Path=/api/account/delete; HttpOnly; SameSite=Strict; ${this.config.secure ? 'Secure; ' : ''}Max-Age=${age}`;
  }
  beginDeletion(owner: string, token: string) { return this.begin({ owner, sessionHash: sessionHash(token) }); }
  isDeletionAuthorized(request: Request, owner: string, token: string) {
    try {
      const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('kooch_google_delete='))?.slice('kooch_google_delete='.length);
      const proof = proofSchema.parse(this.verify(value, 'google-delete'));
      return proof.expires > this.now() && proof.owner === owner && proof.sessionHash === sessionHash(token);
    } catch { return false; }
  }
  private verify(value: string | undefined, purpose = 'google') {
    if (!value || value.length > 1024) throw unauthorized();
    const [payload, signature, extra] = value.split('.');
    if (extra !== undefined || !payload || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(payload, purpose)))) throw unauthorized();
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw unauthorized(); }
  }
  begin(deletion?: { owner: string; sessionHash: string }) {
    const verifier = randomBytes(32).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ verifier, expires: this.now() + 600000, deletion })).toString('base64url');
    return { url: this.config.auth.googleAuthorization(createHash('sha256').update(verifier).digest('base64url'), `${this.config.origin}${callbackPath}`),
      cookie: this.cookie(`${payload}.${this.sign(payload)}`, 600) };
  }
  async complete(request: Request) {
    const url = new URL(request.url); const code = url.searchParams.get('code');
    if (request.method !== 'GET' || url.pathname !== callbackPath || url.searchParams.has('error') ||
      url.searchParams.getAll('code').length !== 1 || !code || !/^[A-Za-z0-9_-]{1,2048}$/.test(code)) throw unauthorized();
    const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    let pending: z.infer<typeof pendingSchema>;
    try { pending = pendingSchema.parse(this.verify(value)); } catch { throw unauthorized(); }
    if (pending.expires <= this.now()) throw unauthorized();
    const session = await this.config.auth.exchangeGoogle(code, pending.verifier);
    if (!pending.deletion) return { session };
    if (session.user.id !== pending.deletion.owner) throw unauthorized();
    const payload = Buffer.from(JSON.stringify({ ...pending.deletion, expires: this.now() + 300000 })).toString('base64url');
    return { session, deletionCookie: this.deletionCookie(`${payload}.${this.sign(payload, 'google-delete')}`, 300) };
  }
}
