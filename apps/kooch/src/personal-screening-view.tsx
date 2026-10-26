'use client';
import { useEffect, useRef, useState } from 'react';
import { screeningLabels, type PersonalScreening, type ScreeningStatus } from './personal-screening';
import { date } from './display';

export function PersonalScreeningView({ screening, print = false, choose, busy = false }: { screening: PersonalScreening; print?: boolean; choose?: (id: string) => void; busy?: boolean }) {
  const initial = (['reported_checks_ready', 'preparation_needed', 'needs_information', 'restricted_context', 'needs_source_review', 'not_evaluated'] as const).find(status => screening.counts[status]) ?? 'needs_information';
  const [status, setStatus] = useState<ScreeningStatus | ''>(initial);
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setStatus(initial); setPage(0); }, [screening, initial]);
  const matching = print || !status ? screening.routes : screening.routes.filter(route => route.status === status);
  const shown = print ? matching : matching.slice(page * 12, (page + 1) * 12);
  function turn(next: number) { setPage(next); heading.current?.focus(); }
  return <section aria-label="غربال جهانی بر اساس پاسخ‌های تو" className="personal-screening">
    <h2 ref={heading} tabIndex={-1}>غربال جهانی مسیرها برای شرایط تو</h2>
    <p>دامنهٔ جست‌وجو: {screening.total.toLocaleString('fa-IR')} مسیر در {screening.destinations.toLocaleString('fa-IR')} مقصد. هدف و کشور دلخواهت فقط اولویت‌اند؛ سایر کشورها و خانواده‌های مسیر از این غربال حذف نمی‌شوند.</p>
    <p className="notice">این نسخه برای {screening.reviewed_routes.toLocaleString('fa-IR')} مسیر، مجموعه‌ای از شرط‌های قابل تطبیق با پاسخ‌های تو دارد؛ بقیه هنوز نتیجهٔ فردی ندارند. سازگاری شرط‌های بررسی‌شده، احراز همهٔ شرایط یا احتمال ویزا نیست.</p>
    <dl className="report-costs">{Object.entries(screeningLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{screening.counts[key as ScreeningStatus].toLocaleString('fa-IR')}</dd></div>)}</dl>
    <details open={print || undefined}><summary>چه چیزی از شرایط من هنوز ارزیابی نشده است؟</summary>
      <p>تطبیق خودکار سن، تحصیلات، سابقهٔ کار، زبان، بودجه و زمان‌بندی با شرط‌های اختصاصی تمام مسیرها هنوز پوشش کامل ندارد. برای این معیارها نتیجهٔ مثبت یا منفی نمی‌سازیم. قواعد فعلی، پاسخ‌های تو به شرط‌های مشخص هر مسیر و نسخهٔ منابع همان شرط‌ها را مصرف می‌کنند.</p>
      <p>مسیر فاقد شواهد یا پاسخ کافی، «نامعلوم» می‌ماند؛ نه مناسب تو اعلام می‌شود و نه بی‌دلیل کنار گذاشته می‌شود. فهرست مرجع برای تکمیل شواهد است و معادل مسیرهای ممکن برای تو نیست.</p>
    </details>
    {!print && <label>کدام بخش غربال را ببینی؟<select value={status} onChange={e => { setStatus(e.target.value as ScreeningStatus | ''); setPage(0); }}><option value="">تمام وضعیت‌ها، از جمله موارد نامعلوم</option>{Object.entries(screeningLabels).map(([key, label]) => <option key={key} value={key}>{label} ({screening.counts[key as ScreeningStatus].toLocaleString('fa-IR')})</option>)}</select></label>}
    <div className="route-grid">{shown.map(route => <article className="route-card" key={route.id}>
      <p>{route.flag} {route.country}</p><h3>{route.title}</h3><p className="notice">{screeningLabels[route.status]}</p>
      <ul>{route.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      {Boolean(route.missing_information.length) && <details open={print || undefined}><summary>برای نتیجهٔ شخصی چه چیزی کم است؟</summary><ul>{route.missing_information.map(item => <li key={item}>{item}</li>)}</ul></details>}
      <details open={print || undefined}><summary>منابع و تاریخ همین بررسی</summary><p>تاریخ منبع: <time dateTime={route.source_checked_on}>{date(route.source_checked_on)}</time> · احراز رسمی همهٔ شرایط: نامعلوم</p><ul>{route.source_urls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">مرجع همین مسیر</a></li>)}</ul></details>
      {choose && route.goal && !['restricted_context', 'not_evaluated'].includes(route.status) && <button className="secondary" disabled={busy} onClick={() => choose(route.id)}>پاسخ به شرط‌های این مسیر</button>}
    </article>)}</div>
    {!shown.length && <p className="notice">در این وضعیت، مسیری ثبت نشده است. مسیرهای نیازمند اطلاعات یا بازبینی را در بخش‌های دیگر همین غربال ببین.</p>}
    {!print && matching.length > 12 && <nav className="catalog-pagination" aria-label="صفحه‌های غربال فردی"><button className="secondary" disabled={!page} onClick={() => turn(page - 1)}>نتایج قبلی</button><span role="status">{(page * 12 + 1).toLocaleString('fa-IR')} تا {Math.min((page + 1) * 12, matching.length).toLocaleString('fa-IR')} از {matching.length.toLocaleString('fa-IR')}</span><button className="secondary" disabled={(page + 1) * 12 >= matching.length} onClick={() => turn(page + 1)}>نتایج بعدی</button></nav>}
  </section>;
}
