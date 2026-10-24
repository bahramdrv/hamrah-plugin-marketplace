import type { Answers } from './questions';
import type { CompassConfig } from './api';
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
  return <><div className="destinations">{Object.entries(countries).map(([code, country]) => <label key={code} className={`choice ${value.includes(code) ? 'selected' : ''}`}>
    <input type="checkbox" checked={value.includes(code)} onChange={e => onChange(e.target.checked ? [...value, code] : value.filter(c => c !== code))} />{country.flag} {country.name}
  </label>)}</div><button type="button" className="text-button" onClick={() => onChange([])}>{value.length ? 'پاک‌کردن انتخاب مقصدها' : 'هنوز نمی‌دانم / بدون ترجیح'}</button></>;
}
