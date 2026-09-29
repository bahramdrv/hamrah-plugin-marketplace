const baseUrl = (process.argv[2] || "https://hamrah-plugin-marketplace.vercel.app").replace(/\/$/, "");
const expectedCommit = process.argv[3];
const mcpUrl = `${baseUrl}/mcp`;
const postingUrl = "https://example.edu/jobs/synthetic-phd-physics";
const excludedUrl = "https://example.edu/jobs/synthetic-restricted-phd";
const today = new Date().toISOString().slice(0, 10);
const deadlineYear = Number(today.slice(0, 4)) + 1;

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

function syntheticPublicOpening() {
  return {
    checkedAt: today,
    searchScope: { countryCode: "DEU", degreeLevel: "phd", field: "Physics" },
    coverage: { candidatesChecked: 2, excluded: [{
      reason: "iranian_nationality_restriction", count: 1,
      title: "Synthetic restricted doctoral physics position",
      officialPostingUrl: excludedUrl, sourceUrl: excludedUrl,
      sourceExcerpt: "Applicants with Iranian citizenship are not eligible to apply."
    }] },
    openings: [{
      title: "Synthetic Doctoral Researcher in Experimental Physics",
      institution: "Example University", countryCode: "DEU", degreeLevel: "phd", field: "Physics",
      officialPostingUrl: postingUrl,
      postingEvidence: { sourceUrl: postingUrl,
        sourceExcerpt: "Synthetic Doctoral Researcher in Experimental Physics (PhD position)" },
      academicConditions: [{ condition: "Master's degree in physics required", sourceUrl: postingUrl,
        sourceExcerpt: "A master's degree in physics is required." }],
      nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
      application: { status: "open", mode: "dated", deadline: `${deadlineYear}-01-15`,
        sourceUrl: postingUrl,
        sourceExcerpt: `Applications are now open for this position until 15 January ${deadlineYear}.` },
      funding: { type: "salary", amount: null, currency: null, period: null,
        salaryScale: "65% TV-L E13", packageName: null, packageTerms: null,
        sourceUrl: postingUrl, sourceExcerpt: "The position is paid at 65% TV-L E13." }
    }]
  };
}

async function main() {
  const healthResponse = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(15000) });
  requireResult(healthResponse.ok, `health: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  requireResult(health.status === "ok", "health is not ok");
  if (expectedCommit) requireResult(health.deploymentCommit === expectedCommit,
    `deployment commit ${health.deploymentCommit} differs from expected ${expectedCommit}`);

  const listed = await rpc(1, "tools/list", {});
  requireResult(listed.tools.length === health.tools, "live tool count differs from health");
  requireResult(listed.tools.some((item) => item.name === "renderVerifiedOpenAcademicOpportunityShortlist"),
    "verified opportunity renderer is not deployed");
  requireResult(listed.tools.some((item) => item.name === "discoverAcademicCallCandidates"),
    "academic call discovery is not deployed");
  requireResult(listed.tools.some((item) => item.name === "renderOpenAcademicCallReport"),
    "academic call report is not deployed");

  // Synthetic public facts only: no applicant profile or actual opportunity is sent.
  const result = await rpc(2, "tools/call", {
    name: "renderVerifiedOpenAcademicOpportunityShortlist", arguments: syntheticPublicOpening()
  });
  const rendered = result.structuredContent;
  requireResult(rendered?.status === "valid" && rendered.openingCount === 1,
    "synthetic opportunity was not rendered as one opening");
  requireResult(result.content?.[0]?.text === rendered.markdown,
    "visible status differs from validated markdown");
  requireResult(rendered.markdown.includes(postingUrl) && rendered.markdown.includes(excludedUrl),
    "opening or sourced exclusion is missing");
  requireResult(rendered.markdown.includes("iranian_nationality_restriction") &&
    !/^### \[Synthetic restricted doctoral physics position\]/m.test(rendered.markdown),
    "nationality restriction was not kept out of the shortlist");

  const discovery = await rpc(3, "tools/call", {
    name: "discoverAcademicCallCandidates",
    arguments: { field: "Physics", targetCategory: "masters", countryCode: "CA" }
  });
  requireResult(discovery.structuredContent?.status === "no_candidates" &&
    discovery.structuredContent.coverage.apiCoverage === "unavailable",
  "uncovered country/category was not reported honestly");
  const academicUrl = "https://example.edu/jobs/synthetic-academic-call";
  const academic = await rpc(4, "tools/call", {
    name: "renderOpenAcademicCallReport", arguments: {
      checkedAt: today,
      scope: { field: "Physics", targetCategory: "phd", countryCodes: ["DE"], fundingRequired: false },
      coverage: { apiSources: [], webSearches: ["synthetic official posting"], countriesChecked: ["DE"],
        candidatesChecked: 1, excluded: [], failures: [], truncated: false },
      calls: [{ id: "synthetic-academic-call", kind: "research_vacancy", targetCategory: "phd",
        title: "Synthetic Doctoral Researcher in Physics", institution: "Example University",
        countryCode: "DE", field: "Physics", officialUrl: academicUrl,
        titleEvidence: { sourceUrl: academicUrl, sourceExcerpt: "Synthetic Doctoral Researcher in Physics" },
        application: { mode: "dated", deadline: `${deadlineYear}-10-15`, sourceUrl: academicUrl,
          sourceExcerpt: `Applications are now open until 15 October ${deadlineYear}.` },
        conditions: [{ text: "Master's degree in Physics", sourceUrl: academicUrl,
          sourceExcerpt: "A Master's degree in Physics is required." }],
        funding: { status: "unknown", terms: null, sourceUrl: null, sourceExcerpt: null },
        nationalityEvidence: { status: "unknown", sourceUrl: null, sourceExcerpt: null },
        linkedAdmissionId: null, applicabilityEvidence: null }]
    }
  });
  requireResult(academic.structuredContent?.status === "results" &&
    academic.structuredContent.results.length === 1 &&
    academic.content?.[0]?.text === academic.structuredContent.markdown,
  "academic call report did not render the synthetic open call consistently");

  process.stdout.write(`${JSON.stringify({
    baseUrl, deploymentCommit: health.deploymentCommit, tools: listed.tools.length,
    syntheticOpeningCount: rendered.openingCount, sourcedRestrictionExcluded: true,
    academicDiscoveryCoverage: discovery.structuredContent.coverage.apiCoverage,
    syntheticAcademicCallCount: academic.structuredContent.results.length
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Live opportunity verification failed: ${error.message}\n`);
  process.exitCode = 1;
});
