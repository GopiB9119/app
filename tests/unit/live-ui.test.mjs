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
        import { notifyManager } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { MessagesScreen } from './src/features/messaging/messages-screen';
        import { NotificationScreen } from './src/features/notifications/notification-screen';
        import { useLiveConnected } from './src/features/realtime/live';
        import './src/app/globals.css';
        notifyManager.setScheduler(callback => queueMicrotask(callback));
        let root;
        function Probe() {
          const connected = useLiveConnected();
          useEffect(() => { window.liveFixture.connected = connected; }, [connected]);
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
      if (url.pathname === '/api/notifications') return paged(state.notifications, { unread_count: state.notifications.filter(item => !item.read_at).length });
      if (url.pathname === '/api/me/notification-preferences') return reply({ in_app_reminders_enabled: true, version: '1' }, {}, { ETag: '"preferences-1"' });
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
        const response = paged(range);
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
        await toggle.check();
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