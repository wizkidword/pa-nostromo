import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');
const { CURRENT_STATE_SCHEMA_VERSION } = require('../lib/state-schema.js');
const { APP_VERSION, PACKAGE_NAME, STATE_SCHEMA_VERSION, getReleaseInfo } = require('../lib/release-info.js');
const { server } = require('../server.js');

assert.equal(APP_VERSION, packageMetadata.version, 'package.json is the application version source of truth');
assert.equal(PACKAGE_NAME, packageMetadata.name);
assert.equal(STATE_SCHEMA_VERSION, CURRENT_STATE_SCHEMA_VERSION, 'state-schema.js owns the durable-state version');
assert.deepEqual(getReleaseInfo(), {
  packageName: packageMetadata.name,
  appVersion: packageMetadata.version,
  stateSchemaVersion: CURRENT_STATE_SCHEMA_VERSION,
});

const indexHtml = await readFile(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
const appSource = await readFile(path.join(process.cwd(), 'public', 'app.js'), 'utf8');
assert.match(indexHtml, /id="appVersion"/);
assert.match(appSource, /const APP_INFO_API = '\/api\/app-info';/);
assert.match(appSource, /loadApplicationVersion\(\);/);
assert.doesNotMatch(appSource, /target\.schemaVersion = 2/);

server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/app-info`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    packageName: packageMetadata.name,
    appVersion: packageMetadata.version,
    stateSchemaVersion: CURRENT_STATE_SCHEMA_VERSION,
  });
} finally {
  const closed = once(server, 'close');
  server.close();
  await closed;
}

console.log('release-info: PASS');
