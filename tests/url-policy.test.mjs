import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateWebUrl } = require('../lib/url-policy.js');
const { StateSchemaError, validateAndMigrateState } = require('../lib/state-schema.js');

assert.equal(validateWebUrl('https://example.com/path?x=1').ok, true);
assert.equal(validateWebUrl('http://localhost:4287/health').ok, true);
assert.equal(validateWebUrl('/local/path', { allowRelative: true }).ok, true);
assert.equal(validateWebUrl('https://player.twitch.tv/', { allowedHosts: ['twitch.tv'] }).ok, true);

for (const candidate of [
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///C:/private.txt',
  'vbscript:msgbox(1)',
  '//attacker.example/path',
  'https://user:password@example.com/private',
  'https://example.com/\u0000hidden',
]) {
  assert.equal(validateWebUrl(candidate).ok, false, `${candidate} must be rejected`);
}

assert.equal(validateWebUrl('https://evil.example/', { allowedHosts: ['example.com'] }).ok, false);

assert.throws(
  () => validateAndMigrateState({ shortcuts: [{ id: 'bad-link', url: 'javascript:alert(1)' }] }),
  (error) => error instanceof StateSchemaError && error.code === 'invalid_url',
  'state validation must reject unsafe persisted links'
);

assert.throws(
  () => validateAndMigrateState({ rss: { items: [{ id: 'bad-rss-link', link: 'data:text/html,blocked' }] } }),
  (error) => error instanceof StateSchemaError && error.code === 'invalid_url',
  'state validation must reject unsafe imported feed links'
);

assert.doesNotThrow(() => validateAndMigrateState({
  projects: [{ id: 'paused-project', name: 'Paused project', status: 'paused', appLink: 'https://example.com/' }],
}));

console.log('url-policy: PASS');
