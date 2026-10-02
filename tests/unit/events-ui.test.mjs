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
  const fixtureUrl = 'http://127.0.0.1:3000/offline-events';
  await context.route('**/*', route => {
    if (route.request().resourceType() === 'document' && route.request().url() === fixtureUrl) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><title>Offline events</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(route.request().url()); return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixtureUrl);
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
      ...options.event,
    };
    const state = window.eventsFixture = {
      calls: [], servedDetail: null, event, events: [event], byKey: {}, loseCreates: options.loseCreates ?? 0,
      holdNextDetail: false, held: null, heldSettled: false,
      holdSaves: options.holdSaves ?? false, releaseSave: null, failDetail: false,
      createError: options.createError ?? null,
      holdZones: options.holdZones ?? false, zoneUnavailable: options.zoneUnavailable ?? false, releaseZones: null,
    };
    const spaces = [[spaceId, 'Morgan family'], [clubId, 'Garden club']].map(([id, name]) => ({
      id, name, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created,
    }));
    state.spaces = spaces;
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-events', ...extra }), { status: 200 });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failed = (status, code, message, details = {}) => new Response(JSON.stringify({ error: { code, message, details }, request_id: 'offline-events' }), { status });
    const timezones = ['America/New_York', 'Asia/Kolkata', 'Europe/London', 'UTC'];
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged(spaces);
      if (url.pathname === '/api/timezones' && method === 'GET') {
        if (state.zoneUnavailable) return failed(503, 'UNAVAILABLE', 'Synthetic timezone outage.');
        if (state.holdZones) return new Promise(resolve => { state.releaseZones = () => { state.holdZones = false; resolve(reply(timezones)); }; });
        return reply(timezones);
      }
      const list = url.pathname.match(/^\/api\/spaces\/([^/]+)\/events$/);
      if (list && method === 'GET') {
        return paged(url.searchParams.get('when') === 'upcoming' ? state.events.filter(item => item.space_id === list[1]) : []);
      }
      if (list && method === 'POST') {
        if (state.createError) return failed(state.createError.status, state.createError.code, state.createError.message, state.createError.details);
        if (!timezones.includes(body.timezone)) return failed(422, 'VALIDATION_ERROR', 'Choose a supported time zone.');
        if (state.holdSaves) await new Promise(resolve => { state.releaseSave = resolve; });
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
        if (state.failDetail) return options.denyDetail
          ? failed(404, 'NOT_FOUND', 'Event not found.') : failed(503, 'UNAVAILABLE', 'Synthetic detail outage.');
        if (state.holdNextDetail) {
          // A held read answers with the event as it was when the read began, once released; aborting it rejects it.
          state.holdNextDetail = false;
          const before = { ...found, attendees: [] };
          return new Promise((resolve, reject) => {
            state.held = { release: () => { state.heldSettled = true; resolve(reply(before)); } };
            config.signal?.addEventListener('abort', () => { state.heldSettled = true; reject(new DOMException('Aborted', 'AbortError')); });
          });
        }
        state.servedDetail = found.etag;
        return reply({ ...found, attendees: [] });
      }
      if (found && detail[2] && method === 'GET') return reply({ event_id: found.id, minutes_before: null });
      if (found && !detail[2] && method === 'PATCH') {
        if (headers['if-match'] !== found.etag) return failed(412, 'EVENT_CHANGED', 'This event changed since you reviewed it. Reload to continue.');
        if (!timezones.includes(body.timezone)) return failed(422, 'VALIDATION_ERROR', 'Choose a supported time zone.');
        Object.assign(found, body, { etag: `"event-${Number(found.etag.slice(7, -1)) + 1}"` });
        return reply(found);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, spaceId, clubId, eventId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(id => window.renderEventsFixture(id), options.initialSpaceId ?? spaceId);
  await page.getByRole('button', { name: 'Picnic', exact: true }).waitFor();
  return { page, outbound, errors };
}

test('event draft: closing an unsaved form asks first and cancel keeps the exact fields', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Planning in progress');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.locator('button.icon-button').click();
    assert.equal(dialogs.length, 1, 'Closing a dirty form must ask before losing the draft');
    assert.match(dialogs[0], /unsaved/i);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Planning in progress');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: closing an unconfirmed create cannot silently discard its retry key', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep the original retry');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    await editor.locator('button.icon-button').click();
    assert.equal(dialogs.length, 1, 'Closing an unconfirmed create must warn about duplicates');
    assert.match(dialogs[0], /duplicate/i);
    await editor.getByRole('button', { name: 'Retry', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.deepEqual(creates[1], creates[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Keep the original retry').length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: switching Space while editing asks first and preserves the opened version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('My unsaved plan');
    await page.getByRole('combobox', { name: 'Space' }).selectOption(clubId);
    assert.equal(dialogs.length, 1, 'Editing must have the same navigation protection as creating');
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).inputValue(), spaceId);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'My unsaved plan');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await editor.waitFor({ state: 'detached' });
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].headers['if-match'], '"event-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: view switches and navigation links ask, but an empty form and confirmed discard can leave', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    const dismiss = dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); };
    page.on('dialog', dismiss);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('button', { name: 'Close form', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(dialogs.length, 0);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep my draft');
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    assert.equal(dialogs.length, 0, 'The already-selected view does not discard anything');
    await page.getByRole('button', { name: 'Past', exact: true }).click();
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    assert.equal(dialogs.length, 2);
    await page.evaluate(() => {
      const base = document.createElement('base'); base.href = 'https://offline.invalid/'; document.head.append(base);
    });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Spaces', exact: true }).click();
    assert.equal(dialogs.length, 3);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep my draft');
    const warnsOnUnload = () => page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    });
    assert.equal(await warnsOnUnload(), true);
    page.off('dialog', dismiss);
    page.once('dialog', dialog => dialog.accept());
    await editor.getByRole('button', { name: 'Close form', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await warnsOnUnload(), false);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), '');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: an active save disables navigation until the server confirms', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { holdSaves: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Save in progress');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => window.eventsFixture.releaseSave !== null);
    assert.equal(await editor.getByRole('button', { name: 'Close form', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Past', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Picnic', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), true);
    await page.evaluate(() => window.eventsFixture.releaseSave());
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: a failed background detail refresh keeps the draft and its original version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Draft through a refresh failure');
    await page.evaluate(() => { window.eventsFixture.failDetail = true; window.dispatchEvent(new Event('visibilitychange')); });
    await editor.getByRole('alert').filter({ hasText: 'Your draft is still here' }).waitFor();
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Draft through a refresh failure');
    await page.evaluate(() => { window.eventsFixture.failDetail = false; });
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await editor.waitFor({ state: 'detached' });
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].headers['if-match'], '"event-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: lost access hides the editor instead of keeping protected text on screen', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { denyDetail: true });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Protected unsaved draft');
    await page.evaluate(() => { window.eventsFixture.failDetail = true; window.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('alert').filter({ hasText: 'Event not found.' }).waitFor();
    assert.equal(await editor.count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Title', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: refreshing a reordered Space list cannot change the draft destination', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { initialSpaceId: '' });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Only for this Space');
    await editor.getByLabel('Starts', { exact: true }).fill('2026-10-12T18:30');
    await page.evaluate(() => window.eventsFixture.spaces.reverse());
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await page.waitForFunction(id => [...document.querySelectorAll('select[aria-label="Space"] option')][0]?.value === id, clubId);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).inputValue(), spaceId);
    assert.equal(await editor.getByRole('textbox', { name: 'Title', exact: true }).inputValue(), 'Only for this Space');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 1);
    assert.equal(creates[0].route, `/api/spaces/${spaceId}/events`);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: a missing selected Space never reuses its draft in another Space', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Private family draft');
    await page.evaluate(() => window.eventsFixture.spaces.splice(0, 1));
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'New event', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption(clubId);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    assert.equal(await editor.getByRole('textbox', { name: 'Title', exact: true }).inputValue(), '');
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: invalid fields are identified and focused without sending, and counters count whole characters', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    const title = editor.getByRole('textbox', { name: 'Title', exact: true });
    const starts = editor.getByLabel('Starts', { exact: true });
    await editor.getByRole('button', { name: 'Create event' }).click();
    assert.equal(await title.getAttribute('aria-invalid'), 'true');
    assert.equal(await starts.getAttribute('aria-invalid'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'title');
    assert.equal(await title.evaluate(element => document.getElementById(element.getAttribute('aria-describedby').split(' ').at(-1)).textContent), 'Enter a title.');
    await title.fill('x'.repeat(121));
    await starts.fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByText('Titles can have up to 120 characters.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await title.fill('\u{1f642}'.repeat(120));
    await editor.getByText('120 / 120 characters', { exact: true }).waitFor();
    assert.notEqual(await title.getAttribute('aria-invalid'), 'true');
    await editor.getByLabel('Ends (optional)', { exact: true }).fill('2026-10-12T17:00');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'local_end');
    await editor.getByText('The end must be after the start.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: a backend time refusal points at the field and keeps the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { createError: {
      status: 422, code: 'EVENT_IN_PAST', message: 'Choose a start time in the future.',
    } });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('My draft stays');
    const starts = editor.getByLabel('Starts', { exact: true });
    await starts.fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'local_start');
    assert.equal(await starts.getAttribute('aria-invalid'), 'true');
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'My draft stays');
    await editor.getByText('Choose a start time in the future.', { exact: true }).waitFor();
    await page.evaluate(() => { window.eventsFixture.createError = null; });
    await starts.fill('2026-10-13T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.notEqual(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: cards show the viewer time and an outdated response, dates follow language and Refresh reads again', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { event: {
      timezone: 'Asia/Kolkata', local_start: '2026-10-10T18:30', local_end: '2026-10-10T19:30',
      starts_at: '2026-10-10T13:00:00Z', ends_at: '2026-10-10T14:00:00Z',
      my_response: 'going', going: 1, my_response_outdated: true, schedule_changed_at: '2026-10-02T12:00:00Z',
    } });
    const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Picnic', exact: true }) });
    await card.getByText('Your response: Going (before the time changed)', { exact: true }).waitFor();
    await card.getByText(/^Starts .* your time \(UTC\)$/).waitFor();
    assert.ok((await card.getByRole('button', { name: 'Picnic', exact: true }).boundingBox()).height >= 44);
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('hi');
    await page.waitForFunction(() => document.documentElement.lang === 'hi');
    const expected = await page.evaluate(() => new Intl.DateTimeFormat('hi-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date('2026-10-10T00:00:00Z')));
    await card.getByText(expected, { exact: false }).waitFor();
    assert.equal(await card.getByText(/^Starts /).count(), 0);
    await page.getByRole('combobox').filter({ has: page.locator('option[value="en"]') }).selectOption('en');
    await page.evaluate(() => { window.eventsFixture.event.title = 'Updated picnic'; });
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await page.getByRole('button', { name: 'Updated picnic', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: validation and controls fit at 320px with 200% text', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 320, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.getByText('Check the highlighted fields.', { exact: true }).waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), 32);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const clipped = await editor.locator('label, input, select, textarea, button, p').evaluateAll(elements => elements.filter(element => {
      const box = element.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth;
    }).map(element => ({ tag: element.tagName, text: element.textContent })));
    assert.deepEqual(clipped, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/events-quality-validation-320-200.png'), fullPage: true });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Weekend picnic');
    await editor.getByLabel('Starts', { exact: true }).fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    await page.getByRole('region', { name: 'Weekend picnic', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: a browser alias uses the API name without changing the local time', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Timezone regression');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    const timezone = editor.getByRole('combobox', { name: 'Time zone', exact: true });
    assert.equal(await timezone.inputValue(), 'Asia/Kolkata');
    assert.deepEqual(await timezone.locator('option').evaluateAll(options => options.map(option => option.value)),
      ['America/New_York', 'Asia/Kolkata', 'Europe/London', 'UTC']);
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 1);
    assert.equal(creates[0].body.timezone, 'Asia/Kolkata');
    assert.equal(creates[0].body.local_start, '2026-10-12T18:30');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: loading blocks submission without dropping the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context, { holdZones: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep this draft');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await page.waitForFunction(() => window.eventsFixture.releaseZones !== null);
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isDisabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).isDisabled(), true);
    await editor.evaluate(form => form.requestSubmit());
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await page.evaluate(() => window.eventsFixture.releaseZones());
    await page.waitForFunction(() => document.querySelector('form select').value === 'Asia/Kolkata');
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep this draft');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isEnabled(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: failed list has Retry at 320 px and 200% text and keeps the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta', viewport: { width: 320, height: 900 } });
  try {
    const { page, outbound, errors } = await fixture(context, { zoneUnavailable: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep this draft');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    const failure = editor.getByRole('alert').filter({ hasText: 'The list of timezones did not load' });
    await failure.waitFor();
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isDisabled(), true);
    await editor.evaluate(form => form.requestSubmit());
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    const bounds = await failure.evaluate(element => {
      const box = element.getBoundingClientRect();
      const retry = element.querySelector('button').getBoundingClientRect();
      return { left: box.left, right: box.right, retryLeft: retry.left, retryRight: retry.right, font: parseFloat(getComputedStyle(element).fontSize) };
    });
    assert.ok(bounds.font >= 28, JSON.stringify(bounds));
    assert.ok(bounds.left >= 0 && bounds.right <= 320 && bounds.retryLeft >= 0 && bounds.retryRight <= 320, JSON.stringify(bounds));
    await failure.screenshot({ path: path.join(root, '.local/screenshots/event-timezone-list-error-320-200.png') });
    await page.evaluate(() => { window.eventsFixture.zoneUnavailable = false; });
    await failure.getByRole('button', { name: 'Retry', exact: true }).click();
    await failure.waitFor({ state: 'detached' });
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep this draft');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).inputValue(), 'Asia/Kolkata');
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isEnabled(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: an unconfirmed create retries its exact body during a list outage', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Created once');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    const retry = editor.locator('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('form button[type="submit"]').textContent === 'Retry');
    await page.evaluate(() => { window.eventsFixture.zoneUnavailable = true; window.dispatchEvent(new Event('visibilitychange')); });
    await editor.getByRole('alert').filter({ hasText: 'The list of timezones did not load' }).waitFor();
    assert.equal(await retry.isEnabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).isDisabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).inputValue(), 'Asia/Kolkata');
    await retry.click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.equal(creates[0].body.timezone, 'Asia/Kolkata');
    assert.deepEqual(creates[1], creates[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Created once').length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

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
// A read that began before a save must not undo it when its older answer arrives afterwards (T87).
test('event detail: a save is not undone by an older read that answers after it', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).waitFor();
    await page.evaluate(() => { window.eventsFixture.holdNextDetail = true; });
    // Returning to the window refetches the event; that read is held.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.eventsFixture.held !== null);
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic and games');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('heading', { level: 2, name: 'Picnic and games', exact: true }).waitFor();
    await page.evaluate(() => window.eventsFixture.held.release());
    await page.waitForFunction(() => window.eventsFixture.heldSettled);
    const reverted = await page.waitForFunction(() => [...document.querySelectorAll('h2')].some(element => element.textContent === 'Picnic'), null, { timeout: 1500 }).then(() => true, () => false);
    assert.equal(reverted, false, 'The older read must not replace the saved event.');
    // Editing again starts from the saved version, so the next change is not refused.
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic, games and music');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('heading', { level: 2, name: 'Picnic, games and music', exact: true }).waitFor();
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').map(call => call.headers['if-match']));
    assert.deepEqual(saves, ['"event-1"', '"event-2"']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});