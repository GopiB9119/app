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
const familySpaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const clubSpaceId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const familyChatId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const clubChatId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const lostRetry = 'Not confirmed. Retry sends this same message once.';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { MessagesScreen } from './src/features/messaging/messages-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderMessagingFixture = () => root.render(<Providers><MessagesScreen initialSpaceId="" /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-messaging.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-messaging.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-messaging-dependencies', setup(builder) {
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
  await page.setContent('<html><head><title>Offline messages</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, otherId, chats, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const conversations = chats.map(chat => ({
      id: chat.id, space_id: chat.spaceId, space_name: chat.title, kind: 'space', title: chat.title, participants: [],
      can_send: true, protection: 'server_encrypted', last_position: '0', read_position: '0', unread_count: 0,
      last_message_at: null, created_at: '2026-09-19T10:00:00Z',
    }));
    const messages = Object.fromEntries(conversations.map(item => [item.id, []]));
    if (options.unread) {
      const family = conversations[0];
      for (const [position, body] of [[1, 'Dinner at seven'], [2, 'Bring the plates']]) {
        messages[family.id].push({
          id: crypto.randomUUID(), conversation_id: family.id, position: String(position), sender_account_id: otherId,
          sender_name: 'Sam Rivera', mine: false, client_message_id: null, status: 'sent', body,
          created_at: `2026-09-19T10:0${position}:00Z`, deleted_at: null,
        });
      }
      Object.assign(family, { last_position: '2', unread_count: 2, last_message_at: '2026-09-19T10:02:00Z' });
    }
    const state = window.messagingFixture = {
      calls: [], conversations, messages, failSends: options.failSends ?? 0, failReads: options.failReads ?? 0,
    };
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-messaging', ...extra }), { status: 200 });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-messaging' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') return paged([]);
      if (url.pathname === '/api/conversations' && method === 'GET') {
        return paged(state.conversations, { unread_count: state.conversations.reduce((sum, item) => sum + item.unread_count, 0) });
      }
      const match = url.pathname.match(/^\/api\/conversations\/([^/]+)(\/messages|\/read)?$/);
      const conversation = match && state.conversations.find(item => item.id === match[1]);
      if (match && !conversation) return failed(404, 'NOT_FOUND', 'Conversation not found.');
      if (conversation && !match[2] && method === 'GET') return reply(conversation);
      if (conversation && match[2] === '/messages' && method === 'GET') return paged(state.messages[conversation.id]);
      if (conversation && match[2] === '/messages' && method === 'POST') {
        if (state.failSends > 0) { state.failSends -= 1; throw new TypeError('Synthetic connection loss before the server'); }
        const key = headers['idempotency-key'];
        const existing = state.messages[conversation.id].find(item => item.client_message_id === key);
        if (existing) return reply(existing);
        const position = String(Number(conversation.last_position) + 1);
        const saved = {
          id: crypto.randomUUID(), conversation_id: conversation.id, position, sender_account_id: accountId,
          sender_name: 'Alex Morgan', mine: true, client_message_id: key, status: 'sent', body: body.body,
          created_at: '2026-09-19T10:05:00Z', deleted_at: null,
        };
        state.messages[conversation.id].push(saved);
        Object.assign(conversation, { last_position: position, read_position: position, last_message_at: saved.created_at });
        return reply(saved);
      }
      if (conversation && match[2] === '/read' && method === 'POST') {
        if (state.failReads > 0) { state.failReads -= 1; throw new TypeError('Synthetic lost read receipt'); }
        conversation.read_position = body.through_position;
        conversation.unread_count = Number(conversation.last_position) - Number(body.through_position);
        return reply(conversation);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, {
    accountId, otherId, options,
    chats: [{ id: familyChatId, spaceId: familySpaceId, title: 'Morgan family' }, { id: clubChatId, spaceId: clubSpaceId, title: 'Garden club' }],
  });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderMessagingFixture());
  await page.getByRole('button', { name: /^Morgan family/ }).waitFor();
  return { page, outbound, errors, pane: page.getByRole('region', { name: 'Conversation', exact: true }) };
}

test('offline chat keeps an unconfirmed send and its retry across conversation switches', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { failSends: 1 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await pane.getByLabel('Message', { exact: true }).fill('  Dinner at seven\n');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText(lostRetry, { exact: true }).waitFor();

    await page.getByRole('button', { name: /^Garden club/ }).click();
    await pane.getByRole('heading', { name: 'Garden club', exact: true }).waitFor();
    assert.equal(await pane.getByText(lostRetry, { exact: true }).count(), 0, 'Another conversation must not show the unconfirmed send.');
    await page.screenshot({ path: path.join(root, '.local/screenshots/messaging-offline-unconfirmed.png'), fullPage: true });

    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await pane.getByText(lostRetry, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /^Morgan family/ }).filter({ hasText: 'Not confirmed' }).waitFor();
    await pane.getByRole('button', { name: 'Retry', exact: true }).click();
    await pane.getByRole('button', { name: 'Delete message for everyone', exact: true }).waitFor();
    await pane.getByText(lostRetry, { exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Morgan family/ }).filter({ hasText: 'Not confirmed' }).waitFor({ state: 'detached' });

    const observed = await page.evaluate(chat => ({
      sends: window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages` && call.method === 'POST'),
      stored: window.messagingFixture.messages[chat],
    }), familyChatId);
    assert.equal(observed.sends.length, 2);
    assert.equal(observed.sends[0].headers['idempotency-key'], observed.sends[1].headers['idempotency-key']);
    assert.deepEqual(observed.sends[0].body, { body: 'Dinner at seven' });
    assert.deepEqual(observed.sends[1].body, observed.sends[0].body);
    assert.deepEqual(observed.stored.map(item => item.body), ['Dinner at seven']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline chat retries a read receipt that failed', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { unread: true, failReads: 1 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Bring the plates', { exact: true }).waitFor();
    await page.waitForFunction(chat => window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/read`).length >= 2,
      familyChatId, { timeout: 20000 });
    const observed = await page.evaluate(chat => ({
      reads: window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/read`).map(call => call.body),
      conversation: window.messagingFixture.conversations.find(item => item.id === chat),
    }), familyChatId);
    assert.deepEqual(observed.reads.slice(0, 2), [{ through_position: '2' }, { through_position: '2' }]);
    assert.equal(observed.conversation.read_position, '2');
    assert.equal(observed.conversation.unread_count, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
