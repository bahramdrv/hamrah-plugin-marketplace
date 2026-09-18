import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { executeTool, TOOLS } from "./plugins/hamrah/mcp/server.mjs";
import { getSkill, readSkillResource, SKILL_CATALOG, SKILL_RESOURCES } from "./web/skill-catalog.mjs";

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = "1.2.0";
const INSTRUCTIONS = [
  "Hamrah is available: never claim its profile format or workflow is missing.",
  "Guide the facilitator through consented intake, normalize the profile, screen current routes, and then create an evidence-aware scorecard.",
  "Use normalizeApplicantProfile for structured normalization, findMatchingVisaRoutes for discovery, getRouteFactPack plus linked primary authorities for decisive facts, and evaluateRouteEligibility for the official gate.",
  "Use evaluateCommunityAdjustment for every candidate route before final scoring; missing coverage means adjustment zero plus an explicit coverage warning.",
  "Use finalizeAssessment before treating a scorecard as final; do not bypass failed evidence, freshness, arithmetic, eligibility, or community gates.",
  "Never send the full applicant profile to route-finder; only its documented coarse fields after consent.",
  "Community evidence is context, never official eligibility. Match the user's language."
].join(" ");

function createServer() {
  const server = new Server(
    { name: "hamrah", version: APP_VERSION },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        extensions: { "io.modelcontextprotocol/skills": {} }
      },
      instructions: INSTRUCTIONS
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    executeTool(request.params.name, request.params.arguments || {})
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: SKILL_RESOURCES }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const resource = readSkillResource(request.params.uri);
    if (!resource) throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${request.params.uri}`);
    return { contents: [resource] };
  });
  server.fallbackRequestHandler = async (request) => {
    if (request.method === "skills/list") {
      if (request.params?.cursor) return { skills: [] };
      return { skills: SKILL_CATALOG };
    }
    if (request.method === "skills/get") {
      const skill = getSkill(request.params?.uri);
      if (!skill) throw new McpError(ErrorCode.InvalidParams, `Unknown skill: ${request.params?.uri}`);
      return { skill };
    }
    throw new McpError(ErrorCode.MethodNotFound, `Method not found: ${request.method}`);
  };

  return server;
}

export const app = createMcpExpressApp({ host: "0.0.0.0" });
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.get("/", (_req, res) => {
  res.json({ name: "Hamrah", status: "ok", mcp: "/mcp", version: APP_VERSION });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok", tools: TOOLS.length, skills: SKILL_CATALOG.length });
});
app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal MCP server error" }
      });
    }
    console.error(error instanceof Error ? error.message : String(error));
  }
});

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hamrah MCP listening on http://localhost:${PORT}/mcp`);
  });
}

export default app;
