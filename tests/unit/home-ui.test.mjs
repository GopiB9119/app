import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Home, the personal overview, and the five main sections (DEC-014, T38), with simulated APIs and no network.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const familyId = '359bd05a-c95c-4975-b061-d647e82a6958';
const groupId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const taskId = '7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c01';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { HomeScreen } from './src/features/platform/home-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderHomeFixture = () => root.render(<Providers><HomeScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-home.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-home.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-home-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      // The page is served at /app, so the main navigation marks Home as the current section.
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => "/app"; export const useRouter = () => ({ push() {}, replace() {}, refresh() {} }); export const useSearchParams = () => new URLSearchParams();',
        loader: 'js',
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

// One family Space and one public group the person owns. Each source answers from window.homeFixture; a source listed
// in `failing` answers 503 until the test clears it.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline Home</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, familyId, groupId, taskId, failing }) => {
    const today = new Date().toISOString().slice(0, 10);
    const later = new Date(Date.now() + 86400000 * 3).toISOString();
    const created = '2026-09-19T10:00:00Z';
    const state = window.homeFixture = { calls: [], unexpected: [], failing: new Set(failing) };
    const spaces = [
      { id: familyId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created },
      { id: groupId, name: 'Garden club', description: '', space_type: 'group', visibility: 'public', status: 'active', role: 'owner', version: '1', created_at: created },
    ];
    const entries = [
      { id: taskId, space_id: familyId, title: 'Water the plants', date: today, kind: 'task', task_id: taskId, scheduled_at: null, timezone: null, status: 'open', source_changed: false, series_id: null },
      { id: '7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c02', space_id: familyId, title: 'Water the plants', date: today, kind: 'reminder', task_id: taskId,
        scheduled_at: `${today}T18:00:00Z`, timezone: 'UTC', source_changed: false, status: 'scheduled', series_id: null },
      { id: '7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c03', space_id: familyId, title: 'Family dinner', date: today, kind: 'event', task_id: null,
        scheduled_at: `${today}T19:00:00Z`, timezone: 'UTC', source_changed: false, status: 'scheduled', series_id: null },
      { id: '7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c04', space_id: familyId, title: 'Cancelled picnic', date: today, kind: 'event', task_id: null,
        scheduled_at: `${today}T20:00:00Z`, timezone: 'UTC', source_changed: false, status: 'cancelled', series_id: null },
    ];
    const person = (id, name) => ({ account_id: id, display_name: name });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-home', ...extra }), { status: 200 });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const unavailable = () => new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Synthetic outage.' }, request_id: 'offline-home' }), { status: 503 });
    const sources = {
      '/api/spaces': () => paged(spaces),
      '/api/invitations': () => paged([{ id: 'a1d6f3c2-1111-4c1e-8f4e-000000000001', space_id: '9d0f3c2a-2222-4c1e-8f4e-000000000002', space_name: 'Lee household',
        inviter_name: 'Sam Lee', recipient_account_id: accountId, role: 'member', status: 'pending', created_at: created, expires_at: later }]),
      [`/api/spaces/${groupId}/join-requests`]: () => reply([{ id: 'b2d6f3c2-3333-4c1e-8f4e-000000000003', account_id: 'c3d6f3c2-4444-4c1e-8f4e-000000000004',
        display_name: 'Priya Shah', note: 'I grow tomatoes.', created_at: created, expires_at: later }]),
      '/api/reminder-requests': () => paged([{ id: 'd4d6f3c2-5555-4c1e-8f4e-000000000005', task_id: taskId, space_id: familyId, task_title: 'Take out the bins',
        task_version: '1', requested_by: person('e5d6f3c2-6666-4c1e-8f4e-000000000006', 'Jordan Morgan'), recipient: person(accountId, 'Alex Morgan'),
        local_time: '2026-12-01T08:00:00', timezone: 'UTC', scheduled_at: '2026-12-01T08:00:00Z', dispatch_expires_at: '2026-12-02T08:00:00Z',
        expires_at: '2026-11-30T08:00:00Z', created_at: created, resolved_at: null, status: 'pending', source_changed: false, reminder_id: null,
        version: '1', channel: 'in_app' }]),
      '/api/notifications': () => paged([
        { id: 'f6d6f3c2-7777-4c1e-8f4e-000000000007', reminder_id: 'f6d6f3c2-7777-4c1e-8f4e-000000000008', task_id: taskId, space_id: familyId,
          task_title: 'Call the plumber', scheduled_at: '2026-12-02T09:00:00Z', created_at: '2026-12-02T09:00:00Z', read_at: null, acknowledged_at: null },
        { id: 'f6d6f3c2-7777-4c1e-8f4e-000000000009', reminder_id: 'f6d6f3c2-7777-4c1e-8f4e-000000000010', task_id: taskId, space_id: familyId,
          task_title: 'Already handled', scheduled_at: '2026-09-29T09:00:00Z', created_at: '2026-09-29T09:00:00Z',
          read_at: '2026-09-29T09:05:00Z', acknowledged_at: '2026-09-29T09:05:00Z' },
      ], { unread_count: 1 }),
      '/api/calendar': url => paged(url.searchParams.get('space_id') === familyId ? entries : []),
      '/api/feed': () => paged([1, 2, 3, 4].map(number => ({
        id: `a7d6f3c2-8888-4c1e-8f4e-00000000001${number}`, page_id: 'a7d6f3c2-9999-4c1e-8f4e-000000000020', page_handle: 'riverside-garden',
        page_name: 'Riverside garden', title: `Planting day ${number}`, body: 'Bring gloves.', status: 'published', like_count: 0, comment_count: 0,
        created_at: created, published_at: created, edited_at: null, liked: false, saved: false, can_manage: false, etag: null,
      }))),
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') {
        // The live connection every signed-in page opens (DEC-019) stays open without hints and closes when the page aborts it.
        return new Response(new ReadableStream({ start(controller) { config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} }); } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      state.calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/api/me' && method === 'GET') {
        return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      }
      const source = method === 'GET' && sources[url.pathname];
      if (!source) { state.unexpected.push(`${method} ${url.pathname}`); throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`); }
      return state.failing.has(url.pathname) ? unavailable() : source(url);
    };
  }, { accountId, familyId, groupId, taskId, failing: options.failing ?? [] });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderHomeFixture());
  await page.getByRole('heading', { name: 'Home', exact: true, level: 1 }).waitFor();
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'));
  return { page, outbound, errors };
}

const section = (page, name) => page.getByRole('region', { name, exact: true });
const rows = async (page, name) => (await section(page, name).getByRole('listitem').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim());

test('Home shows each section from its own source, and one failing source leaves the others in place', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { failing: ['/api/feed'] });
    const pages = section(page, 'From pages you follow');
    await pages.getByRole('alert').filter({ hasText: "Couldn't load posts from pages you follow." }).waitFor();
    assert.deepEqual(await rows(page, 'Needs attention'), [
      'Sam Lee invited you to Lee household Review invitation',
      'Priya Shah asks to join Garden club Review request',
      'Jordan Morgan asks to remind you: Take out the bins 1 Dec, 08:00 Review request',
      'Reminder: Call the plumber 2 Dec, 09:00 Open inbox',
    ]);
    // Only active entries, the task first, then by time; the cancelled event is left out.
    assert.deepEqual(await rows(page, 'Today'), [
      'Today Water the plants Task due · Morgan family Open',
      '18:00 Water the plants Reminder · Morgan family Open',
      '19:00 Family dinner Event · Morgan family Open',
    ]);
    assert.deepEqual(await rows(page, 'Your Spaces'), ['Morgan family Family · Owner Tasks', 'Garden club Group · Owner Tasks']);
    const links = Object.fromEntries(await page.locator('main a').evaluateAll(items => items.map(item => [item.getAttribute('aria-label') ?? item.textContent.trim(), item.getAttribute('href')])));
    assert.equal(links.Calendar, '/app/calendar');
    assert.equal(links.Medicines, '/app/care');
    assert.equal(links['View all in the calendar'], '/app/calendar');
    assert.equal(links['View all Spaces'], '/app/spaces');
    assert.equal(links['View all posts from pages you follow'], '/app/home');
    assert.equal(links['Open Family dinner'], `/app/events?space_id=${familyId}`);
    // The failed source is retried on its own.
    const before = await page.evaluate(() => window.homeFixture.calls.length);
    await page.evaluate(() => window.homeFixture.failing.clear());
    await pages.getByRole('button', { name: 'Retry', exact: true }).click();
    await pages.getByRole('link', { name: 'Read Planting day 1', exact: true }).waitFor();
    assert.equal(await pages.getByRole('listitem').count(), 3);
    assert.deepEqual(await page.evaluate(count => window.homeFixture.calls.slice(count), before), ['GET /api/feed']);
    // The five main sections, with Home current, and the bell with the inbox's unread count.
    const main = page.getByRole('navigation', { name: 'Main', exact: true });
    assert.deepEqual(await main.getByRole('link').allInnerTexts(), ['Home', 'Spaces', 'Messages', 'Discover', 'Profile']);
    assert.equal(await main.getByRole('link', { name: 'Home', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await page.getByRole('link', { name: 'Notification inbox, 1 unread', exact: true }).getAttribute('href'), '/app/notifications');
    assert.deepEqual(await page.evaluate(() => window.homeFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('without the Spaces list Home still shows the other sections, and it fits at 320 px with 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { failing: ['/api/spaces'] });
    // Without the Spaces list, join requests and today's plans cannot be checked; the other sources still answer.
    await section(page, 'Your Spaces').getByRole('alert').filter({ hasText: "Couldn't load your Spaces." }).waitFor();
    assert.equal(await section(page, 'Needs attention').getByRole('alert').filter({ hasText: "Couldn't check join requests." }).count(), 1);
    assert.equal(await section(page, 'Needs attention').getByRole('listitem').count(), 3);
    assert.equal(await section(page, 'From pages you follow').getByRole('listitem').count(), 3);
    const normal = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Home at 320px');
    await page.addStyleTag({ content: `html{font-size:${normal * 2}px!important}body{font-size:${normal * 2}px!important}` });
    assert.equal(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize)), normal * 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Home at 320px and 200% text');
    const main = page.getByRole('navigation', { name: 'Main', exact: true });
    for (const label of ['Home', 'Spaces', 'Messages', 'Discover', 'Profile']) {
      const box = await main.getByRole('link', { name: label, exact: true }).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44, `${label} fits and is at least 44 px tall`);
    }
    await page.screenshot({ path: path.join(root, '.local/screenshots/home-offline-320-large.png'), fullPage: true });
    assert.deepEqual(await page.evaluate(() => window.homeFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
