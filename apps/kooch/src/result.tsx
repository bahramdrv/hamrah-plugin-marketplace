import type { CompassResult } from './api';
import type { RetrievalStatus } from './retrieval';
const num = (n: number) => n.toLocaleString('fa-IR');
export function date(value: string) {
  return new Date(value).toLocaleDateString('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
}
export function Evidence({ result, retrieval }: { result: CompassResult; retrieval?: RetrievalStatus }) {
  return <details className="evidence"><summary>منبع، تاریخ و محدودهٔ پوشش</summary>
    <p>روش اقدام {num(result.coverage.current)} مسیر در این داده اعتبار دارد. از {num(result.coverage.catalog)} رکورد کاتالوگ، {num(result.coverage.unreviewed)} مورد هنوز بررسی روش اقدام ندارند. نبود پوشش، به معنی بسته‌بودن مسیر نیست.</p>
    <p>{num(result.coverage.expired)} مسیر منقضی، {num(result.coverage.excluded)} مسیر خارج از شرایط روش اقدام و {num(result.coverage.without_discovery_policy)} مسیر بدون نگاشت این قطب‌نماست؛ این موارد پیشنهاد مستقیم نمی‌شوند.</p>
    <p>دریافت: {date(result.evidence.retrieved_at)}{result.evidence.earliest_expiry && ` · نزدیک‌ترین انقضا: ${date(result.evidence.earliest_expiry)}`}</p>
    <p><a href={result.evidence.source_url} target="_blank" rel="noreferrer">دادهٔ کوچ با محدودهٔ شروع از ایران</a> · <a href={result.evidence.provider_url} target="_blank" rel="noreferrer">Visa Atlas</a> · <a href={result.evidence.license_url} target="_blank" rel="noreferrer">{result.evidence.license}</a></p>
    <p>دریافت موفق، تاریخ تأیید رسمی را تمدید نمی‌کند. این بررسی فقط روش اقدام را پوشش می‌دهد.</p>
    {retrieval?.state === 'error' && <p role="status">آخرین دریافت در {date(retrieval.attempted_at)} ناموفق بود؛ نسخهٔ قبلی فقط تا پایان اعتبار شواهد استفاده می‌شود.</p>}
  </details>;
}
export function Results({ result, edit, editPrerequisites, busy, retrieval }: { result: CompassResult; edit: () => void; editPrerequisites: () => void; busy: boolean; retrieval?: RetrievalStatus }) {
  return <section aria-labelledby="result-title" className="results">
    <div className="result-heading"><div><h1 id="result-title" tabIndex={-1}>مسیرهای قابل بررسی</h1><p>این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></div><button className="secondary" disabled={busy} onClick={edit}>مرور و اصلاح پاسخ‌ها</button></div>
    {result.editable_questions.length > 0 && <button className="text-button" disabled={busy} onClick={editPrerequisites}>{busy ? 'در حال دریافت…' : 'اصلاح پاسخ‌های پیش‌نیاز'}</button>}
    {!result.routes.length && <div className="empty-state"><h2>{result.status === 'review_required' ? 'اطلاعات مسیرها به بازبینی تازه نیاز دارند' : 'این انتخاب را با هدف یا مقصد دیگری بررسی کن'}</h2><p>{result.status === 'review_required' ? 'اعتبار شواهد تمام شده است؛ دادهٔ قدیمی را جایگزین نتیجه نمی‌کنیم.' : result.no_match_reason === 'prerequisite_required' ? 'مسیرهای این انتخاب به سابقه یا شرط مشخصی نیاز دارند که در پاسخ‌هایت تأیید نشده است. می‌توانی پاسخ‌های پیش‌نیاز را اصلاح کنی.' : 'برای ترکیب این هدف و مقصد، هنوز مسیر مستندی در داده‌های فعلی نداریم. این به معنی بسته‌بودن راه مهاجرت نیست.'}</p></div>}
    <div className="route-grid">{result.routes.map(route => <article className="route-card" key={route.id}>
      <div className="route-title"><span className="flag" aria-hidden="true">{route.flag}</span><div><h2>{route.name_fa.split('؛')[0]}</h2><p>{route.country} · {route.category}</p></div></div>
      <p>{route.summary}</p>
      <dl>{route.facts.length ? route.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>) : <div><dt>شرط اصلی</dt><dd>{route.prerequisite}</dd></div>}<div><dt>روش اقدام</dt><dd>{route.application_method}</dd></div></dl>
      <p className="route-next-step"><strong>گام بعدی تو: </strong>{route.next_step}</p>
      <details><summary>منابع و تاریخ اطلاعات</summary><p lang="en" dir="ltr">{route.official_name}</p><p>{route.channel_note}</p>{route.followup && <p>{route.followup}</p>}<p>بررسی روش اقدام: {date(route.checked_on)} · اعتبار تا {date(route.valid_until)}</p><ul>{[...new Map([...route.sources, ...route.facts.flatMap(fact => fact.sources)].map(source => [`${source.id}:${source.checked_on}`, source])).values()].map(source => <li key={`${source.id}:${source.checked_on}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {date(source.checked_on)}</li>)}</ul></details>
      {route.page_url ? <a className="route-link" href={route.page_url} target="_blank" rel="noreferrer">بررسی مسیر <span aria-hidden="true">←</span></a> : <p className="muted">صفحهٔ عمومی این مسیر هنوز منتشر نشده است.</p>}
    </article>)}</div>
    {result.omitted_by_limit > 0 && <p>{num(result.omitted_by_limit)} مسیر مرتبط دیگر هم وجود دارد. با انتخاب مقصد، فهرست را محدود کن.</p>}
    {result.unknowns.length > 0 && <details className="evidence"><summary>اطلاعاتی که هنوز نامعلوم‌اند</summary><ul>{result.unknowns.map(item => <li key={item}>{item}</li>)}</ul></details>}
    <section className="next-steps"><h2>قدم بعدی تو</h2><ul>{result.next_steps.map(item => <li key={item}>{item}</li>)}</ul></section>
    <Evidence result={result} retrieval={retrieval} />
  </section>;
}
