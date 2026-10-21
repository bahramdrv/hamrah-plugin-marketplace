'use client';
import { useState } from 'react';
import type { evidenceStatus } from '../../../src/evidence/sync';
type Status = ReturnType<typeof evidenceStatus>;
const labels = { idle:'هنوز اجرا نشده',fetching:'دریافت در حال ادامه',ok:'دریافت کامل',review_required:'تغییر نیازمند بازبینی',error:'خطای دریافت' };
export default function EvidenceAdminPage() {
  const [secret,setSecret]=useState(''),[status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load() {
    setBusy(true);setError('');setStatus(null);
    try {
      const r=await fetch('/api/evidence/status',{cache:'no-store',headers:{Authorization:`Bearer ${secret}`}});
      if(!r.ok)throw Error();setStatus(await r.json());
    } catch {setError('دسترسی مدیریت یا ارتباط معتبر نیست؛ کلید مستقل و اتصال را بررسی کن.');}
    finally {setBusy(false);setSecret('');}
  }
  return <div className="app-shell"><header><a className="brand" href="/">کوچ</a><a href="/account">حساب من</a></header><main>
    <h1>وضعیت شواهد عمومی</h1><p>دریافت کاتالوگ، تأیید رسمی شرط‌ها را تمدید نمی‌کند. تغییر تصمیم‌ساز پیش از استفاده به بازبینی می‌رود.</p>
    <form className="account-form" onSubmit={e=>{e.preventDefault();void load();}}><label>کلید مستقل مشاهدهٔ وضعیت<input type="password" value={secret} autoComplete="off" onChange={e=>setSecret(e.target.value)} required /></label><button className="primary" disabled={busy}>{busy?'در حال دریافت…':'دریافت وضعیت مدیریت'}</button></form>
    <p className="help">کلید در مرورگر ذخیره نمی‌شود و پس از درخواست از فرم پاک می‌شود. حساب عادی اختیار مدیریت نمی‌دهد.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {status&&<section aria-label="وضعیت همگام‌سازی"><h2>{labels[status.state]}</h2>
      <p>آخرین تلاش: {status.last_attempt_at?new Date(status.last_attempt_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'}):'هنوز ثبت نشده'}</p>
      <p>آخرین دریافت کامل: {status.last_success_at?new Date(status.last_success_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'}):'هنوز ثبت نشده'}</p>
      <p>مسیرهای نسخهٔ بازبینی‌شده: {status.coverage.total.toLocaleString('fa-IR')} · پوشش جاری: {status.coverage.current.toLocaleString('fa-IR')} · منقضی: {status.coverage.expired.toLocaleString('fa-IR')} · نیازمند بازبینی: {status.coverage.review_required.toLocaleString('fa-IR')}</p>
      {status.checkpoint!==null&&<p>صفحه‌های دریافت‌شده: {status.checkpoint.toLocaleString('fa-IR')} از {status.expected_pages?.toLocaleString('fa-IR')}؛ نسخهٔ نیمه‌تمام فعال نیست.</p>}
      <p>شناسهٔ برداشت: <bdi style={{overflowWrap:'anywhere'}}>{status.active_id}</bdi></p>
      <h2>صف بازبینی</h2>{!status.reviews.length?<p>تغییر شناخته‌شده‌ای در صف نیست؛ این وضعیت تأیید کامل همهٔ مسیرها نیست.</p>:<ul>{status.reviews.map(r=><li key={r.route_id}><bdi>{r.route_id}</bdi> · {r.reason==='added'?'مسیر تازه':r.reason==='removed'?'حذف از برداشت جاری':'تغییر شواهد'} · <bdi>{r.fields.join(', ')}</bdi></li>)}</ul>}
      <p>برای رفع بازبینی، منبع اولیه و نسخهٔ قواعد را بررسی و نسخهٔ بازبینی‌شدهٔ تازه منتشر کن. این صفحه قواعد را خودکار فعال نمی‌کند.</p>
    </section>}
  </main></div>;
}
