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
    return new Response(JSON.stringify([
      { id: "p1", text: "Postdoctoral Researcher in Quantum Physics", country: "US",
        descriptionPlain: "Quantum physics research", hostedUrl: "https://jobs.lever.co/research-institute/p1" },
      { id: "a1", text: "Executive Assistant", country: "US",
        descriptionPlain: "Support a quantum physics group", hostedUrl: "https://jobs.lever.co/research-institute/a1" }
    ]), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(requestUrls, ["https://api.lever.co/v0/postings/research-institute?mode=json"]);
  assert.equal(result.structuredContent.candidates.length, 1);
  assert.equal(result.structuredContent.candidates[0].countryCode, "US");
  assert.equal(result.structuredContent.candidates[0].verificationStatus, "unverified");
  assert.deepEqual(result.structuredContent.coverage.countriesChecked, ["US"]);
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
    return new Response(JSON.stringify([{ id: "r1", text: "Postdoctoral Researcher in Robotics",
      country: "US", descriptionPlain: "Robotics research", hostedUrl: "https://jobs.lever.co/tri/r1" }]), { status: 200 });
  });
  assert.equal(result.isError, false, JSON.stringify(result.structuredContent));
  assert.deepEqual(urls, ["https://api.lever.co/v0/postings/tri?mode=json"]);
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
