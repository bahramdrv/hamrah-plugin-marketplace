import type { GuidanceReport, RouteReport } from './evaluate';
import type { ReportState } from './contract';
export const conditionLabels: Record<string, string> = { self_reported_met: 'بر پایهٔ پاسخ تو برقرار', action_needed: 'نیازمند اقدام', unknown: 'اطلاعات لازم است', needs_review: 'نیازمند بازبینی', not_applicable: 'طبق پاسخ تو لازم نیست', not_assessed: 'بررسی نشده' };
const summary: Record<string, string> = { preliminary_conditions_met: 'موارد بررسی‌شده با پاسخ‌های تو سازگارند', action_needed: 'پیش از اقدام، چند شرط آماده نیست', needs_information: 'برای ادامه، اطلاعات بیشتری لازم است', needs_review: 'پیش از نتیجه‌گیری، بازبینی لازم است' };

export function RouteResult({ report, version, print = false }: { report: RouteReport; version: number; print?: boolean }) {
  const canada = report.route_id === 'ca:study-permit-ca';
  const title = canada ? 'مجوز تحصیل کانادا' : 'تحصیل بریتانیا';
  const money = (n: number | null) => n == null ? 'نامعلوم' : `${n.toLocaleString('fa-IR')} ${canada ? 'دلار کانادا' : 'پوند'}`;
  const links = (ids: string[]) => ids.map(id => { const s = report.sources.find(s => s.id === id); return s ? <a key={id} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : null; });
  return <section aria-label={title}><h2>{title}</h2>
      <article className="guidance-report" aria-label="کارنامهٔ ذخیره‌شده">
        <p className="eyebrow">کارنامهٔ مقدماتی · نسخهٔ {version.toLocaleString('fa-IR')} · {new Date(report.created_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</p>
        <h2>{summary[report.status]}</h2><p>{report.scope}</p><p className="notice">پوشش جزئی است. این نتیجه، تأیید صلاحیت، آماده‌بودن برای ارسال یا احتمال دریافت ویزا نیست.</p>

        <h3>شرط‌ها و دلیل</h3><div className="report-conditions">{report.conditions.map(c => <section key={c.id} className="report-condition"><h4>{c.title} <span>{conditionLabels[c.state]}</span></h4><p>{c.reason}</p><details open={print || undefined}><summary>قاعده و منابع</summary><p>{c.rule.value == null ? 'آستانهٔ عددی ندارد یا نامعلوم است' : `${c.rule.value} ${c.rule.unit ?? ''}`}</p><p>{c.rule.exceptions}</p><p className="report-sources">{links(c.source_ids)}</p></details></section>)}</div>
        <h3>هزینه و تمکن، جدا از هم</h3><dl className="report-costs">
          <div><dt>هزینهٔ دولتی متقاضی اصلی</dt><dd>{money(report.costs.government_fee.amount)}<p className="help">{report.costs.government_fee.note}</p>{links(report.costs.government_fee.source_ids)}</dd></div>
          <div><dt>{canada ? 'بیمه و معاینهٔ متقاضی اصلی' : 'IHS متقاضی اصلی'}</dt><dd>کل: {money(report.costs.healthcare.amount)}{!canada && <> · نرخ سالانه: {money(report.costs.healthcare.annual_rate)}</>}<p className="help">{report.costs.healthcare.note}</p>{links(report.costs.healthcare.source_ids)}</dd></div>
          <div><dt>{canada ? 'تمکن سال اولِ متقاضی و همراهان' : 'تمکن متقاضی اصلی؛ قابل جمع با هزینهٔ مصرفی نیست'}</dt><dd>{money(report.costs.maintenance.amount)}<p className="help">زندگی پیش از کسر: {money(report.costs.maintenance.living_before_deduction)} · ماندهٔ شهریه: {money(report.costs.maintenance.tuition_outstanding)}{canada ? <> · بودجهٔ رفت‌وبرگشت: {money('return_transport' in report.costs.maintenance ? report.costs.maintenance.return_transport : null)}</> : <> · کسر اقامت مجاز: {money(report.costs.maintenance.accommodation_deduction)}</>}</p><p>{report.costs.maintenance.note}</p>{links(report.costs.maintenance.source_ids)}</dd></div>
          <div><dt>همراهان؛ مجوز هنوز بررسی مستقل لازم دارد</dt><dd>تعداد: {report.costs.dependants.count?.toLocaleString('fa-IR') ?? 'نامعلوم'}{!canada && <> · کل تمکن: {money(report.costs.dependants.maintenance)} · نرخ ماهانهٔ هر همراه: {money(report.costs.dependants.monthly_rate)}</>} · هزینهٔ ویزا: {money(report.costs.dependants.visa_fees)}<p>{report.costs.dependants.note}</p>{links(report.costs.dependants.source_ids)}</dd></div>
          {report.costs.other.map(c => <div key={c.id}><dt>{c.note}</dt><dd>{money(c.amount)}{canada && c.id === 'biometrics' && links(['fees', 'biometrics'])}</dd></div>)}
          <div><dt>جمع هزینهٔ مصرفی</dt><dd>نامعلوم؛ هزینه‌های گمشده صفر نشده‌اند.</dd></div>
        </dl><h3>قدم‌های بعدی</h3><ol className="report-actions">{report.next_actions.map(a => <li key={a.id}><strong>{a.title}</strong><p>{a.detail}</p><div className="report-sources">{links(a.source_ids)}</div></li>)}</ol>
        <details open={print || undefined}><summary>پاسخ‌ها، محدودیت‌ها و نسخهٔ منابع</summary>
          <p>نسخهٔ پاسخ‌ها: {report.case_revision.toLocaleString('fa-IR')} · سیاست: <bdi>{report.policy_version}</bdi></p>
          <ul>{report.limitations.map(text => <li key={text}>{text}</li>)}</ul>
          <ul>{report.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> · بررسی: {new Date(s.checked_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })} · پایان اعتبار بررسی: {new Date(s.expires_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })} · مؤثر از: {s.effective_from ?? 'احراز نشده'}</li>)}</ul>
          <p className="help">برای دریافت snapshot پاسخ‌ها، داده و قواعد این گزارش، از خروجی حساب استفاده کن. نسخهٔ ذخیره‌شده با اصلاح پاسخ عوض نمی‌شود.</p>
        </details>
      </article>
  </section>;
}

export function ReportStatus({ state }: { state: ReportState | null }) {
  if (!state || state.current) return null;
  return <aside className="notice" role="status"><p>این نسخه سابقهٔ ثبت‌شده است؛ برای وضعیت تازه کارنامهٔ جدید بساز.</p>
    {!state.answers_current && <p>پاسخ‌های فرم بعد از آن تغییر کرده‌اند.</p>}
    {!state.evidence_current && <p>شواهد یا نسخهٔ قواعد نیازمند بازبینی هستند؛ مبالغ و نتیجهٔ این نسخه مربوط به زمان ثبت آن‌اند.</p>}
    <p>آخرین نسخهٔ ذخیره‌شده: {state.latest_version.toLocaleString('fa-IR')}</p>
  </aside>;
}
export function SavedReport({ report, state, print = false }: { report: GuidanceReport; state: ReportState | null; print?: boolean }) {
  return <div aria-label="کارنامهٔ مشترک"><p className="draft-notice">نسخهٔ کارنامه: {report.version.toLocaleString('fa-IR')} · بر پایهٔ نسخهٔ پاسخ‌ها: {report.case_revision.toLocaleString('fa-IR')} · {new Date(report.created_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</p>
    <ReportStatus state={state} />
    {report.route_results.length > 1 && <p className="notice">تفاوت مسیرها: بریتانیا CAS، زبان و نگهداری وجهِ مخصوص خود را دارد؛ کانادا LOA، PAL/TAL یا CAQ و تمکن با دلار کانادا را جدا بررسی می‌کند. پاسخ‌های عمومی یک بار ثبت شده‌اند؛ نتایج رتبه‌بندی یا احتمال ویزا نیستند.</p>}
    {report.route_results.length ? report.route_results.map(route => <RouteResult key={route.route_id} report={route} version={report.version} print={print} />) : <p className="notice">{report.coverage_note}</p>}
  </div>;
}
