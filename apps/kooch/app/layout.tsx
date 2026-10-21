import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'قطب‌نمای مهاجرت | کوچ', description: 'چند پاسخ کوتاه، چند مسیر مستند برای بررسی؛ ویژهٔ دارندهٔ گذرنامهٔ ایرانی ساکن ایران.', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="fa" dir="rtl"><body><aside className="pilot-notice">پایلوت شخصی و غیرتجاری · کمک هوشمند تابع پذیرش و سقف مصرف · فعلاً فقط دادهٔ ساختگی وارد کن. <a href="/privacy">داده‌ها، نگهداری و حدود این نسخه</a></aside>{children}</body></html>;
}
