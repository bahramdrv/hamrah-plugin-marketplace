import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getSkill, readSkillResource, SKILL_CATALOG } from "./skill-catalog.mjs";

test("publishes exactly five importable Hamrah skills", () => {
  assert.equal(SKILL_CATALOG.length, 5);
  assert.deepEqual(SKILL_CATALOG.map((skill) => skill.frontmatter.name), [
    "hamrah",
    "hamrah-profile-normalizer",
    "hamrah-signal-builder",
    "hamrah-scorecard-engine",
    "hamrah-program-finder"
  ]);
});

test("every skill resource is readable and matches its advertised digest", () => {
  for (const skill of SKILL_CATALOG) {
    assert.equal(getSkill(skill.uri), skill);
    assert.ok(skill.resources.some((resource) => resource.uri === skill.uri));
    assert.ok(skill.resources.length <= 100);
    for (const advertised of skill.resources) {
      assert.doesNotMatch(advertised.uri, /(?:__pycache__|\.pyc$|\/\.[^/])/);
      const resource = readSkillResource(advertised.uri);
      assert.ok(resource);
      const digest = `sha256:${createHash("sha256").update(resource.text).digest("hex")}`;
      assert.equal(digest, advertised.digest);
    }
  }
});

test("temporary private build artifacts are absent from published skill resources", async () => {
  const root = fileURLToPath(new URL("../plugins/hamrah/skills/hamrah-program-finder/", import.meta.url));
  const directory = mkdtempSync(path.join(root, ".publication-test-"));
  try {
    writeFileSync(path.join(directory, "scratch.txt"), "Private temporary build artifact, not a skill resource.");
    const catalog = await import(`./skill-catalog.mjs?fixture=${path.basename(directory)}`);
    const leaked = catalog.SKILL_RESOURCES.filter((resource) => resource.uri.includes(`/${path.basename(directory)}/`));
    assert.deepEqual(leaked, []);
    assert.equal(catalog.readSkillResource(`skill://hamrah/hamrah-program-finder/${path.basename(directory)}/scratch.txt`), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
