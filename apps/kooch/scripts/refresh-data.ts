import { readFile, rename, writeFile } from 'node:fs/promises';
import { refreshSnapshot } from '../src/retrieval';
const dataPath = new URL('../data/iran-start-snapshot.json', import.meta.url);
const statusPath = new URL('../data/retrieval-status.json', import.meta.url);
const previous = JSON.parse(await readFile(dataPath, 'utf8'));
const result = await refreshSnapshot(previous);
async function atomicWrite(path: URL, value: unknown) {
  const temporary = new URL(`${path.href}.tmp`);
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, path);
}
if (result.status.state === 'ok') await atomicWrite(dataPath, result.snapshot);
await atomicWrite(statusPath, result.status);
console.log(JSON.stringify(result.status));
if (result.status.state === 'error') process.exitCode = 1;
