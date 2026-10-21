// Manual operator tool. It never restores into a hosted/serving database.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { resolve } from 'node:path';
import pg from 'pg';
const magic = Buffer.from('KOOCH-BACKUP-1\n');
const maxBytes = 128 * 1024 * 1024;
function config(value: string | undefined) {
  if (!value) throw new Error('Database URL required');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search) throw new Error('Use PostgreSQL URL without URL options');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && !process.env.KOOCH_BACKUP_CA_FILE) throw new Error('Hosted backup requires provider root CA file');
  // libpq environment must not override the reviewed URL (especially PGHOSTADDR/services).
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')));
  return { url, local, env: { ...inherited, NODE_ENV: process.env.NODE_ENV,
    PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: local ? 'disable' : 'verify-full',
    PGSSLROOTCERT: process.env.KOOCH_BACKUP_CA_FILE || '', PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c statement_timeout=120000 -c lock_timeout=3000',
  } };
}
function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  // Provider errors can contain identifiers or private SQL: never print stderr.
  child.stderr.resume();
  const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('PostgreSQL tool failed'))); });
  void done.catch(() => {});
  return { child, done };
}
async function main() {
  const [operation, targetFile] = process.argv.slice(2);
  if (!['backup', 'verify-local'].includes(operation) || !targetFile || !/^[a-f0-9]{64}$/.test(process.env.KOOCH_BACKUP_KEY || ''))
    throw new Error('Use backup|verify-local FILE with an independent 32-byte hex KOOCH_BACKUP_KEY');
  const key = Buffer.from(process.env.KOOCH_BACKUP_KEY!, 'hex'), path = resolve(targetFile);
  if (operation === 'backup') {
    const source = config(process.env.KOOCH_BACKUP_DATABASE_URL);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(magic);
    const output = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    const tool = run('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--schema=auth', '--schema=kooch'], source.env);
    let size = 0, created = false;
    const timer = setTimeout(() => tool.child.kill('SIGTERM'), 150000);
    try {
      await new Promise<void>((resolve, reject) => { output.once('open', () => { created = true; resolve(); }); output.once('error', reject); });
      output.write(Buffer.concat([magic, iv]));
      const bound = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; callback(size > maxBytes ? new Error('Backup size limit') : null, chunk); } });
      await pipeline(tool.child.stdout, bound, cipher, output, { end: false }); await tool.done;
      await new Promise<void>((resolve, reject) => { output.once('error', reject); output.end(cipher.getAuthTag(), resolve); });
      console.log(JSON.stringify({ state: 'encrypted_backup_created', format: 'KOOCH-BACKUP-1', bytes: (await stat(path)).size, created_at: new Date().toISOString() }));
    } catch (error) { tool.child.kill('SIGTERM'); output.destroy(); if (created) await unlink(path).catch(() => {}); throw error; }
    finally { clearTimeout(timer); key.fill(0); }
  } else {
    const target = config(process.env.KOOCH_RESTORE_DATABASE_URL);
    if (!target.local || !/^kooch_restore_[a-f0-9]{8,32}$/.test(target.env.PGDATABASE)) throw new Error('Restore requires an empty isolated loopback kooch_restore_* database');
    const info = await stat(path); if (info.size > maxBytes + 1024) throw new Error('Backup size limit');
    const bytes = await readFile(path);
    if (!bytes.subarray(0, magic.length).equals(magic) || bytes.length < magic.length + 28) throw new Error('Invalid backup envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(magic.length, magic.length + 12));
    decipher.setAAD(magic); decipher.setAuthTag(bytes.subarray(-16));
    // Authenticate the complete encrypted archive before opening a database connection.
    const plain = Buffer.concat([decipher.update(bytes.subarray(magic.length + 12, -16)), decipher.final()]); key.fill(0);
    const db = new pg.Client({ connectionString: target.url.href, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    try {
      await db.connect();
      const tables = await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')");
      if (tables.rows[0].n) throw new Error('Restore target is not empty');
    } finally { await db.end(); }
    const tool = run('pg_restore', ['--dbname', target.env.PGDATABASE, '--no-owner', '--exit-on-error', '--single-transaction'], target.env);
    tool.child.stdout.resume(); tool.child.stdin.on('error', () => {});
    const timer = setTimeout(() => tool.child.kill('SIGTERM'), 150000);
    try { tool.child.stdin.end(plain); await tool.done; console.log(JSON.stringify({ state: 'restored_to_isolated_loopback', serving_traffic: false, production_restore: 'not_authorized' })); }
    finally { clearTimeout(timer); plain.fill(0); }
  }
}
main().catch(() => { console.error('Backup/restore failed. Check local credentials, CA, tool version, key, file permissions and empty isolated target; no provider error text is logged.'); process.exitCode = 1; });
