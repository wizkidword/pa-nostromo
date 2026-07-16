import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { createTempRuntime } from './helpers/temp-runtime.mjs';

function wait(ms){ return new Promise((resolve) => setTimeout(resolve, ms)); }

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function startStubMailServer() {
  const routes = {
    '/feed/primary': {
      expectedAuth: `Basic ${Buffer.from('primary@gmail.com:primarypass', 'utf8').toString('base64')}`,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>Gmail - Inbox for primary@gmail.com</title>
  <fullcount>4</fullcount>
  <entry>
    <title>Primary alert</title>
    <summary>First account item</summary>
    <issued>2026-04-10T14:22:00Z</issued>
    <author>
      <name>Launch Ops</name>
      <email>alerts@example.com</email>
    </author>
    <link rel="alternate" href="https://mail.google.com/mail/u/0/#inbox/primary-1" />
  </entry>
</feed>`,
    },
    '/feed/work': {
      expectedAuth: `Basic ${Buffer.from('work@gmail.com:workpass', 'utf8').toString('base64')}`,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
  <title>Gmail - Inbox for work@gmail.com</title>
  <fullcount>6</fullcount>
  <entry>
    <title>Work brief</title>
    <summary>Second account item</summary>
    <issued>2026-04-10T15:10:00Z</issued>
    <author>
      <name>Studio Team</name>
      <email>team@example.com</email>
    </author>
    <link rel="alternate" href="https://mail.google.com/mail/u/1/#inbox/work-1" />
  </entry>
</feed>`,
    },
  };

  const server = http.createServer((req, res) => {
    const route = routes[req.url || ''];
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    if (req.headers.authorization !== route.expectedAuth) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('unauthorized');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/atom+xml; charset=utf-8' });
    res.end(route.body);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('stub mail server did not expose a TCP port');
  }

  return {
    server,
    port: address.port,
  };
}

async function waitForAppServer(port, timeoutMs = 8000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/email-unread`);
      if (response.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error('app server did not start in time');
}

async function main(){
  const stub = await startStubMailServer();
  const runtime = await createTempRuntime('nostromo-email-api-');
  const appPort = await getAvailablePort();
  const accounts = [
    {
      label: 'Primary',
      username: 'primary@gmail.com',
      appPassword: 'primary pass',
      feedUrl: `http://127.0.0.1:${stub.port}/feed/primary`,
      openUrl: 'https://mail.google.com/mail/u/0/#inbox',
    },
    {
      label: 'Work',
      username: 'work@gmail.com',
      appPassword: 'work pass',
      feedUrl: `http://127.0.0.1:${stub.port}/feed/work`,
      openUrl: 'https://mail.google.com/mail/u/1/#inbox',
    },
    {
      label: 'Personal',
      username: 'personal@gmail.com',
      appPassword: '',
      openUrl: 'https://mail.google.com/mail/u/2/#inbox',
    },
  ];

  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(appPort),
      DATA_DIR: runtime.dataDir,
      LOG_DIR: runtime.logDir,
      NOSTROMO_DISABLE_BACKGROUND_SERVICES: '1',
      EMAIL_UNREAD_ALLOW_REMOTE: '1',
      EMAIL_UNREAD_PROVIDER: 'gmail_atom',
      EMAIL_UNREAD_ACCOUNTS_JSON: JSON.stringify(accounts),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForAppServer(appPort);

    const response = await fetch(`http://127.0.0.1:${appPort}/api/email-unread`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.accountCount, 3);
    assert.equal(payload.healthyAccountCount, 2);
    assert.equal(payload.partialFailure, true);
    assert.equal(payload.setupRequired, false);
    assert.equal(payload.unreadCount, 10);
    assert.equal(Array.isArray(payload.accounts), true);
    assert.equal(payload.accounts.length, 3);
    assert.deepEqual(
      payload.accounts.map((account) => ({
        label: account.label,
        status: account.status,
        unreadCount: account.unreadCount,
      })),
      [
        { label: 'Primary', status: 'fresh', unreadCount: 4 },
        { label: 'Work', status: 'fresh', unreadCount: 6 },
        { label: 'Personal', status: 'setup', unreadCount: null },
      ]
    );
    assert.equal(payload.entries.length, 2);
    assert.equal(payload.entries[0].accountLabel, 'Work');
    assert.equal(payload.entries[0].accountEmail, 'work@gmail.com');
    assert.equal(payload.entries[1].accountLabel, 'Primary');
    assert.equal(payload.entries[1].accountEmail, 'primary@gmail.com');

    console.log('email-unread-multi-account-api: PASS');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => stub.server.close(resolve));
    await runtime.cleanup();
  }
}

main().catch((error) => {
  console.error('email-unread-multi-account-api: FAIL', error);
  process.exitCode = 1;
});
