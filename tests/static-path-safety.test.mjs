import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { safePathFromUrl } = require('../server.js');

const root = process.cwd();

function assertInside(urlPath, expectedSuffix) {
  const resolved = safePathFromUrl(urlPath);
  assert.equal(typeof resolved, 'string');
  assert.equal(path.relative(root, resolved).startsWith('..'), false);
  assert.equal(resolved.endsWith(expectedSuffix), true);
}

function assertBlocked(urlPath) {
  assert.equal(safePathFromUrl(urlPath), null);
}

assertInside('/', 'index.html');
assertInside('/index.html', 'index.html');
assertInside('/assets/social/github.svg', path.join('assets', 'social', 'github.svg'));

assertBlocked('/../pa-nostromo-secret/x');
assertBlocked('/..%2fpa-nostromo-secret/x');
assertBlocked('/..%5cpa-nostromo-secret/x');
assertBlocked('/../../CODEX/pa-nostromo2/x');

console.log('static-path-safety: PASS');
