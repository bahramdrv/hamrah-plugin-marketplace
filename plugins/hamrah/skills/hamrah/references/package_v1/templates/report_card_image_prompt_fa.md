# Prompt تصویر کارنامه — Template

این prompt را فقط بعد از آماده شدن report JSON پر کن. مدل تصویر حق ندارد عدد یا ادعای جدید بسازد.

## Variant A — Persian premium report card

```text
یک اینفوگرافیک حرفه‌ای فارسی RTL برای «کارنامه مسیر مهاجرت» بساز.
سبک: clean editorial dashboard، رسمی ولی انسانی، بدون ظاهر تبلیغاتی.
ابعاد: portrait 4:5.

فقط از داده‌های زیر استفاده کن و هیچ عدد، رتبه، پرچم، route یا source جدیدی اختراع نکن:

نام نمایشی: {{display_name}}
تاریخ: {{assessment_date}}
هدف: {{primary_goal}}
کشورهای مورد علاقه: {{preferred_countries}}

بهترین مسیر: {{best_route}}
Practical Fit: {{best_practical_fit}}/100
Official Eligibility: {{best_eligibility}}
Confidence: {{best_confidence}}/100
مهم‌ترین مانع: {{biggest_blocker}}

کارت کشورها:
{{country_cards_compact_json}}

برای هر کارت کشور این موارد را کوتاه نشان بده:
- مسیر
- Eligibility
- Base Fit
- Community Friction
- Practical Fit
- هزینه مهاجرت/درخواست
- proof-of-funds به‌صورت جدا
- هزینه زندگی ماهانه
- زمان پردازش
- مسیر اقامت بلندمدت
- فضای عملی پذیرش و ادغام مهاجر

هشدارها:
{{alerts}}

فوتر کوچک:
«این امتیاز احتمال تایید ویزا نیست. داده‌های رسمی و تاریخ‌دار + لایه اصطکاک عملی Community.»

طراحی باید RTL واقعی، typography خوانا، spacing زیاد، route ranking واضح و warning box جدا داشته باشد.
```

## Variant B — Executive landscape
برای جلسه تسهیلگر، همان داده‌ها را در 16:9 با سه ستون کشور و یک ستون Action Plan نمایش بده.

## Variant C — Minimal certificate
نسخه شبیه certificate رسمی با فقط best route، backup، 4 score اصلی، 3 مانع، 3 اقدام بعدی و QR-placeholder برای JSON source trail.
