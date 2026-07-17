(function installRssStateFeature(global) {
  'use strict';

  function normalizeState(input, { createId = () => '', getNow = () => '', defaultRefreshMin = 30 } = {}) {
    const raw = input || {};
    const feeds = Array.isArray(raw.feeds)
      ? raw.feeds.map((feed) => ({
        id: String(feed?.id || createId()),
        url: String(feed?.url || '').trim(),
        tag: String(feed?.tag || '').trim().slice(0, 40),
        addedAt: feed?.addedAt || getNow(),
      })).filter((feed) => /^https?:\/\//i.test(feed.url))
        .sort((left, right) => String(left.addedAt || '').localeCompare(String(right.addedAt || '')) || String(left.id || '').localeCompare(String(right.id || '')))
      : [];
    const items = Array.isArray(raw.items)
      ? raw.items.map((item) => ({
        id: String(item?.id || '').trim(),
        feedId: String(item?.feedId || '').trim(),
        title: String(item?.title || 'Untitled').trim() || 'Untitled',
        link: String(item?.link || '').trim(),
        summary: String(item?.summary || '').trim(),
        publishedAt: String(item?.publishedAt || '').trim(),
        feedTitle: String(item?.feedTitle || '').trim(),
        tag: String(item?.tag || '').trim(),
      })).filter((item) => item.id && /^https?:\/\//i.test(item.link))
      : [];
    const refresh = Number(raw.refreshIntervalMin || defaultRefreshMin);

    return Object.assign({
      feeds: [],
      items: [],
      readItemIds: [],
      showRead: false,
      refreshIntervalMin: defaultRefreshMin,
      lastUpdatedAt: '',
      lastError: '',
    }, raw, {
      feeds,
      items,
      readItemIds: [...new Set((Array.isArray(raw.readItemIds) ? raw.readItemIds : []).map((value) => String(value || '').trim()).filter(Boolean))],
      showRead: !!raw.showRead,
      refreshIntervalMin: Number.isFinite(refresh) ? Math.min(180, Math.max(5, Math.round(refresh))) : defaultRefreshMin,
      lastUpdatedAt: String(raw.lastUpdatedAt || ''),
      lastError: String(raw.lastError || '').slice(0, 300),
    });
  }

  const api = { normalizeState };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.rssState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
