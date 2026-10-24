'use client';
import { useEffect, useRef, useState } from 'react';
import { accountRequest, invalidateAccountRequests, StaleAccountRequest } from '../account/client';
import { normalizeDigits } from '../questions';
import { Budget, Choices } from '../controls';
import type { InterpretationInput } from './interpretation';
import { answerSchema, type FormAnswer, type FormInput } from './contract';
import type { AssistedFormView as FormView } from '../ai/question-assistance';
import { AppFooter, AppHeader, ReportCoverage } from '../shell';

type Entry = FormView['answers'][number];
function assistanceNotice(status: FormView['question_assistance']['status']) {
  if (status === 'worded') return 'بیان این سؤال با کمک هوشمند انتخاب شده؛ گزینه‌ها و قواعد فرم ثابت‌اند.';
  if (status === 'budget_exhausted') return 'سهم فعلی کمک هوشمند تمام شده؛ سؤال‌های ثابت فرم همچنان ادامه دارند.';
  if (status === 'cooldown') return 'کمک هوشمند کمی بعد دوباره در دسترس قرار می‌گیرد؛ اکنون سؤال ثابت را ادامه بده.';
  return 'این سؤال با متن ثابت فرم ادامه دارد؛ کمک هوشمند در این مرحله اعمال نشده است.';
}
function answerLabel(entry: Entry): string {
  if (entry.answer.state === 'unknown') return 'نمی‌دانم';
  if (entry.answer.state === 'declined') return 'ترجیح می‌دهم پاسخ ندهم';
  const value = entry.answer.value;
  if (typeof value === 'object') return `${value.amount.toLocaleString('fa-IR')} ${value.currency}`;
  if (typeof value === 'number') return `${value.toLocaleString('fa-IR')}${entry.question.unit === 'years' ? ' سال' : ''}`;
  return entry.question.options.find(o => o.value === value)?.label ?? value;
}
export function DeepForm() {
  const [form, setForm] = useState<FormView | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [summary, setSummary] = useState(false);
  const [value, setValue] = useState(''); const [currency, setCurrency] = useState('EUR');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [unavailable, setUnavailable] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [draftText, setDraftText] = useState('');
  const interpretationRetry = useRef<{ key: string; input: InterpretationInput } | null>(null);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false); const generation = useRef(0);
  const retry = useRef<{ key: string; input: FormInput } | null>(null);
  const heading = useRef<HTMLLegendElement>(null);
  const question = form?.questions.find(q => q.id === editing) ?? form?.next_question;
  const entry = form?.answers.find(r => r.question.id === question?.id);

  async function load() {
    if (lock.current) return;
    const started = ++generation.current; lock.current = true; setBusy(true); setError('');
    try {
      const { response, data } = await accountRequest('form');
      if (started !== generation.current) return;
      if (!response.ok) { if ([401, 404].includes(response.status)) { setForm(null); setUnavailable(true); } setError(data.message); return; }
      setForm(data as FormView); setUnavailable(false); setConflict(false); setEditing(data.draft?.question_id ?? null); retry.current = null;
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('دریافت پاسخ‌های ذخیره‌شده ممکن نشد؛ دوباره تلاش کن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  useEffect(() => {
    void load();
    const channel = new BroadcastChannel('kooch.account');
    channel.onmessage = () => {
      invalidateAccountRequests(); generation.current++; lock.current = false; retry.current = null;
      setForm(null); setValue(''); setCurrency('EUR'); setDraftText(''); setExplaining(false); interpretationRetry.current = null; setEditing(null); setBusy(false); setUnavailable(true);
      setError('از حساب خارج شدی؛ برای ادامه دوباره وارد شو.');
    };
    return () => { generation.current++; lock.current = false; channel.close(); };
  }, []);
  useEffect(() => {
    const draft = form?.draft?.question_id === question?.id ? form?.draft : null;
    setDraftText(draft?.text ?? ''); setExplaining(Boolean(draft));
    const answer = draft?.answer ?? entry?.answer;
    if (answer?.state === 'known') {
      setValue(typeof answer.value === 'object' ? String(answer.value.amount) : String(answer.value));
      setCurrency(typeof answer.value === 'object' ? answer.value.currency : 'EUR');
    } else { setValue(''); setCurrency('EUR'); }
    heading.current?.focus();
  }, [question?.id, form?.revision, summary]);

  async function save(state: FormAnswer['state']) {
    if (!form || !question || lock.current || conflict) return;
    let answer: FormAnswer;
    if (state !== 'known') answer = { state };
    else if (question.input === 'choice') {
      if (!value) { setError('یکی از گزینه‌ها را انتخاب کن.'); return; }
      answer = { state, value };
    } else if (question.input === 'date') {
      answer = { state, value: normalizeDigits(value.trim()) };
    } else {
      const normalized = normalizeDigits(value).replace(/[,٬]/g, '').replace('٫', '.');
      const amount = Number(normalized);
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(normalized) || !Number.isFinite(amount)) { setError('مقدار را با عدد وارد کن؛ می‌توانی «نمی‌دانم» را انتخاب کنی.'); return; }
      const parsed = answerSchema.safeParse(question.input === 'money' ? { state, value: { amount, currency } } : { state, value: amount });
      if (!parsed.success) { setError('مقدار یا ارز معتبر نیست؛ پاسخ را بررسی کن.'); return; }
      answer = parsed.data;
    }
    if (explaining && form.draft?.question_id === question.id && form.draft.status === 'proposed') {
      await interpretationAction({ action: 'confirm', question_id: question.id, question_version: question.version, expected_revision: form.revision, request_id: crypto.randomUUID(), draft_id: form.draft.id, answer, confirm_conflict: entry?.review_reason === 'compass_conflict' }); return;
    }
    const payload = { expected_revision: form.revision, question_id: question.id, question_version: question.version, answer,
      confirm_conflict: entry?.review_reason === 'compass_conflict' };
    const key = JSON.stringify(payload);
    const input = retry.current?.key === key ? retry.current.input : { ...payload, request_id: crypto.randomUUID() };
    retry.current = { key, input };
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const started = ++generation.current;
    try {
      const { response, data } = await accountRequest('form', input);
      if (started !== generation.current) return;
      if (!response.ok) {
        if (response.status === 401) { setForm(null); setValue(''); setUnavailable(true); }
        if (response.status === 409) setConflict(true);
        setError(data.message); return;
      }
      setForm(data as FormView); setEditing(null); retry.current = null;
      setNotice('پاسخ در پرونده ذخیره شد.');
    } catch (e) { if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ پاسخ هنوز در این صفحه است. برای اطمینان از ثبت، دوباره دکمه را بزن.'); }
    finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  async function interpretationAction(payload: InterpretationInput) {
    if (!form || !question || lock.current || conflict) return;
    const key = JSON.stringify({ ...payload, request_id: undefined });
    const input = interpretationRetry.current?.key === key ? interpretationRetry.current.input : payload;
    interpretationRetry.current = { key, input };
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const started = ++generation.current;
    try {
      const { response, data } = await accountRequest('interpretation', input);
      if (started !== generation.current) return;
      if (!response.ok) {
        if (response.status === 401) { setForm(null); setDraftText(''); setValue(''); setUnavailable(true); }
        if (response.status === 409) setConflict(true);
        setError(data.message); return;
      }
      setForm({ ...data, question_assistance: form.question_assistance } as FormView);
      setEditing(data.draft?.question_id ?? null); interpretationRetry.current = null;
      setNotice(input.action === 'confirm' ? 'پاسخ تأییدشدهٔ خوداظهاری ثبت شد.' : input.action === 'reject' ? 'پیش‌نویس و برداشت حذف شدند.' : 'متن ذخیره شد؛ برداشت تا تأیید تو روی نتیجه اثر ندارد.');
    } catch (e) {
      if (started === generation.current && !(e instanceof StaleAccountRequest)) setError('ارتباط قطع شد؛ متن اینجا حفظ شده است. همان دکمه را برای دریافت وضعیت بزن؛ تولید خودکار تکرار نمی‌شود.');
    } finally { if (started === generation.current) { lock.current = false; setBusy(false); } }
  }
  const draft = form?.draft?.question_id === question?.id ? form?.draft : null;
  return <div className="app-shell">
    <a className="skip-link" href="#deep-form">رفتن به محتوا</a>
    <AppHeader current="form"/>
    <main id="deep-form"><div className="workspace">
      <section className="question-panel" aria-busy={busy}>
        <h1>{summary ? 'مرور پاسخ‌های من' : 'پاسخ‌های من'}</h1>
        <p className="intro">{summary ? 'پاسخ‌های تأییدشدهٔ خودت و آنچه هنوز نمی‌دانیم.' : 'هر بار یک سؤال؛ می‌توانی هر زمان توقف یا اصلاح کنی.'}</p>
        {busy && <p role="status" className="draft-notice">در حال {form ? 'ذخیرهٔ پاسخ…' : 'دریافت پرونده…'}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {(!form && !busy && !unavailable || conflict) && <button className="secondary" onClick={() => void load()}>دریافت نسخهٔ تازه</button>}
        {unavailable && <section className="empty-state"><h2>بررسی‌ات را از حساب ادامه بده.</h2><p>برای تکمیل پاسخ‌ها، ابتدا وارد شو و پاسخ‌های بررسی اولیه را در حساب ذخیره کن.</p><a className="primary" href="/account?next=form">ورود و ادامهٔ بررسی</a><a className="text-button" href="/">شروع بدون حساب</a></section>}
        {form && <>
          <details className="context-details form-metadata"><summary>اطلاعات پرونده و کمک هوشمند</summary>
          <p className="help">{assistanceNotice(form.question_assistance?.status)}</p>
          {form.question_assistance?.daily_request_limit !== undefined && <p className="help">حداکثر {form.question_assistance.daily_request_limit.toLocaleString('fa-IR')} بار کمک هوشمند در روز؛ سهم مشترک ممکن است زودتر تمام شود. ثبت پاسخ و ادامهٔ فرم به این سهم وابسته نیست.</p>}
          <p className="draft-notice">نسخهٔ ذخیره‌شده: {form.revision.toLocaleString('fa-IR')} · پاک‌شدن پس از بی‌فعالیتی: {new Date(form.delete_after).toLocaleDateString('fa-IR')}</p>
          </details>
          {!summary && question ? <form onSubmit={e => { e.preventDefault(); void save('known'); }}>
            <fieldset disabled={busy || conflict}>
              <legend ref={heading} tabIndex={-1}>{question.title}</legend>
              <details className="question-help"><summary>چرا این سؤال؟</summary><p className="help">{question.help}</p></details>
              {entry?.needs_review && <p className="notice">{entry.review_reason === 'compass_conflict' ? 'مقدار دقیق با پاسخ قطب‌نما متفاوت است. آن را اصلاح کن یا مقدار دقیق را تأیید کن تا پاسخ قبلی هم اصلاح شود.' : 'یکی از پاسخ‌های مرتبط تغییر کرده است؛ این پاسخ را دوباره بررسی و ثبت کن.'}</p>}
              {question.route_id && <p className="help">اطلاعات تکمیلی برای بررسی همین مسیر در کارنامه</p>}
              {question.input === 'choice' ? <Choices name={question.id} options={question.options} value={value} onChange={setValue} /> : question.input === 'money' ? <Budget amount={value} currency={currency} changeAmount={setValue} changeCurrency={setCurrency} /> : question.input === 'date' ? <label className="number-answer">تاریخ میلادی<input type="date" dir="ltr" value={value} onChange={e => setValue(e.target.value)} /></label> : <label className="number-answer">{({ years: 'سال کامل', months: 'ماه کامل', days: 'روز متوالی', people: 'تعداد نفر', GBP: 'مقدار به پوند' } as Record<string, string>)[question.unit ?? ''] ?? `نمرهٔ کل (${question.unit})`}<input autoComplete="off" inputMode={question.integer ? 'numeric' : 'decimal'} value={value} onChange={e => setValue(e.target.value)} aria-describedby="number-help" /><span id="number-help" className="help">از {question.min?.toLocaleString('fa-IR')} تا {question.max?.toLocaleString('fa-IR')}{question.integer ? '، بدون اعشار' : ''}</span></label>}
              {(form.interpretation_disclosure || draft) && <button type="button" className="text-button" onClick={() => { setExplaining(!explaining); setError(''); }}>{explaining ? 'ورود پاسخ ساختارمند' : 'توضیح می‌دهم'}</button>}
              {explaining && <section aria-label="پاسخ نوشتنی" className="form-summary">
                <label htmlFor="answer-text">توضیح همین پاسخ (حداکثر ۲۰۰۰ نویسه)</label>
                <textarea id="answer-text" rows={4} maxLength={2000} value={draftText} onChange={e => setDraftText(e.target.value)} style={{ width: '100%', font: 'inherit' }} />
                <p className="help">فقط دربارهٔ همین پاسخ بنویس؛ نام، تماس یا شمارهٔ مدرک لازم نیست.</p>
                {form.interpretation_disclosure && <><p className="help">برای فهم این پاسخ از هوش مصنوعی آروان کمک می‌گیریم.</p>{form.interpretation_disclosure.acceptance_notice && <p className="help">محل پردازش و حدود نگهداری محتوایی احراز نشده‌اند. می‌توانی گزینه‌های سؤال را انتخاب کنی.</p>}<details className="context-details"><summary>جزئیات ارسال این پاسخ</summary><p>فقط همین متن و قرارداد سؤال فرستاده می‌شوند. برداشت پس از تأیید تو ثبت می‌شود؛ تایپ‌کردن ارسالی ندارد.</p><p>گیرنده: {form.interpretation_disclosure.recipient} · محل پردازش: {form.interpretation_disclosure.processing_location} · نگهداری: {form.interpretation_disclosure.retention} · <a href={form.interpretation_disclosure.evidence} target="_blank" rel="noopener noreferrer">اطلاعات پردازش</a></p></details></>}
                {!form.interpretation_disclosure && <p className="help">درخواست برداشت تازه فعلاً در دسترس نیست؛ برداشت قبلی را مرور کن یا پاسخ ساختارمند بده.</p>}
                {form.interpretation_disclosure && <button type="button" className="secondary" disabled={!draftText.trim()} onClick={() => void interpretationAction({ action: 'submit', request_id: crypto.randomUUID(), expected_revision: form.revision, question_id: question.id, question_version: question.version, text: draftText, disclosure: 'answer-interpretation-1' })}>ارسال پاسخ و دیدن برداشت</button>}
                {draft && <div role="status">
                  {draft.status === 'proposed' ? <><p>برداشت پیشنهادی: <strong>{draft.summary}</strong></p><p className="help">پاسخ را در کنترل‌های بالای همین سؤال اصلاح کن و سپس «تأیید برداشت و ثبت پاسخ» را بزن. منشأ پاسخ خوداظهاری می‌ماند.</p></> : <p>{draft.ambiguity ?? (draft.status === 'pending' ? 'وضعیت درخواست قبلی هنوز قطعی نیست؛ تولید خودکار تکرار نمی‌شود. می‌توانی پاسخ ساختارمند بدهی.' : draft.status === 'cooldown' ? 'سرویس هوشمند موقتاً درخواست تازه نمی‌پذیرد؛ متن حفظ شده است. کمی بعد اقدام کن یا پاسخ ساختارمند بده.' : 'برداشت قابل تأیید آماده نشد؛ متن حفظ شده است. آن را اصلاح کن یا پاسخ ساختارمند بده.')}</p>}
                  <button type="button" className="text-button" onClick={() => void interpretationAction({ action: 'reject', request_id: crypto.randomUUID(), expected_revision: form.revision, draft_id: draft.id })}>رد برداشت و حذف پیش‌نویس</button>
                </div>}
              </section>}
              <div className="actions"><button type="submit" className="primary">{busy ? 'در حال ذخیره…' : explaining && draft?.status === 'proposed' ? 'تأیید برداشت و ثبت پاسخ' : entry?.review_reason === 'compass_conflict' ? 'تأیید مقدار دقیق' : 'ثبت پاسخ و ادامه'}</button></div>
              <div className="answer-alternatives">{question.allow_unknown && <button type="button" className="text-button" onClick={() => void save('unknown')}>نمی‌دانم</button>}{question.allow_declined && <button type="button" className="text-button" onClick={() => void save('declined')}>ترجیح می‌دهم پاسخ ندهم</button>}</div>
            </fieldset>
          </form> : !summary ? <p className="notice">سؤال مرتبطِ بی‌پاسخ دیگری نداریم. پاسخ‌های نامعلوم و نیازمند بررسی را مرور کن یا کارنامه را ببین.</p> : null}
          <div className="actions"><button className="secondary" disabled={busy} onClick={() => { setSummary(!summary); setEditing(null); setError(''); }}>{summary ? 'ادامهٔ سؤال‌ها' : 'مرور پاسخ‌ها'}</button><a className="text-button" href="/report">دیدن کارنامهٔ مقدماتی</a></div>
          {summary && <div className="form-summary">
            <h2>پاسخ‌های ثبت‌شده</h2><p className="help">همهٔ پاسخ‌ها خوداظهاری‌اند. این خلاصه، ارزیابی صلاحیت یا کارنامهٔ مهاجرتی نیست.</p>
            {form.answers.length ? <dl>{form.answers.map(r => <div key={r.question.id}><dt>{r.question.title}</dt><dd><span>{answerLabel(r)}{r.needs_review ? ' · نیازمند بازبینی' : ''}</span><button className="text-button" disabled={busy} onClick={() => { setEditing(r.question.id); setSummary(false); setError(''); }}>اصلاح<span className="sr-only"> {r.question.title}</span></button></dd></div>)}</dl> : <p>هنوز پاسخی ثبت نشده است.</p>}
            <h2>اطلاعات ناقص یا نیازمند بازبینی</h2>{form.missing.length ? <ul>{form.missing.map(q => <li key={q.id}><button className="text-button" disabled={busy} onClick={() => { setEditing(q.id); setSummary(false); setError(''); }}>{q.title}</button></li>)}</ul> : <p>پرسش‌ها پاسخ دارند؛ شرایط مسیرها را در کارنامهٔ مقدماتی ببین.</p>}
            <p className="notice">با اطلاعات ناقص هم می‌توانی کارنامه بسازی؛ موارد نامعلوم در آن مشخص می‌مانند.</p><ReportCoverage/>
          </div>}
          {notice && <p role="status" className="draft-notice">{notice}</p>}
        </>}
      </section>
      <aside className="guidance"><h2>هر بار، یک سؤال مرتبط.</h2><p>اگر جواب را نمی‌دانی، لازم نیست حدس بزنی. می‌توانی پاسخ‌ها را مرور کنی و بعداً کامل‌ترشان کنی.</p><a className="text-button" href="/?resume=1">اصلاح هدف و مقصدها</a><ReportCoverage/><details className="context-details"><summary>ادامه و اصلاح پاسخ‌ها</summary><p>پس از پیام ذخیره، می‌توانی بعداً از همین پرونده ادامه بدهی. اصلاح یک پاسخ ممکن است پاسخ‌های مرتبط را نیازمند بازبینی کند.</p></details></aside>
    </div></main><AppFooter/>
  </div>;
}
