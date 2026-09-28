# Hamrah intelligence release verification

Run from the repository root before deployment:

```sh
npm ci
python3 -m pip install --no-deps -r requirements-test.txt
npm run check:static
python3 -m compileall -q plugins/hamrah/skills
npm run verify:release
npm test
python3 -m pytest -q plugins/hamrah/skills/hamrah-profile-normalizer/tests plugins/hamrah/skills/hamrah-scorecard-engine/tests plugins/hamrah/skills/hamrah-signal-builder/tests plugins/hamrah/skills/hamrah-program-finder/tests
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

The subsequent merge with `origin/main` introduced 48 additional dataset files. The combined store now scans and validates all 49 files after review of the original 44 privacy findings. See the [legacy dataset privacy review](dataset-privacy-review.md) for the original flagged paths and resolution. The pre-merge results above remain a historical record; the combined release needs its own complete CI run before deployment.

### Combined local verification on 26 September 2026

| Check | Result |
| --- | --- |
| Locked installs | `npm ci` passed; the fully pinned Python test packages installed with `--no-deps` in an isolated directory |
| Node suite | 172 passed, 0 failed |
| Python suite | 21 passed with `pytest` and `jsonschema` |
| Schemas and published data | 19 schemas compiled; all 49 published datasets valid with privacy `pass` |
| Static checks | JavaScript syntax, Python compilation, and Git whitespace checks passed |
| Production dependency audit | Online npm audit found 0 vulnerabilities |

The combined release passed both GitHub Actions workflows on commit `1fd29d2`: [Verify release](https://github.com/bahramdrv/hamrah-plugin-marketplace/actions/runs/36221292571) and [Community signals](https://github.com/bahramdrv/hamrah-plugin-marketplace/actions/runs/36221292596). The production MCP endpoint was then exercised with `npm run verify:live`; its synthetic checks passed. Run that command after each production deployment and compare `deploymentCommit` with the commit intended for release.

On 27 September 2026, `npm run verify:live` passed against the production endpoint and reported `deploymentCommit` `067f35c782fe83793fcf6c5b9fa97ffb84ce614a`, matching the then-current `main`. It reported 45 tools, 5 skills, and 56 valid datasets. The synthetic eligibility check remained `UNKNOWN` and unrankable; community coverage was `partial` with seven signals excluded for unrecorded evidence maturity. Academic opportunities, Iranian Lived Experiences, and official approval statistics each returned `no_coverage` for the synthetic query. These results verify the endpoint behavior checked by the script, not completeness of immigration evidence.

### Verified Open Academic Opportunities deployment check

After deploying the opportunity slice, run `npm run verify:live:opportunities -- https://hamrah-plugin-marketplace.vercel.app <deployed-commit-sha>`. This checks `/health`, confirms the intended commit and registered tool, then calls the public-fact renderer with clearly synthetic opening and nationality-exclusion evidence. It sends no applicant profile. Passing this smoke test proves the deployed renderer accepts and presents the synthetic contract; it does not prove a real posting is current or that a live search found one. The separate anonymous acceptance replay in the feature ticket checks current official pages.

The broader `npm run verify:live` sends a complete synthetic applicant profile to the remote endpoint. Review its data boundary before using it for this feature's deployment check.

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
