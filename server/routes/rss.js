'use strict';

function createRssApiHandler({
  sendJson,
  readBody,
  bodyLimit,
  maxFeeds,
  maxEntries,
  fetchFeedXml,
  parseFeedXml,
  createClientAbortSignal,
  isPayloadTooLargeError,
  sendPayloadTooLarge,
}) {
  return async function handleApiRssFetch(req, res) {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use POST /api/rss/fetch.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(await readBody(req, { maxBytes: bodyLimit }));
    } catch (err) {
      if (isPayloadTooLargeError(err)) return sendPayloadTooLarge(res, err);
      return sendJson(res, 400, { ok: false, error: 'invalid_json', message: String(err?.message || err) });
    }

    const urls = [...new Set((Array.isArray(parsed?.feeds) ? parsed.feeds : [])
      .map((value) => String(value || '').trim())
      .filter((value) => /^https?:\/\//i.test(value)))].slice(0, maxFeeds);

    if (!urls.length) {
      return sendJson(res, 400, { ok: false, error: 'missing_feeds', message: 'Provide at least one valid http(s) feed URL in feeds[].' });
    }

    const items = [];
    const errors = [];
    const feedStatus = [];
    const clientRequest = createClientAbortSignal(req, res);

    try {
      for (const url of urls) {
        try {
          const feed = await fetchFeedXml(url, { signal: clientRequest.signal, manual: true });
          const parsedItems = parseFeedXml(feed.xml, url);
          items.push(...parsedItems);
          feedStatus.push({ feedUrl: url, stale: feed.stale, cached: feed.cached, fetchedAt: new Date(feed.fetchedAt).toISOString() });
          if (feed.stale) errors.push({ feedUrl: url, error: feed.errorCode || 'rss_refresh_failed', message: 'Refresh failed; showing the last cached feed.', stale: true });
        } catch (err) {
          errors.push({ feedUrl: url, error: err?.code || 'rss_fetch_failed', message: 'Feed could not be fetched safely.' });
        }
      }
    } finally {
      clientRequest.dispose();
    }

    return sendJson(res, 200, { ok: true, items: items.slice(0, maxFeeds * maxEntries), feeds: feedStatus, errors });
  };
}

module.exports = { createRssApiHandler };
