const tls = require('tls');
const { TextDecoder } = require('util');

function imapQuote(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function createTimeoutError(label) {
  const error = new Error(label);
  error.status = 504;
  return error;
}

function normalizeCharsetLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (!normalized) return 'utf-8';
  const aliases = {
    utf8: 'utf-8',
    usascii: 'us-ascii',
    'us-ascii': 'us-ascii',
    latin1: 'windows-1252',
    'iso-8859-1': 'windows-1252',
    'iso8859-1': 'windows-1252',
    cp1252: 'windows-1252',
    'windows-1252': 'windows-1252',
  };
  return aliases[normalized] || normalized;
}

function decodeWindows1252Buffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const map = {
    0x80: '\u20ac',
    0x82: '\u201a',
    0x83: '\u0192',
    0x84: '\u201e',
    0x85: '\u2026',
    0x86: '\u2020',
    0x87: '\u2021',
    0x88: '\u02c6',
    0x89: '\u2030',
    0x8a: '\u0160',
    0x8b: '\u2039',
    0x8c: '\u0152',
    0x8e: '\u017d',
    0x91: '\u2018',
    0x92: '\u2019',
    0x93: '\u201c',
    0x94: '\u201d',
    0x95: '\u2022',
    0x96: '\u2013',
    0x97: '\u2014',
    0x98: '\u02dc',
    0x99: '\u2122',
    0x9a: '\u0161',
    0x9b: '\u203a',
    0x9c: '\u0153',
    0x9e: '\u017e',
    0x9f: '\u0178',
  };
  let out = '';
  for (const byte of source.values()) {
    out += map[byte] || String.fromCharCode(byte);
  }
  return out;
}

function decodeBufferWithCharset(buffer, charset = 'utf-8') {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const normalizedCharset = normalizeCharsetLabel(charset);
  if (normalizedCharset === 'windows-1252') {
    return decodeWindows1252Buffer(source);
  }
  const tryLabels = [normalizedCharset, 'utf-8', 'windows-1252'];
  for (const label of tryLabels) {
    try {
      const out = new TextDecoder(label, { fatal: false }).decode(source);
      if (out) return out;
    } catch {}
  }
  return source.toString('utf8');
}

function decodeQuotedPrintableToBuffer(value) {
  const source = String(value || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '=' && /^[A-Fa-f0-9]{2}$/.test(source.slice(i + 1, i + 3))) {
      bytes.push(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(source.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

function decodeMimeWords(value) {
  return String(value || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset, encoding, payload) => {
    try {
      const buffer = String(encoding).toUpperCase() === 'B'
        ? Buffer.from(String(payload || ''), 'base64')
        : decodeQuotedPrintableToBuffer(String(payload || '').replace(/_/g, ' '));
      return decodeBufferWithCharset(buffer, charset);
    } catch {
      return String(payload || '');
    }
  });
}

function parseRfc822Headers(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  const headers = {};
  let currentKey = '';

  for (const line of lines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`.trim();
      continue;
    }
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    currentKey = line.slice(0, idx).trim().toLowerCase();
    headers[currentKey] = decodeMimeWords(line.slice(idx + 1).trim());
  }

  return headers;
}

function extractMailboxEmail(value) {
  const source = String(value || '').trim();
  const bracketMatch = source.match(/<([^>]+)>/);
  if (bracketMatch) return bracketMatch[1].trim().toLowerCase();
  const plainMatch = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plainMatch ? plainMatch[0].trim().toLowerCase() : '';
}

function extractMailboxName(value, email = '') {
  const source = decodeMimeWords(String(value || '').trim());
  if (!source) return '';
  if (source.includes('<')) {
    return source.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  }
  if (email && source.toLowerCase() === String(email || '').toLowerCase()) return '';
  return source.replace(/"/g, '').trim();
}

function decodeQuotedPrintable(value) {
  return decodeQuotedPrintableToBuffer(value).toString('latin1');
}

function stripHtmlTags(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '-',
    mdash: '-',
    hellip: '...',
  };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
    const source = String(token || '').toLowerCase();
    if (source.startsWith('#x')) {
      const code = parseInt(source.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (source.startsWith('#')) {
      const code = parseInt(source.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, source) ? named[source] : match;
  });
}

function splitHeaderBody(raw) {
  const source = String(raw || '').replace(/\r\n/g, '\n');
  const match = source.match(/\n\n/);
  if (!match) return { headerText: '', bodyText: source };
  const splitIndex = match.index;
  return {
    headerText: source.slice(0, splitIndex),
    bodyText: source.slice(splitIndex + match[0].length),
  };
}

function parseHeaderParams(value = '') {
  const source = String(value || '').trim();
  if (!source) return { value: '', params: {} };
  const parts = source.split(';');
  const mainValue = String(parts.shift() || '').trim().toLowerCase();
  const params = {};
  parts.forEach((part) => {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) return;
    const key = part.slice(0, eqIndex).trim().toLowerCase();
    const rawValue = part.slice(eqIndex + 1).trim();
    params[key] = rawValue.replace(/^"(.*)"$/, '$1');
  });
  return { value: mainValue, params };
}

function decodeTransferEncodedBody(raw, transferEncoding = '', charset = 'utf-8') {
  const encoding = String(transferEncoding || '').trim().toLowerCase();
  const source = String(raw || '');
  if (!source) return '';

  if (encoding === 'base64') {
    const compact = source.replace(/[^A-Za-z0-9+/=]/g, '');
    if (!compact) return '';
    return decodeBufferWithCharset(Buffer.from(compact, 'base64'), charset);
  }
  if (encoding === 'quoted-printable') {
    return decodeBufferWithCharset(decodeQuotedPrintableToBuffer(source), charset);
  }
  return decodeBufferWithCharset(Buffer.from(source, 'latin1'), charset);
}

function splitMultipartBody(raw, boundary = '') {
  const normalizedBoundary = String(boundary || '').trim();
  if (!normalizedBoundary) return [];
  const source = String(raw || '').replace(/\r\n/g, '\n');
  const marker = `--${normalizedBoundary}`;
  return source
    .split(marker)
    .slice(1)
    .map((part) => part.replace(/^\n/, '').replace(/\n--$/, '').trim())
    .filter((part) => part && part !== '--');
}

function extractBestBodyText(raw, fallbackCharset = 'utf-8') {
  const source = String(raw || '');
  if (!source.trim()) return '';

  const { headerText, bodyText } = splitHeaderBody(source);
  const hasMimeHeaders = /^(content-type|content-transfer-encoding|content-disposition|mime-version):/im.test(headerText);
  const headers = hasMimeHeaders ? parseRfc822Headers(headerText) : {};
  const body = hasMimeHeaders ? bodyText : source;
  const contentType = parseHeaderParams(headers['content-type'] || '');
  const disposition = parseHeaderParams(headers['content-disposition'] || '');
  const charset = contentType.params.charset || fallbackCharset;

  if (disposition.value === 'attachment') return '';

  if (contentType.value.startsWith('multipart/')) {
    const boundary = contentType.params.boundary;
    const parts = splitMultipartBody(body, boundary);
    const rankedParts = parts
      .map((part) => {
        const text = extractBestBodyText(part, charset);
        const partHeaders = parseRfc822Headers(splitHeaderBody(part).headerText);
        const partType = parseHeaderParams(partHeaders['content-type'] || '').value || 'text/plain';
        const score = partType === 'text/plain' ? 3 : partType === 'text/html' ? 2 : 1;
        return { text, score };
      })
      .filter((part) => part.text);
    rankedParts.sort((a, b) => (b.score - a.score) || (b.text.length - a.text.length));
    return rankedParts[0]?.text || '';
  }

  if (contentType.value === 'message/rfc822') {
    return extractBestBodyText(body, charset);
  }

  const decoded = decodeTransferEncodedBody(body, headers['content-transfer-encoding'] || '', charset);
  if (!decoded.trim()) return '';
  if (contentType.value === 'text/html') {
    return decodeHtmlEntities(stripHtmlTags(decoded));
  }
  return decodeHtmlEntities(decoded);
}

function cleanBodyText(raw, options = {}) {
  let text = extractBestBodyText(raw) || String(raw || '');
  if (!text) return '';
  const maxLen = Number.isFinite(Number(options.maxLen)) ? Math.max(0, Number(options.maxLen)) : 0;
  const singleLine = !!options.singleLine;
  text = text.replace(/\r\n/g, '\n');

  text = text
    .replace(/^--[^\n]+$/gm, ' ')
    .replace(/^[>-]{2,}[A-Za-z0-9_-]+.*$/gm, ' ')
    .replace(/^Content-Transfer-Encoding:[^\n]*$/gim, ' ')
    .replace(/^Content-[^\n]*$/gim, ' ')
    .replace(/^MIME-Version:[^\n]*$/gim, ' ')
    .replace(/^boundary=[^\n]*$/gim, ' ')
    .replace(/^charset=[^\n]*$/gim, ' ')
    .replace(/^[A-Za-z0-9+/]{80,}={0,2}$/gm, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/[ \u00a0]+\n/g, '\n');

  if (singleLine) {
    text = text.replace(/\s+/g, ' ').trim();
  } else {
    text = text
      .split('\n')
      .map((line) => line.trim())
      .reduce((lines, line) => {
        if (!line && lines[lines.length - 1] === '') return lines;
        lines.push(line);
        return lines;
      }, [])
      .join('\n')
      .trim();
  }

  if (/^[A-Za-z0-9+/=\s]{80,}$/.test(text) && !/[.!?]/.test(text)) return '';
  return maxLen ? text.slice(0, maxLen) : text;
}

function cleanBodyPreview(raw) {
  return cleanBodyText(raw, { maxLen: 280, singleLine: true });
}

function parseSearchUids(raw) {
  const line = String(raw || '').split('\r\n').find((entry) => /^\* SEARCH\b/i.test(entry));
  if (!line) return [];
  return line
    .replace(/^\* SEARCH\s*/i, '')
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function extractLiteral(raw, tokenPattern) {
  const regex = new RegExp(`${tokenPattern}\\s+\\{(\\d+)\\}\\r\\n`, 'i');
  const match = regex.exec(String(raw || ''));
  if (!match) return '';
  const length = Number(match[1] || 0);
  const start = match.index + match[0].length;
  return String(raw || '').slice(start, start + length);
}

function parseFetchEntry(raw, direction = 'received', options = {}) {
  const source = String(raw || '');
  const headers = parseRfc822Headers(extractLiteral(source, 'BODY\\[HEADER\\.FIELDS \\(SUBJECT FROM TO DATE MESSAGE-ID\\)\\]'));
  const bodyPreview = cleanBodyPreview(extractLiteral(source, 'BODY\\[TEXT\\](?:<0>)?'));
  const counterpartyHeader = direction === 'sent'
    ? (headers.to || headers.from || '')
    : (headers.from || headers.to || '');
  const counterpartyEmail = extractMailboxEmail(counterpartyHeader);
  const counterpartyName = extractMailboxName(counterpartyHeader, counterpartyEmail);
  const issuedSource = headers.date || (source.match(/INTERNALDATE "([^"]+)"/i)?.[1] || '');
  const issuedAtMs = Date.parse(issuedSource);

  return {
    title: decodeMimeWords(headers.subject || 'Untitled message').slice(0, 180),
    summary: bodyPreview,
    counterpartyName: counterpartyName.slice(0, 120),
    counterpartyEmail: counterpartyEmail.slice(0, 160),
    issuedAt: Number.isFinite(issuedAtMs) ? new Date(issuedAtMs).toISOString() : '',
    uid: Number.isFinite(Number(options.uid)) ? Number(options.uid) : null,
    mailbox: String(options.mailbox || '').trim(),
    direction,
  };
}

async function createImapSession({ host, port, timeoutMs }) {
  return await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: true,
    });
    socket.setEncoding('latin1');

    let buffer = '';
    let closed = false;
    let commandIndex = 0;
    let pending = null;
    let connected = false;

    const clearPending = () => {
      if (pending?.timer) clearTimeout(pending.timer);
      pending = null;
    };

    const failPending = (error) => {
      if (!pending) return;
      const target = pending;
      clearPending();
      target.reject(error);
    };

    const checkPending = () => {
      if (!pending) return;
      if (pending.kind === 'line') {
        const lineBreak = buffer.indexOf('\r\n');
        if (lineBreak < 0) return;
        const line = buffer.slice(0, lineBreak);
        buffer = buffer.slice(lineBreak + 2);
        const target = pending;
        clearPending();
        target.resolve(line);
        return;
      }

      const tagRegex = new RegExp(`(?:^|\\r\\n)${pending.tag} (OK|NO|BAD)(?: \\[[^\\r\\n]*\\])?(?: [^\\r\\n]*)?\\r\\n$`, 'i');
      if (!tagRegex.test(buffer)) return;
      const response = buffer;
      buffer = '';
      const target = pending;
      clearPending();
      target.resolve(response);
    };

    const waitFor = (kind, tag = '') => new Promise((resolveWait, rejectWait) => {
      if (pending) {
        rejectWait(new Error('IMAP session does not support parallel commands.'));
        return;
      }
      pending = {
        kind,
        tag,
        resolve: resolveWait,
        reject: rejectWait,
        timer: setTimeout(() => {
          failPending(createTimeoutError(`IMAP ${kind === 'line' ? 'greeting' : `command ${tag}`} timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      checkPending();
    });

    const close = async () => {
      if (closed) return;
      closed = true;
      try {
        socket.end();
      } catch {}
    };

    const command = async (text) => {
      if (closed) throw new Error('IMAP session is already closed.');
      const tag = `A${String(++commandIndex).padStart(4, '0')}`;
      buffer = '';
      socket.write(`${tag} ${text}\r\n`);
      const response = await waitFor('tag', tag);
      const statusMatch = response.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)(?: \\[[^\\r\\n]*\\])?(?: ([^\\r\\n]*))?\\r\\n$`, 'i'));
      const status = String(statusMatch?.[1] || '').toUpperCase();
      if (status !== 'OK') {
        const error = new Error(String(statusMatch?.[2] || `IMAP command failed: ${text}`).trim() || `IMAP command failed: ${text}`);
        error.status = 502;
        throw error;
      }
      return response;
    };

    socket.on('data', (chunk) => {
      buffer += String(chunk || '');
      checkPending();
    });

    socket.on('error', (error) => {
      if (!connected) {
        reject(error);
      } else {
        failPending(error);
      }
    });

    socket.on('end', () => {
      closed = true;
      failPending(new Error('IMAP server closed the connection unexpectedly.'));
    });

    socket.on('secureConnect', async () => {
      connected = true;
      try {
        const greeting = await waitFor('line');
        if (!/^\* OK\b/i.test(String(greeting || ''))) {
          throw new Error(`Unexpected IMAP greeting: ${greeting}`);
        }
        resolve({ command, close });
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });
  });
}

async function selectMailbox(session, mailboxName) {
  await session.command(`SELECT ${imapQuote(mailboxName)}`);
}

async function fetchUnreadCount(session, mailboxName) {
  await selectMailbox(session, mailboxName);
  const response = await session.command('UID SEARCH UNSEEN');
  return parseSearchUids(response).length;
}

async function fetchLatestMailboxEntries(session, mailboxName, limit, direction, searchCriteria = 'ALL') {
  await selectMailbox(session, mailboxName);
  const searchResponse = await session.command(`UID SEARCH ${String(searchCriteria || 'ALL').trim() || 'ALL'}`);
  const uids = parseSearchUids(searchResponse);
  if (!uids.length) return [];

  const targetUids = uids.slice(-Math.max(1, limit)).reverse();
  const entries = [];
  for (const uid of targetUids) {
    const response = await session.command(`UID FETCH ${uid} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID)] BODY.PEEK[TEXT]<0.512>)`);
    entries.push(parseFetchEntry(response, direction, { uid, mailbox: mailboxName }));
  }
  return entries;
}

async function fetchMailboxEntryBody(session, mailboxName, uid) {
  await selectMailbox(session, mailboxName);
  const response = await session.command(`UID FETCH ${uid} (UID BODY.PEEK[])`);
  const fullMessage = extractLiteral(response, 'BODY\\[\\]');
  if (fullMessage) return cleanBodyText(fullMessage);
  return cleanBodyText(extractLiteral(response, 'BODY\\[TEXT\\](?:<0>)?'));
}

async function markMailboxEntryRead(session, mailboxName, uid) {
  await selectMailbox(session, mailboxName);
  await session.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`);
  return true;
}

async function fetchSentMailboxEntries(session, mailboxNames, limit) {
  let lastError = null;
  for (const mailboxName of mailboxNames) {
    if (!mailboxName) continue;
    try {
      const entries = await fetchLatestMailboxEntries(session, mailboxName, limit, 'sent', 'ALL');
      return { entries, mailboxName };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { entries: [], mailboxName: '' };
}

async function fetchGmailImapAccountSnapshot(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const inboxMailbox = String(options.inboxMailbox || 'INBOX').trim() || 'INBOX';
  const includeSent = !!options.includeSent;
  const sentMailboxNames = Array.isArray(options.sentMailboxNames) ? options.sentMailboxNames : ['[Gmail]/Sent Mail', 'Sent Mail', 'Sent'];
  const inboxLimit = Number.isFinite(Number(options.inboxLimit)) ? Math.max(1, Number(options.inboxLimit)) : 5;
  const sentLimit = Number.isFinite(Number(options.sentLimit)) ? Math.max(1, Number(options.sentLimit)) : 5;

  const session = await createImapSession({ host, port, timeoutMs });
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);
    const unreadCount = await fetchUnreadCount(session, inboxMailbox);
    const inboxEntries = await fetchLatestMailboxEntries(session, inboxMailbox, inboxLimit, 'received', 'UNSEEN');
    const recentInboxEntries = await fetchLatestMailboxEntries(session, inboxMailbox, inboxLimit, 'received', 'ALL');
    const sentResult = includeSent
      ? await fetchSentMailboxEntries(session, sentMailboxNames, sentLimit)
      : { entries: [], mailboxName: '' };
    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
      return {
        unreadCount,
        inboxEntries,
        recentInboxEntries,
        sentEntries: sentResult.entries,
        sentMailbox: sentResult.mailboxName,
      };
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function tryMoveToMailboxWithFallback(session, mailbox, uid, targetMailbox) {
  await selectMailbox(session, mailbox);
  try {
    await session.command(`UID MOVE ${uid} ${imapQuote(targetMailbox)}`);
    return true;
  } catch {}

  await session.command(`UID COPY ${uid} ${imapQuote(targetMailbox)}`);
  await session.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
  try {
    await session.command(`UID EXPUNGE ${uid}`);
  } catch {
    await session.command('EXPUNGE');
  }
  return true;
}

async function moveGmailImapMessageToTrash(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const mailbox = String(options.mailbox || '').trim();
  const uid = Number(options.uid);
  const trashMailboxNames = Array.isArray(options.trashMailboxNames) ? options.trashMailboxNames : ['[Gmail]/Trash', 'Trash'];

  if (!mailbox) {
    const error = new Error('Mailbox is required.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);

    let lastError = null;
    for (const trashMailbox of trashMailboxNames) {
      if (!trashMailbox) continue;
      try {
        await tryMoveToMailboxWithFallback(session, mailbox, uid, trashMailbox);
        try {
          await session.command('LOGOUT');
        } catch {}
        await session.close();
        return {
          ok: true,
          mailbox,
          uid,
          trashMailbox,
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    const error = new Error('Unable to find a Gmail Trash mailbox.');
    error.status = 502;
    throw error;
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function moveGmailImapMessageToSpam(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const mailbox = String(options.mailbox || '').trim();
  const uid = Number(options.uid);
  const spamMailboxNames = Array.isArray(options.spamMailboxNames) ? options.spamMailboxNames : ['[Gmail]/Spam', 'Spam', 'Junk'];

  if (!mailbox) {
    const error = new Error('Mailbox is required.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);

    let lastError = null;
    for (const spamMailbox of spamMailboxNames) {
      if (!spamMailbox) continue;
      try {
        await tryMoveToMailboxWithFallback(session, mailbox, uid, spamMailbox);
        try {
          await session.command('LOGOUT');
        } catch {}
        await session.close();
        return {
          ok: true,
          mailbox,
          uid,
          spamMailbox,
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;
    const error = new Error('Unable to find a Gmail Spam mailbox.');
    error.status = 502;
    throw error;
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function markGmailImapMessageRead(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const mailbox = String(options.mailbox || '').trim();
  const uid = Number(options.uid);

  if (!mailbox) {
    const error = new Error('Mailbox is required.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);
    await markMailboxEntryRead(session, mailbox, uid);
    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
    return {
      ok: true,
      mailbox,
      uid,
    };
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function fetchGmailImapMessageBody(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const mailbox = String(options.mailbox || '').trim();
  const uid = Number(options.uid);

  if (!mailbox) {
    const error = new Error('Mailbox is required.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);
    const bodyText = await fetchMailboxEntryBody(session, mailbox, uid);
    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
    return {
      ok: true,
      mailbox,
      uid,
      bodyText,
    };
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function moveGmailImapMessagesToTrash(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const trashMailboxNames = Array.isArray(options.trashMailboxNames) ? options.trashMailboxNames : ['[Gmail]/Trash', 'Trash'];
  const rawItems = Array.isArray(options.items) ? options.items : [];
  const items = rawItems
    .map((item) => ({
      mailbox: String(item?.mailbox || '').trim(),
      uid: Number(item?.uid),
    }))
    .filter((item) => item.mailbox && Number.isFinite(item.uid) && item.uid > 0);

  if (!items.length) {
    const error = new Error('At least one mailbox item is required.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  const movedItems = [];
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);

    for (const item of items) {
      let itemMoved = false;
      let lastError = null;
      for (const trashMailbox of trashMailboxNames) {
        if (!trashMailbox) continue;
        try {
          await tryMoveToMailboxWithFallback(session, item.mailbox, item.uid, trashMailbox);
          movedItems.push({
            mailbox: item.mailbox,
            uid: item.uid,
            trashMailbox,
          });
          itemMoved = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!itemMoved) {
        const error = lastError || new Error('Unable to find a Gmail Trash mailbox.');
        error.movedItems = movedItems.slice();
        throw error;
      }
    }

    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
    return {
      ok: true,
      items: movedItems,
    };
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function moveGmailImapMessagesToSpam(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const spamMailboxNames = Array.isArray(options.spamMailboxNames) ? options.spamMailboxNames : ['[Gmail]/Spam', 'Spam', 'Junk'];
  const rawItems = Array.isArray(options.items) ? options.items : [];
  const items = rawItems
    .map((item) => ({
      mailbox: String(item?.mailbox || '').trim(),
      uid: Number(item?.uid),
    }))
    .filter((item) => item.mailbox && Number.isFinite(item.uid) && item.uid > 0);

  if (!items.length) {
    const error = new Error('At least one mailbox item is required.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  const movedItems = [];
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);

    for (const item of items) {
      let itemMoved = false;
      let lastError = null;
      for (const spamMailbox of spamMailboxNames) {
        if (!spamMailbox) continue;
        try {
          await tryMoveToMailboxWithFallback(session, item.mailbox, item.uid, spamMailbox);
          movedItems.push({
            mailbox: item.mailbox,
            uid: item.uid,
            spamMailbox,
          });
          itemMoved = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!itemMoved) {
        const error = lastError || new Error('Unable to find a Gmail Spam mailbox.');
        error.movedItems = movedItems.slice();
        throw error;
      }
    }

    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
    return {
      ok: true,
      items: movedItems,
    };
  } catch (error) {
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

async function markGmailImapMessagesRead(options = {}) {
  const host = String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com';
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const rawItems = Array.isArray(options.items) ? options.items : [];
  const items = rawItems
    .map((item) => ({
      mailbox: String(item?.mailbox || '').trim(),
      uid: Number(item?.uid),
    }))
    .filter((item) => item.mailbox && Number.isFinite(item.uid) && item.uid > 0);

  if (!items.length) {
    const error = new Error('At least one mailbox item is required.');
    error.status = 400;
    throw error;
  }

  const session = await createImapSession({ host, port, timeoutMs });
  const updatedItems = [];
  try {
    await session.command(`LOGIN ${imapQuote(options.username)} ${imapQuote(options.password)}`);

    for (const item of items) {
      await markMailboxEntryRead(session, item.mailbox, item.uid);
      updatedItems.push({
        mailbox: item.mailbox,
        uid: item.uid,
      });
    }

    try {
      await session.command('LOGOUT');
    } catch {}
    await session.close();
    return {
      ok: true,
      items: updatedItems,
    };
  } catch (error) {
    error.updatedItems = updatedItems.slice();
    try {
      await session.close();
    } catch {}
    throw error;
  }
}

module.exports = {
  cleanBodyText,
  fetchGmailImapMessageBody,
  fetchGmailImapAccountSnapshot,
  markGmailImapMessagesRead,
  markGmailImapMessageRead,
  moveGmailImapMessagesToSpam,
  moveGmailImapMessageToSpam,
  moveGmailImapMessageToTrash,
  moveGmailImapMessagesToTrash,
};
