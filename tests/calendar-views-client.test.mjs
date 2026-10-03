import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// DEC-031 (T163): the calendar's month, week and day views, and showing or hiding each source.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: 'https://client.example.test' } },
  }, { filename: relative });
  return exports;
}

function calendar(data = [], calls = []) {
  const fetch = async url => {
    calls.push(String(url));
    return Response.json({ data, pagination: { next_cursor: null, has_more: false } });
  };
  return loadSource('features/planning/calendar-client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
}

const query = url => Object.fromEntries(new URL(url, 'https://client.example.test').searchParams);
const range = value => ({ ...value });

test('Each view covers its own dates: the month, the Sunday-to-Saturday week, or the day', () => {
  const client = calendar();
  assert.deepEqual(range(client.viewRange('month', '2026-10-14')), { start: '2026-10-01', end: '2026-10-31' });
  for (const date of ['2026-10-11', '2026-10-14', '2026-10-17']) {
    assert.deepEqual(range(client.viewRange('week', date)), { start: '2026-10-11', end: '2026-10-17' }, date);
  }
  assert.deepEqual(range(client.viewRange('week', '2026-12-30')), { start: '2026-12-27', end: '2027-01-02' });
  assert.deepEqual(range(client.viewRange('day', '2028-02-29')), { start: '2028-02-29', end: '2028-02-29' });
  // The first and last weeks stay within 1900 to 2100, which is all the server accepts.
  assert.deepEqual(range(client.viewRange('week', '1900-01-03')), { start: '1900-01-01', end: '1900-01-06' });
  assert.deepEqual(range(client.viewRange('week', '2100-12-31')), { start: '2100-12-26', end: '2100-12-31' });
  for (const date of ['2026-02-30', '2027-02-29', '1899-12-31', '2101-01-01', '2026-1-05', '', 'tomorrow']) {
    assert.throws(() => client.viewRange('day', date), { status: 422 }, date);
  }
  assert.equal(client.shiftDate('2026-12-27', 7), '2027-01-03');
  assert.equal(client.shiftDate('2028-03-01', -1), '2028-02-29');
});

test('A week or day page asks for exactly its dates and refuses entries outside them', async () => {
  const entry = { id: taskId, task_id: taskId, space_id: spaceId, kind: 'task', title: 'Week task', date: '2026-10-14', scheduled_at: null, timezone: null, status: 'open', source_changed: false };
  const week = { start: '2026-10-11', end: '2026-10-17' };
  const calls = [];
  assert.equal((await calendar([entry], calls).calendarRangePage(accountId, spaceId, week, 'UTC', null)).data[0].date, '2026-10-14');
  assert.deepEqual(query(calls[0]), { space_id: spaceId, start_date: '2026-10-11', end_date: '2026-10-17', timezone: 'UTC', limit: '50' });
  for (const date of ['2026-10-10', '2026-10-18']) {
    await assert.rejects(calendar([{ ...entry, date }]).calendarRangePage(accountId, spaceId, week, 'UTC', null), { status: 502 }, date);
  }
  const reminder = { ...entry, kind: 'reminder', status: 'scheduled', date: '2026-10-11', scheduled_at: '2026-10-10T18:45:00Z', timezone: 'Asia/Kolkata' };
  assert.equal((await calendar([reminder]).calendarRangePage(accountId, spaceId, { start: '2026-10-11', end: '2026-10-11' }, 'Asia/Kolkata', null)).data.length, 1);
  await assert.rejects(calendar([reminder]).calendarRangePage(accountId, spaceId, { start: '2026-10-11', end: '2026-10-11' }, 'UTC', null), { status: 502 });
  // The month read asks for the whole month, exactly as before.
  const monthCalls = [];
  await calendar([], monthCalls).calendarPage(accountId, spaceId, '2026-10', 'UTC', null);
  assert.deepEqual(query(monthCalls[0]), { space_id: spaceId, start_date: '2026-10-01', end_date: '2026-10-31', timezone: 'UTC', limit: '50' });
  // More than 31 days, a reversed range or an impossible date is refused before anything is sent.
  const none = [];
  for (const value of [{ start: '2026-10-01', end: '2026-11-01' }, { start: '2026-10-17', end: '2026-10-11' }, { start: '2026-02-30', end: '2026-03-01' }, { start: '1899-12-31', end: '1900-01-06' }]) {
    await assert.rejects(calendar([], none).calendarRangePage(accountId, spaceId, value, 'UTC', null), { status: 422 }, JSON.stringify(value));
  }
  assert.deepEqual(none, []);
});

test('Planned repeats count as reminders when a source is shown or hidden', () => {
  const client = calendar();
  assert.deepEqual([...client.calendarSources], ['task', 'reminder', 'event']);
  for (const [kind, source] of [['task', 'task'], ['reminder', 'reminder'], ['planned', 'reminder'], ['event', 'event']]) {
    assert.equal(client.calendarSource({ kind }), source, kind);
  }
});
