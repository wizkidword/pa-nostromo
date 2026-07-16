import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authorizeLocalOrToken } = require('../server.js');

function createMockResponse() {
  const res = {
    statusCode: 0,
    headers: null,
    body: '',
    writableEnded: false,
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = String(body);
      this.writableEnded = true;
    },
  };
  return res;
}

{
  const res = createMockResponse();
  const allowed = authorizeLocalOrToken(
    { socket: { remoteAddress: '127.0.0.1' }, headers: {} },
    res,
    { allowRemote: false, requireToken: true, routeLabel: 'State API' }
  );
  assert.equal(allowed, true);
  assert.equal(res.writableEnded, false);
}

{
  const res = createMockResponse();
  const allowed = authorizeLocalOrToken(
    { socket: { remoteAddress: '192.168.1.20' }, headers: {} },
    res,
    { allowRemote: false, requireToken: true, routeLabel: 'State API' }
  );
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body, /local_only/);
}

{
  const res = createMockResponse();
  const allowed = authorizeLocalOrToken(
    { socket: { remoteAddress: '192.168.1.20' }, headers: {} },
    res,
    { allowRemote: true, requireToken: true, routeLabel: 'State API' }
  );
  assert.equal(allowed, false);
  assert.ok([401, 403].includes(res.statusCode));
  assert.match(res.body, /remote_token_not_configured|auth_required/);
}

console.log('state-api-local-only: PASS');
