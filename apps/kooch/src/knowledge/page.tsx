'use client';
import { useEffect, useRef, useState } from 'react';
import type { KnowledgeResult, knowledgeDocuments } from './retrieval';

export function KnowledgeSearch({ documents }: { documents: typeof knowledgeDocuments }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<KnowledgeResult | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function search(text = query) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setQuery(text); setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: text }), signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'جست‌وجو ممکن نشد؛ دوباره تلاش کن.'); return; }
      setResult(data);
    } catch { if (!controller.signal.aborted) setError('ارتباط برقرار نشد؛ دوباره تلاش کن یا راهنماهای پایین صفحه را بخوان.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#knowledge-main">رفتن به راهنما</a>
    <header><a className="brand" href="/"><strong>کوچ</strong><span>راهنمای استفاده</span></a><nav className="header-actions" aria-label="بخش‌های کوچ"><a href="/">قطب‌نما</a><a href="/account">حساب من</a></nav></header>
    <main id="knowledge-main"><div className="workspace">
      <section className="question-panel"><h1>دربارهٔ کار با کوچ بپرس</h1>
        <p className="intro">متن مرتبط را از راهنمای فرم پیدا کن و منبعش را بخوان.</p>
        <form className="knowledge-search" onSubmit={event => { event.preventDefault(); void search(); }}>
          <label htmlFor="knowledge-query">پرسش دربارهٔ فرم</label>
          <input id="knowledge-query" type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} minLength={2} required placeholder="مثلاً بودجه را با چه ارزی وارد کنم؟" autoComplete="off" />
          <button className="primary" disabled={busy}>{busy ? 'در حال جست‌وجو…' : 'پیدا کردن راهنما'}</button>
        </form>
        <div className="answer-alternatives" aria-label="نمونهٔ پرسش">{['بودجه و ارز', 'قطع اینترنت و ادامه', 'اصلاح پاسخ'].map(text => <button className="text-button" key={text} onClick={() => void search(text)}>{text}</button>)}</div>
        {error && <p className="error" role="alert">{error}</p>}
        <div aria-live="polite" aria-busy={busy}>
          {busy && <p className="muted" role="status">متن راهنما را پیدا می‌کنیم…</p>}
          {result?.status === 'no_coverage' && <p className="notice">برای این پرسش در راهنمای فعلی متنی پیدا نشد. می‌توانی کوتاه‌تر بپرسی یا موضوع‌های پایین را بخوانی. این بخش فقط راهنمای استفاده از کوچ است.</p>}
          {result && result.results.length > 0 && <section className="knowledge-results" aria-label="نتیجه‌های راهنما"><h2>متن‌های مرتبط</h2>{result.results.map(item => <article className="knowledge-match" key={item.id}><h3>{item.title}</h3><p>{item.text}</p><a href={item.url}>منبع در راهنمای کوچ</a></article>)}<p className="muted">نسخهٔ راهنما: <bdi>{result.corpus_version.slice(0, 8)}</bdi></p></section>}
        </div>
      </section>
      <aside className="guidance"><h2>راهنمای فرم، با متن قابل پیگیری</h2><p>این بخش دربارهٔ ثبت و اصلاح پاسخ، مقدار و واحد و ادامهٔ فرم توضیح می‌دهد. هر نتیجه از یک متن مشخص در راهنمای کوچ آمده است.</p><p>شرایط مسیرهای مهاجرتی باید جداگانه با منبع رسمی بررسی شوند. متن این صفحه به معنی ارزیابی صلاحیت یا احتمال دریافت ویزا نیست.</p><p className="guidance-footer">پرسش این صفحه ذخیره نمی‌شود و به سرویس AI فرستاده نمی‌شود. راهنماهای موضوعی همیشه در همین صفحه در دسترس‌اند.</p></aside>
    </div>
    <section className="knowledge-library" aria-label="راهنماهای موضوعی"><h2>راهنماهای موضوعی</h2>{documents.map(doc => <details id={doc.id} key={doc.id}><summary>{doc.title}</summary><p>{doc.text}</p></details>)}</section>
    </main><footer>کوچ · راهنمای عمومی فرم · متن‌ها نسخه‌دار و قابل بازبینی‌اند.</footer>
  </div>;
}
