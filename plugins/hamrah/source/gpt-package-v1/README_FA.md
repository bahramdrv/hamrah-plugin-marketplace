# بسته راه‌اندازی Hamrah Main GPT

نسخه: 1.0 — 2026-09-13

این بسته برای یک GPT تسهیلگر مهاجرت طراحی شده که:

- داده‌های پایه متقاضی را مرحله‌ای جمع می‌کند؛
- با رضایت تسهیلگر وارد سوالات عمیق‌تر هر مسیر می‌شود؛
- داده‌های زنده Visa Atlas را با Action می‌خواند؛
- JSONهای Community Signal هر کشور را به‌عنوان لایه «اصطکاک عملی» می‌خواند؛
- در صورت نیاز وب را برای فرصت دانشگاهی، وضعیت عملیاتی و هزینه زندگی جست‌وجو می‌کند؛
- با تایید تسهیلگر محاسبه‌گرهای مهاجرتی را اجرا/بازسازی می‌کند؛
- خروجی نهایی را هم به‌صورت JSON نرمال‌شده، هم Scorecard و هم کارنامه فارسی تولید می‌کند؛
- برای صدور نسخه تصویری کارنامه، prompt تصویری دقیق می‌سازد.

## اصل معماری

```text
Applicant / Facilitator
        ↓
Progressive Intake
        ↓
Normalized Profile JSON
        ↓
Visa Atlas live Actions ─────┐
Community Signal JSON ───────┤
Web / University Search ─────┤
Approved Calculators ────────┘
        ↓
Official Eligibility + Base Fit
        ↓
Community Friction (downside-only)
        ↓
Practical Fit + Confidence
        ↓
Normalized Assessment JSON
        ↓
Scorecard + Persian Report Card + Image Prompt
```

## چه چیزی را در GPT بگذاریم؟

### Instructions
فایل `01_INSTRUCTIONS_HAMRAH_MAIN_GPT_FA.md` را در بخش Instructions بگذارید. نسخه کوتاه‌تر نیز در `01B_INSTRUCTIONS_COMPACT_FA.md` موجود است.

### Knowledge
این فایل‌ها را آپلود کنید:

- `knowledge/02_VISA_ATLAS_ROUTING_REFERENCE.md`
- `knowledge/03_FACILITATOR_INTERVIEW_PLAYBOOK_FA.md`
- `knowledge/04_SCORECARD_METHODOLOGY_FA.md`
- `knowledge/05_COMMUNITY_SIGNAL_POLICY_FA.md`
- `knowledge/06_WEB_AND_UNIVERSITY_SEARCH_POLICY_FA.md`
- `knowledge/07_REPORT_CARD_SPEC_FA.md`
- `knowledge/08_COST_OF_LIVING_METHOD_FA.md`
- همه فایل‌های `schemas/*.json`
- `knowledge/community_signals/index.json`
- فایل سیگنال هر کشور مثل `knowledge/community_signals/GBR.json`

**Raw Telegram/WhatsApp export را در Hamrah Main GPT نگذارید.** Raw chat آرشیو شواهد است؛ Main GPT باید JSON پردازش‌شده‌ی signal را مصرف کند.

### Actions
پیشنهاد اصلی: فایل `actions/visaatlas_core_openapi.yaml` را به‌عنوان Action schema وارد کنید.

- Authentication: `None`
- Server: `https://visaatlas.org`
- Privacy policy: `https://visaatlas.org/privacy`

گزینه دوم این است که OpenAPI رسمی Visa Atlas را از `https://visaatlas.org/api/openapi.json` مستقیماً import کنید؛ اما آن قرارداد endpointهای SEO/GEO زیادی هم دارد که برای Hamrah Main GPT لازم نیستند. نسخه curated این بسته سطح ابزار را کوچک‌تر و قابل‌کنترل‌تر نگه می‌دارد.

### Capabilities
در صورت امکان فعال کنید:

- Web search: روشن
- Image generation: روشن
- Data analysis / code execution: روشن، برای محاسبات و اعتبارسنجی JSON

اگر GPT شما از Actions استفاده می‌کند، اتصال Visa Atlas را به‌صورت Action نگه دارید؛ برای این GPT نیازی به app جداگانه برای Visa Atlas نیست.

## ترتیب استفاده از داده‌ها

1. دولت/رگولاتور/دانشگاه یا provider رسمی
2. Visa Atlas structured data + source URL + verification date
3. Community Signal برای friction عملی، نه قانون
4. وب معتبر برای اطلاعات خارج از پوشش Visa Atlas مثل فرصت دانشگاهی و هزینه زندگی
5. منابع ثانویه فقط با برچسب و تاریخ

## خروجی نهایی مورد انتظار

- `profile_normalized`
- `route_assessments[]`
- `scorecard`
- `report_card`
- `image_prompt`
- `sources[]`
- `data_gaps[]`

نمونه envelope در `templates/final_output.template.json` آمده است.

## نکته مهم درباره «اخلاق کشور برای پذیرفتن مهاجر»

در کارنامه از برچسب **«فضای عملی پذیرش و ادغام مهاجر»** استفاده کنید، نه قضاوت اخلاقی درباره یک ملت. این بخش باید از سیاست مهاجرت، مسیر اقامت، امکان همراه، شفافیت فرآیند، اصطکاک عملی، داده‌های ادغام و شواهد معتبر ساخته شود. برداشت‌های جامعه‌ای یا تجربه‌های شخصی فقط به‌صورت signal و با محدودیت confidence وارد شوند.

## QA
قبل از انتشار، سناریوهای `QA_TEST_CASES_FA.md` را در Preview اجرا کنید.
