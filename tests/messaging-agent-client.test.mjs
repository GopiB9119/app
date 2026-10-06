// @agent in a chat message on the web (DEC-046, T212).
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
const agentId = 'f0e1d2c3-b4a5-5968-8778-695a4b3c2d1e';
const conversationId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const messageId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const runId = '8c3fbd31-2c9a-4f88-9d5d-4c4ca09c4d04';
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

function message(overrides = {}) {
  return {
    id: messageId, conversation_id: conversationId, position: '2', sender_account_id: accountId, sender_name: 'Alex',
    mine: true, client_message_id: key, status: 'sent', body: '@agent help', created_at: '2026-09-19T10:01:00Z',
    deleted_at: null, edited_at: null, reply_to: null, reactions: [], revision: 1, ...overrides,
  };
}
const reply = { mine: false, client_message_id: null, sender_account_id: agentId, sender_name: 'Agent', from_agent: true, body: 'I can list tasks.' };

test('Agent replies and request statuses are validated, and older servers still parse', () => {
  const client = messagingClient();
  const parsed = client.messageSchema.parse(message());
  assert.equal(parsed.from_agent, false); assert.equal(parsed.agent_request, null);
  for (const valid of [reply, { agent_request: { status: 'answered', run_id: runId } }, { agent_request: { status: 'off', run_id: null } }]) {
    assert.equal(client.messageSchema.safeParse(message(valid)).success, true, JSON.stringify(valid));
  }
  for (const invalid of [
    { ...reply, mine: true, client_message_id: key }, { ...reply, agent_request: { status: 'answered', run_id: runId } },
    { mine: false, client_message_id: null, agent_request: { status: 'pending', run_id: null } },
    { agent_request: { status: 'private', run_id: null } }, { agent_request: { status: 'lost', run_id: null } },
  ]) assert.equal(client.messageSchema.safeParse(message(invalid)).success, false, JSON.stringify(invalid));
  const authorPrivateRun = client.messageSchema.parse(message({ agent_request: { status: 'waiting', run_id: runId } }));
  assert.equal(authorPrivateRun.mine, true);
  assert.equal(authorPrivateRun.agent_request.run_id, runId);
  assert.equal(client.messageSchema.safeParse(message({
    mine: false, client_message_id: null, sender_account_id: agentId,
    agent_request: { status: 'waiting', run_id: runId },
  })).success, false, 'a different reader never receives the author’s private run id');
});

test('Only the word @agent asks the agent, as the server reads it', () => {
  const client = messagingClient();
  for (const text of ['@agent help', '@Agent, help', 'Thanks @agent!', 'hey\n@agent\nhelp']) assert.equal(client.mentionsAgent(text), true, text);
  for (const text of ['write to sam@agent.example', '@agents meet at six', 'the agent can help']) assert.equal(client.mentionsAgent(text), false, text);
});

test('Asking again goes to its own command and must name the request', async () => {
  const calls = [];
  const answer = data => messagingClient(async (url, options) => { calls.push({ url: String(url), body: JSON.parse(options.body) }); return Response.json({ data }); });
  const again = await answer(message({ agent_request: { status: 'answered', run_id: runId } })).askAgentAgain(accountId, conversationId, messageId);
  assert.equal(again.agent_request.status, 'answered');
  assert.deepEqual(calls[0], { url: `/api/conversations/${conversationId}/messages/${messageId}/agent`, body: {} });
  await assert.rejects(answer(message()).askAgentAgain(accountId, conversationId, messageId), { status: 502 });
});

test('The BFF passes asking again through only as a POST without a query', async () => {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : message() });
  });
  const request = (method, route) => handlers[method](new NextRequest(`${origin}/api/${route}`, {
    method, body: method === 'GET' ? undefined : '{}',
    headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, 'Content-Type': 'application/json', 'Idempotency-Key': key },
  }), { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  const again = `conversations/${conversationId}/messages/${messageId}/agent`;
  assert.equal((await request('POST', again)).status, 200);
  assert.equal(calls[1].url, `https://backend.example.test/v1/${again}`);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal((await request('POST', `${again}?again=1`)).status, 400);
  for (const [method, route] of [['GET', again], ['PATCH', again], ['POST', `${again}s`], ['POST', `conversations/${conversationId}/messages/not-a-uuid/agent`]]) {
    assert.equal((await request(method, route)).status, 404, `${method} ${route}`);
  }
  assert.equal(calls.length, 2, 'Only the reviewed command reached the API.');
});
