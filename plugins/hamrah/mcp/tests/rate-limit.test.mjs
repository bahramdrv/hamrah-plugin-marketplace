import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../../../../server.mjs";
import { createMemoryRateLimitStore, createRedisRestRateLimitStore } from "../rate-limit.mjs";

const okFetch = async () => new Response(JSON.stringify([]), { status: 200 });

async function listen(t, options) {
  const server = createApp({ fetchImpl: okFetch, ...options }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/mcp`;
}

function listTools(url, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  });
}

function clock(start = 1_000_000) {
  const state = { now: start };
  return Object.assign(() => state.now, { advance: (ms) => { state.now += ms; } });
}

async function assertThrottled(response, scope) {
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  const body = await response.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.error.data.reason, "rate_limit_exceeded");
  assert.equal(body.error.data.scope, scope);
  assert.ok(body.error.data.retryAfterSeconds >= 1);
  return body;
}

test("an origin is allowed within budget, throttled past it, and recovers in the next window", async (t) => {
  const now = clock();
  const url = await listen(t, {
    rateLimitStore: createMemoryRateLimitStore({ now }),
    rateLimitWindowMs: 60_000,
    ipRequestsPerWindow: 2
  });
  assert.equal((await listTools(url)).status, 200);
  assert.equal((await listTools(url)).status, 200);
  const body = await assertThrottled(await listTools(url), "ip");
  assert.equal(body.error.data.limit, 2);

  now.advance(60_000);
  assert.equal((await listTools(url)).status, 200);
});

test("distinct trusted client addresses keep separate budgets", async (t) => {
  const url = await listen(t, {
    rateLimitStore: createMemoryRateLimitStore({ now: clock() }),
    ipRequestsPerWindow: 1,
    trustProxyHeaders: true
  });
  assert.equal((await listTools(url, { "X-Forwarded-For": "203.0.113.1" })).status, 200);
  await assertThrottled(await listTools(url, { "X-Forwarded-For": "203.0.113.1" }), "ip");
  assert.equal((await listTools(url, { "X-Forwarded-For": "203.0.113.2" })).status, 200);
});

test("spoofed forwarding headers and rotated sessions do not bypass the origin budget", async (t) => {
  const url = await listen(t, {
    rateLimitStore: createMemoryRateLimitStore({ now: clock() }),
    ipRequestsPerWindow: 1,
    trustProxyHeaders: false
  });
  assert.equal((await listTools(url, { "X-Forwarded-For": "198.51.100.1", "Mcp-Session-Id": "a" })).status, 200);
  await assertThrottled(await listTools(url, { "X-Forwarded-For": "198.51.100.2", "X-Real-IP": "198.51.100.3", "Mcp-Session-Id": "b" }), "ip");
});

test("a session budget throttles one session without affecting another from the same origin", async (t) => {
  const url = await listen(t, {
    rateLimitStore: createMemoryRateLimitStore({ now: clock() }),
    ipRequestsPerWindow: 10,
    sessionRequestsPerWindow: 1
  });
  assert.equal((await listTools(url, { "Mcp-Session-Id": "session-a" })).status, 200);
  await assertThrottled(await listTools(url, { "Mcp-Session-Id": "session-a" }), "session");
  assert.equal((await listTools(url, { "Mcp-Session-Id": "session-b" })).status, 200);
});

test("instances sharing a store enforce one budget, as serverless instances do", async (t) => {
  const store = createMemoryRateLimitStore({ now: clock() });
  const first = await listen(t, { rateLimitStore: store, ipRequestsPerWindow: 1 });
  const second = await listen(t, { rateLimitStore: store, ipRequestsPerWindow: 1 });
  assert.equal((await listTools(first)).status, 200);
  await assertThrottled(await listTools(second), "ip");
});

test("the Redis REST store counts per window without storing raw client addresses", async (t) => {
  const counters = new Map();
  const requests = [];
  const redisFetch = async (url, init) => {
    requests.push({ url, init });
    const [[incr, key], [expire, expireKey, at]] = JSON.parse(init.body);
    assert.equal(incr, "INCR");
    assert.equal(expire, "PEXPIREAT");
    assert.equal(expireKey, key);
    assert.ok(Number(at) > 0);
    counters.set(key, (counters.get(key) ?? 0) + 1);
    return new Response(JSON.stringify([{ result: counters.get(key) }, { result: 1 }]), { status: 200 });
  };
  const now = clock();
  const url = await listen(t, {
    rateLimitStore: createRedisRestRateLimitStore({ url: "https://kv.example.test/", token: "secret", fetchImpl: redisFetch, now }),
    ipRequestsPerWindow: 1,
    trustProxyHeaders: true
  });
  assert.equal((await listTools(url, { "X-Forwarded-For": "203.0.113.9" })).status, 200);
  await assertThrottled(await listTools(url, { "X-Forwarded-For": "203.0.113.9" }), "ip");
  now.advance(60_000);
  assert.equal((await listTools(url, { "X-Forwarded-For": "203.0.113.9" })).status, 200);

  assert.equal(requests[0].url, "https://kv.example.test/multi-exec");
  assert.equal(requests[0].init.headers.Authorization, "Bearer secret");
  for (const key of counters.keys()) assert.doesNotMatch(key, /203\.0\.113\.9/);
});

test("an unavailable rate-limit store does not take the endpoint down", async (t) => {
  const failing = { kind: "redis", hit: async () => { throw new Error("store offline"); } };
  const url = await listen(t, { rateLimitStore: failing, ipRequestsPerWindow: 1 });
  assert.equal((await listTools(url)).status, 200);
  assert.equal((await listTools(url)).status, 200);
});

test("IPv6 callers share a budget across their /64 prefix", async (t) => {
  const url = await listen(t, {
    rateLimitStore: createMemoryRateLimitStore({ now: clock() }),
    ipRequestsPerWindow: 1,
    trustProxyHeaders: true
  });
  assert.equal((await listTools(url, { "X-Forwarded-For": "2001:db8:1:2::1" })).status, 200);
  await assertThrottled(await listTools(url, { "X-Forwarded-For": "2001:0db8:0001:0002:ffff::2" }), "ip");
  assert.equal((await listTools(url, { "X-Forwarded-For": "2001:db8:1:3::1" })).status, 200);
  assert.equal((await listTools(url, { "X-Forwarded-For": "::ffff:203.0.113.5" })).status, 200);
  await assertThrottled(await listTools(url, { "X-Forwarded-For": "203.0.113.5" }), "ip");
});
