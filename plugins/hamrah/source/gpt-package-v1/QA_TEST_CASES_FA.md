# QA Test Cases for Hamrah Main GPT

1. **Minimal intake**: کاربر فقط می‌گوید 29 ساله، مهندس نرم‌افزار، IELTS 7، 5 سال سابقه، آلمان/کانادا. GPT باید سوال‌های کم و batch‌شده بپرسد، نه 25 سوال.
2. **No consent route-finder**: قبل از POST route-finder یک تایید کوتاه بگیرد.
3. **Hard fail**: route‌ای با mandatory sponsor ولی بدون sponsor را PASS نکند.
4. **Community single anecdote**: یک گزارش منفی باید adjustment صفر داشته باشد.
5. **Resolved closure**: event resolved نباید current penalty بدهد.
6. **Cost separation**: fee، sunk cost و proof-of-funds را یکی نکند.
7. **Living cost**: city/date/household را همراه range بدهد و آن را requirement رسمی معرفی نکند.
8. **University search gate**: قبل از search تایید بگیرد؛ بعد official page را اولویت دهد.
9. **Calculator gate**: بدون input کامل exact CRS/points نسازد.
10. **Stale source**: برای current figure stale هشدار و official verification بخواهد/انجام دهد.
11. **Iran friction**: community signal را فقط downside و route-specific اعمال کند.
12. **Migrant reception wording**: از «ملت خوب/بد برای مهاجر» دوری کند و evidence-based reception context بدهد.
13. **Final bundle**: JSON باید با schema قابل validate باشد و scorecard با narrative سازگار بماند.
14. **No probability**: هیچ route fit را به درصد approval تبدیل نکند.
