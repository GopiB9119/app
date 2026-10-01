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
const memoryId = '7b0c2f4e-5d1a-4c3b-9e8f-1a2b3c4d5e6f';
const firstEtag = `"${'1'.padStart(64, '0')}"`;
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { AgentScreen } from './src/features/agents/agent-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderAgentFixture = () => root.render(<Providers><AgentScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-agent.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-agent.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-agent-dependencies', setup(builder) {
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

// One person with two Spaces and one saved note. Every request is answered inside the page and the network is blocked.
// As the API does, a new request is idempotent by its key, a decision is refused unless If-Match names the approval the
// person reviewed, and an approval already decided with the same key returns the stored result instead of acting again.
// `loseAsks` and `loseApprovals` apply the write and then lose the response.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent('<html><head><title>Offline agent</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, clubId, memoryId, options }) => {
    let keys = 0;
    let ids = 0;
    let tags = 0;
    let clock = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++keys).toString(16).padStart(12, '0')}`, configurable: true });
    const newId = () => `10000000-0000-4000-9000-${(++ids).toString(16).padStart(12, '0')}`;
    const nextTag = () => `"${(++tags).toString(16).padStart(64, '0')}"`;
    const at = () => new Date(Date.UTC(2026, 9, 1, 9, 0, ++clock)).toISOString();
    const spaces = [[spaceId, 'Morgan family'], [clubId, 'Garden club']].map(([id, name]) => ({
      id, name, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z',
    }));
    const state = window.agentFixture = {
      calls: [], runs: [], byKey: {}, decisions: {}, questions: [], created: [], unexpected: [],
      memories: [{ id: memoryId, kind: 'note', key: null, label: 'Note', content: 'Prefers mornings', source: 'agent', source_run_id: null, created_at: '2026-09-30T08:00:00Z' }],
      loseAsks: options.loseAsks ?? 0, loseApprovals: options.loseApprovals ?? 0, pageSize: options.pageSize ?? 20,
    };
    const run = (space, message) => {
      const now = at();
      return {
        id: newId(), space_id: space, message, status: 'running', outcome: null, stop_reason: null, intent: null, answer: null,
        question: null, approval: null, plan: [], tool_calls: [], evidence: [], events: [], created_at: now, updated_at: now, finished_at: null, version: '1',
      };
    };
    const propose = (item, toolName, summary, fields) => Object.assign(item, {
      status: 'waiting_for_approval', version: String(Number(item.version) + 1), approval: {
        id: newId(), run_id: item.id, space_id: item.space_id, tool_name: toolName, risk: 'low', summary, fields, status: 'pending',
        reason: null, result_ref: null, created_at: at(), expires_at: '2026-10-02T09:00:00Z', decided_at: null, version: '1', etag: nextTag(),
      },
    });
    const finish = (item, status, answer, extra) => Object.assign(item, {
      status, answer, question: null, finished_at: at(), updated_at: at(), version: String(Number(item.version) + 1), ...extra,
    });
    for (let number = 1; number <= (options.seedRuns ?? 0); number += 1) {
      state.runs.push(finish(run(spaceId, `Earlier request ${number}`), 'completed', 'You have no open tasks.', { outcome: 'answered' }));
    }
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-agent', ...extra }), { status: 200 });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-agent' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: Object.fromEntries(url.searchParams), method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces' && method === 'GET') return reply(spaces, { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/agent-runs' && method === 'GET') {
        const mine = state.runs.filter(item => item.space_id === url.searchParams.get('space_id'));
        const start = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor').slice('after-'.length)) : 0;
        const more = start + state.pageSize < mine.length;
        return reply(mine.slice(start, start + state.pageSize), { pagination: { next_cursor: more ? `after-${start + state.pageSize}` : null, has_more: more } });
      }
      if (url.pathname === '/api/agent-runs' && method === 'POST') {
        const key = headers['idempotency-key'];
        if (!key) return failed(428, 'PRECONDITION_REQUIRED', 'Send an Idempotency-Key.');
        if (state.byKey[key] && state.byKey[key].message !== body.message) return failed(409, 'IDEMPOTENCY_CONFLICT', 'Review the changed request.');
        if (!state.byKey[key]) {
          const item = run(body.space_id, body.message);
          if (/^remind me/i.test(body.message)) {
            const question = { id: newId(), text: 'What time should I remind you?', expires_at: '2026-10-02T09:00:00Z' };
            state.questions.push(question.id);
            Object.assign(item, { status: 'waiting_for_user', question });
          } else {
            propose(item, 'tasks.create', 'Create this task.', [
              { label: 'Space', value: spaces.find(space => space.id === body.space_id).name }, { label: 'Title', value: options.title ?? 'Water the plants' },
              { label: 'Due date', value: '2 October 2026' }, { label: 'Assigned to', value: 'You' },
            ]);
          }
          state.byKey[key] = item;
          state.runs.unshift(item);
          if (state.loseAsks > 0) { state.loseAsks -= 1; throw new TypeError('Synthetic lost response after the request was saved'); }
        }
        return reply(state.byKey[key]);
      }
      const step = url.pathname.match(/^\/api\/agent-runs\/([^/]+)\/(resume|cancel)$/);
      const target = step && state.runs.find(item => item.id === step[1]);
      if (target && method === 'POST' && step[2] === 'resume') {
        if (target.status !== 'waiting_for_user' || body.question_id !== target.question.id) return failed(409, 'QUESTION_CLOSED', 'This question is closed.');
        target.question = null;
        propose(target, 'reminders.schedule', 'Schedule this reminder for you.', [
          { label: 'Task', value: 'Call the bank' }, { label: 'When', value: '2 October 2026, 18:00' },
        ]);
        return reply(target);
      }
      if (target && method === 'POST' && step[2] === 'cancel') return reply(finish(target, 'cancelled', 'Stopped. Nothing was changed.', { stop_reason: 'cancelled' }));
      const decision = url.pathname.match(/^\/api\/agent-approvals\/([^/]+)\/(approve|reject)$/);
      const owner = decision && method === 'POST' && state.runs.find(item => item.approval?.id === decision[1]);
      if (owner) {
        const approval = owner.approval;
        const key = headers['idempotency-key'];
        if (decision[2] === 'approve' && !key) return failed(428, 'PRECONDITION_REQUIRED', 'Send an Idempotency-Key.');
        if (approval.status !== 'pending') {
          if (decision[2] === 'approve' && state.decisions[approval.id] === key) return reply(owner);
          return failed(409, 'APPROVAL_DECIDED', 'This action was already decided.');
        }
        if (headers['if-match'] !== approval.etag) return failed(412, 'PRECONDITION_FAILED', 'This action changed. Review it again.');
        if (decision[2] === 'reject') {
          Object.assign(approval, { status: 'rejected', decided_at: at(), version: '2', etag: nextTag() });
          return reply(finish(owner, 'cancelled', 'Okay. Nothing was changed.', { stop_reason: 'rejected' }));
        }
        state.decisions[approval.id] = key;
        const result = newId();
        state.created.push({ tool: approval.tool_name, result });
        Object.assign(approval, { status: 'approved', result_ref: result, decided_at: at(), version: '2', etag: nextTag() });
        const title = approval.fields.find(item => item.label === 'Title' || item.label === 'Task').value;
        finish(owner, 'completed', approval.tool_name === 'tasks.create' ? `Done. Created \u201c${title}\u201d.` : `Done. I'll remind you about \u201c${title}\u201d.`, { outcome: 'action_completed' });
        if (state.loseApprovals > 0) { state.loseApprovals -= 1; throw new TypeError('Synthetic lost response after the action was done'); }
        return reply(owner);
      }
      if (url.pathname === '/api/agent-memories' && method === 'GET') return reply(state.memories);
      const memory = url.pathname.match(/^\/api\/agent-memories\/([^/]+)$/);
      if (memory && method === 'DELETE' && state.memories.some(item => item.id === memory[1])) {
        state.memories = state.memories.filter(item => item.id !== memory[1]);
        return reply({ id: memory[1], status: 'deleted' });
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      return failed(404, 'NOT_FOUND', 'The offline fixture has no such endpoint.');
    };
  }, { accountId, spaceId, clubId, memoryId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderAgentFixture());
  await page.getByRole('heading', { name: 'Your requests', exact: true }).waitFor();
  return { page, outbound, errors };
}

const posts = (page, ending) => page.evaluate(ending => window.agentFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith(ending)), ending);
const request = page => page.getByRole('textbox', { name: 'What do you want to do?', exact: true });

async function finished(page, outbound, errors) {
  assert.deepEqual(await page.evaluate(() => window.agentFixture.unexpected), []);
  assert.deepEqual(outbound, []);
  assert.deepEqual(errors, []);
}

test('a request shows the exact change first, and Approve sends the reviewed version once', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    assert.equal(await page.getByRole('link', { name: 'Agent', exact: true }).getAttribute('href'), '/app/agent');
    await page.getByText('No requests in this Space yet. Only you can see your requests.', { exact: true }).waitFor();
    assert.equal(await request(page).evaluate(field => document.getElementById(field.getAttribute('aria-describedby')).textContent),
      'For example: add a task to buy milk tomorrow, or remind me to call the bank at 6 pm.');
    await request(page).fill('Add a task to water the plants tomorrow');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    const card = page.getByRole('article', { name: 'Add a task to water the plants tomorrow' });
    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal(await card.getByText('Needs your approval', { exact: true }).isVisible(), true);
    assert.deepEqual(await card.locator('dt').allTextContents(), ['Space', 'Title', 'Due date', 'Assigned to']);
    assert.deepEqual(await card.locator('dd').allTextContents(), ['Morgan family', 'Water the plants', '2 October 2026', 'You']);
    assert.equal(await card.getByText('Nothing changes unless you approve.', { exact: false }).isVisible(), true);
    assert.equal(await request(page).inputValue(), '');
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), [], 'asking only proposes the change');

    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByText('Done. Created \u201cWater the plants\u201d.', { exact: true }).waitFor();
    assert.equal(await card.getByText('Done', { exact: true }).isVisible(), true);
    assert.equal(await card.getByRole('heading', { name: 'Create this task.', exact: true }).isVisible(), true);
    assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0);

    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 1);
    assert.deepEqual(asks[0].body, { space_id: spaceId, message: 'Add a task to water the plants tomorrow' });
    assert.equal(asks[0].headers['x-account-id'], accountId);
    assert.match(asks[0].headers['idempotency-key'], /^00000000-0000-4000-8000-[0-9a-f]{12}$/);
    const approvals = await posts(page, '/approve');
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].headers['if-match'], firstEtag);
    assert.match(approvals[0].headers['idempotency-key'], /^00000000-0000-4000-8000-[0-9a-f]{12}$/);
    assert.notEqual(approvals[0].headers['idempotency-key'], asks[0].headers['idempotency-key']);
    assert.equal((await page.evaluate(() => window.agentFixture.created)).length, 1);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('after a lost response, sending or approving again reuses its key, so nothing happens twice', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseAsks: 1, loseApprovals: 1 });
    await request(page).fill('Add a task to water the plants tomorrow');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
    assert.equal(await request(page).isDisabled(), true, 'a request with an unknown outcome cannot be edited into a different one');
    await page.getByRole('button', { name: 'Send again', exact: true }).click();

    const card = page.getByRole('article', { name: 'Add a task to water the plants tomorrow' });
    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 2);
    assert.equal(asks[1].headers['idempotency-key'], asks[0].headers['idempotency-key']);
    assert.equal(await page.evaluate(() => window.agentFixture.runs.length), 1);

    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Approve again', exact: true }).click();
    await card.getByText('Done. Created \u201cWater the plants\u201d.', { exact: true }).waitFor();
    const approvals = await posts(page, '/approve');
    assert.equal(approvals.length, 2);
    assert.equal(approvals[1].headers['idempotency-key'], approvals[0].headers['idempotency-key']);
    assert.equal(approvals[1].headers['if-match'], approvals[0].headers['if-match']);
    assert.equal((await page.evaluate(() => window.agentFixture.created)).length, 1, 'the retried approval acted once');
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('the agent asks for a missing detail in place, and "Don\'t do it" changes nothing', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await request(page).fill('Remind me to call the bank');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const card = page.getByRole('article', { name: 'Remind me to call the bank' });
    await card.getByText('What time should I remind you?', { exact: true }).waitFor();
    assert.equal(await card.getByText('Needs your answer', { exact: true }).isVisible(), true);
    const answer = card.getByRole('textbox', { name: 'Your answer', exact: true });
    assert.equal(await answer.evaluate(field => document.getElementById(field.getAttribute('aria-describedby')).textContent), 'What time should I remind you?');
    assert.equal(await card.getByRole('button', { name: 'Answer', exact: true }).isDisabled(), true);
    await answer.fill('6 pm');
    await card.getByRole('button', { name: 'Answer', exact: true }).click();

    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.deepEqual(await card.locator('dd').allTextContents(), ['Call the bank', '2 October 2026, 18:00']);
    const [question] = await page.evaluate(() => window.agentFixture.questions);
    assert.deepEqual((await posts(page, '/resume')).map(call => call.body), [{ question_id: question, answer: '6 pm' }]);

    await card.getByRole('button', { name: 'Don\'t do it', exact: true }).click();
    await card.getByText('Okay. Nothing was changed.', { exact: true }).waitFor();
    assert.equal(await card.getByText('Stopped', { exact: true }).isVisible(), true);
    const rejections = await posts(page, '/reject');
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0].headers['if-match'], firstEtag);
    assert.equal(rejections[0].headers['idempotency-key'], undefined);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    assert.equal((await posts(page, '/approve')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('requests are listed per Space, and earlier ones load only when asked', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 3, pageSize: 2 });
    await page.getByText('Earlier request 1', { exact: true }).waitFor();
    assert.equal(await page.getByText('Earlier request 2', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Earlier request 3', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Show earlier requests', exact: true }).click();
    await page.getByText('Earlier request 3', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Show earlier requests', exact: true }).count(), 0);
    const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'GET' && call.route === '/api/agent-runs').map(call => call.query));
    assert.deepEqual(reads, [{ space_id: spaceId, limit: '20' }, { space_id: spaceId, limit: '20', cursor: 'after-2' }]);

    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption({ label: 'Garden club' });
    await page.getByText('No requests in this Space yet. Only you can see your requests.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Earlier request 1', { exact: true }).count(), 0);
    await request(page).fill('Add a task to water the plants tomorrow');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('article', { name: 'Add a task to water the plants tomorrow' }).getByText('Garden club', { exact: true }).waitFor();
    assert.deepEqual((await posts(page, '/api/agent-runs')).map(call => call.body.space_id), [clubId]);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('a memory is deleted only after the person confirms it in a dialog', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Memories', exact: true }).getAttribute('aria-pressed'), 'true');
    const saved = page.getByRole('listitem').filter({ hasText: 'Prefers mornings' });
    await saved.waitFor();
    assert.equal(await saved.getByText('Note', { exact: true }).isVisible(), true);
    const remove = page.getByRole('button', { name: 'Delete memory: Prefers mornings', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Delete this memory?', exact: true });

    await remove.click();
    await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await remove.click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    const deletes = () => page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'DELETE'));
    assert.deepEqual(await deletes(), [], 'closing the dialog deletes nothing');
    assert.equal(await saved.isVisible(), true);

    await remove.click();
    assert.equal(await dialog.getByText('The agent stops using it right away. This cannot be undone.', { exact: true }).isVisible(), true);
    await dialog.getByRole('button', { name: 'Delete memory', exact: true }).click();
    await page.getByText('Nothing saved.', { exact: false }).waitFor();
    const removed = await deletes();
    assert.equal(removed.length, 1);
    assert.equal(removed[0].route, `/api/agent-memories/${memoryId}`);
    assert.equal(removed[0].headers['x-account-id'], accountId);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('the agent screen fits 320px with normal and doubled text, and its buttons stay large enough to tap', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { title: `Water-${'A'.repeat(70)}`, seedRuns: 1 });
    await request(page).fill(`Add a task called Water-${'A'.repeat(70)} tomorrow`);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.equal(await fits(), true, 'requests at 320px');
    for (const name of ['Ask', 'Approve', 'Don\'t do it', 'Refresh requests', 'Requests', 'Memories']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44, `${name} is at least 44px`);
    }
    const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
    assert.equal(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), normalSize * 2);
    assert.equal(await fits(), true, 'requests at 320px and 200% text');

    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    await page.getByRole('button', { name: 'Delete memory: Prefers mornings', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this memory?', exact: true });
    await dialog.waitFor();
    assert.equal(await fits(), true, 'memories at 320px and 200% text');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'the dialog at 320px and 200% text');
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});
