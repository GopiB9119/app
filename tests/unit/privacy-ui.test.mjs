// The privacy page (T164, DEC-034): what a person has allowed, and taking each permission back, offline.
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
const samId = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { PrivacyScreen } from './src/features/identity/privacy-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        function Fixture() {
          const client = useQueryClient();
          React.useEffect(() => {
            window.refreshPrivacyRequests = () => client.invalidateQueries({ queryKey: ['privacy', 'requests'] });
          }, [client]);
          return <PrivacyScreen />;
        }
        window.renderPrivacyFixture = (language = 'en') => root.render(<Providers language={language}><Fixture /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-privacy.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-privacy.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-privacy-dependencies', setup(builder) {
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

async function fixture(context, truncated = null, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline privacy</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, samId, spaceId, truncated, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const future = new Date(Date.now() + 2 * 86400000);
    const at = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const local = `${at(future).slice(0, 16)}:00`;
    const person = (id, name) => ({ account_id: id, display_name: name });
    const request = (id, reminderId, title) => ({
      id, task_id: crypto.randomUUID(), space_id: spaceId, task_title: title, task_version: '1',
      requested_by: person(samId, 'Sam Rivera'), recipient: person(accountId, 'Alex Morgan'), local_time: local, timezone: 'UTC',
      scheduled_at: at(future), dispatch_expires_at: at(new Date(future.getTime() + 3600000)), expires_at: at(new Date(future.getTime() - 3600000)),
      created_at: '2026-09-19T10:00:00Z', resolved_at: '2026-09-19T11:00:00Z', status: 'accepted', source_changed: false,
      reminder_id: reminderId, version: '2', channel: 'in_app',
    });
    const reminder = (id, title, status) => ({
      id, task_id: crypto.randomUUID(), space_id: spaceId, task_title: title, local_time: local, timezone: 'UTC',
      scheduled_at: at(future), expires_at: at(new Date(future.getTime() + 3600000)), status, reason: null, source_changed: false,
      acknowledged_at: null, version: '1', channel: 'in_app',
    });
    const state = window.privacyFixture = {
      calls: [],
      failure: null,
      cancelResponse: options.cancelResponse ?? null,
      requests: [request(crypto.randomUUID(), '11111111-1111-4111-8111-111111111111', 'Water the plants'), request(crypto.randomUUID(), '22222222-2222-4222-8222-222222222222', 'Old chore')],
      reminders: [reminder('11111111-1111-4111-8111-111111111111', 'Water the plants', 'scheduled'), reminder('22222222-2222-4222-8222-222222222222', 'Old chore', 'cancelled')],
      preferences: { in_app_reminders_enabled: true, version: '1' },
      memories: [
        { id: crypto.randomUUID(), kind: 'note', key: null, label: 'Note', content: 'The plumber comes on Fridays', source: 'conversation', source_run_id: null, created_at: '2026-09-20T09:00:00Z' },
        { id: crypto.randomUUID(), kind: 'preference', key: 'language', label: 'Language', content: 'Answers in Telugu', source: 'conversation', source_run_id: null, created_at: '2026-09-21T09:00:00Z' },
      ],
      interests: { topics: ['gardening', 'cooking'], interests: [], languages: ['te'], places: [], etag: '"interests-1"' },
    };
    if (options.emptyAccepted) state.requests = state.requests.map(item => ({ ...item, status: 'declined', reminder_id: null }));
    const reply = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-privacy', ...extra }), { status: 200, headers });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, search: url.search, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (state.failure?.route === url.pathname) {
        const status = state.failure.status ?? 403;
        return new Response(JSON.stringify({ error: { code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'FORBIDDEN', message: 'Permission scan unavailable.', details: {} }, request_id: 'offline-privacy' }), { status });
      }
      if (url.pathname === `/api/${truncated}`) {
        const pageNumber = Number(url.searchParams.get('cursor') ?? '0');
        if (pageNumber < (options.pages ?? 11) - 1) {
          let data = truncated === 'reminder-requests'
            ? [{ ...state.requests[0], id: crypto.randomUUID(), status: 'declined', reminder_id: null }]
            : [{ ...state.reminders[1], id: crypto.randomUUID() }];
          if (pageNumber === 0 && options.includeMatch) {
            data = [...(truncated === 'reminder-requests' ? state.requests : [state.reminders[0]]), ...data];
          }
          if (pageNumber === 0 && options.allMatches) data = state.reminders;
          return reply(data, { pagination: { next_cursor: String(pageNumber + 1), has_more: true } });
        }
      }
      if (url.pathname === '/api/reminder-requests') return paged(state.requests);
      if (url.pathname === '/api/reminders') return paged(state.reminders);
      const cancel = url.pathname.match(/^\/api\/reminders\/([^/]+)\/cancel$/);
      if (cancel && method === 'POST') {
        const target = state.reminders.find(item => item.id === cancel[1]);
        if (state.cancelResponse === 'wrong-id') return reply({ ...target, id: state.reminders[1].id, status: 'cancelled' });
        if (state.cancelResponse === 'scheduled') return reply(target);
        target.status = 'cancelled';
        return reply(target);
      }
      if (url.pathname === '/api/me/notification-preferences') {
        if (method === 'PATCH' && headers['if-match'] !== `"${state.preferences.version}"`) {
          return new Response(JSON.stringify({ error: { code: 'PRECONDITION_FAILED', message: 'Notification preferences changed. Reload and review.', details: {} } }), { status: 412 });
        }
        if (method === 'PATCH') state.preferences = { in_app_reminders_enabled: body.in_app_reminders_enabled, version: String(Number(state.preferences.version) + 1) };
        return reply(state.preferences, {}, { ETag: `"${state.preferences.version}"` });
      }
      if (url.pathname === '/api/agent-memories') return reply(state.memories);
      const memory = url.pathname.match(/^\/api\/agent-memories\/([^/]+)$/);
      if (memory && method === 'DELETE') {
        state.memories = state.memories.filter(item => item.id !== memory[1]);
        return reply({ id: memory[1], status: 'deleted' });
      }
      if (url.pathname === '/api/me/interests') {
        if (method === 'PUT') state.interests = { ...body, etag: '"interests-2"' };
        return reply(state.interests);
      }
      if (url.pathname === '/api/me/security-events') return reply([
        { id: crypto.randomUUID(), action: 'session.created', created_at: '2026-09-22T08:00:00Z' },
        { id: crypto.randomUUID(), action: 'profile.updated', created_at: '2026-09-21T08:00:00Z' },
      ]);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, samId, spaceId, truncated, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(language => window.renderPrivacyFixture(language), options.language ?? 'en');
  await page.getByRole('heading', { level: 1 }).waitFor();
  return { page, outbound, errors };
}

async function doubleText(page) {
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
}

async function takeBack(page, name) {
  await page.getByRole('button', { name: `Take back: ${name}`, exact: true }).click();
  const confirmation = page.getByRole('group', { name: 'Take this back?' });
  await confirmation.getByText(name, { exact: true }).waitFor();
  await confirmation.getByRole('button', { name: 'Take back', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Taken back.' }).waitFor();
}

test('the privacy page lists what was allowed and takes each permission back through its own operation', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByText('Sam Rivera may remind you about "Water the plants"', { exact: false }).waitFor();
    assert.equal(await page.getByText('Old chore', { exact: false }).count(), 0, 'A cancelled reminder is no longer a standing permission.');
    await page.getByText('The plumber comes on Fridays', { exact: true }).waitFor();
    await page.getByText('3 chosen topics, interests, languages and places.', { exact: true }).waitFor();
    await page.getByText('Signed in', { exact: false }).first().waitFor();

    // Keeping it changes nothing.
    await page.getByRole('button', { name: 'Take back: Water the plants', exact: true }).click();
    await page.getByRole('group', { name: 'Take this back?' }).getByRole('button', { name: 'Keep', exact: true }).click();
    assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 0);

    await takeBack(page, 'Water the plants');
    await page.getByText('Sam Rivera may remind you about', { exact: false }).waitFor({ state: 'detached' });
    await takeBack(page, 'The plumber comes on Fridays');
    await page.getByText('The plumber comes on Fridays', { exact: true }).waitFor({ state: 'detached' });
    await page.getByText('Answers in Telugu', { exact: true }).waitFor();
    await takeBack(page, 'Reminders in your inbox');
    await page.getByText('Reminders are turned off. Turn them on again under Reminders.', { exact: true }).waitFor();
    await takeBack(page, 'Interests used for page and post suggestions');
    await page.getByRole('region', { name: 'Interests used for page and post suggestions' }).getByText('Nothing to show here.', { exact: true }).waitFor();

    const changes = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').map(({ route, method, body, headers }) => ({ route, method, body, match: headers['if-match'] ?? null })));
    assert.deepEqual(changes.map(change => `${change.method} ${change.route.replace(/[0-9a-f-]{36}/g, 'ID')}`), [
      'POST /api/reminders/ID/cancel', 'DELETE /api/agent-memories/ID', 'PATCH /api/me/notification-preferences', 'PUT /api/me/interests',
    ]);
    assert.deepEqual(changes[2].body, { in_app_reminders_enabled: false });
    assert.equal(changes[2].match, '"1"');
    assert.deepEqual(changes[3].body, { topics: [], interests: [], languages: [], places: [] });
    assert.equal(changes[3].match, '"interests-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const truncated of ['reminder-requests', 'reminders']) {
  test(`truncated permission scan of ${truncated} does not claim the list is empty`, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    try {
      const { page, outbound, errors } = await fixture(context, truncated);
      const section = page.getByRole('region', { name: 'Reminders other members may send you' });
      await page.waitForFunction(route => window.privacyFixture.calls.filter(call => call.route === route).length === 10, `/api/${truncated}`);
      await section.getByText('Loading your permissions...', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await section.getByText('Nothing to show here.', { exact: true }).count(), 0,
        'An unfinished scan cannot establish that there are no standing permissions.');
      await section.getByRole('status').filter({ hasText: 'Some reminder permissions have not been checked.' }).waitFor();
      assert.equal(await section.getByRole('link', { name: 'Manage reminders', exact: true }).getAttribute('href'), '/app/reminders');
      const calls = await page.evaluate(() => window.privacyFixture.calls);
      assert.equal(calls.filter(call => call.route === `/api/${truncated}`).length, 10);
      assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const endpoint of ['reminder-requests', 'reminders']) {
  test(`a completed tenth ${endpoint} page does not report an incomplete scan`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, endpoint, { pages: 10 });
      const section = page.getByRole('region', { name: 'Reminders other members may send you' });
      await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
      assert.equal(await section.getByRole('status').count(), 0);
      assert.equal(await section.getByRole('link').count(), 0);
      assert.equal(await page.evaluate(route => window.privacyFixture.calls.filter(call => call.route === route).length, `/api/${endpoint}`), 10);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test(`known permissions stay cancellable during a partial ${endpoint} scan`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, endpoint, { includeMatch: true });
      const section = page.getByRole('region', { name: 'Reminders other members may send you' });
      await section.getByRole('status').filter({ hasText: 'Some reminder permissions have not been checked.' }).waitFor();
      await takeBack(page, 'Water the plants');
      await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor({ state: 'detached' });
      await section.getByRole('link', { name: 'Manage reminders', exact: true }).waitFor();
      const changes = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET'));
      assert.equal(changes.length, 1);
      assert.equal(changes[0].route, '/api/reminders/11111111-1111-4111-8111-111111111111/cancel');
      assert.equal(changes[0].headers['x-account-id'], accountId);
      assert.equal(await page.evaluate(() => window.privacyFixture.reminders[0].status), 'cancelled');
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('matching all requested reminders ends the scan before unrelated pages', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, 'reminders', { allMatches: true });
    const section = page.getByRole('region', { name: 'Reminders other members may send you' });
    await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
    assert.equal(await section.getByRole('status').count(), 0);
    assert.equal(await section.getByRole('link').count(), 0);
    assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.route === '/api/reminders').length), 1);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a complete request history without accepted permissions needs no reminder scan', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, null, { emptyAccepted: true });
    const section = page.getByRole('region', { name: 'Reminders other members may send you' });
    await section.getByText('Nothing to show here.', { exact: true }).waitFor();
    assert.equal(await section.getByRole('status').count(), 0);
    assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.route === '/api/reminders').length), 0);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [language, script] of [['en', /Manage reminders/u], ['te', /[\u0C00-\u0C7F]/u], ['hi', /[\u0900-\u097F]/u]]) {
  test(`partial permission recovery is reachable in ${language} at 320 px and 200% text`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    try {
      const { page, outbound, errors } = await fixture(context, 'reminder-requests', { includeMatch: true, language });
      const section = page.locator('section[aria-labelledby="privacy-requests"]');
      const link = section.getByRole('link');
      await link.waitFor();
      assert.match(await link.textContent(), script);
      assert.equal(await link.getAttribute('href'), '/app/reminders');
      const originalSize = await link.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await doubleText(page);
      assert.equal(await link.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      await link.scrollIntoViewIfNeeded();
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate(element => element === document.activeElement), true);
      const box = await link.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await link.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
      }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/privacy-incomplete-${language}-320-200.png`) });
      assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 0);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const [endpoint, status] of [['reminder-requests', 403], ['reminders', 403], ['reminders', 503]]) {
  for (const previous of ['empty', 'populated', 'confirmation']) {
    test(`a ${status === 403 ? 'denied' : 'failed'} ${endpoint} refresh clears ${previous} permission claims until reviewed again`, async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
      try {
        const { page, outbound, errors } = await fixture(context);
        const section = page.getByRole('region', { name: 'Reminders other members may send you' });
        const confirmation = page.getByRole('group', { name: 'Take this back?' });
        await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
        if (previous === 'empty') {
          await page.evaluate(async () => {
            for (const reminder of window.privacyFixture.reminders) reminder.status = 'cancelled';
            await window.refreshPrivacyRequests();
          });
          await section.getByText('Nothing to show here.', { exact: true }).waitFor();
        } else if (previous === 'confirmation') {
          await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).click();
          await confirmation.waitFor();
        }
        await page.evaluate(async failure => {
          window.privacyFixture.failure = failure;
          await window.refreshPrivacyRequests();
        }, { route: `/api/${endpoint}`, status });
        await section.getByRole('alert').filter({ hasText: 'Permission scan unavailable.' }).waitFor();
        if (previous === 'confirmation') assert.equal(await confirmation.count(), 0, 'A failed scan invalidates the old request review.');
        assert.equal(await section.getByText('Nothing to show here.', { exact: true }).count(), 0);
        assert.equal(await section.getByText('Water the plants', { exact: false }).count(), 0);
        assert.equal(await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).count(), 0);
        await page.getByText('Answers in Telugu', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 0);

        await page.evaluate(() => { window.privacyFixture.failure = null; });
        await section.getByRole('button', { name: 'Retry', exact: true }).click();
        if (previous === 'empty') await section.getByText('Nothing to show here.', { exact: true }).waitFor();
        else await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
        assert.equal(await confirmation.count(), 0, 'Recovery must not reopen a stale review automatically.');
        if (previous === 'confirmation') {
          await takeBack(page, 'Water the plants');
          const changes = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET'));
          assert.equal(changes.length, 1);
          assert.equal(changes[0].route, '/api/reminders/11111111-1111-4111-8111-111111111111/cancel');
          assert.equal(changes[0].headers['x-account-id'], accountId);
        }
        assert.deepEqual(outbound, []);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

for (const width of [1280, 320]) {
  for (const change of ['cancelled', 'renamed']) {
    test(`a successful ${change} permission refresh invalidates its review at ${width} px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const { page, outbound, errors } = await fixture(context);
        const section = page.getByRole('region', { name: 'Reminders other members may send you' });
        const confirmation = page.getByRole('group', { name: 'Take this back?' });
        await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).click();
        await confirmation.waitFor();
        await page.evaluate(async change => {
          if (change === 'cancelled') window.privacyFixture.reminders[0].status = 'cancelled';
          else window.privacyFixture.requests[0].task_title = 'Water the plants tomorrow';
          await window.refreshPrivacyRequests();
        }, change);
        if (change === 'cancelled') await section.getByText('Nothing to show here.', { exact: true }).waitFor();
        else await section.getByRole('button', { name: 'Take back: Water the plants tomorrow', exact: true }).waitFor();
        assert.equal(await confirmation.count(), 0, 'The previous permission is no longer the current review target.');
        assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 0);
        await page.evaluate(async () => {
          window.privacyFixture.reminders[0].status = 'scheduled';
          window.privacyFixture.requests[0].task_title = 'Water the plants';
          await window.refreshPrivacyRequests();
        });
        await section.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
        assert.equal(await confirmation.count(), 0, 'A later refresh must not restore the obsolete review.');
        await takeBack(page, 'Water the plants');
        const changes = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET'));
        assert.equal(changes.length, 1);
        assert.equal(changes[0].route, '/api/reminders/11111111-1111-4111-8111-111111111111/cancel');
        assert.equal(changes[0].headers['x-account-id'], accountId);
        assert.deepEqual(outbound, []);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

test('a failed reminder scan preserves an unrelated memory confirmation', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Take back: The plumber comes on Fridays', exact: true }).click();
    const confirmation = page.getByRole('group', { name: 'Take this back?' });
    await confirmation.getByText('The plumber comes on Fridays', { exact: true }).waitFor();
    await page.evaluate(async () => {
      window.privacyFixture.failure = { route: '/api/reminder-requests' };
      await window.refreshPrivacyRequests();
    });
    await page.getByRole('region', { name: 'Reminders other members may send you' }).getByRole('alert').waitFor();
    await confirmation.getByText('The plumber comes on Fridays', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await confirmation.getByRole('button', { name: 'Keep', exact: true }).click();
    await confirmation.waitFor({ state: 'detached' });
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const cancelResponse of ['wrong-id', 'scheduled']) {
  test(`an unconfirmed ${cancelResponse} cancellation cannot claim permission was taken back`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, null, { cancelResponse });
      await page.getByRole('button', { name: 'Take back: Water the plants', exact: true }).click();
      const confirmation = page.getByRole('group', { name: 'Take this back?' });
      await confirmation.getByRole('button', { name: 'Take back', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[role="alert"]')
        || [...document.querySelectorAll('[role="status"]')].some(element => element.textContent.includes('Taken back.')));
      assert.equal(await page.getByRole('status').filter({ hasText: 'Taken back.' }).count(), 0);
      await page.getByRole('alert').filter({ hasText: 'The service returned an unexpected response.' }).waitFor();
      await page.getByRole('button', { name: 'Take back: Water the plants', exact: true }).waitFor();
      assert.equal(await confirmation.count(), 0);
      assert.equal(await page.evaluate(() => window.privacyFixture.reminders[0].status), 'scheduled');
      assert.equal(await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET').length), 1);
      await page.evaluate(() => { window.privacyFixture.cancelResponse = null; });
      await takeBack(page, 'Water the plants');
      const changes = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method !== 'GET'));
      assert.equal(changes.length, 2);
      for (const change of changes) {
        assert.equal(change.method, 'POST');
        assert.equal(change.route, '/api/reminders/11111111-1111-4111-8111-111111111111/cancel');
        assert.equal(change.headers['x-account-id'], accountId);
        assert.deepEqual(change.body, {});
      }
      assert.equal(await page.evaluate(() => window.privacyFixture.reminders[0].status), 'cancelled');
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('a refused take-back says so, and the next attempt sends the version the page now shows', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByText('Reminders can reach your inbox.', { exact: true }).waitFor();
    // Turned off and on again on another device after this page loaded.
    await page.evaluate(() => { window.privacyFixture.preferences = { in_app_reminders_enabled: true, version: '3' }; });
    await page.getByRole('button', { name: 'Take back: Reminders in your inbox', exact: true }).click();
    await page.getByRole('group', { name: 'Take this back?' }).getByRole('button', { name: 'Take back', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Notification preferences changed. Reload and review.' }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Take this back?' }).count(), 0, 'The confirmation with the older version closes.');
    assert.equal(await page.getByRole('status').filter({ hasText: 'Taken back.' }).count(), 0);

    await takeBack(page, 'Reminders in your inbox');
    await page.getByText('Reminders are turned off. Turn them on again under Reminders.', { exact: true }).waitFor();
    const versions = await page.evaluate(() => window.privacyFixture.calls.filter(call => call.method === 'PATCH').map(call => call.headers['if-match']));
    assert.deepEqual(versions, ['"1"', '"3"']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the privacy page fits 320 px at 200% text with 44 px controls', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByText('The plumber comes on Fridays', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Take back: Water the plants', exact: true }).click();
    await page.getByRole('group', { name: 'Take this back?' }).waitFor();
    const confirm = page.getByRole('group', { name: 'Take this back?' }).getByRole('button', { name: 'Take back', exact: true });
    const originalSize = await confirm.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await doubleText(page);
    assert.equal(await confirm.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    for (const control of await page.locator('main').getByRole('button').all()) {
      const box = await control.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${await control.innerText()} is ${box.width} by ${box.height} px.`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
    await confirm.scrollIntoViewIfNeeded();
    await confirm.focus();
    await page.screenshot({ path: path.join(root, '.local/screenshots/privacy-320-large-text.png'), animations: 'disabled' });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
