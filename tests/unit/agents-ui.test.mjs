import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { AgentScreen } from './src/features/agents/agent-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        function Probe() {
          const client = useQueryClient();
          useEffect(() => { window.refreshAgentFixture = prefix => client.refetchQueries({ queryKey: [prefix] }); }, [client]);
          return null;
        }
        window.renderAgentFixture = (language = 'en') => root.render(<Providers key={language} language={language}><AgentScreen /><Probe /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-agent.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-agent.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-agent-dependencies', setup(builder) {
      if (process.env.COMMUNITY_AGENT_READ_MUTANT === 'allow-denied') builder.onLoad({ filter: /agent-screen\.tsx$/ }, args => {
        const source = readFileSync(args.path, 'utf8');
        const guard = 'return sessionLost(error) || error instanceof ApiError && (error.status === 403 || error.status === 404);';
        assert.ok(source.includes(guard));
        return { contents: source.replace(guard, 'return false;'), loader: 'tsx', resolveDir: path.dirname(args.path) };
      });
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
  if (options.clock) await page.clock.install();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const markup = '<html><head><title>Offline agent</title></head><body><div id="root"></div></body></html>';
  if (options.url) {
    await page.route(options.url, route => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Referrer-Policy': 'no-referrer' }, body: markup }));
    await page.goto(options.url);
  } else {
    await page.setContent(markup);
  }
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
    const spaces = [[spaceId, 'Morgan family', 'family'], [clubId, 'Garden club', 'group']].map(([id, name, space_type]) => ({
      id, name, description: '', space_type, visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z',
    }));
    const state = window.agentFixture = {
      calls: [], runs: [], byKey: {}, decisions: {}, questions: [], created: [], unexpected: [],
      memories: [{ id: memoryId, kind: 'note', key: null, label: 'Note', content: 'Prefers mornings', source: 'agent', source_run_id: null, created_at: '2026-09-30T08:00:00Z' }],
      loseAsks: options.loseAsks ?? 0, loseApprovals: options.loseApprovals ?? 0, pageSize: options.pageSize ?? 20,
      spacesFailure: options.spacesFailure ?? 0, memoriesFailure: options.memoriesFailure ?? 0, runsFailure: 0, webTextFailure: 0,
    };
    const run = (space, message) => {
      const now = at();
      return {
        id: newId(), agent_kind: space ? 'space' : 'main', space_id: space, message, status: 'running', outcome: null, stop_reason: null, intent: null, answer: null,
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
      state.runs.push(finish(run(null, `Earlier request ${number}`), 'completed', 'You have no open tasks.', {
        outcome: 'answered', ...options.seedRecord,
      }));
    }
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-agent', ...extra }), { status: 200 });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-agent' }), { status });
    const failedRead = (status, message) => failed(status, status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE', message);
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') {
        // The live connection every signed-in page opens (DEC-019) stays open without hints and closes when the page aborts it.
        return new Response(new ReadableStream({ start(controller) { config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} }); } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: Object.fromEntries(url.searchParams), method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces' && method === 'GET') {
        if (state.spacesFailure) return failedRead(state.spacesFailure, 'The Space list is unavailable.');
        return reply(spaces, { pagination: { next_cursor: null, has_more: false } });
      }
      // Every signed-in header shows the inbox's unread count on its bell (DEC-014, T38).
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/agent-runs' && method === 'GET') {
        if (state.runsFailure) return failedRead(state.runsFailure, 'Requests are unavailable.');
        // The Agent page asks the person's Main Agent, whose requests name no Space (DEC-060).
        const mine = state.runs.filter(item => item.space_id === (url.searchParams.get('space_id') ?? null));
        const start = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor').slice('after-'.length)) : 0;
        const more = start + state.pageSize < mine.length;
        return reply(mine.slice(start, start + state.pageSize), { pagination: { next_cursor: more ? `after-${start + state.pageSize}` : null, has_more: more } });
      }
      if (url.pathname === '/api/agent-runs' && method === 'POST') {
        const key = headers['idempotency-key'];
        if (!key) return failed(428, 'PRECONDITION_REQUIRED', 'Send an Idempotency-Key.');
        if (state.byKey[key] && state.byKey[key].message !== body.message) return failed(409, 'IDEMPOTENCY_CONFLICT', 'Review the changed request.');
        if (!state.byKey[key]) {
          const item = run(body.space_id ?? null, body.message);
          if (options.readOnly) {
            finish(item, 'completed', options.readOnly.answer, {
              outcome: 'answered', intent: options.readOnly.intent,
              evidence: [{ kind: options.readOnly.kind, ref: options.readOnly.reference ?? spaceId, label: 'Visible source' }],
              tool_calls: [{ id: newId(), sequence: 1, tool_name: options.readOnly.tool, tool_version: '1',
                effect: 'read', risk: 'low', status: 'succeeded', summary: 'Read the authorized source.',
                result_ref: null, error_code: null, approval_id: null, created_at: at() }],
              ...options.record,
            });
          } else if (options.declined) {
            finish(item, 'completed', options.declined.answer, {
              outcome: options.declined.outcome, intent: options.declined.intent, stop_reason: options.declined.stopReason ?? null,
            });
          } else if (/^remind me/i.test(body.message)) {
            const question = { id: newId(), text: 'What time should I remind you?', expires_at: '2026-10-02T09:00:00Z' };
            state.questions.push(question.id);
            Object.assign(item, { status: 'waiting_for_user', question });
          } else {
            propose(item, 'tasks.create', 'Create this task.', [
              { label: 'Space', value: spaces.find(space => space.id === body.space_id)?.name ?? 'Morgan family' }, { label: 'Title', value: options.title ?? 'Water the plants' },
              { label: 'Due date', value: '2 October 2026' }, { label: 'Assigned to', value: 'You' },
            ]);
          }
          state.byKey[key] = item;
          state.runs.unshift(item);
          if (state.loseAsks > 0) { state.loseAsks -= 1; throw new TypeError('Synthetic lost response after the request was saved'); }
        }
        return reply(state.byKey[key]);
      }
      const webText = url.pathname.match(/^\/api\/agent-runs\/([^/]+)\/web-text$/);
      if (webText && method === 'GET') {
        const record = state.runs.find(item => item.id === webText[1]);
        if (state.webTextFailure) return failedRead(state.webTextFailure, 'Saved text is unavailable.');
        if (!record) return failed(404, 'NOT_FOUND', 'Request not found.');
        return reply({ run_id: record.id, sources: options.webTextSources ?? [] });
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
      if (url.pathname === '/api/agent-memories' && method === 'GET') {
        if (state.memoriesFailure) return failedRead(state.memoriesFailure, 'Memories are unavailable.');
        return reply(state.memories);
      }
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
  await page.evaluate(language => window.renderAgentFixture(language), options.language ?? 'en');
  if (options.spacesFailure) await page.getByRole('alert').filter({ hasText: 'The Space list is unavailable.' }).waitFor();
  else await page.getByRole('main').getByRole('heading', { level: 2 }).waitFor();
  return { page, outbound, errors };
}

const posts = (page, ending) => page.evaluate(ending => window.agentFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith(ending)), ending);
const request = page => page.getByRole('textbox', { name: 'What do you want to do?', exact: true });

async function finished(page, outbound, errors) {
  assert.deepEqual(await page.evaluate(() => window.agentFixture.unexpected), []);
  assert.deepEqual(outbound, []);
  assert.deepEqual(errors, []);
}

test('agent web tools: web requests stay in chat without a separate Fetch form', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    assert.deepEqual(await page.getByRole('group', { name: 'Agent views', exact: true }).getByRole('button').allTextContents(), ['Chat', 'Memories']);
    assert.equal(await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Fetch', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Fetch pages', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('URLs', { exact: true }).count(), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent web answer: useful information comes before sources and video loads only after Play', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, {
      main: true, seedRuns: 1, url: 'http://127.0.0.1:3000/app/agent?request=private-fixture',
      seedRecord: {
        answer: 'For everyday cooking, combine vegetables, beans and whole grains.',
        sources: [
          { title: 'Everyday cooking guide', url: 'https://cooking.example.org/guide', read: true, video_id: null },
          { title: 'A cooking video', url: 'https://www.youtube.com/watch?v=pKtweGSC2FU', read: false, video_id: 'pKtweGSC2FU' },
        ],
      },
    });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await card.getByText('For everyday cooking, combine vegetables, beans and whole grains.', { exact: true }).waitFor();
    const play = card.getByRole('button', { name: 'Play A cooking video', exact: true });
    await play.waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    assert.deepEqual(outbound, [], 'no player or thumbnail request before the user chooses Play');
    await card.getByText('Sources', { exact: true }).click();
    await card.getByText('Text read', { exact: true }).waitFor();
    const source = card.getByRole('link', { name: 'Everyday cooking guide', exact: true });
    assert.equal(await source.getAttribute('href'), 'https://cooking.example.org/guide');
    assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
    const loaded = [];
    await context.route('https://www.youtube-nocookie.com/embed/**', route => {
      loaded.push({ url: route.request().url(), referrer: route.request().headers().referer });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Controlled player frame</body></html>' });
    });
    await play.click();
    const player = card.getByTitle('A cooking video', { exact: true });
    await player.waitFor();
    assert.equal(await player.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/pKtweGSC2FU?autoplay=1&playsinline=1&rel=0');
    assert.equal(await player.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.equal(await player.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation');
    await page.frameLocator('iframe').getByText('Controlled player frame', { exact: true }).waitFor();
    assert.deepEqual(loaded, [{ url: await player.getAttribute('src'), referrer: 'http://127.0.0.1:3000/' }]);
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const box = await player.boundingBox();
    assert.ok(box.width <= 320 && box.height > 140);
    await card.getByRole('button', { name: 'Close video', exact: true }).click();
    assert.equal(await page.locator('iframe').count(), 0);
    await play.waitFor();
    assert.ok(loaded.length <= 1);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent source preview: loads on demand and renders saved markup as inert text', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const source = { title: 'Transit correction', url: 'https://news.example.org/transit', read: true, video_id: null };
    const text = '<script>window.previewExecuted = true</script>\n<img src="https://news.example.org/image.png">\n\nThe correction says October 9.';
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1,
      seedRecord: { answer: 'The date was corrected.', sources: [source] },
      webTextSources: [{ source, text, offset: 0, partial: true }],
    });
    const reads = () => page.evaluate(() => window.agentFixture.calls.filter(call => call.route.endsWith('/web-text')).length);
    assert.equal(await reads(), 0);
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await card.getByText('Sources', { exact: true }).click();
    assert.equal(await reads(), 0);
    await card.getByRole('button', { name: 'View text: Transit correction', exact: true }).click();
    const preview = card.getByRole('region', { name: 'Source text: Transit correction', exact: true });
    await preview.getByText('Partial extract', { exact: true }).waitFor();
    assert.equal(await preview.locator('pre').textContent(), text);
    assert.equal(await reads(), 1);
    assert.equal(await preview.locator('script, img, iframe, a').count(), 0);
    assert.equal(await page.evaluate(() => window.previewExecuted), undefined);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-source-preview-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    await preview.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok((await preview.boundingBox()).width <= 320);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-source-preview-320.png'), fullPage: true });
    await card.getByRole('button', { name: 'Hide text: Transit correction', exact: true }).click();
    assert.equal(await preview.count(), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const status of [403, 404]) test(`agent source preview: ${status} hides previously loaded text`, async () => {
  const context = await browser.newContext();
  try {
    const source = { title: 'Saved report', url: 'https://news.example.org/report', read: true, video_id: null };
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1,
      seedRecord: { answer: 'A report was read.', sources: [source] },
      webTextSources: [{ source, text: 'A private retained excerpt.', offset: 0, partial: false }],
    });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await card.getByText('Sources', { exact: true }).click();
    await card.getByRole('button', { name: 'View text: Saved report', exact: true }).click();
    await card.getByText('A private retained excerpt.', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Hide text: Saved report', exact: true }).click();
    await page.evaluate(status => { window.agentFixture.webTextFailure = status; }, status);
    await card.getByRole('button', { name: 'View text: Saved report', exact: true }).click();
    await card.getByRole('alert').getByText('Saved text is unavailable.', { exact: true }).waitFor();
    assert.equal(await card.getByText('A private retained excerpt.', { exact: true }).count(), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent web tools: a natural reading request returns an answer and sources in the same conversation', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const message = 'Read https://news.example.org/first and https://news.example.org/second and compare their opening dates.';
    const answer = 'Both reports give October 9 as the expected opening date. Independent confirmation is still missing.';
    const sources = [
      { title: 'First report', url: 'https://news.example.org/first', read: true, video_id: null },
      { title: 'Second report', url: 'https://news.example.org/second', read: true, video_id: null },
    ];
    const { page, outbound, errors } = await fixture(context, {
      readOnly: { answer, intent: 'chat', kind: 'page', tool: 'web.read' }, record: { sources },
    });
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: message, exact: true });
    await card.getByText(answer, { exact: true }).waitFor();
    await card.getByText('Sources', { exact: true }).click();
    for (const source of sources) assert.equal(await card.getByRole('link', { name: source.title, exact: true }).getAttribute('href'), source.url);
    assert.equal(await page.getByRole('button', { name: 'Fetch', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('URLs', { exact: true }).count(), 0);
    const sent = await posts(page, '/agent-runs');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.message, message);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 1);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-chat-extraction-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await card.getByText(answer, { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-chat-extraction-320.png'), fullPage: true });
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent activity: real progress stays readable and respects reduced motion', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  try {
    const { page, outbound, errors } = await fixture(context, { clock: true, seedRuns: 1, seedRecord: {
      status: 'running', answer: null, finished_at: null,
      events: [{ sequence: 1, event_type: 'run.reading', summary: 'Reading the next article section.', created_at: '2026-10-06T04:00:00Z' }],
    } });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    const progress = card.getByRole('status');
    await progress.getByText('Reading the next article section.', { exact: true }).waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    await progress.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await card.getByRole('button', { name: 'Stop this request', exact: true }).isEnabled(), true);
    assert.equal(await progress.locator('svg').first().evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.evaluate(() => {
      Object.assign(window.agentFixture.runs[0], { status: 'completed', answer: 'The corrected report includes the new date.', finished_at: '2026-10-06T04:01:00Z' });
      return window.refreshAgentFixture('agentRuns');
    });
    const answer = card.getByText('The corrected report includes the new date.', { exact: true });
    await answer.waitFor();
    assert.equal(await progress.count(), 0);
    assert.equal(await answer.evaluate(element => getComputedStyle(element.parentElement).animationName), 'none');
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-news-progress-320.png'), fullPage: true });
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent web answer: a long video title fits a narrow screen at doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const title = 'Everyday cooking ideas with vegetables, beans and whole grains for simple meals throughout the week';
    const { page, outbound, errors } = await fixture(context, {
      main: true, seedRuns: 1,
      seedRecord: { answer: 'Here is a video about everyday cooking.', sources: [
        { title, url: 'https://youtu.be/pKtweGSC2FU', read: false, video_id: 'pKtweGSC2FU' },
      ] },
    });
    const play = page.getByRole('button', { name: `Play ${title}`, exact: true });
    await play.waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.locator('figcaption strong').textContent(), title);
    const reading = await page.getByRole('log', { name: 'Chat', exact: true }).boundingBox();
    assert.ok(reading.height >= 120, 'large text must leave room to inspect the video and its summary');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await play.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true);
    assert.equal(await page.locator('iframe').count(), 0);
    await play.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-web-video-320-large-text.png'), fullPage: true });
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
  test(`agent workspace: chat fills the ${viewport.width}px viewport and keeps the composer visible`, async () => {
    const context = await browser.newContext({ viewport });
    try {
      const { page, outbound, errors } = await fixture(context, { seedRuns: 8 });
      const chat = page.getByRole('region', { name: 'Your Main Agent', exact: true });
      const input = page.getByRole('textbox', { name: 'Message the Agent', exact: true });
      await input.waitFor();
      const chatBox = await chat.boundingBox();
      const inputBox = await input.boundingBox();
      assert.ok(chatBox.height >= viewport.height * 0.55, JSON.stringify({ viewport, chatBox }));
      assert.ok(inputBox.y >= 0 && inputBox.y + inputBox.height <= viewport.height, JSON.stringify({ viewport, inputBox }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true,
        'the workspace must not add a second page scrollbar');
      if (viewport.width >= 1200) assert.ok(chatBox.width >= 1000, 'desktop chat should use the available workspace width');
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-workspace-${viewport.width}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('agent workspace: large text and long replies keep both reading and composing usable', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, {
      seedRuns: 2, seedRecord: { answer: 'One small habit at a time. '.repeat(60) },
    });
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const log = page.getByRole('log', { name: 'Chat', exact: true });
    const logBox = await log.boundingBox();
    const chrome = await page.evaluate(() => Object.fromEntries(['.app-header', '.main-nav', 'main', 'main > div', 'main form', '.app-footer'].map(selector => {
      const element = document.querySelector(selector);
      return [selector, element ? { height: element.getBoundingClientRect().height, top: element.getBoundingClientRect().top } : null];
    })));
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-workspace-320-large-text.png'), fullPage: true });
    assert.ok(logBox.height >= 120, `large text must leave a usable message reading area: ${JSON.stringify({ logBox, chrome })}`);
    const input = page.getByRole('textbox', { name: 'Message the Agent', exact: true });
    await input.fill('A message I have not sent yet');
    assert.equal(await input.inputValue(), 'A message I have not sent yet');
    const button = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
    assert.ok(button.width >= 44 && button.height >= 44);
    assert.ok(button.y >= 0 && button.y + button.height <= 844);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-workspace-320-large-text.png'), fullPage: true });
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent workspace: incoming answers preserve reading position until latest messages is chosen', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 10 });
    const log = page.getByRole('log', { name: 'Chat', exact: true });
    await log.waitFor();
    assert.ok(await log.evaluate(element => element.scrollHeight > element.clientHeight));
    await log.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await page.evaluate(async () => {
      Object.assign(window.agentFixture.runs[0], { answer: 'A new answer arrived while you were reading.', version: '4' });
      await window.refreshAgentFixture('agentRuns');
    });
    await log.getByText('A new answer arrived while you were reading.', { exact: true }).waitFor({ state: 'attached' });
    assert.ok(await log.evaluate(element => element.scrollTop <= 2), 'an incoming update must not pull the reader to the bottom');
    await page.getByRole('button', { name: 'Latest messages', exact: true }).click();
    await page.waitForFunction(() => {
      const element = document.querySelector('[role="log"]');
      return element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
    });
    assert.equal(await page.getByRole('button', { name: 'Latest messages', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent workspace: long memory lists stay scrollable and do not hide the view controls', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.evaluate(() => {
      const original = window.agentFixture.memories[0];
      window.agentFixture.memories = Array.from({ length: 30 }, (_, index) => ({
        ...original, id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, content: `Saved note ${index + 1}`,
      }));
    });
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    const memories = page.getByRole('region', { name: 'Your memories', exact: true });
    await memories.getByText('Saved note 30', { exact: false }).waitFor({ state: 'attached' });
    assert.equal(await memories.evaluate(element => getComputedStyle(element).overflowY), 'auto');
    const last = memories.getByRole('button', { name: 'Delete memory: Saved note 30', exact: true });
    await last.scrollIntoViewIfNeeded();
    const bounds = await last.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent workspace: automatic-mode controls leave room for reading on a small phone', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 4 });
    const setting = page.getByRole('button', { name: 'Auto-approve', exact: true })
      .or(page.getByRole('switch', { name: 'Auto-approve', exact: true }));
    await setting.click();
    await page.getByText('Changes run automatically. New pages, publishing and comments still need approval.', { exact: true }).waitFor();
    const log = page.getByRole('log', { name: 'Chat', exact: true });
    const bounds = await log.boundingBox();
    assert.ok(bounds.height >= 120, `the existing automatic mode must not collapse the chat: ${JSON.stringify(bounds)}`);
    const send = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
    assert.ok(send.y + send.height <= 640);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const status of ['queued', 'running', 'verifying']) {
  test(`agent progress fallback: ${status} requests finish without a live hint or another write`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, {
        clock: true, seedRuns: 1, seedRecord: { status, outcome: null, answer: null, finished_at: null },
      });
      const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
      await card.waitFor();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.evaluate(() => Object.assign(window.agentFixture.runs[0], {
        status: 'completed', outcome: 'answered', answer: 'The requested result is ready.', version: '3',
        finished_at: '2026-10-05T12:00:00Z',
      }));
      await page.clock.runFor(2500);
      await card.getByText('The requested result is ready.', { exact: true }).waitFor({ timeout: 2000 });
      const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/agent-runs').length);
      await page.clock.runFor(6000);
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/agent-runs').length), reads,
        'completed requests stop polling');
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

for (const status of [403, 404]) {
  test(`agent progress fallback: ${status} hides the active request and stops polling`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, {
        clock: true, seedRuns: 1, seedRecord: { status: 'running', outcome: null, answer: null, finished_at: null },
      });
      await page.getByRole('article', { name: 'Earlier request 1', exact: true }).waitFor();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.evaluate(status => { window.agentFixture.runsFailure = status; }, status);
      await page.clock.runFor(2500);
      await page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' }).waitFor({ timeout: 2000 });
      assert.equal(await page.getByRole('article', { name: 'Earlier request 1', exact: true }).count(), 0);
      const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/agent-runs').length);
      await page.clock.runFor(6000);
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/agent-runs').length), reads);
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

for (const [kind, intent, tool, message] of [
  ['event', 'list_events', 'family.events.list', 'Show upcoming events'],
  ['document', 'search_documents', 'documents.search', 'Search documents for picnic'],
  ['page', 'list_pages', 'community.pages.list', 'Find pages about gardening'],
  ['space', 'space_settings', 'spaces.settings.read', 'Show space settings'],
  ['interests', 'list_interests', 'community.interests.read', 'Show my interests'],
]) {
  test(`read-only ${kind} answers stay plain, approval-free and scoped at desktop and large mobile text`, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
    try {
      const answer = `1. ${kind} source\nPicnic instructions (lines 1-3)\n${'Source'.repeat(35)}\n<img src=x onerror=alert(1)>`;
      const { page, outbound, errors } = await fixture(context, { readOnly: { kind, intent, tool, answer } });
      await request(page).fill(message);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      const card = page.getByRole('article', { name: message, exact: true });
      const content = card.getByText(answer, { exact: true });
      await content.waitFor();
      assert.equal(await content.textContent(), answer);
      assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
      assert.equal(await card.locator('img').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      if (kind === 'document') await page.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-readonly-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(() => document.fonts.ready);
      const originalSize = await content.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, Number.parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await content.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      if (kind === 'document') await page.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-readonly-mobile-large-text.png'), fullPage: true });
      await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption({ label: 'Garden club' });
      await page.getByText('No requests in this Space yet. Only you can see your requests.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('article', { name: message, exact: true }).count(), 0);
      assert.equal((await posts(page, '/api/agent-runs')).length, 1);
      assert.equal((await posts(page, '/approve')).length, 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('public page and post review shows every approved field at desktop and 320px large text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const message = 'Create a general wellness page and post';
    const body = 'Choose one manageable habit: enjoy a comfortable walk, keep a regular bedtime, and make room for varied meals. General information only, not personal medical advice.';
    const { page, outbound, errors } = await fixture(context, {
      readOnly: { kind: 'page', intent: 'public_action', tool: 'community.pages.create_with_post', answer: null },
      record: {
        status: 'waiting_for_approval', outcome: null, finished_at: null, evidence: [], tool_calls: [],
        approval: {
          id: '10000000-0000-4000-9000-000000000098', run_id: '10000000-0000-4000-9000-000000000001', space_id: spaceId,
          tool_name: 'community.pages.create_with_post', risk: 'medium', summary: 'Create the page and publish the reviewed post.',
          fields: [
            { label: 'Name', value: 'Everyday Wellness' }, { label: 'Handle', value: 'everyday-wellness' },
            { label: 'Topic', value: 'hobbies' }, { label: 'Description', value: 'Small everyday habits.' },
            { label: 'Audience', value: 'Public' }, { label: 'Post title', value: 'A small habit to start with' },
            { label: 'Post text', value: body }, { label: 'Changes', value: 'Create this public page and publish this exact first post' },
            { label: 'Draft source', value: 'Written by the test model from your request; not independently checked' },
          ],
          status: 'pending', reason: null, result_ref: null, created_at: '2026-10-01T09:00:00Z', expires_at: '2026-10-02T09:00:00Z',
          decided_at: null, version: '1', etag: firstEtag,
        },
      },
    });
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: message, exact: true });
    await card.getByText(body, { exact: true }).waitFor();
    for (const value of ['Everyday Wellness', 'Public', 'A small habit to start with', 'Create this public page and publish this exact first post']) {
      assert.equal(await card.getByText(value, { exact: true }).isVisible(), true, value);
    }
    await card.getByRole('button', { name: 'Approve', exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/t235-public-review-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, Number.parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await card.getByRole('button', { name: 'Approve', exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => window.agentFixture.created.length), 0);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t235-public-review-mobile-large-text.png'), fullPage: true });
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('a request discloses its real plan, sources, action outcome and timestamped activity in its selected Space', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const resultRef = '10000000-0000-4000-9000-000000000099';
    const eventTime = '2026-10-01T09:00:10Z';
    const { page, outbound, errors } = await fixture(context, {
      readOnly: { kind: 'event', intent: 'list_events', tool: 'family.events.list', answer: 'There is one upcoming event.' },
      record: {
        plan: [
          { id: 'check-scope', label: 'Check this Space', kind: 'check', tool: null, status: 'done' },
          { id: 'read-events', label: 'Read upcoming events', kind: 'tool', tool: 'family.events.list', status: 'done' },
        ],
        evidence: [{ kind: 'event', ref: spaceId, label: 'Upcoming events in this Space' }],
        tool_calls: [{ id: '10000000-0000-4000-9000-000000000098', sequence: 1, tool_name: 'family.events.list', tool_version: '1',
          effect: 'read', risk: 'low', status: 'succeeded', summary: 'Read one authorized event.', result_ref: resultRef,
          error_code: 'internal_failure_must_not_be_shown', approval_id: null, created_at: eventTime }],
        events: [{ sequence: 1, event_type: 'run.completed', summary: 'The request finished.', created_at: eventTime }],
      },
    });
    await request(page).fill('Show upcoming events');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const card = page.getByRole('article', { name: 'Show upcoming events', exact: true });
    await card.getByText('There is one upcoming event.', { exact: true }).waitFor();
    await page.getByText('Space: Morgan family (Family)', { exact: true }).waitFor();

    const details = card.locator('details');
    assert.equal(await details.count(), 1);
    assert.equal(await details.evaluate(element => element.open), false);
    assert.equal(await details.locator('summary').textContent(), 'Request details');
    await details.locator('summary').click();
    for (const heading of ['Plan', 'Sources', 'Actions', 'Activity']) {
      assert.equal(await details.getByRole('heading', { name: heading, exact: true }).isVisible(), true);
    }
    for (const value of ['Check this Space', 'Upcoming events in this Space', 'Read one authorized event.', resultRef, 'The request finished.']) {
      assert.equal(await details.getByText(value, { exact: true }).isVisible(), true, value);
    }
    for (const status of ['Check · Done', 'Read · Succeeded']) {
      assert.equal(await details.getByText(status, { exact: true }).isVisible(), true, status);
    }
    assert.equal(await details.getByText(spaceId, { exact: true }).isVisible(), true);
    assert.equal(await details.locator('a').count(), 0, 'references are plain text, not invented navigation');
    assert.equal(await details.getByText('internal_failure_must_not_be_shown', { exact: true }).count(), 0);
    assert.equal(await details.locator(`time[datetime="${eventTime}"]`).count(), 2);

    await page.evaluate(() => window.renderAgentFixture());
    for (const value of ['Plan', 'Sources', 'Actions', 'Activity', 'Check this Space', 'Upcoming events in this Space', 'Read one authorized event.', resultRef, 'The request finished.']) {
      assert.equal(await details.getByText(value, { exact: true }).isVisible(), true, `rerender keeps ${value}`);
    }
    await page.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-run-record-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 320, height: 844 });
    const originalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, originalSize);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the full record fits at 320px and 200% text');
    assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'the run record does not overflow its article');
    assert.equal(await details.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'the disclosure does not overflow');
    await page.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-run-record-mobile-large-text.png'), fullPage: true });

    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption({ label: 'Garden club' });
    await page.getByText('Space: Garden club (Group)', { exact: true }).waitFor();
    assert.equal(await card.count(), 0, 'the previous Space record is not shown after switching scope');
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('blank record text in older and new API-shaped runs is not rendered as empty detail rows', async () => {
  const blankRecord = {
    plan: [{ id: 'blank-plan', label: '  ', kind: 'check', tool: null, status: 'done' }],
    evidence: [{ kind: 'task', ref: null, label: '  ' }],
    tool_calls: [{ id: '10000000-0000-4000-9000-000000000098', sequence: 1, tool_name: 'tasks.list', tool_version: '1',
      effect: 'read', risk: 'low', status: 'succeeded', summary: '  ', result_ref: null, error_code: null, approval_id: null,
      created_at: '2026-10-01T09:00:10Z' }],
    events: [{ sequence: 1, event_type: 'run.completed', summary: '  ', created_at: '2026-10-01T09:00:10Z' }],
  };
  for (const [language, headings, missingText] of [
    ['en', ['Plan', 'Sources', 'Actions', 'Activity'], 'Not recorded.'],
    ['te', ['ప్రణాళిక', 'మూలాలు', 'చర్యలు', 'కార్యకలాపం'], 'వివరాలు నమోదు కాలేదు.'],
    ['hi', ['योजना', 'स्रोत', 'कार्रवाई', 'गतिविधि'], 'विवरण दर्ज नहीं है।'],
  ]) {
    const context = await browser.newContext({ timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await fixture(context, {
        language, seedRuns: 1, seedRecord: blankRecord,
        readOnly: { kind: 'task', intent: 'list_tasks', tool: 'tasks.list', answer: 'There are no open tasks.' },
        record: blankRecord,
      });
      const earlier = page.getByRole('article', { name: 'Earlier request 1', exact: true });
      await earlier.locator('summary').click();
      for (const heading of headings) await earlier.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.deepEqual(await earlier.locator('details li > p:first-child').allTextContents(), Array(4).fill(missingText));

      const composer = page.locator('main form').first();
      await composer.locator('textarea').fill('Show tasks');
      await composer.getByRole('button').click();
      const created = page.getByRole('article', { name: 'Show tasks', exact: true });
      await created.locator('summary').click();
      for (const heading of headings) await created.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.deepEqual(await created.locator('details li > p:first-child').allTextContents(), Array(4).fill(missingText));

      await page.setViewportSize({ width: 320, height: 844 });
      const originalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, originalSize);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${language}: page fits at 320px / 200% text`);
      assert.equal(await earlier.evaluate(element => element.scrollWidth <= element.clientWidth), true, `${language}: older run fits`);
      assert.equal(await created.evaluate(element => element.scrollWidth <= element.clientWidth), true, `${language}: new run fits`);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  }
});

for (const [label, declined, wanted] of [
  ['an unclear request', { outcome: 'answered', intent: 'unknown', answer: "I can't do that yet. I can list tasks, add a task and more." }, 'Not understood'],
  ['a refused request', { outcome: 'refused', intent: 'refuse', stopReason: 'refused_health', answer: "I can't help with medicines or health." }, "Can't do that"],
]) {
  test(`${label} says so instead of Done, at desktop and large mobile text`, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await fixture(context, { declined });
      const message = 'can you please create event';
      await request(page).fill(message);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      const card = page.getByRole('article', { name: message, exact: true });
      await card.getByText(declined.answer, { exact: true }).waitFor();
      assert.equal(await card.getByText(wanted, { exact: true }).isVisible(), true);
      assert.equal(await card.getByText('Done', { exact: true }).count(), 0);
      assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, Number.parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      assert.equal(await card.getByText(wanted, { exact: true }).isVisible(), true);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('a request shows the exact change first, and Approve sends the reviewed version once', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    assert.equal(await page.getByRole('link', { name: 'Agent', exact: true }).getAttribute('href'), '/app/agent');
    await page.getByText('No requests in this Space yet. Only you can see your requests.', { exact: true }).waitFor();
    assert.equal(await request(page).evaluate(field => document.getElementById(field.getAttribute('aria-describedby')).textContent),
      'For example: add a task to buy milk tomorrow, remind me to call the bank at 6 pm, or create an event birthday dinner on Saturday at 6 pm.');
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

test('agent read recovery: a failed Space list has an explicit Retry without sending an Agent request', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { spacesFailure: 503 });
    const failure = page.getByRole('alert').filter({ hasText: 'The Space list is unavailable.' });
    const retry = failure.getByRole('button', { name: 'Retry', exact: true });
    assert.equal(await retry.count(), 1, 'The failed Space read must have its own Retry');
    assert.equal(await request(page).count(), 0);
    await page.evaluate(() => { window.agentFixture.spacesFailure = 0; });
    await retry.click();
    await page.getByRole('combobox', { name: 'Space', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Your requests', exact: true }).waitFor();
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    assert.equal(await failure.count(), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent read recovery: failed memories can be retried without showing an empty list or sending a write', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { memoriesFailure: 503 });
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    const failure = page.getByRole('alert').filter({ hasText: 'Memories are unavailable.' });
    await failure.waitFor();
    const retry = failure.getByRole('button', { name: 'Retry', exact: true });
    assert.equal(await retry.count(), 1, 'The failed memories read must have its own Retry');
    assert.equal(await page.getByText('Nothing saved.', { exact: false }).count(), 0);
    await page.evaluate(() => { window.agentFixture.memoriesFailure = 0; });
    await retry.click();
    await page.getByRole('listitem').filter({ hasText: 'Prefers mornings' }).waitFor();
    assert.equal(await failure.count(), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const status of [403, 404]) {
  test(`agent read privacy: a ${status} memory refresh hides cached content and its open delete dialog`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context);
      await page.getByRole('button', { name: 'Memories', exact: true }).click();
      await page.getByRole('button', { name: 'Delete memory: Prefers mornings', exact: true }).click();
      await page.getByRole('dialog', { name: 'Delete this memory?', exact: true }).waitFor();
      await page.evaluate(status => { window.agentFixture.memoriesFailure = status; }, status);
      await page.evaluate(() => window.refreshAgentFixture('agentMemories'));
      await page.getByRole('alert').filter({ hasText: 'Memories are unavailable.' }).waitFor();
      assert.equal(await page.getByRole('listitem').filter({ hasText: 'Prefers mornings' }).count(), 0, 'Denied memory content must not remain in the cached list');
      assert.equal(await page.getByRole('dialog', { name: 'Delete this memory?', exact: true }).count(), 0, 'An open deletion review must close on denied memory reads');
      await page.evaluate(() => { window.agentFixture.memoriesFailure = 0; });
      await page.getByRole('alert').filter({ hasText: 'Memories are unavailable.' }).getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('listitem').filter({ hasText: 'Prefers mornings' }).waitFor();
      assert.equal(await page.getByRole('dialog', { name: 'Delete this memory?', exact: true }).count(), 0, 'A successful fresh read must not reopen an old deletion review');
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'DELETE').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('agent read privacy: denied history hides old requests and a denied Space list hides its composer', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1 });
    await page.getByRole('article', { name: 'Earlier request 1', exact: true }).waitFor();
    await page.evaluate(() => { window.agentFixture.runsFailure = 403; });
    await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'Earlier request 1', exact: true }).count(), 0);
    await page.evaluate(() => { window.agentFixture.spacesFailure = 404; });
    await page.evaluate(() => window.refreshAgentFixture('agentSpaces'));
    await page.getByRole('alert').filter({ hasText: 'The Space list is unavailable.' }).waitFor();
    assert.equal(await request(page).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).count(), 0);
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent read recovery: a temporary Space outage preserves the typed request until Retry succeeds', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await request(page).fill('My unsent request');
    await page.evaluate(() => { window.agentFixture.spacesFailure = 503; });
    await page.evaluate(() => window.refreshAgentFixture('agentSpaces'));
    const failure = page.getByRole('alert').filter({ hasText: 'The Space list is unavailable.' });
    await failure.waitFor();
    assert.equal(await request(page).inputValue(), 'My unsent request');
    await page.evaluate(() => { window.agentFixture.spacesFailure = 0; });
    await failure.getByRole('button', { name: 'Retry', exact: true }).click();
    await failure.waitFor({ state: 'detached' });
    assert.equal(await request(page).inputValue(), 'My unsent request');
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
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

// T100: the server takes a request of up to 500 characters, an emoji counting once.
test('a request can be 500 emoji long, and a longer one is explained before anything is sent', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByText('No requests in this Space yet. Only you can see your requests.', { exact: true }).waitFor();
    await request(page).focus();
    // Typed input is held to the field's maxLength, as a person's typing is.
    await page.keyboard.insertText('a'.repeat(501));
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Keep a request under 500 characters.' }).waitFor();
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    const emoji = '\u{1F600}'.repeat(500);
    await request(page).fill('');
    await request(page).focus();
    await page.keyboard.insertText(emoji);
    assert.equal(await request(page).inputValue(), emoji, 'The request field must take 500 emoji.');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await page.getByRole('article', { name: emoji }).getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 1);
    assert.equal(asks[0].body.message, emoji);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});