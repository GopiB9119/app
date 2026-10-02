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
const evidence = path.join(root, '.local/t98');
const origin = 'http://127.0.0.1:3000';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const memberId = '08854b0c-5b86-4658-bf68-e7ea42caa6f6';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const completedTaskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2f';
const itemId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const seriesId = 'ad88a51c-b2fc-4a0f-a83a-27fcd3ea447d';
const now = '2026-10-02T12:00:00Z';
const scheduled = '2026-10-02T13:05:00Z';
const mixed = '\u0c2e\u0c3e\u0c27\u0c35\u0c3f \u0939\u093f\u0928\u094d\u0926\u0940';
const taskTitle = `Packing ${mixed} <b>literal</b> {title}`;
const completedTitle = `Finished ${mixed}`;
const itemTitle = `Notebook ${mixed} {title}`;
const personName = `Alex ${mixed}`;
const spaceName = `Garden ${mixed}`;
const body = `My notes ${mixed} <b>literal</b> {title}.`;
const serverMessage = 'Use up to 200 characters.';
const modes = ['tasks', 'checklist', 'calendar'];
const timeout = 240_000;
const { messages: texts, diagnostics } = loadMessages();
const android = Object.fromEntries(['en', 'te', 'hi'].map(language => [language,
  readFileSync(path.join(root, `android/app/src/main/res/${language === 'en' ? 'values' : `values-${language}`}/strings.xml`), 'utf8')]));
const text = (language, id, values = {}) => texts[language][`tasks.${id}`].replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
  (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
let browser;
let javascript;
let css;

before(async () => {
  assert.deepEqual(diagnostics, []);
  mkdirSync(evidence, { recursive: true });
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { TaskScreen } from './src/features/planning/task-screen';
        import { CalendarScreen } from './src/features/planning/calendar-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderTasksI18n = () => {
          const { mode, language } = window.tasksI18nFixture;
          root.render(<Providers language={language}>{mode === 'calendar'
            ? <CalendarScreen initialSpaceId="${spaceId}" />
            : <TaskScreen initialSpaceId="${spaceId}" />}</Providers>);
        };
        window.unmountTasksI18n = () => root.unmount();`,
      resolveDir: web, sourcefile: 'offline-i18n-tasks.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(evidence, 'offline-i18n-tasks.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-i18n-tasks', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.tasksI18nFixture.path;', loader: 'js',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true, timeout: 120_000 });
}, { timeout });
after(async () => { await browser?.close(); });

async function fixture(testContext, mode, language, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'America/Los_Angeles' });
  const outbound = [];
  const errors = [];
  const screenPath = mode === 'calendar' ? '/app/calendar' : '/app/tasks';
  await context.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'document' && request.method() === 'GET' && request.url() === origin + screenPath) {
      return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Offline task languages</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(request.url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  testContext.after(async () => {
    if (!page.isClosed()) await page.evaluate(() => window.unmountTasksI18n?.());
    await context.close();
  });
  await page.goto(origin + screenPath);
  await page.clock.setFixedTime(new Date(now));
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, memberId, spaceId, taskId, completedTaskId, itemId, seriesId, now, scheduled, mixed, taskTitle, completedTitle, itemTitle, personName, spaceName, body, serverMessage, mode, language, screenPath, options, origin }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const state = window.tasksI18nFixture = {
      mode, language, path: screenPath, calls: [], unexpected: [], liveOpened: 0, liveClosed: 0,
      hold: { [mode]: !!options.loading }, releases: {}, receipts: {}, loseChecklist: false,
      rejectWrite: false, version: 1, title: options.longText ? `Planning ${mixed} ${'W'.repeat(130)}` : taskTitle,
      itemTitle: options.longText ? `Notebook ${mixed} ${'M'.repeat(130)}` : itemTitle,
      items: [], tasks: [],
    };
    const etag = version => `"${Number(version).toString(16).padStart(64, '0')}"`;
    const reply = (data, version, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-i18n-tasks',
      ...(Array.isArray(data) ? { pagination: { next_cursor: null, has_more: false } } : {}), ...extra }),
    { status: 200, headers: version ? { ETag: etag(version) } : {} });
    const failure = () => new Response(JSON.stringify({ error: { code: 'SYNTHETIC_REFUSAL', message: serverMessage, details: {} }, request_id: 'offline-i18n-tasks' }), { status: 409 });
    const project = task => ({ ...task, etag: etag(task.version), permissions: {
      can_edit: ['open', 'in_progress'].includes(task.status),
      allowed_statuses: task.status === 'completed' ? ['open'] : task.status === 'cancelled' ? [] : ['in_progress', 'completed', 'cancelled'],
    } });
    const makeTask = fields => ({
      id: taskId, space_id: spaceId, title: state.title, description: body, due_date: '2026-10-02', status: 'open',
      assignee: { account_id: memberId, display_name: personName }, assignee_unavailable: false,
      created_by_account_id: accountId, completed_by_account_id: null, completed_at: null,
      created_at: now, updated_at: now, version: '1', ...fields,
    });
    if (!options.empty || mode === 'checklist') {
      state.tasks.push(makeTask({}), makeTask({ id: completedTaskId, title: completedTitle, status: 'completed', completed_at: now, completed_by_account_id: accountId }));
    }
    if (!options.empty) state.items.push({ id: itemId, title: state.itemTitle, checked: true, checked_at: now, checked_by_account_id: accountId },
      { id: memberId, title: `Charger ${mixed}`, checked: false, checked_at: null, checked_by_account_id: null });
    const checklist = () => ({ task_id: taskId, space_id: spaceId, task_title: state.title, task_status: 'open',
      task_version: String(state.version), can_manage: true, can_check: true, items: structuredClone(state.items), etag: etag(state.version) });
    const dayInZone = (instant, timezone) => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
      return ['year', 'month', 'day'].map(kind => parts.find(part => part.type === kind).value).join('-');
    };
    const entries = timezone => {
      const base = { space_id: spaceId, task_id: taskId, source_changed: false, series_id: null };
      return [
        { ...base, id: taskId, kind: 'task', title: state.title, date: '2026-10-02', status: 'open', scheduled_at: null, timezone: null },
        { ...base, id: '11111111-1111-4111-8111-111111111111', kind: 'reminder', title: `Reminder ${mixed}`,
          date: dayInZone(scheduled, timezone), scheduled_at: scheduled, timezone: 'America/New_York', status: 'available', source_changed: true },
        { ...base, id: '22222222-2222-4222-8222-222222222222', kind: 'planned', title: `Repeating ${mixed}`,
          date: dayInZone('2026-10-03T13:05:00Z', timezone), scheduled_at: '2026-10-03T13:05:00Z', timezone: 'America/New_York', status: 'planned', series_id: seriesId },
        { ...base, id: '33333333-3333-4333-8333-333333333333', kind: 'event', task_id: null, title: `Event ${mixed}`,
          date: dayInZone('2026-10-04T13:05:00Z', timezone), scheduled_at: '2026-10-04T13:05:00Z', timezone: 'America/New_York', status: 'scheduled' },
      ];
    };
    const hold = async (name, signal) => {
      if (!state.hold[name]) return;
      state.hold[name] = false;
      await new Promise((resolve, reject) => {
        const abort = () => { delete state.releases[name]; reject(new DOMException('Aborted', 'AbortError')); };
        state.releases[name] = () => { signal?.removeEventListener('abort', abort); delete state.releases[name]; resolve(); };
        signal?.addEventListener('abort', abort, { once: true });
      });
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), origin);
      const route = url.pathname;
      const method = config.method ?? 'GET';
      if (route === '/api/live' && method === 'GET') {
        state.liveOpened += 1;
        let closed = false;
        let controller;
        const close = () => { if (!closed) { closed = true; state.liveClosed += 1; } };
        const stream = new ReadableStream({
          start(value) { controller = value; controller.enqueue(new TextEncoder().encode('event: ready\ndata: {"heartbeat_seconds":15,"max_seconds":1800}\n\n')); },
          cancel: close,
        });
        config.signal?.addEventListener('abort', () => {
          if (!closed) { close(); controller.error(new DOMException('Aborted', 'AbortError')); }
        }, { once: true });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      const command = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route, query: url.search, method, body: command, rawBody: config.body ?? null, headers });
      if (route === '/api/me' && method === 'GET') return reply({ id: accountId, email: 'alex@example.test', display_name: personName, timezone: 'Asia/Kolkata', email_verified: true, version: 1 });
      if (route === '/api/notifications' && method === 'GET') return reply([], null, { unread_count: 0 });
      if (route === '/api/spaces' && method === 'GET') return reply([{ id: spaceId, name: spaceName, space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: now }]);
      if (route === '/api/tasks/assignees' && method === 'GET') return reply([{ account_id: accountId, display_name: personName }, { account_id: memberId, display_name: `Blair ${mixed}` }]);
      if (route === '/api/tasks' && method === 'GET') {
        await hold('tasks', config.signal);
        if (options.refused && mode === 'tasks') return failure();
        const status = url.searchParams.get('status');
        return reply(state.tasks.filter(task => !status || task.status === status).map(project));
      }
      if (route === '/api/calendar' && method === 'GET') {
        await hold('calendar', config.signal);
        if (options.refused) return failure();
        const timezone = url.searchParams.get('timezone');
        const start = url.searchParams.get('start_date');
        const end = url.searchParams.get('end_date');
        return reply(options.empty ? [] : entries(timezone).filter(entry => entry.date >= start && entry.date <= end));
      }
      if (route === `/api/tasks/${taskId}/checklist` && method === 'GET') {
        await hold('checklist', config.signal);
        return options.refused ? failure() : reply(checklist());
      }
      if (route === `/api/tasks/${taskId}/checklist` && method === 'POST') {
        if (state.rejectWrite) return failure();
        const key = headers['idempotency-key'];
        if (state.receipts[key]) return reply(checklist());
        const item = state.items.find(value => value.id === command.item_id);
        if (headers['if-match'] !== etag(state.version)) throw new Error('The checklist fixture received an unreviewed version.');
        if (command.action === 'add') state.items.push({ id: crypto.randomUUID(), title: command.title, checked: false, checked_at: null, checked_by_account_id: null });
        else if (command.action === 'remove') state.items = state.items.filter(value => value.id !== command.item_id);
        else if (command.action === 'rename') Object.assign(item, { title: command.title, checked: false, checked_at: null, checked_by_account_id: null });
        else if (command.action === 'check') Object.assign(item, { checked: command.checked, checked_at: command.checked ? now : null, checked_by_account_id: command.checked ? accountId : null });
        else throw new Error('The checklist fixture received an unknown action.');
        state.version += 1;
        state.tasks[0].version = String(state.version);
        state.receipts[key] = config.body;
        if (state.loseChecklist) { state.loseChecklist = false; throw new TypeError('Synthetic lost checklist answer'); }
        return reply(checklist());
      }
      if (route === '/api/tasks' && method === 'POST') {
        if (state.rejectWrite) return failure();
        const task = makeTask({ ...command, id: crypto.randomUUID(), assignee: command.assignee_account_id ? { account_id: command.assignee_account_id, display_name: personName } : null });
        state.tasks.push(task);
        return reply(project(task), task.version);
      }
      const task = state.tasks.find(value => route === `/api/tasks/${value.id}` || route === `/api/tasks/${value.id}/status`);
      if (task && method === 'GET') return reply(project(task), task.version);
      if (task && (method === 'PATCH' || route.endsWith('/status') && method === 'POST')) {
        if (state.rejectWrite) return failure();
        if (headers['if-match'] !== etag(task.version)) throw new Error('The task fixture received an unreviewed version.');
        Object.assign(task, command);
        if (route.endsWith('/status')) Object.assign(task, { completed_at: command.status === 'completed' ? now : null, completed_by_account_id: command.status === 'completed' ? accountId : null });
        task.version = String(Number(task.version) + 1);
        return reply(project(task), task.version);
      }
      state.unexpected.push(`${method} ${route}${url.search}`);
      throw new Error(`No offline fixture answer: ${method} ${route}`);
    };
  }, { accountId, memberId, spaceId, taskId, completedTaskId, itemId, seriesId, now, scheduled, mixed, taskTitle, completedTitle, itemTitle, personName, spaceName, body, serverMessage, mode, language, screenPath, options, origin });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderTasksI18n());
  await page.getByRole('main').getByRole('heading', { name: text(language, mode === 'calendar' ? 'calendarTitle' : 'familyTasks'), exact: true }).waitFor();
  if (mode !== 'calendar') await page.locator('select[name="task_assignee"] option').filter({ hasText: personName }).waitFor({ state: 'attached' });
  if (mode === 'checklist') {
    await page.getByRole('button', { name: text(language, 'checklistTitle', { title: options.longText ? `Planning ${mixed} ${'W'.repeat(130)}` : taskTitle }), exact: true }).click();
    await page.getByRole('dialog', { name: text(language, 'checklistHeading'), exact: true }).waitFor();
  }
  const result = { context, page, mode, language, outbound, errors };
  if (options.loading) await page.getByText(text(language, mode === 'tasks' ? 'loadingList' : mode === 'checklist' ? 'loadingChecklist' : 'calendarLoadingList'), { exact: true }).waitFor();
  else if (options.refused) await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
  else if (options.empty) await page.getByText(text(language, mode === 'tasks' ? 'noTasks' : mode === 'checklist' ? 'noItems' : 'calendarEmpty'), { exact: true }).waitFor();
  else if (mode === 'calendar') await page.locator('li[data-kind="planned"]').waitFor();
  else if (mode === 'checklist') await page.getByRole('dialog').getByRole('checkbox', { name: options.longText ? `Notebook ${mixed} ${'M'.repeat(130)}` : itemTitle, exact: true }).waitFor();
  else await page.getByRole('heading', { name: options.longText ? `Planning ${mixed} ${'W'.repeat(130)}` : taskTitle, exact: true }).waitFor();
  return result;
}

async function expectedDate(page, language, value, options) {
  return page.evaluate(({ language, value, options }) => new Intl.DateTimeFormat(language === 'en' ? 'en' : `${language}-IN`, options).format(new Date(value)), { language, value, options });
}

async function assertTaskDate({ page, language }) {
  const due = await expectedDate(page, language, '2026-10-02T12:00:00Z', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  await page.getByRole('main').getByText(due, { exact: true }).first().waitFor({ state: 'attached' });
  const completed = await expectedDate(page, language, now, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  assert.equal(await page.getByText(text(language, 'completedAt', { date: completed }), { exact: true }).count(), 1);
}

async function assertClean({ page, outbound, errors }) {
  assert.deepEqual(await page.evaluate(() => window.tasksI18nFixture.unexpected), [], 'Every API call needs an explicit fixture answer.');
  assert.equal(await page.evaluate(() => window.tasksI18nFixture.calls.some(call => call.route === '/api/live')), false, 'The live stream is not a counted API call.');
  assert.ok(await page.evaluate(() => window.tasksI18nFixture.liveOpened > 0));
  await page.evaluate(() => window.unmountTasksI18n());
  await page.waitForFunction(() => window.tasksI18nFixture.liveOpened === window.tasksI18nFixture.liveClosed);
  assert.deepEqual(outbound, [], 'No real network request may be attempted.');
  assert.deepEqual(errors, [], 'The screens must have no page or console errors.');
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, main section, main form, dialog[open], .app-header, .app-footer, .main-nav')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select, textarea')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 160)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay inside the viewport.`);
}

async function doubleText(page) {
  await page.setViewportSize({ width: 320, height: 844 });
  const original = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize), heading: parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize) }));
  await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
  const enlarged = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize), heading: parseFloat(getComputedStyle(document.querySelector('main h1')).fontSize) }));
  for (const key of Object.keys(original)) assert.equal(enlarged[key], original[key] * 2, `${key} text must genuinely double.`);
}

test('tasks-dictionary: matching English labels reuse independent Android Telugu and Hindi drafts', { timeout }, async testContext => {
  const context = await browser.newContext();
  testContext.after(() => context.close());
  const page = await context.newPage();
  const native = await page.evaluate(xml => Object.fromEntries(Object.entries(xml).map(([language, content]) => [language,
    Object.fromEntries([...new DOMParser().parseFromString(content, 'application/xml').querySelectorAll('string')].map(element => [element.getAttribute('name'), element.textContent]))])), android);
  const pairs = {
    new: 'tasks_new', edit: 'tasks_edit', save: 'tasks_save', titleLabel: 'task_title', notes: 'task_notes', dueDate: 'task_due_date',
    assignee: 'task_assignee', unassigned: 'tasks_unassigned', noDueDate: 'tasks_no_due_date', more: 'tasks_load_more', allStatuses: 'tasks_all_statuses',
    statusOpen: 'task_status_open', statusInProgress: 'task_status_in_progress', statusCompleted: 'task_status_completed', statusCancelled: 'task_status_cancelled',
    start: 'task_start', complete: 'task_complete', cancel: 'task_cancel', checklistHeading: 'checklist_title', noItems: 'checklist_empty',
    newItem: 'checklist_new', itemTitle: 'checklist_item_title', addItem: 'checklist_add', saveItem: 'checklist_save', keepItem: 'checklist_keep', removeItem: 'checklist_remove_item',
    calendarTitle: 'calendar_title', calendarTimezone: 'calendar_timezone', calendarPrevious: 'calendar_previous', calendarNext: 'calendar_next',
    calendarToday: 'calendar_today', calendarRefresh: 'calendar_refresh', calendarInbox: 'calendar_in_inbox', calendarTasks: 'calendar_open_tasks', calendarReminders: 'calendar_open_reminders', calendarMore: 'calendar_more',
  };
  for (const [id, name] of Object.entries(pairs)) {
    assert.equal(text('en', id), native.en[name], `${id}: reuse applies only to matching English.`);
    for (const language of ['te', 'hi']) assert.equal(text(language, id), native[language][name], `${language} ${id}: independent Android draft.`);
  }
  console.log(`tasks message ids: ${Object.keys(texts.en).filter(id => id.startsWith('tasks.')).length}`);
});

for (const language of ['te', 'hi']) {
  test(`${language}: task list, editor and status actions translate without changing private content or API values`, { timeout }, async testContext => {
    const result = await fixture(testContext, 'tasks', language);
    const { page } = result;
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('heading', { name: text(language, 'new'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text(language, 'create'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text(language, 'refresh'), exact: true }).getAttribute('title'), text(language, 'refresh'));
    const row = main.getByRole('listitem').filter({ has: page.getByRole('heading', { name: taskTitle, exact: true }) });
    assert.equal(await row.getByText(text(language, 'statusOpen'), { exact: true }).count(), 1);
    assert.equal(await main.getByLabel(text(language, 'familySpace'), { exact: true }).locator('option:checked').textContent(), spaceName);
    await row.getByText(personName, { exact: true }).waitFor();
    await main.locator('details').first().locator('summary').click();
    await main.getByText(body, { exact: true }).first().waitFor();
    assert.equal(await main.locator('b').count(), 0);
    await assertTaskDate(result);
    await main.getByRole('button', { name: text(language, 'editTitle', { title: taskTitle }), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: text(language, 'edit'), exact: true });
    assert.equal(await dialog.getByLabel(text(language, 'titleLabel'), { exact: true }).inputValue(), taskTitle);
    assert.equal(await dialog.getByLabel(text(language, 'notes'), { exact: true }).inputValue(), body);
    assert.equal(await dialog.getByLabel(text(language, 'dueDate'), { exact: true }).inputValue(), '2026-10-02');
    const revised = `Edited ${mixed} {title}`;
    await dialog.getByLabel(text(language, 'titleLabel'), { exact: true }).fill(revised);
    await dialog.getByRole('button', { name: text(language, 'save'), exact: true }).click();
    await main.getByText(text(language, 'saved'), { exact: true }).waitFor();
    const edited = await page.evaluate(() => window.tasksI18nFixture.calls.find(call => call.method === 'PATCH'));
    assert.deepEqual(edited.body, { title: revised });
    await main.getByRole('button', { name: text(language, 'actionTitle', { action: text(language, 'complete'), title: revised }), exact: true }).click();
    const review = page.getByRole('dialog', { name: text(language, 'confirmAction', { action: text(language, 'complete') }), exact: true });
    await review.getByRole('button', { name: text(language, 'complete'), exact: true }).click();
    await main.getByText(text(language, 'changedCompleted'), { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.tasksI18nFixture.calls.find(call => call.route.endsWith('/status')).body), { status: 'completed' });
    await main.getByLabel(text(language, 'status'), { exact: true }).selectOption('cancelled');
    await main.getByText(text(language, 'noTasks'), { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.tasksI18nFixture.calls.some(call => call.route === '/api/tasks' && call.query.includes('status=cancelled'))));
    await assertClean(result);
  });

  test(`${language}: checklist labels, plural counts and confirmations preserve mixed-script item titles`, { timeout }, async testContext => {
    const result = await fixture(testContext, 'checklist', language);
    const { page } = result;
    const dialog = page.getByRole('dialog', { name: text(language, 'checklistHeading'), exact: true });
    assert.equal(await dialog.getByRole('heading', { name: taskTitle, exact: true }).count(), 1);
    await dialog.getByText(text(language, 'checklistCountOne', { checked: 1, total: 2 }), { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: text(language, 'addItem'), exact: true }).count(), 1);
    await assertTaskDate(result);
    await dialog.getByRole('checkbox', { name: itemTitle, exact: true }).click();
    await dialog.getByText(text(language, 'checklistSaved'), { exact: true }).waitFor();
    await dialog.getByText(text(language, 'checklistCountOther', { checked: 0, total: 2 }), { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.tasksI18nFixture.calls.find(call => call.method === 'POST').body), { action: 'check', item_id: itemId, checked: false });
    await dialog.getByRole('button', { name: text(language, 'editItemTitle', { title: itemTitle }), exact: true }).click();
    assert.equal(await dialog.getByLabel(text(language, 'itemTitle'), { exact: true }).inputValue(), itemTitle);
    assert.equal(await dialog.getByRole('button', { name: text(language, 'saveItem'), exact: true }).count(), 1);
    await dialog.getByRole('button', { name: text(language, 'cancelEdit'), exact: true }).click();
    await dialog.getByRole('button', { name: text(language, 'removeItemTitle', { title: itemTitle }), exact: true }).click();
    await dialog.getByText(text(language, 'confirmRemoveItem', { title: itemTitle }), { exact: true }).waitFor();
    await dialog.getByRole('button', { name: text(language, 'keepItem'), exact: true }).click();
    assert.equal(await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.method === 'POST').length), 1);
    await dialog.getByLabel(text(language, 'newItem'), { exact: true }).fill('W'.repeat(201));
    await dialog.getByRole('alert').filter({ hasText: text(language, 'maxCharacters', { count: 200 }) }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: text(language, 'addItem'), exact: true }).isDisabled(), true);
    const newTitle = `Bottle ${mixed} {title}`;
    await dialog.getByLabel(text(language, 'newItem'), { exact: true }).fill(newTitle);
    await dialog.getByRole('button', { name: text(language, 'addItem'), exact: true }).click();
    await dialog.getByRole('checkbox', { name: newTitle, exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.method === 'POST').at(-1).body), { action: 'add', title: newTitle });
    await assertClean(result);
  });

  test(`${language}: calendar agenda actions, statuses and dates follow language without changing query values`, { timeout }, async testContext => {
    const result = await fixture(testContext, 'calendar', language);
    const { page } = result;
    const main = page.getByRole('main');
    assert.equal(await main.getByRole('heading', { name: text(language, 'calendarAgenda'), exact: true }).count(), 1);
    for (const id of ['calendarPrevious', 'calendarNext', 'calendarRefresh', 'calendarToday']) assert.equal(await main.getByRole('button', { name: text(language, id), exact: true }).count(), 1);
    assert.equal(await main.getByLabel(text(language, 'familySpace'), { exact: true }).locator('option:checked').textContent(), spaceName);
    await main.getByText(text(language, 'calendarInbox'), { exact: true }).waitFor();
    await main.getByText(text(language, 'calendarPlanned'), { exact: true }).waitFor();
    const row = main.locator('li[data-kind="task"]');
    assert.equal(await row.getByRole('heading').textContent(), taskTitle);
    const options = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const day = await expectedDate(page, language, now, options);
    assert.equal(await row.locator('p').first().textContent(), `${day} ${text(language, 'dueDate')}`);
    const time = await expectedDate(page, language, scheduled, { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
    assert.equal(await main.locator('li[data-kind="reminder"] p span').textContent(), time);
    await main.getByRole('button', { name: day, exact: true }).click();
    await main.getByRole('heading', { name: day, exact: true }).waitFor();
    await main.getByRole('button', { name: text(language, 'calendarAllDates'), exact: true }).click();
    const labels = await main.locator('section[aria-label] > div[aria-hidden="true"] span').allTextContents();
    const expected = await page.evaluate(language => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(`${language}-IN`, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 20 + index)))), language);
    assert.deepEqual(labels, expected);
    await main.getByLabel(text(language, 'calendarTimezone'), { exact: true }).selectOption('UTC');
    await main.locator('li[data-kind="reminder"]').waitFor();
    assert.equal(await main.locator('li[data-kind="reminder"] p span').textContent(), await expectedDate(page, language, scheduled, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }));
    const call = await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.route === '/api/calendar').at(-1));
    assert.deepEqual(Object.fromEntries(new URLSearchParams(call.query)), { space_id: spaceId, start_date: '2026-10-01', end_date: '2026-10-31', timezone: 'UTC', limit: '50' });
    await assertClean(result);
  });

  test(`${language}: task title and notes limits translate locally and send mixed-script drafts unchanged`, { timeout }, async testContext => {
    const result = await fixture(testContext, 'tasks', language);
    const { page } = result;
    const main = page.getByRole('main');
    await main.getByLabel(text(language, 'titleLabel'), { exact: true }).fill('W'.repeat(201));
    await main.getByRole('button', { name: text(language, 'create'), exact: true }).click();
    await main.getByRole('alert').filter({ hasText: text(language, 'maxCharacters', { count: 200 }) }).waitFor();
    assert.equal(await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.method === 'POST').length), 0);
    const title = `New ${mixed} {title}`;
    await main.getByLabel(text(language, 'titleLabel'), { exact: true }).fill(title);
    await main.getByLabel(text(language, 'notes'), { exact: true }).fill('W'.repeat(5001));
    await main.getByRole('button', { name: text(language, 'create'), exact: true }).click();
    await main.getByRole('alert').filter({ hasText: text(language, 'maxCharacters', { count: 5000 }) }).waitFor();
    assert.equal(await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.method === 'POST').length), 0);
    await main.getByLabel(text(language, 'notes'), { exact: true }).fill(body);
    await main.getByLabel(text(language, 'dueDate'), { exact: true }).fill('2026-10-05');
    await main.getByLabel(text(language, 'assignee'), { exact: true }).selectOption(memberId);
    await main.getByRole('button', { name: text(language, 'create'), exact: true }).click();
    await main.getByText(text(language, 'created'), { exact: true }).waitFor();
    await main.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.tasksI18nFixture.calls.find(call => call.method === 'POST').body), { space_id: spaceId, title, description: body, due_date: '2026-10-05', assignee_account_id: memberId });
    await assertClean(result);
  });
}

for (const mode of modes) {
  test(`te: ${mode} empty state is translated without invented content`, { timeout }, async testContext => {
    const result = await fixture(testContext, mode, 'te', { empty: true });
    const { page } = result;
    const id = mode === 'tasks' ? 'noTasks' : mode === 'checklist' ? 'noItems' : 'calendarEmpty';
    await page.getByText(text('te', id), { exact: true }).waitFor();
    const scope = mode === 'checklist' ? page.getByRole('dialog') : page.getByRole('main');
    const action = mode === 'tasks' ? 'create' : mode === 'checklist' ? 'addItem' : 'calendarToday';
    assert.equal(await scope.getByRole('button', { name: text('te', action), exact: true }).count(), 1);
    await assertClean(result);
  });

  test(`te: ${mode} loading state does not pretend to be empty`, { timeout }, async testContext => {
    const result = await fixture(testContext, mode, 'te', { loading: true });
    const { page } = result;
    const empty = mode === 'tasks' ? 'noTasks' : mode === 'checklist' ? 'noItems' : 'calendarEmpty';
    assert.equal(await page.getByText(text('te', empty), { exact: true }).count(), 0);
    await page.evaluate(mode => window.tasksI18nFixture.releases[mode](), mode);
    if (mode === 'checklist') await page.getByRole('dialog').getByRole('checkbox', { name: itemTitle, exact: true }).waitFor();
    else await page.getByRole('main').getByRole('heading', { name: taskTitle, exact: true }).waitFor();
    await assertClean(result);
  });
}

test('te: server refusal text stays English even when it matches a translated local validation message', { timeout }, async testContext => {
  for (const mode of modes) {
    const result = await fixture(testContext, mode, 'te', { refused: true });
    const alert = result.page.getByRole('alert').filter({ hasText: serverMessage });
    assert.equal(await alert.count(), 1);
    assert.ok((await alert.textContent()).includes(serverMessage));
    assert.equal(await result.page.getByText(text('te', 'maxCharacters', { count: 200 }), { exact: true }).count(), 0);
    await assertClean(result);
  }
});

test('te: conflicted calendar events and calendar-file download remain exactly English', { timeout }, async testContext => {
  const result = await fixture(testContext, 'calendar', 'te');
  const { page } = result;
  const row = page.locator('li[data-kind="event"]');
  assert.equal(await row.getByRole('heading').textContent(), `Event ${mixed}`);
  assert.equal(await row.getByText('scheduled', { exact: true }).count(), 1);
  assert.equal(await row.getByText('Event in America/New_York', { exact: true }).count(), 1);
  assert.equal(await row.getByRole('link', { name: 'Space events', exact: true }).count(), 1);
  const day = await expectedDate(page, 'en', '2026-10-04T12:00:00Z', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = await expectedDate(page, 'en', '2026-10-04T13:05:00Z', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
  assert.equal(await row.locator('p').first().textContent(), `${day} ${time}`);
  assert.equal(await page.getByRole('button', { name: 'Download calendar file', exact: true }).count(), 1);
  await page.getByText("A copy of this month's entries, for another calendar app. It does not update when things change here.", { exact: true }).waitFor();
  await assertClean(result);
});

for (const mode of modes) {
  test(`te: ${mode} fits 320 px at genuinely doubled text including its secondary controls`, { timeout }, async testContext => {
    const result = await fixture(testContext, mode, 'te', { longText: true });
    const { page } = result;
    await page.evaluate(() => document.fonts.ready);
    await assertFits(page, `${mode}: desktop`);
    await page.screenshot({ path: path.join(evidence, `tasks-${mode}-te-desktop.png`), fullPage: true });
    await doubleText(page);
    await assertFits(page, `${mode}: Telugu 320 px / 200% text`);
    if (mode === 'tasks') {
      const title = await page.evaluate(() => window.tasksI18nFixture.title);
      await page.getByRole('button', { name: text('te', 'editTitle', { title }), exact: true }).click();
      await assertFits(page, 'task editor: Telugu 320 px / 200% text');
      await page.getByRole('dialog').getByRole('button', { name: text('te', 'closeDialog'), exact: true }).click();
      await page.getByRole('button', { name: text('te', 'actionTitle', { action: text('te', 'complete'), title }), exact: true }).click();
      await assertFits(page, 'task status confirmation: Telugu 320 px / 200% text');
    } else if (mode === 'checklist') {
      const dialog = page.getByRole('dialog');
      const title = await page.evaluate(() => window.tasksI18nFixture.itemTitle);
      await dialog.getByRole('button', { name: text('te', 'editItemTitle', { title }), exact: true }).click();
      await assertFits(page, 'checklist editor: Telugu 320 px / 200% text');
      await dialog.getByRole('button', { name: text('te', 'closeChecklist'), exact: true }).click();
      await dialog.getByText(text('te', 'discardChecklistClose'), { exact: true }).waitFor();
      await assertFits(page, 'checklist discard confirmation: Telugu 320 px / 200% text');
      await dialog.getByRole('button', { name: text('te', 'keepEditing'), exact: true }).click();
      await dialog.getByRole('button', { name: text('te', 'cancelEdit'), exact: true }).click();
      await dialog.getByRole('button', { name: text('te', 'removeItemTitle', { title }), exact: true }).click();
      await assertFits(page, 'checklist removal: Telugu 320 px / 200% text');
      await dialog.getByRole('button', { name: text('te', 'keepItem'), exact: true }).click();
      await dialog.getByLabel(text('te', 'newItem'), { exact: true }).fill(`Bottle ${mixed}`);
      await page.evaluate(() => { window.tasksI18nFixture.loseChecklist = true; });
      await dialog.getByRole('button', { name: text('te', 'addItem'), exact: true }).click();
      await dialog.getByText(text('te', 'unconfirmed'), { exact: true }).waitFor();
      await assertFits(page, 'checklist unconfirmed retry: Telugu 320 px / 200% text');
      await dialog.getByRole('button', { name: text('te', 'retryChange'), exact: true }).click();
      await dialog.getByText(text('te', 'checklistSaved'), { exact: true }).waitFor();
      const writes = await page.evaluate(() => window.tasksI18nFixture.calls.filter(call => call.method === 'POST'));
      assert.equal(writes.length, 2);
      assert.equal(writes[0].rawBody, writes[1].rawBody);
      assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
      assert.equal(writes[0].headers['if-match'], writes[1].headers['if-match']);
    } else {
      const day = await expectedDate(page, 'te', now, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      await page.getByRole('button', { name: day, exact: true }).click();
      await assertFits(page, 'selected calendar date: Telugu 320 px / 200% text');
    }
    await page.screenshot({ path: path.join(evidence, `tasks-${mode}-te-320-200.png`), fullPage: true });
    await assertClean(result);
  });
}