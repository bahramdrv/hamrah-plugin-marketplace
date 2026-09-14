# Visa Atlas — API Routing Reference for Hamrah Main GPT

Checked: 2026-09-13

## چرا Action و نه Knowledge؟
داده‌های Visa Atlas تغییرپذیرند. fee، processing، policy، salary و drawها را در Knowledge کپی نکنید. Knowledge برای قواعد استفاده و schema است؛ داده زنده از Action خوانده شود.

## Core public datasets

| Endpoint | استفاده در Hamrah | اولویت |
|---|---|---|
| `/api/public/visas` | route, sponsor, settlement, summary, official source | High |
| `/api/public/destinations` | کشورها، portal و regulator | High |
| `/api/public/policy-updates` | تغییرات تاریخ‌دار policy | High |
| `/api/public/policy-claims` | claim اتمیک با source | High |
| `/api/public/calculator-verdict-contexts` | context برای calculator verdict | High |
| `/api/public/search-index` | پیدا کردن صفحه/route/calculator | Medium |
| `/api/public/processing-reliability` | شفافیت و reliability زمان processing | Medium |
| `/api/public/skilled-migration-accessibility` | friction مقایسه‌ای routeها | Medium |
| `/api/public/country-comparisons` | مقایسه کشورها | High |
| `/api/public/fees` | fee breakdown | High |
| `/api/public/cost-to-complete` | sunk cost vs proof-of-funds | High |
| `/api/public/salary-thresholds` | salary/income floor | High |
| `/api/public/processing-times` | official decision-time bands | High |
| `/api/public/express-entry-draws` | Canada EE draw history | Conditional |
| `/api/public/express-entry-categories` | Canada category tracker | Conditional |
| `/api/public/fact-changes` | تغییر fee/salary/processing | High |
| `/api/public/monthly-figure-changes` | archive تغییرات ماهانه | Medium |
| `/api/public/widgets` | embed metadata؛ معمولاً لازم نیست | Low |

## Agent/retrieval surfaces که باید اضافه شوند

| Endpoint | نقش |
|---|---|
| `/api/public/route-finder` POST | deterministic shortlist از profile bands |
| `/api/public/route-finder` GET | request contract/methodology |
| `/api/public/freshness` | freshness/SLA |
| `/api/public/citation-packs` | packet کوتاه source-linked |
| `/api/public/answer-capsules` | answer کوتاه verified با source trail |
| `/api/public` | dataset catalog/discovery |

## Routing rules

### Route discovery
1. profile را normalize کن.
2. پس از consent، POST route-finder با داده‌های coarse/banded.
3. top candidates را با `visas` verify کن.
4. current policy/freshness را قبل از final ranking چک کن.

### Current eligibility fact
- اول `visas` یا relevant `citation-packs/answer-capsules`.
- اگر policy-sensitive است `policy-claims` و `policy-updates`.
- primary official source URL را نگه دار.

### Costs
- fee = `/fees`
- paid-away route budget = `/cost-to-complete`
- proof-of-funds را جدا نگه دار.
- monthly living cost در Visa Atlas core datasets نیست؛ از web methodology استفاده کن.

### Processing
- headline window = `/processing-times`
- planning transparency = `/processing-reliability`
- Iran-specific operational friction = Community Signal file همان کشور.

### Country comparison
- `/country-comparisons`
- `/skilled-migration-accessibility`
- سپس top routeها را individual verify کن.

### Calculator
Visa Atlas calculator pages browser-side deterministic هستند. Action مستقیمی برای اجرای همه calculatorها در public API core وجود ندارد. برای تفسیر result از `/calculator-verdict-contexts` استفاده کن و formula/current grid را فقط با input کامل و facilitator approval اجرا کن.

Calculator families روی سایت:
- Canada Express Entry CRS
- Australia 189/190/491 points
- UK Skilled Worker points
- UK ILR/settlement date
- UK total migration cost
- Germany Chancenkarte
- Germany settlement/citizenship dates
- Ireland Stamp 4/citizenship dates
- Austria Red-White-Red Card points
- Visa fee calculator

## Freshness rule
برای هر factual figure این metadata را تا حد امکان حفظ کن:

```json
{
  "value": "...",
  "currency": "...",
  "source_url": "https://...official...",
  "visa_atlas_url": "https://visaatlas.org/...",
  "last_verified": "YYYY-MM-DD",
  "effective_date": "YYYY-MM-DD or null"
}
```

اگر current claim بیرون از freshness SLA است، web verification روی primary source انجام بده.

## چه endpointهایی را عمداً در Action اصلی نمی‌گذاریم؟
Visa Atlas تعداد زیادی endpoint عمومی SEO/GEO، reviewer-control، measurement و authority-distribution هم دارد. برای Hamrah Main GPT این‌ها noise هستند و به ارزیابی متقاضی کمک مستقیم نمی‌کنند. Action curated فقط migration/retrieval surfaces لازم را expose می‌کند.
