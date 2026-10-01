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
const taskId = '0b1f4f58-5a0c-4e67-9b7a-6f5f2a7f4c11';
const spaceId = '6a2d8c3e-1f4b-4d5a-9c7e-2b3a4c5d6e7f';
const seriesId = '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4';
const reminderId = '3c2b1a09-8f7e-4d6c-b5a4-938271605f4e';
const notificationId = '7f6e5d4c-3b2a-4190-8a7b-6c5d4e3f2a1b';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

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

function load(relative, fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource(relative, fetch, { '@/features/identity/client': identity });
}

function recorder(respond) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : undefined });
    return respond(String(url), options);
  };
  return { calls, fetch };
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [] });
  });
  async function request(method, route, overrides = {}) {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': '"s1"', ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const rule = (overrides = {}) => ({
  frequency: 'daily', repeat_every: 1, weekdays: [], local_time: '16:00', timezone: 'Asia/Kolkata',
  start_date: '2026-09-19', end_date: '2026-09-30', clock_change_policy: 'shift_forward', ...overrides,
});
const occurrence = (overrides = {}) => ({
  reminder_id: null, local_date: '2026-09-19', display_time: '16:00', scheduled_at: '2026-09-19T10:30:00Z',
  utc_offset_minutes: 330, adjustment: 'none', ...overrides,
});
const preview = (overrides = {}) => ({
  task_id: taskId, task_title: 'Water plants', task_version: '1', recipient: { account_id: accountId, display_name: 'Alex Morgan' },
  ...rule(), occurrences: [occurrence(), occurrence({ local_date: '2026-09-20', scheduled_at: '2026-09-20T10:30:00Z' })],
  occurrence_count: 12, clock_changes: [], channel: 'in_app', preview_token: 'p'.repeat(40), expires_at: '2026-09-19T10:05:00Z', ...overrides,
});
const series = (overrides = {}) => ({
  id: seriesId, task_id: taskId, space_id: spaceId, task_title: 'Water plants', task_version: '1', source_changed: false, ...rule(),
  status: 'active', reason: null, next_occurrence: occurrence({ reminder_id: reminderId }), created_at: '2026-09-19T10:00:00Z',
  updated_at: '2026-09-19T10:00:00Z', version: '1', etag: '"s1"', channel: 'in_app', ...overrides,
});
const notification = (overrides = {}) => ({
  id: notificationId, reminder_id: reminderId, task_id: taskId, space_id: spaceId, task_title: 'Water plants',
  scheduled_at: '2026-09-19T10:30:00Z', created_at: '2026-09-19T10:30:05Z', read_at: null, acknowledged_at: null,
  series_id: seriesId, snooze_count: 0, snoozed_until: null, can_snooze: true, snooze_before: '2026-09-20T10:30:00Z', ...overrides,
});

test('Repeating reminder and snooze routes pass the BFF only with reviewed methods, headers and parameters', async () => {
  for (const [method, route] of [
    ['POST', 'reminder-series/preview'], ['POST', 'reminder-series'], ['GET', `reminder-series?task_id=${taskId}&limit=20`],
    ['GET', `reminder-series/${seriesId}`], ['POST', `reminder-series/${seriesId}/pause`], ['POST', `reminder-series/${seriesId}/resume`],
    ['POST', `reminder-series/${seriesId}/skip`], ['POST', `reminder-series/${seriesId}/cancel`], ['POST', `notifications/${notificationId}/snooze`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    if (method === 'POST') {
      assert.equal(upstream.options.headers['Idempotency-Key'], key);
      assert.equal(upstream.options.headers['If-Match'], '"s1"');
    }
  }
  for (const [method, route] of [
    ['POST', `reminder-series/${seriesId}/delete`], ['PATCH', `reminder-series/${seriesId}`], ['DELETE', `reminder-series/${seriesId}`],
    ['GET', `reminder-series/${seriesId}/pause`], ['POST', `reminder-series/${seriesId}`], ['GET', `notifications/${notificationId}/snooze`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [
    ['GET', `reminder-series?account_id=${accountId}`], ['GET', 'reminder-series?limit=1&limit=2'], ['GET', `reminder-series/${seriesId}?limit=1`],
    ['POST', `reminder-series/${seriesId}/pause?minutes=10`], ['POST', `notifications/${notificationId}/snooze?minutes=10`],
  ]) {
    assert.equal((await bff().request(method, route)).status, 400, `${method} ${route}`);
  }
  const foreign = bff();
  assert.equal((await foreign.request('POST', `reminder-series/${seriesId}/cancel`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
});

test('Repeating reminder schemas reject inconsistent times and states', () => {
  const client = load('features/scheduling/client.ts');
  assert.equal(client.seriesPreviewSchema.safeParse(preview()).success, true);
  assert.equal(client.seriesSchema.safeParse(series()).success, true);
  assert.equal(client.seriesSchema.safeParse(series({ status: 'paused', reason: 'by_person', next_occurrence: null })).success, true);
  for (const changes of [
    { occurrences: [occurrence({ utc_offset_minutes: 0 })] }, { occurrences: [occurrence(), occurrence()] },
    { occurrences: [occurrence({ reminder_id: reminderId })] }, { occurrence_count: 0 }, { local_time: '9:00' }, { timezone: 'IST' },
    { weekdays: ['monday'] }, { clock_change_policy: 'latest' },
  ]) {
    assert.equal(client.seriesPreviewSchema.safeParse(preview(changes)).success, false, JSON.stringify(changes));
  }
  for (const changes of [
    { status: 'paused', reason: null, next_occurrence: null }, { status: 'active', reason: 'by_person' },
    { status: 'paused', reason: 'by_person' }, { next_occurrence: occurrence({ reminder_id: null }) }, { etag: '' }, { status: 'running' },
  ]) {
    assert.equal(client.seriesSchema.safeParse(series(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.describeRule(rule()), 'Every day at 16:00');
  assert.equal(client.describeRule(rule({ frequency: 'weekly', repeat_every: 2, weekdays: ['mon', 'fri'] })), 'Every 2 weeks on Mon, Fri at 16:00');
});

test('Repeating reminder preview and save confirm the exact reviewed rule and keep one key', async () => {
  const echo = recorder(url => Response.json({ data: url.endsWith('/preview') ? preview() : series() }));
  const client = load('features/scheduling/client.ts', echo.fetch);
  assert.equal((await client.previewSeries(accountId, taskId, rule())).occurrence_count, 12);
  assert.deepEqual(echo.calls[0].body, { task_id: taskId, ...rule() });
  const intent = { accountId, taskId, key, previewToken: 'p'.repeat(40), rule: rule() };
  await client.saveSeries(intent);
  await client.saveSeries(intent);
  assert.equal(echo.calls[1].url, '/api/reminder-series');
  assert.equal(echo.calls[1].options.headers['Idempotency-Key'], key);
  assert.equal(echo.calls[1].options.body, echo.calls[2].options.body);
  for (const changes of [{ local_time: '17:00' }, { timezone: 'UTC' }, { end_date: '2026-10-30' }, { clock_change_policy: 'skip' }]) {
    const other = load('features/scheduling/client.ts', async url => Response.json({ data: url.endsWith('/preview') ? preview(changes) : series(changes) }));
    await assert.rejects(other.previewSeries(accountId, taskId, rule()), { status: 502 });
    await assert.rejects(other.saveSeries(intent), { status: 502 });
  }
  const foreignTask = load('features/scheduling/client.ts', async () => Response.json({ data: preview({ recipient: { account_id: seriesId, display_name: 'Other' } }) }));
  await assert.rejects(foreignTask.previewSeries(accountId, taskId, rule()), { status: 502 });
});

test('Repeating reminder list and commands validate pages, preconditions and outcomes', async () => {
  const listed = recorder(() => Response.json({ data: [series()], pagination: { next_cursor: null, has_more: false } }));
  const client = load('features/scheduling/client.ts', listed.fetch);
  assert.equal((await client.seriesPage(accountId, taskId)).data.length, 1);
  assert.equal(listed.calls[0].url, `/api/reminder-series?limit=20&task_id=${taskId}`);
  for (const response of [
    { data: [series(), series()], pagination: { next_cursor: null, has_more: false } },
    { data: [series({ task_id: spaceId })], pagination: { next_cursor: null, has_more: false } },
    { data: [series()] },
  ]) {
    const invalid = load('features/scheduling/client.ts', async () => Response.json(response));
    await assert.rejects(invalid.seriesPage(accountId, taskId), { status: 502 });
  }
  const repeated = load('features/scheduling/client.ts', async () => Response.json({ data: [], pagination: { next_cursor: 'same', has_more: true } }));
  await assert.rejects(repeated.seriesPage(accountId, undefined, 'same'), { status: 502 });
  const paused = recorder(() => Response.json({ data: series({ status: 'paused', reason: 'by_person', next_occurrence: null, version: '2', etag: '"s2"' }) }));
  const commands = load('features/scheduling/client.ts', paused.fetch);
  const intent = { accountId, series: series(), operation: 'pause', key };
  assert.equal((await commands.commandSeries(intent)).status, 'paused');
  assert.equal(paused.calls[0].url, `/api/reminder-series/${seriesId}/pause`);
  assert.equal(paused.calls[0].options.headers['If-Match'], '"s1"');
  assert.equal(paused.calls[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(paused.calls[0].body, {});
  await assert.rejects(commands.commandSeries({ ...intent, operation: 'cancel' }), { status: 502 });
  await assert.rejects(commands.commandSeries({ ...intent, series: series({ id: taskId }) }), { status: 502 });
});

test('Snooze sends one reviewed choice with a stable key and confirms the follow-up', async () => {
  const snoozed = recorder(() => Response.json({ data: notification({ read_at: '2026-09-19T10:31:00Z', can_snooze: false, snoozed_until: '2026-09-19T11:31:00Z' }) }));
  const client = load('features/scheduling/client.ts', snoozed.fetch);
  assert.equal(client.notificationSchema.safeParse(notification()).success, true);
  assert.equal(client.notificationSchema.safeParse(notification({ snooze_count: 4 })).success, false);
  const legacy = { ...notification() };
  for (const field of ['series_id', 'snooze_count', 'snoozed_until', 'can_snooze', 'snooze_before']) delete legacy[field];
  assert.equal(client.notificationSchema.safeParse(legacy).success, true);
  const intent = { accountId, notification: notification(), minutes: 60, key };
  const result = await client.snoozeNotification(intent);
  assert.equal(result.snoozed_until, '2026-09-19T11:31:00Z');
  await client.snoozeNotification(intent);
  assert.equal(snoozed.calls[0].url, `/api/notifications/${notificationId}/snooze`);
  assert.deepEqual(snoozed.calls[0].body, { minutes: 60 });
  assert.equal(snoozed.calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(snoozed.calls[0].options.body, snoozed.calls[1].options.body);
  const unconfirmed = load('features/scheduling/client.ts', async () => Response.json({ data: notification() }));
  await assert.rejects(unconfirmed.snoozeNotification(intent), { status: 502 });
  const other = load('features/scheduling/client.ts', async () => Response.json({ data: notification({ reminder_id: seriesId, can_snooze: false }) }));
  await assert.rejects(other.snoozeNotification(intent), { status: 502 });
});

test('Calendar accepts planned repeating times in server order and rejects inconsistent ones', async () => {
  const task = { id: taskId, kind: 'task', task_id: taskId, space_id: spaceId, title: 'Water plants', date: '2026-09-21', scheduled_at: null, timezone: null, status: 'open', source_changed: false, series_id: null };
  const reminder = { id: reminderId, kind: 'reminder', task_id: taskId, space_id: spaceId, title: 'Water plants', date: '2026-09-21', scheduled_at: '2026-09-21T10:30:00Z', timezone: 'Asia/Kolkata', status: 'scheduled', source_changed: false, series_id: seriesId };
  const planned = { ...reminder, id: '5d4c3b2a-1908-4f7e-a6d5-c4b3a2918070', kind: 'planned', date: '2026-09-25', scheduled_at: '2026-09-25T10:30:00Z', status: 'planned' };
  const page = entries => load('features/planning/calendar-client.ts', async () => Response.json({ data: entries, pagination: { next_cursor: null, has_more: false } }));
  const accepted = await page([task, reminder, planned]).calendarPage(accountId, spaceId, '2026-09', 'Asia/Kolkata', null);
  assert.deepEqual(accepted.data.map(entry => entry.kind), ['task', 'reminder', 'planned']);
  const sameDay = { ...planned, date: '2026-09-21', scheduled_at: '2026-09-21T11:30:00Z' };
  assert.equal((await page([task, reminder, sameDay]).calendarPage(accountId, spaceId, '2026-09', 'Asia/Kolkata', null)).data.length, 3);
  for (const entries of [
    [task, planned, reminder], [task, { ...planned, series_id: null }], [task, { ...planned, status: 'scheduled' }],
    [task, { ...planned, date: '2026-09-24' }], [task, sameDay, reminder],
  ]) {
    await assert.rejects(page(entries).calendarPage(accountId, spaceId, '2026-09', 'Asia/Kolkata', null), { status: 502 }, JSON.stringify(entries.map(entry => entry.kind)));
  }
});
