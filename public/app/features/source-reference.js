(function installMissionControlSourceReferenceFeature(global) {
  'use strict';

  const SOURCE_TYPES = Object.freeze(['email', 'rss', 'ebay', 'social']);
  const sourceTypeSet = new Set(SOURCE_TYPES);
  const TYPE_LABELS = Object.freeze({
    email: 'Email',
    rss: 'RSS item',
    ebay: 'eBay item',
    social: 'Social signal',
  });

  function cleanText(value, limit) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  function safeUrl(value) {
    const raw = cleanText(value, 600);
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
      return '';
    }
  }

  function normalizeSourceReference(input) {
    const type = cleanText(input?.type, 20).toLowerCase();
    const externalId = cleanText(input?.externalId, 180);
    const title = cleanText(input?.title, 180);
    if (!sourceTypeSet.has(type) || !externalId || !title) return null;
    // Email references intentionally keep no URL: the message body, sender, and mailbox URL stay out of action state.
    return Object.freeze({
      type,
      externalId,
      title,
      url: type === 'email' ? '' : safeUrl(input?.url),
    });
  }

  function sourceLabel(reference) {
    const normalized = normalizeSourceReference(reference);
    return normalized ? `${TYPE_LABELS[normalized.type]}: ${normalized.title}` : '';
  }

  function actionTitle(reference, action) {
    const normalized = normalizeSourceReference(reference);
    if (!normalized) return '';
    const prefix = action === 'reminder' ? 'Review' : action === 'note' ? 'Note: ' : '';
    return cleanText(`${prefix}${normalized.title}`, 180);
  }

  const api = { SOURCE_TYPES, TYPE_LABELS, cleanText, safeUrl, normalizeSourceReference, sourceLabel, actionTitle };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.sourceReference = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
