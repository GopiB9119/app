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
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { ReminderScreen } from './src/features/scheduling/reminder-screen';
        import { NotificationScreen } from './src/features/notifications/notification-screen';
        import './src/app/globals.css';
        function RefreshControl() { const client = useQueryClient(); useEffect(() => {
          window.refreshReminderFixture = () => client.invalidateQueries();
        }, [client]); return null; }
        const root = createRoot(document.getElementById('root'));
        window.renderReminderFixture = (screen, taskId) => root.render(<Providers><RefreshControl />{
          screen === 'inbox' ? <NotificationScreen /> : <ReminderScreen taskId={taskId} />
        }</Providers>);`,
      resolveDir: web, sourcefile: 'offline-reminder-controls.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-reminder-controls.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-reminder-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
  mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline reminder controls</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, taskId, spaceId, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const task = {
      id: taskId, space_id: spaceId, title: options.title ?? 'Buy groceries', description: '',
      status: 'open', due_date: null, assignee: null, assignee_unavailable: false,
      created_by_account_id: accountId, completed_at: null, completed_by_account_id: null,
      created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', version: '1',
      permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] },
    };
    const state = window.reminderFixture = {
      calls: [], denied: false, task, reminders: [], notifications: [],
      preferences: { in_app_reminders_enabled: true, version: '1' },
      overlap: false, gap: false, failSave: !!options.failSave, failAcknowledgment: !!options.failAcknowledgment,
      cancelSuppressed: !!options.cancelSuppressed,
    };
    const previews = new Map();
    const saves = new Map();
    const reply = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-reminder', ...extra }), { status: 200, headers });
    const list = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-reminder' }), { status });
    function reminder(option = {}, input = {}) {
      return {
        id: crypto.randomUUID(), task_id: taskId, space_id: spaceId, task_title: task.title,
        local_time: input.local_time ?? '2026-09-19T15:31:00', timezone: input.timezone ?? 'Asia/Kolkata',
        scheduled_at: option.scheduled_at ?? '2026-09-19T10:01:00Z',
        expires_at: option.dispatch_expires_at ?? '2026-09-20T10:01:00Z',
        status: 'scheduled', reason: null, source_changed: false, acknowledged_at: null,
        version: '1', channel: 'in_app',
      };
    }
    if (options.seed || options.screen === 'inbox') {
      const saved = reminder(); state.reminders.push(saved);
      if (options.screen === 'inbox') {
        saved.status = 'available';
        state.notifications.push({ id: crypto.randomUUID(), reminder_id: saved.id, task_id: taskId, space_id: spaceId,
          task_title: task.title, scheduled_at: saved.scheduled_at, created_at: '2026-09-19T10:02:00Z', read_at: null, acknowledged_at: null });
      }
    }
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'Asia/Kolkata', email_verified: true, version: 1 });
      if (url.pathname === '/api/timezones') return list(['UTC', 'Asia/Kolkata', 'America/New_York']);
      if (url.pathname === '/api/me/notification-preferences') {
        const etag = `"notification-preferences-${accountId}-${state.preferences.version}"`;
        if (method === 'PATCH') {
          if (headers['if-match'] !== etag) return failed(412, 'PRECONDITION_FAILED', 'Preferences changed. Reload and review.');
          state.preferences = { ...state.preferences, in_app_reminders_enabled: body.in_app_reminders_enabled, version: String(Number(state.preferences.version) + 1) };
        }
        return reply(state.preferences, {}, { ETag: `"notification-preferences-${accountId}-${state.preferences.version}"` });
      }
      if (state.denied) return failed(404, 'NOT_FOUND', 'Task access is unavailable.');
      if (url.pathname === '/api/reminder-requests' && method === 'GET') return list([]);
      if (url.pathname === '/api/reminder-series' && method === 'GET') return list([]);
      if (url.pathname === '/api/reminder-backups' && method === 'GET') return list([]);
      if (url.pathname === '/api/reminder-backups/contacts') return reply([]);
      if (url.pathname === '/api/me/alerts') return reply({ items: [], quiet: { active: false, until: null }, next_check_at: '2026-09-20T10:00:00Z', generated_at: '2026-09-19T10:00:00Z' });
      if (url.pathname === '/api/me/quiet-hours') return reply({ start: null, end: null, timezone: 'Asia/Kolkata', quiet: { active: false, until: null }, version: '0' }, {}, { ETag: `"alert-settings-${accountId}-0"` });
      if (url.pathname === `/api/tasks/${taskId}`) return reply(task, {}, { ETag: `"${'a'.repeat(64)}"` });
      if (url.pathname === '/api/reminders/preview') {
        if (state.gap) return failed(422, 'LOCAL_TIME_NONEXISTENT', 'This local time does not exist. Select another time.');
        const input = { ...body, local_time: body.local_time.length === 16 ? `${body.local_time}:00` : body.local_time };
        const choices = state.overlap ? [
          { scheduled_at: '2026-11-01T05:30:00Z', dispatch_expires_at: '2026-11-02T05:30:00Z', utc_offset_minutes: -240, preview_token: 'a'.repeat(64) },
          { scheduled_at: '2026-11-01T06:30:00Z', dispatch_expires_at: '2026-11-02T06:30:00Z', utc_offset_minutes: -300, preview_token: 'b'.repeat(64) },
        ] : [{ scheduled_at: '2026-09-19T10:01:00Z', dispatch_expires_at: '2026-09-20T10:01:00Z', utc_offset_minutes: 330, preview_token: 'c'.repeat(64) }];
        for (const option of choices) previews.set(option.preview_token, { option, input });
        return reply({ task_id: taskId, task_title: task.title, task_version: task.version,
          ...input, recipient: { account_id: accountId, display_name: 'Alex Morgan' }, channel: 'in_app',
          options: choices, expires_at: '2026-09-19T10:05:00Z' });
      }
      if (url.pathname === '/api/reminders' && method === 'GET') return list(state.reminders);
      if (url.pathname === '/api/reminders' && method === 'POST') {
        const key = headers['idempotency-key'];
        if (saves.has(key)) return reply(state.reminders.find(item => item.id === saves.get(key)));
        const preview = previews.get(body.preview_token);
        if (!preview) return failed(400, 'PREVIEW_INVALID', 'Review a new reminder preview.');
        const saved = reminder(preview.option, preview.input); state.reminders.push(saved); saves.set(key, saved.id);
        if (state.failSave) { state.failSave = false; throw new TypeError('Synthetic lost acceptance'); }
        return reply(saved);
      }
      if (url.pathname.endsWith('/cancel') && method === 'POST') {
        const saved = state.reminders.find(item => url.pathname === `/api/reminders/${item.id}/cancel`);
        if (!saved) return failed(404, 'NOT_FOUND', 'Reminder not found.');
        saved.status = state.cancelSuppressed ? 'suppressed' : 'cancelled';
        saved.reason = state.cancelSuppressed ? 'task_changed' : null;
        return reply(saved);
      }
      if (url.pathname === '/api/notifications' && method === 'GET') return reply(state.notifications, {
        pagination: { next_cursor: null, has_more: false }, unread_count: state.notifications.filter(item => item.read_at === null).length,
      });
      const item = state.notifications.find(item => url.pathname.startsWith(`/api/notifications/${item.id}/`));
      if (item && method === 'POST') {
        if (url.pathname.endsWith('/read')) item.read_at ??= '2026-09-19T10:04:00Z';
        else if (url.pathname.endsWith('/acknowledge')) {
          item.acknowledged_at ??= '2026-09-19T10:03:00Z';
          if (state.failAcknowledgment) { state.failAcknowledgment = false; throw new TypeError('Synthetic lost acknowledgment'); }
        } else throw new Error(`Unexpected mutation ${url.pathname}`);
        return reply(item);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, taskId, spaceId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ screen, taskId }) => window.renderReminderFixture(screen, taskId), { screen: options.screen ?? 'reminders', taskId });
  if (options.screen === 'inbox') {
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).waitFor();
  } else {
    await page.getByLabel('Reminder date and time', { exact: true }).waitFor();
    await page.getByLabel('Timezone', { exact: true }).locator('option[value="America/New_York"]').waitFor({ state: 'attached' });
  }
  return { page, outbound, errors };
}

async function reviewTime(page, overlap = false) {
  if (overlap) {
    await page.evaluate(() => { window.reminderFixture.overlap = true; });
    await page.getByLabel('Timezone', { exact: true }).selectOption('America/New_York');
  }
  await page.getByLabel('Reminder date and time', { exact: true }).fill(overlap ? '2026-11-01T01:30' : '2026-09-19T15:31');
  await page.getByRole('button', { name: 'Review time', exact: true }).click();
  await page.getByRole('heading', { name: 'Review reminder', exact: true }).waitFor();
}

test('offline reminder overlap requires an explicit occurrence and keeps the original save on retry', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { failSave: true });
    await reviewTime(page, true);
    assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Save reminder', exact: true }).isDisabled(), true);
    await page.getByRole('radio').nth(1).check();
    await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Change time', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('radio').nth(0).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Reminder saved.' }).waitFor();
    const observed = await page.evaluate(() => ({ saves: window.reminderFixture.calls.filter(call => call.route === '/api/reminders' && call.method === 'POST'), reminders: window.reminderFixture.reminders }));
    assert.equal(observed.saves.length, 2);
    assert.equal(observed.saves[0].headers['idempotency-key'], observed.saves[1].headers['idempotency-key']);
    assert.deepEqual(observed.saves[0].body, observed.saves[1].body);
    assert.deepEqual(Object.keys(observed.saves[0].body), ['preview_token']);
    assert.equal(observed.reminders.length, 1);
    assert.equal(observed.reminders[0].scheduled_at, '2026-11-01T06:30:00Z');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline inbox acknowledgment stays separate from reading and never changes the task', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { screen: 'inbox', failAcknowledgment: true });
    await page.getByText('1 unread', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Acknowledge reminder', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Retry acknowledgment', exact: true }).click();
    await page.getByText('Reminder acknowledged.', { exact: true }).waitFor();
    await page.getByText('Acknowledged', { exact: true }).waitFor();
    await page.getByText('1 unread', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mark read', exact: true }).click();
    await page.getByText('0 unread', { exact: true }).waitFor();
    const observed = await page.evaluate(() => ({ task: window.reminderFixture.task, calls: window.reminderFixture.calls }));
    assert.equal(observed.task.status, 'open');
    assert.equal(observed.calls.filter(call => call.route.endsWith('/acknowledge')).length, 2);
    assert.equal(observed.calls.some(call => call.route.startsWith('/api/tasks/') && call.method !== 'GET'), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder retry remains available after the task closes or preferences change', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { failSave: true });
    await reviewTime(page);
    await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    await page.evaluate(async () => {
      window.reminderFixture.task.status = 'completed';
      window.reminderFixture.task.completed_at = '2026-09-19T10:02:00Z';
      window.reminderFixture.task.completed_by_account_id = window.reminderFixture.task.created_by_account_id;
      window.reminderFixture.preferences.in_app_reminders_enabled = false;
      await window.refreshReminderFixture();
    });
    const retry = page.getByRole('button', { name: 'Retry original save', exact: true });
    assert.equal(await retry.isEnabled(), true, 'The existing intent needs reconciliation even when new schedules are disallowed.');
    await retry.click();
    await page.getByRole('status').filter({ hasText: 'Reminder saved.' }).waitFor();
    assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder cancellation reports suppression rather than claiming cancellation', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, cancelSuppressed: true });
    await page.getByRole('button', { name: 'Cancel reminder: Buy groceries', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel reminder', exact: true }).click();
    await page.getByText('Stopped', { exact: true }).waitFor();
    assert.equal(await page.getByText('Reminder cancelled.', { exact: true }).count(), 0);
    await page.getByRole('status').filter({ hasText: 'stopped' }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder gap and revoked inbox show errors without rendering stale content', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.evaluate(() => { window.reminderFixture.gap = true; });
    await page.getByLabel('Reminder date and time', { exact: true }).fill('2027-03-14T02:30');
    await page.getByLabel('Timezone', { exact: true }).selectOption('America/New_York');
    await page.getByRole('button', { name: 'Review time', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'does not exist' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save reminder', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route === '/api/reminders' && call.method === 'POST').length), 0);
    await page.evaluate(async () => { window.reminderFixture.denied = true; await window.refreshReminderFixture(); });
    await page.getByRole('alert').filter({ hasText: 'Task access is unavailable' }).waitFor();
    assert.equal(await page.getByLabel('Reminder date and time', { exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder review and inbox render long titles on desktop and mobile', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const title = `Task ${'A'.repeat(170)}`;
    const first = await fixture(context, { title });
    await reviewTime(first.page, true);
    await first.page.evaluate(() => document.fonts.ready);
    await first.page.screenshot({ path: path.join(root, '.local/screenshots/reminder-review-offline-desktop.png'), fullPage: true });
    const inbox = await fixture(second, { screen: 'inbox', title });
    for (const width of [320, 390, 768]) {
      for (const page of [first.page, inbox.page]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    }
    await first.page.setViewportSize({ width: 390, height: 844 });
    await inbox.page.setViewportSize({ width: 390, height: 844 });
    await first.page.screenshot({ path: path.join(root, '.local/screenshots/reminder-review-offline-mobile.png'), fullPage: true });
    await inbox.page.screenshot({ path: path.join(root, '.local/screenshots/inbox-offline-mobile.png'), fullPage: true });
    assert.deepEqual(first.outbound, []); assert.deepEqual(inbox.outbound, []);
    assert.deepEqual(first.errors, []); assert.deepEqual(inbox.errors, []);
  } finally { await context.close(); await second.close(); }
});