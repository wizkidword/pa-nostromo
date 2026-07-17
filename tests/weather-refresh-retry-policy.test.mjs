import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FORECAST_PARSER_ERROR,
  ZIP_PARSER_ERROR,
  fetchWeatherSnapshot,
} = require('../public/app/core/weather-refresh.js');

const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'parsers');
const readFixture = async (name) => JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));
const zipPayload = await readFixture('weather-zip-valid.json');
const missingLocationPayload = await readFixture('weather-zip-missing-location.json');
const weatherPayload = await readFixture('weather-forecast-valid.json');
const missingTemperaturePayload = await readFixture('weather-forecast-missing-temperature.json');

function response({ status = 200, body = {}, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return String(name).toLowerCase() === 'retry-after' ? retryAfter : null; } },
    async json() { return body; },
  };
}

async function testRetriesForecastFailuresAndHonorsRetryAfter() {
  const delays = [];
  const urls = [];
  let calls = 0;
  const result = await fetchWeatherSnapshot('44224', 'America/New_York', {
    healthStore: new Map(),
    random: () => 0,
    async delay(ms) { delays.push(ms); },
    async fetchResponse(url) {
      urls.push(url);
      calls += 1;
      if (calls === 2) return response({ status: 503, retryAfter: '2' });
      return response({ body: calls % 2 === 1 ? zipPayload : weatherPayload });
    },
  });

  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000]);
  assert.match(urls[0], /^https:\/\/api\.zippopotam\.us\/us\/44224$/);
  assert.match(urls[1], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.equal(result.location.label, 'Stow, OH');
  assert.equal(result.weather.current.temperature_2m, 72);
}

async function testParserDriftIsNotRetried() {
  let calls = 0;
  await assert.rejects(
    () => fetchWeatherSnapshot('44224', 'America/New_York', {
      healthStore: new Map(),
      async fetchResponse() {
        calls += 1;
        return response({ body: missingLocationPayload });
      },
    }),
    (error) => error?.code === ZIP_PARSER_ERROR,
  );
  assert.equal(calls, 1);

  let forecastCalls = 0;
  await assert.rejects(
    () => fetchWeatherSnapshot('44224', 'America/New_York', {
      healthStore: new Map(),
      async fetchResponse() {
        forecastCalls += 1;
        return response({ body: forecastCalls === 1 ? zipPayload : missingTemperaturePayload });
      },
    }),
    (error) => error?.code === FORECAST_PARSER_ERROR,
  );
  assert.equal(forecastCalls, 2);
}

async function testCooldownSkipsRepeatedTemporaryFailures() {
  const healthStore = new Map();
  let calls = 0;
  const options = {
    healthStore,
    now: () => 1000,
    random: () => 0,
    async delay() {},
    async fetchResponse() {
      calls += 1;
      return response({ status: 503 });
    },
  };

  await assert.rejects(() => fetchWeatherSnapshot('44224', 'America/New_York', options));
  await assert.rejects(
    () => fetchWeatherSnapshot('44224', 'America/New_York', options),
    (error) => error?.code === 'provider_temporarily_unhealthy',
  );
  assert.equal(calls, 2, 'the first refresh retries once, then cooldown skips the next refresh');
}

await testRetriesForecastFailuresAndHonorsRetryAfter();
await testParserDriftIsNotRetried();
await testCooldownSkipsRepeatedTemporaryFailures();
console.log('weather-refresh-retry-policy: PASS');
