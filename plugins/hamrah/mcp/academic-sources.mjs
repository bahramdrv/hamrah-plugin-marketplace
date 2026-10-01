import { canonicalAcademicUrl, safeAcademicText, readBounded, safeSourceFailure, withinAcademicBudget } from "./academic-source-contract.mjs";
import { discoverAcademicCallCandidates } from "./academic-call-discovery.mjs";
import { discoverAcademicSupervisorCandidates } from "./supervisor-discovery.mjs";
import { withPublicAcademicCache } from "./academic-public-store.mjs";

export async function collectAcademicSources(scope, fetchImpl, signal, options) {
  const env = options.env ?? process.env;
  const sources = [], candidates = [], failures = [], countriesChecked = [], queryPlan = [], researchContext = [];
  let truncated = false;
  if (env.HAMRAH_ACADEMIC_DISCOVERY_ENABLED !== "true") return { sources, candidates, countriesChecked, failures: [{ source: "academic_discovery", reason: "source_not_configured" }], queryPlan, researchContext, truncated };
  const query = [scope.field, scope.researchFocus].filter(Boolean).join(" ");
  const enabledSource = (source, flag) => {
    if (env[flag] !== "false") return true;
    sources.push({ source, status: "unavailable" }); failures.push({ source, reason: "source_disabled" }); return false;
  };
  const jobs = [];
  const run = (source, term, work) => {
    queryPlan.push({ source, query: term });
    const sourceBudget = options.sourceTimeoutMs ?? (source === "official_and_job_apis" ? 18000 : 8000);
    jobs.push(withinAcademicBudget((s) => withPublicAcademicCache(source, scope, () => work(s), options), signal, sourceBudget).then(({ result, cache, observedAt }) => {
      sources.push({ source, status: result.sourceStatus ?? "ok", fetchedAt: options.checkedAt, observedAt: observedAt ?? options.checkedAt, cache,
        ...(result.providers ? { providers: result.providers } : {}) });
      candidates.push(...(result.candidates ?? []));
      researchContext.push(...(result.researchContext ?? []));
      countriesChecked.push(...(result.countriesChecked ?? []));
      failures.push(...(result.failures ?? [])); truncated ||= Boolean(result.truncated);
    }, (error) => { const reason = safeSourceFailure(error); sources.push({ source, status: "failed" }); failures.push({ source, reason }); }));
  };
  const json = async (url, s, init = {}) => JSON.parse(await readBounded(await fetchImpl(url, { method: "GET", redirect: "error", headers: { Accept: "application/json" }, ...init, signal: s })));
  if (env.HAMRAH_TAVILY_ENABLED === "true" && env.TAVILY_API_KEY && env.HAMRAH_TAVILY_FREE_PLAN_CONFIRMED === "true") {
    const region = scope.countryCode ? new Intl.DisplayNames(["en"], { type: "region" }).of(scope.countryCode) : "";
    const intent = { funding: "scholarship stipend application deadline", program: "degree programme admission requirements", supervisor: "professor faculty research group", university: "university research", grant: "research grant award", masters: "master admission", phd: "PhD doctoral position", postdoc: "postdoctoral vacancy", research_job: "research job vacancy" }[scope.type];
    const webQuery = [scope.institution, query, intent, region, "official university"].filter(Boolean).join(" ");
    run("tavily", webQuery, async (s) => {
      const body = await json("https://api.tavily.com/search", s, { method: "POST", headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: webQuery, search_depth: "basic", topic: "general", max_results: 10,
          auto_parameters: false, include_answer: false, include_raw_content: false, include_images: false, include_usage: true }) });
      if (!Array.isArray(body.results)) throw new Error("source_schema_error");
      return { candidates: body.results.slice(0, 10).flatMap((r) => {
        const title = safeAcademicText(r.title), url = canonicalAcademicUrl(r.url);
        return title && url && !`${title}${url}`.includes(env.TAVILY_API_KEY) ? [{ title, url, kind: scope.type, institution: null,
          countryCode: null, discoverySource: "tavily", sourceId: url, verificationStatus: "unverified" }] : [];
      }), truncated: body.results.length >= 10 };
    });
  } else failures.push({ source: "tavily", reason: "source_not_configured" });
  if (["university", "program", "supervisor", "grant"].includes(scope.type) && enabledSource("ror", "HAMRAH_ROR_ENABLED")) {
    const term = scope.institution ?? scope.field;
    const url = new URL("https://api.ror.org/v2/organizations"); url.searchParams.set("query", term);
    if (scope.countryCode) url.searchParams.set("filter", `locations.geonames_details.country_code:${scope.countryCode}`);
    run("ror", term, async (s) => {
      const data = await json(url.href, s);
      if (!Array.isArray(data.items)) throw new Error("source_schema_error");
      const organizations = data.items.slice(0, 10).flatMap((r) => {
        const name = safeAcademicText(r.names?.find((n) => n.types?.includes("ror_display"))?.value);
        const homepage = canonicalAcademicUrl(r.links?.find((l) => l.type === "website")?.value);
        const country = r.locations?.[0]?.geonames_details?.country_code;
        return name && homepage && /^https:\/\/ror.org\/[a-z0-9]{9}$/.test(r.id) && r.types?.includes("education")
          && r.status === "active" && (!scope.countryCode || country === scope.countryCode) ? [{ title: name, url: homepage, officialHomepage: homepage,
          rorId: r.id, institution: name, kind: "university", countryCode: country ?? null,
          discoverySource: "ror", sourceId: r.id, verificationStatus: "unverified" }] : [];
      });
      return { candidates: scope.type === "university" ? organizations : [], researchContext: organizations,
        countriesChecked: [...new Set(organizations.map((r) => r.countryCode).filter(Boolean))], truncated: (data.number_of_results ?? 0) > 10 };
    });
  }
  if (scope.type === "supervisor" && enabledSource("openalex", "HAMRAH_OPENALEX_ENABLED")) {
    const countries = scope.countryCode ? [scope.countryCode] : ["DE", "GB", "US"];
    for (const country of countries) run(`openalex:${country}`, query, async (s) => {
      const result = await discoverAcademicSupervisorCandidates({ countryCode: country, field: scope.field, researchFocus: scope.researchFocus ?? scope.field }, fetchImpl, s, null);
      return { candidates: (result.candidates ?? []).map((r) => ({ title: r.name, institution: r.institution, url: r.openAlexId,
        rorId: r.rorId, sourceId: r.openAlexId, countryCode: r.countryCode, kind: "supervisor", discoverySource: "openalex", verificationStatus: "unverified" })),
        countriesChecked: result.coverage?.apiStatus === "searched" ? [country] : [], failures: (result.coverage?.failures ?? []).map(() => ({ source: `openalex:${country}`, reason: "source_failed" })) };
    });
  }
  if (["supervisor", "grant"].includes(scope.type) && enabledSource("crossref", "HAMRAH_CROSSREF_ENABLED")) run("crossref", query, async (s) => {
    const url = new URL("https://api.crossref.org/works"); url.searchParams.set("query", query); url.searchParams.set("rows", "3"); url.searchParams.set("select", "DOI,title,published");
    const data = await json(url.href, s);
    if (!Array.isArray(data.message?.items)) throw new Error("source_schema_error");
    return { researchContext: data.message.items.flatMap((r) => {
      const title = safeAcademicText(r.title?.[0]), doi = typeof r.DOI === "string" && /^10\.\d{4,9}\/[^\s<>]{1,200}$/.test(r.DOI) ? r.DOI : null;
      return title && doi ? [{ kind: "publication", title, doi, url: `https://doi.org/${doi}`, discoverySource: "crossref", verificationStatus: "metadata_only" }] : [];
    }) };
  });
  if (scope.type === "grant" && enabledSource("openalex:awards", "HAMRAH_OPENALEX_ENABLED")) run("openalex:awards", query, async (s) => {
    const url = new URL("https://api.openalex.org/awards"); url.searchParams.set("search", query); url.searchParams.set("per_page", "10");
    const data = await json(url.href, s, env.OPENALEX_API_KEY ? { headers: { Authorization: `Bearer ${env.OPENALEX_API_KEY}`, Accept: "application/json" } } : {});
    if (!Array.isArray(data.results)) throw new Error("source_schema_error");
    return { candidates: data.results.flatMap((r) => {
      const title = safeAcademicText(r.display_name ?? r.title), link = canonicalAcademicUrl(r.id);
      return title && link ? [{ title, url: link, kind: "grant", institution: null, countryCode: null, sourceId: r.id,
        discoverySource: "openalex:awards", verificationStatus: "unverified" }] : [];
    }), truncated: (data.meta?.count ?? 0) > 10 };
  });
  if (["masters", "phd", "postdoc", "research_job"].includes(scope.type) && enabledSource("official_and_job_apis", "HAMRAH_ACADEMIC_JOB_APIS_ENABLED")) run("official_and_job_apis", query, async (s) => {
    const result = await discoverAcademicCallCandidates({ field: scope.field, targetCategory: scope.type, ...(scope.countryCode ? { countryCode: scope.countryCode } : {}), limit: 20 }, fetchImpl, s, { env });
    const apiSources = result.coverage?.apiSources ?? [], sourceFailures = result.coverage?.failures ?? [];
    const providers = apiSources.map((source) => ({ source, status: sourceFailures.some((f) => f.source === source) ? "failed" : "ok" }));
    return { candidates: (result.candidates ?? []).map((r) => ({ title: r.title, url: r.url, kind: scope.type, institution: r.institution ?? null,
      countryCode: r.countryCode ?? null, sourceId: r.sourceId, discoverySource: r.discoverySource, verificationStatus: "unverified" })),
      sourceStatus: !providers.length ? "unavailable" : providers.every((p) => p.status === "failed") ? "failed" : "ok", providers,
      countriesChecked: result.coverage?.countriesChecked ?? [], failures: [
        ...(!providers.length ? [{ source: "official_and_job_apis", reason: "no_configured_source_for_scope" }] : []),
        ...sourceFailures.map((r) => ({ source: r.source, reason: /^jsearch_(?:source_timeout|invalid_json|source_failed|search_budget_exhausted|free_configuration_missing)$/.test(r.reason)
          ? r.reason : safeSourceFailure(new Error(r.reason)) }))], truncated: result.coverage?.truncated };
  });
  await Promise.all(jobs);
  const order = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en");
  return { sources: sources.sort(order), candidates, countriesChecked: [...new Set(countriesChecked)].sort(),
    failures: failures.sort(order), queryPlan: queryPlan.sort(order), researchContext: researchContext.sort(order), truncated };
}
