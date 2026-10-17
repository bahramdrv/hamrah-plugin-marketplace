-- Private, owner-scoped question answers share the existing case revision and RLS.
ALTER TABLE kooch.cases ADD COLUMN IF NOT EXISTS form jsonb NOT NULL DEFAULT '{"schema_version":1,"answers":{}}'::jsonb;
