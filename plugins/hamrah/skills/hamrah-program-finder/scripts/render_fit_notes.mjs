// Local-only presentation step. Applicant comparisons never go to the MCP server.
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};

const safeText = (value) => String(value).replace(/\s+/g, " ").trim()
  .replace(/[\\`*_[\]<>]/g, "\\$&");

function programsIn(markdown) {
  const programs = [];
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^### \[([^\]]+)\]\(https:\/\/[^)\s]+\)$/);
    if (heading) {
      current = { title: heading[1], requirementUrls: [] };
      programs.push(current);
      continue;
    }
    if (current && line.startsWith("- admission requirement: ")) {
      const source = line.match(/\(\[source\]\((https:\/\/[^)\s]+)\)\)/);
      if (source) current.requirementUrls.push(source[1]);
    }
  }
  return programs;
}

function render(input) {
  if (!input || typeof input.rendererMarkdown !== "string" || !Array.isArray(input.fitNotes)) {
    throw new Error("rendererMarkdown and fitNotes are required");
  }
  const block = input.rendererMarkdown.trim();
  const programs = programsIn(block);
  if (programs.length < 1 || programs.length > 5 || programs.length !== input.fitNotes.length) {
    throw new Error("provide one fit note per program in the renderer block");
  }
  const notes = input.fitNotes.map((note, index) => {
    const program = programs[index];
    if (!Number.isInteger(note?.admissionRequirementIndex) || !program.requirementUrls[note.admissionRequirementIndex]) {
      throw new Error(`fitNotes.${index}.admissionRequirementIndex must select a cited admission requirement`);
    }
    if (typeof note.reason !== "string" || !note.reason.trim() || note.reason.length > 1000) {
      throw new Error(`fitNotes.${index}.reason is required and must be under 1000 characters`);
    }
    if (!Array.isArray(note.gaps) || note.gaps.length < 1 || note.gaps.length > 10
      || note.gaps.some((gap) => typeof gap !== "string" || !gap.trim() || gap.length > 300)) {
      throw new Error(`fitNotes.${index}.gaps needs 1–10 short gaps`);
    }
    return `- [${program.title}](${program.requirementUrls[note.admissionRequirementIndex]}): ${safeText(note.reason)} Gaps: ${note.gaps.map(safeText).join("; ")}.`;
  });
  return `${block}\n\n**Applicant Fit Notes**\n${notes.join("\n")}\n`;
}

let raw = "";
try {
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("input exceeds 100000 characters");
  }
  process.stdout.write(render(JSON.parse(raw)));
} catch (error) {
  fail(error.message);
}
