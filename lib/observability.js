'use strict';

const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const SENSITIVE_FIELD_PATTERN = /(authorization|cookie|token|secret|password|passphrase|api[_-]?key|oauth|session|email[_-]?(?:body|content)|message[_-]?(?:body|content)|raw[_-]?(?:body|response)|upstream[_-]?(?:body|response))/i;
const MAX_DIAGNOSTIC_TEXT_LENGTH = 500;

function incomingHeaderValue(headers = {}, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function createRequestId(headers = {}) {
  const supplied = String(incomingHeaderValue(headers, 'x-request-id') || '').trim();
  if (REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return `req_${crypto.randomUUID().replace(/-/g, '')}`;
}

function safeErrorCode(value) {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z][a-z0-9_]{1,79}$/.test(code) ? code : 'request_failed';
}

function publicErrorMessage(status) {
  const numericStatus = Number(status || 0);
  if (numericStatus === 401) return 'Authentication is required.';
  if (numericStatus === 403) return 'This request is not allowed.';
  if (numericStatus === 404) return 'The requested resource was not found.';
  if (numericStatus === 405) return 'This method is not allowed.';
  if (numericStatus === 409) return 'The request conflicts with the current state.';
  if (numericStatus === 413) return 'The request is too large.';
  if (numericStatus === 415) return 'This request format is not supported.';
  if (numericStatus === 422) return 'The request data is invalid.';
  if (numericStatus === 428) return 'A required precondition is missing.';
  if (numericStatus === 429) return 'Too many requests were made. Please try again later.';
  if (numericStatus >= 500) return 'The service could not complete the request.';
  return 'The request could not be processed.';
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function createPublicErrorPayload(status, payload = {}, requestId) {
  const response = {
    ok: false,
    error: safeErrorCode(payload?.error),
    message: publicErrorMessage(status),
    requestId: String(requestId || createRequestId()),
  };

  for (const key of ['currentRevision', 'updatedCount', 'movedCount', 'maxBytes']) {
    const value = nonNegativeInteger(payload?.[key]);
    if (value !== undefined) response[key] = value;
  }
  return response;
}

function redactDiagnosticText(value, maxLength = MAX_DIAGNOSTIC_TEXT_LENGTH) {
  const text = String(value == null ? '' : value)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=:-]+/gi, '$1 [REDACTED]')
    .replace(/([?&](?:access_?token|auth(?:orization)?|api[_-]?key|token|password|secret)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/[A-Za-z]:\\(?:[^\r\n<>:"|?*]+\\?)+/g, '[LOCAL_PATH]')
    .replace(/(^|[\s(])\/(?:Users|home|var|tmp|opt|etc)(?:\/[^\s()<>:"|?*]+)+/g, '$1[LOCAL_PATH]')
    .replace(/(?:^|\s)(?:curl|powershell(?:\.exe)?|cmd(?:\.exe)?|node)\s+[^\r\n]*/gi, ' [COMMAND_REDACTED]');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function redactDiagnostic(value, { depth = 0, seen = new WeakSet() } = {}) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (typeof value === 'bigint') return String(value);
  if (depth >= 6) return '[TRUNCATED]';
  if (value instanceof Error) {
    return {
      name: redactDiagnosticText(value.name || 'Error', 120),
      code: safeErrorCode(value.code || 'error'),
      message: redactDiagnosticText(value.message || 'Error'),
      ...(value.cause ? { cause: redactDiagnostic(value.cause, { depth: depth + 1, seen }) } : {}),
    };
  }
  if (typeof value !== 'object') return redactDiagnosticText(value);
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactDiagnostic(item, { depth: depth + 1, seen }));

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_FIELD_PATTERN.test(key)
      ? '[REDACTED]'
      : redactDiagnostic(item, { depth: depth + 1, seen });
  }
  return output;
}

function logDiagnostic(event, fields = {}, logger = console.error) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    event: String(event || 'diagnostic_event').slice(0, 120),
    ...redactDiagnostic(fields),
  };
  logger(JSON.stringify(entry));
  return entry;
}

module.exports = {
  createRequestId,
  safeErrorCode,
  publicErrorMessage,
  createPublicErrorPayload,
  redactDiagnosticText,
  redactDiagnostic,
  logDiagnostic,
};
