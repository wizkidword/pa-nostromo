(function installGasPricesStateFeature(global) {
  'use strict';

  function baseValues(values) {
    return {
      regular: String(values?.regular || '').trim(),
      mid: String(values?.mid || '').trim(),
      premium: String(values?.premium || '').trim(),
      diesel: String(values?.diesel || '').trim(),
    };
  }

  function normalizeState(input, defaultLocation = '') {
    const gas = {
      location: String(input?.location || defaultLocation).trim().slice(0, 80),
      resolvedLocation: String(input?.resolvedLocation || '').trim().slice(0, 120),
      source: ['manual', 'aaa-state-average'].includes(input?.source) ? input.source : 'manual',
      sourceUrl: String(input?.sourceUrl || '').trim().slice(0, 300),
      fetchedAt: String(input?.fetchedAt || ''),
      updatedAt: String(input?.updatedAt || ''),
      manualUpdatedAt: String(input?.manualUpdatedAt || ''),
      lastError: String(input?.lastError || '').slice(0, 300),
      values: baseValues(input?.values),
      manualValues: baseValues(input?.manualValues),
    };
    if (!Object.values(gas.values).some(Boolean) && Object.values(gas.manualValues).some(Boolean)) {
      gas.values = { ...gas.manualValues };
      gas.source = 'manual';
      if (!gas.updatedAt) gas.updatedAt = gas.manualUpdatedAt || '';
    }
    return gas;
  }

  function formatPrice(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const numeric = Number(raw.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? '$' + numeric.toFixed(3) : '';
  }

  function normalizePriceValues(values) {
    return {
      regular: formatPrice(values?.regular),
      mid: formatPrice(values?.mid),
      premium: formatPrice(values?.premium),
      diesel: formatPrice(values?.diesel),
    };
  }

  const api = { baseValues, normalizeState, formatPrice, normalizePriceValues };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.gasPricesState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
