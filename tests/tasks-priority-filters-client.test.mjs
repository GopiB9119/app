import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// DEC-029 (T153): task priority, and list filters by assignee and due date.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';
const etag = `"${'a'.repeat(64)}"`;

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function taskClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  return loadSource('features/planning/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
}

const task = (overrides = {}) => ({
  id: taskId, space_id: spaceId, title: 'Buy groceries', description: '', due_date: '2026-10-02', status: 'open',
  priority: 'high', assignee: null, assignee_unavailable: false, created_by_account_id: accountId,
  completed_by_account_id: null, completed_at: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
  version: '1', permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] }, ...overrides,
});

test('A task carries its priority, and an older answer without one reads as normal', () => {
  const client = taskClient();
  assert.equal(client.taskSchema.parse(task()).priority, 'high');
  const { priority: _omitted, ...older } = task();
  assert.equal(client.taskSchema.parse(older).priority, 'normal');
  for (const priority of ['urgent', 'HIGH', null, 2]) assert.equal(client.taskSchema.safeParse(task({ priority })).success, false);
});

test('Creating sends the chosen priority, and editing sends it only when it changed', () => {
  const client = taskClient();
  const draft = { ...client.taskDraft(), title: 'Buy groceries', priority: 'low' };
  assert.equal(client.taskBody(draft, spaceId).priority, 'low');
  assert.equal('priority' in client.taskBody({ ...client.taskDraft(), title: 'Plain' }, spaceId), false);
  assert.throws(() => client.taskBody({ ...draft, priority: 'urgent' }, spaceId));
  const previous = task();
  const kept = client.taskDraft(previous);
  assert.equal(kept.priority, 'high');
  assert.deepEqual({ ...client.taskBody({ ...kept, priority: 'normal' }, spaceId, previous) }, { priority: 'normal' });
  assert.deepEqual(Object.keys(client.taskBody({ ...kept, title: 'Renamed' }, spaceId, previous)), ['title']);
});

test('Date choices are counted from the person\'s own day', () => {
  const client = taskClient();
  // 2026-10-01 20:00 UTC is already 2 October in Kolkata but still 1 October in New York.
  const moment = new Date('2026-10-01T20:00:00Z');
  assert.equal(client.localDate('Asia/Kolkata', moment), '2026-10-02');
  assert.equal(client.localDate('America/New_York', moment), '2026-10-01');
  assert.deepEqual({ ...client.dueRange('today', '2026-10-02') }, { due_from: '2026-10-02', due_to: '2026-10-02' });
  assert.deepEqual({ ...client.dueRange('before', '2026-10-01') }, { due_to: '2026-09-30' });
  assert.deepEqual({ ...client.dueRange('week', '2026-12-28') }, { due_from: '2026-12-28', due_to: '2027-01-03' });
  assert.deepEqual({ ...client.dueRange('', '2026-10-02') }, {});
});

test('The list request carries the filters, and only the ones chosen', async () => {
  const calls = [];
  const client = taskClient(async url => { calls.push(new URL(String(url), origin)); return Response.json({ data: [{ ...task(), etag }], pagination: { has_more: false, next_cursor: null } }); });
  await client.taskPage(accountId, spaceId, 'open', null, new AbortController().signal, { assignee: 'none', due_from: '2026-10-02', due_to: '2026-10-08' });
  await client.taskPage(accountId, spaceId, '', 'next+page', new AbortController().signal, { assignee: undefined });
  const [filtered, plain] = calls.map(url => Object.fromEntries(url.searchParams));
  assert.deepEqual(filtered, { space_id: spaceId, limit: '20', status: 'open', assignee: 'none', due_from: '2026-10-02', due_to: '2026-10-08' });
  assert.deepEqual(plain, { space_id: spaceId, limit: '20', cursor: 'next+page' });
});

for (const [name, intent, response] of [
  ['creation Space', { path: 'tasks', method: 'POST', key, body: { space_id: spaceId, title: 'Buy groceries' } }, task({ space_id: accountId })],
  ['edited task', { path: `tasks/${taskId}`, method: 'PATCH', key, etag, body: { title: 'Reviewed groceries' } }, task({ id: accountId, title: 'Reviewed groceries' })],
  ['status task', { path: `tasks/${taskId}/status`, method: 'POST', key, etag, body: { status: 'completed' } }, task({ id: accountId, status: 'completed', completed_at: '2026-10-01T11:00:00Z', completed_by_account_id: accountId })],
]) {
  test(`Task response identity rejects a mismatched ${name}`, async () => {
    const client = taskClient(async () => Response.json({ data: response }, { headers: { ETag: etag } }));
    await assert.rejects(client.sendTask(intent, accountId), { status: 502, code: 'INVALID_RESPONSE' });
  });
}

test('Task response identity rejects a different task on reload', async () => {
  const client = taskClient(async () => Response.json({ data: task({ id: accountId }) }, { headers: { ETag: etag } }));
  await assert.rejects(client.readTask(taskId, accountId), { status: 502, code: 'INVALID_RESPONSE' });
});

for (const [name, intent] of [
  ['edited task', { path: `tasks/${taskId}`, method: 'PATCH', key, etag, body: { title: 'Reviewed groceries' } }],
  ['status task', { path: `tasks/${taskId}/status`, method: 'POST', key, etag, body: { status: 'completed' } }],
]) {
  test(`Task response identity rejects a different Space for the ${name}`, async () => {
    const client = taskClient(async () => Response.json({ data: task({ space_id: accountId }) }, { headers: { ETag: etag } }));
    await assert.rejects(client.sendTask(intent, accountId, spaceId), { status: 502, code: 'INVALID_RESPONSE' });
  });
}

test('Task response identity rejects a different Space on reload', async () => {
  const client = taskClient(async () => Response.json({ data: task({ space_id: accountId }) }, { headers: { ETag: etag } }));
  await assert.rejects(client.readTask(taskId, accountId, spaceId), { status: 502, code: 'INVALID_RESPONSE' });
});

test('Task response identity accepts canonical UUIDs without changing the request', async () => {
  const calls = [];
  const client = taskClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: task() }, { headers: { ETag: etag } });
  });
  const body = { space_id: spaceId.toUpperCase(), title: 'Buy groceries' };
  assert.equal((await client.sendTask({ path: 'tasks', method: 'POST', key, body }, accountId, spaceId.toUpperCase())).id, taskId);
  assert.equal((await client.sendTask({ path: `tasks/${taskId.toUpperCase()}`, method: 'PATCH', key, etag, body: { title: 'Buy groceries' } }, accountId, spaceId.toUpperCase())).id, taskId);
  assert.equal((await client.readTask(taskId.toUpperCase(), accountId, spaceId.toUpperCase())).id, taskId);
  assert.equal(calls[0].options.body, JSON.stringify(body));
  assert.equal(calls[1].url, `/api/tasks/${taskId.toUpperCase()}`);
  assert.equal(calls[2].url, `/api/tasks/${taskId.toUpperCase()}`);
});

test('Task response identity permits the current state on delayed command replay', async () => {
  const current = task({ title: 'Updated by another member', status: 'open', version: '3' });
  const currentEtag = `"${'b'.repeat(64)}"`;
  const client = taskClient(async () => Response.json({ data: current }, { headers: { ETag: currentEtag } }));
  for (const intent of [
    { path: 'tasks', method: 'POST', key, body: { space_id: spaceId, title: 'Buy groceries' } },
    { path: `tasks/${taskId}`, method: 'PATCH', key, etag, body: { title: 'Earlier edit' } },
    { path: `tasks/${taskId}/status`, method: 'POST', key, etag, body: { status: 'completed' } },
  ]) {
    const result = await client.sendTask(intent, accountId);
    assert.equal(result.id, taskId);
    assert.equal(result.title, current.title);
    assert.equal(result.status, 'open');
    assert.equal(result.version, '3');
    assert.equal(result.etag, currentEtag);
  }
});

for (const [name, data, pagination, cursor] of [
  ['another Space', [{ ...task({ space_id: accountId }), etag }], { has_more: false, next_cursor: null }, null],
  ['duplicate task IDs', [{ ...task(), etag }, { ...task({ id: taskId.toUpperCase() }), etag }], { has_more: false, next_cursor: null }, null],
  ['more than the requested page size', Array.from({ length: 21 }, (_, index) => ({ ...task({ id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}` }), etag })), { has_more: false, next_cursor: null }, null],
  ['a repeated continuation cursor', [{ ...task(), etag }], { has_more: true, next_cursor: 'same+cursor' }, 'same+cursor'],
  ['an empty continuation page', [], { has_more: true, next_cursor: 'next+cursor' }, null],
]) {
  test(`Task list integrity rejects ${name}`, async () => {
    const client = taskClient(async () => Response.json({ data, pagination }));
    await assert.rejects(client.taskPage(accountId, spaceId, '', cursor, new AbortController().signal), { status: 502, code: 'INVALID_RESPONSE' });
  });
}

for (const count of [0, 20]) {
  test(`Task list integrity accepts a valid final page with ${count} tasks`, async () => {
    const data = Array.from({ length: count }, (_, index) => ({ ...task({ id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}` }), etag }));
    const client = taskClient(async () => Response.json({ data, pagination: { has_more: false, next_cursor: null } }));
    const page = await client.taskPage(accountId, spaceId, '', 'previous+cursor', new AbortController().signal);
    assert.equal(page.data.length, count);
    assert.equal(page.pagination.has_more, false);
    assert.equal(page.pagination.next_cursor, null);
  });
}

test('Task list integrity preserves valid pagination, account scope and cancellation', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const client = taskClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: [{ ...task(), etag }], pagination: { has_more: true, next_cursor: 'next+/cursor=' } });
  });
  const page = await client.taskPage(accountId, spaceId.toUpperCase(), '', 'previous+/cursor=', signal);
  assert.equal(page.data[0].id, taskId);
  assert.equal(page.pagination.next_cursor, 'next+/cursor=');
  const request = new URL(calls[0].url, origin);
  assert.equal(request.searchParams.get('space_id'), spaceId.toUpperCase());
  assert.equal(request.searchParams.get('cursor'), 'previous+/cursor=');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.signal, signal);
  const stopped = new DOMException('The task read was cancelled.', 'AbortError');
  const cancelled = taskClient(async () => { throw stopped; });
  await assert.rejects(cancelled.taskPage(accountId, spaceId, '', null, signal), error => error === stopped);
});

for (const [name, response, status, filters] of [
  ['a different status', task({ status: 'in_progress' }), 'open', {}],
  ['a date before the lower bound', task({ due_date: '2026-10-01' }), '', { due_from: '2026-10-02' }],
  ['a date after the upper bound', task({ due_date: '2026-10-09' }), '', { due_to: '2026-10-08' }],
  ['an undated task with a lower bound', task({ due_date: null }), '', { due_from: '2026-10-02' }],
  ['an undated task with an upper bound', task({ due_date: null }), '', { due_to: '2026-10-08' }],
]) {
  test(`Task list filters reject ${name}`, async () => {
    const client = taskClient(async () => Response.json({ data: [{ ...response, etag }], pagination: { has_more: false, next_cursor: null } }));
    await assert.rejects(client.taskPage(accountId, spaceId, status, null, new AbortController().signal, filters), { status: 502, code: 'INVALID_RESPONSE' });
  });
}

test('Task list filters preserve inclusive date bounds, unfiltered dates and empty results', async () => {
  for (const [status, filters, rows] of [
    ['open', { due_from: '2026-10-02', due_to: '2026-10-08' }, [task(), task({ id: accountId, due_date: '2026-10-08' })]],
    ['', {}, [task({ due_date: null, status: 'in_progress' })]],
    ['open', { due_from: '2026-10-02' }, []],
  ]) {
    const client = taskClient(async () => Response.json({ data: rows.map(row => ({ ...row, etag })), pagination: { has_more: false, next_cursor: null } }));
    const page = await client.taskPage(accountId, spaceId, status, null, new AbortController().signal, filters);
    assert.deepEqual(Array.from(page.data, row => row.id), rows.map(row => row.id));
    assert.deepEqual(Array.from(page.data, row => row.due_date), rows.map(row => row.due_date));
    assert.equal(page.pagination.has_more, false);
  }
});

test('The web proxy forwards the task filters once each and nothing else', async () => {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [], pagination: { has_more: false, next_cursor: null } });
  });
  const send = route => handlers.GET(new NextRequest(`${origin}/api/${route}`, { method: 'GET', headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId } }),
    { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  const passed = await send(`tasks?space_id=${spaceId}&assignee=${accountId}&due_from=2026-10-02&due_to=2026-10-08`);
  assert.equal(passed.status, 200);
  const forwarded = new URL(calls.at(-1).url).searchParams;
  assert.equal(forwarded.get('assignee'), accountId);
  assert.equal(forwarded.get('due_from'), '2026-10-02');
  assert.equal(forwarded.get('due_to'), '2026-10-08');
  for (const route of [`tasks?space_id=${spaceId}&assignee=none&assignee=${accountId}`, `tasks?space_id=${spaceId}&priority=high`, `tasks?space_id=${spaceId}&due=today`]) {
    const before = calls.length;
    assert.equal((await send(route)).status, 400);
    assert.equal(calls.length, before + 1);
  }
});
