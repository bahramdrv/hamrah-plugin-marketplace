'use client';
import { useEffect, useRef, useState } from 'react';
import type { DiscoveryRoute } from './catalog';
import { date } from './display';
import type { CompassResult } from './api';

export function RouteDirectory({ routes, print = false, onChoose, busy = false, coverage, destinationCoverage }: { routes: DiscoveryRoute[]; print?: boolean; onChoose?: (id: string) => void; busy?: boolean; coverage?: CompassResult['global_coverage']; destinationCoverage?: CompassResult['destination_coverage'] }) {
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setCountry(''); setPage(0); }, [routes]);
  function turnPage(next: number) { setPage(next); heading.current?.focus(); }
  const destinations = [...new Map(routes.map(route => [route.destination, { name: route.country, flag: route.flag }])).entries()];
  const matching = print || !country ? routes : routes.filter(route => route.destination === country);
  const shown = print ? matching : matching.slice(page * 12, (page + 1) * 12);
  return <section className="route-directory" aria-label="تمام مسیرهای مرتبط">
    <h2 ref={heading} tabIndex={-1}>تمام مسیرهای مرتبط با انتخاب تو</h2>
    <p>{routes.length.toLocaleString('fa-IR')} مسیر در {destinations.length.toLocaleString('fa-IR')} مقصد؛ این فهرست به پنج کارت گزیده محدود نیست. وجود مسیر در فهرست به معنی احراز شرایط فردی نیست.</p>
    {coverage && <p className="notice">کاتالوگ منبع: {coverage.routes.toLocaleString('fa-IR')} مسیر در {coverage.countries.toLocaleString('fa-IR')} مقصد · دریافت {date(coverage.retrieved_at)}. {(coverage.primary_sources_due_review ?? 0).toLocaleString('fa-IR')} منبع نیازمند بررسی تازه است. {coverage.status === 'stale' || coverage.refresh && coverage.refresh.state !== 'updated' ? 'تازه‌سازی کامل نشده؛ تاریخ و محدودیت نسخهٔ قبلی حفظ شده است.' : 'کاتالوگ هنگام استفاده با فاصلهٔ ۲۴ساعته تازه‌سازی می‌شود؛ تأیید دوبارهٔ قوانین رسمی مستقل است.'}</p>}
    {Boolean(destinationCoverage?.length) && <details open={print || undefined}><summary>پوشش تک‌تک مقصدهای انتخابی تو</summary><ul>{destinationCoverage!.map(item => <li key={item.code}><strong>{item.name}: </strong>{item.catalog.toLocaleString('fa-IR')} رکورد · {item.matching.toLocaleString('fa-IR')} مرتبط · {item.restricted.toLocaleString('fa-IR')} محدودیت یا استثنا.{!item.catalog ? ' برای این مقصد پوشش منبع نداریم؛ امکان مسیرها نامعلوم است.' : !item.matching ? ' هدف، سابقهٔ لازم، محدودیت یا شواهد این مسیرها باید جدا بررسی شود.' : ''}</li>)}</ul></details>}
    {!print && <label>مسیرهای کدام مقصد را ببینی؟<select value={country} onChange={e => { setCountry(e.target.value); setPage(0); }}>
      <option value="">همهٔ مقصدهای مرتبط</option>{destinations.map(([code, item]) => <option value={code} key={code}>{item.flag} {item.name} ({routes.filter(route => route.destination === code).length.toLocaleString('fa-IR')})</option>)}
    </select></label>}
    <div className="route-grid">{shown.map(route => <article className="route-card" key={route.id}>
      <p>{route.flag} {route.country} · {route.category}</p><h3>{route.name_fa}</h3>
      <p className={route.coverage === 'application_channel_reviewed' ? 'help' : 'notice'}>{route.coverage_label}</p>
      <p>{route.summary}</p><p><strong>روش اقدام: </strong>{route.application_method}</p>
      <p><strong>قدم بعدی: </strong>{route.next_step}</p>
      <details open={print || undefined}><summary>منبع، محدودیت و تاریخ بررسی</summary>
        <p>{route.channel_note}</p>{route.followup && <p>{route.followup}</p>}
        <p>پایان بازهٔ بررسی: <time dateTime={route.valid_until}>{date(route.valid_until)}</time>؛ دریافت تازهٔ کاتالوگ، این تاریخ را تمدید نمی‌کند.</p>
        <ul>{route.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · <time dateTime={source.checked_on}>{date(source.checked_on)}</time></li>)}</ul>
      </details>
      {onChoose && <button className="secondary" disabled={busy} onClick={() => onChoose(route.id)}>بررسی شرط‌های این مسیر</button>}
    </article>)}</div>
    {!routes.length && <p className="notice">برای این هدف و مقصدها، مسیر دارای پوشش کافی در این نسخه پیدا نشد. این به معنی بسته‌بودن مسیرها نیست؛ فهرست کامل کاتالوگ و منابع رسمی را بررسی کن.</p>}
    {!print && matching.length > 12 && <nav className="catalog-pagination" aria-label="صفحه‌های مسیرهای مرتبط">
      <button className="secondary" disabled={!page} onClick={() => turnPage(page - 1)}>مسیرهای قبلی</button>
      <span role="status">{(page * 12 + 1).toLocaleString('fa-IR')} تا {Math.min((page + 1) * 12, matching.length).toLocaleString('fa-IR')} از {matching.length.toLocaleString('fa-IR')}</span>
      <button className="secondary" disabled={(page + 1) * 12 >= matching.length} onClick={() => turnPage(page + 1)}>مسیرهای بعدی</button>
    </nav>}
  </section>;
}
