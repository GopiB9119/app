function reminderClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/scheduling/client.ts', fetch, { '@/features/identity/client': identity });
}

function reminderResult(overrides = {}) {
  return {
    id: invitationId, task_id: invitationId, space_id: spaceId, task_title: 'Buy groceries',
    local_time: '2026-09-19T15:31:00', timezone: 'Asia/Kolkata', scheduled_at: '2026-09-19T10:01:00Z',
    expires_at: '2026-09-20T10:01:00Z', status: 'scheduled', reason: null, source_changed: false,
    acknowledged_at: null, version: '1', channel: 'in_app', ...overrides,
  };
}

test('Reminder BFF allows only reviewed authenticated operations and safe query fields', async () => {
  for (const [method, route] of [
    ['POST', 'reminders/preview'], ['POST', 'reminders'], ['GET', 'reminders'],
    ['POST', `reminders/${invitationId}/cancel`], ['GET', 'notifications'],
    ['POST', `notifications/${invitationId}/read`], ['POST', `notifications/${invitationId}/acknowledge`],
    ['GET', 'me/notification-preferences'], ['PATCH', 'me/notification-preferences'],
  ]) {
    const proxy = bff();
    const result = await proxy.request(method, route);
    assert.equal(result.status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
  for (const route of [`reminders/${invitationId}/cancel`, `notifications/${invitationId}/acknowledge`, `notifications/${invitationId}/read`]) {
    const proxy = bff();
    assert.equal((await proxy.request('GET', route)).status, 404);
    assert.equal(proxy.calls.length, 0);
  }
  const page = bff();
  assert.equal((await page.request('GET', `reminders?task_id=${invitationId}&limit=2&cursor=opaque%2Bvalue`)).status, 200);
  assert.equal(new URL(page.calls[1].url).searchParams.get('task_id'), invitationId);
  for (const route of ['notifications?account_id=other', 'reminders?limit=1&limit=2', 'me/notification-preferences?account_id=other']) {
    assert.equal((await bff().request('GET', route)).status, 400);
  }
});

test('Reminder requests retain their reviewed token and key without granting recipient authority', async () => {
  const calls = [];
  const client = reminderClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: reminderResult() }); });
  const intent = { accountId, taskId: invitationId, key: spaceId, previewToken: 'reviewed-preview-token' };
  await client.saveReminder(intent);
  await client.saveReminder(intent);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { preview_token: intent.previewToken });
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.body, calls[1].options.body);
});

test('Reminder schemas reject inconsistent lifecycle facts and wrong preview recipients', async () => {
  const client = reminderClient();
  assert.equal(client.reminderSchema.safeParse(reminderResult()).success, true);
  for (const changes of [{ version: 1 }, { expires_at: '2026-09-19T09:00:00Z' }, { acknowledged_at: '2026-09-19T10:10:00Z' }, { channel: 'email' }]) {
    assert.equal(client.reminderSchema.safeParse(reminderResult(changes)).success, false);
  }
  const preview = {
    task_id: invitationId, task_title: 'Buy groceries', task_version: '1', local_time: '2026-09-19T15:31:00', timezone: 'Asia/Kolkata',
    recipient: { account_id: spaceId, display_name: 'Not this account' }, channel: 'in_app', expires_at: '2026-09-19T10:05:00Z',
    options: [{ scheduled_at: '2026-09-19T10:01:00Z', dispatch_expires_at: '2026-09-20T10:01:00Z', utc_offset_minutes: 330, preview_token: 'x'.repeat(64) }],
  };
  const wrong = reminderClient(async () => Response.json({ data: preview }));
  await assert.rejects(wrong.previewReminder(accountId, invitationId, '2026-09-19T15:31', 'Asia/Kolkata'), { status: 502 });
});

test('Notification client requires validated unread counts and bounded pages', async () => {
  for (const count of [undefined, -1, '1', 0.5]) {
    const client = reminderClient(async () => Response.json({ data: [], pagination: { next_cursor: null, has_more: false }, ...(count === undefined ? {} : { unread_count: count }) }));
    await assert.rejects(client.notificationPage(accountId), { status: 502 });
  }
  const client = reminderClient(async () => Response.json({ data: [], pagination: { next_cursor: null, has_more: false }, unread_count: 0 }));
  assert.equal((await client.notificationPage(accountId)).unreadCount, 0);
});

function reminderRequestResult(overrides = {}) {
  return {
    id: invitationId, task_id: invitationId, space_id: spaceId, task_title: 'Buy groceries', task_version: '1',
    requested_by: { account_id: accountId, display_name: 'Alex' }, recipient: { account_id: spaceId, display_name: 'Sam' },
    local_time: '2026-09-19T16:00:00', timezone: 'Asia/Kolkata', scheduled_at: '2026-09-19T10:30:00Z',
    dispatch_expires_at: '2026-09-20T10:30:00Z', expires_at: '2026-09-19T10:30:00Z', created_at: '2026-09-19T10:00:00Z',
    resolved_at: null, status: 'pending', source_changed: false, reminder_id: null, version: '1', channel: 'in_app', ...overrides,
  };
}

test('Reminder proposal BFF allows seven exact operations and no GET acceptance', async () => {
  for (const [method, route] of [
    ['POST', 'reminder-requests/preview'], ['POST', 'reminder-requests'], ['GET', 'reminder-requests'],
    ['GET', `reminder-requests/${invitationId}/review`], ['POST', `reminder-requests/${invitationId}/accept`],
    ['POST', `reminder-requests/${invitationId}/decline`], ['POST', `reminder-requests/${invitationId}/cancel`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(proxy.calls[1].options.cache, 'no-store');
  }
  for (const [method, route] of [
    ['GET', `reminder-requests/${invitationId}/accept`], ['GET', `reminder-requests/${invitationId}/decline`],
    ['POST', `reminder-requests/${invitationId}/review`], ['PATCH', `reminder-requests/${invitationId}`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404);
    assert.equal(proxy.calls.length, 0);
  }
  const page = bff();
  assert.equal((await page.request('GET', 'reminder-requests?direction=sent&limit=2&cursor=opaque')).status, 200);
  assert.equal(new URL(page.calls[1].url).searchParams.get('direction'), 'sent');
  for (const route of ['reminder-requests?recipient_account_id=other', 'reminder-requests?direction=sent&direction=received', `reminder-requests/${invitationId}/review?account_id=other`]) {
    assert.equal((await bff().request('GET', route)).status, 400);
  }
  const foreign = bff();
  assert.equal((await foreign.request('POST', `reminder-requests/${invitationId}/accept`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
  const switched = bff();
  assert.equal((await switched.request('POST', 'reminder-requests', { 'X-Account-ID': spaceId })).status, 409);
  assert.equal(switched.calls.length, 1);
});

test('Proposal save keeps the immutable time recipient token and idempotency key', async () => {
  const calls = [];
  const client = reminderClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: reminderRequestResult() }); });
  const intent = { accountId, recipientAccountId: spaceId, taskId: invitationId, spaceId, key: invitationId,
    previewToken: 'reviewed-proposal-token'.repeat(3), taskVersion: '1', localTime: '2026-09-19T16:00:00', timezone: 'Asia/Kolkata', scheduledAt: '2026-09-19T10:30:00Z' };
  await client.saveReminderRequest(intent);
  await client.saveReminderRequest(intent);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { preview_token: intent.previewToken });
  for (const changes of [{ recipientAccountId: invitationId }, { scheduledAt: '2026-09-19T11:30:00Z' }, { taskVersion: '2' }]) {
    await assert.rejects(client.saveReminderRequest({ ...intent, ...changes }), { status: 502 });
  }
});

test('Request review and acceptance are recipient-bound and keep the reviewed action on retry', async () => {
  const proposal = reminderRequestResult();
  const calls = [];
  const client = reminderClient(async (url, options) => {
    calls.push({ url, options });
    const data = String(url).endsWith('/review')
      ? { request: proposal, preview_token: 'recipient-reviewed-token'.repeat(3), expires_at: '2026-09-19T10:05:00Z' }
      : reminderRequestResult({ status: 'accepted', reminder_id: accountId, resolved_at: '2026-09-19T10:01:00Z', version: '2' });
    return Response.json({ data });
  });
  await assert.rejects(client.reviewReminderRequest(accountId, proposal), { status: 404 });
  assert.equal(calls.length, 0);
  const review = await client.reviewReminderRequest(spaceId, proposal);
  assert.equal(calls[0].options.method, 'GET');
  const intent = { accountId: spaceId, request: proposal, action: 'accept', previewToken: review.preview_token };
  await client.respondReminderRequest(intent);
  await client.respondReminderRequest(intent);
  assert.equal(calls[1].options.body, calls[2].options.body);
  assert.equal(calls[1].url, calls[2].url);
  assert.deepEqual(JSON.parse(calls[1].options.body), { preview_token: review.preview_token });
  await assert.rejects(client.respondReminderRequest({ ...intent, accountId }), { status: 404 });
});

test('Proposal pages reject leaked schedule IDs repeated cursors duplicates and wrong direction', async () => {
  for (const [data, direction, cursor, pagination] of [
    [[reminderRequestResult({ status: 'accepted', reminder_id: invitationId, resolved_at: '2026-09-19T10:01:00Z' })], 'sent', null, { has_more: false, next_cursor: null }],
    [[reminderRequestResult()], 'received', null, { has_more: false, next_cursor: null }],
    [[reminderRequestResult(), reminderRequestResult()], 'sent', null, { has_more: false, next_cursor: null }],
    [[reminderRequestResult()], 'sent', 'same', { has_more: true, next_cursor: 'same' }],
  ]) {
    const client = reminderClient(async () => Response.json({ data, pagination }));
    await assert.rejects(client.reminderRequestPage(accountId, direction, cursor), { status: 502 });
  }
});

test('Proposal schemas reject inconsistent consent and recipient review facts', () => {
  const client = reminderClient();
  assert.equal(client.reminderRequestSchema.safeParse(reminderRequestResult()).success, true);
  for (const changes of [
    { recipient: { account_id: accountId, display_name: 'Alex' } }, { status: 'accepted', resolved_at: null },
    { status: 'declined', reminder_id: invitationId }, { expires_at: '2026-09-19T11:30:00Z' }, { channel: 'email' },
  ]) assert.equal(client.reminderRequestSchema.safeParse(reminderRequestResult(changes)).success, false);
  assert.equal(client.reminderRequestReviewSchema.safeParse({ request: reminderRequestResult(), preview_token: 'x'.repeat(64), expires_at: '2026-09-19T11:30:00Z' }).success, false);
});
function ownershipClient(fetch = async () => { throw new Error('Unexpected request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': identity });
}

function ownershipResult(overrides = {}) {
  return { id: invitationId, space_id: spaceId, space_name: 'Morgan family', from_account_id: accountId,
    from_name: 'Alex', to_account_id: spaceId, to_name: 'Sam', status: 'pending', created_at: '2026-09-23T10:00:00Z',
    expires_at: '2026-09-23T10:15:00Z', resolved_at: null, version: '1', etag: '"offer-1"', ...overrides };
}

test('Ownership BFF exposes only the five exact authenticated methods', async () => {
  const base = `spaces/${spaceId}/ownership-transfers`;
  for (const [method, path] of [['POST', base], ['GET', base], ['POST', `${base}/${invitationId}/accept`], ['POST', `${base}/${invitationId}/decline`], ['POST', `${base}/${invitationId}/cancel`]]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, path, { 'If-Match': '"reviewed"' })).status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].options.headers['If-Match'], '"reviewed"');
    assert.equal(proxy.calls[1].options.cache, 'no-store');
  }
  for (const path of [`${base}/${invitationId}/accept`, `${base}/${invitationId}/decline`, `${base}/${invitationId}/cancel`]) {
    const proxy = bff();
    assert.equal((await proxy.request('GET', path)).status, 404);
    assert.equal(proxy.calls.length, 0);
  }
  assert.equal((await bff().request('GET', `${base}?account_id=${accountId}`)).status, 400);
  assert.equal((await bff().request('GET', `${base}?limit=1&limit=2`)).status, 400);
  assert.equal((await bff().request('POST', `${base}?recipient_id=${spaceId}`)).status, 400);
  assert.equal((await bff().request('POST', base, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await bff().request('POST', base, { 'X-Account-ID': spaceId })).status, 409);
});

test('Ownership offers and responses retain exact review identity on retry', async () => {
  const calls = [];
  const client = ownershipClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: ownershipResult(String(url).endsWith('/accept') ? { status: 'accepted', resolved_at: '2026-09-23T10:01:00Z', version: '2', etag: '"offer-2"' } : {}) });
  });
  const offer = { action: 'offer', accountId, spaceId, recipientId: spaceId, key: invitationId, etag: '"member-review"' };
  await client.changeOwnership(offer); await client.changeOwnership(offer);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { recipient_account_id: spaceId });
  const accept = { action: 'accept', accountId: spaceId, transfer: ownershipResult() };
  await client.changeOwnership(accept); await client.changeOwnership(accept);
  assert.equal(calls[2].options.headers['If-Match'], calls[3].options.headers['If-Match']);
  assert.equal(calls[2].options.body, '{}');
  assert.equal(calls[2].url, calls[3].url);
  await assert.rejects(client.changeOwnership({ ...accept, accountId }), { status: 404 });
  assert.equal(calls.length, 4);
});

test('Ownership responses reject wrong parties and malformed lifecycle facts', async () => {
  const client = ownershipClient();
  assert.equal(client.ownershipTransferSchema.safeParse(ownershipResult()).success, true);
  for (const changes of [{ to_account_id: accountId }, { expires_at: '2026-09-23T09:00:00Z' }, { status: 'accepted' }, { status: 'owner' }, { etag: '*' }]) {
    assert.equal(client.ownershipTransferSchema.safeParse(ownershipResult(changes)).success, false);
  }
  const wrong = ownershipClient(async () => Response.json({ data: ownershipResult({ to_account_id: invitationId }) }));
  await assert.rejects(wrong.changeOwnership({ action: 'offer', accountId, spaceId, recipientId: spaceId, key: invitationId, etag: '"member"' }), { status: 502 });
});

test('Ownership pages reject duplicate records repeated cursors and another audience', async () => {
  for (const [data, cursor, pagination] of [
    [[ownershipResult(), ownershipResult()], null, { has_more: false, next_cursor: null }],
    [[ownershipResult()], 'same', { has_more: true, next_cursor: 'same' }],
    [[ownershipResult({ from_account_id: invitationId })], null, { has_more: false, next_cursor: null }],
  ]) {
    const client = ownershipClient(async () => Response.json({ data, pagination }));
    await assert.rejects(client.ownershipPage(accountId, spaceId, cursor), { status: 502 });
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { z } = require('zod');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const invitationId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';

function loadSource(relative, fetch, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } }, ...globals,
  }, { filename: relative });
  return exports;
}

function clientWithResponse(payload) {
  return loadSource('features/identity/client.ts', async () => Response.json(payload));
}

test('Checklist client binds task scope, completion facts and immutable retry command', async () => {
  const calls = [];
  const item = { id: invitationId, title: 'Read chapter', checked: false, checked_at: null, checked_by_account_id: null };
  const original = { task_id: invitationId, space_id: spaceId, task_title: 'Reading', task_status: 'open', task_version: '1', can_manage: true, can_check: true, items: [item], etag: `"${'a'.repeat(64)}"` };
  let data = original;
  const fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ data }); };
  const client = loadSource('features/planning/checklist-client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
  const intent = { accountId, taskId: invitationId, spaceId, etag: original.etag, key: spaceId, body: { action: 'check', item_id: invitationId, checked: false } };
  await client.changeChecklist(intent); await client.changeChecklist(intent);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].options.headers['If-Match'], intent.etag);
  assert.deepEqual(JSON.parse(calls[0].options.body), intent.body);
  for (const changes of [{ space_id: accountId }, { task_id: spaceId }, { items: [item, item] }, { items: [{ ...item, checked: true }] }, { task_status: 'completed' }]) {
    data = { ...original, ...changes };
    await assert.rejects(client.readChecklist(accountId, invitationId, spaceId), { status: 502 });
  }
});

test('Checklist BFF accepts only authenticated GET and POST without query injection', async () => {
  const path = `tasks/${invitationId}/checklist`;
  for (const method of ['GET', 'POST']) assert.equal((await bff().request(method, path)).status, 200);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await bff().request(method, path)).status, 404);
  assert.equal((await bff().request('GET', `${path}?account_id=other`)).status, 400);
  assert.equal((await bff().request('GET', path, { Cookie: '' })).status, 401);
  assert.equal((await bff().request('POST', path, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await bff().request('POST', path, { 'X-Account-ID': spaceId })).status, 409);
});

test('Space schemas keep family, couple and solo private and allow only groups to be public', async () => {
  const fetch = async () => { throw new Error('No network'); };
  const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
  const value = { id: spaceId, name: 'My planning', description: '', space_type: 'solo', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z' };
  assert.equal(client.spaceSchema.parse(value).space_type, 'solo');
  assert.equal(client.spaceSchema.safeParse({ ...value, visibility: 'public' }).success, false);
  assert.equal(client.spaceSchema.safeParse({ ...value, space_type: 'family', visibility: 'public' }).success, false);
  // Couple Spaces exist since DEC-017 and, like family and solo Spaces, are never public.
  assert.equal(client.spaceSchema.parse({ ...value, space_type: 'couple' }).space_type, 'couple');
  assert.equal(client.spaceSchema.safeParse({ ...value, space_type: 'couple', visibility: 'public' }).success, false);
  assert.equal(client.spaceSchema.safeParse({ ...value, space_type: 'club' }).success, false);
  assert.equal(client.spaceSchema.safeParse({ ...value, visibility: 'secret' }).success, false);
  assert.equal(client.spaceSchema.parse({ ...value, space_type: 'group', visibility: 'public', description: 'Lake walks' }).visibility, 'public');
  assert.equal(client.spaceSchema.safeParse({ ...value, description: 'x'.repeat(281) }).success, false);
  const { description: _omitted, ...older } = value;
  assert.equal(client.spaceSchema.parse(older).description, '');
  assert.equal(client.spaceSettingsSchema.safeParse({ ...value, etag: `"${'a'.repeat(64)}"` }).success, true);
  assert.equal(client.spaceSettingsSchema.safeParse({ ...value, visibility: 'public', etag: `"${'a'.repeat(64)}"` }).success, false);
});

test('Space settings client retains exact name review and rejects foreign or nonowner responses', async () => {
  const calls = [];
  let value = { id: spaceId, name: 'Current name', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '3', created_at: '2026-09-19T10:00:00Z', etag: `"${'a'.repeat(64)}"` };
  const fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ data: value }); };
  const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
  const intent = { accountId, spaceId, name: 'Reviewed name', etag: value.etag, key: invitationId };
  assert.equal((await client.readSpaceSettings(accountId, spaceId)).name, 'Current name');
  await client.saveSpaceSettings(intent);
  assert.equal((await client.saveSpaceSettings(intent)).name, 'Current name');
  assert.equal(calls[1].options.body, '{"name":"Reviewed name"}');
  assert.deepEqual(calls[1].options.headers, calls[2].options.headers);
  assert.equal(calls[1].options.headers['If-Match'], intent.etag);
  for (const change of [{ id: accountId }, { role: 'member' }, { etag: 'bad' }, { visibility: 'public' }]) {
    const before = value; value = { ...value, ...change };
    await assert.rejects(client.saveSpaceSettings(intent), { status: 502 }); value = before;
  }
});

test('Space settings BFF accepts only owner-bound GET and PATCH without query injection', async () => {
  const path = `spaces/${spaceId}/settings`;
  for (const method of ['GET', 'PATCH']) {
    const proxy = bff(); assert.equal((await proxy.request(method, path, { 'If-Match': '"reviewed"' })).status, 200);
    assert.equal(proxy.calls[1].options.headers['If-Match'], '"reviewed"');
    assert.equal(proxy.calls[1].options.cache, 'no-store');
    assert.equal((await bff().request(method, `${path}?role=owner`)).status, 400);
  }
  for (const method of ['POST', 'DELETE']) assert.equal((await bff().request(method, path)).status, 404);
  assert.equal((await bff().request('PATCH', path, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await bff().request('PATCH', path, { 'X-Account-ID': invitationId })).status, 409);
  assert.equal((await bff().request('GET', path, { Cookie: '' })).status, 401);
});

test('Calendar client preserves date-only entries and rejects mismatched or repeated pages', async () => {
  const entry = { id: invitationId, task_id: invitationId, space_id: spaceId, kind: 'task', title: 'Calendar task', date: '2026-09-21', scheduled_at: null, timezone: null, status: 'open', source_changed: false };
  const pagination = { next_cursor: null, has_more: false };
  function calendar(data, paging = pagination) {
    const fetch = async () => Response.json({ data, pagination: paging });
    return loadSource('features/planning/calendar-client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
  }
  assert.equal((await calendar([entry]).calendarPage(accountId, spaceId, '2026-09', 'UTC', null)).data[0].date, '2026-09-21');
  for (const data of [[{ ...entry, space_id: accountId }], [{ ...entry, date: '2026-10-01' }], [entry, entry], [{ ...entry, scheduled_at: '2026-09-21T00:00:00Z' }], [{ ...entry, task_id: spaceId }]]) {
    await assert.rejects(calendar(data).calendarPage(accountId, spaceId, '2026-09', 'UTC', null), { status: 502 });
  }
  await assert.rejects(calendar([entry], { next_cursor: 'again', has_more: true }).calendarPage(accountId, spaceId, '2026-09', 'UTC', 'again'), { status: 502 });
  const reminder = { ...entry, kind: 'reminder', status: 'scheduled', scheduled_at: '2026-09-20T18:45:00Z', timezone: 'Asia/Kolkata' };
  assert.equal((await calendar([reminder]).calendarPage(accountId, spaceId, '2026-09', 'Asia/Kolkata', null)).data[0].date, '2026-09-21');
  await assert.rejects(calendar([reminder]).calendarPage(accountId, spaceId, '2026-09', 'UTC', null), { status: 502 });
  assert.equal(calendar([]).calendarRange('2028-02').end, '2028-02-29');
  assert.throws(() => calendar([]).calendarRange('2026-13'), { status: 422 });
});

test('Calendar BFF forwards only scoped read queries and refuses writes or account switches', async () => {
  const proxy = bff();
  const query = `calendar?space_id=${spaceId}&start_date=2026-09-01&end_date=2026-09-30&timezone=Asia%2FKolkata&limit=50`;
  assert.equal((await proxy.request('GET', query)).status, 200);
  assert.equal(new URL(proxy.calls[1].url).searchParams.get('timezone'), 'Asia/Kolkata');
  assert.equal(proxy.calls[1].options.cache, 'no-store');
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await bff().request(method, 'calendar')).status, 404);
  assert.equal((await bff().request('GET', `${query}&account_id=${accountId}`)).status, 400);
  assert.equal((await bff().request('GET', `${query}&timezone=UTC`)).status, 400);
  assert.equal((await bff().request('GET', query, { Cookie: '' })).status, 401);
  assert.equal((await bff().request('GET', query, { 'X-Account-ID': spaceId })).status, 409);
});

test('Membership client preserves exact action precondition and receipt identity', async () => {
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ data: { space_id: spaceId, account_id: invitationId, status: 'removed' } }); };
  const identity = loadSource('features/identity/client.ts', fetch);
  const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': identity });
  const intent = { accountId, spaceId, targetId: invitationId, action: 'remove', key: spaceId, etag: '"reviewed-admission"' };
  await client.endMembership(intent);
  await client.endMembership(intent);
  assert.equal(calls[0].url, `/api/spaces/${spaceId}/members/${invitationId}/remove`);
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[0].options.headers['If-Match'], intent.etag);
  assert.equal(calls[0].options.headers['Idempotency-Key'], intent.key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.deepEqual(calls[0].options.headers, calls[1].options.headers);
  await assert.rejects(client.endMembership({ ...intent, action: 'leave' }), { status: 409 });
  assert.equal(calls.length, 2);
  await assert.rejects(client.endMembership({ ...intent, targetId: accountId }), { status: 502 });
});

test('Membership roster rejects missing self duplicate identities and invented roles', async () => {
  const owner = { account_id: accountId, display_name: 'Alex', role: 'owner', joined_at: '2026-09-21T10:00:00Z', etag: '"current-owner"' };
  const member = { ...owner, account_id: invitationId, role: 'member', etag: '"current-member"' };
  for (const data of [[], [owner, owner], [owner, { ...member, role: 'owner' }], [{ ...owner, account_id: spaceId }], [{ ...owner, etag: '*' }], [{ ...owner, role: 'administrator' }]]) {
    const fetch = async () => Response.json({ data });
    const identity = loadSource('features/identity/client.ts', fetch);
    const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': identity });
    await assert.rejects(client.readMembers(accountId, spaceId), { status: 502 });
  }
  const fetch = async () => Response.json({ data: [owner, member] });
  const identity = loadSource('features/identity/client.ts', fetch);
  const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': identity });
  assert.equal((await client.readMembers(accountId, spaceId)).length, 2);
});

test('Membership BFF permits only reviewed POST actions and private roster reads', async () => {
  for (const [method, route] of [['GET', `spaces/${spaceId}/members`], ['POST', `spaces/${spaceId}/members/${invitationId}/remove`], ['POST', `spaces/${spaceId}/leave`]]) {
    const proxy = bff();
    const response = await proxy.request(method, route, { 'If-Match': '"member-version"', 'Idempotency-Key': invitationId });
    assert.equal(response.status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(proxy.calls[1].options.headers['If-Match'], '"member-version"');
    assert.equal(proxy.calls[1].options.headers['Idempotency-Key'], invitationId);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await bff().request(method, `${route}?account_id=${accountId}`)).status, 400);
  }
  for (const route of [`spaces/${spaceId}/leave`, `spaces/${spaceId}/members/${invitationId}/remove`]) assert.equal((await bff().request('GET', route)).status, 404);
  assert.equal((await bff().request('POST', `spaces/${spaceId}/leave`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await bff().request('POST', `spaces/${spaceId}/leave`, { 'X-Account-ID': spaceId })).status, 409);
});

test('API client preserves validated pagination without requiring it on ordinary responses', async () => {
  const ordinary = clientWithResponse({ data: { status: 'ok' } });
  const result = await ordinary.api('status', z.object({ status: z.literal('ok') }));
  assert.equal(result.data.status, 'ok');
  assert.equal(result.pagination, undefined);
  for (const pagination of [
    { next_cursor: 'opaque-cursor', has_more: true },
    { next_cursor: null, has_more: false },
  ]) {
    const client = clientWithResponse({ data: [], pagination });
    const page = await client.api('invitations', z.array(z.unknown()));
    assert.deepEqual(page.pagination, pagination);
  }
});

test('API client rejects malformed or contradictory pagination', async () => {
  for (const pagination of [
    { next_cursor: null, has_more: true },
    { next_cursor: 'cursor', has_more: false },
    { next_cursor: '', has_more: true },
    { next_cursor: 'cursor', has_more: 'true' },
    { next_cursor: 'x'.repeat(2049), has_more: true },
    null,
  ]) {
    const client = clientWithResponse({ data: [], pagination });
    await assert.rejects(client.api('invitations', z.array(z.unknown())), {
      status: 502, code: 'INVALID_RESPONSE',
    });
  }
});

test('API client retains account and retry headers and reports uncertain transport failure', async () => {
  const calls = [];
  const client = loadSource('features/identity/client.ts', async (url, options) => {
    calls.push({ url, options });
    throw new TypeError('synthetic network failure');
  });
  await assert.rejects(client.api('spaces', z.unknown(), {
    method: 'POST', accountId, headers: { 'Idempotency-Key': invitationId }, body: { name: 'Family' },
  }), { status: 0, code: 'OFFLINE' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.headers['Idempotency-Key'], invitationId);
  assert.equal(calls[0].options.cache, 'no-store');
});

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
      'Content-Type': 'application/json', 'Idempotency-Key': invitationId,
      ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, {
      method, headers, body: method === 'GET' ? undefined : '{}',
    });
    const pathname = route.split('?')[0];
    return handlers[method](request, { params: Promise.resolve({ path: pathname.split('/') }) });
  }
  return { calls, request };
}

test('Proxy starts a trace per request, sends it on both API calls and logs only random IDs and the outcome', async () => {
  const calls = [];
  const lines = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : [] });
  }, {}, { console: { log: line => lines.push(line) } });
  const route = `spaces/${spaceId}/members`;
  async function send(headers) {
    const request = new NextRequest(`${origin}/api/${route}?secret=visitor@example.test`, { method: 'GET', headers });
    return handlers.GET(request, { params: Promise.resolve({ path: route.split('/') }) });
  }
  const browserTrace = `00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`;
  const signedIn = { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, traceparent: browserTrace };
  assert.equal((await send(signedIn)).status, 400);
  assert.equal((await send({ Origin: origin })).status, 400);
  assert.equal(calls.length, 0);
  const request = new NextRequest(`${origin}/api/${route}`, { method: 'GET', headers: signedIn });
  assert.equal((await handlers.GET(request, { params: Promise.resolve({ path: route.split('/') }) })).status, 200);
  const [check, upstream] = calls.map(call => call.options.headers.traceparent);
  assert.match(upstream, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.equal(check, upstream);
  assert.notEqual(upstream, browserTrace);
  const entries = lines.map(line => JSON.parse(line));
  assert.deepEqual(entries.map(entry => entry.status), [400, 400, 200]);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['duration_ms', 'event', 'method', 'span_id', 'status', 'time', 'trace_id']);
    assert.equal(entry.event, 'bff_request');
  }
  assert.equal(new Set(entries.map(entry => entry.trace_id)).size, 3);
  assert.equal(`00-${entries[2].trace_id}-${entries[2].span_id}-01`, upstream);
  for (const secret of [spaceId, accountId, 'synthetic-session', 'visitor@example.test', 'members']) {
    assert.ok(!lines.join('\n').includes(secret), secret);
  }
});

test('Group BFF forwards only the reviewed directory, visibility and join request routes', async () => {
  const requestId = invitationId;
  const allowedRoutes = [
    ['GET', 'discover/spaces?q=hikers&limit=20'], ['GET', `discover/spaces/${spaceId}`], ['POST', `spaces/${spaceId}/visibility`],
    ['GET', `spaces/${spaceId}/join-requests`], ['POST', `spaces/${spaceId}/join-requests`],
    ['POST', `spaces/${spaceId}/join-requests/${requestId}/approve`], ['POST', `spaces/${spaceId}/join-requests/${requestId}/decline`],
    ['POST', `space-join-requests/${requestId}/cancel`], ['GET', 'me/space-join-requests'],
  ];
  for (const [method, route] of allowedRoutes) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, route);
    assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`, route);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['GET', `spaces/${spaceId}/join-requests/${requestId}/approve`], ['DELETE', `space-join-requests/${requestId}/cancel`],
    ['PATCH', `spaces/${spaceId}/visibility`], ['POST', 'discover/spaces'], ['GET', `space-join-requests/${requestId}`],
  ]) assert.equal((await bff().request(method, route)).status, 404, `${method} ${route}`);
  for (const route of [`spaces/${spaceId}/visibility?visibility=public`, `spaces/${spaceId}/join-requests?note=hi`, 'discover/spaces?owner=me', 'discover/spaces?q=a&q=b']) {
    const method = route.startsWith('discover') ? 'GET' : 'POST';
    assert.equal((await bff().request(method, route)).status, 400, route);
  }
  assert.equal((await bff().request('GET', 'discover/spaces', { Cookie: '' })).status, 401);
  assert.equal((await bff().request('POST', `spaces/${spaceId}/join-requests`, { Origin: 'https://foreign.example' })).status, 403);
});

test('Group clients send exact intents and reject inconsistent directory and request facts', async () => {
  const calls = [];
  const entry = { id: spaceId, name: 'Weekend hikers', description: 'Lake walks', member_count: 3, viewer_role: null, pending_request_id: null, can_request: true };
  const request = { id: invitationId, space_id: spaceId, space_name: 'Weekend hikers', note: 'Hello', status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-10-03T10:00:00Z', resolved_at: null };
  let payload = { data: [entry], pagination: { next_cursor: null, has_more: false } };
  const fetch = async (url, options) => { calls.push({ url, options }); return Response.json(payload); };
  const client = loadSource('features/spaces/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
  assert.equal((await client.findGroups(accountId, '  hikers ', null)).data[0].name, 'Weekend hikers');
  assert.equal(calls[0].url, '/api/discover/spaces?limit=20&q=hikers');
  for (const changes of [{ viewer_role: 'member' }, { pending_request_id: invitationId }, { member_count: 0 }, { description: 'x'.repeat(281) }]) {
    payload = { data: [{ ...entry, ...changes }], pagination: { next_cursor: null, has_more: false } };
    await assert.rejects(client.findGroups(accountId, '', null), { status: 502 }, JSON.stringify(changes));
  }
  payload = { data: [entry, entry], pagination: { next_cursor: null, has_more: false } };
  await assert.rejects(client.findGroups(accountId, '', null), { status: 502 });
  payload = { data: request };
  const intent = { accountId, spaceId, note: 'Hello', key: invitationId };
  await client.askToJoin(intent); await client.askToJoin(intent);
  assert.deepEqual(calls.at(-1).options, calls.at(-2).options);
  assert.equal(calls.at(-1).options.headers['Idempotency-Key'], invitationId);
  assert.equal(calls.at(-1).options.body, '{"note":"Hello"}');
  await assert.rejects(client.askToJoin({ ...intent, spaceId: accountId }), { status: 502 });
  payload = { data: { ...request, status: 'declined' } };
  await assert.rejects(client.askToJoin(intent), { status: 502 });
  payload = { data: { ...request, status: 'cancelled', resolved_at: '2026-09-19T11:00:00Z' } };
  assert.equal((await client.cancelJoinRequest(accountId, invitationId)).status, 'cancelled');
  payload = { data: { ...request, status: 'approved', resolved_at: '2026-09-19T11:00:00Z' } };
  await assert.rejects(client.cancelJoinRequest(accountId, invitationId), { status: 502 });
  const review = { id: invitationId, account_id: spaceId, display_name: 'Sam', note: '', created_at: request.created_at, expires_at: request.expires_at };
  assert.equal((await client.decideJoinRequest(accountId, spaceId, review, 'approve')).status, 'approved');
  await assert.rejects(client.decideJoinRequest(accountId, spaceId, review, 'decline'), { status: 502 });
  payload = { data: [{ ...review, account_id: accountId }] };
  await assert.rejects(client.pendingJoinRequests(accountId, spaceId), { status: 502 });
  const settings = { id: spaceId, name: 'Hikers', description: '', space_type: 'group', visibility: 'private', status: 'active', role: 'owner', version: '2', created_at: request.created_at, etag: `"${'b'.repeat(64)}"` };
  payload = { data: settings };
  await assert.rejects(client.changeVisibility({ accountId, spaceId, visibility: 'public', etag: settings.etag, key: invitationId }), { status: 502 });
  payload = { data: { ...settings, visibility: 'public' } };
  assert.equal((await client.changeVisibility({ accountId, spaceId, visibility: 'public', etag: settings.etag, key: invitationId })).visibility, 'public');
  assert.equal(calls.at(-1).options.headers['If-Match'], settings.etag);
  await client.saveSpaceSettings({ accountId, spaceId, name: 'Hikers', etag: settings.etag, key: invitationId });
  assert.equal(calls.at(-1).options.body, '{"name":"Hikers"}');
});

function invitationResult(overrides = {}) {
  return {
    id: invitationId, space_id: spaceId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
    recipient_account_id: accountId, role: 'member', status: 'pending',
    created_at: '2026-09-19T10:00:00Z', expires_at: '2026-10-04T10:00:00Z', ...overrides,
  };
}

test('Invitation lists reject another recipient or Space before returning private details', async () => {
  for (const [route, item] of [
    ['invitations', invitationResult({ recipient_account_id: invitationId })],
    [`spaces/${spaceId}/invitations`, invitationResult({ space_id: invitationId })],
  ]) {
    const client = ownershipClient(async () => Response.json({
      data: [item], pagination: { next_cursor: null, has_more: false },
    }));
    await assert.rejects(client.invitationPage(route, accountId, null, new AbortController().signal), {
      status: 502, code: 'INVALID_RESPONSE',
    });
  }
});

for (const route of ['invitations', `spaces/${spaceId}/invitations`]) {
  for (const [problem, data, cursor, pagination] of [
    ['duplicate records', [invitationResult(), invitationResult({ inviter_name: 'Conflicting sender' })], null, { next_cursor: null, has_more: false }],
    ['a repeated cursor', [invitationResult()], 'same+cursor', { next_cursor: 'same+cursor', has_more: true }],
    ['an empty page that claims more', [], null, { next_cursor: 'next-page', has_more: true }],
    ['more rows than requested', Array.from({ length: 21 }, (_, index) => invitationResult({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    })), null, { next_cursor: null, has_more: false }],
  ]) {
    test(`Invitation pagination rejects ${problem} for ${route}`, async () => {
      const client = ownershipClient(async () => Response.json({ data, pagination }));
      await assert.rejects(client.invitationPage(route, accountId, cursor, new AbortController().signal), {
        status: 502, code: 'INVALID_RESPONSE',
      });
    });
  }
}

for (const route of ['invitations', `spaces/${spaceId}/invitations`]) {
  test(`Invitation lists preserve a valid 20-row page, scope and cancellation signal for ${route}`, async () => {
    const data = Array.from({ length: 20 }, (_, index) => invitationResult({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      recipient_account_id: route === 'invitations' ? accountId : invitationId,
      status: route === 'invitations' ? 'pending' : ['pending', 'accepted', 'declined', 'revoked', 'expired'][index % 5],
    }));
    const calls = [];
    const controller = new AbortController();
    const client = ownershipClient(async (url, options) => {
      calls.push({ url, options });
      return Response.json({ data, pagination: { next_cursor: 'next+cursor', has_more: true } });
    });

    const result = await client.invitationPage(route, accountId, 'previous+cursor', controller.signal);

    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), data);
    assert.equal(result.pagination.next_cursor, 'next+cursor');
    assert.equal(result.pagination.has_more, true);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url, origin);
    assert.equal(url.pathname, `/api/${route}`);
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(url.searchParams.get('cursor'), 'previous+cursor');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.signal, controller.signal);
  });

  test(`Invitation lists allow a genuinely empty final page for ${route}`, async () => {
    const client = ownershipClient(async () => Response.json({
      data: [], pagination: { next_cursor: null, has_more: false },
    }));
    const result = await client.invitationPage(route, accountId, null, new AbortController().signal);
    assert.equal(result.data.length, 0);
    assert.equal(result.pagination.has_more, false);
    assert.equal(result.pagination.next_cursor, null);
  });
}

test('Invitation list cancellation stays cancelled instead of becoming an offline error', async () => {
  const controller = new AbortController();
  const client = ownershipClient((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
  }));
  const pending = client.invitationPage('invitations', accountId, null, controller.signal);
  const checked = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await checked;
});

test('Invitation BFF exposes only the six authenticated method/path combinations', async () => {
  const routes = [
    ['GET', 'invitations'],
    ['GET', `spaces/${spaceId}/invitations`],
    ['POST', `spaces/${spaceId}/invitations`],
    ['POST', `spaces/${spaceId}/invitations/${invitationId}/revoke`],
    ['POST', `invitations/${invitationId}/accept`],
    ['POST', `invitations/${invitationId}/decline`],
  ];
  for (const [method, route] of routes) {
    const proxy = bff();
    const response = await proxy.request(method, route);
    assert.equal(response.status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[0].url, 'https://backend.example.test/v1/me');
    assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(proxy.calls[1].options.headers['Idempotency-Key'], invitationId);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('Invitation BFF refuses wrong origin, anonymous calls and switched accounts before effects', async () => {
  const route = `invitations/${invitationId}/accept`;
  const crossOrigin = bff();
  assert.equal((await crossOrigin.request('POST', route, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(crossOrigin.calls.length, 0);
  const anonymous = bff();
  assert.equal((await anonymous.request('POST', route, { Cookie: '' })).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const switched = bff();
  assert.equal((await switched.request('POST', route, { 'X-Account-ID': spaceId })).status, 409);
  assert.equal(switched.calls.length, 1);
  const missing = bff();
  assert.equal((await missing.request('GET', 'invitations', { 'X-Account-ID': '' })).status, 409);
  assert.equal(missing.calls.length, 0);
});

test('Invitation BFF cannot mutate through GET or arbitrary invitation routes', async () => {
  for (const [method, route] of [
    ['GET', `invitations/${invitationId}/accept`],
    ['GET', `invitations/${invitationId}/decline`],
    ['GET', `spaces/${spaceId}/invitations/${invitationId}/revoke`],
    ['POST', `invitations/${invitationId}/revoke`],
    ['PATCH', `invitations/${invitationId}`],
    ['POST', `spaces/${spaceId}/invitations/${invitationId}/accept`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Invitation BFF forwards only unique cursor and limit query values', async () => {
  for (const route of ['invitations', `spaces/${spaceId}/invitations`]) {
    const proxy = bff();
    assert.equal((await proxy.request('GET', `${route}?limit=2&cursor=opaque%2Bcursor`)).status, 200);
    const upstream = new URL(proxy.calls[1].url);
    assert.equal(upstream.searchParams.get('limit'), '2');
    assert.equal(upstream.searchParams.get('cursor'), 'opaque+cursor');
    for (const query of ['limit=1&limit=2', 'cursor=first&cursor=second', `account_id=${spaceId}`]) {
      const denied = bff();
      assert.equal((await denied.request('GET', `${route}?${query}`)).status, 400);
      assert.equal(denied.calls.length, 1);
    }
  }
});

function taskClient(fetch = async () => { throw new Error('Unexpected network call'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/planning/client.ts', fetch, { '@/features/identity/client': identity });
}

function taskResult(overrides = {}) {
  return {
    id: invitationId, space_id: spaceId, title: 'Buy groceries', description: 'Fruit and bread',
    due_date: '2026-09-21', status: 'open', assignee: null, assignee_unavailable: false,
    created_by_account_id: accountId, completed_by_account_id: null, completed_at: null,
    created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', version: '1',
    permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] },
    ...overrides,
  };
}

test('Task schemas require coherent completion, precise versions and valid dates', () => {
  const client = taskClient();
  assert.equal(client.taskSchema.safeParse(taskResult()).success, true);
  assert.equal(client.taskSchema.safeParse(taskResult({ status: 'completed', completed_at: '2026-09-19T11:00:00Z', completed_by_account_id: accountId })).success, true);
  for (const override of [
    { version: 1 }, { version: '0' }, { status: 'completed' },
    { completed_at: '2026-09-19T11:00:00Z' }, { due_date: '2026-02-30' },
    { due_date: '2026-09-21T00:00:00Z' },
    { assignee: { account_id: accountId, display_name: 'Alex' }, assignee_unavailable: true },
  ]) assert.equal(client.taskSchema.safeParse(taskResult(override)).success, false);
});

test('Task creation uses date-only intent without hidden reminders or authority fields', () => {
  const client = taskClient();
  const draft = { title: '  Groceries  ', description: '', due_date: '2026-09-21', assignee_account_id: accountId };
  const body = client.taskBody(draft, spaceId);
  assert.equal(body.title, 'Groceries');
  assert.equal(body.due_date, '2026-09-21');
  assert.equal(body.assignee_account_id, accountId);
  assert.equal(body.space_id, spaceId);
  assert.equal('due_at' in body, false);
  assert.equal('reminder' in body, false);
  assert.equal('status' in body, false);
  assert.throws(() => client.taskBody({ ...draft, title: '  ' }, spaceId));
  assert.throws(() => client.taskBody({ ...draft, due_date: '2026-09-21T00:00:00Z' }, spaceId));
  assert.throws(() => client.taskBody({ ...draft, assignee_account_id: 'unavailable' }, spaceId));
  assert.throws(() => client.taskBody({ ...draft, role: 'owner' }, spaceId));
});

test('Task editing distinguishes unchanged unavailable assignment from explicit clearing', () => {
  const client = taskClient();
  const previous = taskResult({ assignee_unavailable: true });
  const draft = client.taskDraft(previous);
  assert.equal(draft.assignee_account_id, 'unavailable');
  const edited = client.taskBody({ ...draft, title: 'Updated' }, spaceId, previous);
  assert.deepEqual(Object.keys(edited), ['title']);
  assert.equal(edited.title, 'Updated');
  const cleared = client.taskBody({ ...draft, assignee_account_id: '', due_date: '' }, spaceId, previous);
  assert.equal(cleared.assignee_account_id, null);
  assert.equal(cleared.due_date, null);
  assert.throws(() => client.taskBody(draft, spaceId, previous), /No changes/);
});

test('Task commands retain exact key and representation precondition on retry', async () => {
  const calls = [];
  const etag = `"${'a'.repeat(64)}"`;
  const client = taskClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: taskResult({ version: '3' }) }, { headers: { ETag: etag } });
  });
  const intent = { path: `tasks/${invitationId}/status`, method: 'POST', key: spaceId, etag, body: { status: 'completed' } };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await client.sendTask(intent, accountId);
    assert.equal(result.status, 'open');
    assert.equal(result.version, '3');
  }
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.headers['Idempotency-Key'], spaceId);
    assert.equal(call.options.headers['If-Match'], etag);
    assert.equal(call.options.headers['X-Account-ID'], accountId);
    assert.deepEqual(JSON.parse(call.options.body), { status: 'completed' });
  }
});

test('Task commands cannot confirm a result without a valid ETag', async () => {
  const client = taskClient(async () => Response.json({ data: taskResult() }));
  await assert.rejects(client.sendTask({ path: 'tasks', method: 'POST', key: spaceId, body: {} }, accountId), { status: 502, code: 'INVALID_RESPONSE' });
});

test('Task pagination retains family and status scope and validates the page', async () => {
  const calls = [];
  const client = taskClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: [{ ...taskResult(), etag: `"${'b'.repeat(64)}"` }], pagination: { has_more: false, next_cursor: null } });
  });
  const page = await client.taskPage(accountId, spaceId, 'open', 'opaque+cursor', new AbortController().signal);
  assert.equal(page.data.length, 1);
  const query = new URL(calls[0].url, origin).searchParams;
  assert.equal(query.get('space_id'), spaceId);
  assert.equal(query.get('status'), 'open');
  assert.equal(query.get('cursor'), 'opaque+cursor');
  assert.equal(query.get('limit'), '20');
  const missing = taskClient(async () => Response.json({ data: [] }));
  await assert.rejects(missing.taskPage(accountId, spaceId, '', null, new AbortController().signal), { status: 502, code: 'INVALID_RESPONSE' });
});

test('Task BFF forwards only implemented operations and keeps write preconditions', async () => {
  const etag = `"${'c'.repeat(64)}"`;
  for (const [method, route] of [
    ['GET', 'tasks'], ['POST', 'tasks'], ['GET', 'tasks/assignees'],
    ['GET', `tasks/${invitationId}`], ['PATCH', `tasks/${invitationId}`], ['POST', `tasks/${invitationId}/status`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route, { 'If-Match': etag })).status, 200);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls[1].options.headers['If-Match'], etag);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['DELETE', `tasks/${invitationId}`], ['GET', `tasks/${invitationId}/status`],
    ['POST', 'tasks/assignees'], ['POST', `tasks/${invitationId}/complete`],
    ['PATCH', `tasks/${invitationId}/status`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Task BFF validates list and assignee query boundaries independently', async () => {
  const tasks = bff();
  assert.equal((await tasks.request('GET', `tasks?space_id=${spaceId}&status=open&limit=2&cursor=opaque%2Bcursor`)).status, 200);
  const query = new URL(tasks.calls[1].url).searchParams;
  assert.equal(query.get('space_id'), spaceId);
  assert.equal(query.get('status'), 'open');
  assert.equal(query.get('cursor'), 'opaque+cursor');
  const assignees = bff();
  assert.equal((await assignees.request('GET', `tasks/assignees?space_id=${spaceId}&task_id=${invitationId}`)).status, 200);
  for (const route of [
    `tasks?space_id=${spaceId}&space_id=${accountId}`, 'tasks?status=open&status=completed',
    `tasks?account_id=${accountId}`, 'tasks/assignees?status=active', `tasks/${invitationId}?space_id=${spaceId}`,
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request('GET', route)).status, 400);
    assert.equal(proxy.calls.length, 1);
  }
});

test('Task BFF denies origin, anonymous and switched-account writes before mutation', async () => {
  for (const route of ['tasks', `tasks/${invitationId}/status`]) {
    const foreign = bff();
    assert.equal((await foreign.request('POST', route, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal(foreign.calls.length, 0);
    const anonymous = bff();
    assert.equal((await anonymous.request('POST', route, { Cookie: '' })).status, 401);
    assert.equal(anonymous.calls.length, 0);
    const switched = bff();
    assert.equal((await switched.request('POST', route, { 'X-Account-ID': spaceId })).status, 409);
    assert.equal(switched.calls.length, 1);
  }
});

function reminderPreview(overrides = {}) {
  return {
    task_id: invitationId, task_title: 'Buy groceries', task_version: '1',
    local_time: '2026-09-19T15:31:00', timezone: 'Asia/Kolkata',
    recipient: { account_id: accountId, display_name: 'Alex Morgan' }, channel: 'in_app',
    options: [{ scheduled_at: '2026-09-19T10:01:00Z', dispatch_expires_at: '2026-09-20T10:01:00Z', utc_offset_minutes: 330, preview_token: 'a'.repeat(64) }],
    expires_at: '2026-09-19T10:05:00Z', ...overrides,
  };
}

test('Reminder preview rejects invalid dates, zones and inconsistent UTC choices', () => {
  const client = reminderClient();
  assert.equal(client.reminderPreviewSchema.safeParse(reminderPreview()).success, true);
  const first = reminderPreview().options[0];
  for (const invalid of [
    reminderPreview({ local_time: '2026-02-30T15:31:00' }),
    reminderPreview({ local_time: '2026-09-19T25:31:00' }),
    reminderPreview({ timezone: 'Unknown/Zone' }),
    reminderPreview({ timezone: 'IST' }),
    reminderPreview({ options: [{ ...first, utc_offset_minutes: 0 }] }),
    reminderPreview({ options: [{ ...first, scheduled_at: '2026-09-19T10:02:00Z' }] }),
    reminderPreview({ options: [{ ...first, dispatch_expires_at: first.scheduled_at }] }),
  ]) assert.equal(client.reminderPreviewSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
});

test('Reminder preview retains distinct ordered daylight-saving choices', () => {
  const client = reminderClient();
  const first = { scheduled_at: '2026-11-01T05:30:00Z', dispatch_expires_at: '2026-11-02T05:30:00Z', utc_offset_minutes: -240, preview_token: 'a'.repeat(64) };
  const second = { scheduled_at: '2026-11-01T06:30:00Z', dispatch_expires_at: '2026-11-02T06:30:00Z', utc_offset_minutes: -300, preview_token: 'b'.repeat(64) };
  const preview = reminderPreview({ local_time: '2026-11-01T01:30:00', timezone: 'America/New_York', options: [first, second] });
  assert.equal(client.reminderPreviewSchema.safeParse(preview).success, true);
  assert.equal(client.reminderPreviewSchema.safeParse({ ...preview, options: [second, first] }).success, false);
  assert.equal(client.reminderPreviewSchema.safeParse({ ...preview, options: [first, { ...second, preview_token: first.preview_token }] }).success, false);
  assert.equal(client.reminderPreviewSchema.safeParse({ ...preview, options: [first, { ...first, scheduled_at: '2026-11-01T01:30:00-04:00', preview_token: second.preview_token }] }).success, false);
});
test('Proxy stops reading a body without Content-Length once it passes the limit', async () => {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async url => {
    calls.push(String(url));
    return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : {} });
  });
  let pulled = 0;
  const body = new ReadableStream({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(4096).fill(32)); if (pulled === 100) controller.close(); } });
  const request = new NextRequest(`${origin}/api/spaces`, {
    method: 'POST', body, duplex: 'half',
    headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, 'Content-Type': 'application/json', 'Idempotency-Key': invitationId },
  });
  const response = await handlers.POST(request, { params: Promise.resolve({ path: ['spaces'] }) });
  assert.equal(response.status, 413);
  assert.ok(pulled <= 6, `read ${pulled} chunks of 4 KiB for a 16 KiB limit`);
  assert.deepEqual(calls.filter(url => !url.endsWith('/v1/me')), []);
});

test('Proxy refuses a body that does not arrive in time', { timeout: 5000 }, async () => {
  const calls = [];
  const quick = { timeout: () => { const controller = new AbortController(); setTimeout(() => controller.abort(), 50); return controller.signal; } };
  const handlers = loadSource('app/api/[...path]/route.ts', async url => {
    calls.push(String(url));
    return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : {} });
  }, {}, { AbortSignal: quick });
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"name":')); } });
  const request = new NextRequest(`${origin}/api/spaces`, {
    method: 'POST', body, duplex: 'half',
    headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, 'Content-Type': 'application/json', 'Idempotency-Key': invitationId },
  });
  const response = await handlers.POST(request, { params: Promise.resolve({ path: ['spaces'] }) });
  assert.equal(response.status, 408);
  assert.deepEqual(calls.filter(url => !url.endsWith('/v1/me')), []);
});