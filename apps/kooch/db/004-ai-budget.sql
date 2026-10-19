-- Private accounting metadata, never request/response prose or raw account identifiers.
-- Outstanding reservations survive case/account deletion and period rollover until reconciliation.
CREATE TABLE IF NOT EXISTS kooch.ai_budget_requests (
  id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),
  subject text NOT NULL CHECK(subject ~ '^[a-f0-9]{64}$'),
  policy text NOT NULL,
  currency text NOT NULL,
  reserved_minor bigint NOT NULL CHECK(reserved_minor > 0),
  charged_minor bigint CHECK(charged_minor >= 0),
  state text NOT NULL CHECK(state IN ('reserved','sent','unknown','settled','cancelled')),
  usage jsonb,
  outcome text,
  requested_model text,
  reported_model text,
  latency_ms integer CHECK(latency_ms >= 0),
  blocked boolean NOT NULL DEFAULT false,
  retry_after timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK((state='settled') = (charged_minor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_budget_currency_time ON kooch.ai_budget_requests(currency,created_at);
CREATE INDEX IF NOT EXISTS ai_budget_subject_time ON kooch.ai_budget_requests(subject,created_at);
ALTER TABLE kooch.ai_budget_requests ADD COLUMN IF NOT EXISTS tariff jsonb;
ALTER TABLE kooch.ai_budget_requests ADD COLUMN IF NOT EXISTS reconciliation_hash text;
ALTER TABLE kooch.ai_budget_requests ADD COLUMN IF NOT EXISTS operation_hash text CHECK(operation_hash IS NULL OR operation_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_operation_hash ON kooch.ai_budget_requests(operation_hash) WHERE operation_hash IS NOT NULL;
-- Upgrade preparation-only local rows; erased links stay erased on migration replay.
UPDATE kooch.ai_budget_requests SET operation_hash=id WHERE operation_hash IS NULL AND subject<>repeat('0',64);
-- Only the server accounting adapter can read across subjects for shared caps.
REVOKE ALL ON kooch.ai_budget_requests FROM PUBLIC, kooch_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON kooch.ai_budget_requests TO kooch_account_api;
-- Fail closed even if the hosting platform supplies additional default grants.
ALTER TABLE kooch.ai_budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.ai_budget_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_budget ON kooch.ai_budget_requests;
CREATE POLICY server_budget ON kooch.ai_budget_requests TO kooch_account_api
  USING(true) WITH CHECK(true);
