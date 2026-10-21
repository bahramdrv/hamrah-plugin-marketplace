import { createRequire } from 'node:module';
// This endpoint emits standalone HTML, outside Next's React Server Component renderer.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as typeof import('react-dom/server');
import type { GuidanceReport } from './evaluate';
import type { ReportState } from './contract';
import { SavedReport } from './view';
export function printReport(report: GuidanceReport, state: ReportState | null) {
  return '<!doctype html>' + renderToStaticMarkup(<html lang="fa" dir="rtl"><head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" /><title>{`کارنامهٔ مقدماتی کوچ · نسخهٔ ${report.version.toLocaleString('fa-IR')}`}</title>
    <link rel="stylesheet" href="/report-print.css" /><script src="/report-print.js" defer />
  </head><body><main><div className="print-controls"><button id="print-report" type="button">چاپ یا ذخیرهٔ PDF با مرورگر</button>
    <a href={`/report?id=${report.id}`}>بازگشت به همین کارنامه</a><p>نسخهٔ خصوصی تو؛ در چاپ مرورگر، اندازهٔ A4 را انتخاب کن.</p></div>
    <h1>کارنامهٔ مقدماتی کوچ</h1><SavedReport report={report} state={state} print />
  </main></body></html>);
}
