(function installIntegrationHealthFeature(global) {
  'use strict';

  const VALID_STATUSES = new Set(['healthy', 'refreshing', 'stale', 'rate_limited', 'error', 'disabled', 'not_configured']);

  function cleanText(value, limit = 180) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
  }

  function toTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    const parsed = Date.parse(String(value || '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function safeErrorCode(value) {
    const raw = cleanText(value, 160).toLowerCase();
    if (!raw) return '';
    if (/auth|credential|token|unauthori[sz]ed|forbidden|login/.test(raw)) return 'authentication_failed';
    if (/rate.?limit|throttl|\b429\b/.test(raw)) return 'rate_limited';
    if (/parser|parse|malformed/.test(raw)) return 'parser_failed';
    if (/cooldown/.test(raw)) return 'refresh_cooldown';
    if (/not.?configured|setup.?required|missing.?config/.test(raw)) return 'not_configured';
    if (/offline/.test(raw)) return 'offline';
    if (/timeout|timed out/.test(raw)) return 'timeout';
    if (/network|fetch failed|upstream/.test(raw)) return 'upstream_unavailable';
    return /^[a-z][a-z0-9_]{1,79}$/.test(raw) ? raw : 'integration_failed';
  }

  function resolveStatus({ scheduler = {}, signal = {}, configuration = {} } = {}) {
    if (configuration.enabled === false || scheduler.enabled === false) return 'disabled';
    if (configuration.configured === false) return 'not_configured';
    if (scheduler.inFlight) return 'refreshing';

    const detail = cleanText(signal.detail).toLowerCase();
    const signalFailure = signal.status === 'error' || signal.status === 'degraded';
    const errorCode = safeErrorCode(scheduler.lastError || signal.errorCode || (signalFailure ? detail : ''));
    if (errorCode === 'rate_limited' || /rate.?limit|throttl|\b429\b/.test(detail)) return 'rate_limited';
    if (signal.status === 'stale') return 'stale';
    if (signalFailure || scheduler.lastError) return 'error';
    return 'healthy';
  }

  function defaultRecovery(status, name) {
    if (status === 'disabled') return `Enable ${name} to resume refreshes.`;
    if (status === 'not_configured') return `Configure ${name}, then refresh.`;
    if (status === 'rate_limited') return `Wait for the provider cooldown before refreshing ${name} again.`;
    if (status === 'stale') return `Refresh ${name}; the last successful result remains visible.`;
    if (status === 'error') return `Review the redacted diagnostic code, correct the local setup, then refresh ${name}.`;
    return 'No recovery action is needed.';
  }

  function buildIntegrationHealthEntry(definition = {}, context = {}) {
    const scheduler = context.scheduler && typeof context.scheduler === 'object' ? context.scheduler : {};
    const signal = context.signal && typeof context.signal === 'object' ? context.signal : {};
    const configuration = context.configuration && typeof context.configuration === 'object' ? context.configuration : {};
    const name = cleanText(definition.name || definition.id || 'Integration', 80);
    const status = resolveStatus({ scheduler, signal, configuration });
    const signalFailure = signal.status === 'error' || signal.status === 'degraded';
    const errorCode = safeErrorCode(scheduler.lastError || signal.errorCode || (signalFailure ? signal.detail : ''));
    const authenticationExpired = errorCode === 'authentication_failed' || configuration.authenticationExpired === true;
    const manualCooldownMs = Math.max(0, Number(scheduler.manualCooldownMs || 0));
    const lastManualRefreshAt = toTimestamp(scheduler.lastManualRefreshAt);
    const refreshAvailableAt = lastManualRefreshAt && manualCooldownMs
      ? lastManualRefreshAt + manualCooldownMs
      : 0;
    const now = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const diagnosticCode = errorCode || (authenticationExpired ? 'authentication_failed' : '');

    return {
      id: cleanText(definition.id, 80),
      name,
      configured: configuration.configured === true ? 'configured' : configuration.configured === false ? 'not_configured' : 'checking',
      enabled: status !== 'disabled',
      status: VALID_STATUSES.has(status) ? status : 'error',
      lastSuccessAt: toTimestamp(scheduler.lastSuccessAt) || toTimestamp(configuration.lastSuccessAt),
      lastAttemptAt: toTimestamp(scheduler.lastAttemptAt) || toTimestamp(signal.observedAt),
      sourceUpdatedAt: toTimestamp(configuration.sourceUpdatedAt),
      nextRefreshAt: toTimestamp(scheduler.nextRefreshAt),
      refreshAvailableAt,
      refreshing: status === 'refreshing',
      cooldownActive: refreshAvailableAt > now,
      authenticationExpired,
      errorCode: diagnosticCode || null,
      recoveryAction: cleanText(configuration.recoveryAction || defaultRecovery(status, name), 220),
      settingsSection: cleanText(configuration.settingsSection, 80),
    };
  }

  function buildIntegrationHealthEntries(definitions = [], context = {}) {
    const getScheduler = typeof context.getScheduler === 'function' ? context.getScheduler : () => null;
    const getSignal = typeof context.getSignal === 'function' ? context.getSignal : () => null;
    const getConfiguration = typeof context.getConfiguration === 'function' ? context.getConfiguration : () => null;
    const now = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    return (Array.isArray(definitions) ? definitions : []).map((definition) => buildIntegrationHealthEntry(definition, {
      scheduler: getScheduler(definition.schedulerId || definition.id) || {},
      signal: getSignal(definition.signalId || definition.id) || {},
      configuration: getConfiguration(definition) || {},
      now,
    }));
  }

  const api = { safeErrorCode, resolveStatus, buildIntegrationHealthEntry, buildIntegrationHealthEntries };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.integrationHealth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
