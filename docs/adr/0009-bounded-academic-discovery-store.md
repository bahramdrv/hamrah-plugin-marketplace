# ADR 0009: extend the bounded academic discovery store

Status: accepted by the product owner during design on 2026-10-01; source policy implemented; actual Preview Redis concurrency and expiry acceptance passed.

The first Academic Discovery phase extends the existing shared Redis store with bounded, expiring public metadata rather than introducing a persistent PostgreSQL/vector catalog. This reuses the verified infrastructure and keeps the initial scope small, while current official verification remains request-scoped; it deliberately does not promise a searchable permanent global catalog. Each added source needs an explicit field/license/attribution/expiry/deletion/quota policy and an independent namespace before persistence is enabled. ADRs 0006 and 0007 keep their present scope, and ADR 0008 excludes applicant profiles and personalized report history from the store.
