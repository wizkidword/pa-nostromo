import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createTempRuntime } from './helpers/temp-runtime.mjs';

const require = createRequire(import.meta.url);
const { createBoundedJsonlLogWriter, configureDiagnosticLogSink, logDiagnostic } = require('../lib/observability.js');

const runtime = await createTempRuntime('nostromo-bounded-logs-');
try {
  const logPath = path.join(runtime.logDir, 'diagnostics.jsonl');
  const writer = createBoundedJsonlLogWriter({
    filePath: logPath,
    maxBytes: 180,
    maxFiles: 3,
    onFailure: () => assert.fail('the writable test log must not report a failure'),
  });

  for (let index = 0; index < 12; index += 1) {
    assert.equal(await writer.write({ event: 'poll', index, note: 'bounded-log-entry-1234567890' }), true);
  }
  assert.equal(await writer.write({
    event: 'sensitive_record',
    state: { imported: 'must-not-be-written' },
    emailBody: 'private message body',
    accountId: 'private-account-id',
  }), true);

  const names = (await fsp.readdir(runtime.logDir))
    .filter((name) => /^diagnostics(?:\.\d+)?\.jsonl$/.test(name))
    .sort();
  assert.equal(names.length, 3, 'active log plus the two newest archives must be retained');
  assert.deepEqual(names, ['diagnostics.1.jsonl', 'diagnostics.2.jsonl', 'diagnostics.jsonl']);

  const persisted = [];
  for (const name of names) {
    const filePath = path.join(runtime.logDir, name);
    const raw = await fsp.readFile(filePath, 'utf8');
    assert.ok((await fsp.stat(filePath)).size <= 180, `${name} must stay within the rotation limit`);
    persisted.push(...raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  }
  assert.ok(persisted.some((entry) => entry.index === 11), 'the most recent record must survive rotation');
  assert.equal(persisted.some((entry) => entry.index === 0), false, 'old records must be removed by retention');
  const persistedText = JSON.stringify(persisted);
  for (const secret of ['must-not-be-written', 'private message body', 'private-account-id']) {
    assert.equal(persistedText.includes(secret), false, `persisted logs must redact ${secret}`);
  }

  const centralPath = path.join(runtime.logDir, 'server-diagnostics.jsonl');
  const centralSink = configureDiagnosticLogSink({ filePath: centralPath, maxBytes: 180, maxFiles: 2 });
  logDiagnostic('central_diagnostic_written', { authorization: 'Bearer diagnostic-secret' }, () => {});
  await centralSink.writeQueue;
  const centralText = await fsp.readFile(centralPath, 'utf8');
  assert.match(centralText, /central_diagnostic_written/);
  assert.equal(centralText.includes('diagnostic-secret'), false, 'central diagnostics must use the same redaction and writer');
  configureDiagnosticLogSink();

  const blockedDirectory = path.join(runtime.root, 'not-a-directory');
  await fsp.writeFile(blockedDirectory, 'blocked', 'utf8');
  const failures = [];
  const failingWriter = createBoundedJsonlLogWriter({
    filePath: path.join(blockedDirectory, 'diagnostics.jsonl'),
    onFailure: (entry) => failures.push(entry),
  });
  assert.equal(await failingWriter.write({ event: 'will_not_crash' }), false, 'log write failures must be contained');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].level, 'warn');
  assert.equal(failures[0].event, 'bounded_log_write_failed');
} finally {
  await runtime.cleanup();
}

console.log('bounded-log-retention: PASS');
