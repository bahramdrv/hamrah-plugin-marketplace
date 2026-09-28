#!/usr/bin/env node

// Local-only applicant comparison. The MCP presentation tool receives only public opening facts.
const safe = (value) => String(value).replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>]/g, "\\$&");
const sourceLink = (line) => line.match(/\[official page\]\((https:\/\/[^)\s]+)\)/)?.[1] ?? null;

function openingsIn(markdown) {
  const openings = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^### \[(.+)\]\(https:\/\/[^)\s]+\)$/);
    if (heading) {
      current = { title: heading[1], conditionUrls: [] };
      openings.push(current);
    } else if (current && line.startsWith("- academic condition: ")) {
      const url = sourceLink(line);
      if (!url) throw new Error("every academic condition needs an official source link");
      current.conditionUrls.push(url);
    }
  }
  return openings;
}

function render(input) {
  if (!input || typeof input.rendererMarkdown !== "string" || !Array.isArray(input.fitNotes)) {
    throw new Error("rendererMarkdown and fitNotes are required");
  }
  const block = input.rendererMarkdown.trim();
  const openings = openingsIn(block);
  if (openings.length > 5 || openings.length !== input.fitNotes.length) {
    throw new Error("provide one fit note per opening in the renderer block");
  }
  if (!openings.length) return `${block}\n`;
  const notes = input.fitNotes.map((note, index) => {
    const opening = openings[index];
    if (!Array.isArray(note?.comparisons) || note.comparisons.length !== opening.conditionUrls.length) {
      throw new Error(`fitNotes.${index}.comparisons must cover every published academic condition`);
    }
    const lines = note.comparisons.map((comparison, conditionIndex) => {
      if (!["supported", "unverified", "not_met"].includes(comparison?.status)) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.status is invalid`);
      }
      if (typeof comparison.reason !== "string" || !comparison.reason.trim() || comparison.reason.length > 1000) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.reason is required`);
      }
      if (typeof comparison.gap !== "string" || (comparison.status !== "supported" && !comparison.gap.trim()) || comparison.gap.length > 300) {
        throw new Error(`fitNotes.${index}.comparisons.${conditionIndex}.gap is required for unverified or unmet conditions`);
      }
      return `- [condition ${conditionIndex + 1}](${opening.conditionUrls[conditionIndex]}): \`${comparison.status}\` — ${safe(comparison.reason)}${comparison.gap.trim() ? `; gap: ${safe(comparison.gap)}` : ""}`;
    });
    return `### ${opening.title}\n${lines.join("\n")}`;
  });
  return `${block}\n\n**Applicant academic fit**\n${notes.join("\n\n")}\n`;
}

let raw = "";
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("input exceeds 100000 characters");
  }
  process.stdout.write(render(JSON.parse(raw)));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
