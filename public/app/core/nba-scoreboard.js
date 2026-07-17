(function installNbaScoreboardParser(global) {
  'use strict';

  const PARSER_VERSION = 'espn-nba-scoreboard-v1';
  const REQUIRED_FIELDS_ERROR = 'nba_scoreboard_parser_required_fields_missing';
  const PROVIDER = 'espn_nba_scoreboard';
  const DEFAULT_RETRY_OPTIONS = Object.freeze({
    retries: 1,
    backoffBaseMs: 500,
    backoffMaxMs: 2000,
    operationTimeoutMs: 15000,
    attemptTimeoutMs: 8000,
    unhealthyCooldownMs: 30000,
  });

  function parserFailure() {
    return { ok: false, events: [], parserVersion: PARSER_VERSION, errorCode: REQUIRED_FIELDS_ERROR };
  }

  function hasTeamIdentity(competitor, homeAway) {
    const team = competitor?.team;
    return competitor?.homeAway === homeAway
      && team
      && String(team.id || '').trim();
  }

  function parseNbaScoreboard(payload) {
    const events = payload?.events;
    if (!Array.isArray(events)) return parserFailure();

    for (const event of events) {
      const competition = event?.competitions?.[0];
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      if (!String(event?.id || '').trim()
        || !hasTeamIdentity(competitors.find((item) => item?.homeAway === 'home'), 'home')
        || !hasTeamIdentity(competitors.find((item) => item?.homeAway === 'away'), 'away')) {
        return parserFailure();
      }
    }

    return { ok: true, events, parserVersion: PARSER_VERSION, errorCode: null };
  }

  function getFailoverApi() {
    const browserApi = global?.MissionControlModules?.cryptoFailover;
    if (browserApi?.fetchWithFailover) return browserApi;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { return require('./crypto-failover.js'); } catch {}
    }
    return null;
  }

  function makeHttpError(response) {
    const error = new Error(`NBA upstream failed (${response.status})`);
    error.status = response.status;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) error.retryAfter = retryAfter;
    return error;
  }

  function isRetryableNbaScoreboardError(error) {
    const status = Number(error?.status || 0);
    if (String(error?.code || '').startsWith('nba_scoreboard_')) return false;
    if (error?.code === 'provider_attempt_timeout') return true;
    if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /abort|timeout|network|fetch failed|temporar|upstream/i.test(String(error?.message || ''));
  }

  function nbaScoreboardRetryDelayMs({ error } = {}) {
    const retryAfter = Number(error?.retryAfter);
    return Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 0;
  }

  async function fetchScoreboardAttempt(url, { signal, fetchResponse } = {}) {
    const response = typeof fetchResponse === 'function'
      ? await fetchResponse(url, { signal })
      : await global.fetch(url, { signal });
    if (!response?.ok) throw makeHttpError(response || { status: 0, headers: null });

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      const error = new Error('nba_scoreboard_json_parse_failed');
      error.code = 'nba_scoreboard_json_parse_failed';
      error.cause = cause;
      throw error;
    }
    const parsed = parseNbaScoreboard(payload);
    if (!parsed.ok) {
      const error = new Error(parsed.errorCode);
      error.code = parsed.errorCode;
      throw error;
    }
    return { payload, parsed };
  }

  async function fetchNbaScoreboard(url, options = {}) {
    const failover = getFailoverApi();
    if (!failover?.fetchWithFailover) return fetchScoreboardAttempt(url, options);

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
      isRetryableError: isRetryableNbaScoreboardError,
      retryDelayMs: nbaScoreboardRetryDelayMs,
      tryProvider: (_provider, _attempt, { signal }) => fetchScoreboardAttempt(url, {
        signal,
        fetchResponse: options.fetchResponse,
      }),
    });
    return result.result;
  }

  const api = {
    PARSER_VERSION,
    REQUIRED_FIELDS_ERROR,
    PROVIDER,
    DEFAULT_RETRY_OPTIONS,
    parseNbaScoreboard,
    isRetryableNbaScoreboardError,
    nbaScoreboardRetryDelayMs,
    fetchNbaScoreboard,
  };
  const root = global.MissionControlModules = global.MissionControlModules || {};
  root.nbaScoreboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
