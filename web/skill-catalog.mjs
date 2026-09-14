import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_ROOT = fileURLToPath(new URL("../plugins/hamrah/skills/", import.meta.url));
const PUBLISHED_SKILLS = [
  "hamrah",
  "hamrah-profile-normalizer",
  "hamrah-signal-builder",
  "hamrah-scorecard-engine",
  "hamrah-program-finder"
];

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
    })
    .sort();
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error("SKILL.md is missing frontmatter.");
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) frontmatter[key] = value;
  }
  if (!frontmatter.name || !frontmatter.description) {
    throw new Error("SKILL.md frontmatter must include name and description.");
  }
  return frontmatter;
}

function mimeTypeFor(filePath) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".csv")) return "text/csv";
  if (filePath.endsWith(".py")) return "text/x-python";
  return "text/plain; charset=utf-8";
}

const resourceContent = new Map();

export const SKILL_CATALOG = PUBLISHED_SKILLS.map((skillName) => {
  const skillDirectory = path.join(SKILLS_ROOT, skillName);
  if (!statSync(skillDirectory).isDirectory()) throw new Error(`Missing skill directory: ${skillName}`);
  const files = walkFiles(skillDirectory);
  if (files.length > 100) throw new Error(`Skill ${skillName} exceeds the 100-resource import limit.`);

  const resources = files.map((absolutePath) => {
    const relativePath = path.relative(skillDirectory, absolutePath).split(path.sep).join("/");
    const uri = `skill://hamrah/${skillName}/${relativePath}`;
    const bytes = readFileSync(absolutePath);
    resourceContent.set(uri, {
      uri,
      mimeType: mimeTypeFor(absolutePath),
      text: bytes.toString("utf8")
    });
    return { uri, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  });

  const skillUri = `skill://hamrah/${skillName}/SKILL.md`;
  return {
    uri: skillUri,
    frontmatter: parseFrontmatter(resourceContent.get(skillUri).text),
    resources
  };
});

export function getSkill(uri) {
  return SKILL_CATALOG.find((skill) => skill.uri === uri) ?? null;
}

export function readSkillResource(uri) {
  return resourceContent.get(uri) ?? null;
}

export const SKILL_RESOURCES = [...resourceContent.values()].map(({ uri, mimeType }) => ({
  uri,
  name: uri.split("/").at(-1),
  mimeType
}));
