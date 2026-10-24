import type { CompassResult } from './api';
import { date } from './display';
type Route = CompassResult['routes'][number];
export function RouteComparison({ routes, print = false }: { routes: Route[]; print?: boolean }) {
  const labels = [...new Set(routes.flatMap(route => route.facts.map(fact => fact.label)))];
  return <div className="comparison-scroll" role="region" aria-label="جدول مقایسهٔ مسیرها؛ برای دیدن ستون‌ها می‌توانی افقی حرکت کنی" tabIndex={0}><table className="route-comparison"><caption>فقط اطلاعات همین نتیجه؛ نبود اطلاعات به معنی نداشتن شرط نیست.</caption><thead><tr><th scope="col">موضوع</th>{routes.map(route => <th scope="col" key={route.id}>{route.name_fa.split('؛')[0]}</th>)}</tr></thead><tbody>
    <tr><th scope="row">مقصد</th>{routes.map(route => <td key={route.id}>{route.country}</td>)}</tr>
    <tr><th scope="row">شرط شروع بررسی</th>{routes.map(route => <td key={route.id}>{route.prerequisite}</td>)}</tr>
    {labels.map(label => <tr key={label}><th scope="row">{label}</th>{routes.map(route => <td key={route.id}>{route.facts.find(fact => fact.label === label)?.value ?? 'در اطلاعات این مسیر ثبت نشده'}</td>)}</tr>)}
    <tr><th scope="row">روش اقدام</th>{routes.map(route => <td key={route.id}>{route.application_method}</td>)}</tr>
    <tr><th scope="row">قدم بعدی</th>{routes.map(route => <td key={route.id}>{route.next_step}</td>)}</tr>
    <tr><th scope="row">منابع و تاریخ</th>{routes.map(route => <td key={route.id}><details open={print || undefined}><summary>دیدن منابع {route.country}</summary><p>{route.coverage === 'application_channel_reviewed' ? 'بررسی روش اقدام' : 'بررسی ثبت‌شدهٔ منبع؛ نیازمند تأیید تازه'}: {date(route.checked_on)} · پایان بازهٔ بازبینی: {date(route.valid_until)}</p><ul>{[...new Map([...route.sources, ...route.facts.flatMap(fact => fact.sources)].map(source => [`${source.id}:${source.checked_on}`, source])).values()].map(source => <li key={`${source.id}:${source.checked_on}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {date(source.checked_on)}</li>)}</ul></details></td>)}</tr>
  </tbody></table></div>;
}
