(function initWeatherRefresh(global) {
  'use strict';

  const PARSER_VERSION = 'weather-refresh-v1';
  const PROVIDER = 'weather_refresh';
  const ZIP_PARSER_ERROR = 'weather_zip_parser_required_fields_missing';
  const FORECAST_PARSER_ERROR = 'weather_forecast_parser_required_fields_missing';
  const DEFAULT_RETRY_OPTIONS = Object.freeze({
    retries: 1,
    backoffBaseMs: 500,
    backoffMaxMs: 2000,
    operationTimeoutMs: 15000,
    attemptTimeoutMs: 8000,
    unhealthyCooldownMs: 30000,
  });

  function getFailoverApi() {
    const browserApi = global?.MissionControlModules?.cryptoFailover;
    if (browserApi?.fetchWithFailover) return browserApi;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { return require('./crypto-failover.js'); } catch {}
    }
    return null;
  }

  function parseZipLocation(payload) {
    const place = payload?.places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);
    const placeName = String(place?.['place name'] || '').trim();
    const stateAbbreviation = String(place?.['state abbreviation'] || '').trim();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !placeName || !stateAbbreviation) {
      return { ok: false, errorCode: ZIP_PARSER_ERROR, parserVersion: PARSER_VERSION };
    }
    return {
      ok: true,
      errorCode: null,
      parserVersion: PARSER_VERSION,
      location: { latitude, longitude, label: `${placeName}, ${stateAbbreviation}` },
    };
  }

  function parseWeatherForecast(payload) {
    const temperature = Number(payload?.current?.temperature_2m);
    if (!Number.isFinite(temperature)) {
      return { ok: false, errorCode: FORECAST_PARSER_ERROR, parserVersion: PARSER_VERSION };
    }
    return { ok: true, errorCode: null, parserVersion: PARSER_VERSION, weather: payload };
  }

  function makeHttpError(label, response) {
    const error = new Error(`${label} failed (${response.status})`);
    error.status = response.status;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) error.retryAfter = retryAfter;
    return error;
  }

  function isRetryableWeatherError(error) {
    const status = Number(error?.status || 0);
    if (String(error?.code || '').startsWith('weather_')) return false;
    if (error?.code === 'provider_attempt_timeout') return true;
    if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /abort|timeout|network|fetch failed|temporar|upstream/i.test(String(error?.message || ''));
  }

  function weatherRetryDelayMs({ error } = {}) {
    const retryAfter = Number(error?.retryAfter);
    return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 0;
  }

  async function fetchJson(url, label, { signal, fetchResponse } = {}) {
    const response = typeof fetchResponse === 'function'
      ? await fetchResponse(url, { signal })
      : await global.fetch(url, { signal });
    if (!response?.ok) throw makeHttpError(label, response || { status: 0, headers: null });
    try {
      return await response.json();
    } catch (cause) {
      const error = new Error(`${label.toLowerCase().replaceAll(' ', '_')}_json_parse_failed`);
      error.code = `weather_${label.toLowerCase().replaceAll(' ', '_')}_json_parse_failed`;
      error.cause = cause;
      throw error;
    }
  }

  function forecastUrl(location, timeZone) {
    return `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(location.latitude)}&longitude=${encodeURIComponent(location.longitude)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(timeZone)}`;
  }

  async function fetchWeatherAttempt(zip, timeZone, options = {}) {
    const zipPayload = await fetchJson(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, 'ZIP lookup', options);
    const locationResult = parseZipLocation(zipPayload);
    if (!locationResult.ok) {
      const error = new Error(locationResult.errorCode);
      error.code = locationResult.errorCode;
      throw error;
    }
    const forecastPayload = await fetchJson(forecastUrl(locationResult.location, timeZone), 'Weather forecast', options);
    const forecastResult = parseWeatherForecast(forecastPayload);
    if (!forecastResult.ok) {
      const error = new Error(forecastResult.errorCode);
      error.code = forecastResult.errorCode;
      throw error;
    }
    return {
      location: locationResult.location,
      weather: forecastResult.weather,
      parserVersion: PARSER_VERSION,
    };
  }

  async function fetchWeatherSnapshot(zip, timeZone, options = {}) {
    const failover = getFailoverApi();
    if (!failover?.fetchWithFailover) return fetchWeatherAttempt(zip, timeZone, options);

    const result = await failover.fetchWithFailover({
      providers: [PROVIDER],
      retries: options.retries ?? DEFAULT_RETRY_OPTIONS.retries,
      backoffBaseMs: options.backoffBaseMs ?? DEFAULT_RETRY_OPTIONS.backoffBaseMs,
      backoffMaxMs: options.backoffMaxMs ?? DEFAULT_RETRY_OPTIONS.backoffMaxMs,
      operationTimeoutMs: options.operationTimeoutMs ?? DEFAULT_RETRY_OPTIONS.operationTimeoutMs,
      attemptTimeoutMs: options.attemptTimeoutMs ?? DEFAULT_RETRY_OPTIONS.attemptTimeoutMs,
      unhealthyCooldownMs: options.unhealthyCooldownMs ?? DEFAULT_RETRY_OPTIONS.unhealthyCooldownMs,
      healthStore: options.healthStore,
      signal: options.signal,
      random: options.random,
      delay: options.delay,
      now: options.now,
      isRetryableError: isRetryableWeatherError,
      retryDelayMs: weatherRetryDelayMs,
      tryProvider: (_provider, _attempt, { signal }) => fetchWeatherAttempt(zip, timeZone, {
        signal,
        fetchResponse: options.fetchResponse,
      }),
    });
    return result.result;
  }

  const api = {
    PARSER_VERSION,
    PROVIDER,
    ZIP_PARSER_ERROR,
    FORECAST_PARSER_ERROR,
    DEFAULT_RETRY_OPTIONS,
    parseZipLocation,
    parseWeatherForecast,
    isRetryableWeatherError,
    weatherRetryDelayMs,
    fetchWeatherSnapshot,
  };
  const root = global.MissionControlModules = global.MissionControlModules || {};
  root.weatherRefresh = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
