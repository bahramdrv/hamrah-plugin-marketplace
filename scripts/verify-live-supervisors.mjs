const baseUrl = (process.argv[2] || "https://hamrah-plugin-marketplace.vercel.app").replace(/\/$/, "");
const expectedCommit = process.argv[3];
const mcpUrl = `${baseUrl}/mcp`;
const scope = { countryCode: "DE", field: "Computer Science", researchFocus: "Machine Learning" };

function requireResult(condition, message) {
  if (!condition) throw new Error(message);
}

async function rpc(id, method, params) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(30000)
  });
  requireResult(response.ok, `${method}: HTTP ${response.status}`);
  const body = await response.text();
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(body.split("\n").find((line) => line.startsWith("data: "))?.slice(6) || "null")
    : JSON.parse(body);
  requireResult(message?.result && !message.result.isError,
    `${method}: ${JSON.stringify(message?.error || message?.result)}`);
  return message.result;
}

async function discover(id) {
  const result = await rpc(id, "tools/call", {
    name: "discoverAcademicSupervisorCandidates", arguments: scope
  });
  return result.structuredContent;
}

async function main() {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(15000) });
  requireResult(response.ok, `health: HTTP ${response.status}`);
  const health = await response.json();
  requireResult(health.status === "ok", "health is not ok");
  requireResult(health.rateLimitStore === "redis", "shared Redis REST is not configured");
  if (expectedCommit) requireResult(health.deploymentCommit === expectedCommit,
    `deployment commit ${health.deploymentCommit} differs from expected ${expectedCommit}`);

  const listed = await rpc(1, "tools/list", {});
  requireResult(listed.tools.length === health.tools, "live tool count differs from health");
  requireResult(listed.tools.some((item) => item.name === "discoverAcademicSupervisorCandidates"),
    "supervisor discovery is not deployed");

  const first = await discover(2);
  requireResult(first?.coverage?.apiStatus === "searched",
    `OpenAlex search unavailable: ${JSON.stringify(first?.coverage?.failures)}`);
  requireResult(first.coverage.cacheWrite === "saved", "candidate names were not saved to Redis");
  requireResult(first.coverage.rorChecked > 0 && first.coverage.rorFailed === 0,
    `ROR organization checks failed: ${JSON.stringify(first.coverage.failures)}`);
  requireResult(first.candidates.length > 0, "bounded search returned no candidate names");
  requireResult(first.candidates.every((item) => item.verificationStatus === "unverified"),
    "API candidate was presented as verified");

  const second = await discover(3);
  requireResult(second?.coverage?.cacheRead === "hit", "candidate names were not read from Redis");
  requireResult(second.candidates.some((item) => item.openAlexId === first.candidates[0].openAlexId),
    "cached candidate was missing on the repeated request");
  requireResult(second.candidates.every((item) => item.verificationStatus === "unverified"),
    "cached candidate was presented as verified");

  process.stdout.write(`${JSON.stringify({
    baseUrl, deploymentCommit: health.deploymentCommit, tools: listed.tools.length,
    firstCandidateCount: first.candidates.length, secondCandidateCount: second.candidates.length,
    firstCacheWrite: first.coverage.cacheWrite, secondCacheRead: second.coverage.cacheRead,
    rorChecked: first.coverage.rorChecked,
    note: "Candidates remain unverified; current official institutional pages are still required before display."
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Live supervisor verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
