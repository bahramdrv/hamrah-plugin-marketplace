# Community Signals Runtime Folder

فقط فایل‌های پردازش‌شده country-level را اینجا بگذارید، نه raw chat export.

Naming پیشنهادی:
- `GBR.json`
- `CAN.json`
- `AUS.json`
- `DEU.json`
- `NLD.json`

`index.json` باید فقط کشورهایی را لیست کند که فایل آنها واقعاً وجود دارد و پردازش کامل/QA شده است.

برای ساخت فایل جدید از pipeline جدا و master extractor prompt استفاده کنید. Main GPT نباید خودش از یک raw Telegram export عظیم signal نهایی استنتاج کند.
