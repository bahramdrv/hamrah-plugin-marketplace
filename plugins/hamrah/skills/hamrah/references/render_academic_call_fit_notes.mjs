#!/usr/bin/env node

// Local-only academic comparison. The remote MCP renderer receives public call facts only.
const safe = (value) => String(value).replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>]/g, "\\$&");

function render(input) {
  const report = input?.publicReport;
  const notes = input?.fitNotes;
  if (report?.schemaVersion !== "1.0.0" || typeof report.markdown !== "string"
    || !Array.isArray(report.results) || !Array.isArray(notes)) {
    throw new Error("validated publicReport and fitNotes are required");
  }
  if (notes.length !== report.results.length) throw new Error("provide one fit note per published call");
  if (!notes.length) return `${report.markdown.trim()}\n`;
  const blocks = notes.map((note, index) => {
    const call = report.results[index];
    if (note?.id !== call.id || !Array.isArray(note.comparisons)
      || note.comparisons.length !== call.conditions.length) {
      throw new Error(`fitNotes.${index} must cover every published condition for ${call.id}`);
    }
    const comparisons = note.comparisons.map((entry, conditionIndex) => {
      if (!["supported", "unverified", "not_met"].includes(entry?.status)) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.status is invalid`);
      }
      if (typeof entry.reason !== "string" || !entry.reason.trim() || entry.reason.length > 1000) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.reason is required`);
      }
      if (typeof entry.gap !== "string" || (entry.status !== "supported" && !entry.gap.trim()) || entry.gap.length > 300) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.gap is required for an unverified or unmet condition`);
      }
      const condition = call.conditions[conditionIndex];
      return `- [شرط ${conditionIndex + 1}](${condition.sourceUrl}): \`${entry.status}\` — ${safe(entry.reason)}${entry.gap.trim() ? `؛ شکاف: ${safe(entry.gap)}` : ""}`;
    });
    return `### ${safe(call.title)}\n${comparisons.join("\n")}`;
  });
  return `${report.markdown.trim()}\n\n**تناسب تحصیلی با اطلاعات ارائه‌شده**\n${blocks.join("\n\n")}\n`;
}

let raw = "";
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 200_000) throw new Error("input exceeds 200000 characters");
  }
  process.stdout.write(render(JSON.parse(raw)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
