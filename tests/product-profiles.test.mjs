import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const profiles = require('../public/app/features/product-profiles.js');

assert.deepEqual(profiles.getEnabledPodIds('core'), ['shortcuts', 'calendar']);
assert.equal(profiles.isPodEnabled('seller', 'ebay-traffic'), true);
assert.equal(profiles.isPodEnabled('seller', 'unread-email'), true);
assert.equal(profiles.isPodEnabled('seller', 'social-followers'), false);
assert.equal(profiles.isPodEnabled('creator', 'rss-feed'), true);
assert.equal(profiles.isPodEnabled('creator', 'voice-desk'), true);
assert.equal(profiles.isPodEnabled('home', 'camera-feed'), true);
assert.equal(profiles.isPodEnabled('home', 'weather'), true, 'weather is governed by Date & Time');
assert.equal(profiles.isPodEnabled('core', 'weather'), false);
assert.deepEqual(profiles.normalizeCustomPodIds(['rss-feed', 'rss-feed', 'weather', 'unknown']), ['rss-feed', 'date-time']);
assert.equal(profiles.isPodEnabled('custom', 'rss-feed', ['rss-feed']), true);
assert.equal(profiles.isPodEnabled('custom', 'calendar', []), true, 'core tools are always present in Custom');
assert.equal(profiles.isIntegrationEnabled('creator', 'rss'), true);
assert.equal(profiles.isIntegrationEnabled('creator', 'unread-email'), false);

console.log('product-profiles: PASS');
