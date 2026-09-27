import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pluginRoot = new URL("../../", import.meta.url);
const legacy = JSON.parse(readFileSync(new URL(".mcp.json", pluginRoot), "utf8"));

test("installed Codex plugin uses the deployed MCP instead of an unbundled local runtime", () => {
  const server = legacy.mcpServers?.["visa-atlas"];
  assert.equal(server?.type, "http");
  assert.equal(server?.url, "https://hamrah-plugin-marketplace.vercel.app/mcp");
  assert.equal(server?.command, undefined);
});
