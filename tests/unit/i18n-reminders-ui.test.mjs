import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMessages } from '../i18n-messages.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const evidence = path.join(root, '.local', 't98');
const origin = 'http://127.0.0.1:3000';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = 'acbf61e8-c984-4085-ae55-fb0c6ae0e14b';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const seriesId = '6f1c2f0e-8f53-4d55-9a53-1d2b8b7c9e01';
const notificationId = '02a29260-911c-4b20-a991-078b5f0d3248';
const requestId = '9fdccf3d-7653-48aa-bb8a-71af1bef036a';
const taskTitle = 'Morning మాధవి हिन्दी';
const recipientName = 'Recipient సీత हिन्दी';
const senderName = 'Sender బీనా हिन्दी';
const serverMessage = 'Synthetic refusal మాధవి हिन्दी. Leave unchanged.';
const now = '2026-10-01T12:00:00Z';
const scheduledAt = '2026-11-01T08:00:00Z';
const notificationAt = '2026-10-01T11:59:00Z';
const timezone = 'Asia/Kolkata';
const timeout = 180_000;
const { en, te, hi } = loadMessages().messages;
const texts = { en, te, hi };
const locales = { en: 'en', te: 'te-IN', hi: 'hi-IN' };
const weeklyRule = {
  frequency: 'weekly', repeat_every: 2, weekdays: ['mon', 'wed'], local_time: '08:00', timezone: 'UTC',
  start_date: '2026-11-02', end_date: '2026-11-09', clock_change_policy: 'shift_forward',
};
let browser;
let javascript;
let css;

before(async () => {
  mkdirSync(evidence, { recursive: true });
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { ReminderScreen } from './src/features/scheduling/reminder-screen';
        import { NotificationScreen } from './src/features/notifications/notification-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderReminderI18n = (language, mode, taskId) => root.render(
          <Providers language={language}>{mode === 'inbox' ? <NotificationScreen /> : <ReminderScreen taskId={taskId} />}</Providers>);
        window.unmountReminderI18n = () => root.unmount();`,
      resolveDir: web, sourcefile: 'offline-i18n-reminders.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(evidence, 'offline-i18n-reminders.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-reminder-i18n-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export function usePathname() { return window.reminderI18nFixture.mode === "inbox" ? "/app/notifications" : "/app/reminders"; }',
        resolveDir: web, loader: 'js',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath), 'The configured offline Chromium must exist.');
  browser = await chromium.launch({ executablePath, headless: true });
}, { timeout });
after(async () => { await browser?.close(); });

const text = (language, id, values = {}) => texts[language][id].replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,
  (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);

async function fixture(testContext, options = {}) {
  const language = options.language ?? 'te';
  const mode = options.mode ?? 'reminders';
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC' });
  testContext.after(() => context.close());
  const outbound = [];
  const errors = [];
  const calls = [];
  const unexpected = [];
  const routePath = mode === 'inbox' ? '/app/notifications' : '/app/reminders';
  await context.route('**/*', route => {
    if (route.request().resourceType() === 'document' && route.request().method() === 'GET' && route.request().url() === origin + routePath) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><title>Offline reminder languages</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordReminderI18nCall', call => { calls.push(call); });
  await page.exposeFunction('recordReminderI18nUnexpected', call => { unexpected.push(call); });
  await page.clock.setFixedTime(new Date(now));
  await page.goto(origin + routePath);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, otherId, taskId, spaceId, seriesId, notificationId, requestId, taskTitle, recipientName, senderName, serverMessage, now, scheduledAt, notificationAt, timezone, weeklyRule, mode, options }) => {
    let sequence = 10;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}` });
    const self = { account_id: accountId, display_name: recipientName };
    const other = { account_id: otherId, display_name: senderName };
    const task = {
      id: taskId, space_id: spaceId, title: taskTitle, description: 'Fruit పండ్లు हिन्दी', due_date: null,
      status: 'open', assignee: other, assignee_unavailable: false, created_by_account_id: accountId,
      completed_by_account_id: null, completed_at: null, created_at: now, updated_at: now, version: '1',
      permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] },
    };
    const reminder = {
      id: 'ad88a51c-b2fc-4a0f-a83a-27fcd3ea447d', task_id: taskId, space_id: spaceId, task_title: taskTitle,
      local_time: '2026-11-01T13:30:00', timezone, scheduled_at: scheduledAt, expires_at: '2026-11-02T08:00:00Z',
      status: 'scheduled', reason: null, source_changed: false, acknowledged_at: null, version: '1', channel: 'in_app',
      series_id: null, follow_up_of: null, snooze_count: 0,
    };
    const notification = {
      id: notificationId, reminder_id: reminder.id, task_id: taskId, space_id: spaceId, task_title: taskTitle,
      scheduled_at: notificationAt, created_at: now, read_at: null, acknowledged_at: null, series_id: null,
      snooze_count: 0, snoozed_until: null, can_snooze: true, snooze_before: null,
    };
    const proposal = {
      id: requestId, task_id: taskId, space_id: spaceId, task_title: taskTitle, task_version: '1',
      requested_by: other, recipient: self, local_time: reminder.local_time, timezone,
      scheduled_at: scheduledAt, dispatch_expires_at: reminder.expires_at, expires_at: '2026-10-04T12:00:00Z',
      created_at: now, resolved_at: null, status: 'pending', source_changed: false, reminder_id: null,
      version: '1', channel: 'in_app',
    };
    const previewOf = rule => {
      const occurrences = [];
      const first = Date.parse(`${rule.start_date}T12:00:00Z`);
      const last = Date.parse(`${rule.end_date}T12:00:00Z`);
      const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const startWeekday = (new Date(first).getUTCDay() + 6) % 7;
      for (let value = first, day = 0; value <= last; value += 86_400_000, day += 1) {
        const localDate = new Date(value).toISOString().slice(0, 10);
        const included = rule.frequency === 'daily' ? day % rule.repeat_every === 0
          : Math.floor((day + startWeekday) / 7) % rule.repeat_every === 0 && rule.weekdays.includes(weekdays[new Date(value).getUTCDay()]);
        if (included) occurrences.push({ reminder_id: null, local_date: localDate, display_time: rule.local_time,
          scheduled_at: `${localDate}T${rule.local_time}:00Z`, utc_offset_minutes: 0, adjustment: 'none' });
      }
      return { task_id: taskId, task_title: taskTitle, task_version: '1', recipient: self, ...rule,
        occurrences: occurrences.slice(0, 10), occurrence_count: occurrences.length, clock_changes: [], channel: 'in_app',
        preview_token: `synthetic-i18n-series-preview-${crypto.randomUUID()}`, expires_at: '2026-10-01T12:05:00Z' };
    };
    const seriesOf = (rule, id = seriesId) => ({
      id, task_id: taskId, space_id: spaceId, task_title: taskTitle, task_version: '1', source_changed: false,
      ...rule, status: 'active', reason: null,
      next_occurrence: { ...previewOf(rule).occurrences[0], reminder_id: reminder.id },
      created_at: now, updated_at: now, version: '1', etag: '"series-1"', channel: 'in_app',
    });
    const state = window.reminderI18nFixture = {
      mode, calls: [], streams: [], reminders: options.seedReminder ? [reminder] : [],
      notifications: options.seedInbox ? [notification] : [], requests: options.seedRequest ? [proposal] : [],
      series: options.seedSeries ? [seriesOf(weeklyRule)] : [], previews: {}, receipts: {},
      preferences: true, preferenceVersion: 1, refuseProfile: !!options.refuseProfile, refuseReview: !!options.refuseReview,
    };
    const reply = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-i18n-reminders', ...extra }), { headers });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const failure = () => new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: serverMessage, details: {} }, request_id: 'offline-i18n-reminders' }), { status: 503 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const route = url.pathname;
      const method = config.method ?? 'GET';
      if (route === '/api/live' && method === 'GET') {
        const stream = { closed: false };
        state.streams.push(stream);
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"heartbeat_seconds":15,"max_seconds":1800}\n\n'));
            const abort = () => { if (!stream.closed) { stream.closed = true; controller.error(new DOMException('Aborted', 'AbortError')); } };
            if (config.signal?.aborted) abort();
            else config.signal?.addEventListener('abort', abort, { once: true });
          },
          cancel() { stream.closed = true; },
        }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
      }
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      const call = { route, method, query: url.search, body, headers };
      state.calls.push(call);
      await window.recordReminderI18nCall(call);
      if (route === '/api/me' && method === 'GET') {
        if (state.refuseProfile) { state.refuseProfile = false; return failure(); }
        return reply({ id: accountId, email: 'sita@example.test', display_name: recipientName, timezone, email_verified: true, version: 1 });
      }
      if (route === '/api/timezones' && method === 'GET') return reply([timezone, 'UTC', 'America/New_York']);
      if (route === `/api/tasks/${taskId}` && method === 'GET') return reply(task, {}, { ETag: `"${'a'.repeat(64)}"` });
      if (route === '/api/reminders' && method === 'GET') return paged(state.reminders);
      if (route === '/api/reminder-series' && method === 'GET') return paged(state.series);
      if (route === '/api/reminder-requests' && method === 'GET') return paged(state.requests.filter(item =>
        (url.searchParams.get('direction') === 'sent' ? item.requested_by : item.recipient).account_id === accountId));
      if (route === '/api/reminder-backups' && method === 'GET') return paged([]);
      if (route === '/api/reminder-backups/contacts' && method === 'GET') return reply([]);
      if (route === '/api/notifications' && method === 'GET') return paged(state.notifications, { unread_count: state.notifications.filter(item => item.read_at === null).length });
      if (route === '/api/me/alerts' && method === 'GET') return reply({ items: [], quiet: { active: false, until: null }, next_check_at: '2026-10-01T12:01:00Z', generated_at: now });
      if (route === '/api/me/quiet-hours' && method === 'GET') return reply(
        { start: null, end: null, timezone, quiet: { active: false, until: null }, version: '0' }, {}, { ETag: `"alert-settings-${accountId}-0"` });
      if (route === '/api/me/notification-preferences' && ['GET', 'PATCH'].includes(method)) {
        if (method === 'PATCH') { state.preferences = body.in_app_reminders_enabled; state.preferenceVersion++; }
        return reply({ in_app_reminders_enabled: state.preferences, version: String(state.preferenceVersion) }, {}, { ETag: `"preferences-${state.preferenceVersion}"` });
      }
      if (['/api/reminders/preview', '/api/reminder-requests/preview'].includes(route) && method === 'POST') {
        const instant = new Date(Date.parse(`${body.local_time}:00Z`) - (body.timezone === timezone ? 330 : 0) * 60_000).toISOString();
        const preview = {
          task_id: taskId, task_title: taskTitle, task_version: '1', local_time: `${body.local_time}:00`, timezone: body.timezone,
          recipient: route === '/api/reminders/preview' ? self : other, channel: 'in_app', expires_at: '2026-10-01T12:05:00Z',
          options: [{ scheduled_at: instant, dispatch_expires_at: new Date(Date.parse(instant) + 86_400_000).toISOString(), utc_offset_minutes: body.timezone === timezone ? 330 : 0, preview_token: `synthetic-i18n-reminder-preview-${crypto.randomUUID()}` }],
        };
        if (route === '/api/reminder-requests/preview') Object.assign(preview, { requested_by: self, request_expires_at: proposal.expires_at });
        state.previews[preview.options[0].preview_token] = preview;
        return reply(preview);
      }
      if (['/api/reminders', '/api/reminder-requests'].includes(route) && method === 'POST') {
        const receiptKey = `${route}|${headers['idempotency-key']}`;
        if (state.receipts[receiptKey]) return reply(state.receipts[receiptKey]);
        const preview = state.previews[body.preview_token];
        const saved = route === '/api/reminders'
          ? { ...reminder, id: crypto.randomUUID(), local_time: preview.local_time, timezone: preview.timezone, scheduled_at: preview.options[0].scheduled_at, expires_at: preview.options[0].dispatch_expires_at }
          : { ...proposal, id: crypto.randomUUID(), requested_by: self, recipient: other, scheduled_at: preview.options[0].scheduled_at };
        (route === '/api/reminders' ? state.reminders : state.requests).push(saved);
        state.receipts[receiptKey] = saved;
        return reply(saved);
      }
      if (route === `/api/reminders/${reminder.id}/cancel` && method === 'POST') { reminder.status = 'cancelled'; return reply(reminder); }
      const requestAction = route.match(/^\/api\/reminder-requests\/([^/]+)\/(review|accept|decline|cancel)$/);
      if (requestAction && requestAction[1] === requestId) {
        if (requestAction[2] === 'review' && method === 'GET') {
          if (state.refuseReview) { state.refuseReview = false; return failure(); }
          return reply({ request: proposal, preview_token: 'synthetic-i18n-request-review-token-'.repeat(3), expires_at: '2026-10-01T12:05:00Z' });
        }
        if (['accept', 'decline', 'cancel'].includes(requestAction[2]) && method === 'POST') {
          proposal.status = { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[requestAction[2]];
          proposal.resolved_at = now; proposal.version = '2';
          if (requestAction[2] === 'accept') { proposal.reminder_id = reminder.id; if (!state.reminders.length) state.reminders.push(reminder); }
          return reply(proposal);
        }
      }
      if (route === '/api/reminder-series/preview' && method === 'POST') {
        const { task_id, ...rule } = body;
        if (task_id !== taskId) throw new Error('The preview must keep the synthetic task identifier.');
        const preview = previewOf(rule); state.previews[preview.preview_token] = preview;
        return reply(preview);
      }
      if (route === '/api/reminder-series' && method === 'POST') {
        const receiptKey = `${route}|${headers['idempotency-key']}`;
        if (state.receipts[receiptKey]) return reply(state.receipts[receiptKey]);
        const preview = state.previews[body.preview_token];
        const rule = Object.fromEntries(Object.keys(weeklyRule).map(name => [name, preview[name]]));
        const saved = seriesOf(rule, crypto.randomUUID()); state.series.push(saved); state.receipts[receiptKey] = saved;
        return reply(saved);
      }
      const seriesAction = route.match(/^\/api\/reminder-series\/([^/]+)\/(pause|resume|skip|cancel)$/);
      if (seriesAction && method === 'POST') {
        const item = state.series.find(value => value.id === seriesAction[1]);
        const status = { pause: 'paused', resume: 'active', skip: 'active', cancel: 'cancelled' }[seriesAction[2]];
        Object.assign(item, { status, reason: status === 'paused' ? 'by_person' : null, next_occurrence: status === 'active' ? item.next_occurrence : null, version: '2', etag: '"series-2"' });
        return reply(item);
      }
      const notificationAction = route.match(/^\/api\/notifications\/([^/]+)\/(read|acknowledge|snooze)$/);
      if (notificationAction && notificationAction[1] === notificationId && method === 'POST') {
        if (notificationAction[2] === 'read') notification.read_at = now;
        if (notificationAction[2] === 'acknowledge') { notification.acknowledged_at = now; notification.can_snooze = false; }
        if (notificationAction[2] === 'snooze') Object.assign(notification, { read_at: now, can_snooze: false,
          snoozed_until: new Date(Math.ceil((Date.now() + body.minutes * 60_000) / 60_000) * 60_000).toISOString() });
        return reply(notification);
      }
      await window.recordReminderI18nUnexpected(call);
      throw new Error(`No offline fixture for ${method} ${route}`);
    };
  }, { accountId, otherId, taskId, spaceId, seriesId, notificationId, requestId, taskTitle, recipientName, senderName, serverMessage, now, scheduledAt, notificationAt, timezone, weeklyRule, mode, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ language, mode, taskId }) => window.renderReminderI18n(language, mode, taskId), { language, mode, taskId });
  const heading = options.refuseProfile ? mode === 'inbox' ? 'inbox.unavailable' : 'reminders.unavailable' : mode === 'inbox' ? 'inbox.title' : 'reminders.title';
  await page.getByRole('heading', { name: texts[language][heading], exact: true }).waitFor();
  await page.waitForFunction(value => document.documentElement.lang === value, language);
  return { page, outbound, errors, calls, unexpected };
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'Every non-fixture network request must be blocked.');
  assert.deepEqual(result.errors, [], 'The real components must not raise page errors.');
  assert.deepEqual(result.unexpected, [], 'Every API call must have an explicit fixture.');
  assert.ok(result.calls.every(call => call.route !== '/api/live'), 'The open live stream is not counted as an API call.');
}

async function expectedDate(page, language, date, options = { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }) {
  return page.evaluate(({ locale, date, options }) => new Intl.DateTimeFormat(locale, options).format(new Date(date)), { locale: locales[language], date, options });
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, .app-header, .app-footer, .main-nav, main section, dialog[open]')].map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 160)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay within the viewport.`);
}

async function doubleText(page, state) {
  await page.evaluate(() => document.fonts.ready);
  await assertFits(page, `${state} desktop`);
  await page.setViewportSize({ width: 320, height: 844 });
  await assertFits(page, `${state} 320 px`);
  const original = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), original * 2, 'Body text must genuinely double.');
  await assertFits(page, `${state} 320 px / 200% text`);
}

for (const language of ['te', 'hi']) {
  test(`${language}: reminders translate actions, statuses and dates without translating task content`, { timeout }, async testContext => {
    const result = await fixture(testContext, { language, seedReminder: true });
    const { page } = result;
    const xml = readFileSync(path.join(root, `android/app/src/main/res/values-${language}/strings.xml`), 'utf8');
    const androidTitle = await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xml').querySelector('string[name="reminders_title"]').textContent, xml);
    assert.equal(texts[language]['reminders.title'], androidTitle, 'The translated heading must reuse the matching Android draft.');
    await page.getByRole('heading', { name: texts[language]['reminders.new'], exact: true }).waitFor();
    await page.getByRole('button', { name: texts[language]['reminders.reviewTime'], exact: true }).waitFor();
    await page.getByRole('button', { name: texts[language]['reminders.refresh'], exact: true }).waitFor();
    await page.getByText(texts[language]['reminders.status.scheduled'], { exact: true }).waitFor();
    await page.getByText(texts[language]['reminders.noReceived'], { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: taskTitle, exact: true }).count(), 2);
    assert.equal(await page.locator(`time[datetime="${scheduledAt}"]`).textContent(), await expectedDate(page, language, scheduledAt));
    assert.equal(await page.locator('select[name="reminder_timezone"]').inputValue(), timezone);
    if (language === 'te') {
      await page.screenshot({ path: path.join(evidence, 'reminders-te-desktop.png'), fullPage: true });
      await doubleText(page, 'Telugu reminders');
    }
    await page.getByLabel(texts[language]['reminders.dateTime'], { exact: true }).fill('2026-11-01T13:30');
    await page.getByRole('button', { name: texts[language]['reminders.reviewTime'], exact: true }).click();
    const review = page.getByRole('region', { name: texts[language]['reminders.review'], exact: true });
    await review.waitFor();
    await review.getByRole('button', { name: texts[language]['reminders.save'], exact: true }).waitFor();
    assert.equal(await review.getByText(taskTitle, { exact: true }).count(), 1);
    assert.equal(await review.getByText(text(language, 'reminders.you', { name: recipientName }), { exact: true }).count(), 1);
    assert.equal(await review.getByText(await expectedDate(page, language, scheduledAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }), { exact: true }).count(), 1);
    const sent = result.calls.find(call => call.route === '/api/reminders/preview');
    assert.deepEqual(sent.body, { task_id: taskId, local_time: '2026-11-01T13:30', timezone });
    if (language === 'te') {
      await assertFits(page, 'Telugu reminder review 320 px / 200% text');
      await page.screenshot({ path: path.join(evidence, 'reminders-te-320-200.png'), fullPage: true });
    }
    assertClean(result);
  });
}

test('te: request review and acceptance translate while names and server errors stay unchanged', { timeout }, async testContext => {
  const result = await fixture(testContext, { seedRequest: true, refuseReview: true });
  const { page } = result;
  await page.getByText(te['reminders.empty'], { exact: true }).waitFor();
  await page.getByText(te['reminders.requestStatus.pending'], { exact: true }).waitFor();
  await page.getByText(text('te', 'reminders.fromName', { name: senderName }), { exact: true }).waitFor();
  await doubleText(page, 'Telugu requests');
  await page.getByRole('button', { name: te['reminders.reviewRequestAction'], exact: true }).click();
  const dialog = page.getByRole('dialog', { name: te['reminders.reviewRequest'], exact: true });
  await dialog.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
  assert.equal(await dialog.getByRole('alert').textContent(), serverMessage);
  await dialog.getByRole('button', { name: te['reminders.reloadReview'], exact: true }).click();
  await dialog.getByRole('button', { name: te['reminders.accept'], exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] .primary-button')].every(button => !button.disabled));
  for (const value of [taskTitle, recipientName, senderName]) assert.equal(await dialog.getByText(value, { exact: true }).count(), 1);
  await assertFits(page, 'Telugu request dialog 320 px / 200% text');
  await dialog.getByRole('button', { name: te['reminders.accept'], exact: true }).click();
  await page.getByRole('status').filter({ hasText: te['reminders.requestNotice.accepted'] }).waitFor();
  assert.equal(result.calls.filter(call => call.route.endsWith('/accept')).length, 1);
  assert.deepEqual(Object.keys(result.calls.find(call => call.route.endsWith('/accept')).body), ['preview_token']);
  assertClean(result);
});

test('te: repeating creation, plural rule, list and review follow Telugu at 320 px and doubled text', { timeout }, async testContext => {
  const result = await fixture(testContext, { seedSeries: true });
  const { page } = result;
  const series = page.getByRole('region', { name: te['reminders.series.heading'], exact: true });
  await series.getByText(te['reminders.series.status.active'], { exact: true }).waitFor();
  await page.getByText(te['reminders.empty'], { exact: true }).waitFor();
  const ruleText = text('te', 'reminders.series.rule.weekly.other', { count: 2, days: `${te['reminders.series.day.mon']}, ${te['reminders.series.day.wed']}`, time: '08:00' });
  await series.getByText(ruleText, { exact: true }).waitFor();
  assert.equal(await series.getByRole('heading', { name: taskTitle, exact: true }).count(), 1);
  assert.equal(await series.locator('time').textContent(), await expectedDate(page, 'te', '2026-11-02T08:00:00Z', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }));
  await page.getByRole('combobox', { name: te['reminders.repeat'], exact: true }).selectOption('weekly');
  const form = page.locator('form').filter({ has: page.locator('input[name="series_local_time"]') });
  await form.getByLabel(te['reminders.series.time'], { exact: true }).fill(weeklyRule.local_time);
  await form.getByLabel(te['reminders.series.everyWeeks'], { exact: true }).fill('2');
  await form.getByLabel(te['reminders.series.firstDay'], { exact: true }).fill(weeklyRule.start_date);
  await form.getByLabel(te['reminders.series.lastDay'], { exact: true }).fill(weeklyRule.end_date);
  await form.getByRole('combobox', { name: te['reminders.timezone'], exact: true }).selectOption('UTC');
  for (const day of weeklyRule.weekdays) await form.getByRole('checkbox', { name: te[`reminders.series.day.${day}`], exact: true }).check();
  await doubleText(page, 'Telugu repeating form and list');
  await form.getByRole('button', { name: te['reminders.series.review'], exact: true }).click();
  const review = page.getByRole('region', { name: te['reminders.series.review'], exact: true });
  await review.getByRole('button', { name: te['reminders.series.save'], exact: true }).waitFor();
  await review.getByText(ruleText, { exact: true }).waitFor();
  assert.equal(await review.getByText(taskTitle, { exact: true }).count(), 1);
  const dateOptions = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  await review.getByText(await expectedDate(page, 'te', `${weeklyRule.start_date}T12:00:00Z`, dateOptions), { exact: true }).waitFor();
  await assertFits(page, 'Telugu repeating review 320 px / 200% text');
  await page.screenshot({ path: path.join(evidence, 'series-te-320-200.png'), fullPage: true });
  await review.getByRole('button', { name: te['reminders.series.save'], exact: true }).click();
  await page.getByRole('status').filter({ hasText: te['reminders.seriesSaved'] }).waitFor();
  assert.deepEqual(result.calls.find(call => call.route === '/api/reminder-series/preview').body, { task_id: taskId, ...weeklyRule });
  assert.deepEqual(Object.keys(result.calls.find(call => call.route === '/api/reminder-series' && call.method === 'POST').body), ['preview_token']);
  assertClean(result);
});

test('te: approved series confirmations translate but C10 move and replacement controls stay English', { timeout }, async testContext => {
  const result = await fixture(testContext, { seedSeries: true });
  const { page } = result;
  const series = page.getByRole('region', { name: te['reminders.series.heading'], exact: true });
  await series.getByRole('button', { name: `Move next reminder: ${taskTitle}`, exact: true }).click();
  const moving = page.getByRole('dialog', { name: 'Move the next reminder?', exact: true });
  await moving.getByLabel('New time', { exact: true }).waitFor();
  await moving.getByRole('button', { name: 'Move reminder', exact: true }).waitFor();
  await moving.getByRole('button', { name: 'Keep as is', exact: true }).click();
  await series.getByRole('button', { name: `Change repeating reminder: ${taskTitle}`, exact: true }).click();
  const replacing = page.getByRole('dialog', { name: 'Change repeating reminder', exact: true });
  await replacing.getByLabel('Time', { exact: true }).waitFor();
  await replacing.getByRole('button', { name: 'Review change', exact: true }).waitFor();
  await replacing.getByRole('button', { name: 'Close reminder dialog', exact: true }).click();
  await doubleText(page, 'Telugu repeating list');
  await series.getByRole('button', { name: text('te', 'reminders.series.pauseLabel', { title: taskTitle }), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: te['reminders.series.title.pause'], exact: true });
  await dialog.getByRole('button', { name: te['reminders.series.confirm.pause'], exact: true }).waitFor();
  assert.equal(await dialog.getByText(taskTitle, { exact: true }).count(), 1);
  await assertFits(page, 'Telugu series confirmation 320 px / 200% text');
  await dialog.getByRole('button', { name: te['reminders.series.confirm.pause'], exact: true }).click();
  await page.getByRole('status').filter({ hasText: te['reminders.series.outcome.pause'] }).waitFor();
  const sent = result.calls.find(call => call.route.endsWith('/pause'));
  assert.deepEqual(sent.body, {}); assert.equal(sent.headers['if-match'], '"series-1"');
  assert.equal(result.calls.some(call => /\/(move|replace)$/.test(call.route)), false);
  await page.locator('.language-picker select').selectOption('hi');
  await page.getByRole('status').filter({ hasText: hi['reminders.series.outcome.pause'] }).waitFor();
  assertClean(result);
});

for (const language of ['te', 'hi']) {
  test(`${language}: inbox translates actions, read state, snooze and acknowledgment without translating titles`, { timeout }, async testContext => {
    const result = await fixture(testContext, { mode: 'inbox', language, seedInbox: true });
    const { page } = result;
    for (const id of ['inbox.refresh', 'inbox.markRead', 'inbox.acknowledge']) await page.getByRole('button', { name: texts[language][id], exact: true }).waitFor();
    await page.getByText(texts[language]['inbox.unreadStatus'], { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: taskTitle, exact: true }).count(), 1);
    assert.equal(await page.locator(`time[datetime="${notificationAt}"]`).textContent(), await expectedDate(page, language, notificationAt));
    await page.getByRole('checkbox', { name: texts[language]['inbox.preferenceLabel'], exact: true }).waitFor();
    await page.getByRole('switch', { name: texts[language]['inbox.browserAlerts'], exact: true }).waitFor();
    if (language === 'te') await doubleText(page, 'Telugu inbox');
    await page.getByRole('button', { name: texts[language]['inbox.markRead'], exact: true }).click();
    await page.getByText(texts[language]['inbox.read'], { exact: true }).waitFor();
    await page.getByRole('button', { name: text(language, 'inbox.snoozeLabel', { title: taskTitle }), exact: true }).click();
    const snooze = page.getByRole('dialog', { name: texts[language]['inbox.snoozeTitle'], exact: true });
    for (const minutes of [10, 60, 180, 1440]) assert.equal(await snooze.getByText(texts[language][`inbox.snooze.${minutes}`], { exact: true }).count(), 1);
    if (language === 'te') await assertFits(page, 'Telugu snooze dialog 320 px / 200% text');
    await snooze.getByRole('radio').first().check();
    await snooze.getByRole('button', { name: texts[language]['inbox.snooze'], exact: true }).click();
    const until = await page.evaluate(() => window.reminderI18nFixture.notifications[0].snoozed_until);
    await page.getByRole('status').filter({ hasText: text(language, 'inbox.snoozedUntilNotice', { date: await expectedDate(page, language, until) }) }).waitFor();
    assert.deepEqual(result.calls.find(call => call.route.endsWith('/snooze')).body, { minutes: 10 });
    await page.getByRole('button', { name: texts[language]['inbox.acknowledge'], exact: true }).click();
    const dialog = page.getByRole('dialog', { name: texts[language]['inbox.acknowledgeTitle'], exact: true });
    await dialog.getByRole('button', { name: texts[language]['inbox.acknowledgeReminder'], exact: true }).waitFor();
    assert.equal(await dialog.getByText(taskTitle, { exact: true }).count(), 1);
    if (language === 'te') {
      await assertFits(page, 'Telugu acknowledgment dialog 320 px / 200% text');
      await page.screenshot({ path: path.join(evidence, 'inbox-te-320-200.png'), fullPage: true });
    }
    await dialog.getByRole('button', { name: texts[language]['inbox.acknowledgeReminder'], exact: true }).click();
    await page.getByRole('status').filter({ hasText: texts[language]['inbox.acknowledgedNotice'] }).waitFor();
    assert.equal(result.calls.some(call => call.route.includes('/status')), false);
    await page.evaluate(() => { window.reminderI18nFixture.notifications = []; });
    await page.getByRole('button', { name: texts[language]['inbox.refresh'], exact: true }).click();
    await page.getByText(texts[language]['inbox.empty'], { exact: true }).waitFor();
    if (language === 'te') await assertFits(page, 'Telugu empty inbox 320 px / 200% text');
    await page.waitForFunction(() => window.reminderI18nFixture.streams.length > 0);
    await page.evaluate(() => window.unmountReminderI18n());
    await page.waitForFunction(() => window.reminderI18nFixture.streams.every(stream => stream.closed));
    assertClean(result);
  });
}

test('te: unavailable screens translate Retry and keep the server message byte-identical', { timeout }, async testContext => {
  for (const mode of ['reminders', 'inbox']) {
    const result = await fixture(testContext, { mode, refuseProfile: true });
    const prefix = mode === 'inbox' ? 'inbox' : 'reminders';
    await result.page.getByRole('heading', { name: te[`${prefix}.unavailable`], exact: true }).waitFor();
    assert.equal(await result.page.getByRole('alert').textContent(), serverMessage);
    await result.page.getByRole('button', { name: te[`${prefix}.retry`], exact: true }).click();
    await result.page.getByRole('heading', { name: te[`${prefix}.title`], exact: true }).waitFor();
    assertClean(result);
  }
});