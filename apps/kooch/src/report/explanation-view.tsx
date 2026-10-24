import { conditionLabels } from './view';
import type { GuidanceReport } from './evaluate';
import type { SavedExplanation } from './explanation';
export function ExplanationView({ explanation, report }: { explanation: SavedExplanation; report: GuidanceReport }) {
  if (explanation.status !== 'ready') return null;
  const sources = (routeId: string, ids: string[]) => ids.map(id => { const source = report.route_results.find(r => r.route_id === routeId)?.sources.find(s => s.id === id) ?? report.discovery?.result?.routes.find(r => r.id === routeId)?.sources.find(s => s.id === id); return source ? <a key={id} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : null; });
  return <section aria-label="توضیح همین کارنامه" className="guidance-report"><h2>دلیل‌ها و قدم‌های منتخب برای تو</h2>
    <p className="help">گزیده‌ای از همین کارنامه؛ بر پایهٔ خوداظهاری و با پوشش جزئی. شرط‌ها، هزینه‌ها و منابع کامل در گزارش پایین باقی‌اند.</p>
    <h3>دلیل‌ها</h3>{explanation.reasons?.map(card => <div key={card.id}><strong>{card.title} · {card.state && conditionLabels[card.state]}</strong><p>{card.text}</p><div className="report-sources">{sources(card.route_id, card.source_ids)}</div></div>)}
    <h3>قدم بعدی</h3><ol>{explanation.actions?.map(card => <li key={card.id}><strong>{card.title}</strong><p>{card.text}</p><div className="report-sources">{sources(card.route_id, card.source_ids)}</div></li>)}</ol>
    <p className="help">نسخهٔ توضیح: {explanation.version.toLocaleString('fa-IR')} · نسخهٔ کارنامه: {explanation.report_version.toLocaleString('fa-IR')} · {new Date(explanation.created_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' })}</p>
  </section>;
}
