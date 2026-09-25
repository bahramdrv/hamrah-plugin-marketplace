import { createHash } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

const MAX_MEMORY_WINDOWS = 10_000;
const MAX_SESSION_ID_LENGTH = 200;

function windowFor(now, windowMs) {
  const index = Math.floor(now / windowMs);
  return { index, resetAt: (index + 1) * windowMs };
}

export function createMemoryRateLimitStore({ now = Date.now } = {}) {
  const windows = new Map();
  return {
    kind: "memory",
    async hit(key, windowMs) {
      const current = now();
      const { index, resetAt } = windowFor(current, windowMs);
      if (windows.size >= MAX_MEMORY_WINDOWS) {
        for (const [windowKey, entry] of windows) if (entry.resetAt <= current) windows.delete(windowKey);
        if (windows.size >= MAX_MEMORY_WINDOWS) windows.delete(windows.keys().next().value);
      }
      const windowKey = `${key}:${index}`;
      const entry = windows.get(windowKey) ?? { count: 0, resetAt };
      entry.count++;
      windows.set(windowKey, entry);
      return { count: entry.count, retryAfterMs: resetAt - current };
    }
  };
}

export function createRedisRestRateLimitStore({ url, token, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 1_000 }) {
  const endpoint = `${url.replace(/\/+$/, "")}/multi-exec`;
  return {
    kind: "redis",
    async hit(key, windowMs) {
      const current = now();
      const { index, resetAt } = windowFor(current, windowMs);
      const windowKey = `${key}:${index}`;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", windowKey], ["PEXPIREAT", windowKey, String(resetAt + windowMs)]]),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`Rate-limit store returned HTTP ${response.status}.`);
      const count = (await response.json())?.[0]?.result;
      if (!Number.isInteger(count)) throw new Error("Rate-limit store returned an invalid counter.");
      return { count, retryAfterMs: resetAt - current };
    }
  };
}

export function rateLimitStoreFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createRedisRestRateLimitStore({ url, token });
  if (env.VERCEL) {
    console.warn("Rate limiting uses per-instance memory; set KV_REST_API_URL/KV_REST_API_TOKEN for a shared store.");
  }
  return createMemoryRateLimitStore();
}

function originKey(address) {
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mapped && isIPv4(mapped)) return mapped;
  if (!isIPv6(address)) return address;
  const [head, tail = ""] = address.toLowerCase().split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = address.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

function clientAddress(req, trustProxyHeaders) {
  if (trustProxyHeaders) {
    const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.get("x-real-ip")?.trim();
    if (forwarded) return originKey(forwarded);
  }
  return originKey(req.socket.remoteAddress ?? "unknown");
}

function hashed(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function createRateLimiter({ store, windowMs, ipRequestsPerWindow, sessionRequestsPerWindow, trustProxyHeaders }) {
  return async (req, res, next) => {
    const budgets = [["ip", clientAddress(req, trustProxyHeaders), ipRequestsPerWindow]];
    const sessionId = req.get("mcp-session-id");
    if (sessionId && sessionId.length <= MAX_SESSION_ID_LENGTH) budgets.push(["session", sessionId, sessionRequestsPerWindow]);
    try {
      for (const [scope, identity, limit] of budgets) {
        const { count, retryAfterMs } = await store.hit(`hamrah:rl:${scope}:${hashed(identity)}`, windowMs);
        if (count > limit) {
          const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
          res.setHeader("Retry-After", String(retryAfterSeconds));
          return res.status(429).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32000,
              message: `Rate limit exceeded for this ${scope}; retry after ${retryAfterSeconds} seconds.`,
              data: { reason: "rate_limit_exceeded", scope, limit, windowMs, retryAfterSeconds }
            }
          });
        }
      }
    } catch (error) {
      console.error(`Rate limiting unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    next();
  };
}
