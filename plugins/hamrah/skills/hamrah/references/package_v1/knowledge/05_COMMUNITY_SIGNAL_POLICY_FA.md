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
