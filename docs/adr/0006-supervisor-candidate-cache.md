# Cache supervisor discovery candidates without caching verification

Status: accepted by the product owner on 2026-09-30.

Hamrah uses a bounded anonymous OpenAlex works search and ROR organization lookup to find Academic Supervisor Lead candidates on an explicit request. These services provide research hints, not proof of current affiliation, recruitment, contact, or an opening. Only a current official institutional page can establish the public claims in a displayed lead.

For each successful discovery search, persist at most twelve public professional names with their OpenAlex author ID, institution name, ROR ID when available, and country code in shared Redis REST. The key is a hash of normalized country, field, and topic; each entry expires after 30 days. Do not save applicant facts, a former student's name, contact details, full API records, official-page excerpts, or verification conclusions. Read cached names on later matching requests and run a fresh bounded API search. Recheck official institutional pages on every request before showing any name to the user. A cache hit is never a verified lead.

If OpenAlex, ROR, or Redis is unavailable, report the affected coverage and continue bounded official web research in the requested scope. No database write is a condition for suppressing an otherwise verifiable answer. The deployed shared cache requires the existing `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` configuration. Without those variables, discovery reports the cache as unavailable and never claims persistence.
