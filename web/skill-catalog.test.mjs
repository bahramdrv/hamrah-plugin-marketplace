import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
      const resource = readSkillResource(advertised.uri);
      assert.ok(resource);
      const digest = `sha256:${createHash("sha256").update(resource.text).digest("hex")}`;
      assert.equal(digest, advertised.digest);
    }
  }
});
