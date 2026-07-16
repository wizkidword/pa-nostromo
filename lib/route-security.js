const crypto = require('crypto');

const SECURITY_RESPONSE_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
});

function timingSafeMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseHost(value) {
  const raw = String(value || '').trim();
  if (!raw || /[\s/@\\]/.test(raw)) return null;
  let match;
  if (raw.startsWith('[')) {
    match = raw.match(/^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i);
  } else {
    match = raw.match(/^([a-z0-9.-]+)(?::(\d{1,5}))?$/i);
  }
  if (!match) return null;
  const host = String(match[1] || '').replace(/\.$/, '').toLowerCase();
  const port = match[2] ? Number(match[2]) : null;
  if (!host || (port != null && (!Number.isInteger(port) || port < 1 || port > 65535))) return null;
  return { host, port };
}

function createHostPolicy(rawAllowedHosts = '') {
  const configured = String(rawAllowedHosts || '')
    .split(',')
    .map((value) => parseHost(value))
    .filter(Boolean);
  const allowed = configured.length
    ? configured
    : ['localhost', '127.0.0.1', '[::1]'].map((value) => parseHost(value));
  return Object.freeze(allowed);
}

function validateHostHeader(hostHeader, hostPolicy) {
  const host = parseHost(hostHeader);
  if (!host) return { ok: false, code: 'invalid_host' };
  const allowed = Array.isArray(hostPolicy) ? hostPolicy : [];
  const matched = allowed.some((entry) => entry.host === host.host && (entry.port == null || entry.port === host.port));
  return matched ? { ok: true, host } : { ok: false, code: 'host_not_allowed' };
}

function normalizedPort(port, protocol) {
  if (port != null && port !== '') return Number(port);
  return protocol === 'https:' ? 443 : 80;
}

function originMatchesHost(value, host) {
  if (!value || !host) return false;
  try {
    const parsed = new URL(String(value));
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const originHost = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    return originHost === host.host && normalizedPort(parsed.port, parsed.protocol) === normalizedPort(host.port, parsed.protocol);
  } catch {
    return false;
  }
}

function parseScopedTokens({ tokensJson = '', legacyStateToken = '' } = {}) {
  const tokens = [];
  const raw = String(tokensJson || '').trim();
  let configurationError = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Token configuration must be an array.');
      for (const entry of parsed) {
        const token = String(entry?.token || '').trim();
        const scopes = [...new Set((Array.isArray(entry?.scopes) ? entry.scopes : [])
          .map((scope) => String(scope || '').trim())
          .filter(Boolean))];
        if (token && scopes.length) tokens.push({ token, scopes });
      }
    } catch {
      configurationError = true;
    }
  }

  const legacy = String(legacyStateToken || '').trim();
  if (legacy) tokens.push({ token: legacy, scopes: ['state:read', 'state:write'] });
  return { tokens, configurationError };
}

function bearerTokenHasScope(authorizationHeader, requiredScope, tokens) {
  const match = String(authorizationHeader || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1].trim();
  if (!token) return false;
  return (tokens || []).some((entry) => (
    Array.isArray(entry.scopes)
    && entry.scopes.includes(requiredScope)
    && timingSafeMatch(entry.token, token)
  ));
}

function hasBrowserMetadata(headers = {}) {
  return !!(headers.origin || headers.referer || headers['sec-fetch-site']);
}

function validateBrowserIntent(req, { host, csrfToken = '', requireCsrf = false } = {}) {
  const headers = req?.headers || {};
  const fetchSite = String(headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite === 'cross-site') return { ok: false, code: 'cross_site_request' };
  if (headers.origin && !originMatchesHost(headers.origin, host)) return { ok: false, code: 'origin_mismatch' };
  if (headers.referer && !originMatchesHost(headers.referer, host)) return { ok: false, code: 'referer_mismatch' };
  if (requireCsrf && !timingSafeMatch(headers['x-pa-nostromo-csrf'], csrfToken)) return { ok: false, code: 'csrf_required' };
  return { ok: true };
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  SECURITY_RESPONSE_HEADERS,
  timingSafeMatch,
  parseHost,
  createHostPolicy,
  validateHostHeader,
  originMatchesHost,
  parseScopedTokens,
  bearerTokenHasScope,
  hasBrowserMetadata,
  validateBrowserIntent,
  createCsrfToken,
};
