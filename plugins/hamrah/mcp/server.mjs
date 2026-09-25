#!/usr/bin/env node

import readline from "node:readline";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Ajv from "ajv";

import { BudgetExceededError, REQUEST_BUDGETS, withDeadline } from "./budgets.mjs";
import { pickRecordArray } from "./record-array.mjs";
import { buildRouteFactPack, InvalidFactPackInput, ROUTE_FACT_PACK_TOOL } from "./route-fact-pack.mjs";
import { answerCommunityQuestion } from "./community-answers.mjs";
import { getCommunityQuestion, QuestionNotFoundError, searchCommunityQuestions } from "./community-question-tools.mjs";
import {
  getCommunitySignalDataset,
  searchCommunitySignals
} from "./community-signals.mjs";

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
const validateRouteFinderSchema = new Ajv({ allErrors: true }).compile(ROUTE_FINDER_SCHEMA);
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const coarseDestinations = new Set(["UK", "USA", "UAE"]);
for (let first = 65; first <= 90; first++) {
  for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    const name = regionNames.of(code);
    if (name !== code) {
      coarseDestinations.add(code);
      coarseDestinations.add(name.toUpperCase());
    }
  }
}

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

const COMMUNITY_SIGNAL_TOOLS = [
  {
    name: "searchCommunitySignals",
    title: "Search Hamrah Community Signals",
    description: "Use this when evaluating an immigration route or preparing a scorecard to find current, validated community-friction signals from Hamrah's versioned GitHub dataset store. Search with the narrowest known country, route, stage, topic, or applicant scope. evidenceAggregation clusters copied evidence across datasets, counts independent supporting and opposing reports from current signals only, and lists historical or superseded records for audit with dataset coverage. Results are practical context, not official eligibility or a probability.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        countryCode: { type: "string", minLength: 2, maxLength: 3, description: "Destination ISO country code, preferably ISO 3166-1 alpha-3 such as GBR or DEU." },
        country: { type: "string", minLength: 2, maxLength: 80, description: "Destination country name when its code is unknown." },
        route: { type: "string", minLength: 1, maxLength: 100, description: "Normalized migration route or route family, such as skilled_worker or EMPLOYMENT / WORK." },
        topic: { type: "string", minLength: 1, maxLength: 120, description: "Community topic, signal type, keyword, or free-text issue such as processing delay." },
        processStage: { type: "string", minLength: 1, maxLength: 100, description: "Normalized process stage such as biometrics or visa_application." },
        originCountry: { type: "string", minLength: 2, maxLength: 80, description: "Applicant origin, residence, or applying-from country when relevant." },
        nationality: { type: "string", minLength: 2, maxLength: 80, description: "Applicant nationality when the signal is nationality-specific." },
        entity: { type: "string", minLength: 2, maxLength: 120, description: "Institution, employer, VAC, regulator, test provider, or other named entity." },
        statuses: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: { type: "string", enum: ["active", "monitoring", "uncertain", "resolved", "historical"] },
          description: "Defaults to active, monitoring, and uncertain. Request resolved or historical only for audit or contradiction checks."
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "getCommunitySignalDataset",
    title: "Get Hamrah Community Signal Dataset",
    description: "Use this after searchCommunitySignals when the scorecard needs full evidence, source coverage, quality controls, resolution details, or watchlist entries from one validated Hamrah dataset. Use the exact datasetId returned by search.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["datasetId"],
      properties: {
        datasetId: { type: "string", minLength: 1, maxLength: 240 },
        signalIds: {
          type: "array",
          maxItems: 50,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 200 },
          description: "Optional signal IDs to return. Omit to retrieve the full validated dataset."
        }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
  }
];

const QUESTION_SCOPE = {
  countryCode: { type: "string", minLength: 2, maxLength: 3, description: "Destination ISO country code, such as DEU." },
  route: { type: "string", minLength: 1, maxLength: 100, description: "Normalized route code, such as opportunity_card." },
  topic: { type: "string", minLength: 1, maxLength: 120, description: "Normalized topic, such as work_rights." },
  processStage: { type: "string", minLength: 1, maxLength: 100, description: "Normalized process stage, such as visa_application." }
};

const COMMUNITY_QUESTION_TOOLS = [
  {
    name: "searchCommunityQuestions",
    title: "Search Hamrah Community Questions",
    description: "Use this to find recurring applicant questions in Persian or English from Hamrah's validated datasets, with independent asker counts, first and last seen dates, trend, and answer status. Wording variants of one question are merged. A question shows demand, not an answer or an official rule; missing coverage means unknown.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200, description: "Question text or keywords in Persian or English." },
        ...QUESTION_SCOPE,
        answerStatus: { type: "string", enum: ["official", "evidence_based", "community_observation", "unresolved"] },
        statuses: {
          type: "array", minItems: 1, maxItems: 6, uniqueItems: true,
          items: { type: "string", enum: ["active", "monitoring", "resolved", "historical", "stale", "superseded"] },
          description: "Defaults to active and monitoring questions."
        },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "getCommunityQuestion",
    title: "Get Hamrah Community Question",
    description: "Use this after searchCommunityQuestions to inspect one question by its stable questionId, including its variants, the posts where it was asked, source families, private-evidence count, time window, and dataset snapshots.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["questionId"],
      properties: {
        questionId: { type: "string", minLength: 1, maxLength: 200 },
        datasetId: { type: "string", minLength: 1, maxLength: 240, description: "Optional dataset to read instead of the newest snapshot." }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "answerCommunityQuestion",
    title: "Answer a Hamrah Community Question",
    description: "Use this after searchCommunityQuestions to get a cited answer to one question. It checks the linked Route Claims and Signals for scope, source authority, freshness, contradictions, and independence, and returns official, evidence_based, community_observation, partially_answered, outdated, unresolved, or research_required with confidence, citations, and last verification date. Official answers come only from current authoritative rules; community observations are never rules or probabilities.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["questionId"],
      properties: {
        questionId: { type: "string", minLength: 1, maxLength: 200 },
        asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional ISO date for freshness checks; defaults to today." }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true }
  }
];

export const TOOLS = [
  ...STANDARD_DISCOVERY_TOOLS,
  ...COMMUNITY_SIGNAL_TOOLS,
  ...COMMUNITY_QUESTION_TOOLS,
  ROUTE_FACT_PACK_TOOL,
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
function sanitizeRouteFinderArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw Object.assign(new Error("Route-finder arguments must be an object."), {
      validationDetails: [{ field: "$", message: "must be an object" }]
    });
  }
  const details = [];
  if (!validateRouteFinderSchema(args)) {
    for (const issue of validateRouteFinderSchema.errors) {
      const field = issue.keyword === "additionalProperties"
        ? issue.params.additionalProperty
        : issue.instancePath.slice(1).replaceAll("/", ".") || "$";
      details.push({ field, message: issue.message });
    }
  }
  const sensitive = /@|https?:|www\.|\b(?:passport|address|email|phone|tel)\b|شماره|آدرس|ایمیل|\+?\d[\d\s().-]{6,}\d|[\r\n\t]/iu;
  const strings = [
    ["professionSlug", args.professionSlug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/i],
    ["nationalityIso", args.nationalityIso, /^[A-Z]{2,3}$/],
  ];
  for (const [field, value, coarsePattern] of strings) {
    const addressSlug = field === "professionSlug" && typeof value === "string" &&
      (/^\d{1,6}-/.test(value) || /(?:^|-)(?:street|road|avenue|lane|drive|boulevard|address|postal|postcode)(?:-|$)/i.test(value));
    if (typeof value === "string" && (sensitive.test(value) || !coarsePattern.test(value) || addressSlug)) {
      details.push({ field, message: "must contain only a coarse route-finder value, without personal details" });
    }
  }
  if (Array.isArray(args.targetDestinations)) {
    args.targetDestinations.forEach((value, index) => {
      if (typeof value === "string" && !coarseDestinations.has(value.trim().toUpperCase())) {
        details.push({ field: `targetDestinations.${index}`, message: "must be a country code or country name" });
      }
    });
  }
  if (details.length) {
    throw Object.assign(new Error(`Invalid route-finder input: ${details.map((item) => item.field).join(", ")}.`), {
      validationDetails: details
    });
  }
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, value));
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

const APPROVED_PATHS = new Set([...operationByName.values(), "/api/public/search-index", "/api/public/route-finder"]);

async function fetchJson(path, init = {}, fetchImpl = globalThis.fetch, signal = undefined) {
  const url = new URL(path, BASE_URL);
  if (url.origin !== BASE_URL || !APPROVED_PATHS.has(url.pathname) || url.search) {
    throw new Error(`Refusing unapproved Visa Atlas request path: ${path}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let onAbort;
  try {
    if (requestSignal.aborted) throw requestSignal.reason;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(requestSignal.reason);
      requestSignal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([(async () => {
      const response = await fetchImpl(url.href, {
        ...init,
        headers: { Accept: "application/json", "User-Agent": "Hamrah-Plugin/1.0", ...(init.headers || {}) },
        redirect: "error",
        signal: requestSignal
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
    })(), aborted]);
  } finally {
    if (onAbort) requestSignal.removeEventListener("abort", onAbort);
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

export async function executeTool(name, args = {}, fetchImpl = globalThis.fetch, options = {}) {
  if (name === "getRouteFactPack") {
    try {
      const payload = await buildRouteFactPack(
        args,
        (operation) => operationByName.get(operation),
        (path, signal) => fetchJson(path, {}, fetchImpl, signal),
        options.deadlineMs ?? REQUEST_BUDGETS.deadlineMs
      );
      return toolResult(payload);
    } catch (error) {
      if (error instanceof InvalidFactPackInput) {
        return toolResult({ error: "invalid_route_fact_pack_input", message: error.message }, true);
      }
      throw error;
    }
  }
  try {
    return await withDeadline(
      options.deadlineMs ?? REQUEST_BUDGETS.deadlineMs,
      (signal) => runTool(name, args, fetchImpl, options, signal)
    );
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return toolResult({
        error: error.code,
        message: error.message,
        ...error.limit,
        guidance: "No partial result was returned. Retry with a narrower request or report the affected coverage as unavailable."
      }, true);
    }
    throw error;
  }
}

async function runTool(name, args, fetchImpl, options, signal) {
  try {
    if (name === "search") {
      if (typeof args.query !== "string" || !args.query.trim()) throw new Error("search requires a non-empty query.");
      const raw = await fetchJson("/api/public/search-index", {}, fetchImpl, signal);
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
      const raw = await fetchJson("/api/public/search-index", {}, fetchImpl, signal);
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

    if (name === "searchCommunitySignals") {
      return toolResult(searchCommunitySignals(args, options.signalStoreRoot, options.maxDatasetsScanned));
    }

    if (name === "getCommunitySignalDataset") {
      return toolResult(getCommunitySignalDataset(args, options.signalStoreRoot, options.maxDatasetsScanned));
    }

    if (name === "searchCommunityQuestions") {
      return toolResult(searchCommunityQuestions(args, options.signalStoreRoot, options.maxDatasetsScanned));
    }

    if (name === "answerCommunityQuestion") {
      return toolResult(answerCommunityQuestion(args, options.signalStoreRoot, options.maxDatasetsScanned));
    }

    if (name === "getCommunityQuestion") {
      return toolResult(getCommunityQuestion(args, options.signalStoreRoot, options.maxDatasetsScanned));
    }

    if (operationByName.has(name)) {
      const path = operationByName.get(name);
      const raw = await fetchJson(path, {}, fetchImpl, signal);
      const filtered = filterResponse(raw, args);
      return toolResult(resultPayload(path, filtered.data, { total: filtered.total, returned: filtered.returned }));
    }

    if (name === "findMatchingVisaRoutes") {
      const safeArgs = sanitizeRouteFinderArgs(args);
      const raw = await fetchJson(
        "/api/public/route-finder",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safeArgs) },
        fetchImpl,
        signal
      );
      return toolResult(resultPayload("/api/public/route-finder", raw, {
        warning: "The route-finder score is a deterministic ordering aid, not official eligibility or approval probability."
      }));
    }

    return toolResult({ error: "unknown_tool", message: `Unknown tool: ${name}` }, true);
  } catch (error) {
    if (signal.reason instanceof BudgetExceededError) throw signal.reason;
    if (error instanceof BudgetExceededError) throw error;
    if (error instanceof QuestionNotFoundError) {
      return toolResult({
        error: "community_question_not_found",
        message: error.message,
        guidance: "Use a questionId returned by searchCommunityQuestions. An unknown ID is not evidence that the question is never asked."
      }, true);
    }
    const isCommunityTool = ["searchCommunitySignals", "getCommunitySignalDataset", "searchCommunityQuestions", "getCommunityQuestion", "answerCommunityQuestion"].includes(name);
    if (name === "findMatchingVisaRoutes" && error?.validationDetails) {
      return toolResult({
        error: "invalid_route_finder_input",
        message: error.message,
        details: error.validationDetails
      }, true);
    }
    return toolResult({
      error: isCommunityTool ? "community_signal_store_failed" : "visa_atlas_request_failed",
      message: error instanceof Error ? error.message : String(error),
      status: error?.status ?? null,
      details: error?.body ?? null,
      guidance: isCommunityTool
        ? "Do not infer community coverage. Report the dataset error and use Community Adjustment 0 with coverage unavailable until the store is corrected."
        : "Do not infer missing data. Mark affected claims UNKNOWN and use a current primary source or another documented endpoint."
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
        serverInfo: { name: "hamrah-visa-atlas", version: "1.1.0" },
        instructions: "Use the smallest relevant Visa Atlas tool; getRouteFactPack gathers selected route datasets with explicit partial coverage. Before applying a community adjustment, use searchCommunitySignals and getCommunitySignalDataset. Treat route scores as discovery aids, community signals as practical context, and verify decisive requirements with primary sources."
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
