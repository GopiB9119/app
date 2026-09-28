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
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { TaskScreen } from './src/features/planning/task-screen';
        import './src/app/globals.css';
        createRoot(document.getElementById('root')).render(<Providers><TaskScreen /></Providers>);`,
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
    window.taskFixture = { calls: [], tasks, failCreate: !!options.failCreate, failStatus: !!options.failStatus, conflict: false, denied: false };
    const result = (data, task) => new Response(JSON.stringify({ data, request_id: 'offline-task', ...(Array.isArray(data) ? { pagination: { next_cursor: null, has_more: false } } : {}) }), { status: 200, headers: task ? { ETag: etag(task) } : {} });
    const failure = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-task' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      const call = { route: url.pathname, query: url.search, method, body, headers };
      const state = window.taskFixture;
      state.calls.push(call);
      if (url.pathname === '/api/me') return result({ id: accountId, email: 'alex@example.test', display_name: 'Alex Morgan', timezone: 'Asia/Kolkata', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') return result([{ id: spaceId, name: 'Test family', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z' }]);
      if (state.denied) return failure(404, 'NOT_FOUND', 'Task access is unavailable.');
      if (url.pathname === '/api/tasks/assignees') return result([{ account_id: accountId, display_name: 'Alex Morgan' }, { account_id: memberId, display_name: 'Blair Morgan' }]);
      if (url.pathname === '/api/tasks' && method === 'GET') return result(tasks.filter(task => !url.searchParams.get('status') || task.status === url.searchParams.get('status')).map(project));
      const key = `${method}:${url.pathname}:${headers['idempotency-key']}`;
      if (receipts.has(key)) { const task = tasks.find(item => item.id === receipts.get(key)); return result(project(task), task); }
      if (url.pathname === '/api/tasks' && method === 'POST') {
        const task = makeTask({ title: body.title, description: body.description, due_date: body.due_date, assignee: body.assignee_account_id ? { account_id: body.assignee_account_id, display_name: body.assignee_account_id === memberId ? 'Blair Morgan' : 'Alex Morgan' } : null });
        tasks.push(task); receipts.set(key, task.id);
        if (state.failCreate) { state.failCreate = false; throw new TypeError('Synthetic lost creation response'); }
        return result(project(task), task);
      }
      const task = tasks.find(item => url.pathname === `/api/tasks/${item.id}` || url.pathname === `/api/tasks/${item.id}/status`);
      if (task && method === 'GET') return result(project(task), task);
      if (task && state.conflict && method === 'PATCH') {
        state.conflict = false; task.title = 'Remote revision'; task.version = String(Number(task.version) + 1);
        return failure(412, 'PRECONDITION_FAILED', 'This task changed. Reload and review.');
      }
      if (task && headers['if-match'] !== etag(task)) return failure(412, 'PRECONDITION_FAILED', 'This task changed. Reload and review.');
      if (task && method === 'PATCH') { Object.assign(task, body); task.version = String(Number(task.version) + 1); receipts.set(key, task.id); return result(project(task), task); }
      if (task && method === 'POST' && url.pathname.endsWith('/status')) {
        task.status = body.status; task.version = String(Number(task.version) + 1);
        task.completed_at = body.status === 'completed' ? '2026-09-19T11:00:00Z' : null;
        task.completed_by_account_id = body.status === 'completed' ? accountId : null;
        receipts.set(key, task.id);
        if (state.failStatus) { state.failStatus = false; throw new TypeError('Synthetic lost status response'); }
        return result(project(task), task);
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