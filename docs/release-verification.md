# Hamrah intelligence release verification

Run from the repository root before deployment:

```sh
npm ci
python3 -m pip install -r requirements-test.txt
npm run check:static
python3 -m compileall -q plugins/hamrah/skills
npm run verify:release
npm test
python3 -m pytest -q plugins/hamrah/skills/hamrah-profile-normalizer/tests plugins/hamrah/skills/hamrah-scorecard-engine/tests plugins/hamrah/skills/hamrah-signal-builder/tests
npm audit --omit=dev --audit-level=high
```

The GitHub Actions workflow runs these checks on pushes and pull requests. `verify:release` compiles every JSON schema in the shipped skills and source package, then reads every published Community Dataset through the deployed version 2, 3, or 4 reader. It fails on an invalid schema, dataset, broken evidence reference, declared `needs_review` or `fail` privacy state, or an inspected privacy finding. A withdrawn dataset is still validated and counted, though the server does not serve it. The workflow also checks JavaScript syntax, compiles Python, runs both test suites, and audits production npm dependencies for high or critical advisories. Release only after every check passes.

The Node suite covers request controls, publication and privacy, evidence retrieval, route claims, questions, opportunities, Lived Experiences, official statistics, IRVI, discovery, ideal candidate profiles, and version 2/3 compatibility. It uses fixtures and offline providers for deterministic behavior. It cannot establish that an external authority page is still current, that a real applicant is eligible, or that a sampled community report represents all applicants. Recheck time-sensitive official sources when answering a case.

### Verification recorded on 26 September 2026, before the origin/main merge

| Check | Local result |
| --- | --- |
| Node suite | 162 passed, 0 failed |
| Python tests | 21 test functions passed by direct invocation; `pytest` was unavailable locally and remains a CI check |
| Schema and published store | 18 schemas compiled; 1 published dataset valid; 0 withdrawn |
| Privacy failure check | A published copy marked `needs_review` caused release verification to fail |
| Static checks | JavaScript syntax, Python compilation, and `git diff --check` passed |
| Dependency audit | Offline npm audit found 0 vulnerabilities; the CI network audit is still pending |

The local environment could not download the pinned Python test dependencies, so the Python tests ran without `jsonschema`; the schema compiler above provided independent schema validation. A green CI run is required before deployment.

The subsequent merge with `origin/main` introduced 48 additional dataset files. The combined store currently scans 49 files and rejects 44 on privacy inspection (42 `needs_review`, 2 `fail`). The release check and the bundled-dataset test remain red until those records are reviewed and corrected; the pre-merge results above do not describe the combined release.

## How to read Hamrah's measures

| Measure | What it means | Limit |
| --- | --- | --- |
| Official eligibility | Requirement-level result from current attributable official evidence: PASS, POSSIBLE, FAIL, or UNKNOWN. | An unverified or stale requirement cannot establish an official pass or fail; decisive uncertainty blocks ranking. |
| Applicant Fit | A caller-supplied assessment of how a particular profile fits a route. | It is distinct from official eligibility and may be absent. |
| Practical Fit | The scorecard's Base Fit plus applicable Community Adjustment. Base Fit weighs eligibility, profile, finances, process, long-term potential, goals, and evidence quality. | It describes practical route fit, not approval odds. |
| Community Confidence | The amount and confidence of current applicable public-supported Signals, with separate warnings for private-only reports and unknown freshness. | It is evidence support, not a success rate or a substitute for official requirements. |
| Iranian Lived Experience | A source-linked observed milestone for a person with explicit public evidence of an Iranian connection, or a de-identified private report clearly labeled as such. | A case is an observation, not a representative sample; private reports can warn but cannot support public ranking. |
| Iranian Route Viability Index (IRVI) | A versioned, evidence-based estimate of practical route usability for an Iranian applicant profile, with components and its own confidence. | The current policy is provisional; a numeric IRVI may have low confidence and is never a visa approval probability. Ranking also needs the route-specific evidence threshold. |
| Official approval statistic | An authority-published applications/decisions count for a defined population and period, with a reproduced rate only when numerator and denominator match. | It is historical and population-specific; community reports and Lived Experiences never supply this rate. |

The MCP server has **no consent gate**. The product assumes consent was established before tool use, but the server cannot verify it. Only documented coarse applicant fields may go to the fixed Visa Atlas route-finder endpoint. See [the consent decision](adr/0002-no-mcp-consent-gate.md).

## نمونهٔ فارسی از نمایش نتیجه

> نمونهٔ نمایشی، نه ارزیابی یک متقاضی واقعی. تاریخ بررسی دادهٔ منتشرشده: **۲۵ سپتامبر ۲۰۲۶**. مسیر: کارت فرصت آلمان.
>
> **احراز شرایط رسمی:** نامشخص؛ بدون مدارک فردی و بررسی به‌روز شرایط، نتیجهٔ PASS/FAIL نمی‌دهیم. متن قانون، دو راه «نیروی متخصص» و «امتیازبندی» را بیان می‌کند: [§20a قانون اقامت آلمان](https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html) (بازیابی در ۲۵ سپتامبر ۲۰۲۶؛ شناسهٔ شواهد `evd_d89a1111114d7106ddf6145b72c3ff35`).
>
> **Applicant Fit:** ارزیابی نشده؛ اطلاعات متقاضی ارائه نشده است. **Practical Fit:** محاسبه نشده؛ بدون امتیاز پایه و سیگنال‌های قابل اعمال، عددی نمایش نمی‌دهیم. **Community Confidence:** سیگنال‌های مربوط باید جداگانه از نظر تازگی و پشتوانهٔ عمومی بررسی شوند؛ در این نمونه درجه‌ای ادعا نمی‌شود.
>
> **تجربهٔ زیستهٔ ایرانیان:** برای این نمونه مورد تأییدشده‌ای ارائه نشده است. **IRVI:** محاسبه نشده؛ حتی اگر عددی ارائه شود، «احتمال تأیید ویزا» نیست و باید همراه سطح اطمینان و نسخهٔ سیاست بیاید. **آمار رسمی تأیید:** برای این نمونه منبعی با صورت و مخرجِ هم‌تعریف ارائه نشده؛ نرخ تأیید گزارش نمی‌شود.
>
> **نکتهٔ اجرایی:** متن قانون، اشتغال تا میانگین ۲۰ ساعت در هفته را برای کارت فرصت ذکر می‌کند؛ همان [§20a](https://www.gesetze-im-internet.de/aufenthg_2004/__20a.html) با تاریخ بازیابی بالا. پیش از تصمیم، اعتبار فعلی قانون و اطلاعیهٔ [سفارت آلمان در تهران](https://teheran.diplo.de/ir-de) را دوباره بررسی کنید (اطلاعیه در ۲۵ سپتامبر ۲۰۲۶ بازیابی شد؛ شناسهٔ شواهد `evd_25377e5542fa730d7887be1d42a0159a`).

This example cites records in the committed German seed dataset. The dates describe retrieval, not a guarantee of continuing validity. No IRVI score, approval rate, or applicant score was invented for the example.
