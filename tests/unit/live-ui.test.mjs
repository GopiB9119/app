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
const otherId = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const chatId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const otherChatId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const alertsLabel = 'Browser alerts for new reminders';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { notifyManager, useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { MessagesScreen } from './src/features/messaging/messages-screen';
        import { NotificationScreen } from './src/features/notifications/notification-screen';
        import { useLiveConnected } from './src/features/realtime/live';
        import './src/app/globals.css';
        notifyManager.setScheduler(callback => queueMicrotask(callback));
        let root;
        function Probe() {
          const client = useQueryClient();
          const connected = useLiveConnected();
          useEffect(() => { window.liveFixture.connected = connected; }, [connected]);
          useEffect(() => { window.liveFixture.refreshAccount = () => client.refetchQueries({ queryKey: ['me'], exact: true }); }, [client]);
          return null;
        }
        window.renderLiveFixture = (screen = 'messages') => {
          root ??= createRoot(document.getElementById('root'));
          root.render(<Providers>{screen === 'inbox' ? <NotificationScreen /> : <MessagesScreen initialSpaceId="" />}<Probe /></Providers>);
        };
        window.unmountLiveFixture = () => { root.unmount(); root = null; };`,
      resolveDir: web, sourcefile: 'offline-live.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-live.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-live-dependencies', setup(builder) {
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
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent('<html><head><title>Offline live updates</title></head><body><div id="root"></div></body></html>');
  const now = new Date('2026-10-01T10:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 3600000));
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, otherId, spaceId, chatId, otherChatId, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const conversations = [chatId, otherChatId].map((id, index) => ({
      id, space_id: spaceId, space_name: 'Morgan family', kind: 'space', title: index ? 'Garden club' : 'Morgan family', participants: [],
      can_send: true, protection: 'server_encrypted', last_position: '0', read_position: '0', unread_count: 0,
      last_message_at: null, created_at: '2026-09-19T10:00:00Z',
    }));
    const storage = new Map();
    const state = window.liveFixture = {
      calls: [], unexpected: [], conversations, messages: { [chatId]: [], [otherChatId]: [] }, notifications: [], streams: [],
      connected: false, holdNext: false, holding: false, release: null, reads: [],
      rateLimits: options.rateLimits ?? 0,
      preferencesUnavailable: options.preferencesUnavailable ?? false, notificationsDenied: false,
      permission: options.permission ?? 'default', permissionRequests: 0, alerts: [], storage,
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); },
    } });
    class BrowserNotification {
      static get permission() { return state.permission; }
      static async requestPermission() { state.permissionRequests += 1; state.permission = options.permissionResult ?? 'granted'; return state.permission; }
      constructor(title, configuration) { state.alerts.push({ title, configuration }); }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: options.notificationsSupported === false ? undefined : BrowserNotification });
    const reply = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-live', ...extra }), { headers });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    state.send = (event, payload) => {
      const stream = state.streams.findLast(item => !item.closed);
      if (!stream) throw new Error('No live stream is open');
      stream.controller.enqueue(new TextEncoder().encode(`event: ${event}\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`));
    };
    state.addMessage = (body, conversationId = chatId) => {
      const conversation = conversations.find(item => item.id === conversationId);
      const position = String(Number(conversation.last_position) + 1);
      state.messages[conversationId].push({
        id: crypto.randomUUID(), conversation_id: conversationId, position, sender_account_id: otherId, sender_name: 'Sam Morgan',
        mine: false, client_message_id: null, status: 'sent', body, created_at: '2026-10-01T10:01:00Z', deleted_at: null,
      });
      Object.assign(conversation, { last_position: position, last_message_at: '2026-10-01T10:01:00Z', unread_count: Number(position) - Number(conversation.read_position) });
    };
    state.addReminder = title => state.notifications.push({
      id: crypto.randomUUID(), reminder_id: crypto.randomUUID(), task_id: crypto.randomUUID(), space_id: spaceId,
      task_title: title, scheduled_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T10:01:00Z', read_at: null, acknowledged_at: null,
    });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const headers = Object.fromEntries(new Headers(config.headers));
      const body = config.body ? JSON.parse(config.body) : null;
      state.calls.push({ route: url.pathname, method, headers, body });
      if (url.pathname === '/api/live') {
        if (options.failLive) throw new TypeError('Synthetic unavailable live stream');
        if (state.rateLimits > 0) {
          state.rateLimits -= 1;
          return new Response(JSON.stringify({ error: { code: 'LIVE_LIMIT_REACHED' } }), {
            status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '900' },
          });
        }
        const stream = { controller: null, closed: false };
        const response = new Response(new ReadableStream({
          start(controller) { stream.controller = controller; }, cancel() { stream.closed = true; },
        }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
        config.signal.addEventListener('abort', () => {
          stream.closed = true;
          try { stream.controller.error(new DOMException('Aborted', 'AbortError')); } catch {}
        }, { once: true });
        state.streams.push(stream);
        return response;
      }
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') return paged([]);
      if (url.pathname === '/api/conversations') return paged(conversations, { unread_count: conversations.reduce((sum, item) => sum + item.unread_count, 0) });
      if (url.pathname === '/api/notifications') {
        if (state.notificationsDenied) return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Reminder access was refused.', details: {} } }), { status: 403 });
        return paged(state.notifications, { unread_count: state.notifications.filter(item => !item.read_at).length });
      }
      if (url.pathname === '/api/me/notification-preferences') {
        if (state.preferencesUnavailable) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Preferences are temporarily unavailable.', details: {} } }), { status: 503 });
        return reply({ in_app_reminders_enabled: true, version: '1' }, {}, { ETag: '"preferences-1"' });
      }
      if (url.pathname === '/api/me/alerts') return reply({ items: [], quiet: { active: false, until: null }, next_check_at: '2026-10-01T11:00:00Z', generated_at: '2026-10-01T10:00:00Z' });
      if (url.pathname === '/api/me/quiet-hours') return reply({ start: null, end: null, timezone: 'UTC', quiet: { active: false, until: null }, version: '0' }, {}, { ETag: `"alert-settings-${accountId}-0"` });
      const match = url.pathname.match(/^\/api\/conversations\/([^/]+)(\/messages|\/read)?$/);
      const conversation = match && conversations.find(item => item.id === match[1]);
      if (conversation && !match[2]) return reply(conversation);
      if (conversation && match[2] === '/messages' && method === 'GET') {
        const snapshot = state.messages[conversation.id].map(item => ({ ...item }));
        const after = url.searchParams.get('after');
        const before = url.searchParams.get('before');
        const range = after ? snapshot.filter(item => Number(item.position) > Number(after)) : before ? snapshot.filter(item => Number(item.position) < Number(before)) : snapshot;
        let response = paged(range);
        if (options.paging) {
          // Pages as the server does: the newest page, the page before a position, or the page after one.
          const limit = Number(url.searchParams.get('limit'));
          const rows = after ? range.slice(0, limit) : range.slice(-limit);
          const more = range.length > limit;
          const cursor = more ? (after ? rows[rows.length - 1] : rows[0]).position : null;
          response = reply(rows, { pagination: { next_cursor: cursor, has_more: more } });
        }
        if (state.holdNext) {
          state.holdNext = false; state.holding = true;
          return new Promise(resolve => { state.release = () => { state.holding = false; resolve(response); }; });
        }
        return response;
      }
      if (conversation && match[2] === '/read') {
        state.reads.push(body.through_position);
        conversation.read_position = body.through_position;
        conversation.unread_count = Number(conversation.last_position) - Number(conversation.read_position);
        return reply(conversation);
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, otherId, spaceId, chatId, otherChatId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(screen => window.renderLiveFixture(screen), options.screen ?? 'messages');
  await page.clock.runFor(0);
  try {
    await page.getByRole('heading', { name: options.screen === 'inbox' ? 'Inbox' : 'Messages', exact: true }).waitFor({ timeout: 10000 });
  } catch (error) {
    const observed = await page.evaluate(() => ({ text: document.body.innerText, calls: window.liveFixture.calls, unexpected: window.liveFixture.unexpected }));
    throw new Error(`${error.message}\n${JSON.stringify({ ...observed, errors })}`);
  }
  return { page, outbound, errors, pane: page.getByRole('region', { name: 'Conversation', exact: true }) };
}

async function connect(page) {
  await page.waitForFunction(() => window.liveFixture.streams.length === 1, null, { timeout: 10000 });
  await page.evaluate(() => window.liveFixture.send('ready', { heartbeat_seconds: 15, max_seconds: 1800 }));
  await page.clock.runFor(0);
  await page.waitForFunction(() => window.liveFixture.connected, null, { timeout: 10000 });
}

async function open(page, pane) {
  await page.getByRole('button', { name: /^Morgan family/ }).click();
  await pane.getByText('No messages yet.', { exact: true }).waitFor();
}

async function pollCount(page) {
  return page.evaluate(chat => window.liveFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages` && call.method === 'GET').length, chatId);
}

async function assertQuiet({ page, outbound, errors }) {
  assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.liveFixture.unexpected), []);
}

test('live chat: matching hints fetch new messages immediately and other conversations do not poll the open pane', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context);
    const { page, pane } = view;
    await connect(page); await open(page, pane);
    const before = await pollCount(page);
    await page.evaluate(({ chatId, otherChatId, spaceId }) => {
      window.liveFixture.addMessage('Dinner at seven', chatId);
      window.liveFixture.send('change', { kind: 'conversation', conversation_id: otherChatId, space_id: spaceId, reason: 'message' });
    }, { chatId, otherChatId, spaceId });
    await page.clock.runFor(100);
    assert.equal(await pollCount(page), before);
    assert.equal(await pane.getByText('Dinner at seven', { exact: true }).count(), 0);
    await page.evaluate(({ chatId, spaceId }) => window.liveFixture.send('change', { kind: 'conversation', conversation_id: chatId, space_id: spaceId, reason: 'message' }), { chatId, spaceId });
    await pane.getByText('Dinner at seven', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await pollCount(page), before + 1);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live reminders: notification hints refresh the header bell count', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context);
    const { page } = view;
    await connect(page);
    await page.getByRole('link', { name: 'Notification inbox', exact: true }).waitFor();
    await page.evaluate(() => {
      window.liveFixture.addReminder('Bring the plates');
      window.liveFixture.send('change', { kind: 'notifications', reason: 'delivered' });
    });
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await page.evaluate(() => window.liveFixture.permissionRequests), 0);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live inbox recovery: failed preferences offer a working Retry at 320 px and large text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const view = await fixture(context, { screen: 'inbox', failLive: true, preferencesUnavailable: true });
    const { page } = view;
    await page.clock.runFor(1000);
    const preferences = page.getByRole('region', { name: 'Preferences', exact: true });
    await preferences.getByRole('alert').filter({ hasText: 'Preferences are temporarily unavailable.' }).waitFor({ timeout: 3000 });
    assert.equal(await preferences.getByRole('checkbox', { name: 'In-app task reminders', exact: true }).count(), 0);
    const retry = preferences.getByRole('button', { name: 'Retry', exact: true });
    assert.equal(await retry.count(), 1, 'A failed preferences read needs its own Retry control');
    const bounds = await retry.evaluate(element => {
      const before = Number.parseFloat(getComputedStyle(element).fontSize);
      element.style.fontSize = `${before * 2}px`;
      const rectangle = element.getBoundingClientRect();
      return { left: rectangle.left, right: rectangle.right, height: rectangle.height, doubled: Number.parseFloat(getComputedStyle(element).fontSize) === before * 2 };
    });
    assert.equal(bounds.doubled, true);
    assert.ok(bounds.left >= 0 && bounds.right <= 320 && bounds.height >= 44);
    await page.screenshot({ path: path.join(root, '.local/screenshots/inbox-preferences-retry-320.png'), fullPage: true });
    await page.evaluate(() => { window.liveFixture.preferencesUnavailable = false; });
    await retry.click();
    await preferences.getByRole('checkbox', { name: 'In-app task reminders', exact: true }).waitFor();
    assert.equal(await preferences.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live inbox recovery: a denied refresh hides the previous unread badge and stops polling', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { screen: 'inbox', failLive: true });
    const { page } = view;
    await page.evaluate(() => window.liveFixture.addReminder('A previously readable reminder'));
    await page.clock.runFor(15000);
    await page.getByRole('heading', { name: 'A previously readable reminder', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor();
    await page.evaluate(() => { window.liveFixture.notificationsDenied = true; });
    await page.clock.runFor(15000);
    await page.getByRole('alert').filter({ hasText: 'Reminder access was refused.' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'A previously readable reminder', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).count(), 0, 'Denied reminders must not retain the previous unread badge');
    await page.getByRole('link', { name: 'Notification inbox', exact: true }).waitFor();
    const reads = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length);
    await page.clock.runFor(60000);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length), reads);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live inbox recovery: the bell on another screen also clears a denied count and stops polling', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { failLive: true });
    const { page } = view;
    await page.evaluate(() => window.liveFixture.addReminder('A private reminder count'));
    await page.clock.runFor(15000);
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor();
    await page.evaluate(() => { window.liveFixture.notificationsDenied = true; });
    await page.clock.runFor(15000);
    assert.equal(await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Notification inbox', exact: true }).waitFor();
    const reads = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length);
    await page.clock.runFor(60000);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length), reads);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live inbox efficiency: the open inbox shares its confirmed count with the bell without duplicate reads', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { screen: 'inbox', failLive: true });
    const { page } = view;
    await page.locator('button[aria-label="Refresh inbox"]:enabled').waitFor();
    const requests = () => page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length);
    assert.equal(await requests(), 1, 'The inbox and its bell must share the first confirmed read');
    await page.evaluate(() => window.liveFixture.addReminder('One shared inbox update'));
    await page.clock.runFor(15000);
    await page.getByRole('heading', { name: 'One shared inbox update', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor();
    assert.equal(await requests(), 2, 'One timer read must update both the list and its badge');
    await page.evaluate(() => window.renderLiveFixture('messages'));
    await page.clock.runFor(0);
    await page.getByRole('heading', { name: 'Messages', exact: true }).waitFor();
    await page.evaluate(() => window.liveFixture.addReminder('An update on another screen'));
    await page.clock.runFor(15000);
    await page.getByRole('link', { name: 'Notification inbox, 2 unread', exact: true }).waitFor();
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live reminders fallback: the inbox and bell refresh without a stream at 320 px and 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  try {
    const view = await fixture(context, { screen: 'inbox', failLive: true });
    const { page } = view;
    const before = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length);
    await page.evaluate(() => window.liveFixture.addReminder('Bring the plates'));
    await page.clock.runFor(14999);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length), before);
    await page.clock.runFor(1);
    await page.getByRole('heading', { name: 'Bring the plates', exact: true }).waitFor({ timeout: 3000 });
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor({ timeout: 3000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t106-inbox-320-100.png'), fullPage: true });
    const textScale = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement);
      const sizes = elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize));
      elements.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px`; });
      return elements.every((element, index) => Number.parseFloat(getComputedStyle(element).fontSize) === sizes[index] * 2);
    });
    assert.equal(textScale, true, 'Every rendered text size must actually double');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const titleFits = await page.getByRole('heading', { name: 'Bring the plates', exact: true }).evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth && element.scrollWidth <= element.clientWidth;
    });
    assert.equal(titleFits, true, 'The reminder title must remain visible without sideways scrolling');
    await page.screenshot({ path: path.join(root, '.local/screenshots/t106-inbox-320-200.png'), fullPage: true });
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live reminders fallback: healthy streams keep a slower sixty-second inbox and bell refresh', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { screen: 'inbox' });
    const { page } = view;
    await connect(page);
    const before = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length);
    await page.evaluate(() => window.liveFixture.addReminder('A reminder with a missed hint'));
    await page.clock.runFor(59999);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/notifications').length), before);
    await page.clock.runFor(1);
    await page.getByRole('heading', { name: 'A reminder with a missed hint', exact: true }).waitFor({ timeout: 3000 });
    await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).waitFor({ timeout: 3000 });
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live fallback: failed streams retain the five-second pane poll and fifteen-second list interval', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { failLive: true });
    const { page, pane } = view;
    await open(page, pane);
    const before = await pollCount(page);
    const listBefore = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length);
    await page.clock.runFor(4999);
    assert.equal(await pollCount(page), before);
    await page.clock.runFor(1);
    await page.waitForFunction(({ chat, count }) => window.liveFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages`).length === count, { chat: chatId, count: before + 1 });
    await page.clock.runFor(9999);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length), listBefore);
    await page.clock.runFor(1);
    await page.waitForFunction(count => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length === count, listBefore + 1);
    await page.evaluate(() => window.liveFixture.addMessage('A polling update'));
    await page.clock.runFor(5000);
    await pane.getByText('A polling update', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.liveFixture.connected), false);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live rate limit: a 15-minute cooldown survives remounting while chat polling works, then the stream reconnects', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { rateLimits: 1 });
    const { page, pane } = view;
    await open(page, pane);
    const liveCount = () => page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/live').length);
    assert.equal(await liveCount(), 1);
    assert.equal(await page.evaluate(() => window.liveFixture.connected), false);
    await page.evaluate(() => window.liveFixture.addMessage('Arrived during the live cooldown'));
    await page.clock.runFor(5000);
    await pane.getByText('Arrived during the live cooldown', { exact: true }).waitFor();
    await page.evaluate(() => { window.unmountLiveFixture(); window.renderLiveFixture(); });
    await page.clock.runFor(0);
    await page.getByRole('button', { name: /^Morgan family/ }).waitFor();
    assert.equal(await liveCount(), 1, 'Remounting must not bypass Retry-After');
    await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
    await page.clock.runFor(0);
    assert.equal(await liveCount(), 1, 'Network events must not bypass Retry-After');
    await page.clock.fastForward(894999);
    assert.equal(await liveCount(), 1, 'The first 899,999 ms must make no live retry');
    await page.clock.runFor(251);
    await page.waitForFunction(() => window.liveFixture.streams.length === 1);
    assert.equal(await liveCount(), 2);
    await connect(page);
    assert.equal(await page.evaluate(() => window.liveFixture.connected), true);
    assert.equal(await page.evaluate(() => window.liveFixture.streams.filter(stream => !stream.closed).length), 1);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live intervals: connected panes poll every thirty seconds and lists every sixty, then fall back on disconnect', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context);
    const { page, pane } = view;
    await connect(page); await open(page, pane);
    const before = await pollCount(page);
    const listBefore = await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length);
    await page.clock.runFor(29999);
    assert.equal(await pollCount(page), before);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length), listBefore);
    await page.clock.runFor(1);
    await page.waitForFunction(({ chat, count }) => window.liveFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages`).length === count, { chat: chatId, count: before + 1 });
    await page.clock.runFor(30000);
    await page.waitForFunction(count => window.liveFixture.calls.filter(call => call.route === '/api/conversations').length === count, listBefore + 1);
    await page.evaluate(() => window.liveFixture.send('end', { reason: 'signed_out' }));
    await page.waitForFunction(() => !window.liveFixture.connected);
    const disconnected = await pollCount(page);
    await page.clock.runFor(5000);
    await page.waitForFunction(({ chat, count }) => window.liveFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages`).length === count, { chat: chatId, count: disconnected + 1 });
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/live').length), 1);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live session recovery: a confirmed same-account sign-in resumes the open chat without replacing a healthy stream', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context);
    const { page, pane } = view;
    await connect(page);
    await open(page, pane);
    await page.evaluate(() => window.liveFixture.send('end', { reason: 'signed_out' }));
    await page.waitForFunction(() => !window.liveFixture.connected);
    await page.clock.runFor(1);
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/live').length), 1);
    await page.evaluate(() => window.liveFixture.refreshAccount());
    await page.waitForFunction(() => window.liveFixture.streams.length === 2, null, { timeout: 3000 });
    await page.evaluate(() => window.liveFixture.send('ready', { heartbeat_seconds: 15, max_seconds: 1800 }));
    await page.waitForFunction(() => window.liveFixture.connected);
    await page.evaluate(({ chatId, spaceId }) => {
      window.liveFixture.addMessage('A message after signing in again');
      window.liveFixture.send('change', { kind: 'conversation', conversation_id: chatId, space_id: spaceId, reason: 'message' });
    }, { chatId, spaceId });
    await pane.getByText('A message after signing in again', { exact: true }).waitFor({ timeout: 3000 });
    await page.clock.runFor(1);
    await page.evaluate(() => window.liveFixture.refreshAccount());
    assert.equal(await page.evaluate(() => window.liveFixture.calls.filter(call => call.route === '/api/live').length), 2);
    assert.equal(await page.evaluate(() => window.liveFixture.streams.filter(stream => !stream.closed).length), 1);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('live catch-up: hints and resync during a running poll queue only one additional poll', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context);
    const { page, pane } = view;
    await connect(page); await open(page, pane);
    const before = await pollCount(page);
    await page.evaluate(() => { window.liveFixture.holdNext = true; window.liveFixture.send('resync', {}); });
    await page.waitForFunction(() => window.liveFixture.holding);
    await page.evaluate(({ chatId, spaceId }) => {
      window.liveFixture.addMessage('Arrived during the poll');
      for (let index = 0; index < 3; index += 1) window.liveFixture.send('change', { kind: 'conversation', conversation_id: chatId, space_id: spaceId, reason: 'message' });
      window.liveFixture.send('resync', {});
    }, { chatId, spaceId });
    await page.clock.runFor(100);
    assert.equal(await pollCount(page), before + 1);
    await page.evaluate(() => window.liveFixture.release());
    await pane.getByText('Arrived during the poll', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await pollCount(page), before + 2);
    await page.waitForFunction(() => window.liveFixture.reads.length === 1);
    assert.deepEqual(await page.evaluate(() => window.liveFixture.reads), ['1']);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('T106 live chat: a deletion or edit of an earlier message already shown reaches that message', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { paging: true });
    const { page, pane } = view;
    await page.evaluate(() => { for (let index = 1; index <= 35; index += 1) window.liveFixture.addMessage(`Message ${index}`); });
    await connect(page);
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Message 35', { exact: true }).waitFor();
    assert.equal(await pane.getByText('Message 3', { exact: true }).count(), 0, 'The newest page holds messages 6 to 35.');
    await pane.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await pane.getByText('Message 3', { exact: true }).waitFor();
    const hint = reason => page.evaluate(({ chatId, spaceId, reason }) => window.liveFixture.send('change', { kind: 'conversation', conversation_id: chatId, space_id: spaceId, reason }), { chatId, spaceId, reason });
    // Sam deletes message 3, on the earlier page.
    let before = await pollCount(page);
    await page.evaluate(chat => Object.assign(window.liveFixture.messages[chat][2], { status: 'deleted', body: null, deleted_at: '2026-10-01T10:02:00Z', revision: 2 }), chatId);
    await hint('deleted');
    await pane.getByText('Message deleted', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await pane.getByText('Message 3', { exact: true }).count(), 0, 'A deleted message must not stay readable.');
    assert.equal(await pollCount(page), before + 2, 'The newest page, then the shown messages before it.');
    // Sam corrects message 4, on the same page.
    before = await pollCount(page);
    await page.evaluate(chat => Object.assign(window.liveFixture.messages[chat][3], { body: 'Message 4, corrected', edited_at: '2026-10-01T10:03:00Z', revision: 2 }), chatId);
    await hint('changed');
    await pane.getByText('Message 4, corrected', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await pollCount(page), before + 2);
    // A new message reads only the newest page, as before.
    before = await pollCount(page);
    await page.evaluate(() => window.liveFixture.addMessage('Message 36'));
    await hint('message');
    await pane.getByText('Message 36', { exact: true }).waitFor({ timeout: 3000 });
    await page.clock.runFor(100);
    assert.equal(await pollCount(page), before + 1);
    assert.equal(await pane.getByText('Message 1', { exact: true }).count(), 1, 'Earlier messages stay shown.');
    await assertQuiet(view);
  } finally { await context.close(); }
});

for (const recovery of ['timer', 'visibility']) test(`T106 recovery: ${recovery} refreshes loaded history without a live hint`, async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { paging: true });
    const { page, pane } = view;
    await page.evaluate(() => { for (let index = 1; index <= 35; index += 1) window.liveFixture.addMessage(`Message ${index}`); });
    await connect(page);
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Message 35', { exact: true }).waitFor();
    await pane.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await pane.getByText('Message 3', { exact: true }).waitFor();
    if (recovery === 'visibility') await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(chat => Object.assign(window.liveFixture.messages[chat][2], {
      status: 'deleted', body: null, deleted_at: '2026-10-01T10:02:00Z', revision: 2,
    }), chatId);
    const before = await pollCount(page);
    await page.clock.runFor(30_000);
    if (recovery === 'visibility') {
      assert.equal(await pollCount(page), before, 'Hidden chats do not poll or mark messages read.');
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    await pane.getByText('Message deleted', { exact: true }).waitFor({ timeout: 3000 });
    assert.equal(await pane.getByText('Message 3', { exact: true }).count(), 0);
    assert.equal(await pane.getByText('Message 1', { exact: true }).count(), 1);
    assert.equal(await pollCount(page), before + 2);
    assert.deepEqual(await page.evaluate(() => window.liveFixture.reads), ['35']);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('browser alerts: permission is requested only by turning on the labelled switch and the choice survives remounting', async () => {
  const context = await browser.newContext();
  try {
    const view = await fixture(context, { screen: 'inbox' });
    const { page } = view;
    const toggle = page.getByRole('switch', { name: alertsLabel, exact: true });
    await toggle.waitFor();
    assert.equal(await page.evaluate(() => window.liveFixture.permissionRequests), 0);
    assert.equal(await toggle.isChecked(), false);
    await toggle.check();
    await page.waitForFunction(() => window.liveFixture.permissionRequests === 1);
    assert.equal(await toggle.isChecked(), true);
    assert.deepEqual(await page.evaluate(() => [...window.liveFixture.storage]), [[`cp-browser-alerts:${accountId}`, 'on']]);
    await page.evaluate(() => { window.unmountLiveFixture(); window.renderLiveFixture('inbox'); });
    await toggle.waitFor();
    await page.waitForFunction(() => document.querySelector('input[role="switch"]')?.checked);
    assert.equal(await page.evaluate(() => window.liveFixture.permissionRequests), 1);
    assert.equal(await page.evaluate(() => window.liveFixture.streams.filter(stream => !stream.closed).length), 1);
    await toggle.uncheck();
    assert.deepEqual(await page.evaluate(() => [...window.liveFixture.storage]), []);
    await assertQuiet(view);
  } finally { await context.close(); }
});

test('browser alerts: denied permission stays off with a plain error and unsupported browsers show no switch', async () => {
  for (const supported of [true, false]) {
    const context = await browser.newContext();
    try {
      const view = await fixture(context, { screen: 'inbox', notificationsSupported: supported, permissionResult: 'denied' });
      const { page } = view;
      await page.getByRole('heading', { name: 'Preferences', exact: true }).waitFor();
      const toggle = page.getByRole('switch', { name: alertsLabel, exact: true });
      if (supported) {
        // The fixture refuses at once, so the switch is back off before a check() could see it on.
        await toggle.click();
        await page.getByRole('alert').filter({ hasText: 'Your browser did not allow alerts. Alerts are off.' }).waitFor();
        assert.equal(await toggle.isChecked(), false);
        assert.equal(await page.evaluate(() => window.liveFixture.permissionRequests), 1);
        assert.deepEqual(await page.evaluate(() => [...window.liveFixture.storage]), []);
      } else {
        assert.equal(await toggle.count(), 0);
        assert.equal(await page.evaluate(() => window.liveFixture.permissionRequests), 0);
      }
      await assertQuiet(view);
    } finally { await context.close(); }
  }
});

test('browser alerts: the labelled control fits desktop and 320px at actual 200 percent text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const view = await fixture(context, { screen: 'inbox' });
    const { page } = view;
    const toggle = page.getByRole('switch', { name: alertsLabel, exact: true });
    await toggle.waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '.local/screenshots/live-alerts-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    for (const scale of [1, 2]) {
      if (scale === 2) await page.evaluate(() => {
        const label = document.querySelector('input[role="switch"]').closest('label');
        const text = label.querySelector('span');
        const size = Number.parseFloat(getComputedStyle(text).fontSize);
        label.dataset.originalFontSize = String(size);
        label.querySelectorAll('span').forEach(element => { element.style.fontSize = `${Number.parseFloat(getComputedStyle(element).fontSize) * 2}px`; });
      });
      const bounds = await toggle.evaluate(input => {
        const label = input.closest('label');
        const text = label.querySelector('span');
        const rectangle = label.getBoundingClientRect();
        const inputBounds = input.getBoundingClientRect();
        const textBounds = text.getBoundingClientRect();
        return {
          left: rectangle.left, right: rectangle.right, width: rectangle.width, scrollWidth: label.scrollWidth,
          inputRight: inputBounds.right, textLeft: textBounds.left, textRight: textBounds.right,
          textSize: Number.parseFloat(getComputedStyle(text).fontSize), originalSize: Number(label.dataset.originalFontSize),
        };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= 320);
      assert.ok(bounds.scrollWidth <= Math.ceil(bounds.width));
      assert.ok(bounds.inputRight <= bounds.textLeft && bounds.textRight <= bounds.right);
      if (scale === 2) assert.equal(bounds.textSize, bounds.originalSize * 2);
      await page.screenshot({ path: path.join(root, `.local/screenshots/live-alerts-320-${scale * 100}.png`), fullPage: true });
    }
    await assertQuiet(view);
  } finally { await context.close(); }
});