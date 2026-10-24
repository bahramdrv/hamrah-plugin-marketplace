export const researchTopics = { route: 'شرط‌ها و منابع', costs: 'هزینه و تمکن', time: 'زمان رسیدگی', questions: 'پرسش‌های مرتبط', community: 'نکته‌های اجرایی', viability: 'زمینهٔ مسیر برای ایرانیان', statistics: 'آمار رسمی', changes: 'تغییرهای اخیر', experiences: 'تجربه‌های ثبت‌شده', academic: 'فرصت‌های تحصیلی' };
export type Topic = keyof typeof researchTopics;
export type EvidenceCard = { title: string; text: string; links: { title: string; url: string }[] };
export type ResearchResult = { title: string; checked_at: string; status: 'available' | 'partial' | 'unavailable'; cards: EvidenceCard[]; note: string };
