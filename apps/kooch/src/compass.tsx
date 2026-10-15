'use client';
import { useEffect, useRef, useState } from 'react';
import { answersSchema, emptyAnswers, normalizeDigits, type Answers } from './questions';
import type { CompassConfig, CompassResult } from './api';
import { Budget, Choices, Destinations } from './controls';
import { Evidence, Results } from './result';
import type { RetrievalStatus } from './retrieval';
import { accountRequest, invalidateAccountRequests, StaleAccountRequest } from './account/client';
import { consentVersion, type SavedCase } from './account/contract';

const storageKey = 'kooch.compass.guest.v1';
type View = 'form' | 'prerequisites' | 'result';
export function Compass() {
  const [config, setConfig] = useState<(CompassConfig & { retrieval?: RetrievalStatus }) | null>(null);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<View>('form');
  const [editingPrerequisites, setEditingPrerequisites] = useState(false);
  const [result, setResult] = useState<CompassResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [privateCase, setPrivateCase] = useState<SavedCase | null>(null);
  const [accountNotice, setAccountNotice] = useState('');
  const privateMode = useRef(false);
  const revision = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadConfig() {
    setError('');
    try {
      const response = await fetch('/api/config', { cache: 'no-store', credentials: 'omit' });
      const body = await response.json();
      if (!body.questions) throw new Error();
      setConfig(body);
    } catch { setError('داده‌ها دریافت نشدند. اتصال را بررسی کن و دوباره تلاش کن.'); }
  }
  useEffect(() => {
    void loadConfig();
    const resume = new URLSearchParams(window.location.search).get('resume') === '1';
    if (resume) {
      privateMode.current = true;
      void accountRequest('case').then(({ response, data }) => {
        const parsed = answersSchema.safeParse(data.case?.answers);
        if (!response.ok || !parsed.success) throw new Error(data.message ?? 'پرونده‌ای برای ادامه در دسترس نیست.');
        setAnswers(parsed.data); setStep(data.case.step); setPrivateCase(data.case);
        setAmount(parsed.data.budget?.amount.toString() ?? ''); setCurrency(parsed.data.budget?.currency ?? 'EUR');
        setAccountNotice('پاسخ‌های حساب دریافت شدند؛ تغییرات را با دکمهٔ ذخیره ثبت کن.'); setReady(true);
      }).catch(e => { if (!(e instanceof StaleAccountRequest)) setError(e.message); setReady(true); });
      return () => { abort.current?.abort(); };
    }
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved); const parsed = answersSchema.safeParse(draft.answers);
        if (draft.version === 1 && parsed.success) {
          setAnswers(parsed.data); setStep(Math.min(7, Math.max(0, Number.isInteger(draft.step) ? draft.step : 0)));
          setAmount(parsed.data.budget?.amount.toString() ?? ''); setCurrency(parsed.data.budget?.currency ?? 'EUR');
          setDraftNotice('پیش‌نویس همین نشست بازیابی شد؛ می‌توانی پاسخ‌ها را اصلاح کنی.');
        }
      }
    } catch { setDraftNotice('پیش‌نویس در این مرورگر قابل نگهداری نیست؛ فرم همچنان کار می‌کند.'); }
    setReady(true);
    return () => { abort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!ready || privateMode.current) return;
    try {
      if (step === 0 && JSON.stringify(answers) === JSON.stringify(emptyAnswers)) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, answers, step }));
    }
    catch { setDraftNotice('پیش‌نویس در این مرورگر قابل نگهداری نیست؛ فرم همچنان کار می‌کند.'); }
  }, [answers, step, ready]);
  useEffect(() => {
    const channel = new BroadcastChannel('kooch.account');
    channel.onmessage = () => {
      invalidateAccountRequests();
      if (!privateMode.current) return;
      revision.current++; abort.current?.abort(); setPrivateCase(null); setAnswers(emptyAnswers); setResult(null);
      setAmount(''); setStep(0); setView('form'); setAccountNotice('از حساب خارج شدی؛ پاسخ‌های خصوصی از این صفحه پاک شدند.');
    };
    return () => channel.close();
  }, []);
  useEffect(() => { heading.current?.focus(); if (view === 'result') document.getElementById('result-title')?.focus(); }, [step, view]);

  function update(next: Answers) {
    revision.current++; abort.current?.abort(); setBusy(false); setAnswers(next); setResult(null); setError('');
  }
  function clear() {
    revision.current++; abort.current?.abort(); setBusy(false); setAnswers(emptyAnswers); setStep(0); setView('form');
    setAmount(''); setCurrency('EUR'); setResult(null); setError(''); setDraftNotice('پاسخ‌های این نشست پاک شدند.');
    try { sessionStorage.removeItem(storageKey); } catch { /* optional browser storage */ }
  }
  async function savePrivateCase() {
    const input = currentAnswers(); if (!input || !privateCase || busy) return;
    const savingRevision = ++revision.current; setBusy(true); setError(''); setAccountNotice('');
    try {
      const { response, data } = await accountRequest(`case/${privateCase.id}`, {
        answers: input, step, expected_revision: privateCase.revision, request_id: crypto.randomUUID(), consent: consentVersion,
      });
      if (savingRevision !== revision.current) return;
      if (!response.ok) {
        if (response.status === 401) { setAnswers(emptyAnswers); setResult(null); setAmount(''); setPrivateCase(null); setStep(0); setView('form'); }
        throw new Error(data.message);
      }
      setAnswers(input); setPrivateCase(data.case); setAccountNotice('تغییرات در پرونده ذخیره شدند.');
    } catch (e) { if (savingRevision === revision.current && !(e instanceof StaleAccountRequest)) setError(e instanceof Error ? e.message : 'ذخیره انجام نشد؛ دوباره تلاش کن.'); }
    finally { if (savingRevision === revision.current) setBusy(false); }
  }
  function currentAnswers(): Answers | null {
    if (view !== 'form' || config?.questions[step]?.id !== 'budget') return answers;
    if (!amount.trim()) return { ...answers, budget: null };
    const normalized = normalizeDigits(amount).replace(/[,٬]/g, '').replace('٫', '.');
    const parsed = answersSchema.safeParse({ ...answers, budget: { amount: Number(normalized), currency } });
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalized) || !parsed.success) { setError('مقدار بودجه باید عدد صفر یا بیشتر و بدون واحد نوشتاری باشد.'); return null; }
    return parsed.data;
  }
  async function run(mode: 'prerequisites' | 'edit-prerequisites' | 'result', input: Answers | null = currentAnswers()) {
    if (!input) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const requestRevision = ++revision.current; setBusy(true); setError(''); setAnswers(input);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/compass', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (requestRevision !== revision.current) return;
      if (!response.ok) { setError(body.message ?? 'دریافت نتیجه ناموفق بود.'); return; }
      setEditingPrerequisites(mode === 'edit-prerequisites');
      const questionSet = mode === 'edit-prerequisites' ? body.editable_questions : body.questions;
      setResult(body); setView(mode !== 'result' && questionSet.length ? 'prerequisites' : 'result');
    } catch { if (requestRevision === revision.current) setError('دریافت نتیجه ناموفق بود. پاسخ‌هایت حفظ شده‌اند؛ دوباره تلاش کن.'); }
    finally { clearTimeout(timeout); if (requestRevision === revision.current) setBusy(false); }
  }
  function next() {
    const input = currentAnswers(); if (!input) return; update(input);
    if (step < 7) setStep(step + 1); else void run('prerequisites', input);
  }
  const question = config?.questions[step];
  const evidence = config && !('error' in config.data) ? config.data : null;
  const prerequisiteQuestions = (editingPrerequisites ? result?.editable_questions : result?.questions) ?? [];
  const stage = view === 'form' ? 0 : view === 'prerequisites' ? 1 : 2;
  return <div className="app-shell">
    <a className="skip-link" href="#main">رفتن به محتوا</a>
    <header><a className="brand" href="/" aria-label="کوچ، خانهٔ قطب‌نما"><strong>کوچ</strong><span>قطب‌نمای مهاجرت</span></a>
      <ol className="progress" aria-label="مراحل قطب‌نما">{['اطلاعات پایه', 'مسیرهای مرتبط', 'نتیجه'].map((label, index) => <li key={label} aria-current={index === stage ? 'step' : undefined} className={index <= stage ? 'active' : ''}><span className="dot" />{label}</li>)}</ol>
      <div className="header-actions"><a href="/account">حساب من</a><button className="text-button clear" onClick={clear}>{privateMode.current ? 'پاک‌کردن فرم جاری' : 'پاک‌کردن پاسخ‌ها'}</button></div></header>
    <main id="main">
      {privateMode.current && <section className="case-toolbar"><p>{privateCase ? `پروندهٔ ذخیره‌شده · نسخهٔ ${privateCase.revision.toLocaleString('fa-IR')} · پاک‌شدن پس از بی‌فعالیتی: ${new Date(privateCase.delete_after).toLocaleDateString('fa-IR')}` : 'برای دریافت یا ادامهٔ پرونده به حساب من برو.'}</p>{privateCase && <button className="primary" disabled={busy} onClick={() => void savePrivateCase()}>ذخیرهٔ تغییرات پرونده</button>}</section>}
      {accountNotice && <p className="notice" role="status">{accountNotice}</p>}
      {view === 'result' && result ? <Results result={result} busy={busy} retrieval={config?.retrieval} editPrerequisites={() => void run('edit-prerequisites')} edit={() => { setResult(null); setStep(0); setView('form'); }} /> : <div className="workspace">
        <section className="question-panel" aria-busy={busy}>
          <h1>{view === 'form' ? 'از کجا شروع کنیم؟' : 'یک قدم به مسیرهای مرتبط نزدیک‌تر'}</h1>
          <p className="intro">{view === 'form' ? 'چند پاسخ کوتاه، چند مسیر برای بررسی.' : 'فقط پیش‌نیازهایی که به هدف و مقصدت مربوط‌اند.'}</p>
          {!ready || (!config && !error) ? <p role="status">در حال آماده‌سازی…</p> : view === 'form' && question ? <form onSubmit={e => { e.preventDefault(); next(); }}>
            <p className="step-count">سؤال {(step + 1).toLocaleString('fa-IR')} از ۸ اطلاعات پایه</p>
            <fieldset><legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{question.title}</legend><p className="help">{question.help}</p>
              {question.id === 'budget' ? <><Budget amount={amount} currency={currency} changeAmount={value => { setAmount(value); update({ ...answers, budget: null }); }} changeCurrency={value => { setCurrency(value); update({ ...answers, budget: null }); }} /><button type="button" className="text-button" onClick={() => { setAmount(''); update({ ...answers, budget: null }); }}>نمی‌دانم / بدون بودجهٔ مشخص</button></> : question.id === 'destinations' ? <Destinations countries={config!.countries} value={answers.destinations} onChange={destinations => update({ ...answers, destinations })} /> : <Choices name={question.id} options={question.options} value={String(answers[question.id as keyof Answers])} onChange={value => update({ ...answers, [question.id]: value })} />}
            </fieldset>
            <div className="actions"><button className="primary" disabled={busy} type="submit">{busy ? 'در حال بررسی…' : step === 7 ? 'بررسی پیش‌نیازها' : 'ادامه'}</button><button type="button" className="text-button" disabled={busy} onClick={() => void run('result')}>دیدن نتیجه با همین پاسخ‌ها</button></div>
            {step > 0 && <button type="button" className="back text-button" disabled={busy} onClick={() => { const input = currentAnswers(); if (input) { update(input); setStep(step - 1); } }}>→ سؤال قبلی</button>}
          </form> : view === 'prerequisites' ? <div>
            <h2 ref={heading} tabIndex={-1}>پیش‌نیازهای مسیر</h2><p className="help">پاسخ «بله» فقط خوداظهاری است؛ باقی شروط مسیر هنوز بررسی نشده‌اند.</p>
            {prerequisiteQuestions.map(q => <fieldset key={q.id} className="conditional"><legend>{q.title}</legend><Choices name={q.id} options={[{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }, { value: 'unknown', label: 'نمی‌دانم' }]} value={answers.facts[q.id] ?? 'unknown'} onChange={value => {
              // Keep the question set visible while editing; a fresh API result replaces it on submit.
              revision.current++; abort.current?.abort(); setBusy(false); setError('');
              setAnswers({ ...answers, facts: { ...answers.facts, [q.id]: value as 'yes' | 'no' | 'unknown' } });
            }} /></fieldset>)}
            <div className="actions"><button className="primary" disabled={busy} onClick={() => void run('result')}>{busy ? 'در حال بررسی…' : 'دیدن مسیرهای قابل بررسی'}</button><button className="text-button" onClick={() => { setResult(null); setView('form'); }}>برگشت به پاسخ‌ها</button></div>
          </div> : null}
          {config && 'error' in config.data && <p className="error" role="status">{config.data.message}</p>}
          <p className="privacy-note">{privateMode.current ? 'تغییرات تا زدن دکمهٔ ذخیره فقط در حافظهٔ همین صفحه می‌مانند.' : 'پاسخ‌ها فقط در همین نشست مرورگر می‌مانند.'}</p>
          {draftNotice && <p className="draft-notice" role="status">{draftNotice}</p>}
        </section>
        <aside className="guidance"><h2>مسیر تو، با اطلاعات خودت</h2><p>به چند سؤال ساده دربارهٔ شرایط و هدفت پاسخ بده تا مسیرهای مرتبط را برای بررسی پیدا کنی.</p><p>اگر پاسخ بعضی سؤال‌ها را نمی‌دانی، «نمی‌دانم» را انتخاب کن. موارد نامعلوم در نتیجه آشکار می‌مانند.</p><p>این ابزار برای دارندهٔ گذرنامهٔ ایرانی ساکن ایران است. شروع آنلاین ممکن است همچنان به سفر برای بیومتریک نیاز داشته باشد.</p><p>{privateMode.current ? 'پروندهٔ حساب را ادامه می‌دهی. تغییرات فقط با دکمهٔ ذخیره در حساب ثبت می‌شوند؛ مدیریت و حذف پرونده در حساب من است.' : 'به‌صورت مهمان ادامه می‌دهی. پاسخ‌ها در سرور ذخیره نمی‌شوند و هر زمان می‌توانی پیش‌نویس را پاک کنی.'}</p><p className="guidance-footer">این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></aside>
      </div>}
      {view === 'result' && !privateMode.current && <section className="save-invitation"><h2>این مسیر را بعداً ادامه بده</h2><p>با حساب کوچ می‌توانی پاسخ‌ها را با اجازهٔ خودت ذخیره و بعداً ادامه بدهی.</p><a className="primary" href="/account">ذخیرهٔ پاسخ‌ها و ادامه در حساب</a></section>}
      {error && <div className="error" role="alert"><p>{error}</p>{!config && <button className="secondary" onClick={() => void loadConfig()}>تلاش دوباره</button>}</div>}
      {view !== 'result' && evidence && <Evidence result={evidence} retrieval={config?.retrieval} />}
    </main><footer>کوچ · هر مسیر، با منبع و محدودهٔ روشن</footer>
  </div>;
}
