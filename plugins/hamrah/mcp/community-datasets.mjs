import { readFileSync } from "node:fs";

import { adaptCommunityDatasetV2, V2_SCHEMA_VERSION, validateCommunityDatasetV2 } from "./community-dataset-v2.mjs";
import { adaptCommunityDatasetV3, V3_SCHEMA_VERSION, validateCommunityDatasetV3 } from "./community-dataset-v3.mjs";
import { adaptCommunityDatasetV4, V4_SCHEMA_VERSION, validateCommunityDatasetV4 } from "./community-dataset-v4.mjs";

const ADAPTERS = new Map([
  [V2_SCHEMA_VERSION, { validate: validateCommunityDatasetV2, adapt: adaptCommunityDatasetV2 }],
  [V3_SCHEMA_VERSION, { validate: validateCommunityDatasetV3, adapt: adaptCommunityDatasetV3 }],
  [V4_SCHEMA_VERSION, { validate: validateCommunityDatasetV4, adapt: adaptCommunityDatasetV4 }]
]);

export const SUPPORTED_SCHEMA_VERSIONS = [...ADAPTERS.keys()];

// Validates a raw dataset against its own contract and, when valid, adapts it to canonical internal artifacts.
export function readCommunityDataset(raw) {
  const schemaVersion = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.schema_version ?? null : null;
  const adapter = ADAPTERS.get(schemaVersion);
  if (!adapter) {
    return {
      schemaVersion,
      errors: [`unsupported schema_version ${JSON.stringify(schemaVersion)}; supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`],
      privacy: null,
      canonical: null
    };
  }
  const { errors, privacy } = adapter.validate(raw);
  return { schemaVersion, errors, privacy, canonical: errors.length ? null : adapter.adapt(raw) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const { schemaVersion, errors, privacy } = readCommunityDataset(JSON.parse(readFileSync(process.argv[2], "utf8")));
    process.stdout.write(`${JSON.stringify({ valid: errors.length === 0, schemaVersion, errors, privacy })}\n`);
    if (errors.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Community dataset validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
