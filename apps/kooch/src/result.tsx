'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompassResult } from './api';
import type { RetrievalStatus } from './retrieval';
import { GuidanceSummary } from './guidance-summary';
import { RouteComparison } from './route-comparison';
import { date } from './display';
import { RouteResearch } from './research/view';
import { ReadinessView } from './readiness-view';
import { RouteDirectory } from './route-directory';
import { PersonalScreeningView } from './personal-screening-view';
export { date } from './display';
const num = (n: number) => n.toLocaleString('fa-IR');

export function Evidence({ result, retrieval }: { result: CompassResult; retrieval?: RetrievalStatus }) {
  return <details className="evidence"><summary>منبع، تاریخ و محدودهٔ پوشش</summary>
    {result.global_coverage && <p>کاتالوگ: {num(result.global_coverage.routes)} رکورد در {num(result.global_coverage.countries)} مقصد؛ پوشش روش اقدام و شرایط فردی محدودتر است.{result.global_coverage.status === 'stale' && ' دریافت کاتالوگ به تازه‌سازی نیاز دارد.'}</p>}
    {result.global_coverage && <p>آخرین دریافت کاتالوگ: {date(result.global_coverage.retrieved_at)} · {num(result.global_coverage.primary_sources_due_review ?? 0)} منبع خارج از بازهٔ بررسی ۱۴روزه. {result.global_coverage.refresh?.state === 'updated' ? 'فهرست عمومی هنگام استفاده با فاصلهٔ ۲۴ساعته تازه‌سازی می‌شود؛ تأیید شروط رسمی مستقل است.' : result.global_coverage.refresh ? 'آخرین تازه‌سازی کامل نشد؛ کاتالوگ قبلی با تاریخ اصلی حفظ شده است.' : ''}</p>}
    <p>روش اقدام {num(result.coverage.current)} مسیر در این داده اعتبار دارد. از {num(result.coverage.catalog)} رکورد کاتالوگ، {num(result.coverage.unreviewed)} مورد هنوز بررسی روش اقدام ندارند. نبود پوشش، به معنی بسته‌بودن مسیر نیست.</p>
    <p>{num(result.coverage.expired)} مسیر منقضی، {num(result.coverage.excluded)} مسیر خارج از شرایط روش اقدام و {num(result.coverage.without_discovery_policy)} مسیر بدون نگاشت این قطب‌نماست؛ این موارد پیشنهاد مستقیم نمی‌شوند.</p>
    <p>دریافت: {date(result.evidence.retrieved_at)}{result.evidence.earliest_expiry && ` · نزدیک‌ترین انقضا: ${date(result.evidence.earliest_expiry)}`}</p>
    <p><a href={result.evidence.source_url} target="_blank" rel="noreferrer">دادهٔ کوچ با محدودهٔ شروع از ایران</a> · <a href={result.evidence.provider_url} target="_blank" rel="noreferrer">Visa Atlas</a> · <a href={result.evidence.license_url} target="_blank" rel="noreferrer">{result.evidence.license}</a></p>
    <p>دریافت موفق، تاریخ تأیید رسمی را تمدید نمی‌کند. این بررسی فقط روش اقدام را پوشش می‌دهد.</p>
    {retrieval?.state === 'error' && <p role="status">آخرین دریافت در {date(retrieval.attempted_at)} ناموفق بود؛ نسخهٔ قبلی فقط تا پایان اعتبار شواهد استفاده می‌شود.</p>}
  </details>;
}
export function Results({ result, edit, editPrerequisites, busy, retrieval, focusRoute }: { result: CompassResult; edit: () => void; editPrerequisites: () => void; busy: boolean; retrieval?: RetrievalStatus; focusRoute?: (id: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const comparison = useRef<HTMLHeadingElement>(null);
  const comparisonButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setSelected([]); setComparing(false); }, [result]);
  useEffect(() => { if (comparing) comparison.current?.focus(); }, [comparing]);
  const selectedRoutes = result.routes.filter(route => selected.includes(route.id));
  function toggle(id: string) {
    setComparing(false);
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 3 ? [...current, id] : current);
  }
  return <section aria-labelledby="result-title" className="results">
    <div className="result-heading"><div><h1 id="result-title" tabIndex={-1}>مسیرهای قابل بررسی</h1><p>این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></div><button className="secondary" disabled={busy} onClick={edit}>مرور و اصلاح پاسخ‌ها</button></div>
    {result.personal_screening && <PersonalScreeningView screening={result.personal_screening} choose={focusRoute} busy={busy}/>}
    {result.routes.length > 0 && result.guidance && <GuidanceSummary guidance={result.guidance}/>}
    {!result.routes.length && result.restricted_routes?.length === 0 && <div className="empty-state"><h2>{result.status === 'review_required' ? 'اطلاعات مسیرها به بازبینی تازه نیاز دارند' : 'این انتخاب را با هدف یا مقصد دیگری بررسی کن'}</h2><p>{result.status === 'review_required' ? 'اعتبار شواهد تمام شده است؛ دادهٔ قدیمی را جایگزین نتیجه نمی‌کنیم.' : result.no_match_reason === 'prerequisite_required' ? 'مسیرهای این انتخاب به سابقه یا شرط مشخصی نیاز دارند که در پاسخ‌هایت تأیید نشده است. می‌توانی پاسخ‌های پیش‌نیاز را اصلاح کنی.' : 'برای ترکیب این هدف و مقصد، هنوز مسیر مستندی در داده‌های فعلی نداریم. این به معنی بسته‌بودن راه مهاجرت نیست.'}</p></div>}
    {result.restricted_routes?.length > 0 && <details className="evidence" open={result.routes.length === 0 || undefined}><summary>مسیرهای دارای محدودیت یا نیازمند بررسی استثنا ({num(result.restricted_routes.length)})</summary>{result.restricted_routes.map(route => <section key={route.id}><h3>{route.name_fa}</h3><p>{route.channel_note}</p><p>{route.application_method}</p><ul>{route.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul><RouteResearch routeId={route.id} academic={route.category === 'تحصیل'}/></section>)}</details>}
    {result.routes.length > 1 && <div className="comparison-toolbar"><div><h2>مقایسهٔ مسیرها</h2><p className="help">دو یا سه مسیر را انتخاب کن تا شرط‌ها و قدم بعدی را کنار هم ببینی.</p></div><button ref={comparisonButton} className="secondary" disabled={selected.length < 2 || busy} onClick={() => setComparing(true)} aria-controls={comparing ? 'route-comparison' : undefined}>مقایسهٔ انتخاب‌ها{selected.length > 0 && ` (${num(selected.length)})`}</button></div>}
    {comparing && selectedRoutes.length >= 2 && <section id="route-comparison" className="comparison-section" aria-labelledby="comparison-title"><div className="result-heading"><h2 id="comparison-title" ref={comparison} tabIndex={-1}>تفاوت مسیرهای انتخاب‌شده</h2><button className="text-button" onClick={() => { setComparing(false); comparisonButton.current?.focus(); }}>بستن مقایسه</button></div><RouteComparison routes={selectedRoutes}/></section>}
    <div className="route-grid">{result.routes.map(route => <article className="route-card" key={route.id}>
      <div className="route-title"><span className="flag" aria-hidden="true">{route.flag}</span><div><h2>{route.name_fa.split('؛')[0]}</h2><p>{route.country} · {route.category}</p></div></div>
      {result.routes.length > 1 && <label className="compare-choice"><input type="checkbox" aria-label={`مقایسهٔ ${route.name_fa.split('؛')[0]}`} checked={selected.includes(route.id)} disabled={busy || (!selected.includes(route.id) && selected.length >= 3)} onChange={() => toggle(route.id)}/><span>مقایسه</span></label>}
      {route.coverage !== 'application_channel_reviewed' && <p className="notice">{route.coverage_label}</p>}<p>{route.summary}</p>
      <p className="route-reason"><strong>چرا بررسی‌اش کنی؟ </strong>{route.reason}</p>
      <dl>{route.facts.length ? route.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>) : <div><dt>شرط اصلی</dt><dd>{route.prerequisite}</dd></div>}<div><dt>روش اقدام</dt><dd>{route.application_method}</dd></div></dl>
      {route.next_step !== result.guidance?.main_action && <p className="route-next-step"><strong>گام بعدی این مسیر: </strong>{route.next_step}</p>}
      <details><summary>منابع و تاریخ اطلاعات</summary><p lang="en" dir="ltr">{route.official_name}</p><p>{route.channel_note}</p>{route.followup && <p>{route.followup}</p>}<p>{route.coverage === 'application_channel_reviewed' ? 'بررسی روش اقدام' : 'بررسی ثبت‌شدهٔ منبع؛ نیازمند تأیید تازه'}: {date(route.checked_on)} · پایان بازهٔ بازبینی: {date(route.valid_until)}</p><ul>{[...new Map([...route.sources, ...route.facts.flatMap(fact => fact.sources)].map(source => [`${source.id}:${source.checked_on}`, source])).values()].map(source => <li key={`${source.id}:${source.checked_on}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {date(source.checked_on)}</li>)}</ul></details>
      {route.page_url ? <a className="route-link" href={route.page_url} target="_blank" rel="noreferrer">خواندن راهنمای مسیر <span className="sr-only">در تب تازه؛ مسیرها در این صفحه می‌مانند</span><span aria-hidden="true">←</span></a> : route.reference_url ? <a className="route-link" href={route.reference_url} target="_blank" rel="noreferrer">مرجع رسمی مسیر ←</a> : <p className="muted">مرجع قابل نمایش هنوز در دسترس نیست.</p>}
      {route.readiness && <><ReadinessView readiness={route.readiness}/>{focusRoute && <button className="secondary" disabled={busy} onClick={() => focusRoute(route.id)}>پاسخ به شرط‌های این مسیر</button>}</>}
      <RouteResearch routeId={route.id} academic={route.category === 'تحصیل'}/>
    </article>)}</div>
    <details className="context-details"><summary>کاتالوگ مرجع؛ مستقل از نتیجهٔ فردی</summary><RouteDirectory routes={result.matching_routes ?? result.routes} onChoose={focusRoute} busy={busy} coverage={result.global_coverage} destinationCoverage={result.destination_coverage}/></details>
    {result.unknowns.length > 0 && <details className="evidence"><summary>اطلاعاتی که هنوز نامعلوم‌اند</summary><ul>{result.unknowns.map(item => <li key={item}>{item}</li>)}</ul></details>}
    {result.routes.length > 0 && !result.guidance && <NextActions key={JSON.stringify(result.routes.map(route => [route.id, route.next_step]))} routes={result.routes}/>}
    <details className="next-steps context-details"><summary>موارد دیگر برای آماده‌سازی</summary><ul>{result.next_steps.map(item => <li key={item}>{item}</li>)}</ul></details>
    <Evidence result={result} retrieval={retrieval} />
  </section>;
}

export { RouteComparison } from './route-comparison';

function NextActions({ routes }: { routes: CompassResult['routes'] }) {
  const [completed, setCompleted] = useState<string[]>([]);
  const actions = [...new Set(routes.map(route => route.next_step))];
  return <section className="next-actions" aria-labelledby="next-actions-title"><h2 id="next-actions-title">از این قدم شروع کن</h2><p className="help">کارهای مربوط به همین مسیرها؛ علامت‌ها فقط در این صفحه می‌مانند.</p>{actions.map(action => <label className="action-task" key={action}><input type="checkbox" checked={completed.includes(action)} onChange={event => setCompleted(current => event.target.checked ? [...current, action] : current.filter(item => item !== action))}/><span>{action}</span></label>)}</section>;
}
