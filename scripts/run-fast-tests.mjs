import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const testRoot = path.join(root, 'tests');

async function findTests(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return findTests(file);
    return entry.name.endsWith('.test.mjs') && entry.name !== 'dashboard-smoke.test.mjs' ? [file] : [];
  }));
  return nested.flat();
}

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Fast test failed: ${path.relative(root, file)}`)));
  });
}

const tests = (await findTests(testRoot)).sort();
for (const test of tests) await run(test);
console.log(`Fast test suite passed (${tests.length} files).`);
