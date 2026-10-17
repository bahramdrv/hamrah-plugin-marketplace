-- Run only through the database-owned retention job, not an application endpoint.
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
COMMIT;
