# Hamrah Main GPT — Combined Knowledge Handbook

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


---

# Facilitator Interview Playbook

## هدف
تسهیلگر باید سریع به «تصویر کافی برای shortlist» برسد و بعد فقط برای routeهای promising سوال عمیق بپرسد.

## Phase A — Minimum Viable Profile
در یک یا دو batch:

1. سن یا age band
2. تابعیت و کشور محل اقامت
3. آخرین مدرک، رشته، سال اتمام
4. شغل فعلی + سابقه مرتبط
5. زبان‌ها و آزمون‌ها
6. وضعیت تاهل/تعداد همراهان
7. funds تقریبی قابل‌دسترس + currency
8. هدف اصلی: work / study / research / family / remote / invest
9. کشورهای مورد علاقه و کشورهای نامطلوب
10. timeline
11. اهمیت PR/citizenship
12. داشتن job offer/admission/sponsor/nomination

## Phase B — Preferences
فقط به اندازه‌ای که ranking را تغییر می‌دهد:
- آب‌وهوا
- زبان کشور
- شهر بزرگ/کوچک
- budget monthly
- willingness to study again
- willingness to learn new language
- willingness to travel to third country for biometrics/consular steps
- family/childcare priorities
- salary/career ceiling
- tolerance for uncertainty and long processing

## Phase C — Route-specific deep dive
قبل از شروع بگو:
«برای اینکه Route X را دقیق‌تر بسنجیم، لازم است 6 سوال جزئی‌تر درباره Y/Z بپرسم. انجام بدهم؟»

مثال:
- Canada EE: exact age, education equivalency, language bands, Canadian/foreign work, spouse factors, additional points.
- Australia skilled: exact age, English level, skilled employment, qualification, partner points, nomination/regional willingness.
- UK Skilled Worker: occupation, sponsor, CoS/job offer, salary, relevant PhD, occupation list/salary option.
- Germany Opportunity Card: recognition status, degree/vocational qualification, language, work experience, age, Germany connection/funds.
- PhD: GPA, thesis, publications, research interests, methods, target subfield, funding need, deadline.

## Phase D — Consent gates
تایید صریح لازم است برای:
- route-finder POST
- public-profile search درباره فرد
- university/PhD search
- calculator with personal inputs
- deep-dive program-specific interview

## Phase E — Provisional vs Final
اگر hard-gate data ناقص است:
- خروجی = PROVISIONAL
- assumptionها را explicit کن
- exact eligibility PASS نده
- confidence را کاهش بده

اگر داده کافی است:
- hard gates
- live facts
- community applicability
- score
- final report

## State tracking
بعد از هر batch یک خلاصه کوتاه بده:

```text
داریم: سن، تابعیت، مدرک، 6 سال سابقه، IELTS، funds
کم داریم: exact salary، partner profile، timeline
برای shortlist فعلی همین مقدار کافی است.
```

از پرسیدن دوباره چیزی که قبلاً داده شده خودداری کن.


---

# Hamrah Scorecard Methodology

## 1) لایه‌ها را جدا نگه دارید

### Official Eligibility
`PASS | LIKELY | UNCLEAR | FAIL`

این وضعیت فقط از قواعد رسمی/current و داده‌های معتبر شخص می‌آید.
Community نمی‌تواند FAIL/PASS بسازد.

### Base Fit
Heuristic تناسب 0 تا 100، نه probability approval.

| بعد | وزن |
|---|---:|
| Eligibility readiness | 30 |
| Career/profile alignment | 20 |
| Financial feasibility | 15 |
| Process practicality | 10 |
| Long-term pathway | 10 |
| Goal/lifestyle alignment | 10 |
| Evidence quality | 5 |

### Community Friction
`0, -5, -10, -15, -20`

- 0: signal قابل اتکا/مرتبط نیست
- -5: friction تکرارشونده متوسط
- -10: friction قوی و recent
- -15: disruption شدید اجرای مسیر
- -20: مسیر عملاً نزدیک به blocked برای این context؛ نیازمند evidence بسیار قوی و preferably official corroboration

Single anecdote = 0.
Resolved = 0.

### Practical Fit
`max(0, Base Fit + Community Friction)`

### Confidence
0 تا 100 و مستقل از score.

پیشنهاد:
- 85–100 High
- 65–84 Medium-high
- 45–64 Medium
- 25–44 Low
- <25 Very low

Confidence از completeness پروفایل، freshness، source quality و ambiguity route ساخته می‌شود.

## 2) Hard-gate override
اگر mandatory requirement قطعاً fail است:
- Official Eligibility = FAIL
- route را در top recommendation قرار نده
- Base Fit می‌تواند برای diagnosis محاسبه شود ولی به‌وضوح «not currently eligible» باشد.

## 3) تفسیر Base/Practical Fit
- 85–100: Excellent fit
- 70–84: Strong
- 55–69: Possible / conditional
- 40–54: Weak
- <40: Low

## 4) Country reception context
این score حقوقی نیست و بهتر است عددی وارد ranking اصلی نشود.
خروجی کیفی:
`High | Mixed | Restrictive | Insufficient evidence`

Evidence dimensions:
- breadth/accessibility of relevant routes
- sponsor flexibility
- settlement/citizenship pathway
- dependant/family usability
- process transparency/reliability
- operational accessibility from applicant origin
- integration/onboarding evidence
- current community friction

این بخش «اخلاق مردم کشور» نیست.

## 5) Ranking
1. Official Eligibility
2. Practical Fit
3. Confidence
4. tie-breaker: user goals/timeline

## 6) Source quality
هر route assessment باید source trail داشته باشد:
- official sources
- Visa Atlas source-linked record
- last verified
- community signal ids if applied
- web sources for living cost/university search

## 7) Example
```json
{
  "route": "Example Skilled Route",
  "official_eligibility": "LIKELY",
  "base_fit": 78,
  "community_friction": -5,
  "practical_fit": 73,
  "confidence": 82,
  "blockers": [],
  "warnings": ["processing variability reported for applicants from Iran"]
}
```


---

# Community Signal Policy

## نقش
Community Signal لایه‌ی تجربه عملی است، نه منبع قانون.

### مجاز
- processing delay غیرعادی
- VAC/VFS/biometrics/appointment friction
- passport/medical/police certificate friction
- third-country travel
- payment/banking/sanctions obstacles
- exam/document access issues
- employer/university/supervisor reluctance
- scholarship/visa timeline conflict
- temporary operational disruption

### غیرمجاز به‌عنوان حقیقت رسمی
- «ایرانی‌ها را نمی‌گیرند» بدون source رسمی
- «این دانشگاه blacklist است» از یک anecdote
- «approval chance X٪»
- تغییر official eligibility

## Recency
- 0–90 روز: current/strong
- 91–365 روز: supporting
- >365 روز: historical، مگر دوباره تایید شود

## Evidence
- سوال بی‌پاسخ = signal نیست
- یک تجربه = watch/monitor، penalty صفر
- چند گزارش مستقل recent = می‌تواند penalty بدهد
- same person repeated posts = یک source
- reaction = corroboration مستقل نیست
- direct official notice/shared institutional email وزن بالاتری دارد ولی current official status را در صورت امکان verify کن

## Resolution
همیشه دنبال later resolution بگرد. closure قدیمی که reopened شده current penalty ندارد.

## Correlation
اگر delay باعث supervisor reluctance و scholarship risk شده، هر سه را جداگانه تا -15 stack نکن. `root_cause_id` مشترک بده و strongest justified adjustment را استفاده کن.

## Institution-level guardrail
یک case را policy دانشگاه معرفی نکن. penalty institution-level فقط وقتی:
- multiple independent recent reports؛ یا
- current written institutional policy؛ یا
- direct institutional communication که رفتار/policy روشن دارد.

## Runtime usage
1. index را بخوان.
2. فقط کشور relevant را باز کن.
3. signalهایی را filter کن که route/profile/process match دارند.
4. status/recency/confidence را چک کن.
5. resolved را صفر کن.
6. adjustment را downstream-only اعمال کن.
7. alert را با signal id و date ثبت کن.

## Privacy
نام، username، phone، email و user id افراد community را نمایش نده. Anonymous evidence IDs کافی است.


---

# Web & University Search Policy

## چه وقت وب لازم است؟
وب را زمانی استفاده کن که:
- current operational fact در Visa Atlas کافی نیست؛
- source record stale است؛
- هزینه زندگی ماهانه لازم است؛
- فرصت دانشگاهی/PhD/RA/academic job لازم است؛
- institution-specific admission/funding rule لازم است؛
- current embassy/VAC/provider status باید verify شود.

## ترتیب منبع
Official government/provider/university > recognized institutional network > reputable specialist source > community/aggregator.

## University search — فقط با consent
اطلاعات match:
- field/subfield
- degree level
- thesis/research interests
- methods/tools
- publications
- GPA/grade constraints
- language
- funding need
- desired countries/cities
- deadline

### Source priority
1. official university vacancies/admissions
2. official department/lab/supervisor page
3. EURAXESS or national research jobs portal
4. Academic Positions / FindAPhD / similar discovery source

برای هر opportunity ثبت کن:
- title
- university/institute
- city/country
- degree/role type
- funded status
- stipend/salary if published
- deadline
- explicit requirements
- official URL
- last checked date
- fit notes
- missing requirements
- visa relevance separately

وجود position به معنی eligibility یا visa feasibility نیست.

## Public-profile search of applicant
فقط با explicit consent و ترجیحاً با URL داده‌شده توسط فرد. اطلاعات حرفه‌ای/آکادمیک عمومی را خلاصه کن؛ اطلاعات حساس یا غیرمرتبط را جمع‌آوری نکن.

## Web conflict rule
اگر وب community با official source conflict دارد، official fact را برای قانون/status استفاده کن و community را فقط friction بنام.


---

# Report Card Specification

## هدف
کارنامه باید در 60–90 ثانیه قابل فهم باشد و source trail را از بین نبرد.

## Header
- نام/شناسه نمایشی فرد (اختیاری)
- تاریخ assessment
- assessment status: PROVISIONAL / FINAL
- primary goal
- preferred countries

## Executive result
- Best current route
- Best backup route
- Biggest blocker
- Next best action
- Overall confidence

## Country/Route cards
برای هر کشور 1–3 route:
- route name
- official eligibility
- base fit
- community friction
- practical fit
- confidence
- processing time
- paid-away visa/migration cost
- proof-of-funds/show-only جدا
- monthly living cost range
- settlement pathway
- operational status
- Iran-specific alert if applicable

## «فضای عملی پذیرش و ادغام مهاجر»
نمایش کیفی:
- High
- Mixed
- Restrictive
- Insufficient evidence

زیرش 2–4 دلیل evidence-based بنویس. هیچ حکم اخلاقی کلی درباره مردم/فرهنگ کشور صادر نکن.

## Cost block
```text
هزینه مهاجرت/درخواست: X–Y local currency
پول قابل‌برگشت یا proof-of-funds: Z
هزینه زندگی ماهانه: Low–Base–High
مبنای هزینه زندگی: city + household + date
```

## Source footer
برای هر عدد current مهم حداقل source URL/date را در JSON نگه دار. نسخه انسانی می‌تواند 3–6 source اصلی را نشان دهد و جزئیات کامل در JSON باشد.

## Visual design constraints
- زبان اصلی فارسی RTL
- route cards با hierarchy واضح
- scoreها با label و نه بدون توضیح
- warningها با icon و متن کوتاه
- community با رنگ/باکس جدا از official facts
- proof-of-funds با paid cost در یک عدد ادغام نشود
- image generator حق ندارد عدد جدید اختراع کند


---

# Monthly Cost of Living Method

Visa Atlas core APIs هزینه‌های رسمی migration و route را پوشش می‌دهند، اما monthly living cost را باید جداگانه برآورد کرد.

## Scope
هزینه زندگی ویزا requirement نیست مگر source رسمی صریحاً همان رقم را برای maintenance/funds تعیین کرده باشد.

## Minimum inputs
- destination country
- city if known
- household size
- student/worker/family mode
- rent included? yes/no

## Source priority
1. official statistics / municipal cost data where usable
2. official university cost-of-living guidance for students
3. employer/relocation official guides with date
4. reputable current market/crowdsourced source as secondary

## Components
- rent
- utilities + internet/mobile
- food/groceries
- local transport
- healthcare/insurance out-of-pocket
- childcare if relevant
- basic discretionary buffer

## Output
سه سناریو:
- low
- base
- high

با local currency و تاریخ. اگر city نامشخص است national range بده و confidence را پایین‌تر ببر.

## FX
تبدیل ارزی optional و فقط با نرخ current انجام شود. عدد اصلی local currency را حفظ کن.

## No double counting
هزینه living buffer را با proof-of-funds دوباره جمع نکن مگر برای cash-planning روشن باشد که funds restricted/untouchable است.
