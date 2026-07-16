import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('app.js', 'utf8');

const managedMatch = appSource.match(/const managed = \[([\s\S]*?)\];/);
assert.ok(managedMatch, 'syncUtilityPodLifecycle should define its managed pod list');
assert.match(
  managedMatch[1],
  /MERGED_SOCIAL_FOLLOWERS_POD_ID/,
  'merged social followers pod should render during the initial utility lifecycle sync'
);

assert.match(
  appSource,
  /facebook_page_playwright_public/,
  'Facebook social tile should preserve public/session fallback source labels'
);

console.log('social-followers-merged-pod: PASS');
