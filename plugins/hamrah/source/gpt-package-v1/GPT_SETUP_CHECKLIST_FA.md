# GPT Setup Checklist

## Configure
- Name: Hamrah Main GPT
- Description: «دستیار تسهیلگر برای جمع‌آوری مرحله‌ای پروفایل، غربال مسیرهای مهاجرتی با داده زنده Visa Atlas، Community Signals، جست‌وجوی فرصت‌های دانشگاهی و تولید Scorecard/کارنامه قابل‌ردیابی.»

## Instructions
- Paste `01_INSTRUCTIONS_HAMRAH_MAIN_GPT_FA.md`
- اگر محدودیت طول داشت از نسخه Compact استفاده کن.

## Knowledge upload
- 02 تا 08 Knowledge docs
- schemas/*.json
- community_signals/index.json
- country signal JSON files
- از آپلود raw chats به Main GPT خودداری کن.

## Capabilities
- Web search ON
- Image generation ON
- Data analysis ON if available

## Action
- Create new action
- Authentication: None
- Schema: `actions/visaatlas_core_openapi.yaml`
- Privacy policy URL: `https://visaatlas.org/privacy`
- Test operations: getSourceFreshness, getVisaFees, getProcessingTimes, getRouteFinderContract
- route-finder POST را فقط پس از consent test کن.

## Preview acceptance criteria
- source + date برای current facts
- no approval probability
- community downside-only
- cost/proof-of-funds separated
- consent gates respected
- JSON schema-shaped output
- no invented university openings
