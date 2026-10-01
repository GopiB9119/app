import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
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
let bundle;
let css;

before(async () => {
  const output = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { Providers } from './src/app/providers';
      import { ReminderScreen } from './src/features/scheduling/reminder-screen';
      import { NotificationScreen } from './src/features/notifications/notification-screen';
      import './src/app/globals.css';
      const root=createRoot(document.getElementById('root'));
      window.renderReminderFixture=(mode,taskId)=>root.render(<Providers>{mode==='inbox'?<NotificationScreen/>:<ReminderScreen taskId={taskId}/>}</Providers>);`,
      resolveDir: web, loader: 'tsx', sourcefile: 'offline-reminder-fixture.tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/reminder-fixture.js'), loader: { '.otf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-only', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline' }, () => ({ contents: 'import React from "react"; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }', loader: 'jsx', resolveDir: web }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  bundle = output.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
  browser = await chromium.launch({ executablePath: process.env.COMMUNITY_CHROMIUM_PATH, headless: true });
  mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline reminder fixture</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, taskId, spaceId, options }) => {
    let serial = 10;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`, configurable: true });
    const otherId = 'acbf61e8-c984-4085-ae55-fb0c6ae0e14b';
    const other = { account_id: otherId, display_name: 'Sam Morgan' };
    const self = { account_id: accountId, display_name: 'Alex Morgan' };
    const task = { id: taskId, space_id: spaceId, title: options.title ?? 'Buy groceries', description: 'Fruit and bread', due_date: '2026-11-01', status: 'open', assignee: options.assignee ? other : null, assignee_unavailable: false, created_by_account_id: accountId, completed_by_account_id: null, completed_at: null, created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', version: '1', permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] } };
    const reminder = { id: crypto.randomUUID(), task_id: taskId, space_id: spaceId, task_title: task.title, local_time: '2026-11-01T01:30:00', timezone: 'America/New_York', scheduled_at: '2026-11-01T05:30:00Z', expires_at: '2026-11-02T05:30:00Z', status: 'scheduled', reason: null, source_changed: false, acknowledged_at: null, version: '1', channel: 'in_app' };
    const notification = { id: crypto.randomUUID(), reminder_id: reminder.id, task_id: taskId, space_id: spaceId, task_title: task.title, scheduled_at: reminder.scheduled_at, created_at: '2026-11-01T05:31:00Z', read_at: null, acknowledged_at: null };
    const proposal = { id: crypto.randomUUID(), task_id: taskId, space_id: spaceId, task_title: task.title, task_version: '1', requested_by: options.requestInbox ? other : self, recipient: options.requestInbox ? self : other,
      local_time: reminder.local_time, timezone: reminder.timezone, scheduled_at: reminder.scheduled_at, dispatch_expires_at: reminder.expires_at,
      expires_at: '2026-09-22T10:00:00Z', created_at: '2026-09-19T10:00:00Z', resolved_at: null, status: 'pending', source_changed: false, reminder_id: null, version: '1', channel: 'in_app' };
    const state = window.reminderFixture = { calls: [], reminders: options.seed ? [reminder] : [], notifications: options.inbox ? [notification] : [], requests: options.requestInbox || options.requestSent ? [proposal] : [],
      preferences: true, generation: 1, failSave: !!options.failSave, failRequestSave: !!options.failRequestSave, failRequestAccept: !!options.failRequestAccept, failAck: !!options.failAck, denied: false, gap: !!options.gap };
    const receipts = new Map();
    const response = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-reminder', ...extra }), { status: 200, headers });
    const failure = (status, code, message) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-reminder' }), { status });
    const pageOf = data => ({ pagination: { next_cursor: null, has_more: false } });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers, query: url.search });
      if (url.pathname === '/api/me') return response({ id: accountId, email: 'alex@example.test', display_name: 'Alex Morgan', timezone: 'America/New_York', email_verified: true, version: 1 });
      if (url.pathname === '/api/timezones') return response(['America/New_York', 'Asia/Kolkata', 'UTC']);
      if (state.denied) return failure(404, 'NOT_FOUND', 'Task access is unavailable.');
      if (url.pathname === `/api/tasks/${taskId}`) return response(task, {}, { ETag: `"${'a'.repeat(64)}"` });
      if (url.pathname === '/api/reminder-requests' && method === 'GET') return response(state.requests.filter(item => (url.searchParams.get('direction') === 'sent' ? item.requested_by : item.recipient).account_id === accountId), pageOf([]));
      if (url.pathname === '/api/reminder-series' && method === 'GET') return response([], pageOf([]));
      if (url.pathname === '/api/reminder-backups' && method === 'GET') return response([], pageOf([]));
      if (url.pathname === '/api/reminder-backups/contacts') return response([]);
      if (url.pathname === '/api/me/alerts') return response({ items: [], quiet: { active: false, until: null }, next_check_at: '2026-11-02T10:00:00Z', generated_at: '2026-09-19T10:00:00Z' });
      if (url.pathname === '/api/me/quiet-hours') return response({ start: null, end: null, timezone: 'America/New_York', quiet: { active: false, until: null }, version: '0' }, {}, { ETag: `"alert-settings-${accountId}-0"` });
      if (url.pathname === '/api/reminder-requests/preview') return response({ task_id: taskId, task_title: task.title, task_version: '1', local_time: `${body.local_time}:00`, timezone: body.timezone,
        requested_by: self, recipient: other, channel: 'in_app', expires_at: '2026-09-19T10:05:00Z', request_expires_at: proposal.expires_at, options: [
          { scheduled_at: '2026-11-01T05:30:00Z', dispatch_expires_at: '2026-11-02T05:30:00Z', utc_offset_minutes: -240, preview_token: 'first-request-preview-'.repeat(4) },
          { scheduled_at: '2026-11-01T06:30:00Z', dispatch_expires_at: '2026-11-02T06:30:00Z', utc_offset_minutes: -300, preview_token: 'second-request-preview-'.repeat(4) },
        ] });
      if (url.pathname === '/api/reminder-requests' && method === 'POST') {
        const key = headers['idempotency-key'];
        if (receipts.has(key)) return response(receipts.get(key));
        const saved = { ...proposal, scheduled_at: body.preview_token.startsWith('second') ? '2026-11-01T06:30:00Z' : proposal.scheduled_at };
        state.requests.push(saved); receipts.set(key, saved);
        if (state.failRequestSave) { state.failRequestSave = false; throw new TypeError('Synthetic lost request response'); }
        return response(saved);
      }
      if (url.pathname === `/api/reminder-requests/${proposal.id}/review`) return response({ request: proposal, preview_token: 'recipient-review-token-'.repeat(4), expires_at: '2026-09-19T10:05:00Z' });
      if (url.pathname === `/api/reminder-requests/${proposal.id}/accept`) {
        if (proposal.status === 'pending') { proposal.status = 'accepted'; proposal.resolved_at = '2026-09-19T10:01:00Z'; proposal.version = '2'; proposal.reminder_id = reminder.id; state.reminders.push(reminder); }
        if (state.failRequestAccept) { state.failRequestAccept = false; throw new TypeError('Synthetic lost acceptance response'); }
        return response(proposal);
      }
      if (url.pathname === `/api/reminder-requests/${proposal.id}/decline` || url.pathname === `/api/reminder-requests/${proposal.id}/cancel`) {
        proposal.status = url.pathname.endsWith('/decline') ? 'declined' : 'cancelled'; proposal.resolved_at = '2026-09-19T10:01:00Z'; proposal.version = '2'; return response(proposal);
      }
      if (url.pathname === '/api/me/notification-preferences') {
        if (method === 'PATCH') {
          if (headers['if-match'] !== `"preferences-${state.generation}"`) return failure(412, 'PRECONDITION_FAILED', 'Preferences changed.');
          state.preferences = body.in_app_reminders_enabled;
          state.generation += 1;
        }
        return response({ in_app_reminders_enabled: state.preferences, version: String(state.generation) }, {}, { ETag: `"preferences-${state.generation}"` });
      }
      if (url.pathname === '/api/reminders/preview') {
        if (state.gap) return failure(422, 'LOCAL_TIME_NONEXISTENT', 'This local time does not exist. Select another time.');
        return response({ task_id: taskId, task_title: task.title, task_version: '1', local_time: `${body.local_time}:00`, timezone: body.timezone, recipient: { account_id: accountId, display_name: 'Alex Morgan' }, channel: 'in_app', expires_at: '2026-09-19T10:05:00Z', options: [
          { scheduled_at: '2026-11-01T05:30:00Z', dispatch_expires_at: '2026-11-02T05:30:00Z', utc_offset_minutes: -240, preview_token: 'first-reviewed-token-'.repeat(4) },
          { scheduled_at: '2026-11-01T06:30:00Z', dispatch_expires_at: '2026-11-02T06:30:00Z', utc_offset_minutes: -300, preview_token: 'second-reviewed-token-'.repeat(4) },
        ] });
      }
      if (url.pathname === '/api/reminders' && method === 'GET') return response(state.reminders, pageOf(state.reminders));
      if (url.pathname === '/api/reminders' && method === 'POST') {
        const key = headers['idempotency-key'];
        if (receipts.has(key)) return response(receipts.get(key));
        const saved = { ...reminder, scheduled_at: body.preview_token.startsWith('second') ? '2026-11-01T06:30:00Z' : reminder.scheduled_at };
        state.reminders.push(saved); receipts.set(key, saved);
        if (state.failSave) { state.failSave = false; throw new TypeError('Synthetic lost save response'); }
        return response(saved);
      }
      if (url.pathname === `/api/reminders/${reminder.id}/cancel` && method === 'POST') { reminder.status = 'cancelled'; return response(reminder); }
      if (url.pathname === '/api/notifications') return response(state.notifications, { ...pageOf(state.notifications), unread_count: state.notifications.filter(item => item.read_at === null).length });
      if (url.pathname === `/api/notifications/${notification.id}/read`) { notification.read_at ??= '2026-11-01T06:00:00Z'; return response(notification); }
      if (url.pathname === `/api/notifications/${notification.id}/acknowledge`) {
        notification.acknowledged_at ??= '2026-11-01T06:02:00Z';
        if (state.failAck) { state.failAck = false; throw new TypeError('Synthetic lost acknowledgment response'); }
        return response(notification);
      }
      throw new Error(`No real network is allowed: ${method} ${url.pathname}`);
    };
  }, { accountId, taskId, spaceId, options });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(({ mode, taskId }) => window.renderReminderFixture(mode, taskId), { mode: options.inbox ? 'inbox' : 'reminders', taskId });
  await page.getByRole('heading', { name: options.inbox ? 'Inbox' : 'Reminders', exact: true }).waitFor();
  if (!options.inbox) await page.getByLabel('Reminder date and time', { exact: true }).waitFor();
  return { page, outbound, errors };
}

test('offline reminder review requires an explicit DST choice and retries the exact approved intent', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { failSave: true });
    await page.getByLabel('Reminder date and time').fill('2026-11-01T01:30');
    await page.getByRole('button', { name: 'Review time', exact: true }).click();
    await page.getByRole('heading', { name: 'Review reminder', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save reminder', exact: true }).isDisabled(), true);
    await page.getByRole('radio', { name: /UTC-05:00/ }).check();
    await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Change time', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('radio', { name: /UTC-04:00/ }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await page.getByText('Reminder saved.', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route === '/api/reminders' && call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].body, writes[1].body);
    assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.ok(writes[0].body.preview_token.startsWith('second'));
    assert.deepEqual(Object.keys(writes[0].body), ['preview_token']);
    assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder gap failure cannot create a schedule', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { gap: true });
    await page.getByLabel('Reminder date and time').fill('2027-03-14T02:30');
    await page.getByRole('button', { name: 'Review time' }).click();
    await page.getByRole('alert').filter({ hasText: 'does not exist' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save reminder', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route === '/api/reminders' && call.method === 'POST').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder cancellation requires confirmation and reports canonical state', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true });
    await page.getByRole('button', { name: 'Cancel reminder: Buy groceries' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Keep reminder' }).click();
    assert.equal(await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route.endsWith('/cancel')).length), 0);
    await page.getByRole('button', { name: 'Cancel reminder: Buy groceries' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel reminder', exact: true }).click();
    await page.getByText('Reminder cancelled.', { exact: true }).waitFor();
    await page.getByText('Cancelled', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline inbox read is separate from explicit acknowledgment and keeps retry identity', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { inbox: true, failAck: true });
    await page.getByText('1 unread', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mark read', exact: true }).click();
    await page.getByText('0 unread', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.reminderFixture.notifications[0].acknowledged_at), null);
    await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Acknowledge reminder', exact: true }).click();
    await page.getByRole('dialog').getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Not now' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry acknowledgment', exact: true }).click();
    await page.getByText('Reminder acknowledged.', { exact: true }).waitFor();
    await page.getByText('Acknowledged', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route.endsWith('/acknowledge')));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].route, writes[1].route);
    assert.equal(await page.evaluate(() => window.reminderFixture.calls.some(call => call.route.includes('/status'))), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline inbox preferences use a confirmed version and denied refresh removes protected content', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { inbox: true });
    await page.getByRole('checkbox', { name: 'In-app task reminders' }).click();
    await page.waitForFunction(() => window.reminderFixture.preferences === false);
    await page.locator('input[type="checkbox"]:not(:checked)').waitFor();
    const change = await page.evaluate(() => window.reminderFixture.calls.find(call => call.method === 'PATCH'));
    assert.equal(change.headers['if-match'], '"preferences-1"');
    assert.deepEqual(change.body, { in_app_reminders_enabled: false });
    await page.evaluate(() => { window.reminderFixture.denied = true; });
    await page.getByRole('button', { name: 'Refresh inbox' }).click();
    await page.getByRole('alert').filter({ hasText: 'Task access is unavailable.' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline reminder and inbox layouts fit mobile and desktop with long task names', async () => {
  for (const inbox of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const { page, outbound, errors } = await fixture(context, { inbox, seed: true, title: `Weekend ${'A'.repeat(160)}` });
      if (!inbox) {
        await page.getByLabel('Reminder date and time').fill('2026-11-01T01:30');
        await page.getByRole('button', { name: 'Review time' }).click();
        await page.getByRole('heading', { name: 'Review reminder' }).waitFor();
      } else await page.getByText('1 unread', { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(root, `.local/screenshots/${inbox ? 'inbox' : 'reminder'}-offline-desktop.png`), fullPage: true });
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(root, `.local/screenshots/${inbox ? 'inbox' : 'reminder'}-offline-mobile.png`), fullPage: true });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('offline assignee proposal requires review and retries without scheduling for them', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { assignee: true, failRequestSave: true });
    await page.getByRole('radio', { name: 'Request for Sam Morgan' }).check();
    await page.getByLabel('Reminder date and time').fill('2026-11-01T01:30');
    await page.getByRole('button', { name: 'Review time', exact: true }).click();
    await page.getByRole('heading', { name: 'Review reminder request', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send request', exact: true }).isDisabled(), true);
    await page.getByRole('radio', { name: /UTC-05:00/ }).check();
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Change time' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry original save' }).click();
    await page.getByText('Request awaiting acceptance.', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route === '/api/reminder-requests' && call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.deepEqual(writes[0].body, writes[1].body);
    assert.ok(writes[0].body.preview_token.startsWith('second'));
    assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 0);
    await page.getByRole('tab', { name: 'Sent', exact: true }).click();
    await page.getByText('For Sam Morgan', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline recipient acceptance is explicit and retries the original review token', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { requestInbox: true, failRequestAccept: true });
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Accept reminder', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Not now' }).click();
    assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 0);
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await dialog.getByRole('button', { name: 'Accept reminder', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Not now' }).isDisabled(), true);
    assert.equal(await page.getByRole('tab', { name: 'Sent', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Retry original response' }).click();
    await page.getByText('Request accepted.', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.reminderFixture.calls.filter(call => call.route.endsWith('/accept')));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].route, writes[1].route);
    assert.deepEqual(writes[0].body, writes[1].body);
    assert.deepEqual(Object.keys(writes[0].body), ['preview_token']);
    assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline decline and withdrawal confirm the target without creating reminders', async () => {
  for (const sent of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { requestInbox: !sent, requestSent: sent });
      if (sent) await page.getByRole('tab', { name: 'Sent', exact: true }).click();
      await page.getByRole('button', { name: sent ? 'Withdraw request' : 'Decline', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.equal(await page.evaluate(() => window.reminderFixture.calls.filter(call => /\/(decline|cancel)$/.test(call.route)).length), 0);
      await dialog.getByRole('button', { name: sent ? 'Withdraw request' : 'Decline request', exact: true }).click();
      await page.getByText(sent ? 'Request withdrawn.' : 'Request declined.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.reminderFixture.reminders.length), 0);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('offline request denial removes protected request rows and pending review', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { requestInbox: true });
    await page.getByText('From Sam Morgan', { exact: true }).waitFor();
    await page.evaluate(() => { window.reminderFixture.denied = true; });
    await page.getByRole('button', { name: 'Refresh reminder requests' }).click();
    await page.getByRole('alert').filter({ hasText: 'Task access is unavailable.' }).waitFor();
    assert.equal(await page.getByText('From Sam Morgan', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Review request', exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline request review remains usable at narrow widths and large text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context, { requestInbox: true, title: `Weekend ${'A'.repeat(160)}` });
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Accept reminder', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '.local/screenshots/reminder-request-web-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const dialog = page.getByRole('dialog');
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'body{font-size:200%}dialog p,dialog dd,dialog dt{font-size:1.5rem}' });
    await page.getByRole('dialog').getByRole('button', { name: 'Accept reminder', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth), true);
    const bounds = await page.getByRole('dialog').boundingBox();
    for (const button of await page.getByRole('dialog').getByRole('button').all()) {
      const target = await button.boundingBox();
      assert.ok(target.x >= bounds.x && target.x + target.width <= bounds.x + bounds.width, 'Dialog actions stay inside the narrow dialog');
    }
    await page.screenshot({ path: path.join(root, '.local/screenshots/reminder-request-web-mobile.png'), fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Accept reminder', exact: true }).click();
    await page.getByText('Request accepted.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});