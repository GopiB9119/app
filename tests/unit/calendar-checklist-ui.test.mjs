import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const evidence = path.join(root, '.local', 't99');
const screenshots = path.dirname(fileURLToPath(import.meta.url)) === evidence
  ? path.join(evidence, 'screenshots') : path.join(root, '.local', 'screenshots');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const otherSpaceId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const reminderTaskId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const repeatingTaskId = '6f1c2f0e-8f53-4d55-9a53-1d2b8b7c9e01';
const seriesId = 'ad88a51c-b2fc-4a0f-a83a-27fcd3ea447d';
const itemId = '08854b0c-5b86-4658-bf68-e7ea42caa6f6';
const taskTitle = 'Synthetic packing task';
const itemTitle = 'Pack a synthetic notebook';
const now = '2026-10-02T12:00:00Z';
const timeout = 240_000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const backendSchema = readFileSync(path.join(root, 'backend', 'app', 'modules', 'planning', 'schemas.py'), 'utf8');
const titleLimit = Number(backendSchema.match(/TaskTitle = Annotated\[str, StringConstraints\([^)]*max_length=(\d+)/)?.[1]);
assert.equal(titleLimit, 200, 'ChecklistCommand.title uses the backend TaskTitle character limit.');
const etag = version => `"${Number(version).toString(16).padStart(64, '0')}"`;
let browser;
let javascript;
let css;

before(async () => {
  const output = await build({
    stdin: {
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { CalendarScreen } from './src/features/planning/calendar-screen';
        import { TaskScreen } from './src/features/planning/task-screen';
        import './src/app/globals.css';
        function FixtureControls() {
          const cache = useQueryClient();
          useEffect(() => {
            window.refetchT99 = key => cache.refetchQueries({ queryKey: key, type: 'active' });
          }, [cache]);
          return null;
        }
        const root = createRoot(document.getElementById('root'));
        window.renderT99 = (screen, initialSpaceId) => {
          window.fixturePathname = screen === 'calendar' ? '/app/calendar' : '/app/tasks';
          root.render(<Providers language="en"><FixtureControls />{screen === 'calendar'
            ? <CalendarScreen initialSpaceId={initialSpaceId} />
            : <TaskScreen initialSpaceId={initialSpaceId} />}</Providers>);
        };
        window.unmountT99 = () => root.unmount();`,
      resolveDir: web, sourcefile: 'offline-calendar-checklist.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(evidence, 'offline-calendar-checklist.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-calendar-checklist-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.fixturePathname;',
        loader: 'js',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = output.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath), 'The configured offline Chromium must exist.');
  browser = await chromium.launch({ executablePath, headless: true, timeout: 120_000 });
  mkdirSync(screenshots, { recursive: true });
  mkdirSync(evidence, { recursive: true });
}, { timeout });
after(async () => { await browser?.close(); });

// A committed write can lose its answer. Receipts replay before checking the now-newer version.
async function fixture(t, screen, options = {}, contextOptions = {}) {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', ...contextOptions });
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  t.after(async () => {
    if (!page.isClosed()) await page.evaluate(() => window.unmountT99?.());
    await context.close();
  });
  page.setDefaultTimeout(90_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.setFixedTime(new Date(options.now ?? now));
  await page.setContent('<html><head><title>Offline calendar and task checklists</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, otherSpaceId, taskId, reminderTaskId, repeatingTaskId, seriesId, itemId, taskTitle, itemTitle, now, titleLimit, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true,
    });
    const state = window.t99Fixture = {
      calls: [], unexpected: [], streams: [], receipts: {}, holding: {}, releases: {},
      hold: { ...options.hold }, lose: { ...options.lose }, reject: { ...options.reject },
      readFailures: { ...options.readFailures }, reads: { account: 0, spaces: 0, calendar: 0, checklist: 0 },
      writes: { add: 0, check: 0, rename: 0, remove: 0 },
      taskVersion: 1, profileTimezone: options.profileTimezone ?? 'Asia/Kolkata', displayName: 'Alex Synthetic',
      denyCalendar: 0, denyChecklist: 0, canManage: options.canManage ?? true, canCheck: options.canCheck ?? true,
      taskTitle: options.longText ? `Synthetic task ${'W'.repeat(180)}` : taskTitle,
      spaces: [
        { id: spaceId, name: options.longText ? `Synthetic ${'M'.repeat(65)}` : 'Synthetic family', space_type: 'family' },
        { id: otherSpaceId, name: 'Other synthetic family', space_type: 'family' },
      ],
      items: options.emptyChecklist ? [] : [{
        id: itemId, title: options.itemTitle ?? (options.longText ? `Synthetic item ${'M'.repeat(180)}` : itemTitle),
        checked: !!options.checked, checked_at: options.checked ? now : null, checked_by_account_id: options.checked ? accountId : null,
      }],
    };
    const etag = () => `"${state.taskVersion.toString(16).padStart(64, '0')}"`;
    const reply = (data, extra = {}, status = 200) => new Response(JSON.stringify({ data, request_id: 'offline-t99', ...extra }), { status });
    const paged = (data, next = null) => reply(data, { pagination: { next_cursor: next, has_more: next !== null } });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-t99' }), { status });
    const checklist = () => ({
      task_id: taskId, space_id: spaceId, task_title: state.taskTitle, task_status: 'open',
      task_version: String(state.taskVersion), can_manage: state.canManage, can_check: state.canCheck,
      items: structuredClone(state.items), etag: etag(),
    });
    const task = () => ({
      id: taskId, space_id: spaceId, title: state.taskTitle, description: 'Synthetic offline checklist task',
      due_date: '2026-10-02', status: 'open', assignee: null, assignee_unavailable: false,
      created_by_account_id: accountId, completed_by_account_id: null, completed_at: null,
      created_at: now, updated_at: now, version: String(state.taskVersion), etag: etag(),
      permissions: { can_edit: true, allowed_statuses: ['in_progress', 'completed', 'cancelled'] },
    });
    const dayInZone = (value, timezone) => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
      return ['year', 'month', 'day'].map(kind => parts.find(part => part.type === kind).value).join('-');
    };
    const entries = (id, timezone, start, end) => {
      if (options.emptyCalendar) return [];
      const base = { space_id: id, source_changed: false, series_id: null };
      const reminder = (entryId, title, sourceTask, scheduled, fields = {}) => ({
        ...base, id: entryId, kind: 'reminder', task_id: sourceTask, title, scheduled_at: scheduled,
        date: dayInZone(scheduled, timezone), timezone: 'America/New_York', status: 'scheduled', ...fields,
      });
      const values = [
        { ...base, id: taskId, kind: 'task', task_id: taskId,
          title: options.longText ? `Synthetic due task ${'W'.repeat(175)}` : 'Synthetic task due',
          date: '2026-10-02', scheduled_at: null, timezone: null, status: 'open' },
        reminder('11111111-1111-4111-8111-111111111111', 'Synthetic month-edge reminder', reminderTaskId, '2026-09-30T23:45:00Z'),
        reminder('22222222-2222-4222-8222-222222222222', 'Synthetic one-off reminder', reminderTaskId, '2026-10-01T23:30:00Z', { status: 'available', source_changed: true }),
        reminder('33333333-3333-4333-8333-333333333333', 'Synthetic daily task', repeatingTaskId, '2026-10-02T01:00:00Z', { series_id: seriesId }),
        reminder('44444444-4444-4444-8444-444444444444', 'Synthetic daily task', repeatingTaskId, '2026-10-02T23:45:00Z', { kind: 'planned', status: 'planned', series_id: seriesId }),
        reminder('55555555-5555-4555-8555-555555555555', 'Synthetic daily task', repeatingTaskId, '2026-10-03T23:45:00Z', { kind: 'planned', status: 'planned', series_id: seriesId }),
      ];
      return values.filter(entry => entry.date >= start && entry.date <= end).sort((a, b) =>
        a.date.localeCompare(b.date) || Number(a.kind !== 'task') - Number(b.kind !== 'task')
        || (a.scheduled_at && b.scheduled_at ? Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) : 0)
        || a.id.localeCompare(b.id));
    };
    const hold = async (name, signal) => {
      if (!state.hold[name]) return;
      state.hold[name] = false;
      state.holding[name] = true;
      await new Promise((resolve, reject) => {
        const abort = () => { delete state.releases[name]; delete state.holding[name]; reject(new DOMException('Aborted', 'AbortError')); };
        state.releases[name] = () => {
          signal?.removeEventListener('abort', abort);
          delete state.releases[name]; delete state.holding[name]; resolve();
        };
        signal?.addEventListener('abort', abort, { once: true });
      });
    };
    const readFailure = name => {
      state.reads[name] += 1;
      if ((state.readFailures[name] ?? 0) === 0) return null;
      state.readFailures[name] -= 1;
      return failed(503, 'SERVICE_UNAVAILABLE', `Synthetic ${name} answer is unavailable.`);
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const route = url.pathname;
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({
        route, query: url.search, method, body, rawBody: config.body ?? null, headers,
        credentials: config.credentials, cache: config.cache,
      });
      if (route === '/api/live' && method === 'GET') {
        const stream = { controller: null, closed: false };
        const response = new Response(new ReadableStream({
          start(controller) {
            stream.controller = controller;
            controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"heartbeat_seconds":15,"max_seconds":1800}\n\n'));
          },
          cancel() { stream.closed = true; },
        }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
        config.signal?.addEventListener('abort', () => {
          if (!stream.closed) { stream.closed = true; stream.controller.error(new DOMException('Aborted', 'AbortError')); }
        }, { once: true });
        state.streams.push(stream);
        return response;
      }
      if (route === '/api/me' && method === 'GET') {
        await hold('account', config.signal);
        const error = readFailure('account');
        return error ?? reply({ id: accountId, email: 'alex@example.test', display_name: state.displayName, timezone: state.profileTimezone, email_verified: true, version: 1 });
      }
      if (route === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (route === '/api/spaces' && method === 'GET') {
        await hold('spaces', config.signal);
        const error = readFailure('spaces');
        return error ?? paged(state.spaces.map(item => ({ ...item, visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: now })));
      }
      if (route === '/api/calendar' && method === 'GET') {
        await hold('calendar', config.signal);
        const error = readFailure('calendar');
        if (error) return error;
        if (state.denyCalendar) return failed(state.denyCalendar, 'ACCESS_DENIED', 'Synthetic calendar access is unavailable.');
        const parameters = Object.fromEntries(url.searchParams);
        const { space_id: selectedSpace, start_date: start, end_date: end, timezone, cursor } = parameters;
        if (parameters.limit !== '50' || !state.spaces.some(space => space.id === selectedSpace)
          || !/^\d{4}-\d{2}-01$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !timezone) {
          return failed(422, 'INVALID_QUERY', 'The synthetic calendar requires an explicit scope and month.');
        }
        const values = entries(selectedSpace, timezone, start, end);
        const offset = cursor ? Number(cursor.match(/^synthetic:(\d+)\/\+=$/)?.[1]) : 0;
        if (!Number.isInteger(offset)) return failed(400, 'INVALID_CURSOR', 'The synthetic cursor changed.');
        const size = options.paged ? 2 : 50;
        return paged(values.slice(offset, offset + size), offset + size < values.length ? `synthetic:${offset + size}/+=` : null);
      }
      if (route === '/api/tasks/assignees' && method === 'GET') return reply([{ account_id: accountId, display_name: 'Alex Synthetic' }]);
      if (route === '/api/tasks' && method === 'GET') return paged([task()]);
      if (route === `/api/tasks/${taskId}/checklist` && method === 'GET') {
        await hold('checklist', config.signal);
        const error = readFailure('checklist');
        if (error) return error;
        return state.denyChecklist ? failed(state.denyChecklist, 'ACCESS_DENIED', 'Synthetic checklist access is unavailable.') : reply(checklist());
      }
      if (route === `/api/tasks/${taskId}/checklist` && method === 'POST') {
        if (state.denyChecklist) return failed(state.denyChecklist, 'ACCESS_DENIED', 'Synthetic checklist access is unavailable.');
        const key = headers['idempotency-key'];
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key ?? '')) {
          return failed(422, 'INVALID_REQUEST', 'A single Idempotency-Key is required.');
        }
        const expectedFields = { add: ['action', 'title'], rename: ['action', 'item_id', 'title'], check: ['action', 'checked', 'item_id'], remove: ['action', 'item_id'] }[body.action];
        if (!expectedFields || JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(expectedFields)) {
          return failed(422, 'INVALID_REQUEST', 'Submit only the fields for this checklist action.');
        }
        if (body.title !== undefined && (!body.title.trim() || [...body.title.trim()].length > titleLimit || /\p{C}/u.test(body.title))) {
          return failed(422, 'INVALID_TITLE', `Synthetic titles need 1 to ${titleLimit} server characters.`);
        }
        if (body.action === 'check' ? !state.canCheck : !state.canManage) return failed(403, 'ACCESS_DENIED', 'Synthetic checklist action is not permitted.');
        const receipt = state.receipts[key];
        if (receipt) {
          if (receipt.rawBody !== config.body || receipt.etag !== headers['if-match']) return failed(409, 'IDEMPOTENCY_CONFLICT', 'The original checklist request changed.');
          await hold(body.action, config.signal);
          return reply(checklist());
        }
        const refusal = state.reject[body.action];
        if (refusal) {
          state.reject[body.action] = 0;
          if (options.remoteOnRefusal) {
            state.items[0].title = 'Remote unchecked revision';
            state.items[0].checked = false; state.items[0].checked_at = null; state.items[0].checked_by_account_id = null;
            state.taskVersion += 1;
          }
          return failed(refusal, 'CHECKLIST_CHANGED', 'Synthetic checklist change was refused. Reload and review.');
        }
        if (headers['if-match'] !== etag()) return failed(412, 'PRECONDITION_FAILED', 'The task or checklist changed. Reload and review.');
        const item = state.items.find(value => value.id === body.item_id);
        if (body.action !== 'add' && !item) return failed(404, 'NOT_FOUND', 'Synthetic checklist item is unavailable.');
        if (body.action === 'add') {
          state.items.push({ id: crypto.randomUUID(), title: body.title.trim(), checked: false, checked_at: null, checked_by_account_id: null });
        } else if (body.action === 'remove') {
          state.items = state.items.filter(value => value.id !== body.item_id);
        } else if (body.action === 'rename') {
          if (item.title === body.title.trim()) return failed(409, 'NO_CHANGES', 'This item already has that title.');
          Object.assign(item, { title: body.title.trim(), checked: false, checked_at: null, checked_by_account_id: null });
        } else {
          if (typeof body.checked !== 'boolean') return failed(422, 'INVALID_REQUEST', 'Checked must be a boolean.');
          if (item.checked === body.checked) return failed(409, 'NO_CHANGES', 'This item already has that checked state.');
          Object.assign(item, { checked: body.checked, checked_at: body.checked ? now : null, checked_by_account_id: body.checked ? accountId : null });
        }
        state.taskVersion += 1;
        state.writes[body.action] += 1;
        state.receipts[key] = { rawBody: config.body, etag: headers['if-match'] };
        await hold(body.action, config.signal);
        if ((state.lose[body.action] ?? 0) > 0) {
          state.lose[body.action] -= 1;
          throw new TypeError('Synthetic lost checklist answer after committing the command');
        }
        return reply(checklist());
      }
      state.unexpected.push(`${method} ${route}${url.search}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${route}`);
    };
  }, { accountId, spaceId, otherSpaceId, taskId, reminderTaskId, repeatingTaskId, seriesId, itemId, taskTitle, itemTitle, now, titleLimit, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ screen, space }) => window.renderT99(screen, space), { screen, space: options.initialSpaceId ?? '' });
  return { page, outbound, errors, taskTitle: options.longText ? `Synthetic task ${'W'.repeat(180)}` : taskTitle };
}

const agenda = page => page.getByRole('region', { name: 'Month agenda', exact: true });
const calendarRows = page => page.locator('li[data-kind]');
const checklistDialog = page => page.getByRole('dialog', { name: 'Task checklist', exact: true });
const itemRow = (page, title = itemTitle) => checklistDialog(page).getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: title, exact: true }) });

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function calls(page, route, method = 'GET') {
  return page.evaluate(({ route, method }) => window.t99Fixture.calls.filter(call => call.route === route && call.method === method), { route, method });
}

const checklistCalls = (page, method = 'POST') => calls(page, `/api/tasks/${taskId}/checklist`, method);

function assertRead(call, route, query) {
  assert.deepEqual(call, {
    route, query, method: 'GET', body: null, rawBody: null,
    headers: { 'content-type': 'application/json', 'x-account-id': accountId },
    credentials: 'same-origin', cache: 'no-store',
  });
}

function calendarQuery(month = '2026-10', timezone = 'Asia/Kolkata', space = spaceId, cursor = null) {
  const last = new Date(`${month}-01T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const params = new URLSearchParams({ space_id: space, start_date: `${month}-01`, end_date: last.toISOString().slice(0, 10), timezone, limit: '50' });
  if (cursor) params.set('cursor', cursor);
  return `?${params}`;
}

function assertCommand(call, body, version) {
  assert.match(call.headers['idempotency-key'], uuid, 'Every new checklist intent needs a UUID key.');
  assert.deepEqual(call, {
    route: `/api/tasks/${taskId}/checklist`, query: '', method: 'POST', body, rawBody: JSON.stringify(body),
    headers: {
      'content-type': 'application/json', 'x-account-id': accountId,
      'if-match': etag(version), 'idempotency-key': call.headers['idempotency-key'],
    },
    credentials: 'same-origin', cache: 'no-store',
  });
}

async function assertOffline({ page, outbound, errors }) {
  assert.deepEqual(outbound, [], 'Every real request is blocked; none should be attempted.');
  assert.deepEqual(errors, [], 'The offline browser must have no uncaught or console errors.');
  assert.deepEqual(await page.evaluate(() => window.t99Fixture.unexpected), [], 'No unimplemented API may silently fall back to an offline error.');
  assert.ok(await page.evaluate(() => window.t99Fixture.streams.length > 0), 'The signed-in live connection is also answered in-page.');
}

async function release(page, name) {
  await page.waitForFunction(name => window.t99Fixture.holding[name] === true, name);
  await page.evaluate(name => window.t99Fixture.releases[name](), name);
}

async function readyCalendar(page) {
  await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
  await page.waitForFunction(() => {
    const section = document.getElementById('agenda-title')?.closest('section');
    return section && !section.querySelector('[aria-busy="true"]');
  });
  await settle(page);
}

async function openChecklist(result, wait = true) {
  const { page } = result;
  await page.getByRole('heading', { name: result.taskTitle, exact: true }).waitFor();
  await page.getByRole('button', { name: `Checklist: ${result.taskTitle}`, exact: true }).click();
  const dialog = checklistDialog(page);
  await dialog.waitFor();
  if (wait) {
    await page.waitForFunction(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog?.querySelector('h3') || dialog?.querySelector('[role="alert"]');
    });
    await settle(page);
  }
  return dialog;
}

async function assertLocked(page, title = itemTitle, editing = false) {
  const dialog = checklistDialog(page);
  assert.equal(await dialog.getByRole('button', { name: 'Close checklist', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('checkbox', { name: title, exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: `Edit checklist item: ${title}`, exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: `Remove checklist item: ${title}`, exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel(editing ? 'Item title' : 'New item', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: editing ? 'Save item' : 'Add item', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('combobox', { name: 'Family Space', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('combobox', { name: 'Status', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Refresh tasks', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), true, 'Cancel cannot discard an unconfirmed effect identity.');
}

test('calendar: account, Spaces and month loading never pretend to be an empty calendar', { timeout }, async t => {
  const result = await fixture(t, 'calendar', { hold: { account: true, spaces: true, calendar: true } });
  const { page } = result;
  await page.getByText('Loading calendar', { exact: true }).waitFor();
  assert.equal((await calls(page, '/api/calendar')).length, 0);
  await release(page, 'account');
  await page.getByText('Loading Spaces...', { exact: true }).waitFor();
  assert.equal((await calls(page, '/api/calendar')).length, 0);
  await release(page, 'spaces');
  await agenda(page).getByText('Loading calendar...', { exact: true }).waitFor();
  assert.equal(await agenda(page).getByRole('status').getAttribute('aria-busy'), 'true');
  assert.equal(await agenda(page).getByText(/^No tasks, reminders/).count(), 0);
  assert.equal(await calendarRows(page).count(), 0);
  assertRead((await calls(page, '/api/calendar'))[0], '/api/calendar', calendarQuery());
  await release(page, 'calendar');
  await readyCalendar(page);
  assert.equal(await calendarRows(page).count(), 6);
  await assertOffline(result);
});

test('calendar: a failed month waits for Retry and repeats the exact scoped query', { timeout }, async t => {
  const result = await fixture(t, 'calendar', { readFailures: { calendar: 1 } });
  const { page } = result;
  await agenda(page).getByRole('alert').filter({ hasText: 'Synthetic calendar answer is unavailable.' }).waitFor();
  await settle(page);
  assert.equal((await calls(page, '/api/calendar')).length, 1, 'A failed month must not retry itself.');
  assert.equal(await calendarRows(page).count(), 0);
  await agenda(page).getByRole('button', { name: 'Retry', exact: true }).click();
  await readyCalendar(page);
  const reads = await calls(page, '/api/calendar');
  assert.equal(reads.length, 2);
  assertRead(reads[0], '/api/calendar', calendarQuery());
  assert.deepEqual(reads[1], reads[0]);
  assert.equal(await calendarRows(page).count(), 6);
  assert.equal(await agenda(page).getByRole('alert').count(), 0);
  await assertOffline(result);
});

test('calendar: an empty month shows the empty state without inventing entries', { timeout }, async t => {
  const result = await fixture(t, 'calendar', { emptyCalendar: true });
  const { page } = result;
  await readyCalendar(page);
  await agenda(page).getByText('No tasks, reminders or events for these dates.', { exact: true }).waitFor();
  assert.equal(await calendarRows(page).count(), 0);
  assert.equal(await agenda(page).getByRole('button', { name: 'Load more entries', exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Calendar dates', exact: true }).getByRole('button').count(), 32);
  assertRead((await calls(page, '/api/calendar'))[0], '/api/calendar', calendarQuery());
  await assertOffline(result);
});

test('calendar: due dates, reminders and planned repeats use display days and their own source links', { timeout }, async t => {
  const result = await fixture(t, 'calendar');
  const { page } = result;
  await readyCalendar(page);
  const rows = calendarRows(page);
  assert.deepEqual(await rows.locator('h3').allTextContents(), [
    'Synthetic month-edge reminder', 'Synthetic task due', 'Synthetic one-off reminder',
    'Synthetic daily task', 'Synthetic daily task', 'Synthetic daily task',
  ]);
  const facts = [
    ['reminder', 'Thu, Oct 1, 2026', '05:15 AM GMT+5:30', reminderTaskId],
    ['task', 'Fri, Oct 2, 2026', 'Due date', taskId],
    ['reminder', 'Fri, Oct 2, 2026', '05:00 AM GMT+5:30', reminderTaskId],
    ['reminder', 'Fri, Oct 2, 2026', '06:30 AM GMT+5:30', repeatingTaskId],
    ['planned', 'Sat, Oct 3, 2026', '05:15 AM GMT+5:30', repeatingTaskId],
    ['planned', 'Sun, Oct 4, 2026', '05:15 AM GMT+5:30', repeatingTaskId],
  ];
  for (const [index, [kind, date, time, source]] of facts.entries()) {
    const row = rows.nth(index);
    assert.equal(await row.getAttribute('data-kind'), kind);
    assert.ok((await row.locator('p').first().textContent()).startsWith(`${date} `));
    assert.equal(await row.getByText(time, { exact: true }).count(), 1);
    const link = row.getByRole('link', { name: kind === 'task' ? 'Space tasks' : 'My reminders', exact: true });
    assert.equal(await link.getAttribute('href'), kind === 'task' ? `/app/tasks?space_id=${spaceId}` : `/app/reminders?task_id=${source}`);
  }
  assert.equal(await rows.nth(2).getByText('In inbox', { exact: true }).count(), 1);
  assert.equal(await rows.nth(2).getByText('Scheduled in America/New_York / Task changed', { exact: true }).count(), 1);
  for (const index of [4, 5]) {
    assert.equal(await rows.nth(index).getByText('Planned, repeating', { exact: true }).count(), 1);
    assert.equal(await rows.nth(index).getByText('Repeating reminder in America/New_York', { exact: true }).count(), 1);
  }
  await page.getByRole('region', { name: 'Calendar dates', exact: true }).getByRole('button', { name: 'Fri, Oct 2, 2026', exact: true }).click();
  await page.getByRole('heading', { name: 'Fri, Oct 2, 2026', exact: true }).waitFor();
  assert.deepEqual(await calendarRows(page).locator('h3').allTextContents(), ['Synthetic task due', 'Synthetic one-off reminder', 'Synthetic daily task']);
  assert.equal((await calls(page, '/api/calendar')).length, 1, 'Selecting a day filters loaded entries; it does not change scope.');
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  assert.equal(await calendarRows(page).count(), 6);
  assert.equal((await page.getByRole('combobox', { name: 'Display timezone', exact: true }).inputValue()), 'Asia/Kolkata');
  await assertOffline(result);
});

test('calendar: the month changes only on an explicit month action, not a clock or profile refresh', { timeout }, async t => {
  const result = await fixture(t, 'calendar');
  const { page } = result;
  await readyCalendar(page);
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await page.evaluate(async () => { window.t99Fixture.displayName = 'Updated synthetic name'; await window.refetchT99(['me']); });
  await settle(page);
  assert.equal(await page.getByLabel('Month', { exact: true }).inputValue(), '2026-10', 'Clock/profile changes must not choose a month.');
  assert.equal((await calls(page, '/api/calendar')).length, 1);
  await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
  await readyCalendar(page);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await readyCalendar(page);
  assert.equal(await page.getByLabel('Month', { exact: true }).inputValue(), '2026-11');
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await readyCalendar(page);
  await page.getByLabel('Month', { exact: true }).fill('2028-02');
  await readyCalendar(page);
  assert.equal(await page.getByLabel('Month', { exact: true }).inputValue(), '2028-02');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('heading', { name: 'Sun, Nov 1, 2026', exact: true }).waitFor();
  await settle(page);
  const reads = await calls(page, '/api/calendar');
  assert.deepEqual(reads.map(call => call.query), [
    calendarQuery(), calendarQuery(), calendarQuery('2026-11'), calendarQuery(),
    `?space_id=${spaceId}&start_date=2028-02-01&end_date=2028-02-29&timezone=Asia%2FKolkata&limit=50`,
    calendarQuery('2026-11'),
  ]);
  for (const call of reads) assertRead(call, '/api/calendar', call.query);
  await assertOffline(result);
});

test('calendar: the timezone changes only by explicit choice and survives a new account preference', { timeout }, async t => {
  const result = await fixture(t, 'calendar');
  const { page } = result;
  await readyCalendar(page);
  await page.evaluate(async () => { window.t99Fixture.profileTimezone = 'America/New_York'; await window.refetchT99(['me']); });
  await settle(page);
  const selector = page.getByRole('combobox', { name: 'Display timezone', exact: true });
  assert.equal(await selector.inputValue(), 'Asia/Kolkata', 'A refreshed preference must not choose or mislabel the display timezone.');
  assert.equal((await calls(page, '/api/calendar')).length, 1);
  await selector.selectOption('UTC');
  await readyCalendar(page);
  assert.equal(await selector.inputValue(), 'UTC');
  assert.equal(await page.getByLabel('Month', { exact: true }).inputValue(), '2026-10');
  assert.equal(await calendarRows(page).count(), 5, 'The September UTC occurrence is outside the chosen October.');
  const oneOff = calendarRows(page).filter({ has: page.getByRole('heading', { name: 'Synthetic one-off reminder', exact: true }) });
  assert.ok((await oneOff.locator('p').first().textContent()).startsWith('Thu, Oct 1, 2026 '));
  assert.equal(await oneOff.locator('p').first().locator('span').textContent(), '11:30 PM GMT+0');
  await page.evaluate(async () => { window.t99Fixture.profileTimezone = 'Asia/Kolkata'; await window.refetchT99(['me']); });
  await settle(page);
  assert.equal(await selector.inputValue(), 'UTC');
  assert.equal((await calls(page, '/api/calendar')).length, 2);
  const reads = await calls(page, '/api/calendar');
  assertRead(reads[0], '/api/calendar', calendarQuery());
  assertRead(reads[1], '/api/calendar', calendarQuery('2026-10', 'UTC'));
  await assertOffline(result);
});

test('calendar: the Space changes only by explicit choice, not a reordered Spaces answer', { timeout }, async t => {
  const result = await fixture(t, 'calendar');
  const { page } = result;
  await readyCalendar(page);
  await page.evaluate(async account => { window.t99Fixture.spaces.reverse(); await window.refetchT99(['spaces', account]); }, accountId);
  await settle(page);
  const selector = page.getByRole('combobox', { name: 'Family Space', exact: true });
  assert.equal(await selector.inputValue(), spaceId, 'Refreshing the list must not silently select its new first Space.');
  assert.equal((await calls(page, '/api/calendar')).length, 1);
  await selector.selectOption(otherSpaceId);
  await readyCalendar(page);
  assert.equal(await selector.inputValue(), otherSpaceId);
  assert.equal(await page.getByLabel('Month', { exact: true }).inputValue(), '2026-10');
  assert.equal(await page.getByRole('combobox', { name: 'Display timezone', exact: true }).inputValue(), 'Asia/Kolkata');
  const reads = await calls(page, '/api/calendar');
  assert.equal(reads.length, 2);
  assertRead(reads[1], '/api/calendar', calendarQuery('2026-10', 'Asia/Kolkata', otherSpaceId));
  assert.equal(await calendarRows(page).filter({ has: page.getByRole('link', { name: 'Space tasks', exact: true }) }).getByRole('link').getAttribute('href'), `/app/tasks?space_id=${otherSpaceId}`);
  await assertOffline(result);
});

test('calendar: Load more is explicit, preserves scope and sends the exact cursor until exhausted', { timeout }, async t => {
  const result = await fixture(t, 'calendar', { paged: true });
  const { page } = result;
  await readyCalendar(page);
  assert.equal(await calendarRows(page).count(), 2);
  await settle(page);
  assert.equal((await calls(page, '/api/calendar')).length, 1);
  for (const count of [4, 6]) {
    await agenda(page).getByRole('button', { name: 'Load more entries', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('li[data-kind]').length === count, count);
  }
  assert.equal(await agenda(page).getByRole('button', { name: 'Load more entries', exact: true }).count(), 0);
  const reads = await calls(page, '/api/calendar');
  assert.equal(reads.length, 3);
  for (const [index, cursor] of [null, 'synthetic:2/+=', 'synthetic:4/+='].entries()) {
    assertRead(reads[index], '/api/calendar', calendarQuery('2026-10', 'Asia/Kolkata', spaceId, cursor));
  }
  await page.getByRole('combobox', { name: 'Display timezone', exact: true }).selectOption('UTC');
  await readyCalendar(page);
  assert.equal(await calendarRows(page).count(), 2, 'A new scope starts a fresh first page.');
  assertRead((await calls(page, '/api/calendar'))[3], '/api/calendar', calendarQuery('2026-10', 'UTC'));
  await assertOffline(result);
});

for (const status of [403, 404]) {
  test(`calendar: a ${status} refresh removes the shown agenda and its protected source links`, { timeout }, async t => {
    const result = await fixture(t, 'calendar');
    const { page } = result;
    await readyCalendar(page);
    assert.equal(await calendarRows(page).count(), 6);
    await page.evaluate(status => { window.t99Fixture.denyCalendar = status; }, status);
    await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
    await agenda(page).getByRole('alert').filter({ hasText: 'Synthetic calendar access is unavailable.' }).waitFor();
    assert.equal(await calendarRows(page).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Synthetic task due', exact: true }).count(), 0);
    assert.equal(await agenda(page).getByRole('link', { name: 'My reminders', exact: true }).count(), 0);
    assert.equal(await agenda(page).getByRole('link', { name: 'Space tasks', exact: true }).count(), 0);
    assert.equal(await agenda(page).getByRole('link', { name: 'Return to Spaces', exact: true }).getAttribute('href'), '/app/spaces');
    assert.equal(await agenda(page).getByRole('button', { name: 'Retry', exact: true }).count(), 0);
    await assertOffline(result);
  });
}

async function doubleText(page, probes) {
  await page.evaluate(() => document.fonts.ready);
  const sizes = await Promise.all(probes.map(probe => probe.evaluate(element => parseFloat(getComputedStyle(element).fontSize))));
  // These screens have px-sized text as well as inherited text; root-only scaling misses the former.
  await page.addStyleTag({ content: css.replace(/\bfont-size:\s*(\d+(?:\.\d+)?)px\b/g, (_, size) => `font-size: ${Number(size) * 2}px`) });
  for (const [index, probe] of probes.entries()) {
    assert.equal(await probe.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), sizes[index] * 2, 'The tested text must actually be 200%, without viewport zoom.');
  }
}

async function assertFits(page, label, surfaces) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    main: document.querySelector('main').scrollWidth, mainWidth: document.querySelector('main').clientWidth,
    overflow: [...document.querySelectorAll('main *')].flatMap(element => {
      const { left, right } = element.getBoundingClientRect();
      return right > innerWidth || left < 0 ? [{ tag: element.tagName, class: element.className, left, right }] : [];
    }).slice(0, 6),
  }));
  assert.equal(dimensions.viewport, 320);
  assert.ok(dimensions.document <= 320, `${label}: document must fit 320 px: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.main <= dimensions.mainWidth, `${label}: main must reflow rather than clip: ${JSON.stringify(dimensions)}`);
  for (const surface of surfaces) {
    const bounds = await surface.evaluate(element => ({
      tag: element.tagName,
      scroll: element.scrollWidth, width: element.clientWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    }));
    // Native fields scroll their values internally; their control boxes must still fit the viewport.
    const textControl = ['INPUT', 'SELECT', 'TEXTAREA'].includes(bounds.tag);
    assert.ok((textControl || bounds.scroll <= bounds.width) && bounds.left >= 0 && bounds.right <= 320,
      `${label}: each surface and control must fit without clipping: ${JSON.stringify(bounds)}`);
  }
}

test('calendar: the agenda and date controls fit 320 px with actual 200% text', { timeout }, async t => {
  const result = await fixture(t, 'calendar', { longText: true }, { viewport: { width: 320, height: 844 } });
  const { page } = result;
  await readyCalendar(page);
  const due = page.locator('li[data-kind="task"]');
  await doubleText(page, [page.getByRole('heading', { name: 'Calendar', exact: true }), calendarRows(page).locator('h3').first(), page.getByRole('combobox', { name: 'Display timezone', exact: true })]);
  await page.screenshot({ path: path.join(screenshots, 't99-calendar-320-200.png'), fullPage: true });
  await assertFits(page, 'Calendar at 320 px / 200% text', [
    agenda(page), page.getByRole('region', { name: 'Calendar dates', exact: true }),
    due, page.getByLabel('Month', { exact: true }), page.getByRole('combobox', { name: 'Family Space', exact: true }),
    ...await page.getByRole('region', { name: 'Calendar dates', exact: true }).getByRole('button').all(),
  ]);
  await page.getByRole('region', { name: 'Calendar dates', exact: true }).getByRole('button', { name: 'Fri, Oct 2, 2026', exact: true }).click();
  await page.getByRole('heading', { name: 'Fri, Oct 2, 2026', exact: true }).waitFor();
  await assertFits(page, 'Selected calendar day at 200% text', [calendarRows(page).first()]);
  assert.equal((await calls(page, '/api/calendar')).length, 1);
  await assertOffline(result);
});

test('checklist: loading and a failed read require Retry loading without a premature empty state', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { hold: { checklist: true }, readFailures: { checklist: 1 } });
  const { page } = result;
  const dialog = await openChecklist(result, false);
  await dialog.getByText('Loading checklist...', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('No checklist items.', { exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  await release(page, 'checklist');
  await dialog.getByRole('alert').filter({ hasText: 'Synthetic checklist answer is unavailable.' }).waitFor();
  assert.equal((await checklistCalls(page, 'GET')).length, 1);
  await dialog.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).waitFor();
  const reads = await checklistCalls(page, 'GET');
  assert.equal(reads.length, 2);
  assertRead(reads[0], `/api/tasks/${taskId}/checklist`, '');
  assert.deepEqual(reads[1], reads[0]);
  assert.equal((await checklistCalls(page)).length, 0);
  await assertOffline(result);
});

test('checklist: an empty answer stays empty and a read-only answer has no mutation controls', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { emptyChecklist: true, canManage: false, canCheck: false });
  const dialog = await openChecklist(result);
  await dialog.getByText('No checklist items.', { exact: true }).waitFor();
  assert.equal(await dialog.getByText('0 of 0 checked', { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('textbox').count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'Add item', exact: true }).count(), 0);
  assert.equal((await checklistCalls(result.page)).length, 0);
  await assertOffline(result);
});

test('checklist: a lost add answer retries the same key, body and version without showing an unconfirmed item', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { hold: { add: true }, lose: { add: 1 } });
  const { page } = result;
  const dialog = await openChecklist(result);
  await dialog.getByLabel('New item', { exact: true }).fill('  Synthetic travel card  ');
  await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.waitForFunction(() => window.t99Fixture.holding.add === true);
  assert.equal(await dialog.getByRole('checkbox', { name: 'Synthetic travel card', exact: true }).count(), 0);
  assert.equal(await dialog.getByText('Checklist saved.', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.add), 1, 'The simulated server committed, but its answer has not arrived.');
  await assertLocked(page);
  await release(page, 'add');
  await dialog.getByRole('alert').filter({ hasText: 'No connection. Your changes are not confirmed.' }).waitFor();
  await dialog.getByText('The change is unconfirmed.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox', { name: 'Synthetic travel card', exact: true }).count(), 0);
  assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), '  Synthetic travel card  ');
  await assertLocked(page);
  const original = (await checklistCalls(page))[0];
  assertCommand(original, { action: 'add', title: 'Synthetic travel card' }, 1);
  await dialog.getByRole('button', { name: 'Retry original change', exact: true }).click();
  await page.waitForFunction(() => window.t99Fixture.calls.filter(call => call.route.endsWith('/checklist') && call.method === 'POST').length === 2);
  const writes = await checklistCalls(page);
  assert.deepEqual(writes[1], original, 'A lost add answer must reuse the original key, exact JSON and If-Match.');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox', { name: 'Synthetic travel card', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.add), 1);
  assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), '');
  assert.equal(await dialog.getByText('0 of 2 checked', { exact: true }).count(), 1);
  await assertOffline(result);
});

test('checklist: ticking and unticking send the displayed If-Match and wait for each confirmation', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { hold: { check: true } });
  const { page } = result;
  const dialog = await openChecklist(result);
  const checkbox = dialog.getByRole('checkbox', { name: itemTitle, exact: true });
  await checkbox.click();
  await page.waitForFunction(() => window.t99Fixture.calls.some(call => call.route.endsWith('/checklist') && call.method === 'POST'));
  assertCommand((await checklistCalls(page))[0], { action: 'check', item_id: itemId, checked: true }, 1);
  await page.waitForFunction(() => window.t99Fixture.holding.check === true);
  assert.equal(await checkbox.isChecked(), false, 'A pending tick must not be presented as done.');
  assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
  await assertLocked(page);
  await release(page, 'check');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), true);
  await page.waitForFunction(() => !document.querySelector('dialog input[type="checkbox"]').disabled);
  await page.evaluate(() => { window.t99Fixture.hold.check = true; });
  await checkbox.click();
  await page.waitForFunction(() => window.t99Fixture.holding.check === true);
  const writes = await checklistCalls(page);
  assert.equal(writes.length, 2);
  assertCommand(writes[1], { action: 'check', item_id: itemId, checked: false }, 2);
  assert.notEqual(writes[1].headers['idempotency-key'], writes[0].headers['idempotency-key']);
  assert.equal(await checkbox.isChecked(), true, 'A pending untick must keep the last confirmed state.');
  await release(page, 'check');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.check), 2);
  await assertOffline(result);
});

test('checklist: a lost tick stays unchecked and retries the unchanged check key, body and If-Match', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { lose: { check: 1 } });
  const { page } = result;
  const dialog = await openChecklist(result);
  const checkbox = dialog.getByRole('checkbox', { name: itemTitle, exact: true });
  await checkbox.click();
  await dialog.getByText('The change is unconfirmed.', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), false);
  assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
  assert.equal(await dialog.getByText('Checklist saved.', { exact: true }).count(), 0);
  await assertLocked(page);
  const original = (await checklistCalls(page))[0];
  assertCommand(original, { action: 'check', item_id: itemId, checked: true }, 1);
  await dialog.getByRole('button', { name: 'Retry original change', exact: true }).click();
  await page.waitForFunction(() => window.t99Fixture.calls.filter(call => call.route.endsWith('/checklist') && call.method === 'POST').length === 2);
  assert.deepEqual((await checklistCalls(page))[1], original, 'The lost tick must be retried unchanged, even though the server version advanced.');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), true);
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.check), 1);
  await assertOffline(result);
});

for (const status of [409, 412]) {
  test(`checklist: a refused ${status} tick stays unchecked and requires reviewing a reload before a new change`, { timeout }, async t => {
    const result = await fixture(t, 'checklist', { reject: { check: status }, remoteOnRefusal: true });
    const { page } = result;
    const dialog = await openChecklist(result);
    await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Synthetic checklist change was refused.' }).waitFor();
    assert.equal(await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).isChecked(), false, 'A refused change must never be shown as done.');
    assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
    assert.equal(await dialog.getByText('Checklist saved.', { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('checkbox').isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Retry original change', exact: true }).count(), 0);
    const original = (await checklistCalls(page))[0];
    assertCommand(original, { action: 'check', item_id: itemId, checked: true }, 1);
    assert.equal(await page.evaluate(() => window.t99Fixture.writes.check), 0);
    assert.equal((await checklistCalls(page, 'GET')).length, 1, 'A refusal must not silently replace the reviewed basis.');
    await dialog.getByRole('button', { name: 'Reload current checklist', exact: true }).click();
    await dialog.getByText('Discard the current draft and review the latest checklist?', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal((await checklistCalls(page, 'GET')).length, 1);
    await dialog.getByRole('button', { name: 'Reload current checklist', exact: true }).click();
    await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Remote unchecked revision', exact: true }).waitFor();
    assert.equal((await checklistCalls(page, 'GET')).length, 2);
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    await dialog.getByRole('checkbox').click();
    await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
    const writes = await checklistCalls(page);
    assert.equal(writes.length, 2);
    assertCommand(writes[1], { action: 'check', item_id: itemId, checked: true }, 2);
    assert.notEqual(writes[1].headers['idempotency-key'], original.headers['idempotency-key']);
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
    await assertOffline(result);
  });
}

test('checklist: renaming sends only the trimmed title and clears a tick only after confirmation', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { checked: true, hold: { rename: true } });
  const { page } = result;
  const dialog = await openChecklist(result);
  await dialog.getByRole('button', { name: `Edit checklist item: ${itemTitle}`, exact: true }).click();
  await dialog.getByLabel('Item title', { exact: true }).fill('  Reviewed synthetic notebook  ');
  await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.waitForFunction(() => window.t99Fixture.holding.rename === true);
  assertCommand((await checklistCalls(page))[0], { action: 'rename', item_id: itemId, title: 'Reviewed synthetic notebook' }, 1);
  assert.equal(await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).isChecked(), true);
  assert.equal(await dialog.getByRole('checkbox', { name: 'Reviewed synthetic notebook', exact: true }).count(), 0);
  await assertLocked(page, itemTitle, true);
  assert.equal(await dialog.getByRole('button', { name: 'Cancel edit', exact: true }).isDisabled(), true);
  await release(page, 'rename');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox', { name: 'Reviewed synthetic notebook', exact: true }).isChecked(), false);
  assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
  assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), '');
  await assertOffline(result);
});

test('checklist: removing requires a named confirmation; Keep item and Cancel send nothing', { timeout }, async t => {
  const result = await fixture(t, 'checklist', { hold: { remove: true } });
  const { page } = result;
  let dialog = await openChecklist(result);
  const removeButton = () => dialog.getByRole('button', { name: `Remove checklist item: ${itemTitle}`, exact: true });
  await removeButton().click();
  await settle(page);
  assert.equal((await checklistCalls(page)).length, 0, 'Opening the removal review is not permission to remove.');
  await dialog.getByText(`Remove ${itemTitle}?`, { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Keep item', exact: true }).click();
  assert.equal((await checklistCalls(page)).length, 0);
  assert.equal(await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).count(), 1);
  await removeButton().click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await checklistCalls(page)).length, 0, 'Cancelling the dialog must not remove the item.');
  dialog = await openChecklist(result);
  await removeButton().click();
  await dialog.getByText(`Remove ${itemTitle}?`, { exact: true }).waitFor();
  assert.equal((await checklistCalls(page)).length, 0);
  await dialog.getByRole('button', { name: 'Remove item', exact: true }).click();
  await page.waitForFunction(() => window.t99Fixture.holding.remove === true);
  assertCommand((await checklistCalls(page))[0], { action: 'remove', item_id: itemId }, 1);
  assert.equal(await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).count(), 1, 'Removal is not shown until confirmed.');
  assert.equal(await dialog.getByRole('button', { name: 'Keep item', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Close checklist', exact: true }).isDisabled(), true);
  await release(page, 'remove');
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  assert.equal(await dialog.getByText('No checklist items.', { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.remove), 1);
  await assertOffline(result);
});

test('checklist: a stored 200-code-point emoji title accepted by the server is readable', { timeout }, async t => {
  const title = String.fromCodePoint(0x1f9ed).repeat(titleLimit);
  assert.equal([...title].length, 200);
  assert.equal(title.length, 400, 'This fixture distinguishes server characters from UTF-16 units.');
  const result = await fixture(t, 'checklist', { itemTitle: title });
  const dialog = await openChecklist(result);
  assert.equal(await dialog.getByRole('alert').count(), 0, 'A server-valid emoji title must pass the client response schema.');
  assert.equal(await dialog.getByRole('checkbox', { name: title, exact: true }).count(), 1);
  assert.equal(await dialog.getByText('0 of 1 checked', { exact: true }).count(), 1);
  await assertOffline(result);
});

test('checklist: adding and renaming count 200 server characters and reject 201 without sending', { timeout }, async t => {
  const accepted = String.fromCodePoint(0x1f9ed).repeat(titleLimit);
  const renamed = String.fromCodePoint(0x1f680).repeat(titleLimit);
  const result = await fixture(t, 'checklist');
  const { page } = result;
  const dialog = await openChecklist(result);
  await dialog.getByLabel('New item', { exact: true }).fill(accepted);
  assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), accepted, 'A valid 200-character title must not be truncated to 100 emoji.');
  assert.equal(await dialog.getByRole('button', { name: 'Add item', exact: true }).isDisabled(), false);
  await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assertCommand((await checklistCalls(page))[0], { action: 'add', title: accepted }, 1);
  await dialog.getByRole('checkbox', { name: accepted, exact: true }).waitFor();
  const addedId = await page.evaluate(title => window.t99Fixture.items.find(item => item.title === title).id, accepted);
  await dialog.getByRole('button', { name: `Edit checklist item: ${accepted}`, exact: true }).click();
  await dialog.getByLabel('Item title', { exact: true }).fill(renamed);
  assert.equal(await dialog.getByLabel('Item title', { exact: true }).inputValue(), renamed);
  await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  assertCommand((await checklistCalls(page))[1], { action: 'rename', item_id: addedId, title: renamed }, 2);
  assert.equal(await dialog.getByRole('checkbox', { name: renamed, exact: true }).count(), 1);
  for (const rejected of ['A'.repeat(titleLimit + 1), `${accepted}${String.fromCodePoint(0x1f9ed)}`]) {
    await dialog.getByLabel('New item', { exact: true }).fill(rejected);
    assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), rejected, 'Invalid input must be explained, not silently shortened.');
    await dialog.getByText('Use up to 200 characters.', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Add item', exact: true }).isDisabled(), true);
    await dialog.locator('form').evaluate(form => form.requestSubmit());
    await settle(page);
    assert.equal((await checklistCalls(page)).length, 2, 'An over-limit title must never reach the API.');
  }
  await dialog.getByLabel('New item', { exact: true }).fill('');
  await dialog.getByRole('button', { name: `Edit checklist item: ${renamed}`, exact: true }).click();
  await dialog.getByLabel('Item title', { exact: true }).fill('B'.repeat(titleLimit + 1));
  await dialog.getByText('Use up to 200 characters.', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'Save item', exact: true }).isDisabled(), true);
  await dialog.locator('form').evaluate(form => form.requestSubmit());
  await settle(page);
  assert.equal((await checklistCalls(page)).length, 2);
  await assertOffline(result);
});

test('checklist: denied access hides the reviewed items and permits closing without a retry', { timeout }, async t => {
  const result = await fixture(t, 'checklist');
  const { page } = result;
  const dialog = await openChecklist(result);
  await page.evaluate(() => { window.t99Fixture.denyChecklist = 403; });
  await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Synthetic checklist access is unavailable.' }).waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  assert.equal(await dialog.getByText(itemTitle, { exact: true }).count(), 0);
  assert.equal(await dialog.getByLabel('New item', { exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'Retry original change', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'Close checklist', exact: true }).isDisabled(), false);
  await dialog.getByRole('button', { name: 'Close checklist', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.t99Fixture.writes.check), 0);
  await assertOffline(result);
});

test('checklist: items, rename, removal and an unconfirmed retry fit 320 px with actual 200% text', { timeout }, async t => {
  const title = `Synthetic item ${'M'.repeat(180)}`;
  const result = await fixture(t, 'checklist', { longText: true, lose: { rename: 1 } }, { viewport: { width: 320, height: 844 } });
  const { page } = result;
  const dialog = await openChecklist(result);
  await doubleText(page, [dialog.getByRole('heading', { name: 'Task checklist', exact: true }), dialog.locator('h3'), dialog.getByLabel('New item', { exact: true }), itemRow(page, title).locator('label span')]);
  await page.screenshot({ path: path.join(screenshots, 't99-checklist-320-200.png'), fullPage: true });
  await assertFits(page, 'Checklist at 320 px / 200% text', [dialog, itemRow(page, title), dialog.locator('form'), ...await dialog.getByRole('button').all()]);
  await dialog.getByRole('button', { name: `Edit checklist item: ${title}`, exact: true }).click();
  await assertFits(page, 'Checklist rename at 200% text', [dialog, dialog.locator('form'), ...await dialog.getByRole('button').all()]);
  await dialog.getByRole('button', { name: 'Cancel edit', exact: true }).click();
  assert.equal((await checklistCalls(page)).length, 0, 'Cancelling a rename must not save.');
  await dialog.getByRole('button', { name: `Remove checklist item: ${title}`, exact: true }).click();
  await dialog.getByText(`Remove ${title}?`, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshots, 't99-checklist-removal-320-200.png'), fullPage: true });
  await assertFits(page, 'Checklist removal review at 200% text', [dialog, ...await dialog.getByRole('button').all()]);
  await dialog.getByRole('button', { name: 'Keep item', exact: true }).click();
  assert.equal((await checklistCalls(page)).length, 0);
  await dialog.getByRole('button', { name: `Edit checklist item: ${title}`, exact: true }).click();
  await dialog.getByLabel('Item title', { exact: true }).fill(`Reviewed item ${'W'.repeat(170)}`);
  await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
  await dialog.getByText('The change is unconfirmed.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshots, 't99-checklist-unconfirmed-320-200.png'), fullPage: true });
  await assertFits(page, 'Checklist unconfirmed retry at 200% text', [dialog, dialog.getByRole('alert'), ...await dialog.getByRole('button').all()]);
  await dialog.getByRole('button', { name: 'Retry original change', exact: true }).click();
  await dialog.getByText('Checklist saved.', { exact: true }).waitFor();
  await assertFits(page, 'Confirmed renamed checklist at 200% text', [dialog, ...await dialog.getByRole('button').all()]);
  await assertOffline(result);
});
