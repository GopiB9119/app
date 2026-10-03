import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// DEC-028 (T152): the owner turns the agent on or off in a Space.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const otherId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';
const etag = `"${'a'.repeat(64)}"`;

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function spacesClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  return loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: {} });
  });
  async function request(method, route, overrides = {}) {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': etag, ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{"agent_enabled":false}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const settings = (overrides = {}) => ({
  id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
  role: 'owner', version: '2', created_at: '2026-10-01T10:00:00Z', etag, member_invites: false, agent_enabled: false, ...overrides,
});
const intent = (overrides = {}) => ({ accountId, spaceId, agentEnabled: false, etag, key, ...overrides });

test('Turning the agent off posts the exact path, headers and body, and a retry is identical', async () => {
  const calls = [];
  const client = spacesClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: settings() }); });
  assert.equal((await client.changeAgentPolicy(intent())).agent_enabled, false);
  await client.changeAgentPolicy(intent());
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, `/api/spaces/${spaceId}/agent-policy`);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['If-Match'], etag);
    assert.equal(call.options.headers['Idempotency-Key'], key);
    assert.equal(call.options.body, '{"agent_enabled":false}');
  }
});

test('The agent setting result must match the Space and the setting asked for', async () => {
  const respond = data => spacesClient(async () => Response.json({ data }));
  await assert.rejects(respond(settings({ id: otherId })).changeAgentPolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(settings({ agent_enabled: true })).changeAgentPolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(settings({ role: 'member' })).changeAgentPolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
});

test('Spaces from an older server read as agent on; a non-boolean value is refused', () => {
  const client = spacesClient();
  const { etag: _etag, agent_enabled: _omitted, ...older } = settings();
  assert.equal(client.spaceSchema.parse(older).agent_enabled, true);
  const { etag: _e, ...space } = settings({ role: 'member' });
  assert.equal(client.spaceSchema.parse(space).agent_enabled, false, 'A member reads the setting too.');
  assert.equal(client.spaceSchema.safeParse({ ...space, agent_enabled: 'no' }).success, false);
});

test('Agent policy BFF forwards only the reviewed POST and refuses anything else', async () => {
  const route = `spaces/${spaceId}/agent-policy`;
  const proxy = bff();
  assert.equal((await proxy.request('POST', route)).status, 200);
  assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
  assert.equal(proxy.calls[1].options.body, '{"agent_enabled":false}');
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await bff().request(method, route)).status, 404, method);
  assert.equal((await bff().request('POST', `spaces/not-a-uuid/agent-policy`)).status, 404);
  const withQuery = bff();
  assert.equal((await withQuery.request('POST', `${route}?agent_enabled=false`)).status, 400);
  assert.equal(withQuery.calls.length, 0);
  assert.equal((await bff().request('POST', route, { Origin: 'https://foreign.example' })).status, 403);
});
