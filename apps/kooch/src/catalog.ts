import { z } from 'zod';
import { countries, factTitle, policies, type DiscoveryPolicy } from './policy';
import type { Answers } from './questions';

export type DiscoverySource = { id: string; title: string; url: string; authority: 'primary' | 'trusted'; checked_on: string };
export type DiscoveryRoute = {
  id: string; name_fa: string; official_name: string; destination: string; country: string; flag: string;
  prerequisite_ids?: string[];
  category: string; page_url: string | null; reference_url?: string | null; reason: string; summary: string;
  facts: { label: string; value: string; sources: DiscoverySource[] }[];
  preparation_status: string; next_step: string; application_method: string; prerequisite: string;
  coverage: string; coverage_label: string; checked_on: string; valid_until: string;
  channel_note: string; followup: string | null; sources: DiscoverySource[];
};
const safeUrl = z.url().refine(value => { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; });
const source = z.object({ label: z.string(), url: safeUrl, authority: z.string(), lastVerified: z.iso.date() });
const record = z.object({ id: z.string(), source_id: z.string(), destination: z.string(), slug: z.string(),
  name: z.string(), name_fa: z.string(), category: z.string(), summary: z.string(), source,
  reviewed_on: z.iso.date().nullable(), sponsorship_required: z.boolean().nullable(), settlement: z.boolean(), duration: z.string().nullable() });
export const catalogSchema = z.object({ schema_version: z.literal(1), retrieved_at: z.iso.datetime({ offset: true }),
  source_url: z.literal('https://visaatlas.org/api/public/visas'), provider: z.literal('Visa Atlas'),
  license: z.literal('CC BY 4.0'), license_url: z.url(),
  iran_application: z.record(z.string(), z.object({ iran_passport_status: z.string(), start_from_iran: z.string(), application_acceptance: z.string(), evidence_checked_on: z.iso.date(), valid_until: z.iso.date(), source_ids: z.array(z.string()), reason_fa: z.string() })),
  iran_sources: z.record(z.string(), z.object({ id: z.string(), title: z.string(), url: z.url(), authority: z.literal('primary'), checked_on: z.iso.date() })),
  routes: z.array(record).max(2000), destinations: z.record(z.string(), z.object({ name: z.string(), official_name: z.string(), flag: z.string(), alpha3: z.string(), source_code: z.string(), region: z.string(), portal: z.string().nullable(), slug: z.string() })),
}).superRefine((data, ctx) => {
  if (Object.values(data.iran_application).some(a => a.source_ids.length === 0 || a.source_ids.some(id => data.iran_sources[id]?.id !== id))) ctx.addIssue({ code: 'custom', message: 'Unlinked Iranian application evidence' });
  if (new Set(data.routes.map(r => r.id)).size !== data.routes.length || data.routes.some(r => r.id !== `${r.destination}:${r.slug}` || !data.destinations[r.destination])) ctx.addIssue({ code: 'custom', message: 'Inconsistent global catalog' });
});
export type GlobalCatalog = z.infer<typeof catalogSchema>;
export type CatalogRecord = GlobalCatalog['routes'][number];
const goalByCategory: Record<string, DiscoveryPolicy['goal']> = {
  'work-sponsored': 'work', 'work-unsponsored': 'work', 'skilled-migration': 'work', 'intra-company': 'work',
  'digital-nomad': 'work', 'youth-mobility': 'work', study: 'study', family: 'family', entrepreneur: 'business',
  investor: 'investment', 'citizenship-by-investment': 'investment',
};
export function catalogPolicy(route: CatalogRecord): DiscoveryPolicy | null {
  if (policies[route.id]) return policies[route.id];
  const incomeRoute = route.category === 'residence-general' && /passive.income|non.lucrative|retire|pension|independent.means|elective.residence/i.test(`${route.slug} ${route.name}`);
  const goal = incomeRoute ? 'investment' : goalByCategory[route.category]; if (!goal) return null;
  const text = `${route.slug} ${route.name}`;
  let kind = goal === 'study' ? 'admission' : goal === 'family' ? 'family' : goal === 'business' ? 'project' : goal === 'investment' ? 'investment' :
    route.category === 'digital-nomad' ? 'remote_work' : route.category === 'youth-mobility' ? (route.slug === 'intern-visa' ? 'qualification' : 'eligible_passport') :
    route.sponsorship_required ? 'job_offer' : 'skilled_profile';
  if (goal === 'work' && /post.study|post.graduat|graduate.visa|non.local.graduat/i.test(text)) kind = 'local_study';
  if (route.id === 'nl:orientation-year') kind = 'qualification'; // Also admits specified foreign-university graduates.
  const id = `${route.destination}.${kind}`;
  return { goal, requires: [id], prerequisite: `شرایط دقیق برنامه و مدارک لازم باید در منبع رسمی همان مسیر بررسی شوند. ${factTitle(id)}` };
}
export function catalogSummary(route: CatalogRecord, policy: DiscoveryPolicy, answers: Answers): DiscoveryRoute {
  const country = countries[route.destination];
  const source: DiscoverySource = { id: `atlas:${route.source_id}`, title: route.source.label, url: route.source.url, authority: 'trusted', checked_on: route.source.lastVerified };
  const checked = route.source.lastVerified;
  const remaining = policy.requires.filter(id => answers.facts[id] !== 'yes');
  return { id: route.id, name_fa: route.name_fa, official_name: route.name, destination: route.destination,
    country: country?.name ?? route.destination, flag: country?.flag ?? '', category: ({ work: 'کار', study: 'تحصیل', family: 'پیوستن به خانواده', business: 'کارآفرینی', investment: 'سرمایه و درآمد مستقل' })[policy.goal],
    prerequisite_ids: policy.requires, page_url: null, reference_url: route.source.url, reason: 'مرتبط با هدف و مقصد انتخابی؛ برای تحقیق بیشتر، با روش اقدام تأییدنشده.',
    summary: policy.prerequisite, facts: [], preparation_status: 'research_required',
    next_step: `پیش از اقدام، پذیرش گذرنامهٔ ایران، محل مجاز درخواست و شرط‌های همین برنامه را از مرجع رسمی بررسی کن.${remaining.length ? ` ${factTitle(remaining[0])}` : ''}`,
    application_method: 'نیازمند بررسی روش اقدام از ایران', prerequisite: policy.prerequisite,
    coverage: 'catalog_research_required', coverage_label: 'کاتالوگ منبع‌دار؛ روش اقدام ایران تأیید نشده',
    checked_on: checked, valid_until: new Date(Date.parse(checked) + 14 * 86400000).toISOString().slice(0, 10),
    channel_note: 'تاریخ زیر، تاریخ بررسی ثبت‌شده در ویزا اطلس است؛ دریافت کاتالوگ، تأیید روش اقدام یا تمدید اعتبار بررسی نیست.', followup: null, sources: [source] };
}
