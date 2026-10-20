-- Human-only credential entry and submission. Production passwords are untouched.
-- Replace only the empty string on the next declaration, then personally press Run.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $preview$
DECLARE
  preview_password text := '';
  preview_role constant text := 'kooch_preview_account_api';
  preview_expiry constant timestamptz := '2026-10-20 07:43:44+00';
BEGIN
  IF length(preview_password) NOT BETWEEN 32 AND 128 THEN
    RAISE EXCEPTION 'Enter your new Preview password: 32-128 characters. Nothing was created.';
  END IF;
  IF now() >= preview_expiry THEN
    RAISE EXCEPTION 'The current acceptance window expired. Stop for a fresh validity review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=preview_role) THEN
    RAISE EXCEPTION 'Preview role already exists. Stop; never rotate it by replaying this query.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kooch_account_api' AND NOT rolsuper AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected restricted application role is absent.';
  END IF;
  EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3 PASSWORD %L VALID UNTIL %L',preview_role,preview_password,preview_expiry);
  EXECUTE format('GRANT kooch_account_api TO %I WITH INHERIT TRUE, SET FALSE',preview_role);
  EXECUTE format('GRANT kooch_runtime TO %I WITH INHERIT FALSE, SET TRUE',preview_role);
  PERFORM set_config('kooch.preview_connection',format('postgresql://%s.ifjtceqlcsmypuuflwlx:%s@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',preview_role,regexp_replace(encode(convert_to(preview_password,'UTF8'),'hex'),'(..)','%\1','g')),true);
END;
$preview$;
-- This is private credential material after human submission; do not post it in chat.
SELECT current_setting('kooch.preview_connection') AS preview_database_url;
COMMIT;
