import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { canonicalAcademicUrl } from "./academic-source-contract.mjs";

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a > 0 && a < 224 && a !== 10 && a !== 127
      && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99)))
      && !(a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) && !(a === 203 && b === 0 && c === 113);
  }
  // Only native global-unicast IPv6; exclude transition and documentation ranges.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address)
    && !/^2001:(?:0:|db8:)|^2002:/i.test(address);
}
async function pinnedRequest(url, addresses, signal) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal, headers: { Accept: "text/html, application/json", "User-Agent": "HamrahAcademicEvidence/1.0" },
      lookup: (_hostname, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family) }, (response) => {
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size > 500000) request.destroy(new Error("response_size_limit")); else chunks.push(chunk); });
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode,
        headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => typeof value === "string")) })));
      response.on("error", reject);
    });
    request.on("error", reject);
  });
}
export async function fetchOfficialAcademicPage(raw, fetchImpl, signal, options = {}) {
  let url = canonicalAcademicUrl(raw);
  if (!url || [...new URL(url).searchParams.keys()].some((k) => /token|auth|api.?key|email|password|code/i.test(k))) throw new Error("unsafe_source_url");
  for (let step = 0; step < 4; step++) {
    const addresses = await (options.resolveHost ?? lookup)(new URL(url).hostname, { all: true });
    if (!addresses.length || addresses.some((r) => !publicAddress(r.address))) throw new Error("unsafe_source_address");
    const response = fetchImpl === globalThis.fetch ? await pinnedRequest(url, addresses, signal)
      : await fetchImpl(url, { redirect: "manual", method: "GET", headers: { Accept: "text/html, application/json" }, signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = canonicalAcademicUrl(new URL(response.headers.get("location"), url).href);
      if (!next || new URL(next).host !== new URL(url).host) throw new Error("official_cross_origin_redirect");
      url = next; continue;
    }
    return { url, response };
  }
  throw new Error("redirect_limit");
}
