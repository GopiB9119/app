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
