import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractUnreadEmailAtomFeed,
  emailUnreadSetupPayload,
} = require('../server.js');
const { parserVersionForRoute } = require('../lib/integration-envelope.js');
const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const readFixture = (name) => readFile(path.join(fixtureRoot, name), 'utf8');

const parsed = extractUnreadEmailAtomFeed(await readFixture('gmail-unread-atom-valid.xml'));
assert.equal(parsed.unreadCount, 7);
assert.equal(parsed.entries.length, 2);
assert.equal(parsed.entries[0].title, 'Example update');
assert.equal(parsed.entries[0].authorEmail, 'sender-one@example.test');
assert.equal(parsed.entries[1].title, 'Status notice');
assert.equal(parsed.entries[1].summary, 'Example status text.');
const missingFullCount = await readFixture('gmail-unread-atom-missing-fullcount.xml');
assert.throws(
  () => extractUnreadEmailAtomFeed(missingFullCount),
  (error) => error?.code === 'gmail_unread_atom_parser_required_fields_missing',
);
assert.equal(parserVersionForRoute({ id: 'email.unread' }), 'gmail-unread-v2');

const setupPayload = emailUnreadSetupPayload();
assert.equal(setupPayload.ok, true);
assert.equal(setupPayload.setupRequired, true);
assert.equal(Array.isArray(setupPayload.entries), true);

console.log('email-unread-atom-parser: PASS');
