import { randomBytes, createHmac } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
const path = new URL('../local/.env', import.meta.url);
try { await access(path); console.log('Local settings already exist; preserved.'); process.exit(0); } catch { /* create once */ }
const dbPassword = randomBytes(24).toString('hex');
const jwtSecret = randomBytes(32).toString('hex');
const runtimePassword = randomBytes(24).toString('hex');
const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 365 * 86400 })}`;
const serviceKey = `${token}.${createHmac('sha256', jwtSecret).update(token).digest('base64url')}`;
await writeFile(path, `LOCAL_DB_PASSWORD=${dbPassword}\nLOCAL_JWT_SECRET=${jwtSecret}\nLOCAL_RUNTIME_PASSWORD=${runtimePassword}\n`, { mode: 0o600, flag: 'wx' });
await writeFile(new URL('../.env.local', import.meta.url), [
  'KOOCH_ACCOUNT_MODE=local', 'KOOCH_APP_ORIGIN=http://127.0.0.1:3100',
  'KOOCH_AUTH_URL=http://127.0.0.1:59999', `KOOCH_AUTH_SERVICE_KEY=${serviceKey}`,
  `KOOCH_DATABASE_URL=postgres://kooch_account_api:${runtimePassword}@127.0.0.1:55432/kooch`,
  `KOOCH_MIGRATION_DATABASE_URL=postgres://postgres:${dbPassword}@127.0.0.1:55432/kooch`,
  `KOOCH_SESSION_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
  'KOOCH_LOCAL_MAIL_URL=http://127.0.0.1:58025', '',
].join('\n'), { mode: 0o600, flag: 'wx' });
console.log('Private local settings created. No hosted service selected or created.');
