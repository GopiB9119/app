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
const otherId = '1f2e3d4c-5b6a-4789-9abc-def012345678';
const taskId = '0b1f4f58-5a0c-4e67-9b7a-6f5f2a7f4c11';
const spaceId = '6a2d8c3e-1f4b-4d5a-9c7e-2b3a4c5d6e7f';
const seriesId = '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4';
const newSeriesId = '2d3c4b5a-6978-4f1e-8d2c-3b4a59687786';
const reminderId = '3c2b1a09-8f7e-4d6c-b5a4-938271605f4e';
const backupId = '8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d';
const eventId = '5e4d3c2b-1a09-4f8e-b7d6-c5b4a3928170';
const instructionId = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date, TextEncoder,
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

const person = (id, name = 'Alex Morgan') => ({ account_id: id, display_name: name });
const backup = (overrides = {}) => ({
  id: backupId, task_id: taskId, space_id: spaceId, task_title: 'Water plants', role: 'owner', owner: person(accountId),
  contact: person(otherId, 'Sam Rivera'), wait_minutes: 30, status: 'pending', created_at: '2026-09-19T10:00:00Z',
  responded_at: null, ended_at: null, version: '1', ...overrides,
});
const item = (overrides = {}) => {
  const value = { kind: 'event', reference: `${eventId}:1790000000`, title: 'Doctor visit', due_at: '2026-09-19T11:00:00Z', ends_at: '2026-09-19T12:00:00Z',
    space_id: spaceId, event_id: eventId, display_time: '17:00', timezone: 'Asia/Kolkata', ...overrides };
  return { id: `${value.kind}:${value.reference}`, ...value, ...('id' in overrides ? { id: overrides.id } : {}) };
};
const feed = (overrides = {}) => ({
  items: [item()], quiet: { active: false, until: null }, next_check_at: '2026-09-19T11:00:00Z', generated_at: '2026-09-19T10:00:00Z', ...overrides,
});
const rule = (overrides = {}) => ({
  frequency: 'daily', repeat_every: 1, weekdays: [], local_time: '16:00', timezone: 'Asia/Kolkata',
  start_date: '2026-09-19', end_date: '2026-09-30', clock_change_policy: 'shift_forward', ...overrides,
});
const occurrence = (overrides = {}) => ({
  reminder_id: reminderId, local_date: '2026-09-19', display_time: '16:00', scheduled_at: '2026-09-19T10:30:00Z',
  utc_offset_minutes: 330, adjustment: 'none', ...overrides,
});
const series = (overrides = {}) => ({
  id: seriesId, task_id: taskId, space_id: spaceId, task_title: 'Water plants', task_version: '1', source_changed: false, ...rule(),
  status: 'active', reason: null, next_occurrence: occurrence(), created_at: '2026-09-19T10:00:00Z',
  updated_at: '2026-09-19T10:00:00Z', version: '1', etag: '"s1"', channel: 'in_app', replaced_by: null, ...overrides,
});

test('Alert, quiet-hour, backup and series change routes pass the BFF only with reviewed methods and parameters', async () => {
  for (const [method, route] of [
    ['GET', 'me/alerts'], ['POST', 'me/alerts/dismiss'], ['GET', 'me/quiet-hours'], ['PATCH', 'me/quiet-hours'], ['GET', 'me/care-alerts'],
    ['GET', `events/${eventId}/alert`], ['POST', `events/${eventId}/alert`], ['POST', `care/instructions/${instructionId}/alerts`],
    ['GET', 'reminder-backups?role=contact&limit=20'], ['GET', `reminder-backups?role=owner&task_id=${taskId}&cursor=c`], ['POST', 'reminder-backups'],
    ['GET', `reminder-backups/contacts?task_id=${taskId}`], ['POST', `reminder-backups/${backupId}/accept`],
    ['POST', `reminder-backups/${backupId}/decline`], ['POST', `reminder-backups/${backupId}/cancel`],
    ['POST', `reminder-series/${seriesId}/move`], ['POST', `reminder-series/${seriesId}/replace`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['POST', 'me/alerts'], ['GET', 'me/alerts/dismiss'], ['DELETE', 'me/quiet-hours'], ['POST', 'me/care-alerts'],
    ['PATCH', `events/${eventId}/alert`], ['GET', `care/instructions/${instructionId}/alerts`], ['GET', `reminder-backups/${backupId}`],
    ['POST', `reminder-backups/${backupId}/delete`], ['POST', 'reminder-backups/contacts'], ['GET', `reminder-series/${seriesId}/move`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [
    ['GET', `reminder-backups?account_id=${accountId}`], ['GET', 'reminder-backups?role=owner&role=contact'],
    ['GET', `reminder-backups/contacts?task_id=${taskId}&limit=5`], ['GET', 'me/alerts?limit=5'],
    ['POST', 'me/alerts/dismiss?kind=event'], ['POST', `events/${eventId}/alert?minutes=10`], ['POST', `reminder-series/${seriesId}/move?at=1`],
  ]) {
    assert.equal((await bff().request(method, route)).status, 400, `${method} ${route}`);
  }
  const foreign = bff();
  assert.equal((await foreign.request('POST', 'me/alerts/dismiss', { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
});

test('Alert feed and quiet hours reject inconsistent responses', async () => {
  const client = load('features/notifications/alerts-client.ts');
  assert.equal(client.alertFeedSchema.safeParse(feed()).success, true);
  assert.equal(client.alertFeedSchema.safeParse(feed({ quiet: { active: true, until: '2026-09-19T16:00:00Z' } })).success, true);
  for (const changes of [
    { items: [item({ id: 'event:other' })] }, { items: [item(), item()] }, { items: [item({ ends_at: '2026-09-19T10:00:00Z' })] },
    { items: [item({ kind: 'sms' })] }, { quiet: { active: true, until: null } }, { quiet: { active: false, until: '2026-09-19T16:00:00Z' } },
    { next_check_at: '2026-09-19T09:00:00Z' },
  ]) {
    assert.equal(client.alertFeedSchema.safeParse(feed(changes)).success, false, JSON.stringify(changes));
  }
  assert.match(client.alertLine(item({ kind: 'backup', reference: `${backupId}:${reminderId}`, person_name: 'Sam Rivera', title: 'Water plants' })), /Sam Rivera has not answered/);
  await assert.rejects(client.dismissAlert(accountId, item({ kind: 'reminder', reference: reminderId })), { status: 422 });
  const dismissed = recorder(() => Response.json({ data: { kind: 'event', reference: item().reference, dismissed_at: '2026-09-19T11:01:00Z' } }));
  await load('features/notifications/alerts-client.ts', dismissed.fetch).dismissAlert(accountId, item());
  assert.deepEqual(dismissed.calls[0].body, { kind: 'event', reference: item().reference });
  const quiet = { start: '22:00', end: '07:00', timezone: 'Asia/Kolkata', quiet: { active: false, until: null }, version: '1' };
  const saved = recorder(() => Response.json({ data: quiet }, { headers: { ETag: '"q1"' } }));
  const result = await load('features/notifications/alerts-client.ts', saved.fetch).saveQuietHours(accountId, '22:00', '07:00', '"q0"');
  assert.equal(result.etag, '"q1"');
  assert.equal(saved.calls[0].options.method, 'PATCH');
  assert.equal(saved.calls[0].options.headers['If-Match'], '"q0"');
  assert.deepEqual(saved.calls[0].body, { start: '22:00', end: '07:00' });
  const unconfirmed = load('features/notifications/alerts-client.ts', async () => Response.json({ data: { ...quiet, end: '08:00' } }, { headers: { ETag: '"q1"' } }));
  await assert.rejects(unconfirmed.saveQuietHours(accountId, '22:00', '07:00', '"q0"'), { status: 502 });
  const versionless = load('features/notifications/alerts-client.ts', async () => Response.json({ data: quiet }));
  await assert.rejects(versionless.quietHours(accountId), { status: 502 });
  assert.equal(client.quietHoursSchema.safeParse({ ...quiet, end: null }).success, false);
  assert.equal(client.quietHoursSchema.safeParse({ ...quiet, end: '22:00' }).success, false);
});

test('Backup people need both people, one stable request and confirmed answers', async () => {
  const client = load('features/notifications/alerts-client.ts');
  assert.equal(client.backupSchema.safeParse(backup()).success, true);
  for (const changes of [
    { contact: person(accountId) }, { status: 'active' }, { status: 'pending', responded_at: '2026-09-19T10:01:00Z' },
    { status: 'cancelled', responded_at: '2026-09-19T10:01:00Z' }, { wait_minutes: 20 },
  ]) {
    assert.equal(client.backupSchema.safeParse(backup(changes)).success, false, JSON.stringify(changes));
  }
  const asked = recorder(() => Response.json({ data: backup() }));
  const asking = load('features/notifications/alerts-client.ts', asked.fetch);
  const intent = { accountId, taskId, contactId: otherId, waitMinutes: 30, key };
  await asking.askBackup(intent);
  await asking.askBackup(intent);
  assert.equal(asked.calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(asked.calls[0].options.body, asked.calls[1].options.body);
  assert.deepEqual(asked.calls[0].body, { task_id: taskId, contact_account_id: otherId, wait_minutes: 30 });
  await assert.rejects(asking.askBackup({ ...intent, waitMinutes: 60 }), { status: 502 });
  const listed = recorder(() => Response.json({ data: [backup({ role: 'contact', owner: person(otherId), contact: person(accountId) })], pagination: { next_cursor: null, has_more: false } }));
  assert.equal((await load('features/notifications/alerts-client.ts', listed.fetch).backupPage(accountId, 'contact')).data.length, 1);
  assert.equal(listed.calls[0].url, '/api/reminder-backups?role=contact&limit=20');
  const wrongRole = load('features/notifications/alerts-client.ts', async () => Response.json({ data: [backup()], pagination: { next_cursor: null, has_more: false } }));
  await assert.rejects(wrongRole.backupPage(accountId, 'contact'), { status: 502 });
  const answered = load('features/notifications/alerts-client.ts', async () => Response.json({ data: backup({ status: 'active', role: 'contact', owner: person(otherId), contact: person(accountId), responded_at: '2026-09-19T10:01:00Z' }) }));
  assert.equal((await answered.respondBackup(accountId, backup(), 'accept')).status, 'active');
  await assert.rejects(answered.respondBackup(accountId, backup(), 'decline'), { status: 502 });
  const self = load('features/notifications/alerts-client.ts', async () => Response.json({ data: [person(accountId)] }));
  await assert.rejects(self.backupContacts(accountId, taskId), { status: 502 });
});

test('Event and dose alert settings confirm the exact choice', async () => {
  const set = recorder(() => Response.json({ data: { event_id: eventId, minutes_before: 30 } }));
  const client = load('features/notifications/alerts-client.ts', set.fetch);
  assert.equal(await client.setEventAlert(accountId, eventId, 30), 30);
  assert.equal(set.calls[0].options.method, 'POST');
  assert.deepEqual(set.calls[0].body, { minutes_before: 30 });
  await assert.rejects(client.setEventAlert(accountId, eventId, 60), { status: 502 });
  const care = recorder(() => Response.json({ data: { instruction_id: instructionId, enabled: true } }));
  const careClient = load('features/notifications/alerts-client.ts', care.fetch);
  assert.equal(await careClient.setCareAlert(accountId, instructionId, true), true);
  assert.equal(care.calls[0].url, `/api/care/instructions/${instructionId}/alerts`);
  await assert.rejects(careClient.setCareAlert(accountId, instructionId, false), { status: 502 });
  const listed = load('features/notifications/alerts-client.ts', async () => Response.json({ data: [{ instruction_id: instructionId, enabled: true }] }));
  assert.equal((await listed.careAlerts(accountId)).has(instructionId), true);
});

test('Changing a repeating reminder replaces it, and moving keeps the same day', async () => {
  const client = load('features/scheduling/client.ts');
  assert.equal(client.seriesSchema.safeParse(series({ status: 'cancelled', next_occurrence: null, replaced_by: newSeriesId })).success, true);
  assert.equal(client.seriesSchema.safeParse(series({ replaced_by: newSeriesId })).success, false);
  assert.equal(client.seriesSchema.safeParse(series({ next_occurrence: occurrence({ display_time: '18:15', scheduled_at: '2026-09-19T12:45:00Z', adjustment: 'moved' }) })).success, true);
  const preview = recorder(() => Response.json({ data: {} }));
  await assert.rejects(load('features/scheduling/client.ts', preview.fetch).previewSeries(accountId, taskId, rule(), seriesId));
  assert.deepEqual(preview.calls[0].body, { task_id: taskId, ...rule(), replaces_series_id: seriesId });
  const replaced = recorder(() => Response.json({ data: series({ id: newSeriesId, local_time: '18:00', next_occurrence: occurrence({ display_time: '18:00', scheduled_at: '2026-09-19T12:30:00Z' }) }) }));
  const replacing = load('features/scheduling/client.ts', replaced.fetch);
  const intent = { accountId, series: series(), previewToken: 'p'.repeat(40), key, rule: rule({ local_time: '18:00' }) };
  assert.equal((await replacing.replaceSeries(intent)).id, newSeriesId);
  assert.equal(replaced.calls[0].url, `/api/reminder-series/${seriesId}/replace`);
  assert.equal(replaced.calls[0].options.headers['If-Match'], '"s1"');
  assert.equal(replaced.calls[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(replaced.calls[0].body, { preview_token: 'p'.repeat(40) });
  await assert.rejects(replacing.replaceSeries({ ...intent, rule: rule({ local_time: '19:00' }) }), { status: 502 });
  const unchanged = load('features/scheduling/client.ts', async () => Response.json({ data: series() }));
  await assert.rejects(unchanged.replaceSeries({ ...intent, rule: rule() }), { status: 502 });
  const moved = recorder(() => Response.json({ data: series({ version: '2', etag: '"s2"', next_occurrence: occurrence({ display_time: '18:15', scheduled_at: '2026-09-19T12:45:00Z', adjustment: 'moved' }) }) }));
  const moving = load('features/scheduling/client.ts', moved.fetch);
  const move = { accountId, series: series(), localTime: '2026-09-19T18:15', key };
  assert.equal((await moving.moveSeries(move)).next_occurrence.display_time, '18:15');
  assert.deepEqual(moved.calls[0].body, { local_time: '2026-09-19T18:15' });
  assert.equal(moved.calls[0].options.headers['If-Match'], '"s1"');
  await assert.rejects(moving.moveSeries({ ...move, localTime: '2026-09-19T18:30' }), { status: 502 });
});

test('Calendar shows Space events and writes a valid calendar file copy', () => {
  const calendar = load('features/planning/calendar-client.ts');
  const event = {
    id: eventId, kind: 'event', task_id: null, space_id: spaceId, title: 'Picnic, park; bring food', date: '2026-09-25',
    scheduled_at: '2026-09-25T04:30:00Z', timezone: 'Asia/Kolkata', status: 'cancelled', source_changed: false, series_id: null,
  };
  const task = {
    id: taskId, kind: 'task', task_id: taskId, space_id: spaceId, title: `Buy groceries ${'é'.repeat(60)}`, date: '2026-09-30',
    scheduled_at: null, timezone: null, status: 'open', source_changed: false,
  };
  const file = calendar.calendarFile([task, event], new Date('2026-09-19T10:00:00Z'));
  const lines = file.split('\r\n');
  assert.equal(file.endsWith('\r\n'), true);
  assert.equal(file.includes('\n') && !file.replace(/\r\n/g, '').includes('\n'), true);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20260930'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261001'));
  assert.ok(lines.includes('DTSTART:20260925T043000Z'));
  assert.ok(lines.includes('SUMMARY:Event: Picnic\\, park\\; bring food'));
  assert.ok(lines.includes('STATUS:CANCELLED'));
  assert.ok(lines.includes(`UID:event-${eventId}@community-platform.local`));
  for (const line of lines) assert.ok(Buffer.byteLength(line) <= 75, line);
  const unfolded = file.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`SUMMARY:Task due: Buy groceries ${'é'.repeat(60)}`));
  assert.equal(calendar.compareCalendarEntries(task, event) > 0, true);
});
