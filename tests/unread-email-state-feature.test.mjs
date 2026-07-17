import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  deleteKey,
  filterBlockedEntries,
  messageKey,
  normalizeBlockedSenders,
  payloadKeys,
  payloadSelectionKeys,
  pruneMap,
  pruneSet,
  resolveActiveAccount,
} = require('../public/app/features/unread-email-state.js');

assert.deepEqual(normalizeBlockedSenders({
  ' account-a ': ['Sender@Example.test', 'sender@example.test', 'not-an-email'],
  '': ['valid@example.test'],
}), { 'account-a': ['sender@example.test'] });

assert.equal(deleteKey(' account-a ', ' INBOX ', 42), 'account-a::INBOX::42');
assert.equal(messageKey('account-a', 'INBOX', 42), 'account-a::INBOX::42');
assert.equal(messageKey('account-a', 'INBOX', ''), '');

const accounts = [
  { id: 'stale', status: 'stale' },
  { id: 'fresh', status: 'fresh' },
];
assert.deepEqual(resolveActiveAccount(accounts, 'stale'), { account: accounts[0], accountId: 'stale', changed: false });
assert.deepEqual(resolveActiveAccount(accounts, 'missing'), { account: accounts[1], accountId: 'fresh', changed: true });
assert.deepEqual(resolveActiveAccount([], 'missing'), { account: null, accountId: '', changed: false });

const payload = {
  accounts: [{
    id: 'account-a',
    entries: [{ mailbox: 'INBOX', uid: 8 }, { mailbox: 'INBOX', uid: 'not-a-number' }],
    recentEntries: [{ mailbox: 'Archive', uid: 9 }],
    sentEntries: [{ mailbox: 'Sent', uid: 10 }],
  }],
};
assert.deepEqual([...payloadKeys(payload)].sort(), [
  'account-a::Archive::9',
  'account-a::INBOX::8',
  'account-a::INBOX::not-a-number',
  'account-a::Sent::10',
]);
assert.deepEqual([...payloadSelectionKeys(payload)].sort(), [
  'account-a::Archive::9',
  'account-a::INBOX::8',
  'account-a::Sent::10',
]);

const validKeys = new Set(['account-a::INBOX::8']);
assert.deepEqual([...pruneSet(new Set(['account-a::INBOX::8', 'missing']), validKeys)], ['account-a::INBOX::8']);
assert.deepEqual([...pruneMap(new Map([['account-a::INBOX::8', 'body'], ['missing', 'body']]), validKeys)], [['account-a::INBOX::8', 'body']]);

assert.deepEqual(filterBlockedEntries([
  { counterpartyEmail: 'blocked@example.test' },
  { counterpartyEmail: 'Allowed@Example.test' },
  { subject: 'No sender' },
], new Set(['blocked@example.test'])), {
  entries: [{ counterpartyEmail: 'Allowed@Example.test' }, { subject: 'No sender' }],
  hiddenCount: 1,
});

console.log('unread-email-state-feature: PASS');
