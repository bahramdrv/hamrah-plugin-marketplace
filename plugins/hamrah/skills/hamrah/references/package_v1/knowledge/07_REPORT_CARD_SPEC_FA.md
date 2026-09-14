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
