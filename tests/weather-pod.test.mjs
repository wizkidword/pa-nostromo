import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderWeatherSnapshot } = require('../public/app/pods/weather.pod.js');

const nodes = {
  weatherWidget: { innerHTML: '' },
  weatherUpdatedAt: { textContent: '' },
};
const snapshot = {
  location: { label: '<Local>' },
  weather: {
    current: { temperature_2m: 72.4, apparent_temperature: 74.2, relative_humidity_2m: 53, weather_code: 61 },
    daily: {
      time: ['2026-07-17', '2026-07-18', '2026-07-19'],
      temperature_2m_max: [78.8, 79.2, 81.1],
      temperature_2m_min: [60.4, 61.1, 63.7],
      weather_code: [61, 0, 95],
    },
  },
};
const ctx = {
  document: { getElementById: (id) => nodes[id] || null },
  escapeText: (value) => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  now: () => new Date('2026-07-17T14:03:05.000Z'),
};

renderWeatherSnapshot(snapshot, {}, ctx);
assert.match(nodes.weatherWidget.innerHTML, /72°/);
assert.match(nodes.weatherWidget.innerHTML, /Light rain/);
assert.match(nodes.weatherWidget.innerHTML, /&lt;Local&gt;/);
assert.match(nodes.weatherWidget.innerHTML, /3-Day Forecast/);
assert.match(nodes.weatherUpdatedAt.textContent, /^Updated:/);

renderWeatherSnapshot(snapshot, { stale: true, retryInMs: 8_000, fetchedAt: '2026-07-17T14:00:00.000Z' }, ctx);
assert.match(nodes.weatherUpdatedAt.textContent, /Showing cached weather/);
assert.match(nodes.weatherUpdatedAt.textContent, /retry in 8s/);
console.log('weather-pod: PASS');
