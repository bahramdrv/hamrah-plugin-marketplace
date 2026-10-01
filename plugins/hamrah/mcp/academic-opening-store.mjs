import Ajv from "ajv";
import { randomUUID } from "node:crypto";
// Only CC0 Platsbanken postdoc leads are eligible for this first source slice.
export const JOBTECH_SOURCE = "jobtech:se:postdoc";
const JOBTECH_URL = "https://jobsearch.api.jobtechdev.se/search?q=postdoc&limit=100";
const JOBTECH_FIELDS = "total{value},hits{id,headline,webpage_url,application_deadline,employer{name,organization_number},workplace_address{country,country_code},removed}";
const MAX_BYTES = 100_000;
const validateSnapshot = new Ajv().compile({ type: "object", additionalProperties: false,
  required: ["schemaVersion", "observedAt", "leads", "truncated"], properties: {
    schemaVersion: { const: "1.0.0" }, observedAt: { type: "integer", minimum: 0 }, truncated: { type: "boolean" },
    leads: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false,
      required: ["sourceId", "discoverySource", "publisherId", "institution", "title", "url", "countryCode",
        "targetCategory", "discoveryMatch", "deadlineText", "verificationStatus"],
      properties: { sourceId: { type: "string", pattern: "^[0-9]{1,12}$" }, discoverySource: { const: JOBTECH_SOURCE },
        publisherId: { type: "string", pattern: "^[0-9]{10}$" }, institution: { type: "string", maxLength: 200 },
        title: { type: "string", maxLength: 300 }, url: { type: "string", maxLength: 200 }, countryCode: { const: "SE" },
        targetCategory: { const: "postdoc" }, discoveryMatch: { const: "title" },
        deadlineText: { anyOf: [{ type: "null" }, { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }] },
        verificationStatus: { const: "unverified" } } } }
  } });

function validDay(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function snapshotValid(snapshot, now) {
  return validateSnapshot(snapshot) && Buffer.byteLength(JSON.stringify(snapshot)) <= MAX_BYTES
    && snapshot.observedAt <= now && now - snapshot.observedAt < 7 * 86400_000
    && snapshot.leads.every((item) => item.url === `https://arbetsformedlingen.se/platsbanken/annonser/${item.sourceId}`
      && (item.deadlineText === null || validDay(item.deadlineText))
      && !/[<>@\r\n]/.test(`${item.title} ${item.institution}`));
}

async function boundedJson(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty JobTech response");
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("JobTech response exceeds size limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalize(item, now) {
  if (!item || typeof item.id !== "string" || !/^\d{1,12}$/.test(item.id)
    || item.webpage_url !== `https://arbetsformedlingen.se/platsbanken/annonser/${item.id}`
    || item.removed !== false || item.workplace_address?.country_code !== "199"
    || item.workplace_address?.country !== "Sverige"
    || typeof item.headline !== "string" || item.headline.length > 300
    || /[<>@\r\n]/.test(item.headline)
    || !/\bpostdoc(?:toral)?\b|\bpostdoktor\b/i.test(item.headline)
    || typeof item.employer?.organization_number !== "string"
    || !/^\d{10}$/.test(item.employer.organization_number)
    || typeof item.employer.name !== "string" || item.employer.name.length > 200
    || /[<>@\r\n]/.test(item.employer.name)) return null;
  const deadline = typeof item.application_deadline === "string"
    && item.application_deadline.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}$/)?.[1];
  if (deadline && (!validDay(deadline)
    || deadline <= new Date(now).toISOString().slice(0, 10))) return null;
  return { sourceId: item.id, discoverySource: JOBTECH_SOURCE,
    publisherId: item.employer.organization_number, institution: item.employer.name.trim(),
    title: item.headline.trim(), url: item.webpage_url, countryCode: "SE", targetCategory: "postdoc",
    discoveryMatch: "title", deadlineText: deadline || null, verificationStatus: "unverified" };
}

// All keys describe one public source, never the user's field or profile.
const PREFIX = "hamrah:academic-openings:v1:jobtech-postdoc";
const TAKE = `
local data = redis.call('GET', KEYS[1])
local snapshot = cjson.null
if data then snapshot = cjson.decode(data) end
local function result(state, lease)
  return cjson.encode({state=state,lease=lease or cjson.null,snapshot=data or cjson.null})
end
-- Conservative operation reservations, not a vendor billing meter.
if tonumber(redis.call('GET',KEYS[3]) or '0') >= 960 or
   tonumber(redis.call('GET',KEYS[4]) or '0') >= 19960 then return result('quota') end
redis.call('INCRBY',KEYS[3],40); redis.call('EXPIRE',KEYS[3],172800)
redis.call('INCRBY',KEYS[4],40); redis.call('EXPIRE',KEYS[4],5356800)
if snapshot ~= cjson.null and tonumber(snapshot.observedAt) and
   tonumber(ARGV[1])-snapshot.observedAt >= 0 and
   tonumber(ARGV[1])-snapshot.observedAt < 600000 then return result('hit') end
if redis.call('EXISTS',KEYS[7]) == 1 then return result('cooldown') end
if redis.call('EXISTS',KEYS[2]) == 1 then return result('busy') end
if tonumber(redis.call('GET',KEYS[5]) or '0') >= 100 or
   tonumber(redis.call('GET',KEYS[6]) or '0') >= 10 then return result('quota') end
redis.call('INCR',KEYS[5]); redis.call('EXPIRE',KEYS[5],172800)
redis.call('INCR',KEYS[6]); redis.call('EXPIRE',KEYS[6],120)
redis.call('SET',KEYS[2],ARGV[2],'EX',30)
return result('refresh',ARGV[2])`;
const SAVE = `
if redis.call('GET',KEYS[2]) ~= ARGV[1] then return 'LEASE_LOST' end
redis.call('SET',KEYS[1],ARGV[2],'EX',604800)
redis.call('DEL',KEYS[2])
return 'OK'`;
const RELEASE = `
if redis.call('GET',KEYS[1]) == ARGV[1] then
  redis.call('DEL',KEYS[1])
  if tonumber(ARGV[2]) > 0 then redis.call('SET',KEYS[2],'1','EX',ARGV[2]) end
end
return 'OK'`;

function redisStore(options) {
  const env = options.env ?? process.env;
  if (env.HAMRAH_ACADEMIC_OPENING_CACHE_ENABLED !== "true") return null;
  const endpoint = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  // Enabling without credentials must fail closed, not bypass the quota guard.
  const call = async (command) => {
    if (!endpoint || !token || new URL(endpoint).protocol !== "https:") throw new Error("Cache unavailable");
    const response = await (options.cacheFetch ?? fetch)(endpoint, { method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command), signal: AbortSignal.timeout(3000) });
    const body = await boundedJson(response);
    if (body.error || body.result === undefined) throw new Error("Cache unavailable");
    return body.result;
  };
  return {
    async take(now) {
      const day = new Date(now).toISOString().slice(0,10);
      const month = day.slice(0,7);
      const result = await call(["EVAL", TAKE, 7, `${PREFIX}:data`, `${PREFIX}:lease`,
        `${PREFIX}:storage:${day}`, `${PREFIX}:storage:${month}`, `${PREFIX}:provider:${day}`,
        `${PREFIX}:provider-minute:${Math.floor(now / 60000)}`, `${PREFIX}:cooldown`, now, randomUUID()]);
      const reservation = JSON.parse(result);
      if (typeof reservation.snapshot === "string") reservation.snapshot = JSON.parse(reservation.snapshot);
      if (!["hit", "refresh", "busy", "quota", "cooldown"].includes(reservation.state)
        || (reservation.state === "hit" && !reservation.snapshot)
        || (reservation.state === "refresh" && typeof reservation.lease !== "string")) throw new Error("Invalid reservation");
      return reservation;
    },
    async save(lease, snapshot) {
      if (!snapshotValid(snapshot, snapshot.observedAt)) throw new Error("Invalid snapshot");
      const result = await call(["EVAL", SAVE, 2, `${PREFIX}:data`, `${PREFIX}:lease`, lease, JSON.stringify(snapshot)]);
      if (result !== "OK") throw new Error("Cache write unavailable");
    },
    async release(lease, cooldown = 0) {
      await call(["EVAL", RELEASE, 2, `${PREFIX}:lease`, `${PREFIX}:cooldown`, lease, cooldown]);
    }
  };
}

export async function discoverSwedishPostdocCandidates(input, fetchImpl, signal, options = {}) {
  const now = (options.now ?? Date.now)();
  const store = options.store ?? redisStore(options);
  const cache = { source: JOBTECH_SOURCE, read: store ? "miss" : "disabled",
    write: store ? "not_saved" : "disabled", apiSearch: "searched", ageSeconds: null };
  let reservation;
  try { reservation = store ? await store.take(now) : null; }
  catch { return { ...select({ leads: [], truncated: true }, input,
    { ...cache, read: "unavailable", apiSearch: "skipped_quota_unavailable" }, now), failure: "cache_quota_unavailable" }; }
  if (reservation?.snapshot && !snapshotValid(reservation.snapshot, now)) {
    return { ...select({ leads: [], truncated: true }, input,
      { ...cache, read: "invalid", apiSearch: "skipped_invalid_snapshot" }, now), failure: "invalid_cached_snapshot" };
  }
  if (reservation && reservation.state !== "refresh" && reservation.state !== "hit") {
    cache.read = reservation.snapshot ? "stale" : "miss";
    cache.apiSearch = `skipped_${reservation.state}`;
    cache.ageSeconds = reservation.snapshot ? Math.floor((now - reservation.snapshot.observedAt) / 1000) : null;
    return { ...select(reservation.snapshot ?? { leads: [], truncated: true }, input, cache, now),
      failure: reservation.state === "busy" ? "refresh_in_progress" : "source_quota_unavailable" };
  }
  if (reservation?.state === "hit") {
    cache.read = "hit";
    cache.apiSearch = "skipped_recent_snapshot";
    cache.ageSeconds = Math.floor((now - reservation.snapshot.observedAt) / 1000);
    return select(reservation.snapshot, input, cache, now);
  }
  try {
    const response = await fetchImpl(JOBTECH_URL, { method: "GET", redirect: "error",
      headers: { Accept: "application/json", "X-Fields": JOBTECH_FIELDS },
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]) });
    if (response.status === 429) {
      const error = new Error("HTTP 429");
      const retry = Number(response.headers.get("Retry-After"));
      error.cooldown = Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.max(60, Math.ceil(retry))) : 3600;
      throw error;
    }
    const body = await boundedJson(response);
    if (!Array.isArray(body?.hits) || !Number.isSafeInteger(body?.total?.value) || body.total.value < 0) {
      throw new Error("Unexpected JobTech response");
    }
    const leads = body.hits.slice(0, 100).map((item) => normalize(item, now)).filter(Boolean);
    const snapshot = { schemaVersion: "1.0.0", observedAt: now, leads,
      truncated: body.total.value > body.hits.length || body.hits.length > 100 };
    if (store) try {
      await store.save(reservation.lease, snapshot);
      cache.write = "saved";
    } catch {
      cache.write = "unavailable";
      return { ...select(snapshot, input, cache, now), failure: "cache_write_failed" };
    }
    return select(snapshot, input, cache, now);
  } catch (error) {
    if (store) try { await store.release(reservation.lease, error?.cooldown ?? 0); } catch { /* Lease also expires. */ }
    cache.read = reservation?.snapshot ? "stale" : cache.read;
    cache.ageSeconds = reservation?.snapshot ? Math.floor((now - reservation.snapshot.observedAt) / 1000) : null;
    return { ...select(reservation?.snapshot ?? { leads: [], truncated: true }, input, cache, now),
      failure: error instanceof Error ? error.message : "source_failed" };
  }
}

function select(snapshot, input, cache, now) {
  const tokens = input.field.toLowerCase().split(/\s+/).filter(Boolean);
  const today = new Date(now).toISOString().slice(0, 10);
  return { candidates: snapshot.leads.filter((item) => (item.deadlineText === null || item.deadlineText > today)
    && tokens.every((token) => item.title.toLowerCase().includes(token))),
    truncated: snapshot.truncated, cache,
    scope: { source: JOBTECH_SOURCE, query: "postdoc", limit: 100, titleMatchOnly: true,
      note: "Platsbanken only; title spelling/language and the 100-record cap may omit openings. Verify the current exact institutional posting before reporting any lead as open." } };
}
