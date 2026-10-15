-- Run with a migration credential; the application login must not be a superuser or bypass RLS.
CREATE SCHEMA IF NOT EXISTS kooch;
CREATE TABLE IF NOT EXISTS kooch.account_state (
  owner uuid PRIMARY KEY,
  deleted_at timestamptz,
  auth_deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS kooch.sessions (
  token_hash text PRIMARY KEY,
  owner uuid NOT NULL REFERENCES kooch.account_state(owner),
  provider_session text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('account','recovery')),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_owner ON kooch.sessions(owner);
CREATE TABLE IF NOT EXISTS kooch.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL UNIQUE,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  answers jsonb NOT NULL,
  step integer NOT NULL CHECK (step BETWEEN 0 AND 7),
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  delete_after timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS kooch.requests (
  owner uuid NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  case_id uuid NOT NULL REFERENCES kooch.cases(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  PRIMARY KEY (owner, request_id)
);
CREATE TABLE IF NOT EXISTS kooch.rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
ALTER TABLE kooch.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.cases FORCE ROW LEVEL SECURITY;
ALTER TABLE kooch.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_case ON kooch.cases;
CREATE POLICY own_case ON kooch.cases TO kooch_runtime
  USING (owner = nullif(current_setting('kooch.owner', true), '')::uuid)
  WITH CHECK (owner = nullif(current_setting('kooch.owner', true), '')::uuid);
DROP POLICY IF EXISTS own_request ON kooch.requests;
CREATE POLICY own_request ON kooch.requests TO kooch_runtime
  USING (owner = nullif(current_setting('kooch.owner', true), '')::uuid)
  WITH CHECK (owner = nullif(current_setting('kooch.owner', true), '')::uuid);
GRANT USAGE ON SCHEMA kooch TO kooch_runtime, kooch_account_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON kooch.cases, kooch.requests TO kooch_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON kooch.account_state, kooch.sessions, kooch.rate_limits TO kooch_account_api;
