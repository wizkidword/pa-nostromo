import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const roots = ['server.js', 'public', 'lib', 'scripts', 'tests'];

async function collect(target) {
  const absolute = path.join(root, target);
  const stat = await fsp.stat(absolute);
  if (stat.isFile()) return /\.(?:c?js|mjs)$/i.test(absolute) ? [absolute] : [];
  const entries = await fsp.readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => collect(path.join(target, entry.name))));
  return nested.flat();
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${path.relative(root, file)}`)));
  });
}

const files = (await Promise.all(roots.map(collect))).flat().sort();
for (const file of files) await check(file);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
