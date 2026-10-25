import type { Metadata } from 'next';
import './styles.css';
import './ux.css';
export const metadata: Metadata = { title: 'قطب‌نمای مهاجرت | کوچ', description: 'چند پاسخ کوتاه، چند مسیر مستند برای بررسی؛ ویژهٔ دارندهٔ گذرنامهٔ ایرانی ساکن ایران.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="fa" dir="rtl"><body><aside className="pilot-notice">نسخهٔ آزمایشی · فعلاً فقط دادهٔ ساختگی وارد کن. <a href="/privacy">دربارهٔ این نسخه</a></aside>{process.env.KOOCH_MEMBERSHIP_ENABLED === 'true' && <aside className="membership-notice">برای اولین کارنامه، عضویت یک‌باره در کانال تلگرام کوچ و تأیید دنبال‌کردن اینستاگرام لازم است. دارندگان کارنامهٔ قبلی معاف‌اند.</aside>}{children}</body></html>;
}
