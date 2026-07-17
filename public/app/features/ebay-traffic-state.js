(function installEbayTrafficStateFeature(global) {
  'use strict';

  function normalizeInsightView(value) {
    const view = String(value || '').trim();
    return view === 'trend' || view === 'promo' ? view : 'sources';
  }

  function normalizeListingsView(value) {
    return String(value || '').trim() === 'watchers' ? 'watchers' : 'traffic';
  }

  function normalizePromoLiftWindow(value) {
    return String(value || '').trim() === 'avg7' ? 'avg7' : 'day';
  }

  function resolveActiveStore(stores = [], activeStoreId = '') {
    const list = Array.isArray(stores) ? stores : [];
    if (!list.length) return { store: null, storeId: '', changed: false };
    const currentId = String(activeStoreId || '').trim();
    const store = list.find((item) => String(item?.id || '') === currentId)
      || list.find((item) => String(item?.status || '') === 'ok')
      || list.find((item) => !!item?.configured)
      || list[0];
    const storeId = String(store?.id || '').trim();
    return { store, storeId, changed: storeId !== currentId };
  }

  function formatNumber(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'n/a';
    if (options.compact) {
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(numeric);
    }
    return new Intl.NumberFormat().format(Math.round(numeric));
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'n/a';
    return `${numeric.toFixed(numeric >= 10 ? 1 : 2).replace(/\.?0+$/, '')}%`;
  }

  function formatDecimal(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'n/a';
    const maximumFractionDigits = Number.isFinite(Number(options.maximumFractionDigits))
      ? Math.max(0, Number(options.maximumFractionDigits))
      : 2;
    const minimumFractionDigits = Number.isFinite(Number(options.minimumFractionDigits))
      ? Math.max(0, Number(options.minimumFractionDigits))
      : (Math.abs(numeric) > 0 && Math.abs(numeric) < 1 ? 1 : 0);
    return new Intl.NumberFormat(undefined, { minimumFractionDigits, maximumFractionDigits }).format(numeric);
  }

  function formatDateTimeLabel(value) {
    const parsed = Date.parse(String(value || '').trim());
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function classifyMarketingReportAge(value, now = Date.now()) {
    const parsed = Date.parse(String(value || '').trim());
    if (!Number.isFinite(parsed)) return null;
    const ageMs = Math.max(0, Number(now) - parsed);
    if (ageMs <= 2 * 60 * 60 * 1000) return { tone: 'fresh', label: 'Fresh report' };
    if (ageMs <= 12 * 60 * 60 * 1000) return { tone: 'warm', label: 'Aging report' };
    return { tone: 'stale', label: 'Older report' };
  }

  function buildListingUrl(listingId, marketplaceId = 'EBAY_US') {
    const itemId = String(listingId || '').trim();
    if (!itemId) return '';
    const marketplace = String(marketplaceId || 'EBAY_US').trim().toUpperCase();
    const hostMap = {
      EBAY_US: 'www.ebay.com', EBAY_MOTORS_US: 'www.ebay.com', EBAY_GB: 'www.ebay.co.uk', EBAY_DE: 'www.ebay.de',
      EBAY_AU: 'www.ebay.com.au', EBAY_CA: 'www.ebay.ca', EBAY_FR: 'www.ebay.fr', EBAY_IT: 'www.ebay.it', EBAY_ES: 'www.ebay.es',
    };
    return `https://${hostMap[marketplace] || 'www.ebay.com'}/itm/${encodeURIComponent(itemId)}`;
  }

  function formatDateLabel(value) {
    const text = String(value || '').trim();
    if (!text) return 'Unknown';
    if (/^\d{8}$/.test(text)) {
      const year = Number(text.slice(0, 4));
      const month = Number(text.slice(4, 6));
      const day = Number(text.slice(6, 8));
      return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split('-').map((item) => Number(item));
      return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed)
      ? new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : text;
  }

  function formatDeltaText(metric, suffix = 'vs previous day') {
    const delta = Number(metric?.deltaPercent);
    if (!Number.isFinite(delta)) return `No prior day ${suffix}`;
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace(/\.0$/, '')}% ${suffix}`;
  }

  function widthClass(width) {
    const normalized = Math.max(0, Math.min(100, Math.round(Number(width) || 0) / 5) * 5);
    return `ebay-traffic-bar-fill ebay-traffic-bar-fill--w-${normalized}`;
  }

  function selectTopListings(store, requestedView = 'traffic') {
    const activeView = normalizeListingsView(requestedView);
    const baseListings = Array.isArray(store?.topListings) ? store.topListings : [];
    const hasWatchCounts = baseListings.some((entry) => Number.isFinite(Number(entry?.watchCount)));
    const listings = activeView === 'watchers'
      ? [...baseListings]
          .filter((entry) => Number.isFinite(Number(entry?.watchCount)))
          .sort((left, right) => Number(right?.watchCount || 0) - Number(left?.watchCount || 0) || Number(right?.views || 0) - Number(left?.views || 0))
      : baseListings;
    return { activeView, listings, hasWatchCounts };
  }

  const api = {
    normalizeInsightView, normalizeListingsView, normalizePromoLiftWindow, resolveActiveStore,
    formatNumber, formatPercent, formatDecimal, formatDateTimeLabel, classifyMarketingReportAge,
    buildListingUrl, formatDateLabel, formatDeltaText, widthClass, selectTopListings,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.ebayTrafficState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
