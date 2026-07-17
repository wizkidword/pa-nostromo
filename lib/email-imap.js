const tls = require('tls');
const { TextDecoder } = require('util');

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 32 * 1024;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_REQUEST = 50;

function createImapInputError(label) {
  const error = new Error(`${label} contains unsupported control characters.`);
  error.status = 400;
  error.code = 'invalid_imap_argument';
  return error;
}

function assertSafeImapArgument(value, label = 'IMAP argument') {
  const source = String(value ?? '');
  if (/[\u0000-\u001f\u007f]/.test(source)) throw createImapInputError(label);
  return source;
}

function normalizeMailbox(value, label = 'Mailbox') {
  const mailbox = assertSafeImapArgument(value, label).trim();
  if (!mailbox) {
    const error = new Error(`${label} is required.`);
    error.status = 400;
    throw error;
  }
  return mailbox;
}

function normalizeUid(value) {
  const uid = Number(value);
  if (!Number.isSafeInteger(uid) || uid <= 0) {
    const error = new Error('UID must be a positive integer.');
    error.status = 400;
    throw error;
  }
  return uid;
}

function imapQuote(value, label = 'IMAP argument') {
  const safeValue = assertSafeImapArgument(value, label);
  return `"${safeValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
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

function extractLiteral(raw, tokenPattern, options = {}) {
  const regex = new RegExp(`${tokenPattern}\\s+\\{(\\d+)\\}\\r\\n`, 'i');
  const match = regex.exec(String(raw || ''));
  const detail = !!options.detail;
  if (!match) return detail ? { value: '', declaredLength: 0, truncated: false } : '';
  const length = Number(match[1] || 0);
  const start = match.index + match[0].length;
  const maxBytes = Number.isFinite(Number(options.maxBytes))
    ? Math.max(0, Number(options.maxBytes))
    : length;
  const allowedLength = Math.min(length, maxBytes);
  const value = String(raw || '').slice(start, start + allowedLength);
  if (detail) {
    return {
      value,
      declaredLength: length,
      truncated: length > allowedLength || value.length < Math.min(length, allowedLength),
    };
  }
  return value;
}

function parseFetchEntry(raw, direction = 'received', options = {}) {
  const source = String(raw || '');
  const headers = parseRfc822Headers(extractLiteral(source, 'BODY\\[HEADER\\.FIELDS \\(SUBJECT FROM TO DATE MESSAGE-ID\\)\\]', { maxBytes: DEFAULT_MAX_HEADER_BYTES }));
  const bodyPreview = cleanBodyPreview(extractLiteral(source, 'BODY\\[TEXT\\](?:<0>)?', { maxBytes: 512 }));
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

async function createImapSession({ host, port, timeoutMs, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES }) {
  return await new Promise((resolve, reject) => {
    assertSafeImapArgument(host, 'IMAP host');
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
      assertSafeImapArgument(text, 'IMAP command');
      const tag = `A${String(++commandIndex).padStart(4, '0')}`;
      buffer = '';
      socket.write(`${tag} ${text}\r\n`);
      const response = await waitFor('tag', tag);
      const statusMatch = response.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)(?: \\[[^\\r\\n]*\\])?(?: ([^\\r\\n]*))?\\r\\n$`, 'i'));
      const status = String(statusMatch?.[1] || '').toUpperCase();
      if (status !== 'OK') {
        const error = new Error(String(statusMatch?.[2] || 'IMAP command failed.').trim() || 'IMAP command failed.');
        error.status = 502;
        error.imapStatus = status;
        throw error;
      }
      return response;
    };

    socket.on('data', (chunk) => {
      buffer += String(chunk || '');
      if (Buffer.byteLength(buffer, 'latin1') > maxResponseBytes) {
        const error = new Error(`IMAP response exceeded the ${maxResponseBytes}-byte limit.`);
        error.status = 502;
        error.code = 'imap_response_too_large';
        closed = true;
        try { socket.destroy(); } catch {}
        failPending(error);
        return;
      }
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
  const mailbox = normalizeMailbox(mailboxName);
  await session.command(`SELECT ${imapQuote(mailbox, 'Mailbox')}`);
  return mailbox;
}

function parseCapabilities(raw) {
  const capabilities = new Set();
  String(raw || '').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\*\s+CAPABILITY\s+(.+)$/i);
    if (!match) return;
    match[1].trim().split(/\s+/).forEach((capability) => {
      if (capability) capabilities.add(capability.toUpperCase());
    });
  });
  return capabilities;
}

async function discoverCapabilities(session) {
  return parseCapabilities(await session.command('CAPABILITY'));
}

function clampMessageLimit(value, fallback = 5) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(MAX_MESSAGES_PER_REQUEST, Math.max(1, Math.floor(parsed)))
    : fallback;
}

function splitFetchResponses(raw) {
  return String(raw || '')
    .split(/\r\n(?=\*\s+\d+\s+FETCH\s+\()/i)
    .filter((entry) => /^\*\s+\d+\s+FETCH\s+\(/i.test(entry));
}

async function fetchMailboxEntriesForUids(session, mailboxName, uids, limit, direction) {
  const mailbox = normalizeMailbox(mailboxName);
  const targetUids = [...new Set((Array.isArray(uids) ? uids : [])
    .map((uid) => Number(uid))
    .filter((uid) => Number.isSafeInteger(uid) && uid > 0))]
    .slice(-clampMessageLimit(limit))
    .reverse();
  if (!targetUids.length) return [];

  const response = await session.command(`UID FETCH ${targetUids.join(',')} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID)] BODY.PEEK[TEXT]<0.512>)`);
  const entriesByUid = new Map();
  splitFetchResponses(response).forEach((entryResponse) => {
    const uid = Number(entryResponse.match(/\bUID\s+(\d+)\b/i)?.[1]);
    if (targetUids.includes(uid)) {
      entriesByUid.set(uid, parseFetchEntry(entryResponse, direction, { uid, mailbox }));
    }
  });
  if (targetUids.length === 1 && !entriesByUid.size) {
    entriesByUid.set(targetUids[0], parseFetchEntry(response, direction, { uid: targetUids[0], mailbox }));
  }
  return targetUids.map((uid) => entriesByUid.get(uid)).filter(Boolean);
}

function preferredBodySection(bodyStructure = '') {
  const source = String(bodyStructure || '');
  if (/"TEXT"\s+"PLAIN"/i.test(source)) return '1';
  if (/"TEXT"\s+"HTML"/i.test(source)) return '1';
  return 'TEXT';
}

function extractAttachmentMetadata(raw = '') {
  const attachmentMetadata = [];
  const seen = new Set();
  const matcher = /(?:FILENAME|NAME)\s*=?\s*"?([^"()\r\n;]{1,180})/gi;
  let match;
  while ((match = matcher.exec(String(raw || ''))) && attachmentMetadata.length < 20) {
    const fileName = match[1].trim();
    const key = fileName.toLowerCase();
    if (!fileName || seen.has(key)) continue;
    seen.add(key);
    attachmentMetadata.push({ fileName });
  }
  return attachmentMetadata;
}

async function fetchMailboxEntryBody(session, mailboxName, uid, options = {}) {
  const mailbox = await selectMailbox(session, mailboxName);
  const safeUid = normalizeUid(uid);
  const maxBodyBytes = Number.isFinite(Number(options.maxBodyBytes))
    ? Math.min(DEFAULT_MAX_BODY_BYTES, Math.max(1024, Number(options.maxBodyBytes)))
    : DEFAULT_MAX_BODY_BYTES;
  const structureResponse = await session.command(`UID FETCH ${safeUid} (UID BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (CONTENT-TYPE CONTENT-DISPOSITION CONTENT-TRANSFER-ENCODING)])`);
  const bodyPart = preferredBodySection(structureResponse);
  const sectionPattern = bodyPart === 'TEXT'
    ? 'BODY\\[TEXT\\](?:<0>)?'
    : `BODY\\[${bodyPart.replace('.', '\\\\.') }\\](?:<0>)?`;
  const bodyResponse = await session.command(`UID FETCH ${safeUid} (UID BODY.PEEK[${bodyPart}]<0.${maxBodyBytes}>)`);
  const literal = extractLiteral(bodyResponse, sectionPattern, { maxBytes: maxBodyBytes, detail: true });
  return {
    mailbox,
    uid: safeUid,
    bodyText: cleanBodyText(literal.value, { maxLen: maxBodyBytes }),
    bodyTruncated: literal.truncated || literal.declaredLength >= maxBodyBytes,
    bodyPart,
    attachmentMetadata: extractAttachmentMetadata(structureResponse),
  };
}

async function markMailboxEntryRead(session, mailboxName, uid) {
  const mailbox = await selectMailbox(session, mailboxName);
  const safeUid = normalizeUid(uid);
  await session.command(`UID STORE ${safeUid} +FLAGS.SILENT (\\Seen)`);
  return { mailbox, uid: safeUid, status: 'updated' };
}

async function fetchSentMailboxEntries(session, mailboxNames, limit) {
  let lastError = null;
  for (const mailboxName of mailboxNames) {
    if (!mailboxName) continue;
    try {
      const mailbox = await selectMailbox(session, mailboxName);
      const response = await session.command('UID SEARCH ALL');
      const entries = await fetchMailboxEntriesForUids(session, mailbox, parseSearchUids(response), limit, 'sent');
      return { entries, mailboxName };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return { entries: [], mailboxName: '' };
}

async function openLoggedInSession(options = {}) {
  const host = assertSafeImapArgument(String(options.host || 'imap.gmail.com').trim() || 'imap.gmail.com', 'IMAP host');
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 993;
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8000;
  const session = options.session || (typeof options.sessionFactory === 'function'
    ? await options.sessionFactory({ host, port, timeoutMs })
    : await createImapSession({ host, port, timeoutMs, maxResponseBytes: options.maxResponseBytes }));
  if (!session || typeof session.command !== 'function') throw new Error('Unable to open an IMAP session.');
  await session.command(`LOGIN ${imapQuote(options.username, 'IMAP username')} ${imapQuote(options.password, 'IMAP password')}`);
  return { session, capabilities: await discoverCapabilities(session) };
}

async function closeLoggedInSession(session) {
  if (!session) return;
  try { await session.command('LOGOUT'); } catch {}
  try { await session.close?.(); } catch {}
}

async function fetchGmailImapAccountSnapshot(options = {}) {
  const inboxMailbox = normalizeMailbox(options.inboxMailbox || 'INBOX');
  const includeSent = !!options.includeSent;
  const sentMailboxNames = Array.isArray(options.sentMailboxNames) ? options.sentMailboxNames : ['[Gmail]/Sent Mail', 'Sent Mail', 'Sent'];
  const inboxLimit = clampMessageLimit(options.inboxLimit);
  const sentLimit = clampMessageLimit(options.sentLimit);

  let session;
  try {
    ({ session } = await openLoggedInSession(options));
    await selectMailbox(session, inboxMailbox);
    const unreadUids = parseSearchUids(await session.command('UID SEARCH UNSEEN'));
    const allUids = parseSearchUids(await session.command('UID SEARCH ALL'));
    const unreadCount = unreadUids.length;
    const inboxEntries = await fetchMailboxEntriesForUids(session, inboxMailbox, unreadUids, inboxLimit, 'received');
    const recentInboxEntries = await fetchMailboxEntriesForUids(session, inboxMailbox, allUids, inboxLimit, 'received');
    const sentResult = includeSent
      ? await fetchSentMailboxEntries(session, sentMailboxNames, sentLimit)
      : { entries: [], mailboxName: '' };
    return {
      unreadCount,
      inboxEntries,
      recentInboxEntries,
      sentEntries: sentResult.entries,
      sentMailbox: sentResult.mailboxName,
    };
  } finally {
    await closeLoggedInSession(session);
  }
}

async function fetchMessageIdentity(session, mailbox, uid) {
  await selectMailbox(session, mailbox);
  const response = await session.command(`UID FETCH ${uid} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])`);
  const messageId = String(parseRfc822Headers(extractLiteral(response, 'BODY\\[HEADER\\.FIELDS \\(MESSAGE-ID\\)\\]', { maxBytes: DEFAULT_MAX_HEADER_BYTES }))['message-id'] || '').trim();
  return messageId && !/[\u0000-\u001f\u007f]/.test(messageId) ? messageId.slice(0, 512) : '';
}

async function targetHasMessageIdentity(session, targetMailbox, messageId) {
  if (!messageId) return false;
  await selectMailbox(session, targetMailbox);
  const response = await session.command(`UID SEARCH HEADER MESSAGE-ID ${imapQuote(messageId, 'Message-ID')}`);
  return parseSearchUids(response).length > 0;
}

async function moveMailboxEntry(session, capabilities, mailboxName, uid, targetMailboxName) {
  const mailbox = normalizeMailbox(mailboxName);
  const targetMailbox = normalizeMailbox(targetMailboxName, 'Target mailbox');
  const safeUid = normalizeUid(uid);
  if (capabilities.has('MOVE')) {
    await selectMailbox(session, mailbox);
    try {
      await session.command(`UID MOVE ${safeUid} ${imapQuote(targetMailbox, 'Target mailbox')}`);
    } catch (error) {
      error.mutationStarted = !['NO', 'BAD'].includes(error?.imapStatus);
      throw error;
    }
    return { mailbox, uid: safeUid, targetMailbox, status: 'moved', moved: true, copied: false, markedDeleted: false, expunged: false, expungeDeferred: false, alreadyComplete: false };
  }

  const messageId = await fetchMessageIdentity(session, mailbox, safeUid);
  const alreadyCopied = messageId ? await targetHasMessageIdentity(session, targetMailbox, messageId) : false;
  await selectMailbox(session, mailbox);
  let mutationStarted = alreadyCopied;
  const canUidExpunge = capabilities.has('UIDPLUS');
  try {
    if (!alreadyCopied) {
      mutationStarted = true;
      await session.command(`UID COPY ${safeUid} ${imapQuote(targetMailbox, 'Target mailbox')}`);
    }
    mutationStarted = true;
    await session.command(`UID STORE ${safeUid} +FLAGS.SILENT (\\Deleted)`);
    if (canUidExpunge) {
      mutationStarted = true;
      await session.command(`UID EXPUNGE ${safeUid}`);
    }
  } catch (error) {
    error.mutationStarted = mutationStarted;
    throw error;
  }
  return {
    mailbox,
    uid: safeUid,
    targetMailbox,
    status: canUidExpunge ? (alreadyCopied ? 'completed_after_retry' : 'copied_and_expunged') : 'expunge_deferred',
    moved: false,
    copied: !alreadyCopied,
    markedDeleted: true,
    expunged: canUidExpunge,
    expungeDeferred: !canUidExpunge,
    alreadyComplete: alreadyCopied,
    messageId: messageId || undefined,
  };
}

function normalizeBatchItems(rawItems = []) {
  const seen = new Set();
  const items = [];
  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    const mailbox = normalizeMailbox(item?.mailbox);
    const uid = normalizeUid(item?.uid);
    const key = `${mailbox.toLowerCase()}::${uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ mailbox, uid });
  }
  if (!items.length) {
    const error = new Error('At least one mailbox item is required.');
    error.status = 400;
    throw error;
  }
  if (items.length > MAX_MESSAGES_PER_REQUEST) {
    const error = new Error(`A batch can contain at most ${MAX_MESSAGES_PER_REQUEST} messages.`);
    error.status = 400;
    throw error;
  }
  return items;
}

function normalizeTargetMailboxNames(values, fallback) {
  const candidates = (Array.isArray(values) ? values : fallback)
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => normalizeMailbox(value, 'Target mailbox'));
  const uniqueCandidates = [...new Set(candidates)];
  if (!uniqueCandidates.length) {
    const error = new Error('At least one target mailbox is required.');
    error.status = 400;
    throw error;
  }
  return uniqueCandidates;
}

async function moveGmailImapMessages(options = {}, targetOption, fallbackTargets) {
  const items = normalizeBatchItems(options.items);
  const targetMailboxes = normalizeTargetMailboxNames(options[targetOption], fallbackTargets);
  let session;
  try {
    const opened = await openLoggedInSession(options);
    session = opened.session;
    session.capabilities = opened.capabilities;
    const results = [];
    for (const item of items) {
      let itemResult = null;
      let lastError = null;
      for (const targetMailbox of targetMailboxes) {
        try {
          itemResult = await moveMailboxEntry(session, opened.capabilities, item.mailbox, item.uid, targetMailbox);
          break;
        } catch (error) {
          lastError = error;
          if (error?.mutationStarted) break;
        }
      }
      if (itemResult) {
        results.push(itemResult);
      } else {
        results.push({
          mailbox: item.mailbox,
          uid: item.uid,
          status: 'failed',
          moved: false,
          copied: false,
          markedDeleted: false,
          expunged: false,
          expungeDeferred: false,
          error: String(lastError?.message || 'Unable to move this message.').slice(0, 180),
        });
      }
    }
    return { ok: results.every((item) => item.status !== 'failed'), items: results };
  } finally {
    await closeLoggedInSession(session);
  }
}

async function markGmailImapMessagesReadWithResults(options = {}) {
  const items = normalizeBatchItems(options.items);
  let session;
  try {
    const opened = await openLoggedInSession(options);
    session = opened.session;
    const results = [];
    for (const item of items) {
      try {
        results.push(await markMailboxEntryRead(session, item.mailbox, item.uid));
      } catch (error) {
        results.push({ mailbox: item.mailbox, uid: item.uid, status: 'failed', error: String(error?.message || 'Unable to mark this message read.').slice(0, 180) });
      }
    }
    return { ok: results.every((item) => item.status !== 'failed'), items: results };
  } finally {
    await closeLoggedInSession(session);
  }
}

async function moveGmailImapMessageToTrash(options = {}) {
  const result = await moveGmailImapMessages({
    ...options,
    items: [{ mailbox: options.mailbox, uid: options.uid }],
  }, 'trashMailboxNames', ['[Gmail]/Trash', 'Trash']);
  const item = result.items[0];
  if (!item || item.status === 'failed') {
    const error = new Error(item?.error || 'Unable to move this message to Gmail Trash.');
    error.status = 502;
    throw error;
  }
  return { ok: true, ...item, trashMailbox: item.targetMailbox };
}

async function moveGmailImapMessageToSpam(options = {}) {
  const result = await moveGmailImapMessages({
    ...options,
    items: [{ mailbox: options.mailbox, uid: options.uid }],
  }, 'spamMailboxNames', ['[Gmail]/Spam', 'Spam', 'Junk']);
  const item = result.items[0];
  if (!item || item.status === 'failed') {
    const error = new Error(item?.error || 'Unable to move this message to Gmail Spam.');
    error.status = 502;
    throw error;
  }
  return { ok: true, ...item, spamMailbox: item.targetMailbox };
}

async function markGmailImapMessageRead(options = {}) {
  const result = await markGmailImapMessagesReadWithResults({
    ...options,
    items: [{ mailbox: options.mailbox, uid: options.uid }],
  });
  const item = result.items[0];
  if (!item || item.status === 'failed') {
    const error = new Error(item?.error || 'Unable to mark this message read.');
    error.status = 502;
    throw error;
  }
  return { ok: true, ...item };
}

async function fetchGmailImapMessageBody(options = {}) {
  const mailbox = normalizeMailbox(options.mailbox);
  const uid = normalizeUid(options.uid);
  let session;
  try {
    ({ session } = await openLoggedInSession(options));
    return { ok: true, ...(await fetchMailboxEntryBody(session, mailbox, uid, options)) };
  } finally {
    await closeLoggedInSession(session);
  }
}

async function moveGmailImapMessagesToTrash(options = {}) {
  return moveGmailImapMessages(options, 'trashMailboxNames', ['[Gmail]/Trash', 'Trash']);
}

async function moveGmailImapMessagesToSpam(options = {}) {
  return moveGmailImapMessages(options, 'spamMailboxNames', ['[Gmail]/Spam', 'Spam', 'Junk']);
}

async function markGmailImapMessagesRead(options = {}) {
  return markGmailImapMessagesReadWithResults(options);
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
