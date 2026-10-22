'use client';
import { useEffect, useRef, useState } from 'react';
import { accountRequest, invalidateAccountRequests, StaleAccountRequest } from '../account/client';
import type { GuidanceReport } from './evaluate';
import type { ReportState } from './contract';
import { ExplanationView } from './explanation-view';
import type { SavedExplanation } from './explanation';
import { SavedReport } from './view';
export function GuidancePage() {
  const [revision, setRevision] = useState<number | null>(null);
  const [report, setReport] = useState<GuidanceReport | null>(null);
  const [state, setState] = useState<ReportState | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  const [explanation, setExplanation] = useState<SavedExplanation | null>(null);
  const [explanationBusy, setExplanationBusy] = useState(false); const [explanationOpen, setExplanationOpen] = useState(false);
  const [explanationStatus, setExplanationStatus] = useState('');
  const explanationLock = useRef(false);
  const explanationRetry = useRef<{ reportId: string; requestId: string } | null>(null);
  const lock = useRef(false); const generation = useRef(0);
  const retry = useRef<{ expected_revision: number; request_id: string } | null>(null);
  async function explain(saved: GuidanceReport, create = false, started = generation.current) {
    if (explanationLock.current) return; explanationLock.current = true; setExplanationBusy(true);
    if (create && explanationRetry.current?.reportId !== saved.id) explanationRetry.current = { reportId: saved.id, requestId: saved.id };
    try {
      const { response, data } = await accountRequest(`report/${saved.id}/explanation`, create ? { request_id: explanationRetry.current!.requestId } : undefined);
      if (started !== generation.current) return;
      if (response.ok) { setExplanation(data.explanation); setExplanationStatus(data.status);
        if (data.status === 'pending' && data.request_id) explanationRetry.current = { reportId: saved.id, requestId: data.request_id };
        if (create && data.status !== 'pending') explanationRetry.current = null;
      }
      else setExplanationStatus('unavailable');
    } catch { if (started === generation.current) setExplanationStatus('unavailable'); }
    finally { if (started === generation.current) { explanationLock.current = false; setExplanationBusy(false); } }
  }
  function clearExplanation() { explanationLock.current = false; setExplanation(null); setExplanationOpen(false); setExplanationStatus(''); setExplanationBusy(false); }
  async function load() {
    if (lock.current) return; lock.current = true; const started = ++generation.current; clearExplanation(); setBusy(true); setError('');
    try {
      const [f, r] = await Promise.all([accountRequest('form'), accountRequest(new URLSearchParams(window.location.search).has('id') ? `report/${encodeURIComponent(new URLSearchParams(window.location.search).get('id')!)}` : 'report')]);
      if (started !== generation.current) return;
      if (!f.response.ok || !r.response.ok) { setRevision(null); setReport(null); setState(null); setError(f.response.ok ? r.data.message : f.data.message); return; }
      setRevision(f.data.revision); setReport(r.data.report); setState(r.data.report_state); setConflict(false); retry.current = null;
      if (r.data.report) void explain(r.data.report, false, started);
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('دریافت پرونده ممکن نشد؛ دوباره تلاش کن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    void load(); const channel = new BroadcastChannel('kooch.account');
    channel.onmessage = () => { invalidateAccountRequests(); generation.current++; lock.current = false; retry.current = null;
      explanationRetry.current = null; clearExplanation(); setRevision(null); setReport(null); setState(null); setBusy(false); setError('از حساب خارج شدی؛ برای ادامه دوباره وارد شو.'); };
    return () => { generation.current++; channel.close(); };
  }, []);
  async function generate() {
    if (!revision || lock.current || conflict) return;
    const input = retry.current?.expected_revision === revision ? retry.current : { expected_revision: revision, request_id: crypto.randomUUID() };
    retry.current = input; lock.current = true; const started = ++generation.current; clearExplanation(); setBusy(true); setError('');
    try {
      const { response, data } = await accountRequest('report', input);
      if (started !== generation.current) return;
      if (!response.ok) { if (response.status === 401) { setRevision(null); setReport(null); setState(null); } if (response.status === 409) setConflict(true); setError(data.message); return; }
      setReport(data.report); setState(data.report_state); retry.current = null;
      void explain(data.report, true, started);
      window.history.replaceState(null, '', `/report?id=${data.report.id}`);
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ برای اطمینان از ثبت، دوباره ساخت کارنامه را بزن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#report-main">رفتن به کارنامه</a>
    <header><a className="brand" href="/"><strong>کوچ</strong><span>کارنامهٔ من</span></a><nav className="header-actions" aria-label="بخش‌های کوچ"><a href="/form">ادامه و اصلاح پاسخ‌ها</a><a href="/account">حساب من</a></nav></header>
    <main id="report-main"><h1>کارنامهٔ مقدماتی من</h1>
      <p className="intro">نتیجهٔ مسیرهای بررسی‌شده از پاسخ‌های همان پرونده؛ اطلاعات را یک بار در نقشهٔ من کامل می‌کنی.</p>
      <p className="notice">پوشش فعلی شامل تحصیل بریتانیا و درخواست اولیهٔ مجوز تحصیل کاناداست. برای بقیهٔ مسیرها هنوز ماژول ارزیابی مستند نداریم؛ نبود نتیجه به معنی بسته‌بودن آن‌ها نیست.</p>
      {error && <p role="alert" className="error">{error}</p>}{busy && <p role="status">در حال دریافت یا ذخیرهٔ کارنامه…</p>}
      <div className="actions"><a className="secondary" href="/form">ادامهٔ همان پرسش‌نامه و اصلاح پاسخ‌ها</a><button className="secondary" disabled={busy} onClick={() => void load()}>دریافت نسخهٔ تازهٔ پرونده</button></div>
      {revision ? <><p className="help">نسخهٔ پاسخ‌های ذخیره‌شده: {revision.toLocaleString('fa-IR')} · با اطلاعات ناقص هم می‌توانی کارنامه بسازی؛ هیچ پاسخ تازه‌ای در این صفحه لازم نیست.</p><button className="primary" disabled={busy || conflict} onClick={() => void generate()}>ساخت و ذخیرهٔ کارنامه از همین پاسخ‌ها</button></> : <a href="/account">ورود و ذخیرهٔ پاسخ‌های قطب‌نما</a>}
      {report && <>
        {explanationBusy && <p role="status">کارنامه آماده است؛ گزیدهٔ دلیل‌ها و قدم‌های بعدی در حال آماده‌شدن است…</p>}
        {explanation?.status === 'ready' && <><p role="status">توضیح این نسخه آماده است.</p><button className="secondary" onClick={() => setExplanationOpen(v => !v)}>{explanationOpen ? 'بستن توضیح' : 'دیدن توضیح همین نسخه'}</button>{explanationOpen && <>{!state?.current && <p className="notice">این توضیح مربوط به نسخهٔ ذخیره‌شده است؛ پاسخ‌ها یا شواهد ممکن است نیازمند بازبینی باشند.</p>}<ExplanationView explanation={explanation} report={report} /></>}</>}
        {!explanationBusy && explanationStatus && !['ready', 'not_requested'].includes(explanationStatus) && <p className="help">گزیدهٔ هوشمند فعلاً در دسترس نیست؛ دلیل‌ها و قدم‌های بعدی در کارنامهٔ زیر قابل استفاده‌اند.</p>}
        {state?.current && <button className="secondary" disabled={explanationBusy} onClick={() => { setExplanationOpen(false);
          if (!explanationRetry.current) explanationRetry.current = { reportId: report.id, requestId: crypto.randomUUID() };
          void explain(report, true); }}>درخواست یا بازیابی توضیح این نسخه</button>}
<a className="secondary" href={`/api/account/report/${report.id}/print`} target="_blank" rel="noopener noreferrer">نسخهٔ چاپی فارسی همین کارنامه</a><SavedReport report={report} state={state} /></>}
    </main>
  </div>;
}
