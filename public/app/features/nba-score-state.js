(function installNbaScoreStateFeature(global) {
  'use strict';

  const viewModes = new Set(['my-teams', 'live', 'all', 'recap']);
  const teamOptions = Object.freeze([
    { abbr: 'ATL', name: 'Atlanta Hawks' }, { abbr: 'BOS', name: 'Boston Celtics' }, { abbr: 'BKN', name: 'Brooklyn Nets' },
    { abbr: 'CHA', name: 'Charlotte Hornets' }, { abbr: 'CHI', name: 'Chicago Bulls' }, { abbr: 'CLE', name: 'Cleveland Cavaliers' },
    { abbr: 'DAL', name: 'Dallas Mavericks' }, { abbr: 'DEN', name: 'Denver Nuggets' }, { abbr: 'DET', name: 'Detroit Pistons' },
    { abbr: 'GS', name: 'Golden State Warriors' }, { abbr: 'HOU', name: 'Houston Rockets' }, { abbr: 'IND', name: 'Indiana Pacers' },
    { abbr: 'LAC', name: 'LA Clippers' }, { abbr: 'LAL', name: 'Los Angeles Lakers' }, { abbr: 'MEM', name: 'Memphis Grizzlies' },
    { abbr: 'MIA', name: 'Miami Heat' }, { abbr: 'MIL', name: 'Milwaukee Bucks' }, { abbr: 'MIN', name: 'Minnesota Timberwolves' },
    { abbr: 'NO', name: 'New Orleans Pelicans' }, { abbr: 'NY', name: 'New York Knicks' }, { abbr: 'OKC', name: 'Oklahoma City Thunder' },
    { abbr: 'ORL', name: 'Orlando Magic' }, { abbr: 'PHI', name: 'Philadelphia 76ers' }, { abbr: 'PHX', name: 'Phoenix Suns' },
    { abbr: 'POR', name: 'Portland Trail Blazers' }, { abbr: 'SAC', name: 'Sacramento Kings' }, { abbr: 'SA', name: 'San Antonio Spurs' },
    { abbr: 'TOR', name: 'Toronto Raptors' }, { abbr: 'UTAH', name: 'Utah Jazz' }, { abbr: 'WSH', name: 'Washington Wizards' },
  ]);
  const knownTeams = new Set(teamOptions.map((team) => team.abbr));

  function normalizeState(input) {
    const favoriteTeams = Array.isArray(input?.favoriteTeams)
      ? [...new Set(input.favoriteTeams.map((team) => String(team || '').trim().toUpperCase()).filter(Boolean))]
          .filter((team) => knownTeams.has(team))
          .slice(0, 6)
      : [];
    const requestedView = String(input?.viewMode || '').trim();
    return { viewMode: viewModes.has(requestedView) ? requestedView : 'live', favoriteTeams };
  }

  function compareGames(left, right) {
    const bucketScore = (game) => game.statusBucket === 'live' ? 0 : (game.statusBucket === 'upcoming' ? 1 : 2);
    if ((left.favorite ? 0 : 1) !== (right.favorite ? 0 : 1)) return (left.favorite ? 0 : 1) - (right.favorite ? 0 : 1);
    if (bucketScore(left) !== bucketScore(right)) return bucketScore(left) - bucketScore(right);
    const closeScoreLeft = left.scoreDiff == null ? 99 : left.scoreDiff;
    const closeScoreRight = right.scoreDiff == null ? 99 : right.scoreDiff;
    if (closeScoreLeft !== closeScoreRight) return closeScoreLeft - closeScoreRight;
    return String(left.startDate || '').localeCompare(String(right.startDate || ''));
  }

  function pickFeaturedGame(games, viewMode) {
    if (!Array.isArray(games) || !games.length) return null;
    if (viewMode === 'recap') return games.find((game) => game.statusBucket === 'final') || games[0];
    if (viewMode === 'live') return games.find((game) => game.statusBucket === 'live') || games[0];
    if (viewMode === 'my-teams') return games.find((game) => game.favorite && game.statusBucket === 'live')
      || games.find((game) => game.favorite)
      || games[0];
    return games.find((game) => game.favorite && game.statusBucket === 'live')
      || games.find((game) => game.statusBucket === 'live')
      || games[0];
  }

  function filterGamesByView(games, viewMode) {
    const list = Array.isArray(games) ? games : [];
    if (viewMode === 'my-teams') return list.filter((game) => game.favorite);
    if (viewMode === 'live') return list.filter((game) => game.statusBucket === 'live');
    if (viewMode === 'recap') return list.filter((game) => game.statusBucket === 'final');
    return list;
  }

  function normalizeCompetitor(competitor) {
    const team = competitor?.team || {};
    const overallRecord = Array.isArray(competitor?.records)
      ? competitor.records.find((record) => /overall|total/i.test(String(record?.name || record?.abbreviation || '')))
      : null;
    const topPointsLeader = Array.isArray(competitor?.leaders)
      ? competitor.leaders.find((leader) => String(leader?.name || '').toLowerCase().includes('point'))
      : null;
    const leaderEntry = topPointsLeader?.leaders?.[0] || null;
    const leaderText = leaderEntry
      ? String(leaderEntry.athlete?.shortName || leaderEntry.athlete?.displayName || 'Leader') + ' · ' + String(leaderEntry.displayValue || '')
      : '';
    return {
      id: String(team.id || competitor?.id || ''),
      abbr: String(team.abbreviation || team.shortDisplayName || 'TEAM').trim().toUpperCase(),
      name: String(team.shortDisplayName || team.displayName || team.name || 'Team').trim(),
      displayName: String(team.displayName || team.shortDisplayName || 'Team').trim(),
      score: Number.isFinite(Number(competitor?.score)) ? Number(competitor.score) : null,
      logo: String(team.logo || '').trim(),
      record: String(overallRecord?.summary || '').trim(),
      winner: competitor?.winner === true,
      leaderText: leaderText.trim(),
      homeAway: String(competitor?.homeAway || '').trim(),
    };
  }

  function getBroadcastLabel(competition) {
    const geoBroadcasts = Array.isArray(competition?.geoBroadcasts) ? competition.geoBroadcasts : [];
    const national = geoBroadcasts.find((entry) => String(entry?.market?.type || '').toLowerCase() === 'national');
    if (national?.media?.shortName) return String(national.media.shortName).trim();
    const first = geoBroadcasts.find((entry) => entry?.media?.shortName);
    if (first?.media?.shortName) return String(first.media.shortName).trim();
    const broadcasts = Array.isArray(competition?.broadcasts) ? competition.broadcasts : [];
    const broadcast = broadcasts.find((entry) => Array.isArray(entry?.names) && entry.names.length);
    return broadcast?.names?.[0] ? String(broadcast.names[0]).trim() : '';
  }

  function parseWinsFromRecord(recordText) {
    const match = String(recordText || '').trim().match(/^(\d+)-(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function createTag(label, tone = 'neutral') {
    return { label: String(label || '').trim(), tone: String(tone || 'neutral').trim() || 'neutral' };
  }

  function normalizeEvent(event, favoriteTeams = new Set(), now = Date.now()) {
    const competition = event?.competitions?.[0] || {};
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const home = normalizeCompetitor(competitors.find((team) => team?.homeAway === 'home'));
    const away = normalizeCompetitor(competitors.find((team) => team?.homeAway === 'away'));
    const statusType = competition?.status?.type || event?.status?.type || {};
    const stateKey = String(statusType?.state || '').toLowerCase();
    const isLive = stateKey === 'in';
    const isFinal = statusType?.completed === true;
    const statusBucket = isLive ? 'live' : (isFinal ? 'final' : 'upcoming');
    const scoreDiff = home.score != null && away.score != null ? Math.abs(home.score - away.score) : null;
    const favorites = favoriteTeams instanceof Set ? favoriteTeams : new Set();
    const favorite = favorites.has(home.abbr) || favorites.has(away.abbr);
    const headline = String(competition?.headlines?.[0]?.shortLinkText || competition?.headlines?.[0]?.description || '').trim();
    const statusText = String(statusType?.shortDetail || statusType?.detail || statusType?.description || 'Scheduled').trim();
    const period = Number(competition?.status?.period || event?.status?.period || 0);
    const startDate = String(competition?.startDate || event?.date || '');
    const startMs = startDate ? Date.parse(startDate) : NaN;
    const minutesUntilTip = Number.isFinite(startMs) ? Math.round((startMs - Number(now)) / 60000) : null;
    const links = Array.isArray(event?.links) ? event.links : [];
    const getLink = (pattern) => links.find((link) => pattern.test(String(link?.text || '')) || (Array.isArray(link?.rel) && link.rel.some((rel) => pattern.test(String(rel || '')))))?.href || '';
    const closeGame = isLive && scoreDiff != null && scoreDiff <= 6;
    const crunchTime = isLive && period >= 4 && scoreDiff != null && scoreDiff <= 8;
    const nailBiter = isFinal && scoreDiff != null && scoreDiff <= 5;
    const overtime = /ot/i.test(statusText) || period > 4;
    const startsSoon = !isLive && !isFinal && minutesUntilTip != null && minutesUntilTip >= 0 && minutesUntilTip <= 45;
    const nationalTv = geoBroadcastsAreNational(competition);
    const homeWins = parseWinsFromRecord(home.record);
    const awayWins = parseWinsFromRecord(away.record);
    const betterTeam = homeWins != null && awayWins != null
      ? (homeWins > awayWins ? home : (awayWins > homeWins ? away : null))
      : null;
    const winner = home.winner ? home : (away.winner ? away : null);
    const upsetFinal = isFinal && !!winner && !!betterTeam && betterTeam.abbr !== winner.abbr
      && Math.abs((homeWins || 0) - (awayWins || 0)) >= 8;
    const tags = [];
    if (favorite) tags.push(createTag('My Team', 'favorite'));
    if (overtime && isLive) tags.push(createTag('OT', 'alert'));
    else if (crunchTime) tags.push(createTag('Crunch Time', 'alert'));
    else if (closeGame) tags.push(createTag('Close Game', 'live'));
    else if (startsSoon) tags.push(createTag('Starts Soon', 'info'));
    else if (nailBiter) tags.push(createTag('Tight Finish', 'neutral'));
    if (upsetFinal) tags.push(createTag('Upset', 'accent'));
    if (nationalTv) tags.push(createTag('National TV', 'neutral'));
    return {
      id: String(event?.id || ''),
      shortName: String(event?.shortName || (away.abbr + ' @ ' + home.abbr)).trim(),
      statusBucket, statusText, startDate, home, away, favorite, scoreDiff, headline,
      broadcastLabel: getBroadcastLabel(competition),
      tags: tags.slice(0, 3),
      actions: {
        gamecast: getLink(/summary|live|gamecast/i),
        boxScore: getLink(/box.?score/i),
        recap: getLink(/recap/i),
        playByPlay: getLink(/play.?by.?play|pbp/i),
      },
    };
  }

  function geoBroadcastsAreNational(competition) {
    return Array.isArray(competition?.geoBroadcasts)
      && competition.geoBroadcasts.some((entry) => String(entry?.market?.type || '').toLowerCase() === 'national');
  }

  const api = {
    viewModes, teamOptions, normalizeState, compareGames, pickFeaturedGame, filterGamesByView,
    normalizeCompetitor, getBroadcastLabel, parseWinsFromRecord, createTag, normalizeEvent,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.nbaScoreState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
