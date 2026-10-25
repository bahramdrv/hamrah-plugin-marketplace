import type { Metadata } from 'next';
import './styles.css';
import './ux.css';
import './atelier.css';
const designContract = `<!-- THESIS: focused working sheet, no invented dashboard metrics.
OWN-WORLD: warm paper #F6F4EF, navy #102D3E, teal #237E80, original Kooch logo, Vazirmatn, white sheets and 12px controls.
STORY: answer today's situation, review evidence and next steps, retain a private report.
FIRST VIEWPORT: original logo and help, three real stages, bold heading, white question sheet, paired goals, stacked navy continue and outlined summary; supporting rows and four-item mobile nav.
FORM: contemporary architecture notebook, grounded direction 3, seed 7271bc97, owner-approved composition A.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->`;
export const metadata: Metadata = { title: 'قطب‌نمای مهاجرت | کوچ', description: 'چند پاسخ کوتاه، چند مسیر مستند برای بررسی؛ ویژهٔ دارندهٔ گذرنامهٔ ایرانی ساکن ایران.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="fa" dir="rtl"><body><div hidden dangerouslySetInnerHTML={{ __html: designContract }}/><aside className="pilot-notice">نسخهٔ آزمایشی · فعلاً فقط دادهٔ ساختگی وارد کن. <a href="/privacy">دربارهٔ این نسخه</a></aside>{process.env.KOOCH_MEMBERSHIP_ENABLED === 'true' && <details className="membership-notice"><summary>اولین کارنامه با تأیید عضویت تلگرام</summary><p>برای اولین کارنامه، عضویت یک‌باره در کانال تلگرام کوچ و تأیید دنبال‌کردن اینستاگرام لازم است. دارندگان کارنامهٔ قبلی معاف‌اند.</p></details>}{children}</body></html>;
}
