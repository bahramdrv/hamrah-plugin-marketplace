import { createHash } from "node:crypto";
import Ajv from "ajv";

const CACHE_TTL_SECONDS = 30 * 86400;
const MAX_RESPONSE_BYTES = 300_000;
const RESEARCH_INSTITUTION_TYPES = new Set(["education", "nonprofit", "government", "facility"]);
const schema = { type: "object", additionalProperties: false,
  required: ["countryCode", "field", "researchFocus"],
  properties: {
    countryCode: { type: "string", pattern: "^[A-Z]{2}$" },
    field: { type: "string", minLength: 2, maxLength: 120 },
    researchFocus: { type: "string", minLength: 2, maxLength: 200 }
  } };
const validate = new Ajv({ allErrors: true }).compile(schema);

export const SUPERVISOR_DISCOVERY_TOOL = {
  name: "discoverAcademicSupervisorCandidates",
  title: "Find academic supervisor research candidates",
  description: "On an explicit professor-search request, use bounded OpenAlex and ROR lookups and a shared, expiring candidate-name cache. Results are unverified research hints only. Recheck current official institutional pages before showing any name, topic claim, contact, recruitment, or former-student claim to the user. Send only country, field and topic; never applicant data.",
  inputSchema: schema,
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false, idempotentHint: true }
};

function cacheKey(scope) {
  const normalized = [scope.countryCode, scope.field, scope.researchFocus]
    .map((item) => item.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).join("\u0000");
  return `hamrah:supervisor-candidates:v1:${createHash("sha256").update(normalized).digest("hex")}`;
}

async function boundedJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" },
    redirect: "error", signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Response exceeds size limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function shortId(value, prefix) {
  return typeof value === "string" && value.startsWith(prefix)
    && (prefix.includes("ror.org") ? /^[a-z0-9]{9}$/.test(value.slice(prefix.length))
      : /^[A-Z0-9]+$/.test(value.slice(prefix.length))) ? value.slice(prefix.length) : null;
}

function publicName(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 200
    && !/[\r\n<>@`\[\]{}]/.test(value) ? value.trim() : null;
}

function validCandidate(item, countryCode) {
  return item && typeof item === "object" && publicName(item.name)
    && shortId(item.openAlexId, "https://openalex.org/A")
    && item.countryCode === countryCode
    && typeof item.institution === "string" && item.institution.length <= 200
    && !/[\r\n<>@`\[\]{}]/.test(item.institution)
    && (item.rorId === null || shortId(item.rorId, "https://ror.org/"));
}

function candidatesFromWorks(body, countryCode) {
  if (!Array.isArray(body?.results)) throw new Error("Unexpected OpenAlex response");
  const candidates = [];
  const seen = new Set();
  for (const work of body.results.slice(0, 15)) {
    for (const authorship of (Array.isArray(work?.authorships) ? work.authorships : []).slice(0, 20)) {
      const name = publicName(authorship?.author?.display_name);
      const openAlexId = authorship?.author?.id;
      const institution = (Array.isArray(authorship?.institutions) ? authorship.institutions : [])
        .find((item) => item?.country_code === countryCode && RESEARCH_INSTITUTION_TYPES.has(item.type)
          && typeof item.display_name === "string");
      if (!name || !shortId(openAlexId, "https://openalex.org/A") || !institution || seen.has(openAlexId)) continue;
      seen.add(openAlexId);
      const institutionName = publicName(institution.display_name);
      if (!institutionName) continue;
      candidates.push({ name, openAlexId, institution: institutionName,
        rorId: shortId(institution.ror, "https://ror.org/") ? institution.ror : null,
        countryCode, verificationStatus: "unverified" });
      if (candidates.length >= 12) return candidates;
    }
  }
  return candidates;
}

function persisted(candidates) {
  return candidates.map(({ name, openAlexId, institution, rorId, countryCode }) =>
    ({ name, openAlexId, institution, rorId, countryCode }));
}

function merge(primary, secondary) {
  const seen = new Set();
  return [...primary, ...secondary].filter((item) => {
    if (seen.has(item.openAlexId)) return false;
    seen.add(item.openAlexId);
    return true;
  }).slice(0, 12);
}

export function supervisorCacheStoreFromEnv(env = process.env, fetchImpl = globalThis.fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const endpoint = `${url.replace(/\/+$/, "")}/`;
  async function command(parts) {
    const response = await fetchImpl(endpoint, { method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parts), signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const result = await response.json();
    if (result?.error) throw new Error("Redis command failed");
    return result?.result;
  }
  return { kind: "redis", async read(key) { return command(["GET", key]); },
    async write(key, value, ttl) {
      if (await command(["SETEX", key, ttl, value]) !== "OK") throw new Error("Redis write failed");
    } };
}

export async function discoverAcademicSupervisorCandidates(input, fetchImpl = globalThis.fetch, signal,
  store = supervisorCacheStoreFromEnv()) {
  if (!validate(input)) return { error: "invalid_supervisor_discovery_input",
    details: (validate.errors ?? []).map((item) => `${item.instancePath || "root"}: ${item.message}`) };
  const scope = { countryCode: input.countryCode, field: input.field.trim(), researchFocus: input.researchFocus.trim() };
  const key = cacheKey(scope);
  const coverage = { cacheRead: store ? "miss" : "unavailable", cacheWrite: store ? "not_saved" : "unavailable",
    apiStatus: "unavailable", rorChecked: 0, rorFailed: 0, failures: [] };
  let cached = [];
  if (store) try {
    const value = await store.read(key);
    if (value) {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) cached = parsed.filter((item) => validCandidate(item, scope.countryCode))
        .slice(0, 12).map(({ name, openAlexId, institution, rorId, countryCode }) =>
          ({ name, openAlexId, institution, rorId, countryCode, verificationStatus: "unverified" }));
      coverage.cacheRead = cached.length ? "hit" : "miss";
    }
  } catch { coverage.cacheRead = "unavailable"; coverage.failures.push({ source: "candidate_cache", reason: "read_failed" }); }
  let fresh = [];
  try {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", `${scope.field} ${scope.researchFocus}`);
    url.searchParams.set("filter", `from_publication_date:${new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10)},institutions.country_code:${scope.countryCode.toLowerCase()}`);
    url.searchParams.set("per_page", "15");
    url.searchParams.set("select", "id,title,publication_year,authorships");
    const body = await boundedJson(fetchImpl, url.href, signal);
    fresh = candidatesFromWorks(body, scope.countryCode);
    coverage.apiStatus = "searched";
  } catch (error) { coverage.failures.push({ source: "openalex", reason: error instanceof Error ? error.message : String(error) }); }
  const candidates = merge(fresh, cached);
  const rorIds = [...new Set(candidates.map((candidate) => candidate.rorId).filter(Boolean))].slice(0, 3);
  const rorResults = await Promise.all(rorIds.map(async (rorId) => {
    try {
      const id = shortId(rorId, "https://ror.org/");
      const body = await boundedJson(fetchImpl, `https://api.ror.org/v2/organizations/${id}`, signal);
      return body?.id === rorId && body?.locations?.some((location) =>
        location?.geonames_details?.country_code === scope.countryCode);
    } catch { return false; }
  }));
  coverage.rorChecked = rorResults.filter(Boolean).length;
  coverage.rorFailed = rorResults.length - coverage.rorChecked;
  if (coverage.rorFailed) coverage.failures.push({ source: "ror", reason: "organization_check_failed" });
  if (store && coverage.apiStatus === "searched") try {
    await store.write(key, JSON.stringify(persisted(candidates)), CACHE_TTL_SECONDS);
    coverage.cacheWrite = "saved";
  } catch { coverage.cacheWrite = "unavailable"; coverage.failures.push({ source: "candidate_cache", reason: "write_failed" }); }
  return { schemaVersion: "1.0.0", status: coverage.apiStatus === "searched" ? "candidates_searched" : "partial",
    searchedAt: new Date().toISOString(), scope, coverage, candidates,
    note: "These names are unverified research hints. Recheck current official institutional pages for every displayed lead, including cached names. If OpenAlex or ROR fails, continue bounded official web search in the requested scope and report the gap. Recruitment, contact, funding, and former-Iranian-student claims require separate official evidence." };
}
