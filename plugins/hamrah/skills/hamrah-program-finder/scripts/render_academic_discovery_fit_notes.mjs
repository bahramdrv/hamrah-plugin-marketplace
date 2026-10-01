import { pathToFileURL } from "node:url";
import { renderDiscoveryMarkdown } from "./academic_discovery_report_format.mjs";

export function renderPrivateAcademicFit({ publicReport, fitNotes }) {
  if (!publicReport?.markdown || !Array.isArray(publicReport.verifiedResults) || !Array.isArray(fitNotes)
    || fitNotes.length !== publicReport.verifiedResults.length) throw new Error("Supply the validated public report and one local fit note per verified result.");
  const lines = ["", "## تطبیق شخصی با شواهد دانشگاهی", ""], rejected = [];
  const seen = new Set();
  for (const note of fitNotes) {
    const result = publicReport.verifiedResults.find((r) => r.id === note.resultId);
    if (!result || seen.has(note.resultId) || !Array.isArray(note.checks) || !Array.isArray(note.gaps)
      || note.gaps.some((g) => typeof g !== "string" || !g.trim())) throw new Error("Invalid local fit note.");
    seen.add(note.resultId);
    const requirements = (result.claims ?? []).map((c, index) => ({ ...c, index })).filter((c) => ["requirement", "nationality"].includes(c.kind));
    const indexes = new Set();
    for (const check of note.checks) {
      if (!requirements.some((r) => r.index === check.claimIndex) || indexes.has(check.claimIndex)
        || !["met", "not_met", "unknown"].includes(check.result) || typeof check.applicantEvidence !== "string" || !check.applicantEvidence.trim()) throw new Error("Every personal comparison must reference one actual official requirement and stated applicant evidence.");
      indexes.add(check.claimIndex);
    }
    const complete = requirements.some((r) => r.kind === "requirement") && note.checks.length === requirements.length;
    const status = note.checks.some((c) => c.result === "not_met") ? "requirement_not_met" : !complete ? "insufficient_evidence"
      : note.checks.some((c) => c.result === "unknown") || note.gaps.length ? "conditional_fit" : "supported_fit";
    const labels = { requirement_not_met: "شرط بررسی‌شده برآورده نشده؛ از فهرست اصلی شخصی کنار گذاشته شد", insufficient_evidence: "شواهد تطبیق کافی نیست", conditional_fit: "تطبیق مشروط", supported_fit: "تطبیق با شرایط بررسی‌شده پشتیبانی می‌شود" };
    if (status === "requirement_not_met") rejected.push(result);
    lines.push(`### ${result.title}`, "", labels[status]);
    for (const check of note.checks) {
      const claim = result.claims[check.claimIndex];
      lines.push(`- [شرط رسمی](${claim.sourceUrl}): ${claim.excerpt}\n  مقایسه: ${check.applicantEvidence}؛ وضعیت: ${check.result}`);
    }
    for (const gap of note.gaps) lines.push(`- نیازمند تکمیل: ${gap}`);
    if (!complete) lines.push("- همهٔ شرایط تعیین‌کننده هنوز مقایسه نشده‌اند.");
    lines.push("- این تطبیق، پیش‌بینی پذیرش یا تأیید شرایط مهاجرتی نیست.", "");
  }
  if (rejected.length && (!publicReport.scope || !publicReport.coverage)) throw new Error("A complete public report is required to render personal exclusions.");
  const publicView = rejected.length ? renderDiscoveryMarkdown({ ...publicReport,
    verifiedResults: publicReport.verifiedResults.filter((r) => !rejected.includes(r)), discoveryCandidates: publicReport.discoveryCandidates ?? [],
    exclusions: [...(publicReport.exclusions ?? []), ...rejected.map((r) => ({ url: r.url, reason: "شرط رسمی بررسی‌شده با اطلاعات متقاضی برآورده نشده است" }))] }) : publicReport.markdown;
  return [publicView, ...lines].join("\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = ""; for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 1000000) throw new Error("Local report exceeds size limit."); }
  try { process.stdout.write(`${renderPrivateAcademicFit(JSON.parse(input))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
