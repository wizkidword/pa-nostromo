(function registerWeatherPod(global) {
  'use strict';

  const root = global.MissionControlModules = global.MissionControlModules || {};
  const registry = root.podRegistry;
  const debug = root.debug;

  function renderWeatherSnapshot(snapshot, { stale = false, retryInMs = 0, fetchedAt = '' } = {}, ctx = {}) {
    const documentRef = ctx.document || global.document;
    const element = documentRef?.getElementById?.('weatherWidget');
    if (!element) return;
    const escapeText = typeof ctx.escapeText === 'function' ? ctx.escapeText : (value) => String(value ?? '');
    const current = snapshot.weather?.current || {};
    const daily = snapshot.weather?.daily || {};
    const high = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
    const low = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
    const times = Array.isArray(daily.time) ? daily.time : [];
    const highs = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const lows = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
    const codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
    const codeMap = {
      0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
      80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers', 95: 'Thunderstorm',
    };
    const iconForCode = (code) => {
      if (code === 0) return '☀️';
      if ([1, 2].includes(code)) return '🌤️';
      if (code === 3) return '☁️';
      if ([45, 48].includes(code)) return '🌫️';
      if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return '🌧️';
      if ([71, 73, 75].includes(code)) return '❄️';
      if (code === 95) return '⛈️';
      return '🌡️';
    };
    const forecast = times.slice(0, 3).map((date, index) => {
      const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
      const code = Number(codes[index]);
      const condition = codeMap[code] || 'Conditions';
      const forecastHigh = highs[index] != null ? Math.round(highs[index]) : '--';
      const forecastLow = lows[index] != null ? Math.round(lows[index]) : '--';
      return `
        <div class="forecast-item date-forecast-item">
          <div class="forecast-day">${escapeText(day)}</div>
          <div class="forecast-icon">${escapeText(iconForCode(code))}</div>
          <div class="forecast-cond">${escapeText(condition)}</div>
          <div class="forecast-temp">H ${forecastHigh}° / L ${forecastLow}°</div>
        </div>
      `;
    }).join('');
    const description = codeMap[current.weather_code] || 'Current conditions';

    element.innerHTML = `
      <div class="date-weather-shell">
        <div class="date-weather-current">
          <div class="date-weather-temp">${Math.round(current.temperature_2m ?? 0)}°</div>
          <div class="date-weather-summary">
            <div class="date-weather-condition">${escapeText(description)}</div>
            <div class="date-weather-location">${escapeText(snapshot.location?.label || 'Local weather')}</div>
          </div>
        </div>
        <div class="date-weather-facts">
          <div class="date-weather-fact">
            <span>Feels like</span>
            <strong>${Math.round(current.apparent_temperature ?? 0)}°F</strong>
          </div>
          <div class="date-weather-fact">
            <span>Humidity</span>
            <strong>${escapeText(current.relative_humidity_2m ?? '--')}%</strong>
          </div>
          <div class="date-weather-fact">
            <span>Today</span>
            <strong>H ${high != null ? Math.round(high) : '--'}° / L ${low != null ? Math.round(low) : '--'}°</strong>
          </div>
        </div>
        <div class="date-weather-forecast-head">
          <strong>3-Day Forecast</strong>
          <span>Quick look ahead</span>
        </div>
        <div class="forecast-row date-weather-forecast">${forecast}</div>
      </div>
    `;
    const timestamp = documentRef?.getElementById?.('weatherUpdatedAt');
    if (stale) {
      const cachedAt = fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : 'earlier';
      if (timestamp) timestamp.textContent = `Showing cached weather from ${cachedAt}; retry in ${Math.ceil(retryInMs / 1000)}s`;
      return;
    }
    const updatedAt = typeof ctx.now === 'function' ? new Date(ctx.now()) : new Date();
    if (timestamp) timestamp.textContent = `Updated: ${updatedAt.toLocaleTimeString()}`;
  }

  const api = { renderWeatherSnapshot };
  root.weatherPod = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (!registry || typeof registry.register !== 'function') return;

  async function invokeRender(renderLegacy, podId, reason) {
    if (typeof renderLegacy !== 'function') return;
    try {
      const out = renderLegacy();
      if (out && typeof out.then === 'function') await out;
      debug?.bumpRefresh?.(podId, reason);
      return out;
    } catch {
      debug?.bumpRefresh?.(podId, 'refresh_failed');
      throw new Error(`Weather pod ${reason} failed.`);
    }
  }

  registry.register({
    id: 'weather',
    title: 'Weather',
    version: '1.3.0',
    description: 'Weather pod with feature-owned display rendering; the shared scheduler owns refresh cadence.',
    render(ctx = {}) {
      const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderWeather;
      return invokeRender(renderLegacy, 'weather', 'render_call');
    },
    lifecycle: {
      init() {},
      refresh(ctx = {}) {
        const renderLegacy = typeof ctx.legacyRender === 'function' ? ctx.legacyRender : global.renderWeather;
        return invokeRender(renderLegacy, 'weather', ctx.trigger === 'scheduled' ? 'scheduler_refresh' : 'refresh_call');
      },
      destroy() {},
      mount() {},
      unmount() {},
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
