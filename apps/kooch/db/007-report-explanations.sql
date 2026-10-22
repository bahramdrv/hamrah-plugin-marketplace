CREATE TABLE IF NOT EXISTS kooch.report_explanation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES kooch.reports(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, version integer NOT NULL CHECK(version > 0),
  created_at timestamptz NOT NULL, UNIQUE(owner, request_id), UNIQUE(report_id, version)
);
CREATE TABLE IF NOT EXISTS kooch.report_explanations (
  job_id uuid PRIMARY KEY REFERENCES kooch.report_explanation_jobs(id) ON DELETE CASCADE,
  owner uuid NOT NULL, snapshot jsonb NOT NULL
);
ALTER TABLE kooch.report_explanation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.report_explanation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE kooch.report_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.report_explanations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_explanation_job ON kooch.report_explanation_jobs;
CREATE POLICY own_explanation_job ON kooch.report_explanation_jobs TO kooch_runtime
  USING(owner=nullif(current_setting('kooch.owner',true),'')::uuid)
  WITH CHECK(owner=nullif(current_setting('kooch.owner',true),'')::uuid);
DROP POLICY IF EXISTS own_explanation ON kooch.report_explanations;
CREATE POLICY own_explanation ON kooch.report_explanations TO kooch_runtime
  USING(owner=nullif(current_setting('kooch.owner',true),'')::uuid)
  WITH CHECK(owner=nullif(current_setting('kooch.owner',true),'')::uuid);
GRANT SELECT, INSERT, DELETE ON kooch.report_explanation_jobs,kooch.report_explanations TO kooch_runtime;
REVOKE UPDATE ON kooch.report_explanation_jobs,kooch.report_explanations FROM kooch_runtime;
