export function AppHeader({ current }: { current: 'compass' | 'form' | 'report' | 'account' | 'knowledge' }) {
  return <header className="app-header">
    <a className="brand" href="/" aria-label="کوچ، پیدا کردن مسیر"><strong>کوچ</strong><span>یک شروع روشن‌تر</span></a>
    <nav className="app-navigation" aria-label="بخش‌های کوچ">
      {([['compass', '/', 'پیدا کردن مسیر'], ['form', '/form', 'پاسخ‌های من'], ['report', '/report', 'کارنامهٔ مقدماتی']] as const).map(([key, href, label]) => <a key={key} href={href} aria-current={current === key ? 'page' : undefined}>{label}</a>)}
    </nav>
    <nav className="header-actions" aria-label="حساب و راهنما"><a href="/knowledge" target={current === 'knowledge' ? undefined : '_blank'} rel={current === 'knowledge' ? undefined : 'noopener'} aria-current={current === 'knowledge' ? 'page' : undefined}>راهنما<span className="sr-only">{current !== 'knowledge' && ' در تب تازه'}</span></a><a href="/account" aria-current={current === 'account' ? 'page' : undefined}>حساب و ادامهٔ بررسی</a></nav>
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
    <svg className="compass-mark" aria-hidden="true" viewBox="0 0 160 160" fill="none" stroke="currentColor"><circle cx="80" cy="80" r="64"/><circle cx="80" cy="80" r="45"/><path d="M80 4v17m0 118v17M4 80h17m118 0h17m-48-52L90 90l-38 18 18-38 38-18Z"/></svg>
    <h2>لازم نیست از همین اول همه‌چیز را بدانی.</h2><p>از شرایط امروزت شروع کن؛ قدم بعدی را روشن می‌کنیم.</p>
    <ol className="outcome-list"><li><strong>مسیرهای مرتبط</strong><span>چه گزینه‌هایی را بررسی کنی؟</span></li><li><strong>چیزهایی که کم داری</strong><span>چه چیزی هنوز باید روشن شود؟</span></li><li><strong>یک قدم مشخص</strong><span>بعد از این صفحه از کجا شروع کنی؟</span></li></ol>
    <details><summary>دربارهٔ این بررسی</summary><p>برای دارندهٔ گذرنامهٔ ایرانی ساکن ایران. شروع آنلاین ممکن است همچنان به سفر برای بیومتریک نیاز داشته باشد. این فهرست، تأیید شرایط یا احتمال ویزا نیست.</p></details>
  </aside>;
}
