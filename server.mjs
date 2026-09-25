import express from "express";
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

import { REQUEST_BUDGETS } from "./plugins/hamrah/mcp/budgets.mjs";
import { executeTool, TOOLS } from "./plugins/hamrah/mcp/server.mjs";
import { getSkill, readSkillResource, SKILL_CATALOG, SKILL_RESOURCES } from "./web/skill-catalog.mjs";

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = "1.1.0";
const INSTRUCTIONS = [
  "Hamrah is available: never claim its profile format or workflow is missing.",
  "Guide the facilitator through consented intake, normalize the profile, screen current routes, and then create an evidence-aware scorecard.",
  "Use Visa Atlas for discovery and verify decisive claims with linked primary authorities.",
  "Before applying any community adjustment, call searchCommunitySignals and then getCommunitySignalDataset for candidate evidence; missing coverage means adjustment zero plus an explicit coverage warning.",
  "Never send the full applicant profile to route-finder; only its documented coarse fields after consent.",
  "Community evidence is context, never official eligibility. Match the user's language."
].join(" ");

function createServer(fetchImpl, toolOptions) {
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
    executeTool(request.params.name, request.params.arguments || {}, fetchImpl, toolOptions)
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

function sendJsonRpcError(res, status, code, message, data) {
  res.status(status).json({ jsonrpc: "2.0", id: null, error: { code, message, data } });
}

export function createApp(options = {}) {
  const budgets = { ...REQUEST_BUDGETS };
  for (const key of Object.keys(REQUEST_BUDGETS)) budgets[key] = options[key] ?? budgets[key];
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const toolOptions = {
    deadlineMs: budgets.deadlineMs,
    maxDatasetsScanned: budgets.maxDatasetsScanned,
    signalStoreRoot: options.signalStoreRoot
  };
  let activeRequests = 0;

  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  app.use("/mcp", (_req, res, next) => {
    if (activeRequests >= budgets.maxConcurrentRequests) {
      res.setHeader("Retry-After", "1");
      return sendJsonRpcError(res, 503, -32000, "Too many concurrent MCP requests; retry shortly.", {
        reason: "concurrency_limit_exceeded",
        limit: budgets.maxConcurrentRequests
      });
    }
    activeRequests++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeRequests--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  });
  app.use(express.json({ limit: budgets.bodyLimitBytes }));

  app.get("/", (_req, res) => {
    res.json({ name: "Hamrah", status: "ok", mcp: "/mcp", version: APP_VERSION });
  });
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", tools: TOOLS.length, skills: SKILL_CATALOG.length });
  });
  app.all("/mcp", async (req, res) => {
    const server = createServer(fetchImpl, toolOptions);
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
        sendJsonRpcError(res, 500, -32603, "Internal MCP server error");
      }
      console.error(error instanceof Error ? error.message : String(error));
    }
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === "entity.too.large") {
      return sendJsonRpcError(res, 413, -32000, `Request body exceeds ${budgets.bodyLimitBytes} bytes.`, {
        reason: "request_too_large",
        limitBytes: budgets.bodyLimitBytes
      });
    }
    if (error?.type === "entity.parse.failed") {
      return sendJsonRpcError(res, 400, -32700, "Parse error: request body is not valid JSON.", { reason: "invalid_json" });
    }
    console.error(error instanceof Error ? error.message : String(error));
    return sendJsonRpcError(res, error?.status >= 400 && error.status < 500 ? error.status : 500, -32603, "Request could not be processed.");
  });
  return app;
}

export const app = createApp();

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hamrah MCP listening on http://localhost:${PORT}/mcp`);
  });
}

export default app;
