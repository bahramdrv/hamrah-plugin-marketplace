#!/usr/bin/env node

import readline from "node:readline";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const OPENAPI = JSON.parse(
  readFileSync(new URL("./visa_atlas_core_openapi.json", import.meta.url), "utf8")
);
const BASE_URL = OPENAPI.servers?.[0]?.url;
if (BASE_URL !== "https://visaatlas.org") {
  throw new Error("The bundled Visa Atlas contract must use https://visaatlas.org.");
}
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const TIMEOUT_MS = 30_000;

const GET_OPERATIONS = Object.entries(OPENAPI.paths).flatMap(([path, methods]) => {
  const operation = methods.get;
  return operation ? [[operation.operationId, path, operation.summary]] : [];
});

const FILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    destination: { type: "string", description: "Optional destination or country filter." },
    countryCode: { type: "string", description: "Optional ISO country code filter." },
    slug: { type: "string", description: "Optional exact or partial route slug filter." },
    category: { type: "string", description: "Optional category filter." },
    query: { type: "string", description: "Optional case-insensitive text filter across returned records." },
    limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT }
  }
};

const ROUTE_FINDER_SCHEMA = OPENAPI.components.schemas.RouteFinderRequest;

const STANDARD_DISCOVERY_TOOLS = [
  {
    name: "search",
    title: "Search Visa Atlas",
    description: "Use this when the user wants to find current Visa Atlas routes, guides, calculators, policy pages, or research by keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string", minLength: 1, maxLength: 200 } }
    },
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
  },
  {
    name: "fetch",
    title: "Fetch Visa Atlas result",
    description: "Use this after search when the user needs the full citation-ready details for one Visa Atlas result ID.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 240 } }
    },
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
  }
];

export const TOOLS = [
  ...STANDARD_DISCOVERY_TOOLS,
  ...GET_OPERATIONS.map(([name, path, description]) => ({
    title: description,
    name,
    description: `${description} Reads only ${BASE_URL}${path}. Optional filters are applied locally after retrieval. Visa Atlas is a source-linked compilation, not an issuing authority.`,
    inputSchema: FILTER_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
  })),
  {
    name: "findMatchingVisaRoutes",
    description: "Send only a consented, coarse applicant profile to the Visa Atlas deterministic route finder. Its ordering score is not official eligibility or approval probability.",
    inputSchema: ROUTE_FINDER_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
  }
];

const operationByName = new Map(GET_OPERATIONS.map(([name, path]) => [name, path]));
const routeFinderKeys = new Set(Object.keys(ROUTE_FINDER_SCHEMA.properties));

function sanitizeRouteFinderArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Route-finder arguments must be an object.");
  }
  const unknownKeys = Object.keys(args).filter((key) => !routeFinderKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`Unsupported or overly detailed route-finder fields: ${unknownKeys.join(", ")}.`);
  }
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, value));
}

function pickRecordArray(data) {
  if (Array.isArray(data)) return { records: data, key: null };
  if (!data || typeof data !== "object") return { records: null, key: null };
  for (const key of ["items", "results", "records", "data", "datasets", "packs", "capsules"]) {
    if (Array.isArray(data[key])) return { records: data[key], key };
  }
  return { records: null, key: null };
}

function contains(value, needle) {
  return typeof value === "string" && value.toLowerCase().includes(needle.toLowerCase());
}

export function filterResponse(data, args = {}) {
  const { records, key } = pickRecordArray(data);
  if (!records) return { data, total: null, returned: null };

  const filtered = records.filter((record) => {
    if (!record || typeof record !== "object") return !args.query;
    if (args.destination && ![record.destination, record.country, record.name, record.title].some((v) => contains(v, args.destination))) return false;
    if (args.countryCode && ![record.countryCode, record.destination].some((v) => contains(v, args.countryCode))) return false;
    if (args.slug && !contains(record.slug, args.slug)) return false;
    if (args.category && !contains(record.category, args.category)) return false;
    if (args.query && !JSON.stringify(record).toLowerCase().includes(args.query.toLowerCase())) return false;
    return true;
  });

  const limit = clampLimit(args.limit);
  const limited = filtered.slice(0, limit);
  const output = key === null ? limited : { ...data, [key]: limited };
  return { data: output, total: filtered.length, returned: limited.length };
}

async function fetchJson(path, init = {}, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": "Hamrah-Plugin/1.0", ...(init.headers || {}) },
      signal: controller.signal
    });
    const raw = await response.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Visa Atlas returned non-JSON content (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const error = new Error(`Visa Atlas endpoint ${path} returned HTTP ${response.status}.`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function resultPayload(endpoint, data, extra = {}) {
  return {
    source: "Visa Atlas",
    baseUrl: BASE_URL,
    endpoint,
    retrievedAt: new Date().toISOString(),
    legalNote: "Informational planning data. Confirm decisive, time-sensitive requirements with the linked issuing authority.",
    ...extra,
    data
  };
}

function toolResult(payload, isError = false) {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload
  };
}

export async function executeTool(name, args = {}, fetchImpl = globalThis.fetch) {
  try {
    if (name === "search") {
      if (typeof args.query !== "string" || !args.query.trim()) throw new Error("search requires a non-empty query.");
      const raw = await fetchJson("/api/public/search-index", {}, fetchImpl);
      const filtered = filterResponse(raw, { query: args.query.trim(), limit: 25 });
      const { records } = pickRecordArray(filtered.data);
      const payload = {
        results: (records || []).map((record) => ({
          id: String(record.id),
          title: String(record.title || record.id),
          url: String(record.url)
        }))
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
    }

    if (name === "fetch") {
      if (typeof args.id !== "string" || !args.id.trim()) throw new Error("fetch requires a non-empty id.");
      const id = args.id.trim();
      const raw = await fetchJson("/api/public/search-index", {}, fetchImpl);
      const { records } = pickRecordArray(raw);
      const record = (records || []).find((item) => item?.id === id);
      if (!record) throw new Error(`Visa Atlas search result not found: ${id}`);
      const payload = {
        id: String(record.id),
        title: String(record.title || record.id),
        text: [record.description, Array.isArray(record.keywords) ? `Keywords: ${record.keywords.join(", ")}` : null]
          .filter(Boolean)
          .join("\n"),
        url: String(record.url),
        metadata: {
          kind: record.kind ?? null,
          sourceDatasets: record.sourceDatasets ?? []
        }
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
    }

    if (operationByName.has(name)) {
      const path = operationByName.get(name);
      const raw = await fetchJson(path, {}, fetchImpl);
      const filtered = filterResponse(raw, args);
      return toolResult(resultPayload(path, filtered.data, { total: filtered.total, returned: filtered.returned }));
    }

    if (name === "findMatchingVisaRoutes") {
      const safeArgs = sanitizeRouteFinderArgs(args);
      const raw = await fetchJson(
        "/api/public/route-finder",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safeArgs) },
        fetchImpl
      );
      return toolResult(resultPayload("/api/public/route-finder", raw, {
        warning: "The route-finder score is a deterministic ordering aid, not official eligibility or approval probability."
      }));
    }

    return toolResult({ error: "unknown_tool", message: `Unknown tool: ${name}` }, true);
  } catch (error) {
    return toolResult({
      error: "visa_atlas_request_failed",
      message: error instanceof Error ? error.message : String(error),
      status: error?.status ?? null,
      details: error?.body ?? null,
      guidance: "Do not infer missing data. Mark affected claims UNKNOWN and use a current primary source or another documented endpoint."
    }, true);
  }
}

export async function handleRequest(message, fetchImpl = globalThis.fetch) {
  const { id, method, params = {} } = message;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hamrah-visa-atlas", version: "1.0.0" },
        instructions: "Use the smallest relevant Visa Atlas tool. Treat returned route scores as discovery aids and verify decisive requirements with primary sources."
      }
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    return { jsonrpc: "2.0", id, result: await executeTool(params.name, params.arguments || {}, fetchImpl) };
  }
  if (method?.startsWith("notifications/")) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function runStdio() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    const response = await handleRequest(request);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStdio().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
