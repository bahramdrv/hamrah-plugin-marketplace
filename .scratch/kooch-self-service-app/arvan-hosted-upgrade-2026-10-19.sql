-- Reviewed hosted upgrade for ticket 05. Does not execute the retention job now.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $kooch_upgrade_05$ BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname='kooch-retention-hourly') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one existing retention job';
  END IF;
END; $kooch_upgrade_05$;
-- Private, owner-scoped question answers share the existing case revision and RLS.
ALTER TABLE kooch.cases ADD COLUMN IF NOT EXISTS form jsonb NOT NULL DEFAULT '{"schema_version":1,"answers":{}}'::jsonb;

CREATE TABLE IF NOT EXISTS kooch.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES kooch.cases(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version > 0),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE(owner, request_id), UNIQUE(case_id, version)
);
ALTER TABLE kooch.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_report ON kooch.reports;
CREATE POLICY own_report ON kooch.reports TO kooch_runtime
  USING(owner = nullif(current_setting('kooch.owner', true), '')::uuid)
  WITH CHECK(owner = nullif(current_setting('kooch.owner', true), '')::uuid);
-- Snapshots are append-only for the application. Case deletion cascades for privacy.
GRANT SELECT, INSERT, DELETE ON kooch.reports TO kooch_runtime;
REVOKE UPDATE ON kooch.reports FROM kooch_runtime;

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

SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='kooch-retention-hourly'), command := $kooch_retention_05$-- Run only through the database-owned retention job, not an application endpoint.
-- A transaction keeps timeout settings local and rolls all deletions back on error.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
DELETE FROM kooch.cases
WHERE delete_after <= now() AND id IN (
  SELECT id FROM kooch.cases WHERE delete_after <= now()
  ORDER BY delete_after, id LIMIT 500 FOR UPDATE SKIP LOCKED
);
-- Expired case receipts are removed by their existing ON DELETE CASCADE.
DELETE FROM kooch.sessions
WHERE expires_at <= now() AND token_hash IN (
  SELECT token_hash FROM kooch.sessions WHERE expires_at <= now()
  ORDER BY expires_at, token_hash LIMIT 5000 FOR UPDATE SKIP LOCKED
);
DELETE FROM kooch.rate_limits
WHERE reset_at <= now() AND key IN (
  SELECT key FROM kooch.rate_limits WHERE reset_at <= now()
  ORDER BY reset_at, key LIMIT 5000 FOR UPDATE SKIP LOCKED
);
-- Financial holds and policy circuit breakers must survive ordinary retention.
-- Erase the subject link after 90 days without releasing an unresolved hold.
UPDATE kooch.ai_budget_requests SET subject=repeat('0',64),operation_hash=NULL
WHERE id IN (
  SELECT id FROM kooch.ai_budget_requests
  WHERE updated_at < now()-interval '90 days' AND subject<>repeat('0',64)
  ORDER BY updated_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED
);
DELETE FROM kooch.ai_budget_requests
WHERE id IN (
  SELECT id FROM kooch.ai_budget_requests
  WHERE updated_at < now()-interval '90 days' AND state IN ('settled','cancelled') AND NOT blocked
  ORDER BY updated_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED
);
COMMIT;
$kooch_retention_05$);
COMMIT;
