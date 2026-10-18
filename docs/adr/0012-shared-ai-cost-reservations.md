---
status: accepted
---

# Reserve shared AI costs before dispatch and retain unknown charges

The owner approved a shared 50,000 toman ceiling for the current synthetic acceptance and monthly use. We keep the server's deterministic form independent of model access. Before dispatch, one PostgreSQL transaction reserves a conservative, versioned tariff bound against global monthly and daily caps and a per-user daily cap; idempotency spans instances and case revisions. Sent requests without authoritative usage retain their reservation until reconciliation, including across period boundaries and account deletion. The ledger holds hashed operation keys and keyed subject pseudonyms, never applicant answers or provider prose. Account deletion removes the subject association; after 90 days accounting retention anonymizes old subjects and deletes closed ordinary records while keeping unresolved holds and policy circuit breakers. These anonymous financial controls prevent erasure, timeout or rollover from recreating spendable budget. Activation also requires current, connection-bound capability/IAM/header/tariff acceptance; approving a spending ceiling does not itself accept a provider capability.
