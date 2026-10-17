import { z } from 'zod';
import { AuthProvider } from './auth';
import { AccountStore } from './store';
import { AccountError, unauthorized, credentialsSchema, caseInputSchema } from './contract';
import { GoogleOAuth } from './google';
import { formView } from '../form/workflow';
import { formInputSchema } from '../form/contract';

const neutralMessage = 'اگر این ایمیل قابل استفاده باشد، پیام لازم برای آن ارسال می‌شود. صندوق ورودی و پوشهٔ هرزنامه را بررسی کن.';
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vary': 'Cookie', ...headers },
});
const cookieName = 'kooch_session';
const cookieToken = (request: Request) => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
const invalid = () => new AccountError('invalid_input', 400, 'اطلاعات واردشده معتبر نیست؛ دوباره بررسی کن.');
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw invalid();
  const reader = request.body?.getReader(); if (!reader) throw invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 20000) { await reader.cancel(); throw new AccountError('too_large', 413, 'حجم درخواست بیش از حد مجاز است.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid(); }
}
export function createAccountApi(options: { store: AccountStore; auth: AuthProvider; origin: string; mode: 'local' | 'hosted'; google?: GoogleOAuth }) {
  const { store, auth } = options;
  const cookie = (token: string, expiresAt?: Date) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; ${options.mode === 'hosted' ? 'Secure; ' : ''}${expiresAt ? `Expires=${expiresAt.toUTCString()}` : 'Max-Age=0'}`;
  async function authenticated(request: Request, purpose: 'account' | 'recovery' = 'account', allowDeleted = false) {
    const session = await store.session(cookieToken(request), allowDeleted);
    if (session.purpose !== purpose) throw unauthorized();
    if (!session.deleted) {
      const user = await auth.user(session.accessToken);
      if (user.id !== session.owner) throw unauthorized();
      return { ...session, email: user.email };
    }
    return { ...session, email: '' };
  }
  return {
    async handle(request: Request, path: string[]): Promise<Response> {
      try {
        const operation = path[0]; const method = request.method;
        if (!operation || (operation !== 'case' && path.length !== 1)) throw invalid();
        if (!['GET', 'POST'].includes(method)) return reply({ error: 'method_not_allowed' }, 405);
        if (method === 'POST' && request.headers.get('origin') !== options.origin)
          throw new AccountError('invalid_origin', 403, 'درخواست باید از همین اپ ارسال شود.');
        if ((['google', 'google-delete'].includes(operation) && method !== 'POST') || (operation === 'google-callback' && method !== 'GET')) return reply({ error: 'method_not_allowed' }, 405);
        if (operation === 'google' && method === 'POST') {
          if (!options.google) throw new AccountError('google_unavailable', 503, 'ورود با گوگل هنوز آماده نیست؛ از ایمیل استفاده کن.');
          z.object({}).strict().parse(await body(request));
          await store.rateLimit('global');
          const start = options.google.begin();
          return reply({ url: start.url }, 200, { 'Set-Cookie': start.cookie });
        }
        if (operation === 'google-callback' && method === 'GET') {
          const headers = new Headers({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer' });
          if (options.google) headers.append('Set-Cookie', options.google.clearCookie());
          try {
            if (!options.google) throw unauthorized();
            const { session, deletionCookie } = await options.google.complete(request);
            await store.rateLimit(`google-callback:${session.user.id}`);
            if (deletionCookie) {
              headers.append('Set-Cookie', deletionCookie);
              headers.set('Location', `${options.origin}/account?delete=google-ready`);
              return new Response(null, { status: 303, headers });
            }
            const saved = await store.createSession(session.user.id, session.access_token, session.expires_in, 'account');
            headers.append('Set-Cookie', cookie(saved.token, saved.expiresAt));
            headers.set('Location', `${options.origin}/account`);
          } catch {
            // Never echo provider errors, codes or redirect parameters to the page or logs.
            headers.set('Location', `${options.origin}/account?signin=google-failed`);
          }
          return new Response(null, { status: 303, headers });
        }
        if (operation === 'status' && method === 'GET') return reply({ configured: true, mode: options.mode, google_enabled: Boolean(options.google), email_delivery: options.mode === 'local' ? 'local_test_only' : 'configured' });
        if (operation === 'session' && method === 'GET') {
          const state = await store.session(cookieToken(request));
          if (state.purpose === 'recovery') { await authenticated(request, 'recovery'); return reply({ signed_in: false, recovery: true }); }
          const session = await authenticated(request);
          return reply({ signed_in: true, email: session.email });
        }
        if (['signup', 'signin', 'recover', 'verify'].includes(operation) && method === 'POST') {
          await store.rateLimit('global');
          const data = await body(request);
          if (operation === 'verify') {
            const input = z.object({ token_hash: z.string().regex(/^[a-f0-9]{32,128}$/), type: z.enum(['signup', 'recovery']) }).strict().parse(data);
            await store.rateLimit(`verify:${input.token_hash}`);
            const session = await auth.verify(input.token_hash, input.type);
            const saved = await store.createSession(session.user.id, session.access_token, session.expires_in, input.type === 'recovery' ? 'recovery' : 'account');
            return reply({ message: input.type === 'recovery' ? 'پیوند تأیید شد؛ رمز جدیدت را وارد کن.' : 'ایمیل تأیید شد؛ وارد حساب شدی.', recovery: input.type === 'recovery' }, 200, { 'Set-Cookie': cookie(saved.token, saved.expiresAt) });
          }
          if (operation === 'recover') {
            const input = z.object({ email: z.email().max(254).transform(s => s.trim().toLowerCase()) }).strict().parse(data);
            await store.rateLimit(`email:${input.email}`);
            try { await auth.recover(input.email); } catch (e) { if (!(e instanceof AccountError && e.status === 401)) throw e; }
            return reply({ message: neutralMessage });
          }
          const input = credentialsSchema.parse(data);
          await store.rateLimit(`email:${input.email}`);
          if (operation === 'signup') {
            try { await auth.signup(input.email, input.password); } catch (e) { if (!(e instanceof AccountError && e.status === 401)) throw e; }
            return reply({ message: neutralMessage });
          }
          const session = await auth.signin(input.email, input.password);
          const saved = await store.createSession(session.user.id, session.access_token, session.expires_in, 'account');
          return reply({ message: 'وارد حساب شدی.' }, 200, { 'Set-Cookie': cookie(saved.token, saved.expiresAt) });
        }
        if (operation === 'reset' && method === 'POST') {
          const session = await authenticated(request, 'recovery');
          const input = z.object({ password: credentialsSchema.shape.password }).strict().parse(await body(request));
          await auth.password(session.accessToken, input.password);
          await store.revoke(session.owner);
          // App revocation is authoritative even if the provider logout is temporarily unavailable.
          try { await auth.signout(session.accessToken); } catch { /* app sessions already revoked */ }
          return reply({ message: 'رمز تغییر کرد؛ دوباره وارد حساب شو.' }, 200, { 'Set-Cookie': cookie('') });
        }
        if (operation === 'signout' && method === 'POST') {
          try {
            const session = await store.session(cookieToken(request));
            await store.revoke(session.owner);
            try { await auth.signout(session.accessToken); } catch { /* local revocation is immediate */ }
          } catch (e) { if (!(e instanceof AccountError && e.status === 401)) throw e; }
          return reply({ message: 'از حساب خارج شدی.' }, 200, { 'Set-Cookie': cookie('') });
        }
        const session = await authenticated(request, 'account', operation === 'delete');
        if (operation === 'google-delete' && method === 'POST') {
          if (!options.google) throw unauthorized();
          z.object({}).strict().parse(await body(request));
          await store.rateLimit(`delete:${session.owner}`);
          const start = options.google.beginDeletion(session.owner, cookieToken(request)!);
          return reply({ url: start.url }, 200, { 'Set-Cookie': start.cookie });
        }
        if (operation === 'form') {
          const saved = method === 'GET' ? await store.read(session.owner) : await store.saveForm(session.owner, formInputSchema.parse(await body(request)));
          if (!saved) throw new AccountError('not_found', 404, 'ابتدا پاسخ‌های قطب‌نما را در حساب ذخیره کن.');
          return reply(formView(saved));
        }
        if (operation === 'case') {
          if (path.length > 2 || (path[1] && !z.uuid().safeParse(path[1]).success)) throw invalid();
          if (method === 'GET') return reply({ case: await store.read(session.owner, path[1]) });
          if (path[1]) {
            // Explicit server ownership check complements RLS before mutation.
            await store.read(session.owner, path[1]);
          }
          return reply({ case: await store.save(session.owner, caseInputSchema.parse(await body(request))) });
        }
        if (operation === 'export' && method === 'GET') {
          if (path.length !== 1) throw invalid();
          return reply({ schema_version: 1, email: session.email, case: await store.read(session.owner) }, 200,
            { 'Content-Disposition': 'attachment; filename="kooch-account.json"' });
        }
        if (operation === 'delete' && method === 'POST') {
          const input = z.object({ password: credentialsSchema.shape.password.optional(), confirmation: z.literal('حذف حساب') }).strict().parse(await body(request));
          if (!session.deleted) {
            await store.rateLimit(`delete:${session.owner}`);
            if (!options.google?.isDeletionAuthorized(request, session.owner, cookieToken(request)!)) {
              if (!input.password) throw unauthorized();
              const check = await auth.signin(session.email, input.password);
              if (check.user.id !== session.owner) throw unauthorized();
            }
          }
          await store.beginDelete(session.owner);
          await auth.deleteUser(session.owner);
          await store.finishDelete(session.owner);
          const response = reply({ message: 'حساب و پرونده حذف شدند.' }, 200, { 'Set-Cookie': cookie('') });
          if (options.google) response.headers.append('Set-Cookie', options.google.clearDeletionCookie());
          return response;
        }
        return reply({ error: 'not_found', message: 'این بخش پیدا نشد.' }, 404);
      } catch (error) {
        if (error instanceof AccountError) return reply({ error: error.code, message: error.userMessage }, error.status);
        if (error instanceof z.ZodError) return reply({ error: 'invalid_input', message: 'اطلاعات واردشده معتبر نیست؛ دوباره بررسی کن.' }, 400);
        return reply({ error: 'account_unavailable', message: 'ذخیره یا دریافت اطلاعات حساب ممکن نشد؛ دوباره تلاش کن.' }, 503);
      }
    },
  };
}
