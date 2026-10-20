-- Coarse owner/day totals keep quotas after individual billing receipts lose
-- their owner and operation links. No case, draft, receipt id or text is stored.
CREATE TABLE IF NOT EXISTS kooch.ai_detached_quota (
  subject text NOT NULL, currency text NOT NULL, day date NOT NULL,
  charged_minor bigint NOT NULL DEFAULT 0 CHECK (charged_minor>=0),
  held_minor bigint NOT NULL DEFAULT 0 CHECK (held_minor>=0),
  requests bigint NOT NULL DEFAULT 0 CHECK (requests>=0),
  held_requests bigint NOT NULL DEFAULT 0 CHECK (held_requests>=0),
  PRIMARY KEY(subject,currency,day)
);
REVOKE ALL ON kooch.ai_detached_quota FROM PUBLIC, kooch_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON kooch.ai_detached_quota TO kooch_account_api;
ALTER TABLE kooch.ai_detached_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE kooch.ai_detached_quota FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_detached_quota ON kooch.ai_detached_quota;
CREATE POLICY server_detached_quota ON kooch.ai_detached_quota TO kooch_account_api USING(true) WITH CHECK(true);
