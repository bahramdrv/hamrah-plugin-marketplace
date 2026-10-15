import pg from 'pg';
import { AccountStore } from '../src/account/store';
if (!process.env.KOOCH_DATABASE_URL || !process.env.KOOCH_SESSION_ENCRYPTION_KEY) throw new Error('Account storage not configured.');
const pool = new pg.Pool({ connectionString: process.env.KOOCH_DATABASE_URL });
try {
  const store = new AccountStore(pool, process.env.KOOCH_SESSION_ENCRYPTION_KEY);
  await store.validateRole(); await store.purgeInactive();
  console.log('Inactive case and expired session cleanup completed; no activity dates extended.');
} finally { await pool.end(); }
