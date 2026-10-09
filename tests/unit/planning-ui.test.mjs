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
const memberId = '08854b0c-5b86-4658-bf68-e7ea42caa6f6';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
let browser;
let componentBundle;
let styles;

before(async () => {
  const result = await build({
    stdin: {
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { TaskScreen } from './src/features/planning/task-screen';
        import './src/app/globals.css';
        function Probe() {
          const client = useQueryClient();
          useEffect(() => {
            window.refreshTaskFixture = prefix => client.refetchQueries({ queryKey: [prefix], type: 'active' });
          }, [client]);
          return null;
        }
        createRoot(document.getElementById('root')).render(<Providers><TaskScreen initialSpaceId={window.taskProps?.spaceId ?? ''} initialTaskId={window.taskProps?.taskId ?? ''} /><Probe /></Providers>);`,
      resolveDir: web, loader: 'tsx', sourcefile: 'offline-task-fixture.tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-task-fixture.js'), loader: { '.otf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-task-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  componentBundle = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  styles = result.outputFiles.find(file => file.path.endsWith('.css')).text;
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
  await page.setContent('<html><head><title>Offline family task component</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: styles });
  await page.evaluate(({ accountId, memberId, spaceId, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const tasks = [];
    const receipts = new Map();
    function etag(task) { return `"${'a'.repeat(60)}${Number(task.version).toString(16).padStart(4, '0')}"`; }
    function permissions(task) {
      return options.reader ? { can_edit: false, allowed_statuses: [] }
        : { can_edit: ['open', 'in_progress'].includes(task.status), allowed_statuses: task.status === 'cancelled' ? [] : task.status === 'completed' ? ['open'] : ['in_progress', 'completed', 'cancelled'] };
    }
    function project(task) { return { ...task, permissions: permissions(task), etag: etag(task) }; }
    function makeTask(fields = {}) {
      return {
        id: crypto.randomUUID(), space_id: spaceId, title: 'Buy groceries', description: 'Fruit and bread',
        due_date: '2026-09-21', status: 'open', assignee: null, assignee_unavailable: false,
        created_by_account_id: accountId, completed_by_account_id: null, completed_at: null,
        created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', version: '1', ...fields,
      };
    }
    if (options.seed) tasks.push(makeTask({ title: options.title ?? 'Buy groceries' }));
    // A task a search result names can lie beyond the pages the list has read; the fixture keeps it out of the list, not out of reach.
    const unlisted = new Set();
    if (options.unlistedTask) {
      tasks.push(makeTask({ id: options.unlistedTask, title: 'Pay the water bill', status: 'completed', completed_by_account_id: accountId, completed_at: '2026-09-20T09:00:00Z' }));
      unlisted.add(options.unlistedTask);
    }
    window.taskProps = options.open ? { spaceId, taskId: options.open } : undefined;
    window.taskFixture = { calls: [], tasks, failCreate: !!options.failCreate, failStatus: !!options.failStatus, conflict: false, denied: false, responseMismatch: options.responseMismatch ?? null, listMismatch: false, nextCursor: options.nextCursor ?? null };
    const result = (data, task, pagination = { next_cursor: null, has_more: false }) => new Response(JSON.stringify({ data, request_id: 'offline-task', ...(Array.isArray(data) ? { pagination } : {}) }), { status: 200, headers: task ? { ETag: etag(task) } : {} });
    const failure = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-task' }), { status });
    const reply = (task, operation) => {
      const data = project(task);
      if (window.taskFixture.responseMismatch === operation || window.taskFixture.responseMismatch === `${operation}-space`) {
        const wrongSpace = operation === 'create' || window.taskFixture.responseMismatch.endsWith('-space');
        window.taskFixture.responseMismatch = null;
        if (wrongSpace) data.space_id = memberId;
        else data.id = memberId;
      }
      return result(data, task);
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      const call = { route: url.pathname, query: url.search, method, body, headers };
      const state = window.taskFixture;
      state.calls.push(call);
      if (url.pathname === '/api/me') return result({ id: accountId, email: 'alex@example.test', display_name: 'Alex Morgan', timezone: 'Asia/Kolkata', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') {
        if (state.holdSpacesRead) {
          state.holdSpacesRead = false;
          await new Promise(resolve => { state.releaseSpacesRead = resolve; });
        }
        if (state.spacesReadFailure === 'offline') throw new TypeError('Synthetic Space-list connection failure');
        if (state.spacesReadFailure) return failure(state.spacesReadFailure, 'UNAVAILABLE', 'The Space list could not be refreshed.');
        return result(state.spaceRemoved ? [] : [{ id: spaceId, name: 'Test family', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z', ...(options.agentOff ? { agent_enabled: false } : {}) }]);
      }
      if (state.denied) return failure(404, 'NOT_FOUND', 'Task access is unavailable.');
      if (url.pathname === '/api/tasks/assignees') return result([{ account_id: accountId, display_name: 'Alex Morgan' }, { account_id: memberId, display_name: 'Blair Morgan' }]);
      if (url.pathname === '/api/tasks' && method === 'GET') {
        const data = tasks.filter(task => !unlisted.has(task.id) && (!url.searchParams.get('status') || task.status === url.searchParams.get('status'))).map(project);
        if (state.listMismatch) for (const item of data) item.space_id = memberId;
        return result(data, undefined, { next_cursor: state.nextCursor, has_more: state.nextCursor !== null });
      }
      const key = `${method}:${url.pathname}:${headers['idempotency-key']}`;
      if (receipts.has(key)) { const task = tasks.find(item => item.id === receipts.get(key)); return result(project(task), task); }
      if (url.pathname === '/api/tasks' && method === 'POST') {
        const task = makeTask({ title: body.title, description: body.description, due_date: body.due_date, assignee: body.assignee_account_id ? { account_id: body.assignee_account_id, display_name: body.assignee_account_id === memberId ? 'Blair Morgan' : 'Alex Morgan' } : null });
        tasks.push(task); receipts.set(key, task.id);
        if (state.failCreate) { state.failCreate = false; throw new TypeError('Synthetic lost creation response'); }
        return reply(task, 'create');
      }
      const task = tasks.find(item => url.pathname === `/api/tasks/${item.id}` || url.pathname === `/api/tasks/${item.id}/status`);
      if (task && method === 'GET') {
        if (state.holdOpenedRead === task.id) {
          state.holdOpenedRead = null;
          await new Promise(resolve => { state.releaseOpenedRead = resolve; });
        }
        if (state.openedReadFailure?.taskId === task.id) return failure(state.openedReadFailure.status, 'UNAVAILABLE', 'Opened task is unavailable.');
        return reply(task, 'read');
      }
      if (!task && method === 'GET' && /^\/api\/tasks\/[0-9a-f-]{36}$/.test(url.pathname)) return failure(404, 'NOT_FOUND', 'Task not found.');
      if (task && state.conflict && method === 'PATCH') {
        state.conflict = false; task.title = 'Remote revision'; task.version = String(Number(task.version) + 1);
        return failure(412, 'PRECONDITION_FAILED', 'This task changed. Reload and review.');
      }
      if (task && headers['if-match'] !== etag(task)) return failure(412, 'PRECONDITION_FAILED', 'This task changed. Reload and review.');
      if (task && method === 'PATCH') { Object.assign(task, body); task.version = String(Number(task.version) + 1); receipts.set(key, task.id); return reply(task, 'edit'); }
      if (task && method === 'POST' && url.pathname.endsWith('/status')) {
        task.status = body.status; task.version = String(Number(task.version) + 1);
        task.completed_at = body.status === 'completed' ? '2026-09-19T11:00:00Z' : null;
        task.completed_by_account_id = body.status === 'completed' ? accountId : null;
        receipts.set(key, task.id);
        if (state.failStatus) { state.failStatus = false; throw new TypeError('Synthetic lost status response'); }
        return reply(task, 'status');
      }
      throw new Error(`No external network is permitted: ${method} ${url.pathname}`);
    };
  }, { accountId, memberId, spaceId, options });
  await page.addScriptTag({ content: componentBundle });
  await page.getByRole('heading', { name: 'Family tasks', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'New task', exact: true }).waitFor();
  await page.locator('select[name="task_assignee"] option').filter({ hasText: 'Blair Morgan' }).waitFor({ state: 'attached' });
  assert.equal(await page.getByLabel('Assignee', { exact: true }).count(), 1,
    await page.locator('select[name="task_assignee"]').evaluate(select => select.labels[0].textContent));
  return { page, outbound, errors };
}

async function checkRecoveryControl(page, control, width) {
  if (width === 320) {
    const originalSize = await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
  }
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  const bounds = await control.boundingBox();
  assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return document.activeElement === element && (hit === element || element.contains(hit));
  }), true);
}

for (const width of [1280, 320]) {
  for (const kind of ['status', 'due']) {
    test(`offline task filter recovery: ${kind} rejects contradictory rows at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const { page, outbound, errors } = await fixture(context, { seed: true, nextCursor: 'filter+cursor' });
        await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Load more tasks', exact: true }).waitFor();
        await page.evaluate(kind => {
          const originalFetch = window.fetch;
          window.taskFilterMismatch = true;
          window.taskFilterDate = null;
          window.fetch = async (input, config = {}) => {
            const response = await originalFetch(input, config);
            const url = new URL(String(input), 'https://offline.invalid');
            const selected = kind === 'status' ? url.searchParams.get('status') : url.searchParams.get('due_from');
            if (url.pathname !== '/api/tasks' || (config.method ?? 'GET') !== 'GET' || !selected) return response;
            window.taskFilterDate = url.searchParams.get('due_from');
            const body = await response.json();
            if (window.taskFilterMismatch) for (const task of body.data) {
              if (kind === 'status') task.status = 'in_progress';
              else task.due_date = null;
            }
            return Response.json(body, { status: response.status, headers: response.headers });
          };
        }, kind);
        const filter = page.locator(kind === 'status' ? 'select[aria-labelledby="task-filter-label"]' : 'select[name="task_due_filter"]');
        const selected = kind === 'status' ? 'open' : 'today';
        await filter.selectOption(selected);
        const problem = page.getByRole('alert').filter({ hasText: 'Reload tasks to continue.' });
        await problem.waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Load more tasks', exact: true }).count(), 0);
        assert.equal(await filter.inputValue(), selected);
        const retry = problem.getByRole('button', { name: 'Retry', exact: true });
        if (width === 320) {
          const originalSize = await retry.evaluate(button => parseFloat(getComputedStyle(button).fontSize));
          await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('html, body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
            for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
          });
          assert.equal(await retry.evaluate(button => parseFloat(getComputedStyle(button).fontSize)), originalSize * 2);
        }
        await retry.scrollIntoViewIfNeeded();
        await retry.focus();
        assert.equal(await retry.evaluate(button => button === document.activeElement), true);
        const bounds = await retry.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 44);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(root, `.local/screenshots/task-filter-recovery-${kind}-${width}.png`), fullPage: true });
        await page.evaluate(() => {
          window.taskFilterMismatch = false;
          window.taskFixture.nextCursor = null;
          window.taskFixture.tasks[0].title = 'Reviewed groceries';
          if (window.taskFilterDate) window.taskFixture.tasks[0].due_date = window.taskFilterDate;
        });
        await retry.click();
        await page.getByRole('heading', { name: 'Reviewed groceries', exact: true }).waitFor();
        assert.equal(await filter.inputValue(), selected);
        assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
        const calls = await page.evaluate(() => window.taskFixture.calls);
        const reads = calls.filter(call => call.route === '/api/tasks' && call.method === 'GET');
        assert.equal(reads.at(-1).query, reads.at(-2).query);
        assert.equal(calls.some(call => call.method !== 'GET'), false);
        assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
}

for (const agentOff of [false, true]) test(`offline empty tasks say what to do next${agentOff ? ' without an Ask Agent link when the agent is off' : ', including Ask Agent'}, and a filter explains itself`, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  try {
    const { page, outbound, errors } = await fixture(context, { agentOff });
    const list = page.getByRole('region', { name: 'Tasks', exact: true });
    await list.getByRole('heading', { name: 'Nothing planned yet', exact: true }).waitFor();
    const ask = list.getByRole('link', { name: 'Ask Agent', exact: true });
    if (agentOff) {
      await list.getByText('Add the first task with the form on this page.', { exact: true }).waitFor();
      assert.equal(await ask.count(), 0);
    } else {
      await list.getByText("Add the first task with the form on this page, or ask the Agent in this Space's chat to help.", { exact: true }).waitFor();
      assert.equal(await ask.getAttribute('href'), `/app/messages?space_id=${spaceId}&ask=agent`);
      const box = await ask.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44, JSON.stringify(box));
    }
    await page.getByLabel('Status', { exact: true }).selectOption({ label: 'Completed' });
    await list.getByRole('heading', { name: 'No tasks in this view', exact: true }).waitFor();
    await list.getByText('Try another status, person or due date.', { exact: true }).waitFor();
    assert.equal(await list.getByRole('link', { name: 'Ask Agent', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => window.taskFixture.calls.every(call => call.method === 'GET')), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline task drafts survive a temporary Space-list failure and its read-only retry', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true });
    await page.getByLabel('Task title', { exact: true }).fill('Plan the picnic');
    await page.getByLabel('Notes', { exact: true }).fill('Bring fruit and water');
    await page.getByLabel('Due date', { exact: true }).fill('2026-10-10');
    await page.getByLabel('Assignee', { exact: true }).selectOption(memberId);
    await page.evaluate(async () => {
      window.taskFixture.spacesReadFailure = 503;
      await window.refreshTaskFixture('spaces');
    });
    const failure = page.getByRole('alert').filter({ hasText: 'The Space list could not be refreshed.' });
    await failure.waitFor();
    assert.equal(await page.getByLabel('Task title', { exact: true }).count(), 1, 'A transient list outage must not unmount the task draft.');
    assert.equal(await page.getByLabel('Task title', { exact: true }).inputValue(), 'Plan the picnic');
    assert.equal(await page.getByLabel('Notes', { exact: true }).inputValue(), 'Bring fruit and water');
    assert.equal(await page.getByLabel('Due date', { exact: true }).inputValue(), '2026-10-10');
    assert.equal(await page.getByLabel('Assignee', { exact: true }).inputValue(), memberId);
    assert.equal(await page.getByLabel('Family Space', { exact: true }).isDisabled(), true);
    const retry = failure.getByRole('button', { name: 'Retry', exact: true });
    const originalSize = await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await retry.scrollIntoViewIfNeeded();
    const bounds = await retry.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= 320);
    await page.screenshot({ path: path.join(root, '.local/screenshots/task-draft-space-outage-320-20261007.png'), fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true, 'The unsaved-change warning must survive the failed refresh.');
    const before = await page.evaluate(() => window.taskFixture.calls.length);
    await page.evaluate(() => window.fetch('/api/live').catch(() => null));
    await page.evaluate(() => {
      window.taskFixture.spacesReadFailure = null;
      window.taskFixture.holdSpacesRead = true;
    });
    await retry.click();
    await page.waitForFunction(() => typeof window.taskFixture.releaseSpacesRead === 'function');
    assert.equal(await page.getByLabel('Task title', { exact: true }).inputValue(), 'Plan the picnic');
    await page.evaluate(() => { window.taskFixture.releaseSpacesRead(); window.taskFixture.releaseSpacesRead = null; });
    await failure.waitFor({ state: 'detached' });
    const retryCalls = await page.evaluate(start => window.taskFixture.calls.slice(start)
      .filter(call => call.method !== 'GET' || call.route !== '/api/live').map(call => [call.method, call.route]), before);
    assert.deepEqual(retryCalls, [['GET', '/api/spaces']]);
    assert.equal(await page.evaluate(() => window.taskFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByText('Task created.', { exact: true }).waitFor();
    const created = await page.evaluate(() => window.taskFixture.tasks.find(task => task.title === 'Plan the picnic'));
    assert.equal(created.description, 'Bring fruit and water');
    assert.equal(created.due_date, '2026-10-10');
    assert.equal(created.assignee.account_id, memberId);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const operation of ['create', 'edit', 'status']) for (const failure of [503, 'offline']) {
  test(`offline task ${operation} retains its unconfirmed command across a ${failure} Space-list refresh`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, { seed: operation !== 'create', responseMismatch: operation });
      if (operation === 'create') {
        await page.getByLabel('Task title', { exact: true }).fill('Keep this creation');
        await page.getByLabel('Due date', { exact: true }).fill('2026-10-10');
        await page.getByLabel('Assignee', { exact: true }).selectOption(memberId);
        await page.getByRole('button', { name: 'Create task', exact: true }).click();
      } else if (operation === 'edit') {
        await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
        await page.getByRole('dialog').getByLabel('Task title', { exact: true }).fill('Keep this revision');
        await page.getByRole('dialog').getByRole('button', { name: 'Save task', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Complete task', exact: true }).click();
      }
      const surface = operation === 'create' ? page.getByRole('main') : page.getByRole('dialog');
      await surface.getByRole('alert').getByText('The task result could not be confirmed.', { exact: true }).waitFor();
      const retry = surface.getByRole('button', { name: operation === 'status' ? 'Retry action' : 'Retry save', exact: true });
      await page.evaluate(async failure => {
        window.taskFixture.spacesReadFailure = failure;
        await window.refreshTaskFixture('spaces');
      }, failure);
      const readFailure = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Retry', exact: true }) });
      await readFailure.waitFor({ state: 'attached' });
      assert.equal(await retry.count(), 1, 'The original command must not disappear with a temporary Space-list failure.');
      assert.equal(await page.getByLabel('Family Space', { exact: true }).isDisabled(), true);
      if (operation !== 'create') assert.equal(await surface.getByRole('button', { name: 'Close task dialog', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(() => window.taskFixture.calls.filter(call => call.method !== 'GET').length), 1);
      await page.evaluate(async () => {
        window.taskFixture.spacesReadFailure = null;
        await window.refreshTaskFixture('spaces');
      });
      await readFailure.waitFor({ state: 'detached' });
      await retry.click();
      await page.getByText(operation === 'create' ? 'Task created.' : operation === 'edit' ? 'Task saved.' : 'Task is completed.', { exact: true }).waitFor();
      const writes = await page.evaluate(() => window.taskFixture.calls.filter(call => call.method !== 'GET'));
      assert.equal(writes.length, 2);
      assert.equal(writes[1].route, writes[0].route);
      assert.equal(writes[1].method, writes[0].method);
      assert.equal(writes[1].headers['idempotency-key'], writes[0].headers['idempotency-key']);
      assert.equal(writes[1].headers['if-match'], writes[0].headers['if-match']);
      assert.deepEqual(writes[1].body, writes[0].body);
      assert.equal(writes[1].headers['x-account-id'], accountId);
      const tasks = await page.evaluate(() => window.taskFixture.tasks);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].version, operation === 'create' ? '1' : '2');
      if (operation === 'create') {
        assert.equal(tasks[0].due_date, '2026-10-10');
        assert.equal(tasks[0].assignee.account_id, memberId);
      }
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('offline task edit recovery keeps the original reviewed version after a temporary Space-list failure', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true });
    await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Task title', { exact: true }).fill('My private draft');
    const original = await page.evaluate(() => window.taskFixture.tasks[0].version);
    await page.evaluate(async () => {
      window.taskFixture.spacesReadFailure = 503;
      await window.refreshTaskFixture('spaces');
    });
    assert.equal(await dialog.count(), 1);
    assert.equal(await dialog.getByLabel('Task title', { exact: true }).inputValue(), 'My private draft');
    await page.evaluate(async () => {
      window.taskFixture.tasks[0].title = 'A newer server title';
      window.taskFixture.tasks[0].version = '2';
      window.taskFixture.spacesReadFailure = null;
      await window.refreshTaskFixture('spaces');
    });
    await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'This task changed. Reload and review.' }).waitFor();
    const writes = await page.evaluate(() => window.taskFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].headers['if-match'], `"${'a'.repeat(60)}${Number(original).toString(16).padStart(4, '0')}"`);
    assert.equal(await dialog.getByLabel('Task title', { exact: true }).inputValue(), 'My private draft');
    assert.equal(await dialog.getByRole('button', { name: 'Save task', exact: true }).isDisabled(), true);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const reload = dialog.getByRole('button', { name: 'Discard edits and reload', exact: true });
    await reload.scrollIntoViewIfNeeded();
    const bounds = await reload.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= 320);
    await reload.click();
    await page.waitForFunction(() => document.querySelector('dialog input[name="task_title"]')?.value === 'A newer server title');
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const loss of [403, 404, 'removed']) {
  test(`offline task access loss ${loss} hides the draft and does not restore it from cached Space data`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { seed: true });
      await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Task title', { exact: true }).fill('No longer authorized draft');
      await page.evaluate(async loss => {
        if (loss === 'removed') window.taskFixture.spaceRemoved = true;
        else window.taskFixture.spacesReadFailure = loss;
        await window.refreshTaskFixture('spaces');
      }, loss);
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Task title', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Save task', exact: true }).count(), 0);
      if (loss === 'removed') await page.getByRole('heading', { name: 'No family Spaces yet', exact: true }).waitFor();
      else await page.getByRole('alert').filter({ hasText: 'The Space list could not be refreshed.' }).waitFor();
      await page.evaluate(async () => {
        window.taskFixture.spaceRemoved = false;
        window.taskFixture.spacesReadFailure = null;
        await window.refreshTaskFixture('spaces');
      });
      await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByLabel('Task title', { exact: true }).inputValue(), '');
      assert.equal(await page.evaluate(() => window.taskFixture.calls.filter(call => call.method !== 'GET').length), 0);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('offline tasks create once after an uncertain response and retain exact due date and assignee', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { failCreate: true });
    await page.getByLabel('Task title', { exact: true }).fill('Buy groceries');
    await page.getByLabel('Notes', { exact: true }).fill('Fruit and bread');
    await page.getByLabel('Due date', { exact: true }).fill('2026-09-21');
    await page.getByLabel('Assignee', { exact: true }).selectOption(memberId);
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByLabel('Task title', { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Family Space', { exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await page.getByText('Task created.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 1);
    const writes = await page.evaluate(() => window.taskFixture.calls.filter(call => call.route === '/api/tasks' && call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.equal(writes[0].body.due_date, '2026-09-21');
    assert.equal(writes[0].body.assignee_account_id, memberId);
    assert.equal('reminder' in writes[0].body, false);
    assert.equal(await page.getByLabel('Task title', { exact: true }).inputValue(), '');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline tasks keep status retry identity and show completion then reopening', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, failStatus: true });
    await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Complete task', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Close task dialog', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Retry action', exact: true }).click();
    await page.getByText('Task is completed.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).count(), 0);
    const writes = await page.evaluate(() => window.taskFixture.calls.filter(call => call.route.endsWith('/status') && call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.equal(writes[0].headers['if-match'], writes[1].headers['if-match']);
    await page.getByRole('button', { name: 'Reopen task: Buy groceries', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reopen task', exact: true }).click();
    await page.getByText('Task is open.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) {
  for (const [operation, responseMismatch] of [
    ['create', 'create'], ['edit', 'edit'], ['status', 'status'], ['edit', 'edit-space'], ['status', 'status-space'],
  ]) {
    test(`offline task response integrity: ${responseMismatch} recovers exactly once at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const { page, outbound, errors } = await fixture(context, { seed: operation !== 'create', responseMismatch });
        let review = page;
        if (operation === 'create') {
          await page.getByLabel('Task title', { exact: true }).fill('Buy groceries');
          await page.getByRole('button', { name: 'Create task', exact: true }).click();
        } else if (operation === 'edit') {
          await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
          review = page.getByRole('dialog');
          await review.getByLabel('Task title', { exact: true }).fill('Reviewed groceries');
          await review.getByRole('button', { name: 'Save task', exact: true }).click();
        } else {
          await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).click();
          review = page.getByRole('dialog');
          await review.getByRole('button', { name: 'Complete task', exact: true }).click();
        }
        await review.getByRole('alert').filter({ hasText: 'The task result could not be confirmed.' }).waitFor();
        const success = operation === 'create' ? 'Task created.' : operation === 'edit' ? 'Task saved.' : 'Task is completed.';
        assert.equal(await page.getByText(success, { exact: true }).count(), 0);
        assert.equal(await page.locator('select[aria-labelledby="task-space-label"]').isDisabled(), true);
        if (operation !== 'create') assert.equal(await review.getByRole('button', { name: 'Close task dialog', exact: true }).isDisabled(), true);
        if (operation !== 'status') assert.equal(await review.getByLabel('Task title', { exact: true }).isDisabled(), true);
        const retry = review.getByRole('button', { name: operation === 'status' ? 'Retry action' : 'Retry save', exact: true });
        await checkRecoveryControl(page, retry, width);
        await page.screenshot({ path: path.join(root, `.local/screenshots/task-integrity-${responseMismatch}-${width}.png`), fullPage: width !== 320 });
        await retry.click();
        await page.getByText(success, { exact: true }).waitFor();
        const state = await page.evaluate(() => ({ tasks: window.taskFixture.tasks, writes: window.taskFixture.calls.filter(call => call.method !== 'GET') }));
        assert.equal(state.tasks.length, 1);
        assert.equal(state.tasks[0].space_id, spaceId);
        assert.equal(state.tasks[0].version, operation === 'create' ? '1' : '2');
        assert.equal(state.tasks[0].status, operation === 'status' ? 'completed' : 'open');
        assert.equal(state.tasks[0].title, operation === 'edit' ? 'Reviewed groceries' : 'Buy groceries');
        assert.equal(state.writes.length, 2);
        assert.deepEqual(state.writes[0], state.writes[1]);
        assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  for (const responseMismatch of ['read', 'read-space']) {
    test(`offline task response integrity: ${responseMismatch} reload preserves the draft at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const { page, outbound, errors } = await fixture(context, { seed: true, responseMismatch });
        await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Task title', { exact: true }).fill('Stale edit');
        await page.evaluate(() => { window.taskFixture.conflict = true; });
        await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
        await dialog.getByRole('alert').filter({ hasText: 'This task changed' }).waitFor();
        const reload = dialog.getByRole('button', { name: 'Discard edits and reload', exact: true });
        await reload.click();
        await dialog.getByRole('alert').filter({ hasText: 'Reload the task to continue.' }).waitFor();
        assert.equal(await dialog.getByLabel('Task title', { exact: true }).inputValue(), 'Stale edit');
        assert.equal(await dialog.getByRole('button', { name: 'Save task', exact: true }).isDisabled(), true);
        assert.equal(await page.getByText('Task saved.', { exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => window.taskFixture.calls.filter(call => call.method === 'PATCH').length), 1);
        await checkRecoveryControl(page, reload, width);
        await page.screenshot({ path: path.join(root, `.local/screenshots/task-integrity-${responseMismatch}-reload-${width}.png`), fullPage: width !== 320 });
        await reload.click();
        await page.waitForFunction(() => document.querySelector('dialog input[name="task_title"]')?.value === 'Remote revision');
        await dialog.getByLabel('Task title', { exact: true }).fill('Reviewed groceries');
        await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
        await page.getByText('Task saved.', { exact: true }).waitFor();
        const state = await page.evaluate(() => ({ tasks: window.taskFixture.tasks, writes: window.taskFixture.calls.filter(call => call.method === 'PATCH') }));
        assert.equal(state.tasks.length, 1);
        assert.equal(state.tasks[0].title, 'Reviewed groceries');
        assert.equal(state.writes.length, 2);
        assert.equal(state.writes[0].route, state.writes[1].route);
        assert.equal(state.writes[1].route, `/api/tasks/${state.tasks[0].id}`);
        assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  test(`offline task list recovery hides an invalid page and its cached cursor at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const { page, outbound, errors } = await fixture(context, { seed: true, nextCursor: 'first+cursor' });
      await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Load more tasks', exact: true }).waitFor();
      await page.evaluate(() => { window.taskFixture.listMismatch = true; });
      await page.getByRole('button', { name: 'Refresh tasks', exact: true }).click();
      const error = page.getByRole('alert').filter({ hasText: 'Reload tasks to continue.' });
      await error.waitFor();
      await checkRecoveryControl(page, error.getByRole('button', { name: 'Retry', exact: true }), width);
      assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Load more tasks', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).count(), 0);
      await page.evaluate(() => {
        window.taskFixture.listMismatch = false;
        window.taskFixture.nextCursor = null;
        window.taskFixture.tasks[0].title = 'Reviewed groceries';
      });
      await error.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('heading', { name: 'Reviewed groceries', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.taskFixture.calls.some(call => call.method !== 'GET')), false);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('offline task editing keeps drafts on conflict and reload requires an explicit choice', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true });
    await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Task title', { exact: true }).fill('Stale edit');
    await page.evaluate(() => { window.taskFixture.conflict = true; });
    await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'This task changed' }).waitFor();
    assert.equal(await dialog.getByLabel('Task title', { exact: true }).inputValue(), 'Stale edit');
    assert.equal(await dialog.getByRole('button', { name: 'Save task', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Discard edits and reload', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('dialog input[name="task_title"]')?.value === 'Remote revision');
    await dialog.getByLabel('Task title', { exact: true }).fill('Reviewed edit');
    await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.getByText('Task saved.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Reviewed edit', exact: true }).waitFor();
    const writes = await page.evaluate(() => window.taskFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(writes.length, 2);
    assert.notEqual(writes[0].headers['if-match'], writes[1].headers['if-match']);
    assert.notEqual(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.deepEqual(Object.keys(writes[1].body), ['title']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline task reader has no mutation controls and denied refresh clears protected content', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, reader: true });
    await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Buy groceries', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).count(), 0);
    await page.evaluate(() => { window.taskFixture.denied = true; });
    await page.getByRole('button', { name: 'Refresh tasks', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Task access is unavailable' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Buy groceries', exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline task layout supports long titles and desktop/mobile screenshots without network', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const title = `Family task ${'A'.repeat(170)}`;
    const { page, outbound, errors } = await fixture(context, { seed: true, title });
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '.local/screenshots/tasks-offline-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await page.getByRole('heading', { name: title, exact: true }).boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
      const dialog = await page.getByRole('dialog').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
      await page.getByRole('dialog').getByRole('button', { name: 'Close task dialog', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/tasks-offline-mobile.png'), fullPage: true });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) {
  test(`offline task refresh updates both the list and the search-opened task at ${width}px`, async () => {
    const pinned = '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e44';
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const { page, outbound, errors } = await fixture(context, { seed: true, unlistedTask: pinned, open: pinned });
      const row = page.locator(`#task-${pinned}`);
      await row.getByRole('heading', { name: 'Pay the water bill', exact: true }).waitFor();
      await page.evaluate(taskId => {
        window.taskFixture.holdOpenedRead = taskId;
        for (const task of window.taskFixture.tasks) {
          task.title = task.id === taskId ? 'Updated water bill' : 'Updated groceries';
          task.version = '2';
        }
      }, pinned);
      const refresh = page.getByRole('button', { name: 'Refresh tasks', exact: true });
      await refresh.click();
      await page.getByRole('heading', { name: 'Updated groceries', exact: true }).waitFor();
      await page.waitForFunction(() => typeof window.taskFixture.releaseOpenedRead === 'function');
      await refresh.and(page.locator(':disabled')).waitFor();
      assert.equal(await refresh.locator('svg.spin').count(), 1, 'Refresh must stay busy until the opened task answers.');
      const calls = await page.evaluate(() => window.taskFixture.calls);
      const openedReads = calls.filter(call => call.method === 'GET' && call.route === `/api/tasks/${pinned}`);
      assert.equal(openedReads.length, 2, 'Refresh must read the opened task as well as the list.');
      assert.ok(openedReads.every(call => call.headers['x-account-id'] === accountId));
      await page.evaluate(() => { window.taskFixture.releaseOpenedRead(); window.taskFixture.releaseOpenedRead = null; });
      await row.getByRole('heading', { name: 'Updated water bill', exact: true }).waitFor();
      assert.equal(await refresh.isEnabled(), true);
      assert.equal(await refresh.locator('svg.spin').count(), 0);
      assert.equal(await row.getAttribute('aria-current'), 'location');
      assert.equal(await page.getByRole('heading', { name: 'Pay the water bill', exact: true }).count(), 0);
      assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
      if (width === 320) {
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
          document.documentElement.style.fontSize = '200%';
          for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
        });
      }
      await refresh.evaluate(element => { element.focus(); element.scrollIntoView({ block: 'center' }); });
      const bounds = await refresh.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.width >= 44 && bounds.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await refresh.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.activeElement === element && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/task-refresh-opened-${width}.png`) });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const status of [403, 404, 503]) {
  test(`offline task refresh removes an unavailable search task after ${status} without hiding the list`, async () => {
    const pinned = '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e44';
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    try {
      const { page, outbound, errors } = await fixture(context, { seed: true, unlistedTask: pinned, open: pinned });
      const row = page.locator(`#task-${pinned}`);
      await row.getByRole('heading', { name: 'Pay the water bill', exact: true }).waitFor();
      await page.evaluate(({ taskId, status }) => {
        window.taskFixture.openedReadFailure = { taskId, status };
        window.taskFixture.tasks.find(task => task.id !== taskId).title = 'Updated groceries';
      }, { taskId: pinned, status });
      const refresh = page.getByRole('button', { name: 'Refresh tasks', exact: true });
      await refresh.click();
      const error = page.getByRole('alert').filter({ hasText: 'That task is no longer available to you.' });
      await error.waitFor();
      assert.equal(await row.count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Reopen task: Pay the water bill', exact: true }).count(), 0);
      await page.getByRole('heading', { name: 'Updated groceries', exact: true }).waitFor();
      assert.equal(await refresh.isEnabled(), true);
      await page.evaluate(taskId => {
        window.taskFixture.openedReadFailure = null;
        window.taskFixture.tasks.find(task => task.id === taskId).title = 'Reviewed water bill';
      }, pinned);
      await error.getByRole('button', { name: 'Retry', exact: true }).click();
      await row.getByRole('heading', { name: 'Reviewed water bill', exact: true }).waitFor();
      assert.equal(await error.count(), 0);
      const calls = await page.evaluate(() => window.taskFixture.calls);
      assert.equal(calls.filter(call => call.method === 'GET' && call.route === `/api/tasks/${pinned}`).length, 3);
      assert.equal(calls.filter(call => call.method === 'GET' && call.route === '/api/tasks').length, 2);
      assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('offline task refresh without a search result reads only the list', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true });
    await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    await page.evaluate(() => { window.taskFixture.tasks[0].title = 'Updated groceries'; });
    await page.getByRole('button', { name: 'Refresh tasks', exact: true }).click();
    await page.getByRole('heading', { name: 'Updated groceries', exact: true }).waitFor();
    const calls = await page.evaluate(() => window.taskFixture.calls);
    assert.equal(calls.filter(call => call.route === '/api/tasks').length, 2);
    assert.equal(calls.filter(call => call.route.startsWith('/api/tasks/') && call.route !== '/api/tasks/assignees').length, 0);
    assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// DEC-051: a task result of the Space search opens that very task, even one the list has not read yet.
test('offline tasks open the task a search result names above the list, mark it and put focus on it', async () => {
  const pinned = '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e44';
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, unlistedTask: pinned, open: pinned });
    const row = page.locator(`#task-${pinned}`);
    await row.waitFor();
    assert.equal(await row.getAttribute('aria-current'), 'location');
    assert.equal(await row.getByText('Opened from search', { exact: true }).count(), 1);
    assert.equal(await row.getByRole('heading', { name: 'Pay the water bill', exact: true }).count(), 1);
    await page.waitForFunction(id => document.activeElement?.closest('li')?.id === `task-${id}`, pinned);
    // It comes first, and the tasks the list read are still there and not marked.
    assert.equal((await page.locator('li[id^="task-"]').evaluateAll(items => items.map(item => item.id)))[0], `task-${pinned}`);
    await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    assert.equal(await page.locator('li[aria-current="location"]').count(), 1);
    assert.equal(await page.getByRole('alert').filter({ hasText: 'no longer available' }).count(), 0);
    // The one task was read by its own address in the same Space, and nothing was written.
    const reads = await page.evaluate(() => window.taskFixture.calls.filter(call => call.route.startsWith('/api/tasks/') && call.route !== '/api/tasks/assignees'));
    assert.deepEqual(reads.map(call => `${call.method} ${call.route}`), [`GET /api/tasks/${pinned}`]);
    assert.equal(await page.evaluate(() => window.taskFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline tasks say so when the task a search result named is no longer available', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, open: '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e55' });
    await page.getByRole('alert').filter({ hasText: 'That task is no longer available to you.' }).waitFor();
    assert.equal(await page.locator('li[aria-current="location"]').count(), 0);
    await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const status of [403, 404, 503]) for (const width of [1280, 320]) {
  test(`offline opened task recovery hides cached content after ${status} and retries its read at ${width}px`, async () => {
    const pinned = '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e44';
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const { page, outbound, errors } = await fixture(context, { seed: true, unlistedTask: pinned, open: pinned });
      const row = page.locator(`#task-${pinned}`);
      await row.getByRole('heading', { name: 'Pay the water bill', exact: true }).waitFor();
      await page.evaluate(({ taskId, status }) => { window.taskFixture.openedReadFailure = { taskId, status }; }, { taskId: pinned, status });
      await page.getByLabel('Task title', { exact: true }).fill('Fresh household task');
      await page.getByRole('button', { name: 'Create task', exact: true }).click();
      const error = page.getByRole('alert').filter({ hasText: 'That task is no longer available to you.' });
      await error.waitFor();
      assert.equal(await row.count(), 0, 'An unavailable search result must not retain its cached task or actions.');
      assert.equal(await page.getByRole('button', { name: 'Reopen task: Pay the water bill', exact: true }).count(), 0);
      await page.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Fresh household task', exact: true }).waitFor();
      const retry = error.getByRole('button', { name: 'Retry', exact: true });
      assert.equal(await retry.count(), 1, 'The single-task read needs its own read-only recovery.');
      if (width === 320) {
        const originalSize = await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
          document.documentElement.style.fontSize = '200%';
          for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
        });
        assert.equal(await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      }
      await retry.evaluate(element => { element.focus(); element.scrollIntoView({ block: 'center' }); });
      const bounds = await retry.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.width >= 44 && bounds.height >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await retry.evaluate(element => {
        const box = element.getBoundingClientRect();
        return document.activeElement === element && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true);
      if (status === 503) await page.screenshot({ path: path.join(root, `.local/screenshots/task-opened-recovery-${width}.png`) });
      await page.evaluate(taskId => {
        window.taskFixture.openedReadFailure = null;
        window.taskFixture.holdOpenedRead = taskId;
        window.taskFixture.tasks.find(task => task.id === taskId).title = 'Reviewed water bill';
      }, pinned);
      await retry.click();
      await page.waitForFunction(() => typeof window.taskFixture.releaseOpenedRead === 'function');
      await retry.and(page.locator(':disabled')).waitFor();
      assert.equal(await row.count(), 0, 'Starting a retry must not reveal the rejected cached task.');
      assert.equal(await retry.isDisabled(), true);
      await page.evaluate(() => { window.taskFixture.releaseOpenedRead(); window.taskFixture.releaseOpenedRead = null; });
      await row.getByRole('heading', { name: 'Reviewed water bill', exact: true }).waitFor();
      assert.equal(await row.getAttribute('aria-current'), 'location');
      assert.equal(await page.getByRole('heading', { name: 'Pay the water bill', exact: true }).count(), 0);
      assert.equal(await error.count(), 0);
      const calls = await page.evaluate(() => window.taskFixture.calls);
      const reads = calls.filter(call => call.method === 'GET' && call.route === `/api/tasks/${pinned}`);
      assert.equal(reads.length, 3);
      assert.ok(reads.every(call => call.headers['x-account-id'] === accountId));
      assert.deepEqual(calls.filter(call => call.method !== 'GET').map(call => [call.method, call.route]), [['POST', '/api/tasks']]);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

// T100: the server counts characters, an emoji counting once. The title field takes 200 emoji and the created task shows;
// a longer title is explained before anything is sent.
test('offline task titles take 200 emoji and a longer title is explained before anything is sent', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, {});
    const title = page.getByLabel('Task title', { exact: true });
    const posts = () => page.evaluate(() => window.taskFixture.calls.filter(call => call.route === '/api/tasks' && call.method === 'POST'));
    await title.focus();
    // Typed input is held to the field's maxLength, as a person's typing is.
    await page.keyboard.insertText('a'.repeat(201));
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Use up to 200 characters.' }).waitFor();
    assert.equal((await posts()).length, 0);
    const emoji = '\u{1F600}'.repeat(200);
    await title.fill('');
    await title.focus();
    await page.keyboard.insertText(emoji);
    assert.equal(await title.inputValue(), emoji, 'The title field must take 200 emoji.');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByText('Task created.', { exact: true }).waitFor();
    const writes = await posts();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body.title, emoji);
    assert.equal(await page.getByRole('heading', { name: emoji, exact: true }).count(), 1, 'The list must show a title the server accepted.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});