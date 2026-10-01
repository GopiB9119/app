import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const seriesId = '6f1c2f0e-8f53-4d55-9a53-1d2b8b7c9e01';
const notificationId = '02a29260-911c-4b20-a991-078b5f0d3248';
const taskTitle = 'Synthetic morning checklist';
const now = '2026-10-01T12:00:00Z';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const timeout = 180_000;
const dailyRule = {
  frequency: 'daily', repeat_every: 1, weekdays: [], local_time: '08:00', timezone: 'UTC',
  start_date: '2026-11-01', end_date: '2026-11-03', clock_change_policy: 'shift_forward',
};
const choices = [[10, '10 minutes'], [60, '1 hour'], [180, '3 hours'], [1440, '1 day']];
let browser;
let javascript;
let css;

before(async () => {
  const output = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { ReminderScreen } from './src/features/scheduling/reminder-screen';
        import { NotificationScreen } from './src/features/notifications/notification-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderSeriesFixture = (inbox, taskId) => root.render(
          <Providers>{inbox ? <NotificationScreen /> : <ReminderScreen taskId={taskId} />}</Providers>);`,
      resolveDir: web, sourcefile: 'offline-series.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local', 'offline-series.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-series-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = output.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath), 'The configured offline Chromium must exist.');
  browser = await chromium.launch({ executablePath, headless: true });
  mkdirSync(path.join(root, '.local', 'screenshots'), { recursive: true });
}, { timeout });
after(async () => { await browser?.close(); });

async function fixture(t, options = {}, contextOptions = {}) {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', ...contextOptions });
  t.after(() => context.close());
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  await page.setContent('<html><head><title>Offline repeating reminders</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, taskId, spaceId, seriesId, notificationId, taskTitle, now, dailyRule, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true,
    });
    const reminderId = 'ad88a51c-b2fc-4a0f-a83a-27fcd3ea447d';
    const title = options.title ?? taskTitle;
    const recipient = { account_id: accountId, display_name: options.recipient ?? 'Alex Morgan' };
    const task = {
      id: taskId, space_id: spaceId, title, description: 'Synthetic offline task', due_date: null,
      status: 'open', assignee: null, assignee_unavailable: false, created_by_account_id: accountId,
      completed_by_account_id: null, completed_at: null, created_at: now, updated_at: now, version: '1',
      permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] },
    };
    const occurrence = (rule, date, scheduled = false) => {
      const gap = options.clockChange && date === '2027-03-14';
      const displayTime = gap ? '03:30' : rule.local_time;
      const offset = rule.timezone === 'UTC' ? 0 : date < '2027-03-14' ? -300 : -240;
      return {
        reminder_id: scheduled ? reminderId : null, local_date: date, display_time: displayTime,
        scheduled_at: new Date(Date.parse(`${date}T${displayTime}:00Z`) - offset * 60_000).toISOString(),
        utc_offset_minutes: offset, adjustment: gap ? 'shifted_forward' : 'none',
      };
    };
    const previewOf = (rule, index) => {
      const occurrences = [];
      const first = Date.parse(`${rule.start_date}T12:00:00Z`);
      const last = Date.parse(`${rule.end_date}T12:00:00Z`);
      const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const startWeekday = (new Date(first).getUTCDay() + 6) % 7;
      for (let value = first, day = 0; value <= last; value += 86_400_000, day += 1) {
        const date = new Date(value).toISOString().slice(0, 10);
        const included = rule.frequency === 'daily'
          ? day % rule.repeat_every === 0
          : Math.floor((day + startWeekday) / 7) % rule.repeat_every === 0 && rule.weekdays.includes(weekdays[new Date(value).getUTCDay()]);
        if (included && !(options.clockChange && date === '2027-03-14' && rule.clock_change_policy === 'skip')) {
          occurrences.push(occurrence(rule, date));
        }
      }
      const clockChanges = options.clockChange
        ? [{ local_date: '2027-03-14', change: rule.clock_change_policy === 'skip' ? 'skipped' : 'shifted_forward' }] : [];
      return {
        task_id: taskId, task_title: title, task_version: '1', recipient, ...rule,
        occurrences: occurrences.slice(0, 10), occurrence_count: occurrences.length, clock_changes: clockChanges,
        channel: 'in_app', preview_token: `synthetic-series-preview-${index}-${rule.clock_change_policy}-${'p'.repeat(32)}`,
        expires_at: '2026-10-01T12:05:00Z',
      };
    };
    const seriesOf = (rule, id, itemTitle = title, status = 'active') => ({
      id, task_id: taskId, space_id: spaceId, task_title: itemTitle, task_version: '1', source_changed: false,
      ...rule, status, reason: status === 'paused' ? 'by_person' : null,
      next_occurrence: status === 'active' ? occurrence(rule, rule.start_date, true) : null,
      created_at: now, updated_at: now, version: '1', etag: '"series-1"', channel: 'in_app',
    });
    const notification = {
      id: notificationId, reminder_id: reminderId, task_id: taskId, space_id: spaceId, task_title: title,
      series_id: seriesId, scheduled_at: '2026-10-01T11:59:00Z', created_at: now,
      read_at: null, acknowledged_at: null, snooze_count: options.snoozeCount ?? 0, snoozed_until: null,
      can_snooze: options.canSnooze ?? true, snooze_before: options.snoozeBefore ?? null,
    };
    const state = window.seriesFixture = {
      calls: [], unexpected: [], streams: [], previews: {}, receipts: {}, consumedTokens: {},
      series: options.seedSeries ? [seriesOf(dailyRule, seriesId, options.seedTitle ?? title, options.seriesStatus ?? 'active')] : [],
      notifications: options.inbox ? [notification] : [], previewCount: 0, latestPreview: null,
      saveWrites: 0, commandWrites: 0, snoozeWrites: 0,
      loseSave: options.loseSave, loseCommand: options.loseCommand, loseSnooze: options.loseSnooze,
      rejectSave: options.rejectSave, rejectCommand: options.rejectCommand, rejectSnooze: options.rejectSnooze,
      holdCommand: !!options.holdCommand, releaseCommand: null,
    };
    const reply = (data, extra = {}, headers = {}, status = 200) =>
      new Response(JSON.stringify({ data, request_id: 'offline-series', ...extra }), { status, headers });
    const failed = (status, code, message) =>
      new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-series' }), { status });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const lostAnswer = (field, data, status = 200) => {
      const loss = state[field];
      state[field] = null;
      if (loss === 'network') throw new TypeError('Synthetic answer lost after the write');
      if (loss === '503') return failed(503, 'SERVICE_UNAVAILABLE', 'Synthetic answer unavailable. The change is not confirmed.');
      return reply(data, {}, {}, status);
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const route = url.pathname;
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route, query: url.search, method, body, rawBody: config.body ?? null, headers });
      if (route === '/api/live' && method === 'GET') {
        const stream = { controller: null, closed: false };
        const response = new Response(new ReadableStream({
          start(controller) {
            stream.controller = controller;
            controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"heartbeat_seconds":15,"max_seconds":1800}\n\n'));
          },
          cancel() { stream.closed = true; },
        }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
        config.signal?.addEventListener('abort', () => {
          if (!stream.closed) {
            stream.closed = true;
            stream.controller.error(new DOMException('Aborted', 'AbortError'));
          }
        }, { once: true });
        state.streams.push(stream);
        return response;
      }
      if (route === '/api/me' && method === 'GET') return reply({
        id: accountId, email: 'alex@example.test', display_name: recipient.display_name, timezone: 'UTC', email_verified: true, version: 1,
      });
      if (route === '/api/timezones' && method === 'GET') return reply(['UTC', 'America/New_York']);
      if (route === `/api/tasks/${taskId}` && method === 'GET') return reply(task, {}, { ETag: `"${'a'.repeat(64)}"` });
      if (['/api/reminders', '/api/reminder-requests', '/api/reminder-backups'].includes(route) && method === 'GET') return paged([]);
      if (route === '/api/reminder-backups/contacts' && method === 'GET') return reply([]);
      if (route === '/api/me/notification-preferences' && method === 'GET') return reply(
        { in_app_reminders_enabled: true, version: '1' }, {}, { ETag: '"preferences-1"' },
      );
      if (route === '/api/me/alerts' && method === 'GET') return reply({
        items: [], quiet: { active: false, until: null }, next_check_at: '2026-10-01T12:01:00Z', generated_at: now,
      });
      if (route === '/api/me/quiet-hours' && method === 'GET') return reply(
        { start: null, end: null, timezone: 'UTC', quiet: { active: false, until: null }, version: '0' },
        {}, { ETag: `"alert-settings-${accountId}-0"` },
      );
      if (route === '/api/reminder-series' && method === 'GET') return paged(state.series);
      if (route === '/api/notifications' && method === 'GET') return paged(
        state.notifications, { unread_count: state.notifications.filter(item => item.read_at === null).length },
      );
      if (route === '/api/reminder-series/preview' && method === 'POST') {
        const { task_id, ...rule } = body;
        if (task_id !== taskId) return failed(422, 'INVALID_TASK', 'The synthetic preview named the wrong task.');
        const preview = previewOf(rule, ++state.previewCount);
        state.previews[preview.preview_token] = preview;
        state.latestPreview = structuredClone(preview);
        return reply(preview);
      }
      const command = route.match(/^\/api\/reminder-series\/([^/]+)\/(pause|resume|skip|cancel)$/);
      const isSave = route === '/api/reminder-series' && method === 'POST';
      const isSnooze = route === `/api/notifications/${notificationId}/snooze` && method === 'POST';
      if (isSave || (command && method === 'POST') || isSnooze) {
        const key = headers['idempotency-key'];
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key ?? '')) {
          return failed(422, 'INVALID_REQUEST', 'A single Idempotency-Key is required.');
        }
        const receiptKey = `${route}|${key}`;
        const receipt = state.receipts[receiptKey];
        // Replay precedes the version check, just as a committed request with a lost answer must.
        if (receipt) {
          if (receipt.rawBody !== config.body || receipt.etag !== headers['if-match']) {
            return failed(409, 'IDEMPOTENCY_CONFLICT', 'The original request changed.');
          }
          return reply(receipt.data, {}, {}, receipt.status);
        }
        const remember = (data, status = 200) => {
          state.receipts[receiptKey] = { data: structuredClone(data), status, rawBody: config.body, etag: headers['if-match'] };
        };
        if (isSave) {
          if (state.rejectSave) return failed(state.rejectSave, 'SERIES_REFUSED', 'Synthetic series save was refused.');
          const preview = state.previews[body.preview_token];
          if (!preview || state.consumedTokens[body.preview_token]) return failed(409, 'PREVIEW_USED', 'This preview was already used.');
          const rule = Object.fromEntries(Object.keys(dailyRule).map(name => [name, preview[name]]));
          const saved = seriesOf(rule, crypto.randomUUID());
          state.series.push(saved);
          state.saveWrites += 1;
          state.consumedTokens[body.preview_token] = key;
          remember(saved, 201);
          return lostAnswer('loseSave', saved, 201);
        }
        if (command) {
          if (state.rejectCommand) return failed(state.rejectCommand, 'SERIES_CHANGED', 'Synthetic series change was refused. Review the current list.');
          const item = state.series.find(value => value.id === command[1]);
          if (!item) return failed(404, 'NOT_FOUND', 'The synthetic series is unavailable.');
          if (headers['if-match'] !== item.etag) return failed(412, 'SERIES_CHANGED', 'The synthetic series version changed.');
          const operation = command[2];
          const status = options.commandEnded && ['resume', 'skip'].includes(operation)
            ? 'ended' : { pause: 'paused', resume: 'active', skip: 'active', cancel: 'cancelled' }[operation];
          Object.assign(item, {
            status, reason: status === 'paused' ? 'by_person' : null, source_changed: false,
            next_occurrence: status === 'active' ? occurrence(item, '2026-11-02', true) : null,
            version: String(Number(item.version) + 1), etag: `"series-${Number(item.version) + 1}"`,
          });
          state.commandWrites += 1;
          remember(item);
          if (state.holdCommand) {
            state.holdCommand = false;
            await new Promise(resolve => { state.releaseCommand = () => { state.releaseCommand = null; resolve(); }; });
          }
          return lostAnswer('loseCommand', item);
        }
        if (state.rejectSnooze) return failed(state.rejectSnooze, 'SNOOZE_REFUSED', 'Synthetic snooze was refused. Review the inbox.');
        if (!notification.can_snooze) return failed(409, 'SNOOZE_LIMIT', 'This synthetic reminder cannot be snoozed again.');
        const until = Math.ceil((Date.now() + body.minutes * 60_000) / 60_000) * 60_000;
        if (notification.snooze_before && until >= Date.parse(notification.snooze_before)) {
          return failed(422, 'SNOOZE_TOO_LATE', 'The snooze reaches the next repeating reminder.');
        }
        Object.assign(notification, { read_at: now, can_snooze: false, snoozed_until: new Date(until).toISOString() });
        state.snoozeWrites += 1;
        remember(notification);
        return lostAnswer('loseSnooze', notification);
      }
      state.unexpected.push(`${method} ${route}${url.search}`);
      throw new Error(`No real network is allowed: no offline fixture for ${method} ${route}${url.search}`);
    };
  }, { accountId, taskId, spaceId, seriesId, notificationId, taskTitle, now, dailyRule, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ inbox, taskId }) => window.renderSeriesFixture(inbox, taskId), { inbox: !!options.inbox, taskId });
  await page.getByRole('heading', { name: options.inbox ? 'Inbox' : 'Reminders', exact: true }).waitFor();
  if (options.inbox) await inboxRow(page, options.title ?? taskTitle).waitFor();
  else {
    await page.getByRole('combobox', { name: 'Repeat', exact: true }).waitFor();
    await seriesSection(page).getByRole('button', { name: 'Refresh repeating reminders', exact: true }).waitFor();
    await page.waitForFunction(() => window.seriesFixture.calls.some(call => call.route === '/api/reminder-series' && call.method === 'GET'));
  }
  return { page, outbound, errors };
}

const seriesSection = page => page.getByRole('region', { name: 'Repeating reminders', exact: true });
const reviewSection = page => page.getByRole('region', { name: 'Review repeating reminder', exact: true });
const seriesRow = (page, title = taskTitle) => seriesSection(page).getByRole('listitem')
  .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const inboxRow = (page, title = taskTitle) => page.getByRole('main').getByRole('listitem')
  .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const seriesForm = page => page.locator('form').filter({ has: page.locator('input[name="series_local_time"]') });

async function calls(page, route, method = 'POST') {
  return page.evaluate(({ route, method }) => window.seriesFixture.calls.filter(call =>
    call.method === method && (route === undefined || call.route === route)), { route, method });
}

function assertRequest(call, route, body, etag) {
  assert.match(call.headers['idempotency-key'], uuid);
  assert.deepEqual(call, {
    route, query: '', method: 'POST', body, rawBody: JSON.stringify(body),
    headers: {
      'content-type': 'application/json', 'x-account-id': accountId,
      'idempotency-key': call.headers['idempotency-key'], ...(etag === undefined ? {} : { 'if-match': etag }),
    },
  });
}

async function assertOffline(result) {
  assert.deepEqual(result.outbound, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(await result.page.evaluate(() => window.seriesFixture.unexpected), []);
}

async function fillSeries(page, rule = dailyRule) {
  await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption(rule.frequency);
  const form = seriesForm(page);
  await form.getByLabel('Time', { exact: true }).fill(rule.local_time);
  await form.getByLabel(rule.frequency === 'weekly' ? 'Every (weeks)' : 'Every (days)', { exact: true }).fill(String(rule.repeat_every));
  await form.getByLabel('First day', { exact: true }).fill(rule.start_date);
  await form.getByLabel('Last day', { exact: true }).fill(rule.end_date);
  await form.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption(rule.timezone);
  for (const day of rule.weekdays) await form.getByRole('checkbox', { name: day[0].toUpperCase() + day.slice(1), exact: true }).check();
  return form;
}

async function reviewSeries(page, rule = dailyRule) {
  const form = await fillSeries(page, rule);
  await form.getByRole('button', { name: 'Review repeating reminder', exact: true }).click();
  const review = reviewSection(page);
  await review.waitFor();
  return review;
}

async function assertSave(page, previewToken) {
  const sent = await calls(page, '/api/reminder-series');
  assert.equal(sent.length, 1);
  assertRequest(sent[0], '/api/reminder-series', { preview_token: previewToken });
  return sent[0];
}

test('series: daily review shows every approved fact and saving refreshes the list', { timeout }, async t => {
  const result = await fixture(t);
  const { page } = result;
  await seriesSection(page).getByText('No repeating reminders for this task.', { exact: true }).waitFor();
  const review = await reviewSeries(page);
  assert.deepEqual(await review.locator('dt, dd').allTextContents(), [
    'Task', taskTitle, 'Recipient', 'Alex Morgan (you)', 'Repeats', 'Every day at 08:00',
    'From', 'Sun, Nov 1, 2026', 'Until', 'Tue, Nov 3, 2026', 'Timezone', 'UTC',
    'Reminders', '3', 'Channel', 'In-app only',
  ]);
  assert.deepEqual(await review.locator('ol strong').allTextContents(), [
    'Sun, Nov 1, 2026, 08:00', 'Mon, Nov 2, 2026, 08:00', 'Tue, Nov 3, 2026, 08:00',
  ]);
  assert.deepEqual(await review.locator('ol small').allTextContents(), [
    'UTC+00:00 / 2026-11-01 08:00:00.000Z', 'UTC+00:00 / 2026-11-02 08:00:00.000Z', 'UTC+00:00 / 2026-11-03 08:00:00.000Z',
  ]);
  const previews = await calls(page, '/api/reminder-series/preview');
  assert.equal(previews.length, 1);
  assert.deepEqual(previews[0].body, { task_id: taskId, ...dailyRule });
  assert.deepEqual(previews[0].headers, { 'content-type': 'application/json', 'x-account-id': accountId });
  assert.equal((await calls(page, '/api/reminder-series')).length, 0);
  const readsBefore = (await calls(page, '/api/reminder-series', 'GET')).length;
  const token = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
  await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
  await assertSave(page, token);
  await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
  await seriesRow(page).getByText('Active', { exact: true }).waitFor();
  assert.equal(await review.count(), 0);
  const reads = await calls(page, '/api/reminder-series', 'GET');
  assert.ok(reads.length > readsBefore, 'Success must refetch the repeating-reminder list.');
  for (const read of reads) {
    assert.equal(read.query, `?limit=20&task_id=${taskId}`);
    assert.equal(read.headers['x-account-id'], accountId);
  }
  assert.equal(await page.evaluate(() => window.seriesFixture.saveWrites), 1);
  await assertOffline(result);
});

test('series: weekly review requires weekdays, enforces four weeks and saves the selected rule', { timeout }, async t => {
  const result = await fixture(t);
  const { page } = result;
  const rule = { ...dailyRule, frequency: 'weekly', repeat_every: 2, weekdays: [], start_date: '2026-11-02', end_date: '2026-11-20' };
  const form = await fillSeries(page, rule);
  const reviewButton = form.getByRole('button', { name: 'Review repeating reminder', exact: true });
  assert.equal(await reviewButton.isDisabled(), true, 'A weekly series with no weekday cannot be reviewed.');
  assert.equal((await calls(page, '/api/reminder-series/preview')).length, 0);
  for (const day of ['Fri', 'Mon', 'Wed']) await form.getByRole('checkbox', { name: day, exact: true }).check();
  const every = form.getByLabel('Every (weeks)', { exact: true });
  assert.equal(await every.getAttribute('max'), '4');
  await every.fill('5');
  assert.equal(await reviewButton.isDisabled(), true);
  assert.equal(await every.evaluate(element => element.validity.rangeOverflow), true);
  await every.fill('4');
  assert.equal(await reviewButton.isEnabled(), true);
  await every.fill('0');
  assert.equal(await reviewButton.isDisabled(), true);
  await every.fill('2');
  await reviewButton.click();
  const review = reviewSection(page);
  await review.getByText('Every 2 weeks on Mon, Wed, Fri at 08:00', { exact: true }).waitFor();
  assert.deepEqual(await review.locator('ol strong').allTextContents(), [
    'Mon, Nov 2, 2026, 08:00', 'Wed, Nov 4, 2026, 08:00', 'Fri, Nov 6, 2026, 08:00',
    'Mon, Nov 16, 2026, 08:00', 'Wed, Nov 18, 2026, 08:00', 'Fri, Nov 20, 2026, 08:00',
  ]);
  assert.equal(await review.locator('dd').nth(6).innerText(), '6');
  const previews = await calls(page, '/api/reminder-series/preview');
  assert.equal(previews.length, 1, 'Invalid weekly values must not reach the API.');
  assert.deepEqual(previews[0].body, { task_id: taskId, ...rule, weekdays: ['mon', 'wed', 'fri'] });
  const token = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
  await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
  await assertSave(page, token);
  await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
  await seriesRow(page).getByText('Every 2 weeks on Mon, Wed, Fri at 08:00', { exact: true }).waitFor();
  await assertOffline(result);
});

test('series: daily form enforces 30 days and an inclusive 365-day end-date limit', { timeout }, async t => {
  const result = await fixture(t);
  const { page } = result;
  const form = await fillSeries(page);
  const every = form.getByLabel('Every (days)', { exact: true });
  const end = form.getByLabel('Last day', { exact: true });
  const review = form.getByRole('button', { name: 'Review repeating reminder', exact: true });
  assert.equal(await every.getAttribute('min'), '1');
  assert.equal(await every.getAttribute('max'), '30');
  for (const value of ['0', '31', '1.5']) {
    await every.fill(value);
    assert.equal(await review.isDisabled(), true, `Every ${value} days must be invalid.`);
  }
  await every.fill('30');
  assert.equal(await review.isEnabled(), true);
  assert.equal(await end.getAttribute('min'), '2026-11-01');
  assert.equal(await end.getAttribute('max'), '2027-11-01');
  for (const value of ['2026-10-31', '2027-11-02']) {
    await end.fill(value);
    assert.equal(await review.isDisabled(), true, `The end date ${value} must be invalid.`);
  }
  await end.fill('2027-11-01');
  assert.equal(await review.isEnabled(), true, 'Exactly 365 days after the first day is allowed.');
  await form.getByLabel('First day', { exact: true }).fill('2026-11-02');
  assert.equal(await end.getAttribute('max'), '2027-11-02', 'The bound must follow the first day.');
  await end.fill('2027-11-02');
  await review.click();
  await reviewSection(page).getByText('Every 30 days at 08:00', { exact: true }).waitFor();
  const previews = await calls(page, '/api/reminder-series/preview');
  assert.equal(previews.length, 1, 'Only the valid boundary value may be sent.');
  assert.deepEqual(previews[0].body, { task_id: taskId, ...dailyRule, repeat_every: 30, start_date: '2026-11-02', end_date: '2027-11-02' });
  assert.equal((await calls(page, '/api/reminder-series')).length, 0);
  await assertOffline(result);
});

test('series: skipping a clock-change day re-previews and saves only the newer token', { timeout }, async t => {
  const result = await fixture(t, { clockChange: true });
  const { page } = result;
  const rule = { ...dailyRule, local_time: '02:30', timezone: 'America/New_York', start_date: '2027-03-13', end_date: '2027-03-15' };
  const review = await reviewSeries(page, rule);
  const policy = review.getByRole('group', { name: 'When the clock skips 02:30', exact: true });
  await policy.waitFor();
  assert.equal(await policy.getByRole('radio', { name: /^Remind after the jump/ }).isChecked(), true);
  await review.getByText('Sun, Mar 14, 2027, 03:30', { exact: true }).waitFor();
  const originalToken = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
  await policy.getByRole('radio', { name: /^Skip that day/ }).click();
  await page.waitForFunction(() => window.seriesFixture.latestPreview.clock_change_policy === 'skip');
  await policy.getByRole('radio', { name: /^Skip that day/, checked: true }).waitFor();
  assert.equal(await review.locator('dd').nth(6).innerText(), '2');
  assert.deepEqual(await review.locator('ol strong').allTextContents(), ['Sat, Mar 13, 2027, 02:30', 'Mon, Mar 15, 2027, 02:30']);
  await review.getByText('Clock changes: Sun, Mar 14, 2027 no reminder.', { exact: true }).waitFor();
  const previews = await calls(page, '/api/reminder-series/preview');
  assert.equal(previews.length, 2);
  assert.deepEqual(previews.map(call => call.body), [
    { task_id: taskId, ...rule }, { task_id: taskId, ...rule, clock_change_policy: 'skip' },
  ]);
  const token = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
  assert.notEqual(token, originalToken);
  await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
  await assertSave(page, token);
  await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.seriesFixture.series[0].clock_change_policy), 'skip');
  await assertOffline(result);
});

for (const loss of ['network', '503']) {
  test(`series: a lost ${loss} save retries the same key and preview without claiming success`, { timeout }, async t => {
    const result = await fixture(t, { loseSave: loss });
    const { page } = result;
    const review = await reviewSeries(page);
    const token = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
    const readsBefore = (await calls(page, '/api/reminder-series', 'GET')).length;
    await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
    await review.getByRole('button', { name: 'Retry original save', exact: true }).waitFor();
    assert.match(await review.getByRole('alert').innerText(), /not confirmed/);
    assert.equal(await page.locator('.message.success').count(), 0);
    assert.equal(await seriesRow(page).count(), 0, 'A committed but unanswered save is not a confirmed row.');
    assert.equal((await calls(page, '/api/reminder-series', 'GET')).length, readsBefore);
    assert.equal(await review.getByRole('button', { name: 'Change', exact: true }).isDisabled(), true);
    const original = await assertSave(page, token);
    assert.equal(await page.evaluate(() => window.seriesFixture.saveWrites), 1);
    await review.getByRole('button', { name: 'Retry original save', exact: true }).click();
    const sent = await calls(page, '/api/reminder-series');
    assert.equal(sent.length, 2);
    sent.forEach(call => assertRequest(call, '/api/reminder-series', { preview_token: token }));
    assert.equal(sent[1].headers['idempotency-key'], original.headers['idempotency-key'], 'Retry must reuse the original save key.');
    assert.equal(sent[1].rawBody, original.rawBody);
    await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
    await seriesRow(page).getByText('Active', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.seriesFixture.saveWrites), 1);
    assert.equal(await seriesRow(page).count(), 1);
    assert.equal((await calls(page, '/api/reminder-series/preview')).length, 1);
    await assertOffline(result);
  });
}

for (const status of [409, 422]) {
  test(`series: a refused ${status} save closes review and a fresh save gets a new key`, { timeout }, async t => {
    const result = await fixture(t, { rejectSave: status });
    const { page } = result;
    const review = await reviewSeries(page);
    const firstToken = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
    await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
    await page.getByRole('alert').getByText('Synthetic series save was refused.', { exact: true }).waitFor();
    assert.equal(await review.count(), 0);
    assert.equal(await page.locator('.message.success').count(), 0);
    assert.equal(await seriesRow(page).count(), 0);
    assert.equal(await seriesForm(page).getByRole('button', { name: 'Review repeating reminder', exact: true }).isEnabled(), true,
      'A refused save must clear the stored intent so a fresh review is possible.');
    const original = await assertSave(page, firstToken);
    assert.equal(await page.evaluate(() => window.seriesFixture.saveWrites), 0);
    await page.evaluate(() => { window.seriesFixture.rejectSave = null; });
    await seriesForm(page).getByRole('button', { name: 'Review repeating reminder', exact: true }).click();
    await review.waitFor();
    const nextToken = await page.evaluate(() => window.seriesFixture.latestPreview.preview_token);
    assert.notEqual(nextToken, firstToken);
    await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
    const sent = await calls(page, '/api/reminder-series');
    assert.equal(sent.length, 2);
    assertRequest(sent[1], '/api/reminder-series', { preview_token: nextToken });
    assert.notEqual(sent[1].headers['idempotency-key'], original.headers['idempotency-key'], 'A refused intent must not supply the later save key.');
    await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
    await seriesRow(page).getByText('Active', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.seriesFixture.saveWrites), 1);
    await assertOffline(result);
  });
}

const operations = {
  pause: { open: 'Pause repeating reminder', title: 'Pause this repeating reminder?', confirm: 'Pause', notice: 'Repeating reminder paused.', status: 'Paused' },
  resume: { open: 'Resume repeating reminder', title: 'Resume this repeating reminder?', confirm: 'Resume', notice: 'Repeating reminder resumed.', status: 'Active' },
  skip: { open: 'Skip next reminder', title: 'Skip the next reminder?', confirm: 'Skip next reminder', notice: 'Next reminder skipped.', status: 'Active' },
  cancel: { open: 'Cancel repeating reminder', title: 'Cancel this repeating reminder?', confirm: 'Cancel repeating reminder', notice: 'Repeating reminder cancelled.', status: 'Cancelled' },
};

for (const [operation, labels] of Object.entries(operations)) {
  test(`series: ${operation} requires confirmation and sends the displayed If-Match`, { timeout }, async t => {
    const result = await fixture(t, { seedSeries: true, seriesStatus: operation === 'resume' ? 'paused' : 'active' });
    const { page } = result;
    const button = seriesRow(page).getByRole('button', { name: `${labels.open}: ${taskTitle}`, exact: true });
    const dialog = page.getByRole('dialog', { name: labels.title, exact: true });
    await button.click();
    assert.equal((await calls(page)).length, 0, 'Opening a confirmation must not send a command.');
    await dialog.waitFor();
    await dialog.getByText(taskTitle, { exact: true }).waitFor();
    await dialog.getByText('Every day at 08:00', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Keep as is', exact: true }).click();
    assert.equal(await dialog.count(), 0);
    assert.equal((await calls(page)).length, 0, 'Keep as is must send nothing.');
    await button.click();
    await dialog.getByRole('button', { name: labels.confirm, exact: true }).click();
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assertRequest(sent[0], `/api/reminder-series/${seriesId}/${operation}`, {}, '"series-1"');
    await page.getByText(labels.notice, { exact: true }).waitFor();
    await seriesRow(page).getByText(labels.status, { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(await page.evaluate(() => window.seriesFixture.commandWrites), 1);
    assert.ok((await calls(page, '/api/reminder-series', 'GET')).length >= 2);
    if (operation === 'skip') assert.equal(await seriesRow(page).locator('time').getAttribute('datetime'), '2026-11-02T08:00:00.000Z');
    await assertOffline(result);
  });
}

for (const operation of ['resume', 'skip']) {
  test(`series: ${operation} reports ended when no reminder times remain`, { timeout }, async t => {
    const result = await fixture(t, { seedSeries: true, seriesStatus: operation === 'resume' ? 'paused' : 'active', commandEnded: true });
    const { page } = result;
    const labels = operations[operation];
    await seriesRow(page).getByRole('button', { name: `${labels.open}: ${taskTitle}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: labels.confirm, exact: true }).click();
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assertRequest(sent[0], `/api/reminder-series/${seriesId}/${operation}`, {}, '"series-1"');
    await page.getByText('No reminder times remain, so the repeating reminder ended.', { exact: true }).waitFor();
    await seriesRow(page).getByText('Ended', { exact: true }).waitFor();
    assert.equal(await page.getByText(labels.notice, { exact: true }).count(), 0);
    assert.equal(await seriesRow(page).locator('time').count(), 0);
    await assertOffline(result);
  });
}

for (const loss of ['network', '503']) {
  test(`series: a lost ${loss} command cannot be dismissed and retries the original change`, { timeout }, async t => {
    const result = await fixture(t, { seedSeries: true, loseCommand: loss, holdCommand: true });
    const { page } = result;
    await seriesRow(page).getByRole('button', { name: `Pause repeating reminder: ${taskTitle}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => window.seriesFixture.releaseCommand !== null);
    assert.equal(await dialog.getByRole('button', { name: 'Keep as is', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close reminder dialog', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Pause', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true, 'An in-flight command must not be dismissed with Escape.');
    await page.evaluate(() => window.seriesFixture.releaseCommand());
    await dialog.getByRole('button', { name: 'Retry original change', exact: true }).waitFor();
    assert.match(await dialog.getByRole('alert').innerText(), /not confirmed/);
    assert.equal(await dialog.getByRole('button', { name: 'Keep as is', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close reminder dialog', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true, 'An unanswered command must stay available to retry.');
    assert.equal(await page.locator('.message.success').count(), 0);
    assert.equal(await seriesRow(page).getByText('Active', { exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.seriesFixture.commandWrites), 1);
    const original = (await calls(page))[0];
    assertRequest(original, `/api/reminder-series/${seriesId}/pause`, {}, '"series-1"');
    await dialog.getByRole('button', { name: 'Retry original change', exact: true }).click();
    const sent = await calls(page);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].headers['idempotency-key'], original.headers['idempotency-key'], 'Retry must reuse the original command key.');
    assert.deepEqual(sent[1], original);
    await page.getByText('Repeating reminder paused.', { exact: true }).waitFor();
    await seriesRow(page).getByText('Paused', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.seriesFixture.commandWrites), 1);
    await assertOffline(result);
  });
}

for (const status of [409, 412]) {
  test(`series: a refused ${status} command closes confirmation and refetches without success`, { timeout }, async t => {
    const result = await fixture(t, { seedSeries: true, rejectCommand: status });
    const { page } = result;
    const readsBefore = (await calls(page, '/api/reminder-series', 'GET')).length;
    await seriesRow(page).getByRole('button', { name: `Pause repeating reminder: ${taskTitle}`, exact: true }).click();
    await page.evaluate(() => Object.assign(window.seriesFixture.series[0], { source_changed: true, version: '2', etag: '"series-2"' }));
    await page.getByRole('dialog').getByRole('button', { name: 'Pause', exact: true }).click();
    await seriesSection(page).getByRole('alert').getByText('Synthetic series change was refused. Review the current list.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('.message.success').count(), 0);
    await seriesRow(page).getByText('Task changed since review. The next reminder will pause this series.', { exact: true }).waitFor();
    assert.ok((await calls(page, '/api/reminder-series', 'GET')).length > readsBefore);
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assertRequest(sent[0], `/api/reminder-series/${seriesId}/pause`, {}, '"series-1"');
    assert.equal(await page.evaluate(() => window.seriesFixture.commandWrites), 0);
    assert.equal(await seriesRow(page).getByText('Active', { exact: true }).count(), 1);
    await assertOffline(result);
  });
}

async function openSnooze(page, label) {
  await inboxRow(page).getByRole('button', { name: `Snooze reminder: ${taskTitle}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Snooze this reminder?', exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Snooze', exact: true }).isDisabled(), true, 'A snooze requires an explicit choice.');
  if (label) await dialog.getByRole('radio', { name: new RegExp(`^${label}\\b`) }).check();
  return dialog;
}

const instantText = (value, zone = 'UTC') => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(value));

for (const [minutes, label] of choices) {
  test(`snooze: ${label} is an explicit inbox choice and success names the confirmed time`, { timeout }, async t => {
    const snoozeCount = minutes === 10 ? 1 : minutes === 60 ? 2 : 0;
    const result = await fixture(t, { inbox: true, snoozeCount });
    const { page } = result;
    if (snoozeCount) await inboxRow(page).getByText(`Snoozed reminder ${snoozeCount} of 3`, { exact: true }).waitFor();
    const dialog = await openSnooze(page);
    assert.equal(await dialog.getByRole('radio').count(), 4);
    for (const [, choice] of choices) assert.equal(await dialog.getByRole('radio', { name: new RegExp(`^${choice}\\b`) }).isEnabled(), true);
    assert.equal((await calls(page)).length, 0);
    await dialog.getByRole('button', { name: 'Not now', exact: true }).click();
    assert.equal((await calls(page)).length, 0, 'Not now must not snooze the reminder.');
    const reopened = await openSnooze(page, label);
    await reopened.getByRole('button', { name: 'Snooze', exact: true }).click();
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assertRequest(sent[0], `/api/notifications/${notificationId}/snooze`, { minutes });
    const until = new Date(Date.parse(now) + minutes * 60_000).toISOString();
    await page.getByText(`Snoozed until ${instantText(until)}.`, { exact: true }).waitFor();
    await inboxRow(page).getByText(`Snoozed until ${instantText(until)}`, { exact: true }).waitFor();
    await inboxRow(page).getByText('Read', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await inboxRow(page).getByRole('button', { name: `Snooze reminder: ${taskTitle}`, exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.seriesFixture.snoozeWrites), 1);
    await assertOffline(result);
  });
}

test('snooze: can_snooze false hides the action including the third follow-up', { timeout }, async t => {
  for (const snoozeCount of [0, 3]) {
    const result = await fixture(t, { inbox: true, canSnooze: false, snoozeCount });
    const { page } = result;
    if (snoozeCount) await inboxRow(page).getByText('Snoozed reminder 3 of 3', { exact: true }).waitFor();
    assert.equal(await inboxRow(page).getByRole('button', { name: `Snooze reminder: ${taskTitle}`, exact: true }).count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await calls(page)).length, 0);
    await assertOffline(result);
  }
});

test('snooze: choices at or after snooze_before are disabled and only an earlier time is sent', { timeout }, async t => {
  const result = await fixture(t, { inbox: true, snoozeBefore: '2026-10-01T13:00:00Z' });
  const { page } = result;
  const dialog = await openSnooze(page);
  assert.equal(await dialog.getByRole('radio', { name: /^10 minutes\b/ }).isEnabled(), true);
  for (const label of ['1 hour', '3 hours', '1 day']) {
    assert.equal(await dialog.getByRole('radio', { name: new RegExp(`^${label}\\b`) }).isDisabled(), true, `${label} reaches or passes the next occurrence.`);
  }
  assert.equal(await dialog.getByText('After this reminder repeats', { exact: true }).count(), 3);
  assert.equal((await calls(page)).length, 0);
  await dialog.getByRole('radio', { name: /^10 minutes\b/ }).check();
  await dialog.getByRole('button', { name: 'Snooze', exact: true }).click();
  const sent = await calls(page);
  assert.equal(sent.length, 1);
  assertRequest(sent[0], `/api/notifications/${notificationId}/snooze`, { minutes: 10 });
  await page.getByText(`Snoozed until ${instantText('2026-10-01T12:10:00Z')}.`, { exact: true }).waitFor();
  await assertOffline(result);
});

for (const loss of ['network', '503']) {
  test(`snooze: a lost ${loss} answer retries the same key and minutes without claiming success`, { timeout }, async t => {
    const result = await fixture(t, { inbox: true, loseSnooze: loss });
    const { page } = result;
    const dialog = await openSnooze(page, '1 hour');
    await dialog.getByRole('button', { name: 'Snooze', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry original snooze', exact: true }).waitFor();
    assert.match(await dialog.getByRole('alert').innerText(), /not confirmed/);
    assert.equal(await dialog.getByRole('button', { name: 'Not now', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close reminder dialog', exact: true }).isDisabled(), true);
    for (const radio of await dialog.getByRole('radio').all()) assert.equal(await radio.isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator('.message.success').count(), 0);
    assert.equal(await inboxRow(page).getByText(/^Snoozed until /).count(), 0, 'The unanswered snooze must not be shown as confirmed.');
    assert.equal(await inboxRow(page).getByText('Unread', { exact: true }).count(), 1);
    const original = (await calls(page))[0];
    assertRequest(original, `/api/notifications/${notificationId}/snooze`, { minutes: 60 });
    assert.equal(await page.evaluate(() => window.seriesFixture.snoozeWrites), 1);
    await dialog.getByRole('button', { name: 'Retry original snooze', exact: true }).click();
    const sent = await calls(page);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].headers['idempotency-key'], original.headers['idempotency-key'], 'Retry must reuse the original snooze key.');
    assert.deepEqual(sent[1], original, 'Retry must retain the original minutes and notification.');
    await page.getByText(`Snoozed until ${instantText('2026-10-01T13:00:00Z')}.`, { exact: true }).waitFor();
    await inboxRow(page).getByText(`Snoozed until ${instantText('2026-10-01T13:00:00Z')}`, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.seriesFixture.snoozeWrites), 1);
    await assertOffline(result);
  });
}

for (const status of [409, 422]) {
  test(`snooze: a refused ${status} answer closes the dialog and refetches without success`, { timeout }, async t => {
    const result = await fixture(t, { inbox: true, rejectSnooze: status });
    const { page } = result;
    const readsBefore = (await calls(page, '/api/notifications', 'GET')).length;
    const dialog = await openSnooze(page, '10 minutes');
    await page.evaluate(() => { window.seriesFixture.notifications[0].can_snooze = false; });
    await dialog.getByRole('button', { name: 'Snooze', exact: true }).click();
    await page.getByRole('alert').getByText('Synthetic snooze was refused. Review the inbox.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'A refused snooze must close the stale review.');
    assert.equal(await page.locator('.message.success').count(), 0);
    await inboxRow(page).getByRole('button', { name: `Snooze reminder: ${taskTitle}`, exact: true }).waitFor({ state: 'detached' });
    assert.ok((await calls(page, '/api/notifications', 'GET')).length > readsBefore, 'A refused snooze must refetch the inbox.');
    const sent = await calls(page);
    assert.equal(sent.length, 1);
    assertRequest(sent[0], `/api/notifications/${notificationId}/snooze`, { minutes: 10 });
    assert.equal(await page.evaluate(() => window.seriesFixture.snoozeWrites), 0);
    assert.equal(await inboxRow(page).getByText(/^Snoozed until /).count(), 0);
    assert.equal(await inboxRow(page).getByText('Unread', { exact: true }).count(), 1);
    await assertOffline(result);
  });
}

async function assertFits(page, label, surfaces) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    main: document.querySelector('main').scrollWidth, mainWidth: document.querySelector('main').clientWidth,
  }));
  assert.equal(dimensions.viewport, 320);
  assert.ok(dimensions.document <= 320, `${label}: document overflows 320 px: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.main <= dimensions.mainWidth, `${label}: main overflows: ${JSON.stringify(dimensions)}`);
  for (const surface of surfaces) {
    const bounds = await surface.evaluate(element => ({
      scroll: element.scrollWidth, width: element.clientWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    }));
    assert.ok(bounds.scroll <= bounds.width && bounds.left >= 0 && bounds.right <= 320,
      `${label}: content must fit rather than be clipped: ${JSON.stringify(bounds)}`);
  }
}

test('series: form, review, list and confirmation fit 320 px with actual 200% text', { timeout }, async t => {
  const title = `Synthetic task ${'W'.repeat(165)}`;
  const seedTitle = `Existing synthetic task ${'M'.repeat(160)}`;
  const result = await fixture(t, { seedSeries: true, title, seedTitle, recipient: `Alex ${'M'.repeat(65)}` },
    { viewport: { width: 320, height: 844 } });
  const { page } = result;
  const form = await fillSeries(page);
  await seriesRow(page, seedTitle).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const textSize = locator => locator.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const normal = { input: await textSize(form.getByLabel('Time', { exact: true })), title: await textSize(seriesRow(page, seedTitle).locator('h3')) };
  // Root-only scaling misses this screen's px-sized text; double those declarations too, without zooming the viewport.
  await page.addStyleTag({ content: css.replace(/\bfont-size:\s*(\d+(?:\.\d+)?)px\b/g, (_, size) => `font-size: ${Number(size) * 2}px`) });
  assert.equal(await textSize(form.getByLabel('Time', { exact: true })), normal.input * 2);
  assert.equal(await textSize(seriesRow(page, seedTitle).locator('h3')), normal.title * 2);
  await assertFits(page, 'Series form and list at 200% text', [form, seriesSection(page), seriesRow(page, seedTitle)]);
  await page.screenshot({ path: path.join(root, '.local', 'screenshots', 't92-series-form-320-200.png'), fullPage: true });
  await form.getByRole('button', { name: 'Review repeating reminder', exact: true }).click();
  const review = reviewSection(page);
  await review.waitFor();
  assert.equal(await textSize(review.locator('dd').first()), 28, 'Review facts must also be twice their normal 14 px.');
  await assertFits(page, 'Series review at 200% text', [review, seriesSection(page)]);
  await page.screenshot({ path: path.join(root, '.local', 'screenshots', 't92-series-review-320-200.png'), fullPage: true });
  const preview = await page.evaluate(() => window.seriesFixture.latestPreview);
  assert.deepEqual((await calls(page, '/api/reminder-series/preview'))[0].body, { task_id: taskId, ...dailyRule });
  await review.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
  await assertSave(page, preview.preview_token);
  await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
  await seriesRow(page, title).waitFor();
  await assertFits(page, 'Series list after save at 200% text', [seriesSection(page), seriesRow(page, title)]);
  await page.screenshot({ path: path.join(root, '.local', 'screenshots', 't92-series-list-320-200.png'), fullPage: true });
  await seriesRow(page, seedTitle).getByRole('button', { name: `Pause repeating reminder: ${seedTitle}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pause this repeating reminder?', exact: true });
  await dialog.waitFor();
  await assertFits(page, 'Series confirmation at 200% text', [dialog, ...await dialog.getByRole('button').all()]);
  await page.screenshot({ path: path.join(root, '.local', 'screenshots', 't92-series-confirmation-320-200.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Keep as is', exact: true }).click();
  assert.equal((await calls(page)).length, 2, 'Layout checks may preview and save, but must not confirm a list command.');
  await assertOffline(result);
});
