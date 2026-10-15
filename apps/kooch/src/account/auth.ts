import { z } from 'zod';
import { AccountError, unauthorized } from './contract';
const userSchema = z.object({ id: z.uuid(), email: z.email(), email_confirmed_at: z.string().nullable().optional() });
const sessionSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive(), user: userSchema });
export type ProviderSession = z.infer<typeof sessionSchema>;
export class AuthProvider {
  constructor(private config: { url: string; key?: string; serviceKey: string; origin: string; fetch?: typeof fetch }) {}
  private async call(path: string, method: string, body?: unknown, bearer?: string, admin = false, missingIsDeleted = false) {
    let response: Response;
    try {
      response = await (this.config.fetch ?? fetch)(`${this.config.url}${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(this.config.key ? { apikey: this.config.key } : {}),
          ...(bearer || admin ? { Authorization: `Bearer ${admin ? this.config.serviceKey : bearer}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(12000),
      });
    } catch { throw new AccountError('auth_unavailable', 503, 'سرویس حساب در دسترس نیست؛ دوباره تلاش کن.'); }
    if (!response.ok) {
      if (missingIsDeleted && response.status === 404) return null;
      if (response.status === 429) throw new AccountError('rate_limited', 429, 'تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کن.');
      if (response.status >= 500) throw new AccountError('auth_unavailable', 503, 'سرویس حساب یا ارسال ایمیل در دسترس نیست؛ دوباره تلاش کن.');
      throw unauthorized();
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async signup(email: string, password: string) { await this.call('/signup', 'POST', { email, password }); }
  async recover(email: string) { await this.call('/recover', 'POST', { email }); }
  async signin(email: string, password: string) {
    const result = sessionSchema.parse(await this.call('/token?grant_type=password', 'POST', { email, password }));
    if (!result.user.email_confirmed_at) throw unauthorized();
    return result;
  }
  async verify(token_hash: string, type: 'signup' | 'recovery') {
    const result = sessionSchema.parse(await this.call('/verify', 'POST', { token_hash, type }));
    if (!result.user.email_confirmed_at) throw unauthorized();
    return result;
  }
  async user(accessToken: string) {
    const user = userSchema.parse(await this.call('/user', 'GET', undefined, accessToken));
    if (!user.email_confirmed_at) throw unauthorized();
    return user;
  }
  async signout(accessToken: string) { await this.call('/logout?scope=global', 'POST', {}, accessToken); }
  async password(accessToken: string, password: string) { await this.call('/user', 'PUT', { password }, accessToken); }
  async deleteUser(id: string) { await this.call(`/admin/users/${id}`, 'DELETE', undefined, undefined, true, true); }
}
