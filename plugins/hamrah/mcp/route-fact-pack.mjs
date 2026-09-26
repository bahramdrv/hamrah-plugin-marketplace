import Ajv from "ajv";
import { BudgetExceededError, withDeadline } from "./budgets.mjs";
import { pickRecordArray } from "./record-array.mjs";

export const ROUTE_FACT_DATASETS = Object.freeze([
  "getVisaRoutes",
  "getDestinations",
  "getPolicyUpdates",
  "getPolicyClaims",
  "getVisaFees",
  "getCostToComplete",
  "getSalaryThresholds",
  "getProcessingTimes",
  "getSourceFreshness",
  "getProcessingReliability"
]);

const MAX_DATASETS = 6;
const MAX_RECORDS_PER_DATASET = 25;
const MAX_RECORDS_SCANNED_PER_DATASET = 500;

// Used when the slug form omits datasets; it fits within MAX_DATASETS.
const DEFAULT_SLUG_FORM_DATASETS = Object.freeze([
  "getVisaRoutes",
  "getPolicyClaims",
  "getPolicyUpdates",
  "getVisaFees",
  "getSalaryThresholds",
  "getProcessingTimes"
]);

const COUNTRY_CODE = { type: "string", pattern: "^[A-Z]{2}$", description: "Destination ISO alpha-2 code, such as DE." };
const ROUTE_SLUG = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 100 };
const DATASETS = {
  type: "array", minItems: 1, maxItems: MAX_DATASETS, uniqueItems: true,
  items: { type: "string", enum: ROUTE_FACT_DATASETS }
};

const ROUTE_SLUG_FORM = {
  type: "object",
  additionalProperties: false,
  required: ["countryCode", "routeSlug", "datasets"],
  properties: { countryCode: COUNTRY_CODE, routeSlug: ROUTE_SLUG, datasets: DATASETS }
};

const SLUG_FORM = {
  type: "object",
  additionalProperties: false,
  required: ["countryCode", "slug"],
  description: `Same operation as the routeSlug form. slug is an alias for routeSlug; omitted datasets default to ${DEFAULT_SLUG_FORM_DATASETS.join(", ")}.`,
  properties: {
    countryCode: COUNTRY_CODE,
    slug: { ...ROUTE_SLUG, description: "Alias for routeSlug." },
    datasets: DATASETS
  }
};

export const ROUTE_FACT_PACK_TOOL = {
  name: "getRouteFactPack",
  title: "Get Route Fact Pack",
  description: `Fetch up to ${MAX_DATASETS} approved public Visa Atlas datasets for one route concurrently under one deadline. Each dataset reports success, failure, or timeout; coverage counts successful datasets against the number of datasets selected for the call. The pack can be partial and is never a complete route assessment or official eligibility. The slug form is the same operation: slug aliases routeSlug and datasets defaults to ${DEFAULT_SLUG_FORM_DATASETS.join(", ")}.`,
  inputSchema: { type: "object", anyOf: [ROUTE_SLUG_FORM, SLUG_FORM] },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
};

export class InvalidFactPackInput extends Error {}

const ajv = new Ajv({ allErrors: true });
const validateRouteSlugForm = ajv.compile(ROUTE_SLUG_FORM);
const validateSlugForm = ajv.compile(SLUG_FORM);

function packRequest(args) {
  if (args && typeof args === "object" && Object.hasOwn(args, "slug")) {
    if (!validateSlugForm(args)) {
      throw new InvalidFactPackInput("Provide one ISO alpha-2 countryCode, one route slug, and optionally 1–6 distinct approved datasets.");
    }
    return { countryCode: args.countryCode, routeSlug: args.slug, datasets: args.datasets ?? DEFAULT_SLUG_FORM_DATASETS };
  }
  if (!validateRouteSlugForm(args)) {
    throw new InvalidFactPackInput("Provide one ISO alpha-2 countryCode, one routeSlug, and 1–6 distinct approved datasets.");
  }
  return args;
}

function recordArray(data) {
  const { records, key } = pickRecordArray(data);
  if (!records) throw new Error("Visa Atlas dataset has no record array.");
  if (key === null) return { records, metadata: {} };
  const { [key]: _records, ...metadata } = data;
  return { records, metadata };
}

function matchesCountry(record, countryCode) {
  const codes = [record.destinationIso, record.countryCode, record.countryIso, record.iso2,
    record.destination, record.country,
    record.destination?.iso, record.destination?.code, record.route?.destinationIso];
  const accepted = countryCode === "GB" ? new Set(["GB", "UK"]) : new Set([countryCode]);
  return codes.some((code) => typeof code === "string" && accepted.has(code.toUpperCase()));
}

function matchesRoute(record, routeSlug) {
  const slugs = [record.slug, record.routeSlug, record.visaSlug, record.route?.slug, record.visa?.slug,
    ...(Array.isArray(record.affectedVisas) ? record.affectedVisas.map((visa) => visa?.slug) : [])];
  return slugs.some((slug) => slug === routeSlug);
}

export async function buildRouteFactPack(input, pathForOperation, fetchDataset, deadlineMs) {
  const args = packRequest(input);
  const selected = args.datasets;
  const completed = new Map();
  try {
    await withDeadline(deadlineMs, async (signal) => {
      await Promise.all(selected.map(async (name) => {
        const endpoint = pathForOperation(name);
        try {
          const raw = await fetchDataset(endpoint, signal);
          const { records, metadata } = recordArray(raw);
          const recordsScanned = Math.min(records.length, MAX_RECORDS_SCANNED_PER_DATASET);
          const scanLimited = recordsScanned < records.length;
          const matching = records.slice(0, recordsScanned).filter((record) => record && typeof record === "object" &&
            matchesCountry(record, args.countryCode) &&
            (name === "getDestinations" || matchesRoute(record, args.routeSlug)));
          completed.set(name, {
            name, endpoint, status: "success", retrievedAt: new Date().toISOString(),
            source: { provider: "Visa Atlas", endpointUrl: `https://visaatlas.org${endpoint}` },
            metadata, totalRecords: records.length, recordsScanned, scanLimited,
            matchedRecords: matching.length,
            returnedRecords: Math.min(matching.length, MAX_RECORDS_PER_DATASET),
            truncated: matching.length > MAX_RECORDS_PER_DATASET,
            records: matching.slice(0, MAX_RECORDS_PER_DATASET)
          });
        } catch (error) {
          completed.set(name, error instanceof BudgetExceededError || signal.aborted ||
            error?.name === "AbortError" || error?.name === "TimeoutError"
            ? { name, endpoint, status: "timeout", message: "Dataset did not respond before the deadline." }
            : { name, endpoint, status: "failure", httpStatus: error?.status ?? null,
                message: error instanceof Error ? error.message : String(error) });
        }
      }));
    });
  } catch (error) {
    if (!(error instanceof BudgetExceededError)) throw error;
  }
  const datasets = selected.map((name) => completed.get(name) ?? {
    name, endpoint: pathForOperation(name), status: "timeout",
    message: "Dataset did not respond before the deadline."
  });
  const successful = datasets.filter((dataset) => dataset.status === "success").length;
  const timedOut = datasets.filter((dataset) => dataset.status === "timeout").length;
  return {
    route: { countryCode: args.countryCode, slug: args.routeSlug },
    retrievedAt: new Date().toISOString(),
    // Never "complete": at best every selected dataset was retrieved and fully scanned.
    status: successful === selected.length && !datasets.some((dataset) => dataset.scanLimited)
      ? "all_selected_retrieved" : "partial",
    coverage: { denominator: selected.length, denominatorBasis: "datasets_selected", successful, failed: selected.length - successful - timedOut,
      timedOut, percentage: Math.round(successful * 1000 / selected.length) / 10 },
    datasets,
    legalNote: "Visa Atlas is a source-linked compilation, not an issuing authority. Verify decisive requirements with primary sources."
  };
}
