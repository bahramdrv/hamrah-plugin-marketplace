import { isIP } from "node:net";

export function canonicalAcademicUrl(value) {
  try {
    if (typeof value !== "string" || value.length > 2000 || /[\s\\]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname)
      || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}
export function safeAcademicText(value, max = 300) {
  return typeof value === "string" && value.trim().length > 1 && value.length <= max && !/[<>@`\r\n\[\]{}]/.test(value)
    ? value.trim() : null;
}
export async function readBounded(response, bytes = 300000) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_response");
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bytes) { await reader.cancel(); throw new Error("response_size_limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export function safeSourceFailure(error) {
  if (/^HTTP \d{3}$|^response_size_limit$|^empty_response$/.test(error?.message)) return error.message;
  if (["AbortError", "TimeoutError"].includes(error?.name)) return "source_timeout";
  return "source_failed";
}
export async function withinAcademicBudget(work, signal, milliseconds = 8000) {
  const child = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(milliseconds)]);
  let listener;
  try {
    return await Promise.race([Promise.resolve().then(() => work(child)), new Promise((_, reject) => {
      listener = () => reject(child.reason);
      if (child.aborted) listener(); else child.addEventListener("abort", listener, { once: true });
    })]);
  } finally { if (listener) child.removeEventListener("abort", listener); }
}
