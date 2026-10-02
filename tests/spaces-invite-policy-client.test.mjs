import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// DEC-026: the per-Space setting "Who can invite people" for family and group Spaces.
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
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{"member_invites":true}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const settings = (overrides = {}) => ({
  id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
  role: 'owner', version: '1', created_at: '2026-10-01T10:00:00Z', etag, member_invites: false, ...overrides,
});
const intent = (overrides = {}) => ({ accountId, spaceId, memberInvites: true, etag, key, ...overrides });

test('Changing who can invite posts the exact path, headers and body, and a retry is identical', async () => {
  const calls = [];
  const client = spacesClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: settings({ member_invites: true }) }); });
  assert.equal((await client.changeInvitePolicy(intent())).member_invites, true);
  await client.changeInvitePolicy(intent());
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, `/api/spaces/${spaceId}/invite-policy`);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['If-Match'], etag);
    assert.equal(call.options.headers['Idempotency-Key'], key);
    assert.equal(call.options.headers['X-Account-ID'], accountId);
    assert.equal(call.options.body, '{"member_invites":true}');
  }
  assert.deepEqual(calls[0].options.headers, calls[1].options.headers);
  const off = [];
  const restrict = spacesClient(async (url, options) => { off.push(options); return Response.json({ data: settings({ space_type: 'group', member_invites: false }) }); });
  assert.equal((await restrict.changeInvitePolicy(intent({ memberInvites: false }))).member_invites, false);
  assert.equal(off[0].body, '{"member_invites":false}');
});

test('Changing who can invite rejects a result for another Space or another setting', async () => {
  const respond = data => spacesClient(async () => Response.json({ data }));
  await assert.rejects(respond(settings({ id: otherId, member_invites: true })).changeInvitePolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(settings({ member_invites: false })).changeInvitePolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(settings({ member_invites: true })).changeInvitePolicy(intent({ memberInvites: false })), { status: 502, code: 'INVALID_RESPONSE' });
  await assert.rejects(respond(settings({ role: 'admin', member_invites: true })).changeInvitePolicy(intent()), { status: 502, code: 'INVALID_RESPONSE' });
});

test('Space schemas default member_invites to false and allow true only for family and group Spaces', () => {
  const client = spacesClient();
  const space = (overrides = {}) => { const { etag: _etag, ...rest } = settings(overrides); return rest; };
  const { member_invites: _omitted, ...older } = space();
  assert.equal(client.spaceSchema.parse(older).member_invites, false);
  assert.equal(client.spacesSchema.parse([older])[0].member_invites, false);
  const { member_invites: _omittedSettings, ...olderSettings } = settings();
  assert.equal(client.spaceSettingsSchema.parse(olderSettings).member_invites, false);
  for (const space_type of ['family', 'group']) {
    assert.equal(client.spaceSchema.parse(space({ space_type, member_invites: true })).member_invites, true, space_type);
    assert.equal(client.spacesSchema.safeParse([space({ space_type, member_invites: true })]).success, true, space_type);
    assert.equal(client.spaceSettingsSchema.safeParse(settings({ space_type, member_invites: true })).success, true, space_type);
  }
  for (const space_type of ['couple', 'solo']) {
    assert.equal(client.spaceSchema.safeParse(space({ space_type, member_invites: true })).success, false, space_type);
    assert.equal(client.spacesSchema.safeParse([space({ space_type, member_invites: true })]).success, false, space_type);
    assert.equal(client.spaceSettingsSchema.safeParse(settings({ space_type, member_invites: true })).success, false, space_type);
    assert.equal(client.spaceSchema.safeParse(space({ space_type, member_invites: false })).success, true, space_type);
  }
  assert.equal(client.spaceSchema.safeParse(space({ member_invites: 'yes' })).success, false);
  assert.equal(client.spaceSchema.safeParse(space({ role: 'member', member_invites: true })).success, true, 'A member reads the setting too.');
});

test('Invite policy BFF forwards only the reviewed POST with its headers and refuses anything else', async () => {
  const route = `spaces/${spaceId}/invite-policy`;
  const proxy = bff();
  assert.equal((await proxy.request('POST', route)).status, 200);
  assert.equal(proxy.calls.length, 2);
  assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
  assert.equal(proxy.calls[1].options.method, 'POST');
  assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(proxy.calls[1].options.headers['If-Match'], etag);
  assert.equal(proxy.calls[1].options.headers['Idempotency-Key'], key);
  assert.equal(proxy.calls[1].options.body, '{"member_invites":true}');
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await bff().request(method, route)).status, 404, method);
  assert.equal((await bff().request('POST', `${route}/extra`)).status, 404);
  assert.equal((await bff().request('POST', `spaces/not-a-uuid/invite-policy`)).status, 404);
  const withQuery = bff();
  assert.equal((await withQuery.request('POST', `${route}?member_invites=true`)).status, 400);
  assert.equal(withQuery.calls.length, 0);
  assert.equal((await bff().request('POST', route, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await bff().request('POST', route, { Cookie: '' })).status, 401);
  assert.equal((await bff().request('POST', route, { 'X-Account-ID': otherId })).status, 409);
});
