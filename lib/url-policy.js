'use strict';

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function normalizeAllowedHosts(allowedHosts = []) {
  return (Array.isArray(allowedHosts) ? allowedHosts : [allowedHosts])
    .map((host) => String(host || '').trim().toLowerCase().replace(/^\.+/, ''))
    .filter(Boolean);
}

function hostIsAllowed(hostname, allowedHosts = []) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  const allowed = normalizeAllowedHosts(allowedHosts);
  return !allowed.length || allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function validateWebUrl(input, {
  allowRelative = false,
  allowHttp = true,
  allowedHosts = [],
  baseUrl = 'http://localhost/',
} = {}) {
  if (typeof input !== 'string') return { ok: false, code: 'url_not_string' };
  const raw = input.trim();
  if (!raw) return { ok: false, code: 'url_empty' };
  if (CONTROL_CHARACTERS.test(raw)) return { ok: false, code: 'url_control_character' };
  if (raw.startsWith('//')) return { ok: false, code: 'url_protocol_relative' };

  if (allowRelative && raw.startsWith('/')) {
    try {
      const parsed = new URL(raw, baseUrl);
      const base = new URL(baseUrl);
      if (parsed.origin !== base.origin) return { ok: false, code: 'url_relative_origin' };
      return { ok: true, url: `${parsed.pathname}${parsed.search}${parsed.hash}`, parsed, relative: true };
    } catch {
      return { ok: false, code: 'url_invalid' };
    }
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, code: 'url_invalid' };
  }
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    return { ok: false, code: 'url_protocol' };
  }
  if (!parsed.hostname || parsed.username || parsed.password) return { ok: false, code: 'url_credentials_or_host' };
  if (!hostIsAllowed(parsed.hostname, allowedHosts)) return { ok: false, code: 'url_host_not_allowed' };
  return { ok: true, url: parsed.toString(), parsed, relative: false };
}

module.exports = {
  CONTROL_CHARACTERS,
  hostIsAllowed,
  normalizeAllowedHosts,
  validateWebUrl,
};
