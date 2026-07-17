(function installUnreadEmailStateFeature(global) {
  'use strict';

  const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function normalizeBlockedSenders(input) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {};
    for (const [accountIdRaw, senders] of Object.entries(source)) {
      const accountId = String(accountIdRaw || '').trim();
      if (!accountId) continue;
      const emails = [...new Set((Array.isArray(senders) ? senders : [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter((value) => emailPattern.test(value)))].slice(0, 200);
      if (emails.length) normalized[accountId] = emails;
    }
    return normalized;
  }

  function deleteKey(accountId, mailbox, uid) {
    return [String(accountId || '').trim(), String(mailbox || '').trim(), String(uid || '').trim()].join('::');
  }

  function messageKey(accountId = '', mailbox = '', uid = '') {
    const account = String(accountId || '').trim();
    const box = String(mailbox || '').trim();
    const messageUid = String(uid || '').trim();
    return account && box && messageUid ? deleteKey(account, box, messageUid) : '';
  }

  function payloadKeys(payload) {
    const keys = new Set();
    (Array.isArray(payload?.accounts) ? payload.accounts : []).forEach((account) => {
      const accountId = String(account?.id || '').trim();
      const entries = [...(Array.isArray(account?.entries) ? account.entries : []), ...(Array.isArray(account?.recentEntries) ? account.recentEntries : []), ...(Array.isArray(account?.sentEntries) ? account.sentEntries : [])];
      entries.forEach((entry) => {
        const key = messageKey(accountId, entry?.mailbox, entry?.uid);
        if (key) keys.add(key);
      });
    });
    return keys;
  }

  function payloadSelectionKeys(payload) {
    const keys = new Set();
    (Array.isArray(payload?.accounts) ? payload.accounts : []).forEach((account) => {
      const accountId = String(account?.id || '').trim();
      const entries = [...(Array.isArray(account?.entries) ? account.entries : []), ...(Array.isArray(account?.recentEntries) ? account.recentEntries : []), ...(Array.isArray(account?.sentEntries) ? account.sentEntries : [])];
      entries.forEach((entry) => {
        const mailbox = String(entry?.mailbox || '').trim();
        const uid = Number(entry?.uid);
        if (!accountId || !mailbox || !Number.isFinite(uid) || uid <= 0) return;
        keys.add(deleteKey(accountId, mailbox, uid));
      });
    });
    return keys;
  }

  function pruneSet(set, validKeys) {
    return new Set([...set].filter((key) => validKeys.has(key)));
  }

  function pruneMap(map, validKeys) {
    return new Map([...map.entries()].filter(([key]) => validKeys.has(key)));
  }

  function resolveActiveAccount(accounts = [], activeAccountId = '') {
    const list = Array.isArray(accounts) ? accounts : [];
    if (!list.length) return { account: null, accountId: '', changed: false };
    const currentId = String(activeAccountId || '').trim();
    const account = list.find((item) => String(item?.id || '') === currentId)
      || list.find((item) => String(item?.status || '') === 'fresh')
      || list[0];
    const accountId = String(account?.id || '').trim();
    return { account, accountId, changed: accountId !== currentId };
  }

  function filterBlockedEntries(entries = [], blockedSenders = new Set()) {
    const list = Array.isArray(entries) ? entries : [];
    const blocked = blockedSenders instanceof Set ? blockedSenders : new Set();
    const filtered = list.filter((entry) => {
      const email = String(entry?.counterpartyEmail || '').trim().toLowerCase();
      return !email || !blocked.has(email);
    });
    return { entries: filtered, hiddenCount: Math.max(0, list.length - filtered.length) };
  }

  const api = { normalizeBlockedSenders, deleteKey, messageKey, payloadKeys, payloadSelectionKeys, pruneSet, pruneMap, resolveActiveAccount, filterBlockedEntries };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.unreadEmailState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
