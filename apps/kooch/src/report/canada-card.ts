import { canadaPolicy } from './canada-policy';
export function canadaCardFacts(now: Date) {
  if (!canadaPolicy.sources.every(s => Date.parse(s.checked_at) <= now.getTime() && now.getTime() < Date.parse(s.expires_at))) return [];
  const fact = (label: string, value: string, id: string) => ({ label, value,
    sources: canadaPolicy.sources.filter(s => s.id === id).map(s => ({ id: `ca-guidance-${id}`, url: s.url, title: s.title, authority: 'primary' as const, checked_on: s.checked_at.slice(0, 10) })) });
  return [
    fact('پذیرش و نامهٔ استانی', 'LOA از DLI؛ معافیت PAL/TAL ارشد و دکتری در DLI دولتی؛ کبک/CAQ جدا', 'pal'),
    fact('تمکن زندگی', `یک نفر بیرون کبک: سالانه ${canadaPolicy.values.living_annual[0].toLocaleString('fa-IR')} دلار کانادا از سپتامبر ۲۰۲۶؛ همراهان جدا`, 'money'),
    fact('بودجهٔ جدا', 'شهریه و رفت‌وبرگشت افزون بر زندگی؛ درآمد کار آینده جای تمکن نیست', 'money'),
  ];
}
