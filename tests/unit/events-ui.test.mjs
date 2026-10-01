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
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const clubId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const eventId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { EventsScreen } from './src/features/events/events-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderEventsFixture = spaceId => root.render(<Providers><EventsScreen initialSpaceId={spaceId} /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-events.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-events.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-events-dependencies', setup(builder) {
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

// Two Spaces; the first has one upcoming event the person manages. Saves are refused unless If-Match names the stored
// version, and creation is idempotent by its key, as the API does. `loseCreates` saves an event but loses the response.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline events</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, clubId, eventId, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const created = '2026-09-19T10:00:00Z';
    const event = {
      id: eventId, space_id: spaceId, space_name: 'Morgan family', title: 'Picnic', description: 'Bring a blanket.', location: 'Riverside park',
      timezone: 'UTC', local_start: '2026-10-10T12:00', local_end: null, starts_at: '2026-10-10T12:00:00Z', ends_at: null,
      status: 'scheduled', ended: false, created_by_name: 'Alex Morgan', created_at: created, updated_at: created,
      schedule_changed_at: null, cancelled_at: null, going: 0, maybe: 0, not_going: 0, my_response: null, my_response_outdated: false,
      can_manage: true, can_respond: true, etag: '"event-1"',
    };
    const state = window.eventsFixture = { calls: [], servedDetail: null, event, events: [event], byKey: {}, loseCreates: options.loseCreates ?? 0 };
    const spaces = [[spaceId, 'Morgan family'], [clubId, 'Garden club']].map(([id, name]) => ({
      id, name, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created,
    }));
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-events', ...extra }), { status: 200 });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-events' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged(spaces);
      const list = url.pathname.match(/^\/api\/spaces\/([^/]+)\/events$/);
      if (list && method === 'GET') {
        return paged(url.searchParams.get('when') === 'upcoming' ? state.events.filter(item => item.space_id === list[1]) : []);
      }
      if (list && method === 'POST') {
        const key = headers['idempotency-key'];
        if (!state.byKey[key]) {
          const space = spaces.find(item => item.id === list[1]);
          state.byKey[key] = {
            ...event, ...body, id: crypto.randomUUID(), space_id: space.id, space_name: space.name, starts_at: `${body.local_start}:00Z`,
            ends_at: null, local_end: null, etag: '"event-new-1"',
          };
          state.events.push(state.byKey[key]);
          if (state.loseCreates > 0) { state.loseCreates -= 1; throw new TypeError('Synthetic lost response after the event was saved'); }
        }
        return reply(state.byKey[key]);
      }
      const detail = url.pathname.match(/^\/api\/events\/([^/]+)(\/alert)?$/);
      const found = detail && state.events.find(item => item.id === detail[1]);
      if (found && !detail[2] && method === 'GET') {
        state.servedDetail = found.etag;
        return reply({ ...found, attendees: [] });
      }
      if (found && detail[2] && method === 'GET') return reply({ event_id: found.id, minutes_before: null });
      if (found && !detail[2] && method === 'PATCH') {
        if (headers['if-match'] !== found.etag) return failed(412, 'EVENT_CHANGED', 'This event changed since you reviewed it. Reload to continue.');
        Object.assign(found, body, { etag: `"event-${Number(found.etag.slice(7, -1)) + 1}"` });
        return reply(found);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, spaceId, clubId, eventId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(id => window.renderEventsFixture(id), spaceId);
  await page.getByRole('button', { name: 'Picnic', exact: true }).waitFor();
  return { page, outbound, errors };
}

test('event editor saves against the version it opened with, so a change made while editing is refused', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.waitFor();

    // Another device moves the event, then this tab regains focus and refetches every query.
    await page.evaluate(() => Object.assign(window.eventsFixture.event, { location: 'North lawn', etag: '"event-2"' }));
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.getByText('North lawn', { exact: true }).waitFor();
    await page.waitForFunction(() => window.eventsFixture.servedDetail === '"event-2"');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));

    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic and games');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    await page.waitForFunction(() => window.eventsFixture.calls.some(call => call.method === 'PATCH'));
    const sent = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"event-1"', 'The save must name the version the editor showed.');
    await editor.getByText('This event changed since you reviewed it. Reload to continue.').waitFor();
    await editor.getByRole('button', { name: 'Reload event' }).waitFor();
    const stored = await page.evaluate(() => window.eventsFixture.event);
    assert.equal(stored.location, 'North lawn', 'The newer location must not be reverted.');
    assert.equal(stored.title, 'Picnic');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an unconfirmed new event keeps its retry: leaving asks first, and Retry creates it once', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Seed swap');
    await editor.getByLabel('Starts').fill('2026-10-12T10:00');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByRole('button', { name: 'Retry', exact: true }).waitFor();

    await page.getByRole('combobox', { name: 'Space' }).selectOption(clubId);
    assert.equal(dialogs.length, 1, 'Changing Space must ask before dropping an unconfirmed event.');
    assert.match(dialogs[0], /duplicate/);
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).inputValue(), spaceId);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    assert.equal(dialogs.length, 2, 'Opening another event must ask too.');
    await editor.getByRole('button', { name: 'Retry', exact: true }).click();
    await editor.waitFor({ state: 'detached' });

    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.equal(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key'], 'Retry must reuse the original key.');
    const stored = await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Seed swap').length);
    assert.equal(stored, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});