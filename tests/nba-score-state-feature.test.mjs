import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  compareGames,
  filterGamesByView,
  normalizeEvent,
  normalizeState,
  pickFeaturedGame,
  teamOptions,
  viewModes,
} = require('../public/app/features/nba-score-state.js');

assert.equal(viewModes.has('live'), true);
assert.equal(teamOptions.length, 30);
assert.deepEqual(normalizeState({
  viewMode: 'recap',
  favoriteTeams: ['lal', 'LAL', 'not-a-team', 'BOS', 'NY', 'GS', 'MIA', 'PHX', 'TOR'],
}), { viewMode: 'recap', favoriteTeams: ['LAL', 'BOS', 'NY', 'GS', 'MIA', 'PHX'] });
assert.deepEqual(normalizeState({ viewMode: 'invalid', favoriteTeams: 'LAL' }), { viewMode: 'live', favoriteTeams: [] });

const games = [
  { id: 'final', favorite: false, statusBucket: 'final', scoreDiff: 2, startDate: '2026-07-17T15:00:00.000Z' },
  { id: 'upcoming', favorite: false, statusBucket: 'upcoming', scoreDiff: null, startDate: '2026-07-17T12:00:00.000Z' },
  { id: 'live', favorite: false, statusBucket: 'live', scoreDiff: 7, startDate: '2026-07-17T13:00:00.000Z' },
  { id: 'favorite', favorite: true, statusBucket: 'upcoming', scoreDiff: null, startDate: '2026-07-17T14:00:00.000Z' },
];
assert.deepEqual([...games].sort(compareGames).map((game) => game.id), ['favorite', 'live', 'upcoming', 'final']);
assert.deepEqual(filterGamesByView(games, 'live').map((game) => game.id), ['live']);
assert.deepEqual(filterGamesByView(games, 'my-teams').map((game) => game.id), ['favorite']);
assert.equal(pickFeaturedGame(games, 'live').id, 'live');
assert.equal(pickFeaturedGame(games, 'recap').id, 'final');
assert.equal(pickFeaturedGame(games, 'my-teams').id, 'favorite');
assert.equal(pickFeaturedGame([], 'all'), null);

const liveEvent = normalizeEvent({
  id: 'live-game',
  shortName: 'BOS @ LAL',
  links: [
    { text: 'Gamecast', href: 'https://example.test/gamecast' },
    { text: 'Box Score', href: 'https://example.test/box' },
  ],
  competitions: [{
    startDate: '2026-07-17T12:30:00.000Z',
    status: { period: 4, type: { state: 'in', completed: false, shortDetail: 'Q4 02:00' } },
    headlines: [{ shortLinkText: 'Late push' }],
    geoBroadcasts: [{ market: { type: 'national' }, media: { shortName: 'ESPN' } }],
    competitors: [
      { homeAway: 'home', score: '102', team: { id: 'lal', abbreviation: 'LAL', shortDisplayName: 'Lakers' }, records: [{ name: 'overall', summary: '50-20' }] },
      { homeAway: 'away', score: '98', team: { id: 'bos', abbreviation: 'BOS', shortDisplayName: 'Celtics' }, records: [{ name: 'overall', summary: '59-11' }] },
    ],
  }],
}, new Set(['LAL']), Date.parse('2026-07-17T12:00:00.000Z'));
assert.equal(liveEvent.statusBucket, 'live');
assert.equal(liveEvent.favorite, true);
assert.equal(liveEvent.broadcastLabel, 'ESPN');
assert.equal(liveEvent.actions.gamecast, 'https://example.test/gamecast');
assert.deepEqual(liveEvent.tags, [
  { label: 'My Team', tone: 'favorite' },
  { label: 'Crunch Time', tone: 'alert' },
  { label: 'National TV', tone: 'neutral' },
]);

console.log('nba-score-state-feature: PASS');
