'use strict';

const INTEGRATION_ROUTE_IDS = new Set([
  'gas.read',
  'crypto.read',
  'email.unread',
]);

function isIntegrationRoute(route) {
  return !!route && (
    String(route.scope || '').startsWith('integrations:')
    || INTEGRATION_ROUTE_IDS.has(String(route.id || ''))
  );
}

function parserVersionForRoute(route) {
  const id = String(route?.id || '');
  if (id === 'rss.fetch') return 'rss-atom-v1';
  if (id === 'gas.read') return 'aaa-gas-v1';
  if (id === 'crypto.read') return 'crypto-json-v1';
  if (id === 'email.unread') return 'gmail-unread-v1';
  if (id.startsWith('ebay.')) return 'ebay-analytics-v3';
  if (id.includes('content')) return 'social-content-v1';
  if (id.includes('followers') || id.includes('subscribers') || id.includes('group-members')) return 'social-followers-v2';
  return 'integration-v1';
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function integrationStatus(payload, httpStatus) {
  const hasNoUsableRssResult = Array.isArray(payload?.errors)
    && payload.errors.length > 0
    && Array.isArray(payload?.feeds)
    && payload.feeds.length === 0
    && Array.isArray(payload?.items)
    && payload.items.length === 0;
  if (Number(httpStatus) >= 400 || payload?.ok === false || hasNoUsableRssResult) return 'error';
  if (payload?.disabled === true || payload?.status?.disabled === true) return 'disabled';
  if (payload?.setupRequired === true || payload?.configured === false || payload?.status?.setupRequired === true) return 'not_configured';
  if (payload?.stale === true || payload?.status?.stale === true || payload?.source === 'last_known_fallback' || payload?.latest?.stale === true || payload?.feeds?.some((feed) => feed?.stale === true)) return 'stale';
  return 'ok';
}

function safeErrorCode(value) {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z][a-z0-9_]{1,79}$/.test(code) ? code : 'integration_failed';
}

function integrationWarning(status, payload) {
  if (status === 'stale') return 'Serving the last successful integration result.';
  if (payload?.partialFailure === true) return 'Some integration sources are unavailable.';
  return null;
}

function createIntegrationEnvelope({ route, payload = {}, httpStatus = 200, data } = {}) {
  const status = integrationStatus(payload, httpStatus);
  const failed = status === 'error' || status === 'not_configured' || status === 'disabled';
  return {
    status,
    data: failed ? null : (data ?? payload ?? null),
    fetchedAt: firstText(payload?.fetchedAt, payload?.latest?.fetchedAt, payload?.status?.lastSuccessAt, payload?.sampledAt),
    sourceUpdatedAt: firstText(payload?.sourceUpdatedAt, payload?.latest?.sourceUpdatedAt, payload?.source?.updatedAt),
    parserVersion: parserVersionForRoute(route),
    warning: integrationWarning(status, payload),
    errorCode: status === 'error' ? safeErrorCode(payload?.errorCode || payload?.error || payload?.status?.errorCode || payload?.errors?.[0]?.error) : null,
  };
}

function withIntegrationEnvelope(payload, { route, httpStatus = 200 } = {}) {
  if (!isIntegrationRoute(route) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const { integration: _existingIntegration, ...legacyPayload } = payload;
  return {
    ...legacyPayload,
    integration: createIntegrationEnvelope({ route, payload: legacyPayload, httpStatus, data: legacyPayload }),
  };
}

module.exports = {
  isIntegrationRoute,
  parserVersionForRoute,
  integrationStatus,
  createIntegrationEnvelope,
  withIntegrationEnvelope,
};
