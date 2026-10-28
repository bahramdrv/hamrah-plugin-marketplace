export const sharedPrerequisites = {
  job_offer: { kind: 'job_offer', title: 'در حال حاضر از کشوری پیشنهاد کار داری؟', help: 'نداشتن پیشنهاد را یک‌بار ثبت می‌کنیم؛ مسیرهای بدون پیشنهاد کار همچنان بررسی می‌شوند.' },
  admission: { kind: 'admission', title: 'در حال حاضر از مؤسسه‌ای در خارج پذیرش تحصیلی داری؟', help: 'همهٔ مقطع‌ها و کشورها را در نظر بگیر. اعتبار و شروط همان پذیرش بعداً جدا بررسی می‌شوند.' },
  family_connection: { kind: 'family', title: 'عضو خانواده یا حامی‌ای برای بررسی مسیر پیوستن در کشور دیگری داری؟', help: 'وجود این ارتباط با واجد شرایط بودن رابطه و حامی یکی نیست.' },
  remote_work: { kind: 'remote_work', title: 'در حال حاضر کار و درآمد دورکاری داری؟', help: 'درآمد، نوع کارفرما و شرایط هر مسیر بعداً بررسی می‌شوند.' },
  business_plan: { kind: 'project', title: 'طرح کسب‌وکار یا خوداشتغالی، حتی در حد ایده، داری؟', help: 'هنوز کشور یا تأیید رسمی طرح لازم نیست؛ وجود طرح را یک‌بار می‌پرسیم.' },
  investment_basis: { kind: 'investment', title: 'منبع سرمایه یا درآمد مستقلی برای بررسی مسیر سرمایه‌گذاری یا تمکن مشخص کرده‌ای؟', help: 'این پاسخ تأیید مبلغ، قانونی‌بودن منابع یا کفایت تمکن نیست.' },
} as const;
export type SharedPrerequisite = keyof typeof sharedPrerequisites;
export type SharedPresence = 'none' | 'some' | 'unknown';
type SharedInput = Partial<Record<SharedPrerequisite, string>> & { facts: Record<string, 'yes' | 'no' | 'unknown'>; job_offer_countries?: string[] | null; admission_countries?: string[] | null };
export function sharedConceptForFact(id: string): SharedPrerequisite | undefined {
  const [country, kind, extra] = id.split('.');
  if (!country || country === 'ir' || extra) return;
  return (Object.keys(sharedPrerequisites) as SharedPrerequisite[]).find(key => sharedPrerequisites[key].kind === kind);
}
export function sharedAbsence(input: SharedInput, id: string) {
  const concept = sharedConceptForFact(id);
  if (concept && input[concept] === 'none') return concept;
  if (concept === 'job_offer' || concept === 'admission') {
    const countries = input[`${concept}_countries`];
    if (input[concept] === 'some' && countries?.length && !countries.includes(id.split('.')[0])) return concept;
  }
  return null;
}
export function sharedConflicts(input: SharedInput) {
  return [...new Set(Object.entries(input.facts).flatMap(([id, value]) => value === 'yes' && sharedAbsence(input, id) ? [sharedAbsence(input, id)!] : []))];
}
export function projectSharedFacts<T extends SharedInput>(input: T, countryCodes: string[]): T {
  const facts = { ...input.facts };
  for (const code of countryCodes) for (const [concept, definition] of Object.entries(sharedPrerequisites)) {
    const id = `${code}.${definition.kind}`;
    if (code !== 'ir' && sharedAbsence(input, id)) facts[id] = input.facts[id] === 'yes' ? 'unknown' : 'no';
  }
  return { ...input, facts };
}
export function updateSharedAnswer<T extends SharedInput>(input: T, key: SharedPrerequisite, value: SharedPresence): T {
  const facts = { ...input.facts };
  // A new explicit shared answer replaces older coarse statements of the same
  // concept. It never edits the detailed, source-versioned route checks.
  if (value === 'none') for (const id of Object.keys(facts)) if (sharedConceptForFact(id) === key) delete facts[id];
  return { ...input, [key]: value, facts,
    ...((key === 'job_offer' || key === 'admission') && (input[key] !== value || sharedConflicts(input).includes(key)) ? { [`${key}_countries`]: null } : {}) };
}
export function updateCountryInventory<T extends SharedInput>(input: T, key: 'job_offer_countries' | 'admission_countries', values: string[]): T {
  const concept = key === 'job_offer_countries' ? 'job_offer' : 'admission';
  const facts = { ...input.facts };
  for (const id of Object.keys(facts)) if (sharedConceptForFact(id) === concept) delete facts[id];
  return { ...input, [key]: values, facts };
}
