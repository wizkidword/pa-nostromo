import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extractFacebookPublicFollowerEstimate,
  extractInstagramPublicFollowerEstimate,
  extractTikTokPublicFollowerEstimate,
  extractYouTubePublicSubscriberEstimate,
} = require('../server.js');
const { parserVersionForRoute } = require('../lib/integration-envelope.js');
const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const fixture = (name) => readFile(path.join(fixtureRoot, name), 'utf8');

const parserCases = [
  ['social-facebook-valid.html', extractFacebookPublicFollowerEstimate, 12800, 'followers_count_json'],
  ['social-instagram-valid.html', extractInstagramPublicFollowerEstimate, 9876, 'followers_count_json'],
  ['social-tiktok-valid.html', extractTikTokPublicFollowerEstimate, 45600, 'universal_data_userInfo_stats'],
  ['social-youtube-valid.html', extractYouTubePublicSubscriberEstimate, 91200, 'yt_initial_data_subscriberCountText'],
];

for (const [fixtureName, parser, expectedCount, expectedSignal] of parserCases) {
  const parsed = parser(await fixture(fixtureName));
  assert.deepEqual(parsed, { count: expectedCount, signal: expectedSignal });
}

const missingSignalHtml = await fixture('social-follower-signal-missing.html');
for (const [, parser] of parserCases) {
  assert.deepEqual(parser(missingSignalHtml), {
    count: null,
    signal: '',
    errorCode: 'social_follower_signal_not_found',
  });
}

assert.equal(parserVersionForRoute({ id: 'facebook.followers' }), 'social-followers-v2');
assert.equal(parserVersionForRoute({ id: 'youtube.subscribers' }), 'social-followers-v2');

console.log('social-parser-fixtures: PASS');
