import { readFile } from 'node:fs/promises';
import pg from 'pg';
const connectionString = process.env.KOOCH_MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('Migration database is not configured.');
const db = new pg.Client({ connectionString });
await db.connect();
try {
  // Roles are deployment-specific; create only absent roles, never weaken an existing role.
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='kooch_runtime') THEN CREATE ROLE kooch_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='kooch_account_api') THEN CREATE ROLE kooch_account_api LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  END $$; GRANT kooch_runtime TO kooch_account_api;`);
  for (const name of ['001-account.sql', '002-form.sql', '003-reports.sql', '004-ai-budget.sql']) {
    await db.query(await readFile(new URL(`../db/${name}`, import.meta.url), 'utf8'));
  }
  if (process.env.KOOCH_ACCOUNT_MODE === 'local' && process.env.KOOCH_DATABASE_URL) {
    const runtimePassword = new URL(process.env.KOOCH_DATABASE_URL).password;
    // Generated hexadecimal local secret only; never accept arbitrary SQL text here.
    if (!/^[a-f0-9]{48}$/.test(runtimePassword)) throw new Error('Invalid generated local password.');
    await db.query(`ALTER ROLE kooch_account_api PASSWORD '${runtimePassword}'`);
  }
  console.log('Account migration applied.');
} finally { await db.end(); }
