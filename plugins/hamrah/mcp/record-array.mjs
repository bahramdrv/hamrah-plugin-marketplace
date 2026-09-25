export function pickRecordArray(data) {
  if (Array.isArray(data)) return { records: data, key: null };
  if (!data || typeof data !== "object") return { records: null, key: null };
  for (const key of ["items", "results", "records", "data", "datasets", "packs", "capsules",
    "claims", "updates", "visas", "destinations", "fees", "salaryThresholds", "processingTimes"]) {
    if (Array.isArray(data[key])) return { records: data[key], key };
  }
  return { records: null, key: null };
}
