import type { Answers } from './questions';
import type { CompassConfig } from './api';
import { useState } from 'react';
export function Choices({ options, value, onChange, name }: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; name: string }) {
  return <div className={`choices${name === 'goal' ? ' goal-choices' : ''}`}>{options.map(option => <label className={`choice ${value === option.value ? 'selected' : ''}`} key={option.value}>
    <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}
  </label>)}</div>;
}
export function Budget({ amount, currency, changeAmount, changeCurrency }: { amount: string; currency: string; changeAmount: (v: string) => void; changeCurrency: (v: string) => void }) {
  return <div className="budget"><label>مقدار<input name="budgetAmount" type="text" inputMode="decimal" maxLength={22} placeholder="مثلاً ۱۵۰۰۰" value={amount} onChange={e => changeAmount(e.target.value)} /></label>
    <label>ارز<select value={currency} onChange={e => changeCurrency(e.target.value)}>{[['EUR', 'یورو'], ['USD', 'دلار آمریکا'], ['CAD', 'دلار کانادا'], ['AUD', 'دلار استرالیا'], ['GBP', 'پوند بریتانیا'], ['IRR', 'ریال'], ['IRT', 'تومان']].map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>;
}
export function Destinations({ countries, value, onChange }: { countries: CompassConfig['countries']; value: Answers['destinations']; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState(''); const [all, setAll] = useState(false);
  const normalize = (text: string) => text.toLowerCase().replaceAll('ي', 'ی').replaceAll('ك', 'ک');
  const matching = Object.entries(countries).filter(([code, c]) => normalize(`${code} ${c.name} ${c.official_name ?? ''}`).includes(normalize(query))).sort(([a], [b]) => Number(value.includes(b)) - Number(value.includes(a)) || countries[a].name.localeCompare(countries[b].name, 'fa'));
  const shown = query || all ? matching : matching.slice(0, 24);
  return <><label className="country-search">جست‌وجوی کشور یا قلمرو<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="مثلاً استرالیا، Norway یا FR"/></label>
    <p className="help" role="status">{matching.length.toLocaleString('fa-IR')} مقصد · {value.length.toLocaleString('fa-IR')} انتخاب از حداکثر۱۰مقصد{value.length > 0 && ` · ${value.map(c => countries[c]?.name ?? c).join('، ')}`}</p>
    <div className="destinations">{shown.map(([code, country]) => <label key={code} className={`choice ${value.includes(code) ? 'selected' : ''}`}>
    <input type="checkbox" checked={value.includes(code)} disabled={!value.includes(code) && value.length >= 10} onChange={e => onChange(e.target.checked ? [...value, code] : value.filter(c => c !== code))} />{country.flag} {country.name}
  </label>)}</div>
    {!query && !all && matching.length > shown.length && <button type="button" className="text-button" onClick={() => setAll(true)}>نمایش همهٔ مقصدها</button>}
    {value.length ? <button type="button" className="text-button" onClick={e => { e.preventDefault(); onChange([]); }}>پاک‌کردن انتخاب مقصدها</button> : <button type="submit" className="text-button">هنوز نمی‌دانم / بدون ترجیح</button>}
  </>;
}
