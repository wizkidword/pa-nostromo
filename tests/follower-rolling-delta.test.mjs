import assert from 'node:assert/strict';

const { calculateFollowerRollingDelta } = await import('../server.js');

const latestFetchedAt = '2026-04-15T02:19:39.035Z';
const oneDayMs = 24 * 60 * 60 * 1000;

const jitteredHistory = [
  {
    followersCount: 18833,
    fetchedAt: '2026-04-14T02:24:56.286Z',
  },
  {
    followersCount: 18841,
    fetchedAt: latestFetchedAt,
  },
];

assert.equal(
  calculateFollowerRollingDelta(jitteredHistory, 18841, latestFetchedAt, oneDayMs),
  8,
  '24h rolling delta should tolerate a small retention shortfall'
);

const tooShortHistory = [
  {
    followersCount: 18833,
    fetchedAt: '2026-04-14T06:24:56.286Z',
  },
  {
    followersCount: 18841,
    fetchedAt: latestFetchedAt,
  },
];

assert.equal(
  calculateFollowerRollingDelta(tooShortHistory, 18841, latestFetchedAt, oneDayMs),
  null,
  '24h rolling delta should stay null when the history window is materially short'
);

console.log('follower-rolling-delta: PASS');
