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
