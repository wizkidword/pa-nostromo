(function installNostromoSafeUi(global) {
  'use strict';

  const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
  const FRAME_HOSTS = Object.freeze([
    'youtube.com',
    'youtube-nocookie.com',
    'youtu.be',
    'player.twitch.tv',
    'twitch.tv',
    'player.kick.com',
    'kick.com',
    'vaughn.live',
    'rumble.com',
    'facebook.com',
    'fb.watch',
    'x.com',
    'twitter.com',
  ]);

  function escapeText(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function escapeAttribute(value) {
    return escapeText(value)
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function hostIsAllowed(hostname, allowedHosts = []) {
    const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    const candidates = (Array.isArray(allowedHosts) ? allowedHosts : [allowedHosts])
      .map((value) => String(value || '').trim().toLowerCase().replace(/^\.+/, ''))
      .filter(Boolean);
    return !candidates.length || candidates.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  }

  function safeWebUrl(input, { allowRelative = false, allowHttp = true, allowedHosts = [] } = {}) {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    if (!raw || CONTROL_CHARACTERS.test(raw) || raw.startsWith('//')) return null;
    if (allowRelative && raw.startsWith('/')) {
      try {
        const parsed = new URL(raw, global.location.origin);
        if (parsed.origin !== global.location.origin) return null;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return null;
      }
    }
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) return null;
      if (!parsed.hostname || parsed.username || parsed.password || !hostIsAllowed(parsed.hostname, allowedHosts)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function safeExternalUrl(input) {
    return safeWebUrl(input, { allowHttp: true });
  }

  function safeFrameUrl(input, { allowedHosts = FRAME_HOSTS, allowSameOrigin = true } = {}) {
    const relative = allowSameOrigin ? safeWebUrl(input, { allowRelative: true, allowHttp: false }) : null;
    if (relative) return relative;
    return safeWebUrl(input, { allowHttp: false, allowedHosts });
  }

  function safeMediaUrl(input) {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    if (raw.startsWith('blob:')) return raw;
    if (raw && !raw.startsWith('//') && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      try {
        const parsed = new URL(raw, global.location.href);
        if (parsed.origin === global.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {}
    }
    const relative = safeWebUrl(raw, { allowRelative: true, allowHttp: false });
    if (relative) return relative;
    return safeWebUrl(raw, { allowHttp: false });
  }

  function safeNavigationUrl(input) {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    if (raw.startsWith('#') && !CONTROL_CHARACTERS.test(raw)) return raw;
    return safeExternalUrl(raw) || safeWebUrl(raw, { allowRelative: true, allowHttp: false });
  }

  function setSafeFrameSource(frame, input, options) {
    if (!frame) return false;
    const url = safeFrameUrl(input, options);
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.src = url || 'about:blank';
    return Boolean(url);
  }

  function setSafeMediaSource(element, input) {
    if (!element) return false;
    const url = safeMediaUrl(input);
    if (!url) {
      element.removeAttribute('src');
      return false;
    }
    element.src = url;
    return true;
  }

  function openExternal(input, features = 'noopener,noreferrer') {
    const url = safeExternalUrl(input);
    if (!url) return null;
    const opened = global.open(url, '_blank', features);
    try { if (opened) opened.opener = null; } catch {}
    return opened;
  }

  function hardenActiveElement(element) {
    if (!(element instanceof global.Element)) return;
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
    const tag = element.tagName.toLowerCase();
    if (tag === 'a' && element.hasAttribute('href')) {
      const url = safeNavigationUrl(element.getAttribute('href'));
      if (!url) {
        element.removeAttribute('href');
      } else {
        element.href = url;
        if (element.target === '_blank') element.rel = 'noopener noreferrer';
      }
    }
    if (tag === 'iframe' && element.hasAttribute('src')) {
      const raw = element.getAttribute('src');
      if (raw && raw !== 'about:blank' && !setSafeFrameSource(element, raw)) element.src = 'about:blank';
    }
    if (['audio', 'video', 'img', 'source'].includes(tag) && element.hasAttribute('src')) {
      const raw = element.getAttribute('src');
      if (raw && !safeMediaUrl(raw)) element.removeAttribute('src');
    }
  }

  function hardenActiveTree(root = global.document) {
    if (!root) return;
    if (root instanceof global.Element) hardenActiveElement(root);
    // Template fragments can contain arbitrary nested elements. Inspect all of
    // them so an event attribute on a descendant cannot bypass the URL-specific
    // selectors above.
    root.querySelectorAll?.('*').forEach(hardenActiveElement);
  }

  function installActiveUrlPolicy() {
    hardenActiveTree();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && (/^on/i.test(record.attributeName || '') || ['href', 'src'].includes(record.attributeName))) {
          hardenActiveElement(record.target);
        }
        for (const node of record.addedNodes) hardenActiveTree(node);
      }
    });
    observer.observe(global.document.documentElement, { childList: true, subtree: true, attributes: true });
    return observer;
  }

  global.NostromoSafeUI = Object.freeze({
    CONTROL_CHARACTERS,
    FRAME_HOSTS,
    escapeAttribute,
    escapeText,
    hostIsAllowed,
    hardenActiveTree,
    installActiveUrlPolicy,
    openExternal,
    safeExternalUrl,
    safeFrameUrl,
    safeMediaUrl,
    safeNavigationUrl,
    safeWebUrl,
    setSafeFrameSource,
    setSafeMediaSource,
  });
}(window));
