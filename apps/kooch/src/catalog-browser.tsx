'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompassConfig } from './api';
import type { DiscoveryRoute } from './catalog';
import { compassRequest } from './compass-transport';
import { RouteResearch } from './research/view';
type Item = DiscoveryRoute & { category_id: string; policy_goal: string | null; official_summary: string; ordinary: boolean; prior_history_required: boolean };
type Page = { items: Item[]; total: number; offset: number; next_offset: number | null; categories: Record<string, string>; catalog_total: number; countries_total: number; review_required: boolean };
export function CatalogBrowser({ countries, choose }: { countries: CompassConfig['countries']; choose: (item: Item) => void }) {
  const [page, setPage] = useState<Page | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [country, setCountry] = useState(''), [category, setCategory] = useState('');
  const controller = useRef<AbortController | null>(null); const serial = useRef(0); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { serial.current++; controller.current?.abort(); }, []);
  async function load(offset = 0, focus = false) {
    controller.current?.abort(); const current = ++serial.current; const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ catalog: '1', q: query, destination: country, category, offset: String(offset), limit: '12' });
      const response = await compassRequest(`/api/config?${params}`, { cache: 'no-store', signal: abort.signal }, { origin: window.location.origin });
      const data = await response.json(); if (serial.current !== current) return;
      if (!response.ok) throw new Error(data.message ?? 'دریافت کاتالوگ ممکن نشد.');
      setPage(data); if (focus) heading.current?.focus();
    } catch (e) { if (serial.current === current && !abort.signal.aborted) setError(e instanceof Error ? e.message : 'دریافت ممکن نشد.'); }
    finally { if (serial.current === current) setBusy(false); }
  }
  return <details className="catalog-browser" onToggle={e => { if (e.currentTarget.open && !page && !busy) void load(); }}>
    <summary>مرور تمام کشورها و مسیرها</summary><h2 ref={heading} tabIndex={-1}>مسیرت را در کاتالوگ پیدا کن</h2>
    <p>تمام رکوردهای منبع برای تحقیق قابل مرورند؛ روش اقدام ایرانیان و محدودیت‌ها در هر کارت جدا آمده‌اند.</p>
    <form className="catalog-filters" onSubmit={e => { e.preventDefault(); void load(); }}>
      <label>جست‌وجوی مسیر یا کشور<input type="search" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="مثلاً دورکاری، فرانسه یا Blue Card"/></label>
      <label>مقصد<select value={country} onChange={e => setCountry(e.target.value)}><option value="">تمام مقصدها</option>{Object.entries(countries).sort((a, b) => a[1].name.localeCompare(b[1].name, 'fa')).map(([code, c]) => <option key={code} value={code}>{c.flag} {c.name}</option>)}</select></label>
      <label>گروه مسیر<select value={category} onChange={e => setCategory(e.target.value)}><option value="">تمام گروه‌ها</option>{Object.entries(page?.categories ?? {}).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label><button className="primary" disabled={busy}>جست‌وجو</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}<p role="status">{busy ? 'در حال دریافت مسیرها…' : page ? `${page.total.toLocaleString('fa-IR')} نتیجه از ${page.catalog_total.toLocaleString('fa-IR')} رکورد و ${page.countries_total.toLocaleString('fa-IR')} مقصد` : ''}</p>
    {page?.review_required && <p className="notice">این دریافت کاتالوگ قدیمی است؛ رکوردها فقط مرجع تحقیق‌اند و پیش از اقدام به دریافت و بررسی تازه نیاز دارند.</p>}
    <div className="route-grid" aria-busy={busy}>{page?.items.map(item => <article className="route-card" key={item.id}>
      <p>{item.flag} {item.country} · {item.category}</p><h3>{item.name_fa}</h3><p className={item.ordinary ? 'help' : 'notice'}>{item.application_method}</p><p>{item.channel_note}</p>
      {item.prior_history_required && <p className="notice">این مسیر به سابقه یا وضعیت قبلی در مقصد وابسته است؛ برای تازه‌وارد بدون آن سابقه پیشنهاد عادی نیست.</p>}
      <details><summary>عنوان اصلی و منابع</summary><p lang="en" dir="ltr">{item.official_name}</p><p lang="en" dir="ltr">{item.official_summary}</p><ul>{item.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {s.checked_on}</li>)}</ul><p className="help">تاریخ منبع با تاریخ تأیید روش اقدام ایران یکی نیست. نبود داده، به معنی بسته‌بودن مسیر نیست.</p></details>
      {item.policy_goal && item.ordinary && <button className="secondary" onClick={() => choose(item)}>بررسی این مسیر با پاسخ‌های من</button>}<RouteResearch routeId={item.id} academic={item.category_id === 'study'}/>
    </article>)}</div>
    {page && <div className="catalog-pagination"><button className="secondary" disabled={busy || page.offset === 0} onClick={() => void load(Math.max(0, page.offset - 12), true)}>صفحهٔ قبل</button><span>{page.total ? `${(page.offset + 1).toLocaleString('fa-IR')} تا ${Math.min(page.offset + 12, page.total).toLocaleString('fa-IR')}` : 'نتیجه‌ای برای این فیلتر نیست'}</span><button className="secondary" disabled={busy || page.next_offset === null} onClick={() => void load(page.next_offset ?? 0, true)}>صفحهٔ بعد</button></div>}
    <p className="help">کاتالوگ پایه: <a href="https://visaatlas.org/data" target="_blank" rel="noreferrer">Visa Atlas</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · مسیرهای افزودهٔ کوچ با ارجاع مستقیم به مرجع رسمی مشخص‌اند.</p>
  </details>;
}
