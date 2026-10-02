// Read-only release check: public plugin resources, never applicant data or API keys.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SKILL_CATALOG, readSkillResource } from "../web/skill-catalog.mjs";

const base = (process.argv[2] ?? "https://hamrah-plugin-marketplace.vercel.app").replace(/\/$/, "");
const expectedCommit = process.argv[3];
const rootPlugin = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url)));
const plugin = JSON.parse(readFileSync(new URL("../plugins/hamrah/.codex-plugin/plugin.json", import.meta.url)));
assert.equal(rootPlugin.version, plugin.version, "Plugin manifests must agree on release version");

let id = 0;
async function rpc(method, params) {
  const response = await fetch(`${base}/mcp`, { method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`);
  const raw = await response.text();
  const message = JSON.parse(raw.includes("data: ") ? raw.split("\n").find((line) => line.startsWith("data: ")).slice(6) : raw);
  assert.ok(message.result && !message.result.isError, `${method}: MCP error`);
  return message.result;
}
const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200);
const health = await response.json();
assert.equal(health.status, "ok");
if (expectedCommit) assert.equal(health.deploymentCommit, expectedCommit);
const [tools, published] = await Promise.all([rpc("tools/list", {}), rpc("skills/list", {})]);
for (const name of ["discoverAcademicMatches", "verifyAcademicEvidence", "renderAcademicDiscoveryReport"])
  assert.ok(tools.tools.some((tool) => tool.name === name), `Missing academic tool: ${name}`);
assert.equal(published.skills.length, SKILL_CATALOG.length);
let advertisedResources = 0;
for (const local of SKILL_CATALOG) {
  const remote = published.skills.find((skill) => skill.uri === local.uri);
  assert.ok(remote, `Missing published skill: ${local.uri}`);
  assert.deepEqual(remote.resources, local.resources, `Published resource manifest differs: ${local.uri}`);
  advertisedResources += local.resources.length;
}
const checkedResources = [
  "hamrah/SKILL.md", "hamrah/references/workflow.md", "hamrah/references/academic_discovery_workflow.md",
  "hamrah/references/api_assisted_academic_calls.md", "hamrah/references/academic_supervisor_leads.md",
  "hamrah-program-finder/SKILL.md", "hamrah-program-finder/scripts/academic_discovery_report_format.mjs",
  "hamrah-program-finder/scripts/render_academic_discovery_fit_notes.mjs"
];
await Promise.all(checkedResources.map(async (path) => {
  const uri = `skill://hamrah/${path}`;
  const result = await rpc("resources/read", { uri });
  assert.equal(result.contents.length, 1);
  assert.equal(result.contents[0].uri, uri);
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  assert.equal(digest(result.contents[0].text), digest(readSkillResource(uri).text), `Published content differs: ${uri}`);
}));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), base, deploymentCommit: health.deploymentCommit,
  localPluginVersion: plugin.version, tools: tools.tools.length, skills: published.skills.length,
  advertisedResourcesMatched: advertisedResources, actualResourcesMatched: checkedResources.length,
  note: "Verifies server resources against the local release; installed Codex plugins update separately through the marketplace." }, null, 2));
