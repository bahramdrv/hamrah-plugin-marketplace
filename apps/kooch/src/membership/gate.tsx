'use client';
import { useEffect, useRef, useState } from 'react';
import { accountRequest, StaleAccountRequest } from '../account/client';
import { normalizeDigits } from '../questions';
import { channelUrl, instagramUrl, type ReportAccessStatus } from './contract';

export function MembershipGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [status, setStatus] = useState<ReportAccessStatus | null>(null);
  const [instagram, setInstagram] = useState(false), [code, setCode] = useState('');
  const [botUrl, setBotUrl] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const active = useRef(true), locked = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true; heading.current?.focus();
    void accountRequest('report-access').then(({ response, data }) => {
      if (!active.current) return;
      if (!response.ok) { setError(data.message ?? 'وضعیت عضویت دریافت نشد؛ دوباره تلاش کن.'); return; }
      if (data.unlocked) { onUnlocked(); return; }
      setStatus(data as ReportAccessStatus);
    }).catch(e => { if (active.current && !(e instanceof StaleAccountRequest)) setError('وضعیت عضویت دریافت نشد؛ اتصال را بررسی و دوباره تلاش کن.'); });
    return () => { active.current = false; };
  }, [attempt]);
  async function submit(action: 'start' | 'verify') {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try {
      const { response, data } = await accountRequest('report-access', action === 'start' ? { action, instagram_confirmed: instagram } : { action, code });
      if (!active.current) return;
      if (!response.ok) { setError(data.message ?? 'تأیید انجام نشد؛ دوباره تلاش کن.'); return; }
      if (data.unlocked) { onUnlocked(); return; }
      if (action === 'start') { setBotUrl(data.bot_url); setCode(''); setStatus(current => current ? { ...current, expires_at: data.expires_at } : null); }
    } catch (e) { if (active.current && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ دوباره تلاش کن.'); }
    finally { if (active.current) { locked.current = false; setBusy(false); } }
  }
  return <section className="membership-gate" aria-labelledby="membership-title" aria-busy={busy}>
    <h2 id="membership-title" tabIndex={-1} ref={heading}>یک قدم تا دیدن کارنامه</h2>
    <p>برای اولین کارنامه، عضو کانال کوچ شو و صفحهٔ اینستاگرام را دنبال کن. عضویت تلگرام یک‌بار تأیید می‌شود و دسترسی‌ات برای این حساب می‌ماند.</p>
    <ol className="membership-steps">
      <li><h3>اینستاگرام کوچ را دنبال کن</h3><a href={instagramUrl} target="_blank" rel="noopener noreferrer">رفتن به اینستاگرام کوچ <span className="sr-only">در تب تازه</span></a>
        <label className="choice"><input type="checkbox" checked={instagram} onChange={event => setInstagram(event.target.checked)}/>صفحهٔ اینستاگرام کوچ را دنبال کردم.</label><p className="help">فالو اینستاگرام خودکار بررسی نمی‌شود.</p></li>
      <li><h3>کد عضویت تلگرام را بگیر</h3><p>در ربات عضو <a href={channelUrl} target="_blank" rel="noopener noreferrer">کانال کوچ<span className="sr-only"> در تب تازه</span></a> شو و «عضو شدم، ادامه» را بزن.</p>
        <button className="secondary" disabled={busy || !instagram || !status?.available} onClick={() => void submit('start')}>{busy ? 'در حال بررسی…' : botUrl || status?.expires_at ? 'درخواست کد تازه از ربات' : 'دریافت کد از ربات'}</button>
        {botUrl && <p role="status"><a className="primary" href={botUrl} target="_blank" rel="noopener noreferrer">ورود به ربات و گرفتن کد<span className="sr-only"> در تب تازه</span></a></p>}
        {status && !status.available && <p role="status">ربات فعلاً آماده نیست؛ پاسخ‌هایت ذخیره شده‌اند. کمی بعد دوباره تلاش کن.</p>}
        {status?.expires_at && <p className="help">کد تا ساعت {new Date(status.expires_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' })} به وقت تهران اعتبار دارد. درخواست تازه، کد قبلی را باطل می‌کند.</p>}</li>
      <li><h3>کد ربات را اینجا وارد کن</h3><form className="account-form" onSubmit={event => { event.preventDefault(); void submit('verify'); }}>
        <label htmlFor="membership-code">کد تأیید هشت‌رقمی<input id="membership-code" name="membership-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} aria-describedby="membership-code-help" onChange={event => setCode(normalizeDigits(event.target.value).replace(/\D/g, '').slice(0, 8))}/></label>
        <p id="membership-code-help" className="help">کد را فقط در همان حسابی وارد کن که از آن وارد ربات شدی.</p><button className="primary" disabled={busy || code.length !== 8} type="submit">{busy ? 'در حال تأیید…' : 'تأیید کد و دیدن کارنامه'}</button>
      </form></li>
    </ol>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="text-button" disabled={busy} onClick={() => { setError(''); setAttempt(value => value + 1); }}>بررسی دوبارهٔ وضعیت</button>
    <p className="help">پاسخ‌ها و کارنامه‌ات به تلگرام ارسال نمی‌شوند.</p>
  </section>;
}
