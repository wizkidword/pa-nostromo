function exact(pathname) {
  return (path) => path === pathname;
}

function prefix(pathname) {
  return (path) => path.startsWith(pathname);
}

function buildRouteManifest({ limits, remote } = {}) {
  const route = (id, method, matches, options = {}) => ({
    id,
    method,
    matches,
    scope: options.scope || 'public',
    localAllowed: options.localAllowed !== false,
    remoteAllowed: options.remoteAllowed === true,
    remoteEnabled: options.remoteEnabled || (() => false),
    bodyLimit: options.bodyLimit || 0,
    ratePolicy: options.ratePolicy || 'default',
    sideEffect: options.sideEffect === true,
  });
  const read = (id, path, options = {}) => route(id, 'GET', exact(path), options);
  const write = (id, path, options = {}) => route(id, 'POST', exact(path), { ...options, sideEffect: options.sideEffect !== false });
  const integrationRead = (id, path, options = {}) => read(id, path, { scope: 'integrations:read', remoteAllowed: true, ...options });
  const integrationRefresh = (id, path, options = {}) => write(id, path, { scope: 'integrations:refresh', remoteAllowed: true, bodyLimit: limits.action, ...options });

  const manifest = [
    read('security.bootstrap', '/api/security/bootstrap', { scope: 'public', remoteAllowed: true, remoteEnabled: () => true, ratePolicy: 'bootstrap' }),
    read('app.info', '/api/app-info', { scope: 'public', remoteAllowed: true, remoteEnabled: () => true, ratePolicy: 'bootstrap' }),
    read('state.read', '/api/state', { scope: 'state:read', remoteAllowed: true, remoteEnabled: remote.state, ratePolicy: 'state-read' }),
    write('state.write', '/api/state', { scope: 'state:write', remoteAllowed: true, remoteEnabled: remote.state, bodyLimit: limits.state, ratePolicy: 'state-write' }),
    read('state.backups', '/api/state/backups', { scope: 'state:read', remoteAllowed: true, remoteEnabled: remote.state, ratePolicy: 'state-read' }),
    write('state.restore', '/api/state/restore', { scope: 'state:write', remoteAllowed: true, remoteEnabled: remote.state, bodyLimit: limits.action, ratePolicy: 'state-write' }),
    write('relay.send', '/api/rowan-send', { scope: 'relay:write', remoteAllowed: true, remoteEnabled: remote.relay, bodyLimit: limits.action, ratePolicy: 'relay-write' }),
    read('camera.snapshot', '/api/camera-snapshot', { scope: 'media:read', remoteAllowed: true, remoteEnabled: remote.camera, ratePolicy: 'media-read' }),
    write('rss.fetch', '/api/rss/fetch', { scope: 'integrations:refresh', remoteAllowed: true, remoteEnabled: remote.rss, bodyLimit: limits.rss, ratePolicy: 'rss-refresh' }),
    read('gas.read', '/api/gas-prices', { scope: 'integrations:read', remoteAllowed: true, remoteEnabled: remote.gas, ratePolicy: 'integration-read' }),
    route('crypto.read', 'GET', prefix('/api/crypto/'), { scope: 'integrations:read', remoteAllowed: true, remoteEnabled: remote.crypto, ratePolicy: 'integration-read' }),
    read('system.resources', '/api/system-resources', { scope: 'system:read', remoteAllowed: true, remoteEnabled: remote.system, ratePolicy: 'system-read' }),
    read('system.speed-test', '/api/speed-test', { scope: 'system:read', remoteAllowed: true, remoteEnabled: remote.speedTest, ratePolicy: 'system-diagnostic' }),
    write('devices.ping', '/api/home-devices/ping', { scope: 'devices:read', remoteAllowed: true, remoteEnabled: remote.devices, bodyLimit: limits.action, ratePolicy: 'device-read' }),
    write('devices.wake', '/api/home-devices/wake', { scope: 'devices:write', remoteAllowed: true, remoteEnabled: remote.devices, bodyLimit: limits.action, ratePolicy: 'device-write' }),
    read('email.unread', '/api/email-unread', { scope: 'email:read', remoteAllowed: true, remoteEnabled: remote.email, ratePolicy: 'email-read' }),
    write('email.message', '/api/email-unread/message', { scope: 'email:read', remoteAllowed: true, remoteEnabled: remote.email, bodyLimit: limits.action, ratePolicy: 'email-read', sideEffect: false }),
    ...['read', 'read-batch', 'delete', 'delete-batch', 'spam', 'spam-batch'].map((action) => write(`email.${action}`, `/api/email-unread/${action}`, { scope: 'email:write', remoteAllowed: true, remoteEnabled: remote.email, bodyLimit: limits.action, ratePolicy: 'email-write' })),
    integrationRead('ebay.read', '/api/ebay-traffic', { remoteEnabled: remote.ebay }),
    integrationRefresh('ebay.refresh', '/api/ebay-traffic/refresh', { remoteEnabled: remote.ebay }),
  ];

  for (const integration of ['facebook-followers', 'facebook-group-members', 'facebook-content', 'instagram-content', 'instagram-followers', 'tiktok-followers', 'youtube-subscribers']) {
    manifest.push(integrationRead(`${integration}.read`, `/api/${integration}`, { remoteEnabled: remote.social }));
    manifest.push(integrationRefresh(`${integration}.refresh`, `/api/${integration}/refresh`, { remoteEnabled: remote.social }));
    manifest.push(integrationRead(`${integration}.health`, `/api/${integration}/health`, { remoteEnabled: remote.social, ratePolicy: 'integration-health' }));
  }
  return Object.freeze(manifest);
}

function resolveRoute(manifest, pathname, method) {
  const matched = manifest.filter((route) => route.matches(pathname));
  const route = matched.find((entry) => entry.method === method) || null;
  return {
    route,
    methods: [...new Set(matched.map((entry) => entry.method))],
  };
}

module.exports = { buildRouteManifest, resolveRoute };
