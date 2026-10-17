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
