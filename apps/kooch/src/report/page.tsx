'use client';
import { useEffect, useRef, useState } from 'react';
import { accountRequest, invalidateAccountRequests, StaleAccountRequest } from '../account/client';
import type { GuidanceReport, RouteReport } from './evaluate';
type ReportState = { current: boolean; evidence_current: boolean; answers_current: boolean; latest_version: number };
const states: Record<string, string> = { self_reported_met: 'بر پایهٔ پاسخ تو برقرار', action_needed: 'نیازمند اقدام', unknown: 'اطلاعات لازم است', needs_review: 'نیازمند بازبینی', not_applicable: 'طبق پاسخ تو لازم نیست', not_assessed: 'بررسی نشده' };
const summary: Record<string, string> = { preliminary_conditions_met: 'موارد بررسی‌شده با پاسخ‌های تو سازگارند', action_needed: 'پیش از اقدام، چند شرط آماده نیست', needs_information: 'برای ادامه، اطلاعات بیشتری لازم است', needs_review: 'پیش از نتیجه‌گیری، بازبینی لازم است' };
const gbp = (n: number | null) => n == null ? 'نامعلوم' : `${n.toLocaleString('fa-IR')} پوند`;
function RouteResult({ report, version, state }: { report: RouteReport; version: number; state: ReportState | null }) {
  const links = (ids: string[]) => ids.map(id => { const s = report.sources.find(s => s.id === id); return s ? <a key={id} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : null; });
  return <section aria-label="تحصیل بریتانیا"><h2>تحصیل بریتانیا</h2>
      <article className="guidance-report" aria-label="کارنامهٔ ذخیره‌شده">
        <p className="eyebrow">کارنامهٔ مقدماتی · نسخهٔ {version.toLocaleString('fa-IR')} · {new Date(report.created_at).toLocaleDateString('fa-IR')}</p>
        <h2>{summary[report.status]}</h2><p>{report.scope}</p><p className="notice">پوشش جزئی است. این نتیجه، تأیید صلاحیت، آماده‌بودن برای ارسال یا احتمال دریافت ویزا نیست.</p>
        {state && !state.current && <p role="status" className="notice">این نسخه سابقهٔ ثبت‌شده است؛ {state.answers_current ? 'نسخه یا شواهد جاری نیاز به بررسی دارند.' : 'پاسخ‌های فرم بعد از آن تغییر کرده‌اند.'} برای وضعیت تازه کارنامهٔ جدید بساز.</p>}
        <h3>شرط‌ها و دلیل</h3><div className="report-conditions">{report.conditions.map(c => <section key={c.id} className="report-condition"><h4>{c.title} <span>{states[c.state]}</span></h4><p>{c.reason}</p><details><summary>قاعده و منابع</summary><p>{c.rule.value == null ? 'آستانهٔ عددی ندارد یا نامعلوم است' : `${c.rule.value} ${c.rule.unit ?? ''}`}</p><p>{c.rule.exceptions}</p><p className="report-sources">{links(c.source_ids)}</p></details></section>)}</div>
        <h3>هزینه و تمکن، جدا از هم</h3><dl className="report-costs">
          <div><dt>هزینهٔ دولتی متقاضی اصلی</dt><dd>{gbp(report.costs.government_fee.amount)}<p className="help">{report.costs.government_fee.note}</p>{links(report.costs.government_fee.source_ids)}</dd></div>
          <div><dt>IHS متقاضی اصلی</dt><dd>کل: {gbp(report.costs.healthcare.amount)} · نرخ سالانه: {gbp(report.costs.healthcare.annual_rate)}<p className="help">{report.costs.healthcare.note}</p>{links(report.costs.healthcare.source_ids)}</dd></div>
          <div><dt>تمکن متقاضی اصلی؛ قابل جمع با هزینهٔ مصرفی نیست</dt><dd>{gbp(report.costs.maintenance.amount)}<p className="help">زندگی پیش از کسر: {gbp(report.costs.maintenance.living_before_deduction)} · ماندهٔ شهریه: {gbp(report.costs.maintenance.tuition_outstanding)} · کسر اقامت مجاز: {gbp(report.costs.maintenance.accommodation_deduction)}</p><p>{report.costs.maintenance.note}</p>{links(report.costs.maintenance.source_ids)}</dd></div>
          <div><dt>همراهان؛ مجوز هنوز بررسی مستقل لازم دارد</dt><dd>تعداد: {report.costs.dependants.count?.toLocaleString('fa-IR') ?? 'نامعلوم'} · کل تمکن: {gbp(report.costs.dependants.maintenance)} · نرخ ماهانهٔ هر همراه: {gbp(report.costs.dependants.monthly_rate)} · هزینهٔ ویزا: {gbp(report.costs.dependants.visa_fees)}<p>{report.costs.dependants.note}</p>{links(report.costs.dependants.source_ids)}</dd></div>
          {report.costs.other.map(c => <div key={c.id}><dt>{c.note}</dt><dd>نامعلوم</dd></div>)}
          <div><dt>جمع هزینهٔ مصرفی</dt><dd>نامعلوم؛ هزینه‌های گمشده صفر نشده‌اند.</dd></div>
        </dl><h3>قدم‌های بعدی</h3><ol className="report-actions">{report.next_actions.map(a => <li key={a.id}><strong>{a.title}</strong><p>{a.detail}</p><div className="report-sources">{links(a.source_ids)}</div></li>)}</ol>
        <details><summary>پاسخ‌ها، محدودیت‌ها و نسخهٔ منابع</summary>
          <p>نسخهٔ پاسخ‌ها: {report.case_revision.toLocaleString('fa-IR')} · سیاست: <bdi>{report.policy_version}</bdi></p>
          <ul>{report.limitations.map(text => <li key={text}>{text}</li>)}</ul>
          <ul>{report.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> · بررسی: {new Date(s.checked_at).toLocaleDateString('fa-IR')} · پایان اعتبار بررسی: {new Date(s.expires_at).toLocaleDateString('fa-IR')} · مؤثر از: {s.effective_from ?? 'احراز نشده'}</li>)}</ul>
          <p className="help">برای دریافت snapshot پاسخ‌ها، داده و قواعد این گزارش، از خروجی حساب استفاده کن. نسخهٔ ذخیره‌شده با اصلاح پاسخ عوض نمی‌شود.</p>
        </details>
      </article>
  </section>;
}
export function GuidancePage() {
  const [revision, setRevision] = useState<number | null>(null);
  const [report, setReport] = useState<GuidanceReport | null>(null);
  const [state, setState] = useState<ReportState | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  const lock = useRef(false); const generation = useRef(0);
  const retry = useRef<{ expected_revision: number; request_id: string } | null>(null);
  async function load() {
    if (lock.current) return; lock.current = true; const started = ++generation.current; setBusy(true); setError('');
    try {
      const [f, r] = await Promise.all([accountRequest('form'), accountRequest('report')]);
      if (started !== generation.current) return;
      if (!f.response.ok || !r.response.ok) { if ([f.response.status, r.response.status].includes(401)) { setRevision(null); setReport(null); setState(null); } setError(f.response.ok ? r.data.message : f.data.message); return; }
      setRevision(f.data.revision); setReport(r.data.report); setState(r.data.report_state); setConflict(false); retry.current = null;
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('دریافت پرونده ممکن نشد؛ دوباره تلاش کن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    void load(); const channel = new BroadcastChannel('kooch.account');
    channel.onmessage = () => { invalidateAccountRequests(); generation.current++; lock.current = false; retry.current = null;
      setRevision(null); setReport(null); setState(null); setBusy(false); setError('از حساب خارج شدی؛ برای ادامه دوباره وارد شو.'); };
    return () => { generation.current++; channel.close(); };
  }, []);
  async function generate() {
    if (!revision || lock.current || conflict) return;
    const input = retry.current?.expected_revision === revision ? retry.current : { expected_revision: revision, request_id: crypto.randomUUID() };
    retry.current = input; lock.current = true; const started = ++generation.current; setBusy(true); setError('');
    try {
      const { response, data } = await accountRequest('report', input);
      if (started !== generation.current) return;
      if (!response.ok) { if (response.status === 401) { setRevision(null); setReport(null); setState(null); } if (response.status === 409) setConflict(true); setError(data.message); return; }
      setReport(data.report); setState(data.report_state); retry.current = null;
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ برای اطمینان از ثبت، دوباره ساخت کارنامه را بزن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#report-main">رفتن به کارنامه</a>
    <header><a className="brand" href="/"><strong>کوچ</strong><span>کارنامهٔ من</span></a><nav className="header-actions" aria-label="بخش‌های کوچ"><a href="/form">ادامه و اصلاح پاسخ‌ها</a><a href="/account">حساب من</a></nav></header>
    <main id="report-main"><h1>کارنامهٔ مقدماتی من</h1>
      <p className="intro">نتیجهٔ مسیرهای بررسی‌شده از پاسخ‌های همان پرونده؛ اطلاعات را یک بار در نقشهٔ من کامل می‌کنی.</p>
      <p className="notice">پوشش فعلی ارزیابی فقط تحصیل بریتانیاست. برای بقیهٔ مسیرها هنوز ماژول ارزیابی مستند نداریم؛ نبود نتیجه به معنی بسته‌بودن آن‌ها نیست.</p>
      {error && <p role="alert" className="error">{error}</p>}{busy && <p role="status">در حال دریافت یا ذخیرهٔ کارنامه…</p>}
      <div className="actions"><a className="secondary" href="/form">ادامهٔ همان پرسش‌نامه و اصلاح پاسخ‌ها</a><button className="secondary" disabled={busy} onClick={() => void load()}>دریافت نسخهٔ تازهٔ پرونده</button></div>
      {revision ? <><p className="help">نسخهٔ پاسخ‌های ذخیره‌شده: {revision.toLocaleString('fa-IR')} · با اطلاعات ناقص هم می‌توانی کارنامه بسازی؛ هیچ پاسخ تازه‌ای در این صفحه لازم نیست.</p><button className="primary" disabled={busy || conflict} onClick={() => void generate()}>ساخت و ذخیرهٔ کارنامه از همین پاسخ‌ها</button></> : <a href="/account">ورود و ذخیرهٔ پاسخ‌های قطب‌نما</a>}
      {report && <div aria-label="کارنامهٔ مشترک"><p className="draft-notice">نسخهٔ کارنامه: {report.version.toLocaleString('fa-IR')} · بر پایهٔ نسخهٔ پاسخ‌ها: {report.case_revision.toLocaleString('fa-IR')}</p>
        {report.route_results.length ? report.route_results.map(route => <RouteResult key={route.route_id} report={route} version={report.version} state={state} />) : <p className="notice">{report.coverage_note}</p>}
      </div>}
    </main>
  </div>;
}
