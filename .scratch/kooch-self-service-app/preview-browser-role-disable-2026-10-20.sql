-- Execute after the approved Preview acceptance batch, including a failed batch.
-- VALID UNTIL alone does not close existing sessions or revoke membership.
-- Narrow only this dedicated Preview login; preserve all Production roles and data.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
ALTER ROLE kooch_preview_account_api NOLOGIN;
REVOKE kooch_account_api,kooch_runtime FROM kooch_preview_account_api;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE usename='kooch_preview_account_api' AND pid<>pg_backend_pid();
COMMIT;
