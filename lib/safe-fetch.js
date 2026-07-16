const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

class SafeFetchError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = 'SafeFetchError';
    this.code = code;
    this.status = options.status || 502;
    this.cause = options.cause;
  }
}

function parseIpv4(address) {
  const parts = String(address || '').split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return null;
  return octets;
}

function isBlockedIpv4(address) {
  const octets = parseIpv4(address);
  if (!octets) return true;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 31 && c === 196) return true;
  if (a === 192 && b === 52 && c === 193) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 175 && c === 48) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 100 && b === 100 && c === 100) return true;
  if (a === 168 && b === 63 && c === 129) return true;
  return false;
}

function ipv6ToBytes(address) {
  const raw = String(address || '').toLowerCase();
  if (net.isIP(raw) !== 6) return null;
  const ipv4Index = raw.lastIndexOf(':');
  let normalized = raw;
  if (raw.includes('.')) {
    const v4 = parseIpv4(raw.slice(ipv4Index + 1));
    if (!v4) return null;
    normalized = `${raw.slice(0, ipv4Index)}:${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const [leftRaw, rightRaw = ''] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':').filter(Boolean) : [];
  const right = rightRaw ? rightRaw.split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  const groups = normalized.includes('::') ? [...left, ...Array(Math.max(0, missing)).fill('0'), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const bytes = [];
  for (const group of groups) {
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function bytesMatch(bytes, prefix, bits) {
  const whole = Math.floor(bits / 8);
  const remainder = bits % 8;
  for (let index = 0; index < whole; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return !remainder || (bytes[whole] & (0xff << (8 - remainder))) === (prefix[whole] & (0xff << (8 - remainder)));
}

function isBlockedIpv6(address) {
  const bytes = ipv6ToBytes(address);
  if (!bytes) return true;
  const allZero = bytes.every((value) => value === 0);
  if (allZero || bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1) return true;
  if (bytesMatch(bytes, [0xfc], 7) || bytesMatch(bytes, [0xfe, 0x80], 10) || bytesMatch(bytes, [0xff], 8)) return true;
  if (bytesMatch(bytes, [0x20, 0x01, 0x00], 23) || bytesMatch(bytes, [0x20, 0x01, 0x0d, 0xb8], 32) || bytesMatch(bytes, [0x20, 0x02], 16) || bytesMatch(bytes, [0x64, 0xff, 0x9b], 96) || bytesMatch(bytes, [0x64, 0xff, 0x9b, 0x00, 0x01], 48)) return true;
  const v4Mapped = bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const v4Compatible = bytes.slice(0, 12).every((value) => value === 0);
  if (v4Mapped || v4Compatible) return isBlockedIpv4(bytes.slice(12).join('.'));
  return false;
}

function isBlockedAddress(address) {
  const family = net.isIP(String(address || ''));
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

function normalizeHost(value) {
  return String(value || '').trim().replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function hostAllowed(hostname, allowedHosts = []) {
  const normalized = normalizeHost(hostname);
  if (!allowedHosts?.length) return true;
  return allowedHosts.some((entry) => {
    const allowed = normalizeHost(entry);
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

function normalizeTarget(input, { allowedProtocols = ['http:', 'https:'], allowedHosts = [], allowCredentials = false } = {}) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
  } catch {
    throw new SafeFetchError('invalid_url', 'The outbound URL is invalid.', { status: 400 });
  }
  if (!allowedProtocols.includes(url.protocol)) throw new SafeFetchError('invalid_protocol', 'The outbound URL protocol is not allowed.', { status: 400 });
  if (!allowCredentials && (url.username || url.password)) throw new SafeFetchError('credentials_not_allowed', 'Credentials in outbound URLs are not allowed.', { status: 400 });
  if (!hostAllowed(url.hostname, allowedHosts)) throw new SafeFetchError('host_not_allowed', 'The outbound host is not allowed.', { status: 403 });
  return url;
}

async function resolveAndValidate(url, { resolveHostname = dns.promises.lookup } = {}) {
  const hostname = normalizeHost(url.hostname);
  const directFamily = net.isIP(hostname);
  const records = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await resolveHostname(hostname, { all: true, verbatim: true });
  const normalized = (Array.isArray(records) ? records : [])
    .map((record) => ({ address: String(record?.address || ''), family: Number(record?.family || net.isIP(record?.address || '')) }))
    .filter((record) => record.address && (record.family === 4 || record.family === 6));
  if (!normalized.length) throw new SafeFetchError('dns_no_records', 'The outbound host did not resolve to an address.');
  if (normalized.some((record) => isBlockedAddress(record.address))) {
    throw new SafeFetchError('blocked_address', 'The outbound host resolved to a blocked address.', { status: 403 });
  }
  return normalized;
}

function responseHeaders(rawHeaders = {}) {
  const map = new Map();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (value == null) continue;
    map.set(String(name).toLowerCase(), Array.isArray(value) ? value.join(', ') : String(value));
  }
  return {
    get(name) { return map.get(String(name || '').toLowerCase()) || null; },
    has(name) { return map.has(String(name || '').toLowerCase()); },
    entries() { return map.entries(); },
  };
}

function sanitizedHeaders(headers = {}) {
  const clean = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (/^(host|connection|content-length|transfer-encoding)$/i.test(name)) continue;
    if (value != null) clean[name] = String(value);
  }
  return clean;
}

function combineAbortSignals(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener?.('abort', abort, { once: true });
  const timeout = setTimeout(abort, Math.max(250, Number(timeoutMs) || 10_000));
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
    },
  };
}

function requestPinned(url, addresses, options) {
  const body = options.body == null ? null : Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body));
  const transport = url.protocol === 'https:' ? https : http;
  const merged = combineAbortSignals(options.signal, options.timeoutMs);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      merged.dispose();
      fn(value);
    };
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      headers: sanitizedHeaders(options.headers),
      servername: url.protocol === 'https:' ? url.hostname : undefined,
      lookup(_hostname, lookupOptions, callback) {
        if (typeof lookupOptions === 'function') callback = lookupOptions;
        if (lookupOptions?.all) return callback(null, addresses.map((entry) => ({ address: entry.address, family: entry.family })));
        const selected = addresses[0];
        callback(null, selected.address, selected.family);
      },
      signal: merged.signal,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          response.destroy(new SafeFetchError('response_too_large', 'The upstream response exceeded the configured limit.', { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => finish(reject, error));
      response.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        finish(resolve, {
          status: Number(response.statusCode || 0),
          ok: Number(response.statusCode || 0) >= 200 && Number(response.statusCode || 0) < 300,
          headers: responseHeaders(response.headers),
          url: url.toString(),
          async arrayBuffer() { return bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength); },
          async text() { return bodyBuffer.toString('utf8'); },
          async json() { return JSON.parse(bodyBuffer.toString('utf8')); },
        });
      });
    });
    request.on('error', (error) => {
      if (merged.signal.aborted) return finish(reject, new SafeFetchError('request_timeout', 'The outbound request timed out or was cancelled.', { status: 504, cause: error }));
      return finish(reject, error);
    });
    request.setTimeout(Math.max(250, Number(options.firstByteTimeoutMs || options.timeoutMs) || 10_000), () => {
      request.destroy(new SafeFetchError('request_timeout', 'The outbound request timed out.', { status: 504 }));
    });
    if (body) request.write(body);
    request.end();
  });
}

async function safeFetch(input, options = {}) {
  const maxRedirects = Math.max(0, Math.min(10, Number(options.maxRedirects ?? 3)));
  const maxBytes = Math.max(1, Number(options.maxBytes || 2 * 1024 * 1024));
  let url = normalizeTarget(input, options);
  let headers = sanitizedHeaders(options.headers);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const addresses = await resolveAndValidate(url, options);
    const performRequest = options.performRequest || requestPinned;
    const response = await performRequest(url, addresses, {
      ...options,
      method: String(options.method || 'GET').toUpperCase(),
      headers,
      maxBytes,
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    if (redirectCount === maxRedirects) throw new SafeFetchError('too_many_redirects', 'The outbound request exceeded the redirect limit.', { status: 502 });
    const redirected = normalizeTarget(new URL(location, url), options);
    if (redirected.origin !== url.origin) {
      headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !/^(authorization|cookie|proxy-authorization)$/i.test(name)));
    }
    url = redirected;
  }
  throw new SafeFetchError('too_many_redirects', 'The outbound request exceeded the redirect limit.', { status: 502 });
}

module.exports = {
  SafeFetchError,
  isBlockedAddress,
  normalizeTarget,
  resolveAndValidate,
  requestPinned,
  safeFetch,
};
