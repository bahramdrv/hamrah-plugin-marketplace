'use client';
import { useEffect, useState } from 'react';
import { answersSchema, type Answers } from '../questions';
import { accountRequest, notifySignout, invalidateAccountRequests, StaleAccountRequest } from './client';
import { consentVersion, type SavedCase } from './contract';
import { ReportHistory } from '../report/history-list';
import { AppFooter, AppHeader } from '../shell';
import { continuationPath } from './navigation';
type Mode = 'signin' | 'signup' | 'recover';
export function AccountPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [local, setLocal] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [signedEmail, setSignedEmail] = useState(''); const [mode, setMode] = useState<Mode>('signin');
  const [saved, setSaved] = useState<SavedCase | null>(null);
  const [guest, setGuest] = useState<{ answers: Answers; step: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const [link, setLink] = useState<{ token_hash: string; type: 'signup' | 'recovery' } | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [googleDeletionReady, setGoogleDeletionReady] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false); const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false); const [loadError, setLoadError] = useState(false);
  const [continuation, setContinuation] = useState<ReturnType<typeof continuationPath>>(null);
  async function refresh() {
    const status = await accountRequest('status');
    if (!status.response.ok || typeof status.data.configured !== 'boolean') throw new Error('دریافت وضعیت حساب ممکن نشد.');
    setConfigured(status.data.configured); setLocal(status.data.mode === 'local'); setGoogleEnabled(status.data.google_enabled === true);
    if (!status.data.configured) return;
    const session = await accountRequest('session');
    if (session.response.ok && session.data.recovery) { setRecovery(true); setSignedEmail(''); setSaved(null); return; }
    if (session.response.ok) {
      const result = await accountRequest('case');
      if (!result.response.ok) throw new Error(result.data.message);
      setSignedEmail(session.data.email); setSaved(result.data.case); return result.data.case as SavedCase | null;
    } else if (session.response.status === 401) { setSignedEmail(''); setSaved(null); }
    else throw new Error(session.data.message);
  }
  async function loadAccount(clearError = true) {
    if (loading) return;
    setLoading(true); setLoadError(false); if (clearError) setError('');
    try { await refresh(); }
    catch (e) { if (!(e instanceof StaleAccountRequest)) { setLoadError(true); setError('دریافت وضعیت حساب ممکن نشد؛ اتصال را بررسی کن و دوباره تلاش کن.'); } }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const task = new URLSearchParams(window.location.search).get('next');
    try {
      if (task !== null) {
        if (continuationPath(task)) sessionStorage.setItem('kooch.account.next', task);
        else sessionStorage.removeItem('kooch.account.next');
      }
      setContinuation(continuationPath(task ?? sessionStorage.getItem('kooch.account.next')));
    } catch { setContinuation(continuationPath(task)); }
    // Tokens remain in memory, never query parameters, storage or application logs.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (new URLSearchParams(window.location.search).get('signin') === 'google-failed') {
      setError('ورود با گوگل کامل نشد؛ دوباره امتحان کن یا با ایمیل وارد شو.');
      window.history.replaceState(null, '', '/account');
    }
    if (new URLSearchParams(window.location.search).get('delete') === 'google-ready') {
      setGoogleDeletionReady(true); setDeleteOpen(true);
      window.history.replaceState(null, '', '/account');
    }
    const token_hash = fragment.get('token_hash'); const type = fragment.get('type');
    if (window.location.hash) window.history.replaceState(null, '', '/account');
    if (token_hash && /^[a-f0-9]{32,128}$/.test(token_hash) && (type === 'signup' || type === 'recovery')) setLink({ token_hash, type });
    try {
      const value = JSON.parse(sessionStorage.getItem('kooch.compass.guest.v1') ?? 'null');
      const answers = answersSchema.safeParse(value?.answers);
      if (value?.version === 1 && answers.success) setGuest({ answers: answers.data, step: Number.isInteger(value.step) ? Math.max(0, Math.min(7, value.step)) : 0 });
    } catch { /* guest storage optional */ }
    void loadAccount(false);
    const channel = new BroadcastChannel('kooch.account');
    channel.onmessage = () => { invalidateAccountRequests(); setSignedEmail(''); setSaved(null); setRecovery(false); setBusy(false); };
    return () => { invalidateAccountRequests(); channel.close(); };
  }, []);
  async function action(run: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await run(); } catch (e) { if (!(e instanceof StaleAccountRequest)) setError(e instanceof Error ? e.message : 'درخواست انجام نشد؛ دوباره تلاش کن.'); }
    finally { setBusy(false); setPassword(''); }
  }
  async function send(path: string, body: unknown) {
    const result = await accountRequest(path, body);
    if (!result.response.ok) {
      if (result.response.status === 401 && !['signin', 'delete'].includes(path)) { setSignedEmail(''); setSaved(null); }
      throw new Error(result.data.message ?? 'درخواست انجام نشد؛ دوباره تلاش کن.');
    }
    return result.data;
  }
  async function saveGuest() {
    if (!guest || !consent) return;
    const result = await send('case', { ...guest, consent: consentVersion, expected_revision: saved?.revision ?? 0, request_id: crypto.randomUUID() });
    setSaved(result.case); setGuest(null); setConsent(false);
    try { sessionStorage.removeItem('kooch.compass.guest.v1'); } catch { /* optional storage */ }
    setMessage('پاسخ‌ها با اجازهٔ تو در پرونده ذخیره شدند.');
    continueTask();
  }
  function continueTask() {
    if (!continuation) return;
    try { sessionStorage.removeItem('kooch.account.next'); } catch { /* navigation preference is optional */ }
    window.location.assign(continuation);
  }
  return <div className="app-shell"><a className="skip-link" href="#account-main">رفتن به حساب</a><AppHeader current="account"/>
    <main id="account-main" className="account-layout"><section className="account-panel" aria-busy={busy || loading}>
      <h1>{recovery ? 'رمز تازهٔ تو' : signedEmail ? 'پروندهٔ من' : 'ادامهٔ مسیر با حساب کوچ'}</h1>
      {local && <p className="notice">نسخهٔ آزمایشی محلی؛ ایمیل‌ها فقط در صندوق تست همین رایانه تحویل می‌شوند. از ایمیل و رمز واقعی استفاده نکن.</p>}
      <p className="intro">{signedEmail ? 'پاسخ‌ها و کارنامه‌هایت را از همین‌جا ادامه بده.' : 'بررسی‌ات را ذخیره کن و بعداً از همین‌جا ادامه بده.'}</p>
      {loading && <p role="status">در حال دریافت وضعیت…</p>}
      {configured === false && <p className="notice">سرویس حساب هنوز متصل نشده است. می‌توانی قطب‌نما را به‌صورت مهمان ادامه بدهی.</p>}
      {link && <section className="account-section"><h2>{link.type === 'recovery' ? 'تأیید پیوند بازیابی' : 'تأیید ایمیل'}</h2><p>برای مصرف پیوند یک‌بارمصرف، دکمه را بزن.</p><button className="primary" disabled={busy || !configured} onClick={() => void action(async () => {
        const data = await send('verify', link); setLink(null); setRecovery(data.recovery); setMessage(data.message);
        if (!data.recovery) await refresh(); else { setSignedEmail(''); setSaved(null); }
      })}>تأیید و ادامه</button></section>}
      {configured && recovery ? <form className="account-form" onSubmit={e => { e.preventDefault(); void action(async () => {
        const data = await send('reset', { password }); setRecovery(false); setMessage(data.message); notifySignout();
      }); }}><label>رمز تازه، دست‌کم ۱۲ نویسه<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary" disabled={busy}>ثبت رمز تازه</button></form> : configured && !signedEmail && !link ? <>
        {googleEnabled && <div className="account-section"><button className="secondary google-signin" disabled={busy} onClick={() => void action(async () => {
          const data = await send('google', {}); window.location.assign(data.url);
        })}>ادامه با گوگل</button></div>}
        <div className="account-tabs" aria-label="عملیات حساب">{([['signin', 'ورود'], ['signup', 'ساخت حساب'], ['recover', 'بازیابی رمز']] as const).map(([value, label]) => <button className={mode === value ? 'secondary' : 'text-button'} aria-pressed={mode === value} key={value} onClick={() => { setMode(value); setError(''); setMessage(''); setPassword(''); }}>{label}</button>)}</div>
        <form className="account-form" onSubmit={e => { e.preventDefault(); void action(async () => {
          const data = await send(mode, mode === 'recover' ? { email } : { email, password }); setMessage(data.message);
          if (mode === 'signin') { const savedCase = await refresh(); if (savedCase && !guest) continueTask(); }
        }); }}>
          <label>ایمیل<input type="email" autoComplete="email" maxLength={254} required dir="ltr" value={email} onChange={e => setEmail(e.target.value)} /></label>
          {mode !== 'recover' && <label>رمز، دست‌کم ۱۲ نویسه<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
          <button className="primary" disabled={busy}>{busy ? 'در حال انجام…' : mode === 'signin' ? 'ورود به حساب' : mode === 'signup' ? 'ساخت حساب و ارسال تأیید' : 'ارسال پیوند بازیابی'}</button>
        </form><details className="context-details"><summary>دربارهٔ حساب و ذخیرهٔ پاسخ‌ها</summary><p>پاسخ‌های مهمان با ورود یا ثبت‌نام خودکار ذخیره نمی‌شوند؛ بعد از ورود انتخاب می‌کنی که ذخیره شوند.</p><a href="/privacy">حریم خصوصی و نگهداری</a></details>
      </> : null}
      {signedEmail && <><p className="signed-email" dir="ltr">{signedEmail}</p>
        {saved ? <section className="account-section"><h2>پاسخ‌های ذخیره‌شده</h2><p>برای ادامهٔ بررسی آماده‌اند.</p><a className="primary" href={continuation ?? '/form'} onClick={() => { try { sessionStorage.removeItem('kooch.account.next'); } catch { /* optional */ } }}>{continuation === '/report' ? 'دیدن کارنامهٔ مقدماتی' : continuation === '/?resume=1' ? 'ادامهٔ پیدا کردن مسیر' : 'ادامهٔ پاسخ‌های من'}</a><a className="text-button" href="/?resume=1">اصلاح هدف و مقصدها</a><details className="context-details"><summary>اطلاعات پرونده</summary><p>نسخهٔ {saved.revision.toLocaleString('fa-IR')} · تاریخ پاک‌شدن در صورت بی‌فعالیتی: <strong>{new Date(saved.delete_after).toLocaleDateString('fa-IR', { dateStyle: 'long' })}</strong></p></details></section> : <p className="account-section">هنوز پاسخی در حساب ذخیره نشده است.</p>}
        <ReportHistory key={signedEmail} />
        {guest && <section className="account-section"><h2>ذخیرهٔ پاسخ‌های مهمان</h2><p>{saved ? 'این کار پاسخ‌های فعلی پرونده را با پاسخ‌های مهمان همین نشست جایگزین می‌کند.' : 'پاسخ‌های قطب‌نمای همین نشست را در حساب خودت ذخیره کن.'}</p><label className="choice"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />اجازه می‌دهم پاسخ‌ها در حساب ذخیره شوند و تا ۹۰ روز پس از آخرین ثبت یا اصلاح پاسخ نگهداری شوند.</label><button className="primary" disabled={busy || !consent} onClick={() => void action(saveGuest)}>ذخیره با اجازهٔ من</button></section>}
        <div className="account-actions"><button className="secondary" disabled={busy} onClick={() => void action(async () => {
          const result = await accountRequest('export'); if (!result.response.ok) throw new Error(result.data.message);
          const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }));
          const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kooch-account.json'; anchor.click(); URL.revokeObjectURL(url);
        })}>دریافت فایل اطلاعات من</button><button className="secondary" disabled={busy} onClick={() => void action(async () => {
          const data = await send('signout', {}); setSignedEmail(''); setSaved(null); setMessage(data.message); notifySignout();
        })}>خروج از حساب</button></div>
        <details className="account-section" open={deleteOpen} onToggle={e => setDeleteOpen(e.currentTarget.open)}><summary>حذف حساب و پرونده</summary><p>با حذف، دسترسی قطع و پرونده و حساب پاک می‌شوند. این کار برگشت‌پذیر نیست.</p>{googleEnabled && <button className="secondary" disabled={busy} onClick={() => void action(async () => {
          const data = await send('google-delete', {}); window.location.assign(data.url);
        })}>تأیید دوباره با گوگل برای حذف حساب</button>}{googleDeletionReady && <p>تأیید گوگل انجام شد؛ برای حذف نهایی عبارت زیر را بنویس. این تأیید ۵ دقیقه معتبر است.</p>}<form className="account-form" onSubmit={e => { e.preventDefault(); void action(async () => {
          const data = await send('delete', { ...(googleDeletionReady ? {} : { password }), confirmation }); setSignedEmail(''); setSaved(null); setGuest(null); setMessage(data.message); notifySignout();
          try { sessionStorage.removeItem('kooch.compass.guest.v1'); } catch { /* optional storage */ }
        }); }}>{!googleDeletionReady && <label>رمز فعلی<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>}<label>برای تأیید بنویس: حذف حساب<input value={confirmation} onChange={e => setConfirmation(e.target.value)} required /></label><button className="danger" disabled={busy || confirmation !== 'حذف حساب'}>حذف حساب و همهٔ پاسخ‌ها</button></form></details>
      </>}
      {message && <p className="notice" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}{loadError && <button className="secondary" disabled={loading} onClick={() => void loadAccount()}>تلاش دوباره برای دریافت حساب</button>}
    </section><aside className="guidance"><h2>شروع کرده‌ای؟ ادامه بده.</h2><p>با همان حساب وارد شو تا پاسخ‌ها و کارنامه‌های ذخیره‌شده‌ات را ببینی.</p><p><a href="/">شروع بررسی بدون حساب</a></p><details className="context-details"><summary>نگهداری و مدیریت اطلاعات</summary><p>ثبت یا اصلاح پاسخ و ساخت کارنامه، بازهٔ نگهداری ۹۰روزه را از نو آغاز می‌کند؛ دیدن صفحه و ورود این تاریخ را تمدید نمی‌کند.</p><a href="/privacy">جزئیات حریم خصوصی</a></details></aside></main><AppFooter/></div>;
}
