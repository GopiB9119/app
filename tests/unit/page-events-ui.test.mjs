import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const viewerId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const eventId = '33333333-3333-4333-8333-333333333333';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { MyPageEvents, PageEvents } from './src/features/community/page-events';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderEvents = (viewer, page, language = 'en') => root.render(<Providers language={language}><PageEvents viewer={viewer} page={page} /></Providers>);
        window.renderMine = (account, language = 'en') => root.render(<Providers language={language}><MyPageEvents account={account} /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-page-events.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-page-events.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-page-events-dependencies', setup(builder) {
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
});
after(async () => { await browser?.close(); });

const created = '2026-10-06T06:00:00Z';
const page = (extra = {}) => ({
  id: pageId, handle: 'lake-friends', name: 'Lake Friends', description: '', rules: '', topic: 'community',
  classification: { other_topics: [], interests: [], languages: [], places: [], community_types: [], audiences: [], activities: [], content_kinds: [] },
  status: 'active', follower_count: 3, created_at: created, updated_at: created, following: true, blocked: false,
  can_manage: false, etag: null, limited: false, help_open: false, ...extra,
});
const pageEvent = (extra = {}) => ({
  id: eventId, page_id: pageId, page_handle: 'lake-friends', page_name: 'Lake Friends', title: 'Lake clean-up', description: 'Bring gloves.',
  location: null, location_hidden: true, location_public: false, timezone: 'Asia/Kolkata', local_start: '2026-10-25T18:30', local_end: '2026-10-25T20:00',
  starts_at: '2026-10-25T13:00:00Z', ends_at: '2026-10-25T14:30:00Z', status: 'scheduled', ended: false, going_count: 1, capacity: 20,
  going: false, can_manage: false, created_at: created, updated_at: created, schedule_changed_at: null, cancelled_at: null, etag: null, ...extra,
});

// A fake API that answers only the event routes and records every call; anything else is a test failure.
async function fixture(context, { viewer = true, shown = page(), events = [pageEvent()], language = 'en', mine = false } = {}) {
  await context.route('**/*', route => route.abort('blockedbyclient'));
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  tab.on('dialog', dialog => dialog.accept());
  await tab.setContent('<html><head><title>Offline events</title></head><body><div id="root"></div></body></html>');
  await tab.addStyleTag({ content: css });
  await tab.evaluate(({ events, pageId }) => {
    const state = window.eventsFixture = { calls: [], unexpected: [], events, sequence: 0 };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    const reply = data => new Response(JSON.stringify({ data, request_id: 'offline-events' }), { status: 200 });
    const update = (id, change) => { state.events = state.events.map(item => item.id === id ? { ...item, ...change(item) } : item); return state.events.find(item => item.id === id); };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ path: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === '/api/timezones') return reply(['UTC', 'Asia/Kolkata']);
      if (url.pathname === '/api/me/page-events') return reply(state.events.filter(item => item.going));
      if (url.pathname === `/api/pages/${pageId}/events` && method === 'GET') {
        return reply(url.searchParams.get('when') === 'past' ? [] : state.events);
      }
      if (url.pathname === `/api/pages/${pageId}/events` && method === 'POST') {
        const made = { ...state.events[0], id: '44444444-4444-4444-8444-444444444444', title: body.title, description: body.description,
          location: body.location || null, location_hidden: false, location_public: body.location_public, timezone: body.timezone,
          local_start: body.local_start, local_end: body.local_end, capacity: body.capacity ?? null, going_count: 0, going: false,
          can_manage: true, etag: '"event-new"' };
        state.events = [...state.events, made];
        return reply(made);
      }
      const route = url.pathname.match(/^\/api\/page-events\/([^/]+)(?:\/([a-z-]+))?$/);
      if (route && route[2] === 'going') return reply(update(route[1], item => ({ going: true, going_count: item.going_count + 1, location: '12 Lake Road', location_hidden: false })));
      if (route && route[2] === 'not-going') return reply(update(route[1], item => ({ going: false, going_count: item.going_count - 1, location: null, location_hidden: true })));
      if (route && route[2] === 'cancel') return reply(update(route[1], () => ({ status: 'cancelled', cancelled_at: '2026-10-06T07:00:00Z', etag: '"event-3"' })));
      if (route && route[2] === 'attendees') return reply([{ name: 'Asha', since: '2026-10-06T06:00:00Z' }]);
      if (route && !route[2] && method === 'PUT') return reply(update(route[1], () => ({ title: body.title, schedule_changed_at: '2026-10-06T07:00:00Z', etag: '"event-2"' })));
      state.unexpected.push(`${method} ${url.pathname}`);
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } }), { status: 404 });
    };
  }, { events, pageId });
  await tab.addScriptTag({ content: javascript });
  await tab.evaluate(({ viewer, shown, language, viewerId, mine }) => {
    const account = viewer ? { id: viewerId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'Asia/Kolkata', email_verified: true, version: 1 } : null;
    if (mine) window.renderMine(account, language);
    else window.renderEvents(account, shown, language);
  }, { viewer, shown, language, viewerId, mine });
  return { tab, errors, calls: () => tab.evaluate(() => window.eventsFixture.calls), unexpected: () => tab.evaluate(() => window.eventsFixture.unexpected) };
}

test('a visitor sees the event without its place and is asked to sign in', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, unexpected } = await fixture(context, { viewer: false });
    const card = tab.getByRole('article', { name: 'Lake clean-up' });
    await card.getByText('Sun, Oct 25, 2026, 18:30 to 20:00 (Asia/Kolkata)').waitFor();
    await card.getByText('The place is shown to people who are going.').waitFor();
    await card.getByText('1 of 20 going').waitFor();
    await card.getByText('Sign in to say you are going.').waitFor();
    assert.equal(await card.getByRole('button', { name: "I'm going" }).count(), 0);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a signed-in person says they are going, sees the place, and can change their mind', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, calls, unexpected } = await fixture(context);
    const card = tab.getByRole('article', { name: 'Lake clean-up' });
    await card.getByRole('button', { name: "I'm going" }).click();
    await card.getByText('You are going.').waitFor();
    await card.getByText('12 Lake Road').waitFor();
    await card.getByText('2 of 20 going').waitFor();
    await card.getByRole('button', { name: "I'm not going" }).click();
    await card.getByRole('button', { name: "I'm going" }).waitFor();
    assert.deepEqual((await calls()).filter(call => call.method === 'POST').map(call => call.path),
      [`/api/page-events/${eventId}/going`, `/api/page-events/${eventId}/not-going`]);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a page manager publishes, edits and cancels an event and sees who is going', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1200 } });
  try {
    const managed = pageEvent({ can_manage: true, etag: '"event-1"', location: '12 Lake Road', location_hidden: false });
    const { tab, errors, calls, unexpected } = await fixture(context, { shown: page({ can_manage: true, etag: '"page-1"' }), events: [managed] });
    await tab.getByRole('button', { name: 'New event' }).click();
    const form = tab.getByRole('form', { name: 'New event' });
    await form.getByLabel('Title').fill('Evening walk');
    await form.getByLabel('Starts').fill('2026-11-01T17:00');
    await form.getByLabel('Location', { exact: false }).fill('Gate 2, Lake Park');
    await form.getByRole('checkbox', { name: 'Show the place to everyone' }).check();
    await form.getByRole('button', { name: 'Publish event' }).click();
    await tab.getByRole('article', { name: 'Evening walk' }).waitFor();
    const posted = (await calls()).find(call => call.method === 'POST' && call.path === `/api/pages/${pageId}/events`);
    assert.equal(posted.headers['idempotency-key'], '00000000-0000-4000-8000-000000000001');
    assert.deepEqual({ ...posted.body }, {
      title: 'Evening walk', description: '', location: 'Gate 2, Lake Park', timezone: 'Asia/Kolkata', local_start: '2026-11-01T17:00',
      local_end: null, location_public: true,
    });
    const card = tab.getByRole('article', { name: 'Lake clean-up' });
    await card.getByRole('button', { name: 'Who is going' }).click();
    await card.getByText('Asha', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Edit event' }).click();
    const edit = tab.getByRole('form', { name: 'Edit event' });
    await edit.getByLabel('Title').fill('Lake clean-up and picnic');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    const changed = tab.getByRole('article', { name: 'Lake clean-up and picnic' });
    await changed.getByText('Time or place changed').waitFor();
    const put = (await calls()).find(call => call.method === 'PUT');
    assert.equal(put.headers['if-match'], '"event-1"');
    assert.equal(put.body.capacity, 20);
    await changed.getByRole('button', { name: 'Cancel event' }).click();
    await changed.getByText('Cancelled', { exact: true }).waitFor();
    assert.equal((await calls()).find(call => call.path.endsWith('/cancel')).headers['if-match'], '"event-2"');
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the person sees the events they are going to, with the page, time and a cancellation', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, unexpected } = await fixture(context, { mine: true, events: [
      pageEvent({ going: true, location: '12 Lake Road', location_hidden: false }),
      pageEvent({ id: '55555555-5555-4555-8555-555555555555', title: 'Night market', going: true, status: 'cancelled', cancelled_at: created, location_hidden: false }),
      pageEvent({ id: '66666666-6666-4666-8666-666666666666', title: 'Not mine' }),
    ] });
    await tab.getByRole('heading', { name: "Events you're going to" }).waitFor();
    assert.equal(await tab.getByRole('link', { name: 'Lake clean-up' }).getAttribute('href'), '/pages/lake-friends');
    await tab.getByText('Lake Friends · Sun, Oct 25, 2026, 18:30 to 20:00 (Asia/Kolkata)', { exact: true }).waitFor();
    await tab.getByText(/· Cancelled$/).waitFor();
    assert.equal(await tab.getByText('Not mine').count(), 0);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the events section fits 320 px with doubled text in Telugu', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  try {
    const { tab, errors, unexpected } = await fixture(context, { language: 'te', events: [pageEvent({ title: 'చెరువు శుభ్రత కార్యక్రమం' })] });
    await tab.getByRole('heading', { name: 'చెరువు శుభ్రత కార్యక్రమం' }).waitFor();
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const overflow = await tab.evaluate(() => [...document.querySelectorAll('article, button, p, h2, h3')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
    }).map(element => element.outerHTML.slice(0, 160)));
    assert.deepEqual(overflow, []);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
