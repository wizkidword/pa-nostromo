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

  const api = { viewModes, teamOptions, normalizeState, compareGames, pickFeaturedGame, filterGamesByView };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.nbaScoreState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
