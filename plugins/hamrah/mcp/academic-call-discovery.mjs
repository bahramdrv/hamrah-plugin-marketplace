import Ajv from "ajv";

const DAAD_FEED = "https://api.daad.de/api/feeds/rss/en/phd.xml";
const STUDYINFO_SOURCE = "studyinfo:fi";
const STUDYINFO_SEARCH = "https://opintopolku.fi/konfo-backend/external/search/toteutukset-koulutuksittain";
const STUDYINFO_HEADERS = { Accept: "application/json", "Caller-Id": "hamrah-plugin-marketplace" };
const STUDYINFO_DETAIL_LIMIT = 12;
const ARC_SOURCE = "greenhouse:arcinstitute";
const SMARTRECRUITERS_DETAIL_LIMIT = 12;
const SMARTRECRUITERS_POSTDOC_SOURCES = [
  { id: "smartrecruiters:theuniversityofauckland", company: "TheUniversityOfAuckland", country: "NZ", apiCountry: "nz" },
  { id: "smartrecruiters:universityhealthnetwork", company: "UniversityHealthNetwork", country: "CA", apiCountry: "ca", query: "postdoctoral" },
  { id: "smartrecruiters:westernsydneyuniversity", company: "WesternSydneyUniversity", country: "AU", apiCountry: "au" }
];
const IONQ_SOURCE = "greenhouse:ionq";
const IONQ_COUNTRIES = { "United States": "US", "United Kingdom": "GB", Sweden: "SE",
  Switzerland: "CH", Canada: "CA", "South Korea": "KR" };
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
const monthNamePattern = "January|February|March|April|May|June|July|August|September|October|November|December";

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
  if (category === "research_job") return !/\b(?:intern(?:ship)?|predoctoral|postdoc(?:toral)?|young investigator)\b/i.test(title)
    && /\bresearch(?:er)?\b|\bscientist\b|\bfellow\b/i.test(title);
  return false;
}

function parseLever(body, boardId, input) {
  if (!Array.isArray(body)) throw new Error("Lever returned an unexpected postings format.");
  return body.filter((item) => {
    const title = String(item?.text ?? "");
    const description = String(item?.descriptionPlain ?? "");
    return leverTitleMatches(title, input.targetCategory)
      && (boardId === "waabi" ? relevant(title, input.field) && item.country === "CA"
        : relevant(`${title} ${description}`, input.field))
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

function ai2PrimaryIsUs(item) {
  const primary = String(item?.location?.name ?? "").trim();
  return Boolean(primary) && (item?.offices ?? []).some((office) =>
    office?.location === `${primary}, United States`);
}

function parseAi2Greenhouse(body, input) {
  if (!body || !Array.isArray(body.jobs)) throw new Error("Greenhouse returned an unexpected jobs format.");
  return body.jobs.filter((item) => {
    const title = String(item?.title ?? "");
    const postdoc = !/\bpredoctoral\b/i.test(title) && /\bpostdoc(?:toral)?\b|\byoung investigator\b/i.test(title);
    const researchJob = !/\b(?:intern(?:ship)?|predoctoral|postdoc(?:toral)?|young investigator)\b/i.test(title)
      && /\bresearch(?:er)?\b|\bscientist\b/i.test(title);
    const countryCode = ai2PrimaryIsUs(item) ? "US" : null;
    return (input.targetCategory === "postdoc" ? postdoc : researchJob)
      && relevant(title, input.field)
      && countryCode === "US"
      && (!input.countryCode || countryCode === input.countryCode)
      && typeof item?.absolute_url === "string"
      && /^https:\/\/job-boards\.greenhouse\.io\/thealleninstitute\/jobs\/\d+$/.test(item.absolute_url);
  }).map((item) => ({
    sourceId: String(item.id ?? item.absolute_url), discoverySource: "greenhouse:thealleninstitute",
    title: plain(item.title), url: item.absolute_url, countryCode: "US", targetCategory: input.targetCategory,
    discoveryMatch: "title",
    summary: plain(String(item.content ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).slice(0, 1000),
    publishedText: item.first_published ?? item.updated_at ?? null,
    deadlineText: item.application_deadline ?? null, verificationStatus: "unverified"
  }));
}

function arcUsPrimary(item) {
  return item?.location?.name === "Palo Alto, CA"
    && (item?.offices ?? []).some((office) => office?.location === "Palo Alto, California, United States");
}

function parseArcGreenhouse(body, input) {
  if (!body || !Array.isArray(body.jobs)) throw new Error("Arc Greenhouse returned an unexpected jobs format.");
  return body.jobs.filter((item) => {
    const title = String(item?.title ?? "");
    return /\bpostdoc(?:toral)?\b/i.test(title)
      && relevant(title, input.field)
      && arcUsPrimary(item)
      && typeof item?.absolute_url === "string"
      && /^https:\/\/job-boards\.greenhouse\.io\/arcinstitute\/jobs\/\d+$/.test(item.absolute_url);
  }).map((item) => ({
    sourceId: String(item.id ?? item.absolute_url), discoverySource: ARC_SOURCE,
    title: plain(item.title), url: item.absolute_url, countryCode: "US", targetCategory: "postdoc",
    discoveryMatch: "title",
    summary: plain(String(item.content ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).slice(0, 1000),
    publishedText: item.first_published ?? item.updated_at ?? null,
    deadlineText: item.application_deadline ?? null, verificationStatus: "unverified"
  }));
}

function smartRecruitersPostdocTitle(title) {
  return /\bpost[ -]?doc(?:toral|tural)?\b/i.test(title);
}

function smartRecruitersListUrl(source) {
  const url = new URL(`https://api.smartrecruiters.com/v1/companies/${source.company}/postings`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  url.searchParams.set("destination", "PUBLIC");
  if (source.query) url.searchParams.set("q", source.query);
  return url.href;
}

function smartRecruitersPostingIdentity(item, source) {
  return /^\d+$/.test(String(item?.id ?? ""))
    && item?.company?.identifier === source.company
    && item?.location?.country === source.apiCountry && item?.visibility === "PUBLIC";
}

function smartRecruitersDeadline(item) {
  const sections = item.jobAd?.sections ?? {};
  const text = plain(`${sections.jobDescription?.text ?? ""} ${sections.additionalInformation?.text ?? ""}`
    .replace(/&#(?:x[\da-f]+|\d+);/gi, " "));
  for (const label of text.matchAll(/\b(?:closing date(?: of)?|application deadline|applications close(?: on)?)\s*:?\s*/gi)) {
    const nearby = text.slice(label.index + label[0].length, label.index + label[0].length + 70);
    const dayFirst = nearby.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNamePattern})\\s+(\\d{4})\\b`, "i"));
    const monthFirst = nearby.match(new RegExp(`\\b(${monthNamePattern})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "i"));
    const numeric = nearby.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    const parts = dayFirst ? [Number(dayFirst[3]), monthNumbers[dayFirst[2].slice(0, 3).toLowerCase()], Number(dayFirst[1])]
      : monthFirst ? [Number(monthFirst[3]), monthNumbers[monthFirst[1].slice(0, 3).toLowerCase()], Number(monthFirst[2])]
        : numeric ? [Number(numeric[3]), Number(numeric[2]), Number(numeric[1])] : null;
    if (!parts) continue;
    const iso = `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
    if (knownDeadlineDay(iso)) return iso;
  }
  return null;
}

function parseSmartRecruitersDetail(item, listed, input, source) {
  if (!smartRecruitersPostingIdentity(item, source) || item.active !== true || String(item.id) !== String(listed.id)
    || !smartRecruitersPostdocTitle(String(item.name ?? "")) || !relevant(String(item.name ?? ""), input.field)
    || typeof item.postingUrl !== "string"
    || !new RegExp(`^https://jobs\\.smartrecruiters\\.com/${source.company}/${item.id}(?:-[^/?#]+)?$`).test(item.postingUrl)) return null;
  return {
    sourceId: String(item.id), discoverySource: source.id,
    title: plain(item.name), url: item.postingUrl,
    countryCode: source.country, targetCategory: "postdoc", discoveryMatch: "title",
    summary: plain(item.jobAd?.sections?.jobDescription?.text).slice(0, 1000),
    publishedText: item.releasedDate ?? null, deadlineText: smartRecruitersDeadline(item),
    verificationStatus: "unverified"
  };
}

function parseFacultyAshby(body, input) {
  if (!body || !Array.isArray(body.jobs)) throw new Error("Ashby returned an unexpected jobs format.");
  return body.jobs.filter((item) => {
    const title = String(item?.title ?? "");
    return item?.isListed === true
      && item?.address?.postalAddress?.addressCountry === "United Kingdom"
      && !/\b(?:intern(?:ship)?|predoctoral|postdoc(?:toral)?|young investigator)\b/i.test(title)
      && /\bresearch(?:er)?\b|\bscientist\b/i.test(title)
      && relevant(title, input.field)
      && typeof item?.jobUrl === "string"
      && /^https:\/\/jobs\.ashbyhq\.com\/faculty\/[^/?#]+\/?$/.test(item.jobUrl);
  }).map((item) => ({
    sourceId: String(item.id ?? item.jobUrl), discoverySource: "ashby:faculty",
    title: plain(item.title), url: item.jobUrl, countryCode: "GB", targetCategory: input.targetCategory,
    discoveryMatch: "title", summary: plain(item.descriptionPlain).slice(0, 1000),
    publishedText: item.publishedAt ?? null, deadlineText: null, verificationStatus: "unverified"
  }));
}

function ionqPrimaryCountry(item) {
  const location = String(item?.location?.name ?? "");
  return Object.entries(IONQ_COUNTRIES).find(([name]) => location === name || location.endsWith(`, ${name}`))?.[1] ?? null;
}

function parseIonqGreenhouse(body, input) {
  if (!body || !Array.isArray(body.jobs)) throw new Error("IonQ Greenhouse returned an unexpected jobs format.");
  return body.jobs.filter((item) => {
    const title = String(item?.title ?? "");
    const country = ionqPrimaryCountry(item);
    return !/\b(?:intern(?:ship)?|postdoc(?:toral)?)\b/i.test(title)
      && /\bresearch(?:er)?\b|\bscientist\b|\bfellow\b/i.test(title)
      && relevant(title, input.field)
      && country && (!input.countryCode || country === input.countryCode)
      && typeof item?.absolute_url === "string"
      && /^https:\/\/job-boards\.greenhouse\.io\/ionq\/jobs\/\d+$/.test(item.absolute_url);
  }).map((item) => ({
      sourceId: String(item.id ?? item.absolute_url), discoverySource: IONQ_SOURCE,
      title: plain(item.title), url: item.absolute_url,
      countryCode: ionqPrimaryCountry(item),
      targetCategory: "research_job", discoveryMatch: "title",
      summary: plain(String(item.content ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).slice(0, 1000),
      publishedText: item.first_published ?? item.updated_at ?? null,
      deadlineText: item.application_deadline ?? null, verificationStatus: "unverified"
  }));
}

const translated = (value) => String(value?.en ?? value?.fi ?? value?.sv ?? "").trim();
const studyinfoOid = (value, kind) => typeof value === "string"
  && new RegExp(`^1\\.2\\.246\\.562\\.${kind}\\.[0-9]+$`).test(value);

function helsinkiWallTime() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseStudyinfoDetail(body, field, now) {
  if (!body || !Array.isArray(body.hakukohteet)) throw new Error("Studyinfo returned an unexpected admissions format.");
  if (body.hakuAuki !== true) return [];
  return body.hakukohteet.flatMap((target) => {
    const title = translated(target?.nimi);
    const intake = translated(target?.hakuNimi);
    if (/\binternal transfer\b|\bcomplete your degree\b|\btransfer application\b/i.test(`${title} ${intake}`)) return [];
    if (target?.tila !== "julkaistu" || target?.odwKkTasot?.ylempiKkAste !== true
      || !studyinfoOid(target?.oid, "20") || !relevant(title, field)) return [];
    const currentWindows = (target.hakuajat ?? []).filter((window) =>
      typeof window?.alkaa === "string" && typeof window?.paattyy === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(window.alkaa)
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(window.paattyy)
      && window.alkaa <= now && now < window.paattyy);
    if (!currentWindows.length) return [];
    const end = currentWindows.map((window) => window.paattyy).sort()[0];
    const priorStudyPathway = /\bopen UAS\b|\bon the basis of Finnish higher education studies\b/i.test(`${title} ${intake}`);
    return [{
      sourceId: target.oid, discoverySource: STUDYINFO_SOURCE,
      title: plain(title), url: `https://opintopolku.fi/konfo/en/hakukohde/${target.oid}`,
      countryCode: "FI", targetCategory: "masters", discoveryMatch: "title",
      admissionPathway: priorStudyPathway ? "restricted_prior_studies" : "general_or_unknown",
      summary: plain(`${translated(target.organisaatio?.nimi)}; ${intake}${
        priorStudyPathway
          ? "; restricted prior-study admission pathway: verify prior credits and other eligibility requirements" : ""
      }`).slice(0, 1000),
      publishedText: target.modified ?? null, deadlineText: end.slice(0, 10),
      verificationStatus: "unverified"
    }];
  });
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
  // The fixed public boards are organization-scoped, not a global academic catalog.
  const defaultBoards = [];
  if (["postdoc", "research_job"].includes(input.targetCategory)
    && (!input.countryCode || input.countryCode === "US")) {
    defaultBoards.push({ provider: "lever", boardId: "tri" });
  }
  if (input.targetCategory === "research_job"
    && (!input.countryCode || ["US", "AE", "FR"].includes(input.countryCode))) {
    defaultBoards.push({ provider: "lever", boardId: "ifm-us" });
  }
  if (input.targetCategory === "research_job"
    && (!input.countryCode || input.countryCode === "CA")) {
    defaultBoards.push({ provider: "lever", boardId: "waabi" });
  }
  const boards = [...defaultBoards, ...(input.publisherBoards ?? [])]
    .filter((board, index, all) => all.findIndex((candidate) => candidate.boardId === board.boardId) === index);
  const greenhouseUrl = "https://boards-api.greenhouse.io/v1/boards/thealleninstitute/jobs?content=true";
  const arcUrl = "https://boards-api.greenhouse.io/v1/boards/arcinstitute/jobs?content=true";
  const ashbyUrl = "https://api.ashbyhq.com/posting-api/job-board/faculty";
  const ionqUrl = "https://boards-api.greenhouse.io/v1/boards/ionq/jobs?content=true";
  const useGreenhouse = ["postdoc", "research_job"].includes(input.targetCategory)
    && (!input.countryCode || input.countryCode === "US");
  const useArc = input.targetCategory === "postdoc" && (!input.countryCode || input.countryCode === "US");
  const smartRecruitersSources = input.targetCategory === "postdoc"
    ? SMARTRECRUITERS_POSTDOC_SOURCES.filter((source) => !input.countryCode || input.countryCode === source.country)
    : [];
  const useAshby = input.targetCategory === "research_job" && (!input.countryCode || input.countryCode === "GB");
  const useIonq = input.targetCategory === "research_job"
    && (!input.countryCode || Object.values(IONQ_COUNTRIES).includes(input.countryCode));
  const useStudyinfo = input.targetCategory === "masters" && (!input.countryCode || input.countryCode === "FI");
  const studyinfoUrl = new URL(STUDYINFO_SEARCH);
  studyinfoUrl.searchParams.set("keyword", input.field.trim());
  studyinfoUrl.searchParams.set("hakukaynnissa", "true");
  studyinfoUrl.searchParams.set("lng", "en");
  studyinfoUrl.searchParams.set("size", "50");
  const requests = [
    ...(input.targetCategory === "phd" && (!input.countryCode || input.countryCode === "DE")
      ? [{ url: DAAD_FEED, accept: "application/rss+xml, application/xml" }] : []),
    ...boards.map((board) => ({ url: `https://api.lever.co/v0/postings/${board.boardId}?mode=json`, accept: "application/json" })),
    ...(useGreenhouse ? [{ url: greenhouseUrl, accept: "application/json" }] : []),
    ...(useArc ? [{ url: arcUrl, accept: "application/json" }] : []),
    ...smartRecruitersSources.map((source) => ({ url: smartRecruitersListUrl(source), accept: "application/json" })),
    ...(useAshby ? [{ url: ashbyUrl, accept: "application/json" }] : []),
    ...(useIonq ? [{ url: ionqUrl, accept: "application/json" }] : []),
    ...(useStudyinfo ? [{ url: studyinfoUrl.href, accept: "application/json", headers: STUDYINFO_HEADERS }] : [])
  ];
  const pending = new Map(requests.map(({ url, accept, headers }) => {
    const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
    const promise = Promise.resolve().then(() => fetchImpl(url,
      { method: "GET", headers: headers ?? { Accept: accept }, signal: requestSignal }))
      .then((response) => ({ response }), (error) => ({ error }));
    return [url, promise];
  }));
  const fetchSource = async (url) => {
    const outcome = await pending.get(url);
    if (outcome.error) throw outcome.error;
    return outcome.response;
  };
  if (input.targetCategory === "phd" && (!input.countryCode || input.countryCode === "DE")) {
    coverage.apiSources.push("daad_phdgermany");
    try {
      const response = await fetchSource(DAAD_FEED);
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
  for (const board of boards) {
    const source = `lever:${board.boardId}`;
    coverage.apiSources.push(source);
    try {
      const url = `https://api.lever.co/v0/postings/${board.boardId}?mode=json`;
      const response = await fetchSource(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 3_000_000) throw new Error("postings response exceeds size limit");
      const postings = JSON.parse(body);
      for (const item of postings) {
        const country = item?.country;
        if (typeof country === "string" && /^[A-Z]{2}$/.test(country)
          && (!input.countryCode || country === input.countryCode) && !coverage.countriesChecked.includes(country)) {
          coverage.countriesChecked.push(country);
        }
      }
      candidates.push(...parseLever(postings, board.boardId, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (useGreenhouse) {
    const source = "greenhouse:thealleninstitute";
    coverage.apiSources.push(source);
    try {
      const response = await fetchSource(greenhouseUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("jobs response exceeds size limit");
      const postings = JSON.parse(body);
      if (!postings || !Array.isArray(postings.jobs)) throw new Error("Greenhouse returned an unexpected jobs format.");
      if (postings.jobs.some(ai2PrimaryIsUs)
        && !coverage.countriesChecked.includes("US")) coverage.countriesChecked.push("US");
      candidates.push(...parseAi2Greenhouse(postings, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (useArc) {
    coverage.apiSources.push(ARC_SOURCE);
    try {
      const response = await fetchSource(arcUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 3_000_000) throw new Error("Arc jobs response exceeds size limit");
      const postings = JSON.parse(body);
      if (!postings || !Array.isArray(postings.jobs)) throw new Error("Arc Greenhouse returned an unexpected jobs format.");
      if (postings.jobs.some(arcUsPrimary) && !coverage.countriesChecked.includes("US")) {
        coverage.countriesChecked.push("US");
      }
      candidates.push(...parseArcGreenhouse(postings, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source: ARC_SOURCE, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const source of smartRecruitersSources) {
    coverage.apiSources.push(source.id);
    try {
      const response = await fetchSource(smartRecruitersListUrl(source));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("SmartRecruiters postings response exceeds size limit");
      const postings = JSON.parse(body);
      if (!postings || !Array.isArray(postings.content) || !Number.isInteger(postings.totalFound)
        || postings.totalFound < 0) throw new Error("SmartRecruiters returned an unexpected postings format.");
      coverage.apiCoverage = "partial";
      if (postings.totalFound > postings.content.length) coverage.truncated = true;
      if (postings.content.some((item) => smartRecruitersPostingIdentity(item, source))
        && !coverage.countriesChecked.includes(source.country)) {
        coverage.countriesChecked.push(source.country);
      }
      const matches = postings.content.filter((item) => smartRecruitersPostingIdentity(item, source)
        && smartRecruitersPostdocTitle(String(item.name ?? "")) && relevant(String(item.name ?? ""), input.field));
      if (matches.length > SMARTRECRUITERS_DETAIL_LIMIT) coverage.truncated = true;
      const details = await Promise.all(matches.slice(0, SMARTRECRUITERS_DETAIL_LIMIT).map(async (item) => {
        try {
          const url = `https://api.smartrecruiters.com/v1/companies/${source.company}/postings/${item.id}`;
          const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
          const detailResponse = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, signal: requestSignal });
          if (!detailResponse.ok) throw new Error(`HTTP ${detailResponse.status}`);
          const detailText = await detailResponse.text();
          if (detailText.length > 500_000) throw new Error("SmartRecruiters posting detail exceeds size limit");
          return { candidate: parseSmartRecruitersDetail(JSON.parse(detailText), item, input, source) };
        } catch (error) {
          return { error: `${item.id}: ${error instanceof Error ? error.message : String(error)}` };
        }
      }));
      for (const detail of details) {
        if (detail.error) coverage.failures.push({ source: source.id, reason: detail.error });
        else if (detail.candidate) candidates.push(detail.candidate);
      }
    } catch (error) {
      coverage.failures.push({ source: source.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (useAshby) {
    const source = "ashby:faculty";
    coverage.apiSources.push(source);
    try {
      const response = await fetchSource(ashbyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error("jobs response exceeds size limit");
      const postings = JSON.parse(body);
      if (!postings || !Array.isArray(postings.jobs)) throw new Error("Ashby returned an unexpected jobs format.");
      if (postings.jobs.some((item) => item?.isListed === true
        && item?.address?.postalAddress?.addressCountry === "United Kingdom")) {
        coverage.countriesChecked.push("GB");
      }
      candidates.push(...parseFacultyAshby(postings, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (useIonq) {
    coverage.apiSources.push(IONQ_SOURCE);
    try {
      const response = await fetchSource(ionqUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 3_000_000) throw new Error("IonQ jobs response exceeds size limit");
      const postings = JSON.parse(body);
      if (!postings || !Array.isArray(postings.jobs)) throw new Error("IonQ Greenhouse returned an unexpected jobs format.");
      const countries = [...new Set(postings.jobs.map(ionqPrimaryCountry).filter(Boolean))].sort();
      for (const country of countries) if ((!input.countryCode || country === input.countryCode)
        && !coverage.countriesChecked.includes(country)) coverage.countriesChecked.push(country);
      candidates.push(...parseIonqGreenhouse(postings, input));
      coverage.apiCoverage = "partial";
    } catch (error) {
      coverage.failures.push({ source: IONQ_SOURCE, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (useStudyinfo) {
    coverage.apiSources.push(STUDYINFO_SOURCE);
    try {
      const response = await fetchSource(studyinfoUrl.href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 1_000_000) throw new Error("Studyinfo search exceeds size limit");
      const search = JSON.parse(body);
      if (!search || !Array.isArray(search.hits)) throw new Error("Studyinfo returned an unexpected search format.");
      coverage.countriesChecked.push("FI");
      coverage.apiCoverage = "partial";
      const searchHits = [...search.hits];
      if (search.total > searchHits.length) {
        const pageTwo = new URL(studyinfoUrl);
        pageTwo.searchParams.set("page", "2");
        try {
          const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
          const secondResponse = await fetchImpl(pageTwo.href,
            { method: "GET", headers: STUDYINFO_HEADERS, signal: requestSignal });
          if (!secondResponse.ok) throw new Error(`HTTP ${secondResponse.status}`);
          const secondText = await secondResponse.text();
          if (secondText.length > 1_000_000) throw new Error("Studyinfo search page exceeds size limit");
          const secondPage = JSON.parse(secondText);
          if (!secondPage || !Array.isArray(secondPage.hits)) throw new Error("Studyinfo returned an unexpected search page.");
          searchHits.push(...secondPage.hits);
        } catch (error) {
          coverage.failures.push({ source: STUDYINFO_SOURCE, reason: error instanceof Error ? error.message : String(error) });
        }
      }
      if (search.total > searchHits.length) coverage.truncated = true;
      const details = searchHits.flatMap((hit) => (hit.toteutukset ?? []).filter((item) => {
        const title = translated(item?.toteutusNimi) || translated(hit?.nimi);
        return /^master(?:'s)?\b/i.test(title) && !/\bbachelor\b/i.test(title)
          && relevant(title, input.field) && studyinfoOid(item?.toteutusOid, "17");
      }).map((item) => item.toteutusOid));
      const uniqueDetails = [...new Set(details)];
      if (uniqueDetails.length > STUDYINFO_DETAIL_LIMIT) coverage.truncated = true;
      const results = await Promise.all(uniqueDetails.slice(0, STUDYINFO_DETAIL_LIMIT).map(async (oid) => {
        try {
          const url = `https://opintopolku.fi/konfo-backend/external/toteutus/${oid}?hakukohteet=true&haut=true&koulutus=true`;
          const requestSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]);
          const detailResponse = await fetchImpl(url, { method: "GET", headers: STUDYINFO_HEADERS, signal: requestSignal });
          if (!detailResponse.ok) throw new Error(`HTTP ${detailResponse.status}`);
          const detailText = await detailResponse.text();
          if (detailText.length > 400_000) throw new Error("Studyinfo detail exceeds size limit");
          const detail = JSON.parse(detailText);
          if (detail.oid !== undefined && detail.oid !== oid) throw new Error("Studyinfo detail identity mismatch");
          return { candidates: parseStudyinfoDetail(detail, input.field.trim(), helsinkiWallTime()) };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }));
      for (const result of results) {
        if (result.error) coverage.failures.push({ source: STUDYINFO_SOURCE, reason: result.error });
        else candidates.push(...result.candidates);
      }
    } catch (error) {
      coverage.failures.push({ source: STUDYINFO_SOURCE, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  const currentCandidates = candidates.filter((candidate) => {
    // Studyinfo windows were already checked to the minute in Finland's local time.
    if (candidate.discoverySource === STUDYINFO_SOURCE) return true;
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
    || Number(a.admissionPathway === "restricted_prior_studies") - Number(b.admissionPathway === "restricted_prior_studies")
    || a.url.localeCompare(b.url));
  coverage.matchedCount = ordered.length;
  coverage.truncated ||= ordered.length > limit;
  candidates.splice(0, candidates.length, ...ordered.slice(0, limit));
  coverage.candidateCount = candidates.length;
  return {
    schemaVersion: "1.0.0", status: coverage.failures.length ? "partial" : candidates.length ? "candidates_found" : "no_candidates",
    searchedAt: new Date().toISOString(), scope, coverage, candidates,
    note: "These are discovery leads only. Verify the exact current call, application status, funding and conditions on the official publisher page; continue bounded web search for gaps."
  };
}
