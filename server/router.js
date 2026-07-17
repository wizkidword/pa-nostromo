'use strict';

function createApiRouter({ handlers, sendJson }) {
  if (!handlers || typeof handlers !== 'object') throw new Error('API router requires handlers.');
  if (typeof sendJson !== 'function') throw new Error('API router requires sendJson().');

  const routes = [
    { matches: (pathname) => pathname === '/api/app-info', handler: 'appInfo' },
    { matches: (pathname) => pathname.startsWith('/api/state'), handler: 'state' },
    { matches: (pathname) => pathname === '/api/rowan-send', handler: 'rowanSend' },
    { matches: (pathname) => pathname === '/api/camera-snapshot', handler: 'cameraSnapshot' },
    { matches: (pathname) => pathname === '/api/rss/fetch', handler: 'rssFetch' },
    { matches: (pathname) => pathname === '/api/gas-prices', handler: 'gasPrices' },
    { matches: (pathname) => pathname.startsWith('/api/crypto/'), handler: 'cryptoProxy' },
    { matches: (pathname) => pathname === '/api/system-resources', handler: 'systemResources' },
    { matches: (pathname) => pathname === '/api/speed-test', handler: 'speedTest' },
    { matches: (pathname) => pathname === '/api/home-devices/ping', handler: 'homeDevicePing' },
    { matches: (pathname) => pathname === '/api/home-devices/wake', handler: 'homeDeviceWake' },
    { matches: (pathname) => pathname.startsWith('/api/email-unread'), handler: 'unreadEmail' },
    { matches: (pathname) => pathname.startsWith('/api/ebay-traffic'), handler: 'ebayTraffic' },
    { matches: (pathname) => pathname.startsWith('/api/facebook-followers'), handler: 'facebookFollowers' },
    { matches: (pathname) => pathname.startsWith('/api/facebook-group-members'), handler: 'facebookGroupMembers' },
    { matches: (pathname) => pathname.startsWith('/api/facebook-content'), handler: 'facebookContent' },
    { matches: (pathname) => pathname.startsWith('/api/instagram-content'), handler: 'instagramContent' },
    { matches: (pathname) => pathname.startsWith('/api/instagram-followers'), handler: 'instagramFollowers' },
    { matches: (pathname) => pathname.startsWith('/api/tiktok-followers'), handler: 'tikTokFollowers' },
    { matches: (pathname) => pathname.startsWith('/api/youtube-subscribers'), handler: 'youtubeSubscribers' },
  ];

  for (const route of routes) {
    if (typeof handlers[route.handler] !== 'function') {
      throw new Error(`API router handler "${route.handler}" is required.`);
    }
  }

  return async function dispatchApiRoute(req, res, pathname) {
    const route = routes.find((candidate) => candidate.matches(pathname));
    if (route) return handlers[route.handler](req, res);
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  };
}

module.exports = { createApiRouter };
