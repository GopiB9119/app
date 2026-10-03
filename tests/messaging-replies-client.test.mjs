// Chat replies, reactions and edits in the web client (DEC-033, T162).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '359bd05a-c95c-4975-b061-d647e82a6958';
const conversationId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const messageId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const originalId = '8c3fbd31-2c9a-4f88-9d5d-4c4ca09c4d04';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: 'https://client.example.test' } },
  }, { filename: relative });
  return exports;
}

function messagingClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/messaging/client.ts', fetch, { '@/features/identity/client': identity });
}

function recording(respond) {
  const calls = [];
  const client = messagingClient(async (url, options) => {
    calls.push({ url: String(url), body: options?.body ? JSON.parse(options.body) : undefined });
    return Response.json({ data: respond(calls.at(-1)) });
  });
  return { calls, client };
}

function message(overrides = {}) {
  return {
    id: messageId, conversation_id: conversationId, position: '2', sender_account_id: accountId, sender_name: 'Alex',
    mine: true, client_message_id: key, status: 'sent', body: 'Works for me', created_at: '2026-09-19T10:01:00Z',
    deleted_at: null, edited_at: null, reply_to: null, reactions: [], revision: 1, ...overrides,
  };
}

const reply = { message_id: originalId, status: 'sent', position: '1', sender_name: 'Sam', excerpt: 'Dinner at 8' };

test('Replies, reactions and edits are validated, and older servers still parse', () => {
  const client = messagingClient();
  const { edited_at, reply_to, reactions, revision, ...older } = message();
  const parsed = client.messageSchema.parse(older);
  assert.equal(parsed.revision, 1); assert.equal(parsed.reply_to, null); assert.equal(parsed.reactions.length, 0); assert.equal(parsed.edited_at, null);
  for (const valid of [
    { reply_to: reply }, { reply_to: { ...reply, status: 'deleted', excerpt: null } },
    { reply_to: { message_id: originalId, status: 'unavailable', position: null, sender_name: null, excerpt: null } },
    { reactions: [{ reaction: 'like', count: 2, mine: true }, { reaction: 'thanks', count: 1, mine: false }], revision: 4 },
    { edited_at: '2026-09-19T10:05:00Z', revision: 2 },
  ]) assert.equal(client.messageSchema.safeParse(message(valid)).success, true, JSON.stringify(valid));
  for (const invalid of [
    { reply_to: { ...reply, excerpt: null } }, { reply_to: { ...reply, status: 'deleted' } },
    { reply_to: { ...reply, status: 'unavailable', position: null, excerpt: null } }, { reply_to: { ...reply, message_id: messageId } },
    { reactions: [{ reaction: 'thanks', count: 1, mine: false }, { reaction: 'like', count: 1, mine: false }] },
    { reactions: [{ reaction: 'like', count: 1, mine: false }, { reaction: 'like', count: 2, mine: true }] },
    { reactions: [{ reaction: 'fire', count: 1, mine: false }] }, { reactions: [{ reaction: 'like', count: 0, mine: false }] },
    { status: 'deleted', body: null, deleted_at: '2026-09-19T10:02:00Z', reactions: [{ reaction: 'like', count: 1, mine: false }] },
    { revision: 0 },
  ]) assert.equal(client.messageSchema.safeParse(message(invalid)).success, false, JSON.stringify(invalid));
});

test('A reply names what it answers and a plain message sends exactly what it always did', async () => {
  const { calls, client } = recording(() => message({ reply_to: reply }));
  const sent = await client.sendMessage({ accountId, conversationId, key, body: 'Works for me', replyTo: originalId });
  assert.equal(sent.reply_to.excerpt, 'Dinner at 8');
  assert.deepEqual(calls[0].body, { body: 'Works for me', reply_to_message_id: originalId });
  const plain = recording(() => message());
  await plain.client.sendMessage({ accountId, conversationId, key, body: 'Works for me' });
  assert.deepEqual(Object.keys(plain.calls[0].body), ['body']);
  // A server that answers something else, or nothing, has not confirmed the reply.
  for (const answered of [null, { ...reply, message_id: otherId }]) {
    const wrong = recording(() => message({ reply_to: answered }));
    await assert.rejects(wrong.client.sendMessage({ accountId, conversationId, key, body: 'Works for me', replyTo: originalId }), { status: 502 });
  }
});

test('Edits and reactions go to their own commands and must be confirmed', async () => {
  const edit = recording(() => message({ body: 'Dinner at 9', edited_at: '2026-09-19T10:05:00Z', revision: 2 }));
  assert.equal((await edit.client.editMessage(accountId, conversationId, messageId, 'Dinner at 9')).body, 'Dinner at 9');
  assert.equal(edit.calls[0].url, `/api/conversations/${conversationId}/messages/${messageId}/edit`);
  assert.deepEqual(edit.calls[0].body, { body: 'Dinner at 9' });
  const deleted = recording(() => message({ status: 'deleted', body: null, deleted_at: '2026-09-19T10:02:00Z' }));
  await assert.rejects(deleted.client.editMessage(accountId, conversationId, messageId, 'Dinner at 9'), { status: 502 });

  const react = recording(() => message({ reactions: [{ reaction: 'love', count: 1, mine: true }], revision: 2 }));
  await react.client.reactToMessage(accountId, conversationId, messageId, 'love', true);
  assert.equal(react.calls[0].url, `/api/conversations/${conversationId}/messages/${messageId}/reactions`);
  assert.deepEqual(react.calls[0].body, { reaction: 'love', on: true });
  // Taking it back is confirmed only once it is no longer the caller's.
  await assert.rejects(react.client.reactToMessage(accountId, conversationId, messageId, 'love', false), { status: 502 });
  const taken = recording(() => message({ reactions: [{ reaction: 'love', count: 1, mine: false }], revision: 3 }));
  assert.equal((await taken.client.reactToMessage(accountId, conversationId, messageId, 'love', false)).revision, 3);
});

test('An older copy cannot undo an edit or reaction, and editing closes after 15 minutes', () => {
  const client = messagingClient();
  const newer = client.messageSchema.parse(message({ body: 'Dinner at 9', edited_at: '2026-09-19T10:05:00Z', revision: 3 }));
  const older = client.messageSchema.parse(message({ revision: 2 }));
  assert.equal(client.mergeMessages([newer], [older])[0].body, 'Dinner at 9');
  assert.equal(client.mergeMessages([older], [newer])[0].body, 'Dinner at 9');
  const deleted = client.messageSchema.parse(message({ status: 'deleted', body: null, deleted_at: '2026-09-19T10:06:00Z', revision: 4 }));
  assert.equal(client.mergeMessages([deleted], [newer])[0].status, 'deleted');
  const sent = Date.parse('2026-09-19T10:01:00Z');
  assert.equal(client.editable(older, sent + 14 * 60 * 1000), true);
  assert.equal(client.editable(older, sent + 15 * 60 * 1000), false);
  assert.equal(client.editable(client.messageSchema.parse(message({ mine: false, client_message_id: null })), sent), false);
});
