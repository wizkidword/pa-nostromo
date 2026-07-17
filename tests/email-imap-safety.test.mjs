import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  fetchGmailImapMessageBody,
  moveGmailImapMessagesToTrash,
} = require('../lib/email-imap.js');

function fetchMessageIdResponse(uid, messageId = '<mail-42@example.test>') {
  const headers = `Message-ID: ${messageId}\r\n`;
  return `* 1 FETCH (UID ${uid} BODY[HEADER.FIELDS (MESSAGE-ID)] {${headers.length}}\r\n${headers})\r\n`;
}

function createFakeSession({ capabilities = [], targetPresent = false, failCommand } = {}) {
  const commands = [];
  return {
    commands,
    session: {
      async command(command) {
        commands.push(command);
        if (typeof failCommand === 'function') {
          const error = failCommand(command);
          if (error) throw error;
        }
        if (command === 'CAPABILITY') return `* CAPABILITY IMAP4rev1 ${capabilities.join(' ')}\r\n`;
        if (/UID FETCH \d+ \(UID BODY\.PEEK\[HEADER\.FIELDS \(MESSAGE-ID\)\]\)/.test(command)) {
          const uid = Number(command.match(/UID FETCH (\d+)/)?.[1]);
          return fetchMessageIdResponse(uid);
        }
        if (command.startsWith('UID SEARCH HEADER MESSAGE-ID')) return targetPresent ? '* SEARCH 100\r\n' : '* SEARCH\r\n';
        return '* OK\r\n';
      },
      async close() {},
    },
  };
}

async function moveWithCapabilities(capabilities) {
  const fake = createFakeSession({ capabilities });
  const result = await moveGmailImapMessagesToTrash({
    username: 'user@example.test',
    password: 'app-password',
    items: [{ mailbox: 'INBOX', uid: 42 }],
    trashMailboxNames: ['Trash'],
    sessionFactory: async () => fake.session,
  });
  return { result, commands: fake.commands };
}

{
  const { result, commands } = await moveWithCapabilities(['MOVE', 'UIDPLUS']);
  assert.equal(result.items[0].status, 'moved');
  assert.ok(commands.includes('UID MOVE 42 "Trash"'));
  assert.equal(commands.some((command) => command.startsWith('UID COPY')), false);
  assert.equal(commands.includes('EXPUNGE'), false);
}

{
  const { result, commands } = await moveWithCapabilities(['MOVE']);
  assert.equal(result.items[0].status, 'moved');
  assert.ok(commands.includes('UID MOVE 42 "Trash"'));
  assert.equal(commands.some((command) => command.startsWith('UID EXPUNGE')), false);
  assert.equal(commands.includes('EXPUNGE'), false);
}

{
  const { result, commands } = await moveWithCapabilities(['UIDPLUS']);
  assert.equal(result.items[0].status, 'copied_and_expunged');
  assert.ok(commands.includes('UID COPY 42 "Trash"'));
  assert.ok(commands.includes('UID STORE 42 +FLAGS.SILENT (\\Deleted)'));
  assert.ok(commands.includes('UID EXPUNGE 42'));
  assert.equal(commands.includes('EXPUNGE'), false);
}

{
  const { result, commands } = await moveWithCapabilities([]);
  assert.equal(result.items[0].status, 'expunge_deferred');
  assert.equal(result.items[0].expungeDeferred, true);
  assert.ok(commands.includes('UID COPY 42 "Trash"'));
  assert.equal(commands.some((command) => /EXPUNGE/.test(command)), false);
}

{
  const fake = createFakeSession({
    capabilities: ['UIDPLUS'],
    failCommand: (command) => command.startsWith('UID STORE 2 ') ? new Error('IMAP server disconnected') : null,
  });
  const result = await moveGmailImapMessagesToTrash({
    username: 'user@example.test',
    password: 'app-password',
    items: [{ mailbox: 'INBOX', uid: 1 }, { mailbox: 'INBOX', uid: 2 }],
    trashMailboxNames: ['Trash'],
    sessionFactory: async () => fake.session,
  });
  assert.equal(result.items[0].status, 'copied_and_expunged');
  assert.equal(result.items[1].status, 'failed');
  assert.equal(result.ok, false);
}

{
  const first = createFakeSession({
    capabilities: ['UIDPLUS'],
    failCommand: (command) => command.startsWith('UID STORE 42 ') ? new Error('connection lost after copy') : null,
  });
  const firstResult = await moveGmailImapMessagesToTrash({
    username: 'user@example.test', password: 'app-password', items: [{ mailbox: 'INBOX', uid: 42 }], trashMailboxNames: ['Trash'], sessionFactory: async () => first.session,
  });
  assert.equal(firstResult.items[0].status, 'failed');
  assert.ok(first.commands.includes('UID COPY 42 "Trash"'));

  const retry = createFakeSession({ capabilities: ['UIDPLUS'], targetPresent: true });
  const retryResult = await moveGmailImapMessagesToTrash({
    username: 'user@example.test', password: 'app-password', items: [{ mailbox: 'INBOX', uid: 42 }], trashMailboxNames: ['Trash'], sessionFactory: async () => retry.session,
  });
  assert.equal(retryResult.items[0].status, 'completed_after_retry');
  assert.equal(retry.commands.some((command) => command.startsWith('UID COPY')), false);
  assert.ok(retry.commands.includes('UID EXPUNGE 42'));
}

{
  let created = false;
  await assert.rejects(
    moveGmailImapMessagesToTrash({
      username: 'user@example.test', password: 'app-password', items: [{ mailbox: 'INBOX\r\nUID EXPUNGE 1', uid: 1 }],
      sessionFactory: async () => { created = true; return createFakeSession().session; },
    }),
    /control characters/i,
  );
  assert.equal(created, false);
}

{
  const largeBody = 'x'.repeat(70 * 1024);
  const fake = createFakeSession();
  fake.session.command = async (command) => {
    fake.commands.push(command);
    if (command === 'CAPABILITY') return '* CAPABILITY IMAP4rev1\r\n';
    if (command.includes('BODYSTRUCTURE')) return '* 1 FETCH (UID 7 BODYSTRUCTURE ("TEXT" "PLAIN"))\r\n';
    if (command.includes('BODY.PEEK[1]')) return `* 1 FETCH (UID 7 BODY[1]<0> {${largeBody.length}}\r\n${largeBody})\r\n`;
    return '* OK\r\n';
  };
  const result = await fetchGmailImapMessageBody({
    username: 'user@example.test', password: 'app-password', mailbox: 'INBOX', uid: 7, sessionFactory: async () => fake.session,
  });
  assert.equal(result.bodyTruncated, true);
  assert.ok(result.bodyText.length <= 64 * 1024);
  assert.ok(fake.commands.some((command) => command.includes('BODYSTRUCTURE')));
  assert.ok(fake.commands.some((command) => command.includes('BODY.PEEK[1]<0.65536>')));
}

{
  const fake = createFakeSession();
  fake.session.command = async (command) => {
    fake.commands.push(command);
    if (command === 'CAPABILITY') return '* CAPABILITY IMAP4rev1\r\n';
    if (command.includes('BODYSTRUCTURE')) return '* malformed fetch response\r\n';
    if (command.includes('BODY.PEEK[TEXT]')) return '* malformed body response\r\n';
    return '* OK\r\n';
  };
  const result = await fetchGmailImapMessageBody({
    username: 'user@example.test', password: 'app-password', mailbox: 'INBOX', uid: 7, sessionFactory: async () => fake.session,
  });
  assert.equal(result.bodyText, '');
  assert.equal(result.bodyTruncated, false);
}

console.log('email-imap-safety: PASS');
