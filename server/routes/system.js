'use strict';

function createSystemResourcesApiHandler({ sendJson, parseAllowlistInput, sampleSystemResources }) {
  return async function handleApiSystemResources(req, res) {
    const requestUrl = new URL(req.url || '/api/system-resources', 'http://localhost');
    const allowlist = parseAllowlistInput(requestUrl.searchParams.get('allowlist') || '');
    return sendJson(res, 200, await sampleSystemResources({ allowlist }));
  };
}

module.exports = { createSystemResourcesApiHandler };
