-- Apply before enabling KOOCH_MEMBERSHIP_ENABLED. Preserve the first cutover only.
ALTER TABLE kooch.account_state ADD COLUMN IF NOT EXISTS report_access_granted_at timestamptz;
ALTER TABLE kooch.account_state ADD COLUMN IF NOT EXISTS report_access_basis text CHECK (report_access_basis IN ('legacy', 'telegram'));
ALTER TABLE kooch.account_state ADD COLUMN IF NOT EXISTS instagram_declared_at timestamptz;
CREATE TABLE IF NOT EXISTS kooch.report_access_rollout (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
WITH first_rollout AS (
  INSERT INTO kooch.report_access_rollout(id) VALUES(true) ON CONFLICT DO NOTHING RETURNING activated_at
)
UPDATE kooch.account_state a SET report_access_granted_at=r.activated_at, report_access_basis='legacy'
FROM first_rollout r WHERE a.deleted_at IS NULL AND a.report_access_granted_at IS NULL
  AND EXISTS(SELECT 1 FROM kooch.reports p WHERE p.owner=a.owner);

CREATE TABLE IF NOT EXISTS kooch.membership_challenges (
  owner uuid PRIMARY KEY REFERENCES kooch.account_state(owner) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  telegram_hash text,
  code_hash text,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5)
);
CREATE INDEX IF NOT EXISTS membership_expiry ON kooch.membership_challenges(expires_at);
REVOKE ALL ON kooch.membership_challenges, kooch.report_access_rollout FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON kooch.membership_challenges TO kooch_account_api;
GRANT SELECT ON kooch.report_access_rollout TO kooch_account_api;
