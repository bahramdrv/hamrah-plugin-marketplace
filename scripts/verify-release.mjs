import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { readCommunityDataset } from "../plugins/hamrah/mcp/community-datasets.mjs";
import { loadCommunitySignalStore } from "../plugins/hamrah/mcp/community-signals.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const skills = path.join(root, "plugins/hamrah/skills");
const source = path.join(root, "plugins/hamrah/source");
const storeRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "plugins/hamrah/data/community-signals/datasets");

function schemaFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return schemaFiles(file);
    return entry.isFile() && /(?:_schema|\.schema)\.json$/.test(entry.name) ? [file] : [];
  });
}

function verifySchemas() {
  const files = [...schemaFiles(skills), ...schemaFiles(source)];
  const grouped = Map.groupBy(files, (file) => path.dirname(file));
  for (const siblings of grouped.values()) {
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    for (const file of siblings) {
      const schema = JSON.parse(readFileSync(file, "utf8"));
      if (!ajv.validateSchema(schema)) throw new Error(`${file}: invalid schema: ${ajv.errorsText(ajv.errors)}`);
      ajv.addSchema(schema, path.basename(file));
    }
    for (const file of siblings) ajv.getSchema(path.basename(file));
  }
  return files.length;
}

function verifyPublishedStore() {
  const files = (function walk(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(file) : entry.isFile() && entry.name.endsWith(".json") ? [file] : [];
    });
  })(storeRoot);
  for (const file of files) {
    const { errors } = readCommunityDataset(JSON.parse(readFileSync(file, "utf8")));
    if (errors.length) throw new Error(`${path.relative(storeRoot, file)}: ${errors.join("; ")}`);
  }
  const result = loadCommunitySignalStore(storeRoot);
  if (result.invalidDatasets.length) {
    throw new Error(`Published datasets failed validation:\n${result.invalidDatasets.map((item) => `${item.datasetId}: ${item.error}`).join("\n")}`);
  }
  if (!files.length) throw new Error(`No published datasets found in ${storeRoot}`);
  if (result.datasets.length + result.withdrawnDatasets.length !== result.scanned) {
    throw new Error("Published dataset scan was incomplete");
  }
  return result;
}

try {
  const schemas = verifySchemas();
  const store = verifyPublishedStore();
  process.stdout.write(`Release verification passed: ${schemas} schemas, ${store.scanned} published datasets (${store.withdrawnDatasets.length} withdrawn).\n`);
} catch (error) {
  process.stderr.write(`Release verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
