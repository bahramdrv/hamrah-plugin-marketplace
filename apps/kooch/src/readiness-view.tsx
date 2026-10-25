import type { RouteReadiness } from './route-readiness';
import { date } from './display';
export const readinessLabels = { reported_ready: 'طبق پاسخ تو آماده است', action_needed: 'نیازمند آماده‌سازی', needs_information: 'هنوز روشن نیست', needs_review: 'نیازمند بازبینی' };
export function ReadinessView({ readiness, print = false }: { readiness: RouteReadiness; print?: boolean }) {
  const n = (value: number) => value.toLocaleString('fa-IR');
  const links = (sources: RouteReadiness['sources']) => <ul className="readiness-sources">{sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · بررسی: {date(source.checked_on)}{source.verification && source.verification !== 'direct' && ' · تأیید مستقیم و جاری لازم است'}</li>)}</ul>;
  return <section className="readiness-panel" aria-label="آمادگی این مسیر">
    <h3>برای این مسیر چه چیزی آماده است؟</h3><p>{readiness.scope}</p>
    <p className="readiness-counts">{n(readiness.counts.reported_ready)} مورد آماده طبق پاسخ تو · {n(readiness.counts.action_needed)} مورد نیازمند اقدام · {n(readiness.counts.needs_information)} مورد نامعلوم{readiness.counts.needs_review > 0 && ` · ${n(readiness.counts.needs_review)} مورد نیازمند بازبینی`}</p>
    <ol className="readiness-checks">{readiness.checks.map(check => <li key={check.id}>
      <strong>{check.question}</strong><span className={`readiness-state state-${check.state}`}>{readinessLabels[check.state]}</span>
      <details open={print || undefined}><summary>شرط، قدم بعدی و منبع</summary><p>{check.reason}</p>{check.state !== 'reported_ready' && <p>{check.action}</p>}{links(check.sources)}</details>
    </li>)}</ol>
    <details open={print || undefined}><summary>هزینه، تمکن و همراهان</summary><h4>هزینه و تمکن</h4><p>{readiness.costs.text}</p>{!readiness.costs.current && <p className="notice">این بخش منبع جاری کافی ندارد؛ مبلغ یا شرایط را پیش از اقدام دوباره بررسی کن.</p>}{links(readiness.costs.sources)}<h4>همراهان</h4><p>{readiness.dependants.text}</p>{!readiness.dependants.current && <p className="notice">شرایط فعلی همراهان به بررسی جدا نیاز دارد.</p>}{links(readiness.dependants.sources)}</details>
    <p className="help">{readiness.limitations} پاسخ‌های تو خوداظهاری‌اند؛ این بررسی تأیید مدارک، احراز تمام شرایط یا احتمال ویزا نیست.</p>
  </section>;
}
