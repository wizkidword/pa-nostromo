import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PARSER_VERSION, REQUIRED_FIELDS_ERROR, parseNbaScoreboard } = require('../public/app/core/nba-scoreboard.js');
const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const readFixture = async (name) => JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));

const valid = parseNbaScoreboard(await readFixture('nba-scoreboard-valid.json'));
assert.equal(valid.ok, true);
assert.equal(valid.parserVersion, 'espn-nba-scoreboard-v1');
assert.equal(valid.errorCode, null);
assert.equal(valid.events[0].id, '401000001');
assert.equal(valid.events[0].competitions[0].competitors[0].team.abbreviation, 'BEARS');

const missingTeam = parseNbaScoreboard(await readFixture('nba-scoreboard-missing-team.json'));
assert.deepEqual(missingTeam, {
  ok: false,
  events: [],
  parserVersion: PARSER_VERSION,
  errorCode: REQUIRED_FIELDS_ERROR,
});
assert.equal(REQUIRED_FIELDS_ERROR, 'nba_scoreboard_parser_required_fields_missing');

console.log('nba-scoreboard-parser: PASS');
