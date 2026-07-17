(function installSocialFollowersAnalyticsFeature(global) {
  'use strict';

  const rangeWindows = Object.freeze({
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    all: 0,
  });

  function hasMetricValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function formatMetricValue(value) {
    if (!hasMetricValue(value)) return 'n/a';
    const numeric = Number(value);
    return (numeric > 0 ? '+' : '') + new Intl.NumberFormat().format(numeric);
  }

  function formatAge(ageMs) {
    if (!Number.isFinite(Number(ageMs))) return 'unknown';
    const minutes = Math.max(0, Math.floor(Number(ageMs) / 60000));
    if (minutes < 1) return '0m ago';
    if (minutes < 60) return String(minutes) + 'm ago';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? String(hours) + 'h ' + String(remainingMinutes) + 'm ago' : String(hours) + 'h ago';
  }

  function formatDuration(durationMs) {
    if (!Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) return 'n/a';
    const minutes = Math.max(1, Math.round(Number(durationMs) / 60000));
    if (minutes < 60) return String(minutes) + 'm';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? String(hours) + 'h ' + String(remainingMinutes) + 'm' : String(hours) + 'h';
  }

  function formatTimestamp(value) {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) return 'n/a';
    return new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function normalizeHistory(history, valueKey = 'followersCount') {
    return (Array.isArray(history) ? history : [])
      .map((entry) => {
        const value = Number(entry?.[valueKey]);
        const fetchedAt = String(entry?.fetchedAt || '');
        const timestamp = Date.parse(fetchedAt);
        return Number.isFinite(value) && Number.isFinite(timestamp) ? { value, fetchedAt, ts: timestamp } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.ts - right.ts);
  }

  function averageInterval(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    let totalMs = 0;
    for (let index = 1; index < history.length; index += 1) totalMs += history[index].ts - history[index - 1].ts;
    return totalMs > 0 ? totalMs / (history.length - 1) : null;
  }

  function filterHistoryByRange(history, rangeKey) {
    const points = Array.isArray(history) ? history : [];
    if (!points.length) return points;
    const windowMs = rangeWindows[rangeKey];
    if (!windowMs) return points;
    const cutoff = points[points.length - 1].ts - windowMs;
    const filtered = points.filter((entry) => entry.ts >= cutoff);
    return filtered.length >= 2 ? filtered : points.slice(-Math.min(points.length, 2));
  }

  function buildPointDiffs(history) {
    const points = Array.isArray(history) ? history : [];
    const diffs = [];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      diffs.push({
        delta: current.value - previous.value,
        startTs: previous.ts,
        endTs: current.ts,
        durationMs: current.ts - previous.ts,
        startValue: previous.value,
        endValue: current.value,
      });
    }
    return diffs;
  }

  function formatRatePerHour(value) {
    if (!Number.isFinite(Number(value))) return 'n/a';
    const numeric = Number(value);
    return (numeric > 0 ? '+' : '') + numeric.toFixed(Math.abs(numeric) >= 10 ? 0 : 1) + '/h';
  }

  function computeWindowStats(history) {
    const points = Array.isArray(history) ? history : [];
    const diffs = buildPointDiffs(points);
    if (!points.length) {
      return {
        net: null, spanMs: null, avgPerHour: null, bestGain: null, worstDrop: null,
        momentum: null, sampleCount: 0, startValue: null, endValue: null,
      };
    }
    const startValue = points[0].value;
    const endValue = points[points.length - 1].value;
    const spanMs = points.length > 1 ? points[points.length - 1].ts - points[0].ts : null;
    const net = Number.isFinite(startValue) && Number.isFinite(endValue) ? endValue - startValue : null;
    const avgPerHour = Number.isFinite(net) && Number.isFinite(spanMs) && spanMs > 0 ? (net / spanMs) * (60 * 60 * 1000) : null;
    const bestGain = diffs.length ? Math.max(...diffs.map((entry) => entry.delta)) : null;
    const worstDrop = diffs.length ? Math.min(...diffs.map((entry) => entry.delta)) : null;
    const midpoint = Math.floor(diffs.length / 2);
    const firstHalf = midpoint > 0 ? diffs.slice(0, midpoint) : [];
    const secondHalf = diffs.length > midpoint ? diffs.slice(midpoint) : [];
    const toRate = (items) => {
      const totalDelta = items.reduce((sum, item) => sum + item.delta, 0);
      const totalMs = items.reduce((sum, item) => sum + item.durationMs, 0);
      return totalMs > 0 ? (totalDelta / totalMs) * (60 * 60 * 1000) : null;
    };
    const firstRate = toRate(firstHalf);
    const secondRate = toRate(secondHalf);
    const momentum = Number.isFinite(firstRate) && Number.isFinite(secondRate) ? secondRate - firstRate : null;
    return { net, spanMs, avgPerHour, bestGain, worstDrop, momentum, sampleCount: points.length, startValue, endValue };
  }

  function buildDailyRollups(history) {
    const points = Array.isArray(history) ? history : [];
    const grouped = new Map();
    for (const point of points) {
      const date = new Date(point.ts);
      const dayKey = String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      if (!grouped.has(dayKey)) grouped.set(dayKey, []);
      grouped.get(dayKey).push(point);
    }
    return Array.from(grouped.entries()).map(([dayKey, items]) => {
      const first = items[0];
      const last = items[items.length - 1];
      return {
        dayKey,
        label: new Date(first.ts).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        open: first.value,
        close: last.value,
        net: last.value - first.value,
        high: Math.max(...items.map((item) => item.value)),
        low: Math.min(...items.map((item) => item.value)),
        samples: items.length,
      };
    }).sort((left, right) => left.dayKey.localeCompare(right.dayKey));
  }

  function normalizeContentItems(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const code = String(item?.code || '').trim();
        if (!code) return null;
        const toNumberOrNull = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
        const likeCount = toNumberOrNull(item?.likeCount);
        const commentCount = toNumberOrNull(item?.commentCount);
        const shareCount = toNumberOrNull(item?.shareCount) ?? toNumberOrNull(item?.repostCount);
        const saveCount = toNumberOrNull(item?.saveCount);
        const reachCount = toNumberOrNull(item?.reachCount);
        const viewCount = toNumberOrNull(item?.viewCount);
        const interactionCount = toNumberOrNull(item?.interactionCount)
          ?? (likeCount || 0) + (commentCount || 0) + (shareCount || 0) + (saveCount || 0);
        return {
          code,
          permalink: String(item?.permalink || '').trim(),
          caption: String(item?.caption || '').replace(/\s+/g, ' ').trim(),
          takenAt: String(item?.takenAt || '').trim(),
          productType: String(item?.productType || '').trim(),
          likeCount, commentCount, shareCount, saveCount, reachCount, repostCount: shareCount, viewCount, interactionCount,
        };
      })
      .filter(Boolean);
  }

  function formatSocialMetric(value) {
    return Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : 'n/a';
  }

  function formatContentType(item) {
    const type = String(item?.productType || '').trim().toLowerCase();
    if (type === 'clips') return 'Reel';
    if (type === 'carousel_container') return 'Carousel';
    return type ? type.replace(/_/g, ' ') : 'Post';
  }

  function trimCaption(text, maxLen = 160) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'No caption';
    return clean.length <= maxLen ? clean : clean.slice(0, Math.max(24, maxLen - 1)).trimEnd() + '...';
  }

  function summarizeStatus(networks) {
    let fresh = 0;
    let stale = 0;
    let issue = 0;
    for (const network of Array.isArray(networks) ? networks : []) {
      const level = String(network?.staleLevel || 'critical');
      if (level === 'fresh') fresh += 1;
      else if (level === 'stale') stale += 1;
      else issue += 1;
    }
    if (!Array.isArray(networks) || !networks.length) return { mode: 'neutral', detail: 'idle' };
    if (!stale && !issue) return { mode: 'fresh', detail: String(fresh) + ' live' };
    if (issue && !fresh && !stale) return { mode: 'error', detail: 'all blocked' };
    if (issue) return { mode: 'degraded', detail: String(fresh) + ' live · ' + String(issue) + ' issue' + (issue === 1 ? '' : 's') };
    return { mode: 'stale', detail: String(fresh) + ' live · ' + String(stale) + ' stale' };
  }

  const api = {
    rangeWindows, hasMetricValue, formatMetricValue, formatAge, formatDuration, formatTimestamp,
    normalizeHistory, averageInterval, filterHistoryByRange, buildPointDiffs, formatRatePerHour,
    computeWindowStats, buildDailyRollups, normalizeContentItems, formatSocialMetric, formatContentType,
    trimCaption, summarizeStatus,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.socialFollowersAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
