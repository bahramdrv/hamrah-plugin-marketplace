import { AppIcon } from './icons';

export function AppHeader({ current }: { current: 'compass' | 'form' | 'report' | 'account' | 'knowledge' }) {
  return <header className="app-header">
    <a className="brand" href="/" aria-label="کوچ، پیدا کردن مسیر"><img src="/kooch-logo.png" alt="کوچ" width={114} height={38}/><span>یک شروع روشن‌تر</span></a>
    <nav className="app-navigation" aria-label="بخش‌های کوچ">
      {([['compass', '/', 'بررسی'], ['form', '/form', 'پاسخ‌ها'], ['report', '/report', 'کارنامه'], ['account', '/account', 'حساب']] as const).map(([key, href, label]) => <a key={key} href={href} aria-current={current === key ? 'page' : undefined}><AppIcon name={key}/><span>{label}</span></a>)}
    </nav>
    <nav className="header-actions" aria-label="راهنما"><a href="/knowledge" target={current === 'knowledge' ? undefined : '_blank'} rel={current === 'knowledge' ? undefined : 'noopener'} aria-current={current === 'knowledge' ? 'page' : undefined}><AppIcon name="help"/>راهنما<span className="sr-only">{current !== 'knowledge' && ' در تب تازه'}</span></a></nav>
  </header>;
}

export function AppFooter() {
  return <footer className="app-footer"><span>کوچ · یک شروع روشن‌تر</span><a href="/privacy">حریم خصوصی و حدود این نسخه</a></footer>;
}

export function ReportCoverage() {
  return <details className="context-details"><summary>چه چیزی در کارنامه بررسی می‌شود؟</summary><p>برای مسیرهای دارای شواهد، خلاصهٔ مسیرها، پیش‌نیازهای شروع و قدم بعدی ذخیره می‌شود. بررسی تکمیلی شرط‌ها فعلاً تحصیل بریتانیا و درخواست اولیهٔ مجوز تحصیل کانادا را پوشش می‌دهد. سایر مسیرها ارزیابی کامل فردی ندارند؛ نبود پوشش به معنی بسته‌بودن آن‌ها نیست.</p></details>;
}

export function CompassGuidance() {
  return <aside className="guidance compass-guidance">
    <h2>لازم نیست از همین اول همه‌چیز را بدانی.</h2><p>از شرایط امروزت شروع کن؛ قدم بعدی را روشن می‌کنیم.</p>
    <ol className="outcome-list"><li><AppIcon name="map"/><div><strong>مسیرهای مرتبط</strong><span>چه گزینه‌هایی را بررسی کنی؟</span></div></li><li><AppIcon name="form"/><div><strong>چیزهایی که کم داری</strong><span>چه چیزی هنوز باید روشن شود؟</span></div></li><li><AppIcon name="check"/><div><strong>یک قدم مشخص</strong><span>بعد از این صفحه از کجا شروع کنی؟</span></div></li></ol>
    <details><summary>دربارهٔ این بررسی</summary><p>برای دارندهٔ گذرنامهٔ ایرانی ساکن ایران. شروع آنلاین ممکن است همچنان به سفر برای بیومتریک نیاز داشته باشد. این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></details>
  </aside>;
}
