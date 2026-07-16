import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cleanBodyText } = require('../lib/email-imap.js');

const quotedPrintableMultipart = [
  'Content-Type: multipart/alternative; boundary="mail-boundary"',
  'MIME-Version: 1.0',
  '',
  '--mail-boundary',
  'Content-Type: text/plain; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Hi Jacob,',
  '',
  'Here=E2=80=99s the update you asked for.',
  '',
  'Thanks,',
  'Rowan',
  '--mail-boundary',
  'Content-Type: text/html; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<div>Hi Jacob,</div><div>Here=E2=80=99s the <b>HTML</b> version.</div>',
  '--mail-boundary--',
].join('\r\n');

const windows1252Base64 = [
  'Content-Type: text/plain; charset="windows-1252"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from([
    ...Buffer.from('Price dropped from $24 to $19 ', 'latin1'),
    0x96,
    ...Buffer.from(' don\x92t miss it.', 'latin1'),
  ]).toString('base64'),
].join('\r\n');

const htmlOnly = [
  'Content-Type: text/html; charset="utf-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<div>Hello&nbsp;there</div><div>Line two &amp; more.</div>',
].join('\r\n');

assert.equal(
  cleanBodyText(quotedPrintableMultipart),
  "Hi Jacob,\n\nHere’s the update you asked for.\n\nThanks,\nRowan"
);

assert.equal(
  cleanBodyText(windows1252Base64),
  "Price dropped from $24 to $19 – don’t miss it."
);

assert.equal(
  cleanBodyText(htmlOnly),
  'Hello there\nLine two & more.'
);

assert.equal(
  cleanBodyText(quotedPrintableMultipart, { maxLen: 18, singleLine: true }),
  "Hi Jacob, Here’s t"
);

console.log('email-imap-body-cleaning: PASS');
