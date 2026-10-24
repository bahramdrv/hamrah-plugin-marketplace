import { z } from 'zod';
import type { EvidenceCard } from './contract';
type Tool = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const search = z.object({ signals: z.array(z.object({ datasetId: z.string(), signalId: z.string() }).passthrough()) });
const dataset = z.object({ canonicalSignals: z.array(z.object({ id: z.string(), title: z.string(), summary_fa: z.string().nullable().optional(), summary_en: z.string().nullable().optional(),
  evidence_ids: z.array(z.string()), needs_recheck: z.boolean().optional(), lifecycle: z.object({ last_verified: z.string().nullable() }).passthrough() }).passthrough()),
  evidence: z.array(z.object({ id: z.string(), source_url: z.string().nullable(), source_name: z.string().nullable().optional() }).passthrough()) });

export async function expandCommunityContext(results: PromiseSettledResult<unknown>[], tool: Tool, now: Date) {
  const selected = results.flatMap((result, index) => {
    if (![0, 2].includes(index) || result.status !== 'fulfilled') return [];
    const parsed = search.safeParse(result.value);
    return parsed.success ? parsed.data.signals.slice(0, index === 0 ? 5 : 3).map(signal => ({ ...signal, general: index === 2 })) : [];
  });
  const groups = [...new Set(selected.map(s => s.datasetId))].slice(0, 3);
  const details = await Promise.allSettled(groups.map(datasetId => tool('getCommunitySignalDataset', { datasetId, signalIds: [...new Set(selected.filter(s => s.datasetId === datasetId).map(s => s.signalId))] })));
  let partial = new Set(selected.map(s => s.datasetId)).size > groups.length;
  const cards: EvidenceCard[] = [];
  for (let index = 0; index < details.length; index++) {
    const detail = details[index];
    const parsed = detail.status === 'fulfilled' ? dataset.safeParse(detail.value) : null;
    if (!parsed?.success) { partial = true; continue; }
    for (const signal of parsed.data.canonicalSignals) {
      const scopes = selected.filter(s => s.datasetId === groups[index] && s.signalId === signal.id);
      if (!scopes.length) continue;
      const general = scopes.every(s => s.general);
      const old = !signal.lifecycle.last_verified || Date.parse(signal.lifecycle.last_verified) > now.getTime() || now.getTime() - Date.parse(signal.lifecycle.last_verified) > 14 * 86400000;
      const needsReview = signal.needs_recheck || old; partial ||= Boolean(needsReview);
      const links = parsed.data.evidence.filter(e => signal.evidence_ids.includes(e.id)).flatMap(e => {
        try { const u = new URL(e.source_url ?? ''); return u.protocol === 'https:' && !u.username && !u.password ? [{ title: e.source_name ?? 'منبع', url: u.href }] : []; } catch { return []; }
      });
      if (!links.length) partial = true;
      cards.push({ title: `${general ? 'زمینهٔ عمومی کشور' : 'دامنهٔ ایران'} · ${signal.title}`,
        text: `${signal.summary_fa ?? signal.summary_en ?? 'شرح در منبع بررسی شود.'}${general ? ' این زمینهٔ کشور است؛ ممکن است دربارهٔ مسیر یا تابعیت دیگری باشد و به پروندهٔ تو تعمیم داده نمی‌شود.' : ''}${needsReview ? ' شواهد این نکته به بازبینی تازه نیاز دارند.' : ''} بررسی ثبت‌شده: ${signal.lifecycle.last_verified ?? 'نامعلوم'}. این نکته امتیاز مسیر یا احتمال ویزا نیست.`, links });
    }
  }
  return { cards, partial };
}
