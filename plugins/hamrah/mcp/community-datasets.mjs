import { readFileSync } from "node:fs";

import { adaptCommunityDatasetV2, V2_SCHEMA_VERSION, validateCommunityDatasetV2 } from "./community-dataset-v2.mjs";
import {
  adaptCommunityDatasetV3, V3_SCHEMA_VERSION, validateCommunityDatasetV3, validateNormalizedLegacyDatasetV3
} from "./community-dataset-v3.mjs";
import { adaptCommunityDatasetV4, V4_SCHEMA_VERSION, validateCommunityDatasetV4 } from "./community-dataset-v4.mjs";
import { normalizeCommunityDataset } from "./community-legacy-normalizer.mjs";
import { inspectDatasetPrivacy } from "./privacy-check.mjs";

const ADAPTERS = new Map([
  [V2_SCHEMA_VERSION, { validate: validateCommunityDatasetV2, adapt: adaptCommunityDatasetV2 }],
  [V3_SCHEMA_VERSION, { validate: validateCommunityDatasetV3, adapt: adaptCommunityDatasetV3 }],
  [V4_SCHEMA_VERSION, { validate: validateCommunityDatasetV4, adapt: adaptCommunityDatasetV4 }]
]);

export const SUPPORTED_SCHEMA_VERSIONS = [...ADAPTERS.keys()];

// Validates a raw dataset against its own contract and, when valid, adapts it to canonical internal artifacts.
export function readCommunityDataset(raw, datasetId = "dataset") {
  const schemaVersion = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.schema_version ?? null : null;
  let normalizedLegacy = false;
  if ((schemaVersion === V3_SCHEMA_VERSION && Object.hasOwn(raw, "qualityControl"))
    || (schemaVersion === null && Array.isArray(raw?.signals))) {
    const direct = schemaVersion === V3_SCHEMA_VERSION ? validateCommunityDatasetV3(raw, { datasetId }) : null;
    if (!direct || (direct.errors.length && direct.privacy === null)) {
      const rawPrivacy = inspectDatasetPrivacy(raw, { datasetId });
      if (rawPrivacy.status !== "pass") {
        return { schemaVersion, errors: [`raw dataset privacy ${rawPrivacy.status}: ${rawPrivacy.findings.map((item) => `${item.path} (${item.rule})`).join(", ")}`], privacy: rawPrivacy, canonical: null };
      }
      try {
        raw = normalizeCommunityDataset(raw, datasetId);
        normalizedLegacy = true;
      } catch (error) {
        return { schemaVersion, errors: [error.message], privacy: rawPrivacy, canonical: null };
      }
    }
  }
  const effectiveVersion = raw?.schema_version ?? schemaVersion;
  const adapter = ADAPTERS.get(effectiveVersion);
  if (!adapter) {
    return {
      schemaVersion: effectiveVersion,
      errors: [`unsupported schema_version ${JSON.stringify(effectiveVersion)}; supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`],
      privacy: null,
      canonical: null
    };
  }
  const { errors, privacy } = (normalizedLegacy ? validateNormalizedLegacyDatasetV3 : adapter.validate)(raw, { datasetId });
  return { schemaVersion: effectiveVersion, errors, privacy, canonical: errors.length ? null : adapter.adapt(raw), dataset: raw };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const { schemaVersion, errors, privacy } = readCommunityDataset(JSON.parse(readFileSync(process.argv[2], "utf8")), process.argv[3]);
    process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, schemaVersion, errors, privacy })}\n`);
    if (errors.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Community dataset validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
