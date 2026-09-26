import { readFileSync } from "node:fs";

const baseUrl = (process.argv[2] || "https://hamrah-plugin-marketplace.vercel.app").replace(/\/$/, "");
const mcpUrl = `${baseUrl}/mcp`;

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
  requireResult(message?.result && !message.result.isError, `${method}: ${JSON.stringify(message?.error || message?.result)}`);
  return message.result;
}

async function tool(id, name, args) {
  return (await rpc(id, "tools/call", { name, arguments: args })).structuredContent;
}

async function main() {
  const healthResponse = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(15000) });
  requireResult(healthResponse.ok, `health: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  requireResult(health.status === "ok", "health is not ok");

  const listed = await rpc(1, "tools/list", {});
  const names = new Set(listed.tools.map((item) => item.name));
  for (const name of ["searchCommunitySignals", "searchRouteClaims", "normalizeApplicantProfile", "evaluateRouteEligibility", "evaluateCommunityAdjustment", "finalizeAssessment", "findMatchingVisaRoutes"]) {
    requireResult(names.has(name), `missing live tool: ${name}`);
  }
  const skills = await rpc(2, "skills/list", {});
  requireResult(skills.skills.length === health.skills, "live skill count differs from health");

  // Every applicant fact below is synthetic; this command never sends a real profile.
  const normalized = await tool(3, "normalizeApplicantProfile", {
    profile: {
      applicant: { nationalities: ["Iran"], current_country_of_residence: "Germany", applying_from: "Germany" },
      goals: { primary_goal: "Skilled work" }
    }
  });
  requireResult(normalized.valid && normalized.normalizedProfile.intake_status === "needs_more_information", "normalization did not preserve unknown fields");

  const signals = await tool(4, "searchCommunitySignals", { countryCode: "DEU", limit: 2 });
  requireResult(signals.resultCount > 0 && signals.coverage.invalidDatasets.length === 0, "German signals missing or invalid");
  const claims = await tool(5, "searchRouteClaims", { countryCode: "DEU", limit: 2 });
  requireResult(claims.resultCount > 0, "German route claims missing");

  const eligibility = await tool(6, "evaluateRouteEligibility", {
    countryCode: "DEU", routeCode: "opportunity_card", officialDataQuality: "current",
    requirements: [{ requirementId: "synthetic", title: "Unverified requirement", result: "met", explanation: "Synthetic applicant statement only." }]
  });
  requireResult(eligibility.officialEligibility.status === "UNKNOWN", "unverified eligibility was not kept UNKNOWN");
  const community = await tool(7, "evaluateCommunityAdjustment", { countryCode: "DEU", route: "opportunity_card" });
  requireResult(community.checked === true, "community evaluation did not complete");

  const profile = JSON.parse(readFileSync(new URL("../plugins/hamrah/skills/hamrah-profile-normalizer/examples/skilled_worker_profile.json", import.meta.url)));
  const scorecard = JSON.parse(readFileSync(new URL("../plugins/hamrah/skills/hamrah-scorecard-engine/examples/strong_route.json", import.meta.url)));
  const finalized = await tool(8, "finalizeAssessment", {
    applicantProfile: profile, scorecard,
    communityEvaluations: [{ countryCode: "DEU", routeCode: "opportunity_card", checked: true, coverage: "strong", totalAdjustment: -5, checkedAt: "2026-09-18" }]
  });
  requireResult(finalized.finalized === true, "synthetic final scorecard failed validation");

  const routes = await tool(9, "findMatchingVisaRoutes", { nationalityIso: "IR", targetDestinations: ["DE"], routeIntent: "work", limit: 2 });
  requireResult(routes.source === "Visa Atlas" && routes.data?.results?.length > 0, "Visa Atlas returned no synthetic route results");

  const coverage = {};
  for (const [index, name] of ["searchCommunityQuestions", "searchAcademicOpportunities", "searchIranianLivedExperiences", "searchOfficialApprovalStatistics"].entries()) {
    const result = await tool(10 + index, name, { limit: 1 });
    coverage[name] = { resultCount: result.resultCount, status: result.coverage.status };
  }

  process.stdout.write(`${JSON.stringify({
    baseUrl, deploymentCommit: health.deploymentCommit, tools: listed.tools.length, skills: skills.skills.length,
    datasets: signals.coverage.validDatasets, germanSignals: signals.resultCount, germanClaims: claims.resultCount,
    normalization: normalized.normalizedProfile.intake_status, eligibility: eligibility.officialEligibility.status,
    communityCoverage: community.coverage, syntheticScorecardFinalized: finalized.finalized,
    visaAtlasRoutes: routes.data.results.length, coverage
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Live MCP verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
