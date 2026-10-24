import type { CompassResult } from './api';

export function GuidanceSummary({ guidance, print = false }: { guidance: CompassResult['guidance']; print?: boolean }) {
  return <section className="guidance-summary" aria-label="خلاصه و قدم بعدی">
    <h2>از شرایط تو چه فهمیدیم؟</h2><p>{guidance.summary}</p>
    {guidance.profile.length > 0 && <dl className="profile-summary">{guidance.profile.map(item => <div key={item.id}><dt>{item.title}</dt><dd>{item.value}</dd></div>)}</dl>}
    <div className="primary-action"><h3>قدم بعدی تو</h3><p>{guidance.main_action}</p></div>
    {guidance.actions.length > 1 && <details open={print || undefined}><summary>قدم‌های بعد از آن</summary><ol>{guidance.actions.slice(1).map(action => <li key={action.id}>{action.detail}</li>)}</ol></details>}
    {guidance.open_questions.length > 0 && <details open={print || undefined}><summary>چه چیزی می‌تواند نتیجه را روشن‌تر کند؟</summary><ul>{guidance.open_questions.map(q => <li key={q.id}>{q.title}</li>)}</ul></details>}
  </section>;
}
