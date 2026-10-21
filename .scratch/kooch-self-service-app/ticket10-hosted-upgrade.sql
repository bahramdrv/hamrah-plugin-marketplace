BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Public route evidence and operational metadata only; no applicant inputs or account IDs.
CREATE TABLE IF NOT EXISTS kooch.evidence_sync_state (
  id text PRIMARY KEY,
  document jsonb NOT NULL CHECK(document->>'schema_version'='1')
);
REVOKE ALL ON kooch.evidence_sync_state FROM PUBLIC, kooch_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON kooch.evidence_sync_state TO kooch_account_api;
ALTER TABLE kooch.evidence_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.evidence_sync_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_evidence ON kooch.evidence_sync_state;
CREATE POLICY server_evidence ON kooch.evidence_sync_state TO kooch_account_api USING(true) WITH CHECK(true);

DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='kooch_account_api' AND NOT rolsuper AND NOT rolbypassrls) THEN RAISE EXCEPTION 'Restricted account role missing'; END IF; END $$;
COMMIT;
