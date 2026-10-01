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
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const targetId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const otherId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';
const etag = '"reviewed-member"';

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
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': identity });
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
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{"role":"admin"}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const space = (overrides = {}) => ({
  id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
  role: 'admin', version: '1', created_at: '2026-10-01T10:00:00Z', ...overrides,
});
const row = (overrides = {}) => ({ account_id: targetId, display_name: 'Alex Morgan', role: 'admin', joined_at: '2026-10-01T10:00:00Z', etag: '"next-version"', ...overrides });
const intent = (overrides = {}) => ({ accountId, spaceId, targetId, role: 'admin', key, etag, ...overrides });

test('Space and roster schemas accept admin and still reject unknown roles', () => {
  const client = spacesClient();
  for (const role of ['owner', 'admin', 'member']) assert.equal(client.spaceSchema.safeParse(space({ role })).success, true);
  assert.equal(client.spaceSchema.safeParse(space({ role: 'administrator' })).success, false);
  assert.equal(client.memberSchema.safeParse(row()).success, true);
  assert.equal(client.memberSchema.safeParse(row({ role: 'moderator' })).success, false);
  const owner = row({ account_id: accountId, role: 'owner' });
  assert.equal(client.membersSchema.safeParse([owner, row(), row({ account_id: otherId, role: 'admin' })]).success, true);
  assert.equal(client.membersSchema.safeParse([owner, row({ role: 'owner' })]).success, false);
  const entry = { id: spaceId, name: 'Walkers', description: '', member_count: 3, viewer_role: 'admin', pending_request_id: null, can_request: false };
  assert.equal(client.directoryEntrySchema.safeParse(entry).success, true);
  assert.equal(client.directoryEntrySchema.safeParse({ ...entry, viewer_role: 'moderator' }).success, false);
});

test('Space settings stay owner-only', () => {
  const client = spacesClient();
  const settings = space({ role: 'owner', etag: `"${'a'.repeat(64)}"` });
  assert.equal(client.spaceSettingsSchema.safeParse(settings).success, true);
  assert.equal(client.spaceSettingsSchema.safeParse({ ...settings, role: 'admin' }).success, false);
});

test('Changing a role posts the exact path, headers and body', async () => {
  const calls = [];
  const client = spacesClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: row() }); });
  assert.equal((await client.changeRole(intent())).role, 'admin');
  await client.changeRole(intent());
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, `/api/spaces/${spaceId}/members/${targetId}/role`);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['If-Match'], etag);
    assert.equal(call.options.headers['Idempotency-Key'], key);
    assert.equal(call.options.headers['X-Account-ID'], accountId);
    assert.deepEqual(JSON.parse(call.options.body), { role: 'admin' });
  }
  assert.equal(calls[0].options.body, calls[1].options.body);
});

test('Changing a role rejects a response for another account or role', async () => {
  const respond = data => spacesClient(async () => Response.json({ data }));
  await assert.rejects(respond(row({ account_id: otherId })).changeRole(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(row({ role: 'member' })).changeRole(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(row({ role: 'admin' })).changeRole(intent({ role: 'member' })), { status: 502, code: 'INVALID_RESPONSE' });
  assert.equal((await respond(row({ role: 'member' })).changeRole(intent({ role: 'member' }))).role, 'member');
});

test('Role BFF forwards the POST with the review headers and refuses anything else', async () => {
  const route = `spaces/${spaceId}/members/${targetId}/role`;
  const proxy = bff();
  const response = await proxy.request('POST', route);
  assert.equal(response.status, 200);
  assert.equal(proxy.calls.length, 2);
  assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
  assert.equal(proxy.calls[1].options.method, 'POST');
  assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(proxy.calls[1].options.headers['If-Match'], etag);
  assert.equal(proxy.calls[1].options.headers['Idempotency-Key'], key);
  assert.equal(proxy.calls[1].options.body, '{"role":"admin"}');
  assert.equal((await bff().request('GET', route)).status, 404);
  assert.equal((await bff().request('POST', `${route}/extra`)).status, 404);
  const withQuery = bff();
  assert.equal((await withQuery.request('POST', `${route}?account_id=${accountId}`)).status, 400);
  assert.equal(withQuery.calls.length, 0);
  assert.equal((await bff().request('POST', route, { Origin: 'https://foreign.example' })).status, 403);
});
