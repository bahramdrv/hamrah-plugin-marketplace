'use client';
import { useEffect, useState } from 'react';
import { accountRequest, StaleAccountRequest } from '../account/client';
import { changeLabels, type ReportHistoryItem } from './contract';
export function ReportHistory() {
  const [reports, setReports] = useState<ReportHistoryItem[] | null>(null);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError(''); setReports(null);
    void accountRequest('reports').then(({ response, data }) => {
      if (!active) return;
      if (!response.ok) { setError(data.message ?? 'دریافت تاریخچه ممکن نشد.'); return; }
      setReports(data.reports);
    }).catch(e => { if (active && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ دوباره تاریخچه را دریافت کن.'); });
    return () => { active = false; };
  }, [attempt]);
  return <section className="account-section report-history" aria-label="تاریخچهٔ کارنامه‌ها"><h2>کارنامه‌های من</h2>
    <p>هر نسخه پاسخ‌ها و منابع زمان ثبت خود را حفظ می‌کند. برای اصلاح اطلاعات، همان پرونده را ادامه بده و کارنامهٔ تازه بساز.</p>
    <a className="primary" href="/report">ساخت یا دیدن آخرین کارنامه</a>
    {error ? <><p role="alert" className="error">{error}</p><button className="secondary" onClick={() => setAttempt(n => n + 1)}>دریافت دوبارهٔ تاریخچه</button></> : reports === null ? <p role="status">در حال دریافت تاریخچه…</p> : !reports.length ? <p>هنوز کارنامه‌ای ذخیره نکرده‌ای؛ با پاسخ‌های ناقص هم می‌توانی شروع کنی.</p> :
      <ol>{reports.map(r => <li key={r.id}>
        <h3><a href={`/report?id=${r.id}`}>کارنامهٔ نسخهٔ {r.version.toLocaleString('fa-IR')}</a></h3>
        <p><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' })}</time> · نسخهٔ پاسخ‌ها: {r.case_revision.toLocaleString('fa-IR')} · پوشش جزئی</p>
        <p>{r.changes.map(c => changeLabels[c]).join('؛ ')}</p>
        <p>{r.report_state.current ? 'آخرین نسخه؛ پاسخ‌ها و منابع در بازهٔ بررسی‌اند. پوشش همچنان جزئی است.' : 'نسخهٔ پیشین یا نیازمند بازبینی'}
          {!r.report_state.answers_current && ' · پاسخ‌های فعلی تغییر کرده‌اند'}{!r.report_state.evidence_current && ' · شواهد یا قواعد نیازمند بازبینی‌اند'}</p>
        <a href={`/api/account/report/${r.id}/print`} target="_blank" rel="noopener noreferrer">چاپ فارسی نسخهٔ {r.version.toLocaleString('fa-IR')}</a>
      </li>)}</ol>}
  </section>;
}
