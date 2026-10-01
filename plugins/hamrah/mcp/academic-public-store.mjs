import { createHash } from "node:crypto";
import { canonicalAcademicUrl, safeAcademicText, readBounded } from "./academic-source-contract.mjs";

export const ACADEMIC_SOURCE_RETENTION = Object.freeze({
  ror: { license: "CC0", url: "https://ror.org/about/", ttl: 604800, reuseMs: 600000 },
  crossref: { license: "factual_metadata_only", url: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/", ttl: 604800, reuseMs: 600000 },
  "openalex:awards": { license: "CC0", url: "https://help.openalex.org/data/awards/", ttl: 604800, reuseMs: 600000 }
});
const fields = new Set(["kind", "title", "url", "institution", "countryCode", "discoverySource", "sourceId", "rorId", "officialHomepage", "verificationStatus", "doi"]);
function safeRecord(record) {
  return record && Object.keys(record).every((key) => fields.has(key)) && safeAcademicText(record.title)
    && canonicalAcademicUrl(record.url) === record.url && ["unverified", "metadata_only"].includes(record.verificationStatus)
    && (record.institution == null || safeAcademicText(record.institution, 200))
    && (record.countryCode == null || /^[A-Z]{2}$/.test(record.countryCode))
    && Object.values(record).every((v) => v === null || (typeof v === "string" && v.length <= 2000 && !/[<>@`\r\n]/.test(v)));
}
export function publicAcademicSnapshot(source, outcome, now) {
  if (!ACADEMIC_SOURCE_RETENTION[source] || outcome.failures?.length) return null;
  const snapshot = { version: 1, source, observedAt: now, candidates: (outcome.candidates ?? []).slice(0, 10),
    researchContext: (outcome.researchContext ?? []).slice(0, 10), countriesChecked: outcome.countriesChecked ?? [], truncated: Boolean(outcome.truncated) };
  if (![...snapshot.candidates, ...snapshot.researchContext].every(safeRecord)) return null;
  const raw = JSON.stringify(snapshot); return Buffer.byteLength(raw) <= 16000 ? raw : null;
}
export function publicAcademicStoreFromEnv(env = process.env, fetchImpl = globalThis.fetch) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (env.HAMRAH_ACADEMIC_PUBLIC_STORE_ENABLED !== "true" || !url || !token) return null;
  async function command(parts) {
    const r = await fetchImpl(url, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parts), signal: AbortSignal.timeout(1200) });
    const body = JSON.parse(await readBounded(r, 20000));
    if (body.error) throw new Error("public_store_failed");
    return body.result;
  }
  const quota = `
local d=tonumber(redis.call('GET',KEYS[1]) or '0'); local m=tonumber(redis.call('GET',KEYS[2]) or '0');
if d>=1000 or m>=20000 then return {0,'quota_denied'} end
redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800);
redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],3456000);
`;
  const keys = (key) => { const now = new Date().toISOString(); return [`hamrah:academic-public:v1:day:${now.slice(0, 10)}`, `hamrah:academic-public:v1:month:${now.slice(0, 7)}`, key, "hamrah:academic-public:v1:index"]; };
  return { kind: "redis", async read(key) {
    const result = await command(["EVAL", `${quota} return {1,redis.call('GET',KEYS[3]) or ''}`, 4, ...keys(key)]);
    if (result?.[0] !== 1) throw new Error("public_store_quota_denied");
    return result[1] || null;
  }, async write(key, value, ttl) {
    const result = await command(["EVAL", `${quota}
redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',ARGV[3]);
if not redis.call('ZSCORE',KEYS[4],KEYS[3]) and redis.call('ZCARD',KEYS[4])>=300 then return {0,'record_limit'} end
redis.call('SET',KEYS[3],ARGV[1],'EX',ARGV[2]); redis.call('ZADD',KEYS[4],tonumber(ARGV[3])+tonumber(ARGV[2])*1000,KEYS[3]);
redis.call('EXPIRE',KEYS[4],math.max(604800,tonumber(ARGV[2]))); return {1,'OK'}`, 4, ...keys(key), value, ttl, Date.now()]);
    if (result?.[0] !== 1) throw new Error("public_store_write_denied");
  } };
}
export async function withPublicAcademicCache(source, scope, work, options) {
  const policy = ACADEMIC_SOURCE_RETENTION[source], store = options.store;
  if (!policy || !store) return { result: await work(), cache: "disabled" };
  const key = `hamrah:academic-public:v1:${createHash("sha256").update(JSON.stringify([source, scope.type, scope.institution ?? scope.field, scope.researchFocus, scope.countryCode])).digest("hex")}`;
  const now = Date.parse(options.checkedAt);
  let cache = "miss";
  try {
    const raw = await store.read(key);
    if (typeof raw === "string" && Buffer.byteLength(raw) <= 16000) {
      const snapshot = JSON.parse(raw), age = now - Date.parse(snapshot.observedAt);
      if (snapshot.version === 1 && snapshot.source === source && age >= 0 && age < policy.reuseMs
        && publicAcademicSnapshot(source, snapshot, snapshot.observedAt) === raw) return { result: snapshot, cache: "hit", observedAt: snapshot.observedAt };
    }
  } catch { cache = "unavailable"; }
  const result = await work(), raw = publicAcademicSnapshot(source, result, options.checkedAt);
  if (raw) try { await store.write(key, raw, policy.ttl); cache = "saved"; } catch { cache = "write_failed"; }
  return { result, cache, observedAt: options.checkedAt };
}
