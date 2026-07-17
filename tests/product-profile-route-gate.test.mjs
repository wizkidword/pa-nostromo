import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROUTE_MANIFEST, productProfileRouteAllowed, authorizeProductProfileRoute } = require('../server.js');

const route = (id) => ROUTE_MANIFEST.find((entry) => entry.id === id);
const request = (profile, pods = '') => ({
  headers: {
    'x-pa-nostromo-product-profile': profile,
    'x-pa-nostromo-product-pods': pods,
  },
});

assert.equal(productProfileRouteAllowed(request('core'), route('email.unread')).allowed, false);
assert.equal(productProfileRouteAllowed(request('core'), route('app.info')).allowed, true);
assert.equal(productProfileRouteAllowed(request('seller'), route('ebay.read')).allowed, true);
assert.equal(productProfileRouteAllowed(request('seller'), route('facebook-followers.read')).allowed, false);
assert.equal(productProfileRouteAllowed(request('custom', 'rss-feed'), route('rss.fetch')).allowed, true);
assert.equal(productProfileRouteAllowed(request('custom', 'rss-feed'), route('email.unread')).allowed, false);
assert.equal(productProfileRouteAllowed({ headers: {} }, route('email.unread')).allowed, true, 'legacy callers without a profile header remain compatible');

const response = {
  statusCode: 0,
  body: '',
  writableEnded: false,
  writeHead(status) { this.statusCode = status; },
  end(body = '') { this.body = String(body); this.writableEnded = true; },
};
assert.equal(authorizeProductProfileRoute(request('core'), response, route('email.unread')), false);
assert.equal(response.statusCode, 403);
assert.match(response.body, /product_profile_disabled/);

console.log('product-profile-route-gate: PASS');
