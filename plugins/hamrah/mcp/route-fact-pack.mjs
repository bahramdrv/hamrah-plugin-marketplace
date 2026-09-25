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
  "getProcessingTimes"
]);

const MAX_DATASETS = 6;
const MAX_RECORDS_PER_DATASET = 25;
const MAX_RECORDS_SCANNED_PER_DATASET = 500;

export const ROUTE_FACT_PACK_TOOL = {
  name: "getRouteFactPack",
  title: "Get Route Fact Pack",
  description: "Fetch selected public Visa Atlas datasets for one route. Returns per-dataset coverage and source-linked records; it does not establish official eligibility.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["countryCode", "routeSlug", "datasets"],
    properties: {
      countryCode: { type: "string", pattern: "^[A-Z]{2}$", description: "Destination ISO alpha-2 code, such as DE." },
      routeSlug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 100 },
      datasets: {
        type: "array", minItems: 1, maxItems: MAX_DATASETS, uniqueItems: true,
        items: { type: "string", enum: ROUTE_FACT_DATASETS }
      }
    }
  },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
};

export class InvalidFactPackInput extends Error {}

const validateInput = new Ajv({ allErrors: true }).compile(ROUTE_FACT_PACK_TOOL.inputSchema);

function selectedDatasets(args) {
  if (!validateInput(args)) {
    throw new InvalidFactPackInput("Provide one ISO alpha-2 countryCode, one routeSlug, and 1–6 distinct approved datasets.");
  }
  return args.datasets;
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

export async function buildRouteFactPack(args, pathForOperation, fetchDataset, deadlineMs) {
  const selected = selectedDatasets(args);
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
            ? { name, endpoint, status: "timed_out", message: "Dataset did not respond before the deadline." }
            : { name, endpoint, status: "failed", httpStatus: error?.status ?? null,
                message: error instanceof Error ? error.message : String(error) });
        }
      }));
    });
  } catch (error) {
    if (!(error instanceof BudgetExceededError)) throw error;
  }
  const datasets = selected.map((name) => completed.get(name) ?? {
    name, endpoint: pathForOperation(name), status: "timed_out",
    message: "Dataset did not respond before the deadline."
  });
  const successful = datasets.filter((dataset) => dataset.status === "success").length;
  const timedOut = datasets.filter((dataset) => dataset.status === "timed_out").length;
  return {
    route: { countryCode: args.countryCode, slug: args.routeSlug },
    retrievedAt: new Date().toISOString(),
    status: successful === selected.length && !datasets.some((dataset) => dataset.scanLimited)
      ? "complete" : "partial",
    coverage: { denominator: selected.length, successful, failed: selected.length - successful - timedOut,
      timedOut, percentage: Math.round(successful * 1000 / selected.length) / 10 },
    datasets,
    legalNote: "Visa Atlas is a source-linked compilation, not an issuing authority. Verify decisive requirements with primary sources."
  };
}
