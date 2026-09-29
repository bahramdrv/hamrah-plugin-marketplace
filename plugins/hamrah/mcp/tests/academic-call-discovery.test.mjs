import assert from "node:assert/strict";
import test from "node:test";

import { executeTool, TOOLS } from "../server.mjs";

const FEED = `<?xml version="1.0"?><rss><channel><title>PhDGermany</title>
<item><guid>101</guid><title><![CDATA[Doctoral researcher in quantum physics]]></title>
<description><![CDATA[<p>Physics research at Example University.</p>]]></description>
<link>https://www.daad.de/en/studying-in-germany/phd-studies-research/phd-germany/detail/101/</link>
<pubDate>28. Sep 2026</pubDate><applicationDeadline>15. Oct 2026</applicationDeadline></item>
<item><guid>102</guid><title><![CDATA[Doctoral researcher in plant biology]]></title>
<description><![CDATA[<p>Biology research at Another University.</p>]]></description>
<link>https://www.daad.de/en/studying-in-germany/phd-studies-research/phd-germany/detail/102/</link>
<pubDate>28. Sep 2026</pubDate><applicationDeadline>20. Oct 2026</applicationDeadline></item>
</channel></rss>`;

test("an explicit PhD search returns DAAD API/feed leads with honest unverified status", async () => {
  const requests = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", countryCode: "DE", limit: 5
  }, async (url) => {
    requests.push(url);
    return new Response(FEED, { status: 200, headers: { "content-type": "application/rss+xml" } });
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(requests, ["https://api.daad.de/api/feeds/rss/en/phd.xml"]);
  assert.equal(result.structuredContent.status, "candidates_found");
  assert.equal(result.structuredContent.candidates.length, 1);
  assert.equal(result.structuredContent.candidates[0].title, "Doctoral researcher in quantum physics");
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.equal(result.structuredContent.candidates[0].discoverySource, "daad_phdgermany");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["DE"]);
  assert.equal(result.structuredContent.coverage.candidateCount, 1);
  assert.equal(TOOLS.find((tool) => tool.name === "discoverAcademicCallCandidates")?.annotations?.readOnlyHint, true);
});

test("a public research board API adds scoped postdoctoral leads without calling them verified", async () => {
  const requestUrls = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "quantum physics", targetCategory: "postdoc", countryCode: "US",
    publisherBoards: [{ provider: "lever", boardId: "research-institute" }]
  }, async (url) => {
    requestUrls.push(url);
    if (url.includes("/tri?")) return new Response("[]", { status: 200 });
    if (url.includes("boards-api.greenhouse.io")) return new Response('{"jobs":[]}', { status: 200 });
    return new Response(JSON.stringify([
      { id: "p1", text: "Postdoctoral Researcher in Quantum Physics", country: "US",
        descriptionPlain: "Quantum physics research", hostedUrl: "https://jobs.lever.co/research-institute/p1" },
      { id: "a1", text: "Executive Assistant", country: "US",
        descriptionPlain: "Support a quantum physics group", hostedUrl: "https://jobs.lever.co/research-institute/a1" }
    ]), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(requestUrls, [
    "https://api.lever.co/v0/postings/tri?mode=json",
    "https://api.lever.co/v0/postings/research-institute?mode=json",
    "https://boards-api.greenhouse.io/v1/boards/thealleninstitute/jobs?content=true"
  ]);
  assert.equal(result.structuredContent.candidates.length, 1);
  assert.equal(result.structuredContent.candidates[0].countryCode, "US");
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["US"]);
});

test("supplying a known default board does not fetch it twice", async () => {
  const urls = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "postdoc", countryCode: "US",
    publisherBoards: [{ provider: "lever", boardId: "tri" }]
  }, async (url) => {
    urls.push(url);
    return new Response(url.includes("boards-api.greenhouse.io") ? '{"jobs":[]}' : "[]", { status: 200 });
  });
  assert.equal(result.isError, false);
  assert.deepEqual(urls, ["https://api.lever.co/v0/postings/tri?mode=json",
    "https://boards-api.greenhouse.io/v1/boards/thealleninstitute/jobs?content=true"]);
  assert.deepEqual(result.structuredContent.coverage.apiSources, ["lever:tri", "greenhouse:thealleninstitute"]);
});

test("candidate discovery rejects applicant facts before making an external request", async () => {
  let calls = 0;
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", profile: { nationality: "Iran" }
  }, async () => { calls++; throw new Error("should not fetch"); });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error, "invalid_academic_call_input");
  assert.equal(calls, 0);
});

test("global postdoc discovery checks the validated research-institute board without a caller token", async () => {
  const urls = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "postdoc"
  }, async (url) => {
    urls.push(url);
    if (url.includes("boards-api.greenhouse.io")) return new Response('{"jobs":[]}', { status: 200 });
    return new Response(JSON.stringify([{ id: "r1", text: "Postdoctoral Researcher in Robotics",
      country: "US", descriptionPlain: "Robotics research", hostedUrl: "https://jobs.lever.co/tri/r1" }]), { status: 200 });
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(urls, ["https://api.lever.co/v0/postings/tri?mode=json",
    "https://boards-api.greenhouse.io/v1/boards/thealleninstitute/jobs?content=true"]);
  assert.equal(result.structuredContent.candidates.length, 1);
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["US"]);
});

test("an unavailable free feed yields explicit partial coverage instead of an empty complete search", async () => {
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", countryCode: "DE"
  }, async () => { throw new Error("feed unavailable"); });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "partial");
  assert.equal(result.structuredContent.coverage.failures[0].source, "daad_phdgermany");
  assert.deepEqual(result.structuredContent.candidates, []);
});

test("a field named in the posting title outranks incidental description mentions", async () => {
  const feed = `<?xml version="1.0"?><rss><channel><item><guid>1</guid>
    <title>Doctoral researcher in biology</title><description>Our university also has a physics department.</description>
    <link>https://www.daad.de/detail/1</link></item><item><guid>2</guid>
    <title>Doctoral researcher in physics</title><description>Study quantum matter.</description>
    <link>https://www.daad.de/detail/2</link></item></channel></rss>`;
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", limit: 1
  }, async () => new Response(feed, { status: 200 }));
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.candidates[0].title, "Doctoral researcher in physics");
});

test("a bounded result reports how many matching leads were omitted", async () => {
  const feed = `<?xml version="1.0"?><rss><channel>${[1, 2, 3].map((id) =>
    `<item><guid>${id}</guid><title>Physics PhD ${id}</title><description>Physics</description><link>https://www.daad.de/detail/${id}</link></item>`
  ).join("")}</channel></rss>`;
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", limit: 1
  }, async () => new Response(feed, { status: 200 }));
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.coverage.candidateCount, 1);
  assert.equal(result.structuredContent.coverage.matchedCount, 3);
  assert.equal(result.structuredContent.coverage.truncated, true);
});

test("a known expired DAAD deadline does not consume the bounded shortlist", async () => {
  const today = new Date();
  const past = new Date(today.getTime() - 14 * 86400_000);
  const future = new Date(today.getTime() + 30 * 86400_000);
  const dateText = (date) => `${date.getUTCDate()}. ${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${date.getUTCFullYear()}`;
  const feed = `<?xml version="1.0"?><rss><channel>
    <item><guid>old</guid><title>Physics PhD old</title><description>Physics</description>
    <link>https://www.daad.de/detail/old</link><applicationDeadline>${dateText(past)}</applicationDeadline></item>
    <item><guid>new</guid><title>Physics PhD new</title><description>Physics</description>
    <link>https://www.daad.de/detail/new</link><applicationDeadline>${dateText(future)}</applicationDeadline></item>
  </channel></rss>`;
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "physics", targetCategory: "phd", limit: 1
  }, async () => new Response(feed, { status: 200 }));
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.candidates[0].sourceId, "new");
  assert.equal(result.structuredContent.coverage.expiredKnownCount, 1);
  assert.equal(result.structuredContent.coverage.matchedCount, 1);
});

test("global research jobs check both validated boards and exclude research internships", async () => {
  const urls = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "machine learning", targetCategory: "research_job"
  }, async (url) => {
    urls.push(url);
    if (url.includes("/tri?")) return new Response(JSON.stringify([]), { status: 200 });
    if (url.includes("/waabi?")) return new Response(JSON.stringify([]), { status: 200 });
    if (url.includes("boards-api.greenhouse.io")) return new Response('{"jobs":[]}', { status: 200 });
    if (url.includes("api.ashbyhq.com")) return new Response('{"jobs":[]}', { status: 200 });
    return new Response(JSON.stringify([
      { id: "ae1", text: "Research Scientist - Machine Learning", country: "AE",
        descriptionPlain: "Machine learning", hostedUrl: "https://jobs.lever.co/ifm-us/ae1" },
      { id: "us1", text: "AI Research Internship - Machine Learning", country: "US",
        descriptionPlain: "Machine learning", hostedUrl: "https://jobs.lever.co/ifm-us/us1" }
    ]), { status: 200 });
  });
  assert.equal(result.isError, false);
  assert.deepEqual(urls, [
    "https://api.lever.co/v0/postings/tri?mode=json",
    "https://api.lever.co/v0/postings/ifm-us?mode=json",
    "https://api.lever.co/v0/postings/waabi?mode=json",
    "https://boards-api.greenhouse.io/v1/boards/thealleninstitute/jobs?content=true",
    "https://api.ashbyhq.com/posting-api/job-board/faculty"
  ]);
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["ae1"]);
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["AE", "US"]);
});

test("global source requests start together so one slow provider does not delay the others", async () => {
  const started = [];
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const operation = executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "research_job"
  }, async (url) => {
    started.push(url);
    await hold;
    return new Response(url.includes("api.ashbyhq.com") || url.includes("boards-api.greenhouse.io")
      ? '{"jobs":[]}' : "[]", { status: 200 });
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(started.length, 5);
  } finally {
    release();
    await operation;
  }
});

test("an Emirati research job request checks the regional IFM board", async () => {
  const urls = [];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "machine learning", targetCategory: "research_job", countryCode: "AE"
  }, async (url) => {
    urls.push(url);
    return new Response(JSON.stringify([{ id: "a1", text: "Research Scientist - Machine Learning",
      country: "AE", descriptionPlain: "Machine learning", hostedUrl: "https://jobs.lever.co/ifm-us/a1" }]), { status: 200 });
  });
  assert.equal(result.isError, false);
  assert.deepEqual(urls, ["https://api.lever.co/v0/postings/ifm-us?mode=json"]);
  assert.equal(result.structuredContent.candidates[0].countryCode, "AE");
});

test("one failed research board preserves leads from the other and reports partial coverage", async () => {
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "research_job", countryCode: "US"
  }, async (url) => {
    if (url.includes("/ifm-us?")) throw new Error("board unavailable");
    if (url.includes("/waabi?")) return new Response("[]", { status: 200 });
    if (url.includes("boards-api.greenhouse.io")) return new Response('{"jobs":[]}', { status: 200 });
    if (url.includes("api.ashbyhq.com")) return new Response('{"jobs":[]}', { status: 200 });
    return new Response(JSON.stringify([{ id: "tri1", text: "Robotics Research Scientist",
      country: "US", descriptionPlain: "Robotics research", hostedUrl: "https://jobs.lever.co/tri/tri1" }]), { status: 200 });
  });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.status, "partial");
  assert.equal(result.structuredContent.candidates.length, 1);
  assert.deepEqual(result.structuredContent.coverage.failures.map((item) => item.source), ["lever:ifm-us"]);
});

test("UK research-job discovery accepts only listed title-matched Faculty postings with a UK primary address", async () => {
  const urls = [];
  const board = { jobs: [
    { id: "gb1", title: "Research Scientist - AI Safety", isListed: true,
      address: { postalAddress: { addressCountry: "United Kingdom" } },
      descriptionPlain: "AI safety research", jobUrl: "https://jobs.ashbyhq.com/faculty/gb1" },
    { id: "gb2", title: "Data Scientist", isListed: true,
      address: { postalAddress: { addressCountry: "United Kingdom" } },
      descriptionPlain: "Works with the AI safety research team", jobUrl: "https://jobs.ashbyhq.com/faculty/gb2" },
    { id: "gb3", title: "Research Scientist - AI Safety", isListed: false,
      address: { postalAddress: { addressCountry: "United Kingdom" } },
      descriptionPlain: "AI safety research", jobUrl: "https://jobs.ashbyhq.com/faculty/gb3" },
    { id: "fr1", title: "Research Scientist - AI Safety", isListed: true,
      address: { postalAddress: { addressCountry: "France" } },
      descriptionPlain: "AI safety research", jobUrl: "https://jobs.ashbyhq.com/faculty/fr1" }
  ] };
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "AI Safety", targetCategory: "research_job", countryCode: "GB"
  }, async (url) => { urls.push(url); return new Response(JSON.stringify(board), { status: 200 }); });
  assert.equal(result.isError, false);
  assert.deepEqual(urls, ["https://api.ashbyhq.com/posting-api/job-board/faculty"]);
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["gb1"]);
  assert.equal(result.structuredContent.candidates[0].countryCode, "GB");
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["GB"]);
});

test("Canadian research-job discovery uses Waabi's public board and requires title and primary country match", async () => {
  const urls = [];
  const postings = [
    { id: "ca1", text: "Research Scientist, Robotics", country: "CA", descriptionPlain: `Robotics ${"x".repeat(1_100_000)}`,
      hostedUrl: "https://jobs.lever.co/waabi/ca1" },
    { id: "ca2", text: "Research Scientist, Climate", country: "CA", descriptionPlain: "Works with a robotics team",
      hostedUrl: "https://jobs.lever.co/waabi/ca2" },
    { id: "us1", text: "Research Scientist, Robotics", country: "US", descriptionPlain: "Robotics",
      hostedUrl: "https://jobs.lever.co/waabi/us1" },
    { id: "ca3", text: "2026 Intern, PhD Research Scientist, Robotics", country: "CA", descriptionPlain: "Robotics",
      hostedUrl: "https://jobs.lever.co/waabi/ca3" }
  ];
  const result = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "research_job", countryCode: "CA"
  }, async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(postings), { status: 200 });
  });
  assert.equal(result.isError, false);
  assert.deepEqual(urls, ["https://api.lever.co/v0/postings/waabi?mode=json"]);
  assert.deepEqual(result.structuredContent.candidates.map((item) => item.sourceId), ["ca1"]);
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["CA"]);
});

test("Ai2 Greenhouse public API adds only scoped research jobs and postdoctoral program leads", async () => {
  const jobs = { jobs: [
    { id: 11, title: "Research Scientist, Robotics", absolute_url: "https://job-boards.greenhouse.io/thealleninstitute/jobs/11",
      offices: [{ location: "Seattle, WA, United States" }], content: "Robotics research", updated_at: "2026-09-28T12:00:00Z" },
    { id: 12, title: "Young Investigator, Robotics", absolute_url: "https://job-boards.greenhouse.io/thealleninstitute/jobs/12",
      offices: [{ location: "Seattle, WA, United States" }], content: "Postdoctoral robotics program" },
    { id: 13, title: "Predoctoral Young Investigator, Robotics", absolute_url: "https://job-boards.greenhouse.io/thealleninstitute/jobs/13",
      offices: [{ location: "Seattle, WA, United States" }], content: "Predoctoral robotics program" },
    { id: 14, title: "Research Intern, Robotics", absolute_url: "https://job-boards.greenhouse.io/thealleninstitute/jobs/14",
      offices: [{ location: "Seattle, WA, United States" }], content: "Robotics internship" },
    { id: 15, title: "Young Investigator, Climate Modeling", absolute_url: "https://job-boards.greenhouse.io/thealleninstitute/jobs/15",
      offices: [{ location: "Seattle, WA, United States" }], content: "Our institute also has a robotics team." }
  ] };
  const fetchBoard = async (url) => new Response(url.includes("boards-api.greenhouse.io")
    ? JSON.stringify(jobs) : "[]", { status: 200 });
  const research = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "research_job", countryCode: "US"
  }, fetchBoard);
  assert.equal(research.isError, false);
  assert.deepEqual(research.structuredContent.candidates.map((item) => item.sourceId), ["11"]);
  assert.equal(research.structuredContent.candidates[0].discoverySource, "greenhouse:thealleninstitute");
  const postdoc = await executeTool("discoverAcademicCallCandidates", {
    field: "robotics", targetCategory: "postdoc", countryCode: "US"
  }, fetchBoard);
  assert.equal(postdoc.isError, false);
  assert.deepEqual(postdoc.structuredContent.candidates.map((item) => item.sourceId), ["12"]);
  assert.equal(postdoc.structuredContent.candidates[0].verificationStatus, "unverified");
});
