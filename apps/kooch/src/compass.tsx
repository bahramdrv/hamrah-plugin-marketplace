'use client';
import { useEffect, useRef, useState } from 'react';
import { answersSchema, emptyAnswers, normalizeDigits, type Answers } from './questions';
import type { CompassConfig, CompassResult } from './api';
import { compassRequest } from './compass-transport';
import { Budget, Choices, Destinations } from './controls';
import { Evidence, Results } from './result';
import type { RetrievalStatus } from './retrieval';
import { accountRequest, invalidateAccountRequests, StaleAccountRequest } from './account/client';
import { consentVersion, type SavedCase } from './account/contract';
import { AppFooter, AppHeader, CompassGuidance } from './shell';
import type { InterviewQuestion } from './journey';
import { CatalogBrowser } from './catalog-browser';

const storageKey = 'kooch.compass.guest.v1';
type View = 'form' | 'prerequisites' | 'result';
export function Compass() {
  const [config, setConfig] = useState<(CompassConfig & { retrieval?: RetrievalStatus }) | null>(null);
  const [answers, setAnswers] = useState<Answers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [plan, setPlan] = useState<CompassResult['interview'] | null>(null);
  const planned = useRef(false);
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
  const [undo, setUndo] = useState<{ answers: Answers; step: number; view: View; result: CompassResult | null; amount: string; currency: string; editingPrerequisites: boolean; question: InterviewQuestion | null; plan: CompassResult['interview'] | null } | null>(null);
  const privateMode = useRef(false);
  const revision = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadConfig() {
    setError('');
    try {
      const response = await compassRequest('/api/config', { cache: 'no-store' }, { origin: window.location.origin });
      const body = await response.json();
      if (!body.questions) throw new Error();
      setConfig(body);
      if (body.data.interview) { setQuestion(body.data.interview.next_question); setPlan(body.data.interview); }
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
      } else {
        const goal = new URLSearchParams(window.location.search).get('goal');
        if (goal && ['work', 'study', 'family', 'business', 'investment'].includes(goal)) setAnswers({ ...emptyAnswers, goal, answered: ['goal'] });
      }
    } catch { setDraftNotice('پیش‌نویس در این مرورگر قابل نگهداری نیست؛ فرم همچنان کار می‌کند.'); }
    setReady(true);
    return () => { abort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!ready || !config || planned.current) return;
    planned.current = true;
    if (JSON.stringify(answers) !== JSON.stringify(emptyAnswers)) void run('interview', answers);
  }, [ready, config]);
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
      revision.current++; abort.current?.abort(); setPrivateCase(null); setAnswers(emptyAnswers); setResult(null); setUndo(null);
      setAmount(''); setStep(0); setQuestion(null); setPlan(null); setView('form'); setAccountNotice('از حساب خارج شدی؛ پاسخ‌های خصوصی از این صفحه پاک شدند.');
    };
    return () => channel.close();
  }, []);
  useEffect(() => { heading.current?.focus(); if (view === 'result') document.getElementById('result-title')?.focus(); }, [question?.id, view]);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 12000); return () => clearTimeout(timer); }, [undo]);

  function update(next: Answers) {
    revision.current++; abort.current?.abort(); setBusy(false); setAnswers(next); setResult(null); setError('');
  }
  function clear() {
    setUndo({ answers, step, view, result, amount, currency, editingPrerequisites, question, plan });
    revision.current++; abort.current?.abort(); setBusy(false); setAnswers(emptyAnswers); setStep(0); setView('form');
    setAmount(''); setCurrency('EUR'); setResult(null); setQuestion(config && !('error' in config.data) ? config.data.interview.next_question : null); setPlan(null); setError(''); setDraftNotice('پاسخ‌های این نشست پاک شدند.');
    try { sessionStorage.removeItem(storageKey); } catch { /* optional browser storage */ }
  }
  function restore() {
    if (!undo) return;
    revision.current++; abort.current?.abort(); setBusy(false); setError('');
    setAnswers(undo.answers); setStep(undo.step); setView(undo.view); setResult(undo.result);
    setAmount(undo.amount); setCurrency(undo.currency); setEditingPrerequisites(undo.editingPrerequisites);
    setQuestion(undo.question); setPlan(undo.plan);
    setUndo(null); setDraftNotice('پاسخ‌ها بازگردانده شدند.');
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
        if (response.status === 401) { setAnswers(emptyAnswers); setResult(null); setAmount(''); setPrivateCase(null); setUndo(null); setStep(0); setView('form'); }
        throw new Error(data.message);
      }
      setAnswers(input); setPrivateCase(data.case); setAccountNotice('تغییرات در پرونده ذخیره شدند.');
    } catch (e) { if (savingRevision === revision.current && !(e instanceof StaleAccountRequest)) setError(e instanceof Error ? e.message : 'ذخیره انجام نشد؛ دوباره تلاش کن.'); }
    finally { if (savingRevision === revision.current) setBusy(false); }
  }
  function currentAnswers(): Answers | null {
    if (view !== 'form' || question?.id !== 'budget') return answers;
    if (!amount.trim()) return { ...answers, budget: null };
    const normalized = normalizeDigits(amount).replace(/[,٬]/g, '').replace('٫', '.');
    const parsed = answersSchema.safeParse({ ...answers, budget: { amount: Number(normalized), currency } });
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalized) || !parsed.success) { setError('مقدار بودجه باید عدد صفر یا بیشتر و بدون واحد نوشتاری باشد.'); return null; }
    return parsed.data;
  }
  async function run(mode: 'interview' | 'edit-prerequisites' | 'result', input: Answers | null = currentAnswers()) {
    if (!input) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const requestRevision = ++revision.current; setBusy(true); setError(''); setAnswers(input);
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await compassRequest('/api/compass', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), cache: 'no-store', signal: controller.signal }, { origin: window.location.origin });
      const body = await response.json();
      if (requestRevision !== revision.current) return;
      if (!response.ok) { setError(body.message ?? 'دریافت نتیجه ناموفق بود.'); return; }
      setEditingPrerequisites(mode === 'edit-prerequisites');
      setResult(body); setPlan(body.interview);
      const nextQuestion = body.interview.next_question;
      setQuestion(nextQuestion);
      if (nextQuestion) setStep(Math.max(0, config?.questions.findIndex(q => q.id === nextQuestion.id) ?? 0));
      setView(mode === 'edit-prerequisites' ? 'prerequisites' : mode === 'interview' && nextQuestion ? 'form' : 'result');
    } catch { if (requestRevision === revision.current) setError('دریافت نتیجه ناموفق بود. پاسخ‌هایت حفظ شده‌اند؛ دوباره تلاش کن.'); }
    finally { clearTimeout(timeout); if (requestRevision === revision.current) setBusy(false); }
  }
  function next() {
    const input = currentAnswers(); if (!input || !question) return;
    const submitted = question.kind === 'fact' ? { ...input, facts: { ...input.facts, [question.id]: input.facts[question.id] ?? 'unknown' as const }, fact_versions: { ...input.fact_versions, ...(question.answer_version ? { [question.id]: question.answer_version } : {}) } } :
      { ...input, answered: [...new Set([...input.answered, question.id as Answers['answered'][number]])] };
    void run('interview', submitted);
  }
  const evidence = config && !('error' in config.data) ? config.data : null;
  const reviewQuestions = plan?.questions ?? [];
  const stage = view === 'result' ? 2 : question?.kind === 'fact' || view === 'prerequisites' ? 1 : 0;
  function editQuestion(q: InterviewQuestion) {
    setQuestion(q); setView('form'); setError('');
    setStep(Math.max(0, config?.questions.findIndex(item => item.id === q.id) ?? 0));
    if (q.id === 'budget') { setAmount(answers.budget?.amount.toString() ?? ''); setCurrency(answers.budget?.currency ?? 'EUR'); }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">رفتن به محتوا</a>
    <AppHeader current="compass"/>
    <main id="main">
      <div className="compass-toolbar"><ol className="progress" aria-label="مراحل بررسی">{['شرایط تو', 'پیش‌نیازهای مرتبط', 'مسیرها و قدم بعدی'].map((label, index) => <li key={label} aria-current={index === stage ? 'step' : undefined} className={index <= stage ? 'active' : ''}><span className="dot" />{label}</li>)}</ol><button className="text-button clear" onClick={clear}>{privateMode.current ? 'پاک‌کردن فرم جاری' : 'پاک‌کردن پاسخ‌ها'}</button></div>
      {undo && <div className="undo-notice" role="status"><span>پاسخ‌های فرم پاک شدند.</span><button className="text-button" onClick={restore}>بازگردانی</button><button className="text-button" onClick={() => setUndo(null)}>بستن</button></div>}
      {privateMode.current && <section className="case-toolbar"><details><summary>اطلاعات پرونده</summary><p>{privateCase ? `نسخهٔ ${privateCase.revision.toLocaleString('fa-IR')} · پاک‌شدن پس از بی‌فعالیتی: ${new Date(privateCase.delete_after).toLocaleDateString('fa-IR')}` : 'برای دریافت یا ادامهٔ پرونده به حساب برو.'}</p><p>تغییرات فقط با دکمهٔ ذخیره در حساب ثبت می‌شوند.</p></details>{privateCase && <button className="primary" disabled={busy} onClick={() => void savePrivateCase()}>ذخیرهٔ تغییرات پرونده</button>}</section>}
      {accountNotice && <p className="notice" role="status">{accountNotice}</p>}
      {view === 'result' && result ? <Results result={result} busy={busy} retrieval={config?.retrieval} editPrerequisites={() => void run('edit-prerequisites')} edit={() => setView('prerequisites')} focusRoute={id => { const route = result.routes.find(route => route.id === id); if (route) void run('interview', { ...answers, focus_route: id, destinations: [route.destination] }); }} /> : <div className="workspace">
        <section className="question-panel" aria-busy={busy}>
          <h1>{view === 'form' ? 'قدم بعدی مهاجرتت را روشن کن.' : 'یک قدم به مسیرهای مرتبط نزدیک‌تر'}</h1>
          <p className="intro">{view === 'form' ? 'چند پاسخ کوتاه، چند مسیر برای بررسی.' : 'فقط پیش‌نیازهایی که به هدف و مقصدت مربوط‌اند.'}</p>
          {!ready || (!config && !error) ? <p role="status">در حال آماده‌سازی…</p> : view === 'form' && question ? <form onSubmit={e => { e.preventDefault(); next(); }}>
            <p className="step-count">{plan?.answered_ids.length ? `${plan.answered_ids.length.toLocaleString('fa-IR')} پاسخ ثبت‌شده` : 'از همین‌جا شروع کنیم'}</p>
            <fieldset disabled={busy}><legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{question.title}</legend><details className="question-help"><summary>چرا این سؤال؟</summary><p className="help">{question.help}</p></details>
              {question.id === 'budget' ? <><Budget amount={amount} currency={currency} changeAmount={value => { setAmount(value); update({ ...answers, budget: null }); }} changeCurrency={value => { setCurrency(value); update({ ...answers, budget: null }); }} /><button type="button" className="text-button" onClick={() => { setAmount(''); update({ ...answers, budget: null }); }}>نمی‌دانم / بدون بودجهٔ مشخص</button></> : question.id === 'destinations' ? <Destinations countries={config!.countries} value={answers.destinations} onChange={destinations => update({ ...answers, destinations })} /> : <Choices name={question.id} options={question.options} value={question.kind === 'fact' ? answers.facts[question.id] ?? 'unknown' : String(answers[question.id as keyof Answers])} onChange={value => update(question.kind === 'fact' ? { ...answers, facts: { ...answers.facts, [question.id]: value as 'yes' | 'no' | 'unknown' } } : { ...answers, [question.id]: value })} />}
            </fieldset>
            <div className="actions"><button className="primary" disabled={busy} type="submit">{busy ? 'در حال بررسی…' : 'ثبت پاسخ و ادامه'}</button><button type="button" className="text-button" disabled={busy} onClick={() => void run('result')}>دیدن خلاصه با همین پاسخ‌ها</button></div>
            {plan && plan.question_order.indexOf(question.id) > 0 && <button type="button" className="back text-button" disabled={busy} onClick={() => { const input = currentAnswers(); const previous = plan.questions[plan.question_order.indexOf(question.id) - 1]; if (input && previous) { update(input); editQuestion(previous); } }}>→ سؤال قبلی</button>}
          </form> : view === 'prerequisites' ? <div>
            <h2 ref={heading} tabIndex={-1}>مرور پاسخ‌های تو</h2><dl className="answer-review">{reviewQuestions.map(q => <div key={q.id}><dt>{q.title}</dt><dd><span>{q.kind === 'fact' ? ({ yes: 'بله', no: 'خیر', unknown: 'نمی‌دانم' }[answers.facts[q.id] ?? 'unknown']) : q.id === 'budget' ? answers.budget ? `${answers.budget.amount.toLocaleString('fa-IR')} ${answers.budget.currency}` : 'نامعلوم' : q.id === 'destinations' ? answers.destinations.map(c => config?.countries[c]?.name ?? c).join('، ') || 'بدون ترجیح' : q.options.find(o => o.value === answers[q.id as keyof Answers])?.label ?? 'نامعلوم'}</span><button className="text-button" disabled={busy} onClick={() => editQuestion(q)}>اصلاح<span className="sr-only"> {q.title}</span></button></dd></div>)}</dl>
            <div className="actions"><button className="primary" disabled={busy} onClick={() => void run('result')}>{busy ? 'در حال بررسی…' : 'دیدن خلاصه و قدم بعدی'}</button><button className="text-button" disabled={busy} onClick={() => { if (plan?.next_question) editQuestion(plan.next_question); else if (reviewQuestions[0]) editQuestion(reviewQuestions[0]); }}>ادامهٔ سؤال‌ها</button></div>
          </div> : null}
          {config && 'error' in config.data && <p className="error" role="status">{config.data.message}</p>}
          <details className="context-details"><summary>{privateMode.current ? 'ذخیرهٔ تغییرات' : 'ادامهٔ بررسی در دفعات بعد'}</summary><p>{privateMode.current ? 'تغییرات تا زدن دکمهٔ ذخیره فقط در حافظهٔ همین صفحه می‌مانند.' : 'بدون حساب شروع کرده‌ای؛ پاسخ‌ها فقط در همین نشست مرورگر می‌مانند. برای ادامه در دفعات بعد می‌توانی پس از دیدن مسیرها، آن‌ها را در حساب ذخیره کنی.'}</p></details>
          {draftNotice && <p className="draft-notice" role="status">{draftNotice}</p>}
        </section>
        <CompassGuidance/>
      </div>}
      {view === 'result' && !privateMode.current && <section className="save-invitation"><h2>خلاصه‌ات را نگه دار و ادامه بده</h2><p>{result?.guidance.report_kind === 'route_modules' ? 'خلاصهٔ مسیرها و بررسی تکمیلی تحصیل بریتانیا یا کانادا در حساب در دسترس است.' : 'خلاصهٔ همین مسیرها و قدم‌های آماده‌سازی در کارنامه ذخیره می‌شود؛ ارزیابی کامل شرایط این مسیرها هنوز پوشش داده نشده است.'}</p><a className="primary" href="/account?next=report">ذخیرهٔ پاسخ‌ها و دیدن کارنامه</a></section>}
      {error && <div className="error" role="alert"><p>{error}</p>{!config && <button className="secondary" onClick={() => void loadConfig()}>تلاش دوباره</button>}</div>}
      {config && <CatalogBrowser countries={config.countries} choose={item => { const next = answersSchema.parse({ ...answers, goal: item.policy_goal, destinations: [item.destination], focus_route: item.id, answered: [...new Set([...answers.answered, 'goal', 'destinations'])] }); update(next); void run('interview', next); document.getElementById('main')?.scrollIntoView({ block: 'start' }); }}/>}
      {view !== 'result' && evidence && <Evidence result={evidence} retrieval={config?.retrieval} />}
    </main><AppFooter/>
  </div>;
}
