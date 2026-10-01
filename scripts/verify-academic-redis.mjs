// Explicit Preview/build acceptance only. Credentials stay in the deployment process.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { publicAcademicStoreFromEnv, publicAcademicSnapshot } from "../plugins/hamrah/mcp/academic-public-store.mjs";

assert.equal(process.env.HAMRAH_REDIS_ACCEPTANCE, "true", "Run only in an explicitly configured acceptance environment.");
const store = publicAcademicStoreFromEnv({ ...process.env, HAMRAH_ACADEMIC_PUBLIC_STORE_ENABLED: "true" });
assert.ok(store, "Existing Redis configuration required.");
const key = `hamrah:academic-public:v1:acceptance:${randomUUID()}`;
const value = publicAcademicSnapshot("ror", { candidates: [{ kind: "university", title: "University of Oxford", url: "https://www.ox.ac.uk/", institution: "University of Oxford", countryCode: "GB", rorId: "https://ror.org/052gg0110", discoverySource: "ror", sourceId: "https://ror.org/052gg0110", verificationStatus: "unverified" }] }, new Date().toISOString());
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
async function command(parts) {
  const response = await fetch(url, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(parts), signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200, "Redis command HTTP failure");
  const result = await response.json();
  assert.ok(!result.error, "Redis command failed");
  return result.result;
}
try {
  // Reconcile this feature's own metadata index without changing any record's TTL.
  // The first short-TTL acceptance preceded the index lifetime fix; existing records must stay counted.
  let cursor = "0", restored = 0;
  do {
    const page = await command(["SCAN", cursor, "MATCH", "hamrah:academic-public:v1:*", "COUNT", 300]);
    cursor = String(page[0]);
    for (const entry of page[1].filter((k) => /^hamrah:academic-public:v1:[a-f0-9]{64}$/.test(k))) {
      const remaining = await command(["PTTL", entry]);
      if (remaining > 0) { await command(["ZADD", "hamrah:academic-public:v1:index", Date.now() + remaining, entry]); restored++; }
    }
    assert.ok(restored <= 300, "Public record capacity must be bounded");
  } while (cursor !== "0");
  await Promise.all(Array.from({ length: 8 }, () => store.write(key, value, 3)));
  assert.equal(await store.read(key), value);
  const ttl = await command(["TTL", key]);
  assert.ok(ttl > 0 && ttl <= 3, "Redis expiry must be set");
  assert.ok(await command(["TTL", "hamrah:academic-public:v1:index"]) > 3, "Short test records must not shorten the shared metadata index lifetime");
  await setTimeout(1100);
  assert.equal(await store.read(key), value);
  const ttlAfterRead = await command(["TTL", key]);
  assert.ok(ttlAfterRead < ttl, "Reads must not renew expiry");
  await setTimeout(2400);
  assert.equal(await store.read(key), null, "Redis must delete expired records");
  console.log(JSON.stringify({ academicRedisAcceptance: "passed", concurrentWrites: 8, expirySeconds: 3, readsRenewExpiry: false, reconciledPublicRecords: restored }));
} finally {
  await command(["DEL", key]);
  await command(["ZREM", "hamrah:academic-public:v1:index", key]);
}
