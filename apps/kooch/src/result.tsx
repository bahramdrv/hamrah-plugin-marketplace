import type { CompassResult } from './api';
import type { RetrievalStatus } from './retrieval';
const num = (n: number) => n.toLocaleString('fa-IR');
export function date(value: string) {
  return new Date(value).toLocaleDateString('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' });
}
export function Evidence({ result, retrieval }: { result: CompassResult; retrieval?: RetrievalStatus }) {
  return <details className="evidence"><summary>منبع، تاریخ و محدودهٔ پوشش</summary>
    <p>کانال اقدام {num(result.coverage.current)} مسیر در این داده اعتبار دارد. از {num(result.coverage.catalog)} رکورد کاتالوگ، {num(result.coverage.unreviewed)} مورد هنوز بررسی کانال اقدام ندارند. نبود پوشش، به معنی بسته‌بودن مسیر نیست.</p>
    <p>{num(result.coverage.expired)} مسیر منقضی، {num(result.coverage.excluded)} مسیر خارج از شرایط کانال و {num(result.coverage.without_discovery_policy)} مسیر بدون نگاشت این قطب‌نماست؛ این موارد پیشنهاد مستقیم نمی‌شوند.</p>
    <p>دریافت: {date(result.evidence.retrieved_at)}{result.evidence.earliest_expiry && ` · نزدیک‌ترین انقضا: ${date(result.evidence.earliest_expiry)}`}</p>
    <p><a href={result.evidence.source_url} target="_blank" rel="noreferrer">دادهٔ کوچ با محدودهٔ شروع از ایران</a> · <a href={result.evidence.provider_url} target="_blank" rel="noreferrer">Visa Atlas</a> · <a href={result.evidence.license_url} target="_blank" rel="noreferrer">{result.evidence.license}</a></p>
    <p>دریافت موفق، تاریخ تأیید رسمی را تمدید نمی‌کند. این بررسی فقط کانال اقدام را پوشش می‌دهد.</p>
    {retrieval?.state === 'error' && <p role="status">آخرین دریافت در {date(retrieval.attempted_at)} ناموفق بود؛ نسخهٔ قبلی فقط تا پایان اعتبار شواهد استفاده می‌شود.</p>}
  </details>;
}
export function Results({ result, edit, editPrerequisites, busy, retrieval }: { result: CompassResult; edit: () => void; editPrerequisites: () => void; busy: boolean; retrieval?: RetrievalStatus }) {
  return <section aria-labelledby="result-title" className="results">
    <div className="result-heading"><div><h1 id="result-title" tabIndex={-1}>مسیرهای قابل بررسی</h1><p>این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></div><button className="secondary" disabled={busy} onClick={edit}>مرور و اصلاح پاسخ‌ها</button></div>
    {result.editable_questions.length > 0 && <button className="text-button" disabled={busy} onClick={editPrerequisites}>{busy ? 'در حال دریافت…' : 'اصلاح پاسخ‌های پیش‌نیاز'}</button>}
    {!result.routes.length && <div className="empty-state"><h2>{result.status === 'review_required' ? 'شواهد به بازبینی تازه نیاز دارند' : 'با این اطلاعات، مسیر مستقیمی نمایش نمی‌دهیم'}</h2><p>{result.status === 'review_required' ? 'اعتبار شواهد تمام شده است؛ دادهٔ قدیمی را جایگزین نتیجه نمی‌کنیم.' : 'ممکن است پیش‌نیازها نامعلوم باشند یا برای مقصد و هدف تو پوشش کافی نداشته باشیم. این نتیجه به معنی نامناسب‌بودن تو یا بسته‌بودن مسیر نیست.'}</p></div>}
    <div className="route-grid">{result.routes.map(route => <article className="route-card" key={route.id}>
      <div className="route-title"><span className="flag" aria-hidden="true">{route.flag}</span><div><h2>{route.name_fa}</h2><p>{route.country} · {route.category}</p></div></div>
      <p>{route.reason}</p>
      <dl><div><dt>پیش‌نیاز مهم</dt><dd>{route.prerequisite}</dd></div><div><dt>پوشش شواهد</dt><dd>{route.coverage_label}</dd></div><div><dt>بررسی کانال</dt><dd>{date(route.checked_on)}</dd></div><div><dt>اعتبار تا</dt><dd>{date(route.valid_until)}</dd></div></dl>
      <details><summary>نام رسمی و منابع کانال اقدام</summary><p lang="en" dir="ltr">{route.official_name}</p><p>{route.channel_note}</p>{route.followup && <p>{route.followup}</p>}<ul>{route.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {date(source.checked_on)}</li>)}</ul></details>
      {route.page_url ? <a className="route-link" href={route.page_url} target="_blank" rel="noreferrer">بررسی مسیر <span aria-hidden="true">←</span></a> : <p className="muted">صفحهٔ عمومی این مسیر هنوز منتشر نشده است.</p>}
    </article>)}</div>
    {result.needs_information > 0 && <p className="notice">{num(result.needs_information)} مسیر مرتبط به اطلاعات بیشتر دربارهٔ پیش‌نیازها نیاز دارند و وارد فهرست بالا نشده‌اند.</p>}
    {result.omitted_by_limit > 0 && <p>{num(result.omitted_by_limit)} مسیر دیگر با پیش‌نیاز خوداظهاری تو مرتبط‌اند. با انتخاب مقصد، فهرست را محدود کن. ترتیب این فهرست رتبه‌بندی احتمال ویزا نیست.</p>}
    {result.unknowns.length > 0 && <details className="evidence"><summary>اطلاعاتی که هنوز نامعلوم‌اند</summary><ul>{result.unknowns.map(item => <li key={item}>{item}</li>)}</ul></details>}
    <section className="next-steps"><h2>قدم بعدی تو</h2><ul>{result.next_steps.map(item => <li key={item}>{item}</li>)}</ul></section>
    <Evidence result={result} retrieval={retrieval} />
  </section>;
}
