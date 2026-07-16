import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractUnreadEmailAtomFeed,
  emailUnreadSetupPayload,
} = require('../server.js');

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>Gmail - Inbox for test@example.com</title>
  <fullcount>7</fullcount>
  <entry>
    <title>Quarterly check-in</title>
    <summary>Need your sign-off on the new campaign brief.</summary>
    <issued>2026-04-10T14:22:00Z</issued>
    <author>
      <name>Rowan</name>
      <email>rowan@example.com</email>
    </author>
    <link rel="alternate" href="https://mail.google.com/mail/u/0/#inbox/FMfcgzQabc123" />
  </entry>
  <entry>
    <title>&lt;b&gt;Build alert&lt;/b&gt;</title>
    <summary>&lt;div&gt;Preview deploy failed on step 4.&lt;/div&gt;</summary>
    <issued>2026-04-10T13:05:00Z</issued>
    <author>
      <name>Deploy Bot</name>
      <email>ci@example.com</email>
    </author>
    <link rel="alternate" href="https://mail.google.com/mail/u/0/#inbox/FMfcgzQdef456" />
  </entry>
</feed>`;

const parsed = extractUnreadEmailAtomFeed(sampleFeed);
assert.equal(parsed.unreadCount, 7);
assert.equal(parsed.entries.length, 2);
assert.equal(parsed.entries[0].title, 'Quarterly check-in');
assert.equal(parsed.entries[0].authorEmail, 'rowan@example.com');
assert.equal(parsed.entries[1].title, 'Build alert');
assert.equal(parsed.entries[1].summary, 'Preview deploy failed on step 4.');

const setupPayload = emailUnreadSetupPayload();
assert.equal(setupPayload.ok, true);
assert.equal(setupPayload.setupRequired, true);
assert.equal(Array.isArray(setupPayload.entries), true);

console.log('email-unread-atom-parser: PASS');
