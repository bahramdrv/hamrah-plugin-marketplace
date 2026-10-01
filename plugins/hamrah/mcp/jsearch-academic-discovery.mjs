import { isIP } from "node:net";

const SOURCE = "jsearch:openwebninja";
const FIELDS = "job_id,job_title,employer_name,job_country,job_apply_link,job_apply_is_direct,job_publisher,job_posted_at_datetime_utc";
const categories = {
  phd: { query: "PhD doctoral university", title: /\b(?:phd|doctoral)\b(?=.{0,80}\b(?:student(?:ship)?|candidate|position|fellow|researcher|scholar)\b)|\bdoctorant\b|\bdoktorand\b/i },
  postdoc: { query: "postdoc university", title: /\bpostdoc(?:toral)?\b|\bpostdoctoral\b|\bpostdoktor\b/i },
  research_job: { query: "researcher university", title: /\bresearch(?:er)?\b|\bscientist\b|\bfellow\b/i }
};

function publicText(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit
    && !/[<>@\r\n`]/.test(value) ? value.trim() : null;
}

function publicLink(value) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !isIP(url.hostname)
      && !url.hostname.includes(":") && url.hostname.includes(".")
      && !/^(?:localhost|127\.)|\.(?:local|internal)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

async function readJson(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty JSearch response");
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100_000) { await reader.cancel(); throw new Error("JSearch response exceeds size limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function discoverJsearchCandidates(input, fetchImpl, signal, options = {}) {
  const env = options.env ?? process.env;
  if (env.HAMRAH_JSEARCH_ENABLED !== "true" || !categories[input.targetCategory]) return null;
  const result = { source: SOURCE, candidates: [], countriesChecked: [], failures: [], truncated: false,
    scope: { source: SOURCE, countriesRequested: input.countryCode ? [input.countryCode] : ["US", "GB", "DE", "CA", "AU"],
      pagesPerCountry: 1, maxResultsPerCountry: 10, persistence: "disabled",
      note: "Google for Jobs leads only; no published university coverage denominator. Title/language, first-page and sampled-country limits make coverage partial. Provider direct-apply flags are unverified; check the current exact institutional posting." } };
  if (!env.OPENWEBNINJA_API_KEY || env.HAMRAH_JSEARCH_FREE_PLAN_CONFIRMED !== "true") {
    result.failures.push({ source: SOURCE, reason: "jsearch_free_configuration_missing" });
    return result;
  }
  const deadlineMs = Number.isInteger(options.jsearchDeadlineMs) ? Math.max(1, Math.min(12000, options.jsearchDeadlineMs)) : 12000;
  const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(deadlineMs)]);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const fieldTokens = input.field.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const country of result.scope.countriesRequested) {
    if (requestSignal.aborted) {
      result.failures.push({ source: SOURCE, countryCode: country, reason: "jsearch_search_budget_exhausted" });
      break;
    }
    const url = new URL("https://api.openwebninja.com/jsearch/search-v2");
    url.searchParams.set("query", `${input.field.trim()} ${categories[input.targetCategory].query} in ${names.of(country)}`);
    url.searchParams.set("country", country.toLowerCase());
    url.searchParams.set("num_pages", "1");
    url.searchParams.set("fields", FIELDS);
    try {
      const response = await fetchImpl(url.href, { method: "GET", redirect: "error",
        headers: { Accept: "application/json", "x-api-key": env.OPENWEBNINJA_API_KEY },
        signal: requestSignal });
      const body = await readJson(response);
      if (body?.status !== "OK" || !Array.isArray(body?.data?.jobs)) throw new Error("Unexpected JSearch response");
      result.countriesChecked.push(country);
      result.truncated ||= Boolean(body.data.cursor) || body.data.jobs.length >= 10;
      for (const item of body.data.jobs.slice(0, 10)) {
        const title = publicText(item?.job_title, 300);
        const institution = publicText(item?.employer_name, 200);
        const link = publicLink(item?.job_apply_link);
        if (!title || !institution || !link || item.job_country !== country
          || [title, institution, link, item.job_id].some((value) => typeof value === "string" && value.includes(env.OPENWEBNINJA_API_KEY))
          || !publicText(item.job_id, 2048) || !categories[input.targetCategory].title.test(title)
          || (input.targetCategory === "phd" && /\bpostdoc/i.test(title))
          || (input.targetCategory === "research_job" && /\bpostdoc|\bdoctoral|\bintern/i.test(title))
          || !fieldTokens.every((token) => title.toLowerCase().includes(token))) continue;
        result.candidates.push({ sourceId: item.job_id, discoverySource: SOURCE,
          institution, title, url: link, countryCode: country, targetCategory: input.targetCategory,
          discoveryMatch: "title", deadlineText: null, verificationStatus: "unverified",
          sourceReportedDirectApply: item.job_apply_is_direct === true });
      }
    } catch (error) {
      // Never echo provider bodies, URLs, request headers or credentials.
      const reason = /^HTTP \d{3}$|^JSearch response exceeds size limit$|^Unexpected JSearch response$/.test(error?.message)
        ? error.message : "jsearch_source_failed";
      result.failures.push({ source: SOURCE, countryCode: country, reason });
      if (["HTTP 401", "HTTP 402", "HTTP 403", "HTTP 429"].includes(reason)) break;
    }
  }
  return result;
}
