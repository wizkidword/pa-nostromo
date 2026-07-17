import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createRequestId,
  createPublicErrorPayload,
  redactDiagnostic,
  logDiagnostic,
} = require('../lib/observability.js');
const { server } = require('../server.js');

const suppliedRequestId = 'client-request-20260716';
assert.equal(createRequestId({ 'x-request-id': suppliedRequestId }), suppliedRequestId);
assert.match(createRequestId({ 'x-request-id': 'not valid' }), /^req_[a-f0-9]{32}$/);

const publicError = createPublicErrorPayload(502, {
  error: 'integration_failed',
  message: 'Bearer sensitive-token from C:\\private\\settings.json',
  details: { accountId: 'personal-account' },
}, suppliedRequestId);
assert.deepEqual(publicError, {
  ok: false,
  error: 'integration_failed',
  message: 'The service could not complete the request.',
  requestId: suppliedRequestId,
});

const diagnostic = redactDiagnostic({
  authorization: 'Bearer sensitive-token',
  cookie: 'session=private-value',
  appPassword: 'email-app-password',
  emailBody: 'private email body',
  oauthUrl: 'https://user:password@example.test/callback?access_token=sensitive-token',
  nested: { error: new Error('Failure at C:\\private\\settings.json and /opt/nostromo/config.json with Bearer sensitive-token') },
});
const diagnosticText = JSON.stringify(diagnostic);
for (const secret of ['sensitive-token', 'private-value', 'email-app-password', 'private email body', 'password', 'C:\\private\\settings.json', '/opt/nostromo/config.json']) {
  assert.equal(diagnosticText.includes(secret), false, `diagnostic must redact ${secret}`);
}
assert.equal('stack' in diagnostic.nested.error, false, 'diagnostics must not serialize error stacks');

const records = [];
logDiagnostic('test_event', { authorization: 'Bearer sensitive-token' }, (line) => records.push(line));
assert.equal(records.length, 1);
assert.equal(records[0].includes('sensitive-token'), false);
assert.match(records[0], /"event":"test_event"/);

async function listenRandom() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not expose a random port');
  return address.port;
}

async function closeServer() {
  await new Promise((resolve) => server.close(resolve));
}

const port = await listenRandom();
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`, {
    headers: { 'X-Request-ID': suppliedRequestId },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-request-id'), suppliedRequestId);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'not_found',
    message: 'The requested resource was not found.',
    requestId: suppliedRequestId,
  });

  const staticResponse = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'X-Request-ID': suppliedRequestId },
  });
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get('x-request-id'), suppliedRequestId, 'static responses retain the request ID');
} finally {
  await closeServer();
}

console.log('observability: PASS');
