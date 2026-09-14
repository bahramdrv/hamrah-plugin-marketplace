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
