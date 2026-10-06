import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '359bd05a-c95c-4975-b061-d647e82a6958';
const spaceId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const conversationId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const messageId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function messagingClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/messaging/client.ts', fetch, { '@/features/identity/client': identity });
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [], pagination: { next_cursor: null, has_more: false } });
  });
  async function request(method, route, overrides = {}) {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

function conversation(overrides = {}) {
  return {
    id: conversationId, space_id: spaceId, space_name: 'Morgan family', kind: 'space', title: 'Morgan family',
    participants: [], can_send: true, protection: 'server_encrypted', last_position: '2', read_position: '1',
    unread_count: 1, last_message_at: '2026-09-19T10:01:00Z', created_at: '2026-09-19T10:00:00Z', ...overrides,
  };
}

function message(overrides = {}) {
  return {
    id: messageId, conversation_id: conversationId, position: '1', sender_account_id: accountId, sender_name: 'Alex',
    mine: true, client_message_id: key, status: 'sent', body: 'Hello family', created_at: '2026-09-19T10:01:00Z',
    deleted_at: null, ...overrides,
  };
}

test('Messaging BFF exposes exactly the nine authenticated operations', async () => {
  for (const [method, route] of [
    ['POST', `spaces/${spaceId}/conversations`], ['GET', 'conversations'], ['GET', `conversations/${conversationId}`],
    ['GET', `conversations/${conversationId}/messages`], ['POST', `conversations/${conversationId}/messages`],
    ['POST', `conversations/${conversationId}/read`], ['POST', `conversations/${conversationId}/messages/${messageId}/delete`],
    // Edits and reactions (T162).
    ['POST', `conversations/${conversationId}/messages/${messageId}/edit`], ['POST', `conversations/${conversationId}/messages/${messageId}/reactions`],
  ]) {
    const proxy = bff();
    const response = await proxy.request(method, route);
    assert.equal(response.status, 200, `${method} ${route}`);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const [method, route] of [
    ['GET', `conversations/${conversationId}/read`], ['GET', `conversations/${conversationId}/messages/${messageId}/delete`],
    ['POST', 'conversations'], ['PATCH', `conversations/${conversationId}`], ['POST', `conversations/${conversationId}/messages/${messageId}`],
    ['GET', `spaces/${spaceId}/conversations`], ['POST', `conversations/not-a-uuid/messages`],
    ['GET', `conversations/${conversationId}/messages/${messageId}/reactions`], ['PATCH', `conversations/${conversationId}/messages/${messageId}/edit`],
    ['POST', `conversations/${conversationId}/messages/${messageId}/react`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Messaging BFF forwards only reviewed list parameters and refuses command queries', async () => {
  const list = bff();
  assert.equal((await list.request('GET', `conversations?space_id=${spaceId}&limit=5&cursor=opaque%2Bcursor`)).status, 200);
  const upstream = new URL(list.calls[1].url);
  assert.equal(upstream.searchParams.get('space_id'), spaceId);
  assert.equal(upstream.searchParams.get('cursor'), 'opaque+cursor');
  const page = bff();
  assert.equal((await page.request('GET', `conversations/${conversationId}/messages?limit=30&before=4`)).status, 200);
  assert.equal(new URL(page.calls[1].url).searchParams.get('before'), '4');
  for (const route of [
    'conversations?account_id=other', 'conversations?limit=1&limit=2', `conversations/${conversationId}/messages?cursor=x`,
    `conversations/${conversationId}?limit=1`,
  ]) {
    assert.equal((await bff().request('GET', route)).status, 400, route);
  }
  const command = bff();
  assert.equal((await command.request('POST', `conversations/${conversationId}/messages?sender_id=${otherId}`)).status, 400);
  assert.equal(command.calls.length, 0);
  const foreign = bff();
  assert.equal((await foreign.request('POST', `conversations/${conversationId}/messages`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
  const switched = bff();
  assert.equal((await switched.request('POST', `conversations/${conversationId}/messages`, { 'X-Account-ID': otherId })).status, 409);
  assert.equal(switched.calls.length, 1);
});

test('Send retries keep the same idempotency key and body and confirm the returned message', async () => {
  const calls = [];
  const client = messagingClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: message() }); });
  const intent = { accountId, conversationId, key, body: 'Hello family' };
  await client.sendMessage(intent);
  await client.sendMessage(intent);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.deepEqual(JSON.parse(calls[0].options.body), { body: 'Hello family' });
  for (const changes of [{ client_message_id: otherId }, { conversation_id: spaceId }, { mine: false, client_message_id: null }, { sender_account_id: otherId }]) {
    const wrong = messagingClient(async () => Response.json({ data: message(changes) }));
    await assert.rejects(wrong.sendMessage(intent), { status: 502 });
  }
});

test('Message and conversation schemas reject inconsistent facts', () => {
  const client = messagingClient();
  assert.equal(client.messageSchema.safeParse(message()).success, true);
  assert.equal(client.messageSchema.safeParse(message({ status: 'deleted', body: null, deleted_at: '2026-09-19T10:02:00Z' })).success, true);
  for (const changes of [
    { status: 'deleted', deleted_at: '2026-09-19T10:02:00Z' }, { status: 'sent', body: null }, { position: '0' },
    { position: 1 }, { mine: true, client_message_id: null }, { status: 'unavailable', deleted_at: '2026-09-19T10:02:00Z', body: null },
  ]) {
    assert.equal(client.messageSchema.safeParse(message(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.conversationSchema.safeParse(conversation()).success, true);
  for (const changes of [
    { read_position: '3' }, { last_position: '0' }, { protection: 'end_to_end' }, { kind: 'direct' },
    { participants: [{ account_id: accountId, display_name: 'Alex' }, { account_id: accountId, display_name: 'Alex' }], kind: 'direct' },
  ]) {
    assert.equal(client.conversationSchema.safeParse(conversation(changes)).success, false, JSON.stringify(changes));
  }
});

test('Message pages must be ordered and within the requested direction', async () => {
  const ordered = messagingClient(async () => Response.json({ data: [message({ position: '2', id: otherId }), message({ position: '3' })], pagination: { next_cursor: null, has_more: false } }));
  assert.equal((await ordered.messagePage(accountId, conversationId, { before: '4' })).data.length, 2);
  const reversed = messagingClient(async () => Response.json({ data: [message({ position: '3' }), message({ position: '2', id: otherId })], pagination: { next_cursor: null, has_more: false } }));
  await assert.rejects(reversed.messagePage(accountId, conversationId), { status: 502 });
  const outside = messagingClient(async () => Response.json({ data: [message({ position: '5' })], pagination: { next_cursor: null, has_more: false } }));
  await assert.rejects(outside.messagePage(accountId, conversationId, { before: '4' }), { status: 502 });
  const stale = messagingClient(async () => Response.json({ data: [message({ position: '2' })], pagination: { next_cursor: null, has_more: false } }));
  await assert.rejects(stale.messagePage(accountId, conversationId, { after: '2' }), { status: 502 });
  const foreign = messagingClient(async () => Response.json({ data: [message({ conversation_id: spaceId })], pagination: { next_cursor: null, has_more: false } }));
  await assert.rejects(foreign.messagePage(accountId, conversationId), { status: 502 });
});

test('Opening a conversation must return the chosen Space, kind and participant', async () => {
  const direct = conversation({ kind: 'direct', title: 'Sam', participants: [{ account_id: accountId, display_name: 'Alex' }, { account_id: otherId, display_name: 'Sam' }] });
  const client = messagingClient(async () => Response.json({ data: direct }));
  assert.equal((await client.openConversation(accountId, spaceId, otherId)).id, conversationId);
  await assert.rejects(client.openConversation(accountId, spaceId), { status: 502 });
  const wrongSpace = messagingClient(async () => Response.json({ data: conversation({ space_id: otherId }) }));
  await assert.rejects(wrongSpace.openConversation(accountId, spaceId), { status: 502 });
  const excluded = messagingClient(async () => Response.json({ data: { ...direct, participants: [{ account_id: otherId, display_name: 'Sam' }, { account_id: spaceId, display_name: 'Kim' }] } }));
  await assert.rejects(excluded.openConversation(accountId, spaceId, otherId), { status: 502 });
});

test('Conversation lists require a validated unread total and non-repeating cursor', async () => {
  const valid = messagingClient(async () => Response.json({ data: [conversation()], pagination: { next_cursor: null, has_more: false }, unread_count: 1 }));
  assert.equal((await valid.conversationPage(accountId)).unreadCount, 1);
  for (const payload of [
    { data: [conversation()], pagination: { next_cursor: null, has_more: false } },
    { data: [conversation(), conversation()], pagination: { next_cursor: null, has_more: false }, unread_count: 2 },
    { data: [], pagination: { next_cursor: 'same', has_more: true }, unread_count: 0 },
  ]) {
    const client = messagingClient(async () => Response.json(payload));
    await assert.rejects(client.conversationPage(accountId, 'same'), { status: 502 });
  }
});

test('Conversation unread marker metadata stays compatible with the existing web client', async () => {
  for (const marker of [undefined, 'a'.repeat(64)]) {
    const client = messagingClient(async () => Response.json({
      data: [conversation()], pagination: { next_cursor: null, has_more: false }, unread_count: 1,
      unread_marker: marker,
    }));
    const page = await client.conversationPage(accountId);
    assert.equal(page.unreadCount, 1);
    assert.equal(page.data[0].id, conversationId);
    assert.equal(page.pagination.has_more, false);
  }
});

test('Composer rules and message merging match the server contract', () => {
  const client = messagingClient();
  assert.equal(client.bodyProblem('   '), 'Write a message first.');
  assert.match(client.bodyProblem('x'.repeat(2001)), /2000/);
  assert.equal(client.bodyProblem('\u{1F468}\u200D\u{1F469}'.repeat(600)), null);
  assert.match(client.bodyProblem('spoof\u202e'), /control/);
  assert.equal(client.normalizeBody('  a\r\nb  '), 'a\nb');
  const merged = client.mergeMessages([message({ position: '2', id: otherId }), message()], [message({ status: 'deleted', body: null, deleted_at: '2026-09-19T10:02:00Z' }), message({ position: '3', id: spaceId })]);
  assert.equal(merged.map(item => item.position).join(','), '1,2,3');
  assert.equal(merged[0].status, 'deleted');
});

test('A deleted message stays deleted when an older copy of it arrives late', () => {
  const client = messagingClient();
  const deleted = message({ status: 'deleted', body: null, deleted_at: '2026-09-19T10:02:00Z' });
  const merged = client.mergeMessages([deleted], [message()]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'deleted');
  assert.equal(merged[0].body, null);
});
