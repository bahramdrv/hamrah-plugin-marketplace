'use client';
import { useEffect, useRef, useState } from 'react';
import { researchTopics, type ResearchResult } from './contract';

export function RouteResearch({ routeId, academic = false }: { routeId: string; academic?: boolean }) {
  const [topic, setTopic] = useState<keyof typeof researchTopics>('route');
  const [field, setField] = useState(''); const [source, setSource] = useState('');
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function search() {
    if (busy) return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ route_id: routeId, topic, ...(['academic', 'experiences'].includes(topic) ? { explicit_request: true } : {}), ...(topic === 'academic' ? { academic_api: source, field } : {}) }) });
      const data = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { setError(data.message ?? 'دریافت اطلاعات ممکن نشد؛ دوباره تلاش کن.'); return; }
      setResult(data);
    } catch { if (!controller.signal.aborted) setError('دریافت اطلاعات ممکن نشد؛ می‌توانی از منابع همین مسیر استفاده کنی یا دوباره تلاش کنی.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <details className="route-research"><summary>هزینه، زمان و اطلاعات بیشتر</summary>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <label>چه موضوعی را بررسی کنیم؟<select value={topic} disabled={busy} onChange={event => { setTopic(event.target.value as keyof typeof researchTopics); setResult(null); setError(''); }}>
        {Object.entries(researchTopics).filter(([key]) => key !== 'academic' || academic).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label>
      {topic === 'academic' && <><label>منبع جست‌وجو<select value={source} required onChange={event => setSource(event.target.value)}><option value="">منبع را انتخاب کن</option><option value="hamrah">API فرصت‌های بررسی‌شدهٔ همراه</option></select></label><label>رشته یا موضوع عمومی<input value={field} required minLength={2} maxLength={120} onChange={event => setField(event.target.value)} placeholder="مثلاً فیزیک یا مهندسی کامپیوتر"/></label><p className="help">این جست‌وجو دربارهٔ فرصت‌های منتشرشده است؛ اطلاعات شخصی یا رزومه لازم نیست.</p></>}
      {topic === 'experiences' && <p className="help">با زدن دکمه، تجربه‌های ثبت‌شدهٔ مرتبط را جست‌وجو می‌کنی؛ این نمونه‌ها نرخ پذیرش نیستند.</p>}
      <button className="secondary" disabled={busy} type="submit">{busy ? 'در حال جست‌وجوی منابع…' : `بررسی ${researchTopics[topic]}`}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <section aria-label={result.title} aria-live="polite"><p className="help">{result.note}</p>{result.status === 'partial' && <p className="notice">این نتیجه پوشش کامل ندارد؛ برخی شواهد ناقص یا بررسی‌نشده‌اند.</p>}
      {result.cards.map((card, i) => <div className="research-answer" key={i}><h3>{card.title}</h3>{card.text && <p dir="auto">{card.text}</p>}<div className="report-sources">{card.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a>)}</div></div>)}
    </section>}
  </details>;
}
