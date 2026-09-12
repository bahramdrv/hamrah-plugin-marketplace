# Hamrah Scorecard Presentation

## هدف

این فایل نحوه نمایش Scorecard به کاربر را تعریف می‌کند.

JSON داخلی Scorecard Engine نباید به‌صورت خام به کاربر نمایش داده شود مگر اینکه خودش بخواهد.

---

## ساختار هر Route Card

### [Country] — [Route]

**وضعیت رسمی:** PASS / POSSIBLE / FAIL / UNKNOWN  
**Base Fit:** XX/100  
**Community Adjustment:** 0 / -5 / -10 / -15 / -20  
**Practical Fit:** XX/100  
**اعتماد به ارزیابی:** Low / Medium / High

### چرا؟

2 تا 4 دلیل اصلی و مشخص:

- دلیل 1
- دلیل 2
- دلیل 3

### نکته مهم

یکی از این موارد:

- blocker
- missing requirement
- operational risk
- community friction
- missing official data

### قدم بعدی

یک اقدام concrete و مرتبط با همان route.

---

## Official Eligibility Display

### PASS

> شرایط رسمی بررسی‌شده این مسیر را فعلاً پاس می‌کنی.

### POSSIBLE

> مسیر بالقوه قابل انجام است، اما هنوز یک یا چند شرط/مرحله باید تکمیل یا تأیید شود.

### FAIL

> در وضعیت فعلی حداقل یک شرط رسمی اجباری برآورده نشده.

Route با FAIL نباید در Ranked Recommendations بیاید.

### UNKNOWN

> داده رسمی کافی برای نتیجه‌گیری مطمئن نداریم.

Route با UNKNOWN نباید در Ranked Recommendations بیاید.

---

## Base Fit

Base Fit باید به‌عنوان «تطابق پروفایل با مسیر» توضیح داده شود.

هرگز نگویید:

> شانس ویزای شما 82٪ است.

بگویید:

> تطابق فعلی پروفایل شما با این مسیر 82 از 100 است.

---

## Community Adjustment

### اگر Community Signal موجود است

نمونه:

> **Community Adjustment: -10**  
> به‌خاطر گزارش‌های تکرارشونده و جدید درباره تأخیر مرحله endorsement که دقیقاً به مسیر شما مرتبط است.

### اگر Community dataset موجود نیست

نمایش:

> **Community Adjustment: 0**  
> داده کامیونیتی استانداردشده برای این کشور/مسیر فعلاً در دسترس نیست؛ بنابراین این عدد به معنی «نبود مشکل عملی» نیست.

### اگر Community coverage ناقص است

نمایش:

> **Community coverage: Partial**  
> داده موجود کامل نیست و ممکن است همه frictionهای عملی را پوشش ندهد.

---

## Practical Fit

```text
Practical Fit = Base Fit + Community Adjustment
```

این عدد برای ranking routeهای قابل‌رتبه‌بندی استفاده می‌شود.

Suggested interpretation:

- 85–100: Excellent
- 70–84: Strong
- 55–69: Moderate
- 40–54: Weak
- 0–39: Very Weak

اما اگر status رسمی FAIL یا UNKNOWN باشد، interpretation عددی نباید route را قابل توصیه نشان دهد.

---

## Confidence

### High

Profile و داده رسمی کافی و current است.

### Medium

ارزیابی ممکن است، ولی بعضی داده‌های مهم ناقص یا conditional هستند.

### Low

عدم قطعیت material وجود دارد.

Confidence کیفیت ارزیابی است، نه کیفیت route.

---

## Ranked Recommendations

فقط routeهایی که:

```text
usable_for_ranking = true
```

دارند در ranking اصلی قرار بگیرند.

ترتیب:

1. Practical Fit
2. اگر برابر بود: Confidence
3. اگر هنوز برابر بود: strength of official eligibility

Preference نباید feasibility ranking را تغییر دهد.

---

## Preference

اگر preference layer موجود است، جدا نمایش بده:

```text
Practical Fit: 58
Personal Preference: High
```

توضیح نمونه:

> این کشور از نظر علاقه شخصی برای شما جذاب است، اما مسیر مهاجرتی فعلی نسبت به گزینه‌های دیگر ضعیف‌تر است.

---

## Final Summary

در پایان:

### بهترین گزینه‌های فعلی

1. Country — Route — Practical Fit
2. Country — Route — Practical Fit
3. Country — Route — Practical Fit

### مسیرهایی که فعلاً Block هستند

در صورت relevant بودن:

- Country — Route — reason

### سه قدم بعدی

حداکثر 1 تا 3 اقدام مشخص.

مثال:

1. نمرات component آیلتس را مشخص کن.
2. وضعیت skills assessment را بررسی کن.
3. بودجه قابل استفاده برای 12 ماه اول را مشخص کن.

از checklist عمومی و طولانی پرهیز کن.
