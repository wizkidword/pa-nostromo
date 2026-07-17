(function installNbaScoreboardParser(global) {
  'use strict';

  const PARSER_VERSION = 'espn-nba-scoreboard-v1';
  const REQUIRED_FIELDS_ERROR = 'nba_scoreboard_parser_required_fields_missing';

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

  const api = { PARSER_VERSION, REQUIRED_FIELDS_ERROR, parseNbaScoreboard };
  const root = global.MissionControlModules = global.MissionControlModules || {};
  root.nbaScoreboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
