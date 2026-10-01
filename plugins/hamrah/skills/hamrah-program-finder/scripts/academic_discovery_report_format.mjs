const titles = { university: "دانشگاه", program: "برنامهٔ تحصیلی", supervisor: "استاد", masters: "پذیرش کارشناسی ارشد",
  phd: "موقعیت دکتری", postdoc: "پسادکتری", research_job: "موقعیت پژوهشی", funding: "بورسیه", grant: "گرنت پژوهشی" };
export function renderDiscoveryMarkdown(report) {
  const lines = ["# گزارش جستجوی دانشگاهی", "", `نوع: ${titles[report.scope.type]} · موضوع: ${report.scope.field} · بررسی: ${report.checkedAt}`,
    report.inputCompleteness.mode === "exploratory" ? "این خروجی اکتشافی است؛ تطبیق شخصی هنوز کامل نشده است." : "این گزارش ارتباط پژوهشی را بررسی می‌کند؛ پیش‌بینی پذیرش نیست.",
    "", "## نتایج تأییدشده", ""];
  if (report.scope.type === "grant") lines.push("گرنت پژوهشی اعطاشده، مدرک وجود بورس یا فاند قابل دریافت برای دانشجو نیست.", "");
  const fundingLabels = { guaranteed: "حقوق یا بستهٔ فاند مستند", competitive: "فاند رقابتی؛ دریافت تضمین نشده", unknown: "فاند نامعلوم" };
  for (const result of report.verifiedResults) {
    lines.push(`- **${result.title}** — ${result.institution} · ${result.countryCode} · [منبع رسمی](${result.url})`);
    lines.push(`  وضعیت: ${result.applicationStatus === "open" ? "فراخوان باز" : "وضعیت فراخوان نامعلوم"}؛ ${fundingLabels[result.fundingStatus] ?? "فاند نامعلوم"}؛ مهلت: ${result.deadline ?? "نامعلوم/ذکر نشده"}`);
    if (result.kind === "supervisor") lines.push(`  جذب پژوهشی: ${result.recruitmentStatus === "documented" ? "شاهد رسمی جذب موجود است" : "نامعلوم"}`);
    if (result.researchFit) lines.push(`  ارتباط پژوهشی: ${result.researchFit.matchedTopics.join("، ") || "نیازمند بررسی"}؛ ${result.researchFit.explanation}`);
    lines.push(`  تاریخ بررسی رسمی: ${result.checkedAt}`);
    for (const claim of result.claims ?? []) lines.push(`  شاهد ${claim.kind}: ${claim.excerpt.replace(/[\r\n]/g, " ")}`);
  }
  if (!report.verifiedResults.length) lines.push("هنوز نتیجه‌ای با شواهد رسمی کافی تأیید نشده است.");
  lines.push("", "## سرنخ‌های نیازمند بررسی", "");
  for (const result of report.discoveryCandidates) lines.push(`- **${result.kind === "supervisor" ? "سرنخ پژوهشگر؛ نام و وابستگی نیازمند بررسی رسمی است" : result.title}** — [منبع](${result.url})؛ نیازمند بررسی رسمی`);
  if (!report.discoveryCandidates.length) lines.push("سرنخی در دامنهٔ دریافت‌شده پیدا نشد؛ این به معنی نبود فرصت نیست.");
  lines.push("", "## پوشش بررسی", "", `منابع دریافت‌شده: ${report.coverage.sources.filter((s) => s.status === "ok").map((s) => s.source).join("، ") || "هیچ‌کدام"}`,
    `کشورها: ${report.coverage.countriesChecked.join("، ") || "تعیین نشده"}؛ پوشش کامل جهانی احراز نشده است.`);
  for (const failure of report.coverage.failures) lines.push(`- ${failure.source}: ${failure.reason}`);
  if (report.coverage.truncated) lines.push("محدودیت دریافت/تعداد نتیجه اعمال شد؛ بررسی کامل انجام نشده است.");
  if (report.exclusions.length) lines.push("", "## موارد کنارگذاشته‌شده", "", ...report.exclusions.map((r) => `- [منبع](${r.url}): ${r.reason}`));
  if (report.changes.length) lines.push("", "## تغییر نسبت به گزارش قبلی", "", ...report.changes.map((r) => `- [منبع](${r.url}): ${r.status}`));
  lines.push("", "## اقدام بعدی", "", ...report.nextActions.map((item) => `- ${item}`));
  return lines.join("\n");
}
