import Ajv from "ajv";

const DAAD_FEED = "https://api.daad.de/api/feeds/rss/en/phd.xml";
const INPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["field", "targetCategory"],
  properties: {
    field: { type: "string", minLength: 2, maxLength: 120 },
    targetCategory: { enum: ["masters", "phd", "postdoc", "research_job"] },
    countryCode: { type: "string", pattern: "^[A-Z]{2}$", description: "Optional ISO 3166-1 alpha-2 country code, such as DE or US." },
    limit: { type: "integer", minimum: 1, maximum: 20 },
    publisherBoards: { type: "array", maxItems: 2, items: {
      type: "object", additionalProperties: false, required: ["provider", "boardId"],
      properties: { provider: { const: "lever" }, boardId: { type: "string", pattern: "^[a-zA-Z0-9-]{2,80}$" } }
    } }
  }
};
const validate = new Ajv({ allErrors: true }).compile(INPUT_SCHEMA);

export const ACADEMIC_CALL_DISCOVERY_TOOL = {
  name: "discoverAcademicCallCandidates",
  title: "Discover academic call candidates from free sources",
  description: "Find request-scoped leads in no-cost structured sources. Candidates are not verified open calls: inspect the current official publisher page and use web search for uncovered countries and types. Send only public field, category and geography, never an applicant profile.",
  inputSchema: INPUT_SCHEMA,
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false }
};

const plain = (value) => String(value ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(?:amp|#38);/g, "&").replace(/&(?:lt|#60);/g, "<")
  .replace(/&(?:gt|#62);/g, ">").replace(/&(?:quot|#34);/g, '"')
  .replace(/&(?:apos|#39);/g, "'").replace(/&nbsp;|&#160;/g, " ")
  .replace(/\s+/g, " ").trim();
const fieldOf = (xml, name) => plain(xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? "");
const relevant = (body, field) => field.toLowerCase().split(/\s+/).filter(Boolean)
  .every((token) => body.toLowerCase().includes(token));
const monthNumbers = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function knownDeadlineDay(value) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const english = value.match(/^(\d{1,2})\.\s+([A-Za-z]{3})\.?\s+(\d{4})$/);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : english ? [Number(english[3]), monthNumbers[english[2].toLowerCase()], Number(english[1])] : null;
  if (!parts || !parts[1]) return null;
  const [year, month, date] = parts;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === date
    ? parsed.toISOString().slice(0, 10) : null;
}

function parseDaad(xml, field) {
  if (!/<rss\b/.test(xml) || !/<channel>/.test(xml)) throw new Error("DAAD returned an unexpected feed format.");
  const candidates = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = match[1];
    const title = fieldOf(item, "title");
    const summary = fieldOf(item, "description");
    const url = fieldOf(item, "link");
    if (!title || !relevant(`${title} ${summary}`, field)) continue;
    if (!/^https:\/\/www\.daad\.de\//.test(url)) continue;
    candidates.push({
      sourceId: fieldOf(item, "guid") || url,
      discoverySource: "daad_phdgermany",
      title, url, countryCode: "DE", targetCategory: "phd",
      discoveryMatch: relevant(title, field) ? "title" : "description",
      summary: summary.slice(0, 1000),
      publishedText: fieldOf(item, "pubDate") || null,
      deadlineText: fieldOf(item, "applicationDeadline") || null,
      verificationStatus: "unverified"
    });
  }
  return candidates;
}

function leverTitleMatches(title, category) {
  if (category === "postdoc") return /\bpostdoc(?:toral)?\b/i.test(title);
  if (category === "phd") return /\bphd\b|\bdoctoral\b/i.test(title);
  if (category === "research_job") return !/\bintern(?:ship)?\b/i.test(title)
    && /\bresearch(?:er)?\b|\bscientist\b|\bfellow\b/i.test(title);
  return false;
}

function parseLever(body, boardId, input) {
  if (!Array.isArray(body)) throw new Error("Lever returned an unexpected postings format.");
  return body.filter((item) => {
    const title = String(item?.text ?? "");
    const description = String(item?.descriptionPlain ?? "");
    return leverTitleMatches(title, input.targetCategory)
      && relevant(`${title} ${description}`, input.field)
      && (!input.countryCode || item.country === input.countryCode)
      && typeof item.hostedUrl === "string"
      && item.hostedUrl.startsWith(`https://jobs.lever.co/${boardId}/`);
  }).map((item) => ({
    sourceId: String(item.id ?? item.hostedUrl),
    discoverySource: `lever:${boardId}`,
    title: plain(item.text), url: item.hostedUrl,
    countryCode: item.country ?? null, targetCategory: input.targetCategory,
    discoveryMatch: relevant(item.text, input.field) ? "title" : "description",
    summary: plain(item.descriptionPlain).slice(0, 1000),
    publishedText: Number.isFinite(item.createdAt) ? new Date(item.createdAt).toISOString() : null,
    deadlineText: null, verificationStatus: "unverified"
  }));
}

export async function discoverAcademicCallCandidates(input, fetchImpl = globalThis.fetch, signal) {
  if (!validate(input)) return {
    error: "invalid_academic_call_input",
    details: validate.errors?.map((item) => `${item.instancePath || "root"}: ${item.message}`) ?? []
  };
  const limit = input.limit ?? 5;
  const scope = { field: input.field.trim(), targetCategory: input.targetCategory, countryCode: input.countryCode ?? null };
  const coverage = { apiSources: [], countriesChecked: [], candidateCount: 0, matchedCount: 0, expiredKnownCount: 0,
    truncated: false, failures: [], apiCoverage: "unavailable" };
  const candidates = [];
  if (input.targetCategory === "phd" && (!input.countryCode || input.countryCode === "DE")) {
    coverage.apiSources.push("daad_phdgermany");
    try {
      const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
      const response = await fetchImpl(DAAD_FEED, { method: "GET", headers: { Accept: "application/rss+xml, application/xml" }, signal: requestSignal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("feed exceeds size limit");
      candidates.push(...parseDaad(body, input.field.trim()));
      coverage.countriesChecked.push("DE");
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source: "daad_phdgermany", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  // These publisher board identifiers were checked against their current public careers pages
  // and their live Lever API response. They cover only their own posted jobs.
  const defaultBoards = [];
  if (["postdoc", "research_job"].includes(input.targetCategory)
    && (!input.countryCode || input.countryCode === "US")) {
    defaultBoards.push({ provider: "lever", boardId: "tri" });
  }
  if (input.targetCategory === "research_job"
    && (!input.countryCode || ["US", "AE", "FR"].includes(input.countryCode))) {
    defaultBoards.push({ provider: "lever", boardId: "ifm-us" });
  }
  const boards = input.publisherBoards?.length ? input.publisherBoards : defaultBoards;
  for (const board of boards) {
    const source = `lever:${board.boardId}`;
    coverage.apiSources.push(source);
    try {
      const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
      const url = `https://api.lever.co/v0/postings/${board.boardId}?mode=json`;
      const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal: requestSignal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("postings response exceeds size limit");
      const postings = JSON.parse(body);
      for (const item of postings) {
        const country = item?.country;
        if (typeof country === "string" && /^[A-Z]{2}$/.test(country) && !coverage.countriesChecked.includes(country)) {
          coverage.countriesChecked.push(country);
        }
      }
      candidates.push(...parseLever(postings, board.boardId, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const currentCandidates = candidates.filter((candidate) => {
    const deadline = knownDeadlineDay(candidate.deadlineText ?? "");
    if (deadline && deadline <= today) {
      coverage.expiredKnownCount++;
      return false;
    }
    return true;
  });
  const seen = new Set();
  const ordered = currentCandidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).sort((a, b) => Number(b.discoveryMatch === "title") - Number(a.discoveryMatch === "title")
    || a.url.localeCompare(b.url));
  coverage.matchedCount = ordered.length;
  coverage.truncated = ordered.length > limit;
  candidates.splice(0, candidates.length, ...ordered.slice(0, limit));
  coverage.candidateCount = candidates.length;
  return {
    schemaVersion: "1.0.0", status: coverage.failures.length ? "partial" : candidates.length ? "candidates_found" : "no_candidates",
    searchedAt: new Date().toISOString(), scope, coverage, candidates,
    note: "These are discovery leads only. Verify the exact current call, application status, funding and conditions on the official publisher page; continue bounded web search for gaps."
  };
}
