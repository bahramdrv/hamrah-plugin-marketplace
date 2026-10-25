-- Run only through the database-owned retention job, not an application endpoint.
-- A transaction keeps timeout settings local and rolls all deletions back on error.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
-- A pending metered draft already holds its random receipt id. Erase its
-- financial identity in the same transaction as expiry, regardless of whether
-- late settlement recently refreshed the receipt's accounting timestamp.
UPDATE kooch.ai_budget_requests SET subject=repeat('0',64),operation_hash=NULL
WHERE id IN (SELECT form->'draft'->>'accounting_id' FROM kooch.cases WHERE delete_after<=now() ORDER BY delete_after,id LIMIT 500 FOR UPDATE SKIP LOCKED);
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
DELETE FROM kooch.membership_challenges WHERE owner IN (
  SELECT owner FROM kooch.membership_challenges WHERE expires_at<=now()
  ORDER BY expires_at,owner LIMIT 5000 FOR UPDATE SKIP LOCKED
);
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
DELETE FROM kooch.ai_detached_quota WHERE (subject,currency,day) IN (
  SELECT subject,currency,day FROM kooch.ai_detached_quota WHERE day < (now() AT TIME ZONE 'UTC')::date - 90
  ORDER BY day,subject,currency LIMIT 5000 FOR UPDATE SKIP LOCKED
);
COMMIT;
