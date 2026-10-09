import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
        import { AgentScreen, AgentTaskInboxScreen, PrivateAgentRequest } from './src/features/agents/agent-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        function Probe() {
          const client = useQueryClient();
          useEffect(() => { window.refreshAgentFixture = prefix => client.refetchQueries({ queryKey: [prefix] }); }, [client]);
          return null;
        }
        window.renderAgentFixture = (language = 'en', privateSpace = null) => {
          const state = window.agentFixture;
          const run = state.runs.find(item => item.space_id === privateSpace);
          root.render(<Providers key={language} language={language}>
            {state.inbox ? <AgentTaskInboxScreen initialSpaceId={state.initialSpaceId} />
              : privateSpace ? <main><PrivateAgentRequest key={privateSpace} user={state.user} conversationId={privateSpace} messageId={run.id} runId={run.id} /></main>
              : <AgentScreen initialSpaceId={state.initialSpaceId} />}
            <Probe />
          </Providers>);
        };`,
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
      user: { id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 },
      initialSpaceId: options.initialSpaceId ?? '',
      inbox: options.inbox ?? false,
      calls: [], runs: [], byKey: {}, decisions: {}, questions: [], created: [], unexpected: [],
      answers: {}, wrongResponses: { ...options.wrongResponses },
      memories: [{ id: memoryId, kind: 'note', key: null, label: 'Note', content: 'Prefers mornings', source: 'agent', source_run_id: null, space_id: null, created_at: '2026-09-30T08:00:00Z', enabled: true, version: '1', etag: `"${'a'.repeat(64)}"` }],
      memoryEdits: {}, memoryEffects: 0, loseMemoryEdits: options.loseMemoryEdits ?? 0, memoryWrongResult: options.memoryWrongResult ?? false,
      loseAsks: options.loseAsks ?? 0, loseApprovals: options.loseApprovals ?? 0, pageSize: options.pageSize ?? 20,
      wrongStops: options.wrongStops ?? 0,
      spacesFailure: options.spacesFailure ?? 0, memoriesFailure: options.memoriesFailure ?? 0, runsFailure: options.runsFailure ?? 0, webTextFailure: 0,
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
      state.runs.push(finish(run(options.privateSpace ?? null, `Earlier request ${number}`), 'completed', 'You have no public pages.', {
        outcome: 'answered', ...options.seedRecord,
      }));
    }
    if (options.seedSpaceRuns) {
      for (const space of spaces) state.runs.push(finish(run(space.id, `Private request in ${space.name}`), 'completed', 'Private Space answer.', { outcome: 'answered' }));
    }
    if (options.inbox) {
      state.runs.push(finish(run(null, 'Main request must stay separate'), 'completed', 'Public answer.', { outcome: 'answered' }));
      state.runs.push(finish(run(clubId, 'Club request'), 'completed', 'Club answer.', { outcome: 'answered' }));
      state.runs.push(finish(run(spaceId, 'Completed family request'), 'completed', 'Family answer.', { outcome: 'answered' }));
      for (const title of ['First family approval', 'Older family approval']) {
        state.runs.push(propose(run(spaceId, title), 'tasks.create', 'Create this task.', [{ label: 'Title', value: title }]));
      }
      state.runs.push(run(spaceId, 'Running family request'));
      state.runs.push(finish(run(spaceId, 'Failed family request'), 'failed', 'No task was created.', { stop_reason: 'synthetic_failure' }));
    }
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-agent', ...extra }), { status: 200 });
    const runReply = (record, operation) => {
      const mismatch = state.wrongResponses[operation];
      if (!mismatch) return reply(record);
      delete state.wrongResponses[operation];
      const other = { ...record, message: 'Another request', status: 'completed', outcome: 'answered',
        answer: 'Unrelated answer must remain hidden.', approval: null, question: null, finished_at: at() };
      if (mismatch === 'scope') {
        other.space_id = record.space_id ? null : clubId;
        other.agent_kind = other.space_id ? 'space' : 'main';
      } else other.id = newId();
      return reply(other);
    };
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
      if (url.pathname === '/api/me') return reply(state.user);
      if (url.pathname === '/api/spaces' && method === 'GET') {
        if (state.spacesFailure) return failedRead(state.spacesFailure, 'The Space list is unavailable.');
        return reply(spaces, { pagination: { next_cursor: null, has_more: false } });
      }
      // Every signed-in header shows the inbox's unread count on its bell (DEC-014, T38).
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/agent-runs' && method === 'GET') {
        if (state.runsFailure) return failedRead(state.runsFailure, 'Requests are unavailable.');
        // The Agent page asks the person's Main Agent, whose requests name no Space (DEC-060).
        const statuses = { working: ['queued', 'running', 'verifying'], waiting_for_approval: ['waiting_for_approval'],
          waiting_for_user: ['waiting_for_user'], completed: ['completed'], failed: ['failed', 'timed_out', 'expired'], cancelled: ['cancelled'] };
        const selected = statuses[url.searchParams.get('status')];
        const mine = state.runs.filter(item => item.space_id === (url.searchParams.get('space_id') ?? null)
          && (!selected || selected.includes(item.status)));
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
          } else if (/^write a post/i.test(body.message)) {
            const question = { id: newId(), text: 'What should the post say?', expires_at: '2026-10-02T09:00:00Z' };
            state.questions.push(question.id);
            Object.assign(item, { status: 'waiting_for_user', question });
          } else {
            propose(item, 'community.pages.create', 'Create this public page.', [
              { label: 'Name', value: options.title ?? 'Gardening circle' }, { label: 'Handle', value: 'gardening-circle' },
              { label: 'Topic', value: 'hobbies' }, { label: 'Audience', value: 'Public' },
            ]);
          }
          state.byKey[key] = item;
          state.runs.unshift(item);
          if (state.loseAsks > 0) { state.loseAsks -= 1; throw new TypeError('Synthetic lost response after the request was saved'); }
        }
        return runReply(state.byKey[key], 'ask');
      }
      const webText = url.pathname.match(/^\/api\/agent-runs\/([^/]+)\/web-text$/);
      if (webText && method === 'GET') {
        const record = state.runs.find(item => item.id === webText[1]);
        if (state.webTextFailure) return failedRead(state.webTextFailure, 'Saved text is unavailable.');
        if (!record) return failed(404, 'NOT_FOUND', 'Request not found.');
        return reply({ run_id: record.id, sources: options.webTextSources ?? [] });
      }
      const readRun = url.pathname.match(/^\/api\/agent-runs\/([^/]+)$/);
      if (readRun && method === 'GET') {
        if (state.runsFailure) return failedRead(state.runsFailure, 'Requests are unavailable.');
        const record = state.runs.find(item => item.id === readRun[1]);
        return record ? runReply(record, 'read') : failed(404, 'NOT_FOUND', 'Request not found.');
      }
      const step = url.pathname.match(/^\/api\/agent-runs\/([^/]+)\/(resume|cancel)$/);
      const target = step && state.runs.find(item => item.id === step[1]);
      if (target && method === 'POST' && step[2] === 'resume') {
        const previous = state.answers[body.question_id];
        if (previous?.run_id === target.id && previous.answer === body.answer) return runReply(target, 'resume');
        if (target.status !== 'waiting_for_user' || body.question_id !== target.question.id) return failed(409, 'QUESTION_CLOSED', 'This question is closed.');
        state.answers[body.question_id] = { run_id: target.id, answer: body.answer };
        target.question = null;
        propose(target, 'community.posts.create', 'Save this post as a private draft.', [
          { label: 'Title', value: 'Garden update' }, { label: 'Text', value: body.answer }, { label: 'Audience', value: 'Private draft' },
        ]);
        return runReply(target, 'resume');
      }
      if (target && method === 'POST' && step[2] === 'cancel') {
        if (state.wrongStops > 0) {
          state.wrongStops -= 1;
          return reply({ ...target, id: newId(), message: 'Another request', status: 'completed', outcome: 'answered',
            answer: 'Unrelated answer must remain hidden.', approval: null, question: null, finished_at: at() });
        }
        if (['completed', 'failed', 'cancelled', 'timed_out', 'expired'].includes(target.status)) return reply(target);
        if (target.approval?.status === 'pending') {
          Object.assign(target.approval, { status: 'cancelled', decided_at: at(), version: '2', etag: nextTag() });
        }
        return reply(finish(target, 'cancelled', 'Stopped. Nothing was changed.', { stop_reason: 'cancelled' }));
      }
      const decision = url.pathname.match(/^\/api\/agent-approvals\/([^/]+)\/(approve|reject)$/);
      const owner = decision && method === 'POST' && state.runs.find(item => item.approval?.id === decision[1]);
      if (owner) {
        const approval = owner.approval;
        const key = headers['idempotency-key'];
        if (decision[2] === 'approve' && !key) return failed(428, 'PRECONDITION_REQUIRED', 'Send an Idempotency-Key.');
        if (approval.status !== 'pending') {
          if (decision[2] === 'approve' && state.decisions[approval.id] === key) return runReply(owner, 'approve');
          if (decision[2] === 'reject' && approval.status === 'rejected') return runReply(owner, 'reject');
          return failed(409, 'APPROVAL_DECIDED', 'This action was already decided.');
        }
        if (headers['if-match'] !== approval.etag) return failed(412, 'PRECONDITION_FAILED', 'This action changed. Review it again.');
        if (decision[2] === 'reject') {
          Object.assign(approval, { status: 'rejected', decided_at: at(), version: '2', etag: nextTag() });
          return runReply(finish(owner, 'cancelled', 'Okay. Nothing was changed.', { stop_reason: 'rejected' }), 'reject');
        }
        state.decisions[approval.id] = key;
        const result = newId();
        state.created.push({ tool: approval.tool_name, result });
        Object.assign(approval, { status: 'approved', result_ref: result, decided_at: at(), version: '2', etag: nextTag() });
        if (approval.tool_name === 'events.budget.split') {
          finish(owner, 'completed', 'Saved the cost-sharing plan. No money was moved.', { outcome: 'action_completed' });
        } else if (approval.tool_name === 'space.poll.create') {
          finish(owner, 'completed', 'Created the reviewed Space poll. No votes were cast.', { outcome: 'action_completed',
            evidence: [{ kind: 'poll', ref: result, label: 'Where shall we meet?' }] });
        } else {
          const title = approval.fields.find(item => item.label === 'Name' || item.label === 'Title').value;
          finish(owner, 'completed', `Done. Created \u201c${title}\u201d.`, { outcome: 'action_completed' });
        }
        if (state.loseApprovals > 0) { state.loseApprovals -= 1; throw new TypeError('Synthetic lost response after the action was done'); }
        return runReply(owner, 'approve');
      }
      if (url.pathname === '/api/agent-memories' && method === 'GET') {
        if (state.memoriesFailure) return failedRead(state.memoriesFailure, 'Memories are unavailable.');
        return reply(state.memories);
      }
      const memory = url.pathname.match(/^\/api\/agent-memories\/([^/]+)$/);
      if (memory && method === 'PATCH') {
        const current = state.memories.find(item => item.id === memory[1]);
        if (!current) return failed(404, 'NOT_FOUND', 'Memory not found.');
        const key = headers['idempotency-key'];
        if (!key || !headers['if-match']) return failed(428, 'PRECONDITION_REQUIRED', 'Review the memory first.');
        const receipt = `${memory[1]}:${key}`;
        const digest = JSON.stringify({ body, etag: headers['if-match'] });
        if (state.memoryEdits[receipt]) {
          if (state.memoryEdits[receipt] !== digest) return failed(409, 'IDEMPOTENCY_CONFLICT', 'This retry does not match.');
          return reply(current);
        }
        if (headers['if-match'] !== current.etag) return failed(412, 'PRECONDITION_FAILED', 'This memory changed. Review it again.');
        state.memoryEdits[receipt] = digest;
        state.memoryEffects += 1;
        Object.assign(current, body, { version: String(Number(current.version) + 1), etag: nextTag() });
        if (state.loseMemoryEdits > 0) {
          state.loseMemoryEdits -= 1;
          throw new TypeError('Synthetic lost response after saving the memory');
        }
        if (state.memoryWrongResult) {
          state.memoryWrongResult = false;
          return reply({ ...current, id: clubId });
        }
        return reply(current);
      }
      if (memory && method === 'DELETE' && state.memories.some(item => item.id === memory[1])) {
        state.memories = state.memories.filter(item => item.id !== memory[1]);
        return reply({ id: memory[1], status: 'deleted' });
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      return failed(404, 'NOT_FOUND', 'The offline fixture has no such endpoint.');
    };
  }, { accountId, spaceId, clubId, memoryId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ language, privateSpace }) => window.renderAgentFixture(language, privateSpace), {
    language: options.language ?? 'en', privateSpace: options.privateSpace ?? null,
  });
  if (options.inbox) await page.getByRole('heading', { level: 1 }).waitFor();
  else if (options.privateSpace) {
    await page.getByRole('button', { name: 'Review here', exact: true }).click();
    await page.getByRole('article').waitFor();
  }
  else await page.getByRole('main').getByRole('heading', { level: 2 }).waitFor();
  return { page, outbound, errors };
}

const posts = (page, ending) => page.evaluate(ending => window.agentFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith(ending)), ending);
const runReads = page => page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'GET' && /^\/api\/agent-runs(?:\/[^/]+)?$/.test(call.route)).length);
const request = page => page.getByRole('textbox', { name: 'Message the Agent', exact: true });

async function finished(page, outbound, errors) {
  assert.deepEqual(await page.evaluate(() => window.agentFixture.unexpected), []);
  assert.deepEqual(outbound, []);
  assert.deepEqual(errors, []);
}

for (const width of [1280, 320]) for (const scope of ['main', 'space']) {
test(`agent rich content: safe Markdown and code actions in ${scope} at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const answer = '# Transit notes\n\n**Verified** options.\n\n| Route | Cost |\n| --- | --- |\n| Central | 12 |\n\n'
    + '```javascript\nconst ready = true;\nconsole.log(ready);\n```\n\n$E = mc^2$\n\n'
    + '![Route image](https://images.example.org/route.png)\n\n[Unsafe link](javascript:alert(1))\n\n'
    + '<script>window.injected = true</script>\n\n<img src="https://images.example.org/tracker.png" onerror="window.injected = true">';
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1, privateSpace: scope === 'space' ? spaceId : null, seedRecord: { answer } });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await card.getByRole('heading', { name: 'Transit notes', exact: true }).waitFor();
    assert.equal(await card.getByRole('table').getByRole('cell', { name: 'Central', exact: true }).count(), 1);
    assert.equal(await card.locator('.hljs-keyword').first().textContent(), 'const');
    assert.equal(await card.locator('math').count(), 1);
    assert.equal(await card.locator('img, script, iframe, a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await card.getByRole('link', { name: 'Route image' }).getAttribute('rel'), 'noopener noreferrer');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { window.agentFixture.copied = text; } },
    }));
    await card.getByRole('button', { name: 'Copy answer', exact: true }).click();
    assert.equal(await page.evaluate(() => window.agentFixture.copied), answer);
    await card.getByRole('button', { name: 'Copy code', exact: true }).click();
    assert.equal(await page.evaluate(() => window.agentFixture.copied), 'const ready = true;\nconsole.log(ready);\n');
    await card.getByRole('button', { name: 'Collapse code', exact: true }).click();
    assert.equal(await card.getByRole('region', { name: 'Code block', exact: true }).count(), 0);
    await card.getByRole('button', { name: 'Expand code', exact: true }).click();
    await card.getByRole('region', { name: 'Code block', exact: true }).waitFor();
    await card.getByRole('button', { name: 'Hide line numbers', exact: true }).click();
    assert.equal(await card.getByRole('button', { name: 'Show line numbers', exact: true }).getAttribute('aria-pressed'), 'false');
    const downloadEvent = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Download answer', exact: true }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'agent-answer.md');
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString('utf8'), answer);
    if (width === 320) {
      const original = await card.getByRole('heading', { name: 'Transit notes', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await card.getByRole('heading', { name: 'Transit notes', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize)), original * 2);
    }
    const action = card.getByRole('button', { name: 'Copy code', exact: true });
    await action.scrollIntoViewIfNeeded();
    await action.focus();
    const bounds = await action.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    assert.equal(await action.evaluate(element => {
      const box = element.getBoundingClientRect();
      return document.activeElement === element && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), true);
    assert.equal(await card.getByRole('status').filter({ hasText: /^Copied\.$/ }).evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    }), 1, 'Copy feedback must remain one unbroken word at doubled text.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-rich-${scope}-${width}.png`), animations: 'disabled' });
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});
}

test('agent rich content: clipboard failure remains retryable and source dates use recorded provenance', async () => {
  const context = await browser.newContext();
  const retrieved = '2026-10-08T10:15:00Z';
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1, seedRecord: {
      answer: '**Source-backed answer**', sources: [
        { title: 'Dated source', url: 'https://news.example.org/report', read: true, video_id: null, retrieved_at: retrieved },
        { title: 'Older source', url: 'https://older.example.org/report', read: false, video_id: null },
      ],
    } });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async () => { throw new Error('Synthetic clipboard refusal'); } },
    }));
    await card.getByRole('button', { name: 'Copy answer', exact: true }).click();
    await card.getByRole('alert').filter({ hasText: 'Could not copy. Try again.' }).waitFor();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { window.agentFixture.copied = text; } },
    }));
    await card.getByRole('button', { name: 'Copy answer', exact: true }).click();
    await card.getByRole('alert').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.agentFixture.copied), '**Source-backed answer**');
    await card.locator('summary').filter({ hasText: /^Sources$/ }).click();
    const dated = card.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Dated source', exact: true }) });
    assert.equal(await dated.locator('time').getAttribute('datetime'), retrieved);
    await dated.getByText('news.example.org', { exact: true }).waitFor();
    const older = card.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Older source', exact: true }) });
    assert.equal(await older.locator('time').count(), 0);
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent message actions: edit as new is a reviewed draft and does not overwrite drafts or replay effects', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1 });
    const previous = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    const reuse = previous.getByRole('button', { name: 'Edit as new request', exact: true });
    await reuse.waitFor();
    await request(page).fill('Unsaved draft');
    assert.equal(await reuse.isDisabled(), true);
    await request(page).fill('');
    await page.getByRole('button', { name: /^Auto-approve/ }).click();
    assert.equal(await page.getByRole('button', { name: /^Auto-approve/ }).getAttribute('aria-pressed'), 'true');
    await reuse.click();
    assert.equal(await request(page).inputValue(), 'Earlier request 1');
    assert.equal(await request(page).evaluate(element => document.activeElement === element), true);
    assert.equal(await page.getByRole('button', { name: /^Auto-approve/ }).getAttribute('aria-pressed'), 'false');
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await request(page).fill('New reviewed request');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('article', { name: 'New reviewed request', exact: true }).getByRole('button', { name: 'Approve', exact: true }).waitFor();
    const writes = await posts(page, '/api/agent-runs');
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].body, { message: 'New reviewed request' });
    assert.ok(writes[0].headers['idempotency-key']);
    assert.equal(await previous.getByText('You have no public pages.', { exact: true }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent response binding: Main creation retains its original request after a wrong-scope receipt', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { wrongResponses: { ask: 'scope' } });
    await request(page).fill('Create a public gardening page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await request(page).isDisabled(), true);
    assert.equal(await request(page).inputValue(), 'Create a public gardening page');
    assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Send again', exact: true }).click();
    await page.getByRole('article', { name: 'Create a public gardening page', exact: true }).waitFor();
    const writes = await posts(page, '/api/agent-runs');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.deepEqual(writes[0].body, { message: 'Create a public gardening page' });
    assert.equal(writes[0].headers['x-account-id'], accountId);
    assert.equal(await page.evaluate(() => window.agentFixture.runs.length), 1);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) for (const nextStatus of ['waiting_for_approval', 'completed']) {
test(`agent response binding: an unconfirmed Stop survives ${nextStatus} at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const { page, outbound, errors } = await fixture(context, { privateSpace: spaceId, seedRuns: 1, wrongStops: 1,
      seedRecord: { status: 'running', outcome: null, answer: null, finished_at: null } });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    await card.getByRole('button', { name: 'Stop this request', exact: true }).click();
    await card.getByRole('alert').waitFor();
    await page.evaluate(async nextStatus => {
      const run = window.agentFixture.runs[0];
      run.status = nextStatus;
      run.version = '2';
      if (nextStatus === 'waiting_for_approval') {
        run.approval = { id: crypto.randomUUID(), run_id: run.id, space_id: run.space_id, tool_name: 'tasks.create', risk: 'low',
          summary: 'Create this task.', fields: [{ label: 'Title', value: 'Reviewed task' }], status: 'pending', reason: null,
          result_ref: null, created_at: run.created_at, expires_at: '2026-10-02T09:00:00Z', decided_at: null, version: '1', etag: `"${'a'.repeat(64)}"` };
      } else {
        run.answer = 'The request finished before cancellation was confirmed.';
        run.outcome = 'answered';
        run.finished_at = '2026-10-01T09:05:00Z';
      }
      await window.refreshAgentFixture('agentMessageRun');
    }, nextStatus);
    if (nextStatus === 'waiting_for_approval') await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    else await card.getByText('The request finished before cancellation was confirmed.', { exact: true }).waitFor();
    assert.equal(await card.getByRole('alert').count(), 1, 'The original Stop is still unconfirmed.');
    const retry = card.getByRole('alert').getByRole('button', { name: 'Stop this request', exact: true });
    assert.equal(await retry.count(), 1);
    if (width === 320) {
      const originalSize = await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    }
    await retry.scrollIntoViewIfNeeded();
    await retry.focus();
    const box = await retry.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    assert.equal(await retry.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return document.activeElement === element && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    }), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-stop-transition-${nextStatus}-${width}.png`), animations: 'disabled' });
    await retry.click();
    await card.getByRole('alert').waitFor({ state: 'detached' });
    await card.getByText(nextStatus === 'completed' ? 'Done' : 'Stopped', { exact: true }).waitFor();
    const writes = await posts(page, '/cancel');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(await page.evaluate(() => window.agentFixture.runs[0].status), nextStatus === 'completed' ? 'completed' : 'cancelled');
    assert.equal((await posts(page, '/approve')).length, 0);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});
}

test('agent response binding: unconfirmed answers retain the reviewed text', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { wrongResponses: { resume: 'id' } });
    await request(page).fill('Write a post for my page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: 'Write a post for my page', exact: true });
    const answer = card.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('The garden meetup is tomorrow.');
    await card.getByRole('button', { name: 'Answer', exact: true }).click();
    await card.getByRole('alert').waitFor();
    assert.equal(await answer.inputValue(), 'The garden meetup is tomorrow.');
    assert.equal(await answer.isDisabled(), true);
    assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
    await page.evaluate(async () => { await window.refreshAgentFixture('agentRuns'); });
    await card.getByRole('button', { name: 'Send again', exact: true }).click();
    await answer.waitFor({ state: 'detached' });
    const writes = await posts(page, '/resume');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(await page.evaluate(() => Object.keys(window.agentFixture.answers).length), 1);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) test(`agent response binding: Stop remains visibly retryable after a wrong-run response at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const { page, outbound, errors } = await fixture(context, {
      privateSpace: spaceId, seedRuns: 1, wrongStops: 1,
      seedRecord: { status: 'running', outcome: null, answer: null, finished_at: null },
    });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    const stop = card.getByRole('button', { name: 'Stop this request', exact: true });
    await stop.click();
    await card.getByRole('alert').waitFor();
    assert.equal(await card.getByRole('alert').count(), 1, 'An unconfirmed Stop needs a visible failure and retry.');
    assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
    assert.equal(await card.getByText('Stopped', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.runs[0].status), 'running');
    if (width === 320) {
      const originalSize = await stop.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await stop.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await stop.scrollIntoViewIfNeeded();
    await stop.focus();
    const box = await stop.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-stop-response-binding-${width}.png`), animations: 'disabled' });
    assert.equal(await stop.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return element === document.activeElement && element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
    }), true);
    await stop.click();
    await card.getByText('Stopped', { exact: true }).waitFor();
    const observed = await page.evaluate(() => ({ run: window.agentFixture.runs[0], writes: window.agentFixture.calls.filter(call => call.method === 'POST'), effects: window.agentFixture.created }));
    assert.equal(observed.writes.length, 2);
    assert.deepEqual(observed.writes[1], observed.writes[0]);
    assert.equal(observed.writes[0].route, `/api/agent-runs/${observed.run.id}/cancel`);
    assert.equal(observed.writes[0].headers['x-account-id'], accountId);
    assert.equal(observed.run.status, 'cancelled');
    assert.deepEqual(observed.effects, []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) test(`Space Agent inbox scopes status and pagination at ${width}px`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { inbox: true, initialSpaceId: spaceId, pageSize: 1 });
    await page.getByRole('article', { name: 'Completed family request', exact: true }).waitFor();
    assert.equal(await page.getByText('Main request must stay separate', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('article', { name: 'Club request', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('waiting_for_approval');
    await page.getByRole('article', { name: 'First family approval', exact: true }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'Completed family request', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Load more requests', exact: true }).click();
    await page.getByRole('article', { name: 'Older family approval', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 2);
    assert.equal(await page.getByRole('button', { name: 'Load more requests', exact: true }).count(), 0);
    const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/agent-runs'));
    assert.ok(reads.some(call => call.query.status === 'waiting_for_approval' && call.query.cursor === 'after-1'));
    assert.ok(reads.every(call => call.query.space_id === '359bd05a-c95c-4975-b061-d647e82a6958'));
    if (width === 320) await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    await status.scrollIntoViewIfNeeded();
    await status.focus();
    assert.equal(await status.evaluate(element => document.activeElement === element), true);
    assert.ok((await status.boundingBox()).height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-inbox-${width}.png`), fullPage: true });
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption(clubId);
    await page.getByRole('article', { name: 'Club request', exact: true }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'First family approval', exact: true }).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Status', exact: true }).inputValue(), 'all');
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('Space Agent inbox reuses the exact approval after a lost response', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { inbox: true, initialSpaceId: spaceId, loseApprovals: 1 });
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('waiting_for_approval');
    const card = page.getByRole('article', { name: 'First family approval', exact: true });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Approve again', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.agentFixture.created.length), 1);
    const decisions = await posts(page, '/approve');
    assert.equal(decisions.length, 2);
    assert.equal(decisions[0].headers['idempotency-key'], decisions[1].headers['idempotency-key']);
    assert.equal(decisions[0].headers['if-match'], decisions[1].headers['if-match']);
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('completed');
    await page.getByRole('article', { name: 'First family approval', exact: true }).waitFor();
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const failure of [403, 404, 503]) test(`Space Agent inbox hides cached actions and pagination after ${failure}`, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { inbox: true, initialSpaceId: spaceId, pageSize: 1 });
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('waiting_for_approval');
    await page.getByRole('button', { name: 'Approve', exact: true }).waitFor();
    await page.evaluate(async failure => { window.agentFixture.runsFailure = failure; await window.refreshAgentFixture('agentRuns'); }, failure);
    await page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' }).waitFor();
    assert.equal(await page.getByRole('article').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Load more requests', exact: true }).count(), 0);
    await page.evaluate(() => { window.agentFixture.runsFailure = 0; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('article', { name: 'First family approval', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

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

for (const [language, script] of [['en', /[A-Za-z]/], ['te', /[\u0C00-\u0C7F]/u], ['hi', /[\u0900-\u097F]/u]]) {
  test(`Agent provider notice is localized and readable before the first request in ${language}`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, { language });
      const notice = page.getByRole('main').locator('p').filter({ hasText: 'Microsoft Azure OpenAI' });
      await notice.waitFor();
      assert.match(await notice.textContent(), script);
      assert.match(await notice.textContent(), /TinyFish/);
      const privacy = notice.getByRole('link');
      assert.equal(await privacy.getAttribute('href'), '/privacy');
      assert.match(await privacy.textContent(), script);
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      await notice.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await notice.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

for (const [language, title] of [['en', 'AI data use'], ['te', 'AI డేటా వినియోగం'], ['hi', 'AI डेटा उपयोग']]) {
  test(`Agent data-use details remain available with existing history in ${language}`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, { language, seedRuns: 2 });
      const input = page.getByRole('main').locator('textarea');
      await input.fill('My unsent request');
      const trigger = page.getByRole('button', { name: title, exact: true });
      assert.equal(await trigger.count(), 1, 'History must not remove the data-use explanation.');
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      await dialog.waitFor();
      assert.match(await dialog.textContent(), /Microsoft Azure OpenAI/);
      assert.match(await dialog.textContent(), /TinyFish/);
      assert.equal(await dialog.getByRole('link').getAttribute('href'), '/privacy');
      assert.equal(await dialog.getByRole('link').getAttribute('target'), '_blank');
      assert.equal(await dialog.getByRole('link').getAttribute('rel'), 'noopener noreferrer');
      const originalSize = await dialog.locator('p').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await dialog.locator('p').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await input.inputValue(), 'My unsent request');
      assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
      await trigger.click();
      await dialog.getByRole('button').click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

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
    await card.locator('summary').getByText('Sources', { exact: true }).click();
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
    assert.equal(await progress.locator('xpath=preceding-sibling::span[1]').evaluate(element => getComputedStyle(element, '::after').animationName), 'none');
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

test('agent progress: recent steps, the announced step, elapsed time and the pulse come only from a working run', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const started = new Date(Date.now() - 65_000).toISOString();
    const { page, outbound, errors } = await fixture(context, { clock: true, seedRuns: 1, seedRecord: {
      status: 'running', answer: null, finished_at: null,
      events: [
        { sequence: 1, event_type: 'run.running', summary: 'Working on it.', created_at: started },
        { sequence: 2, event_type: 'run.searching', summary: 'Searching for Saturday dinner places.', created_at: started },
        { sequence: 3, event_type: 'run.reading', summary: 'Reading two menus.', created_at: started },
        { sequence: 4, event_type: 'run.research', summary: 'Comparing three options.', created_at: started },
      ],
    } });
    const card = page.getByRole('article', { name: 'Earlier request 1', exact: true });
    const progress = card.getByRole('status');
    await progress.getByText('Comparing three options.', { exact: true }).waitFor();
    assert.equal(await progress.textContent(), 'Comparing three options.');
    assert.deepEqual(await card.locator('ol[aria-hidden="true"] li').allTextContents(), ['Searching for Saturday dinner places.', 'Reading two menus.']);
    await card.getByText(/^1:0\d$/).waitFor();
    await page.clock.runFor(10_000);
    await card.getByText(/^1:1\d$/).waitFor();
    const pulsing = () => page.evaluate(() => [...document.querySelectorAll('body *')]
      .some(element => /pulse/.test(getComputedStyle(element, '::after').animationName)));
    assert.equal(await pulsing(), true);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-progress-working-desktop.png') });
    await page.evaluate(() => {
      Object.assign(window.agentFixture.runs[0], { status: 'completed', answer: 'Three places fit everyone.', finished_at: new Date().toISOString() });
      return window.refreshAgentFixture('agentRuns');
    });
    await card.getByText('Three places fit everyone.', { exact: true }).waitFor();
    assert.equal(await progress.count(), 0);
    assert.equal(await card.getByText(/^\d+:\d{2}$/).count(), 0);
    assert.equal(await pulsing(), false);
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

for (const privateSpace of [null, spaceId]) {
for (const status of ['queued', 'running', 'verifying']) {
  test(`agent progress fallback: ${privateSpace ? 'private ' : ''}${status} requests finish without a live hint or another write`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, {
        privateSpace, clock: true, seedRuns: 1, seedRecord: { status, outcome: null, answer: null, finished_at: null },
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
      const reads = await runReads(page);
      await page.clock.runFor(6000);
      assert.equal(await runReads(page), reads,
        'completed requests stop polling');
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

for (const status of [403, 404]) {
  test(`agent progress fallback: ${privateSpace ? 'private ' : ''}${status} hides the active request and stops polling`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, {
        privateSpace, clock: true, seedRuns: 1, seedRecord: { status: 'running', outcome: null, answer: null, finished_at: null },
      });
      await page.getByRole('article', { name: 'Earlier request 1', exact: true }).waitFor();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.evaluate(status => { window.agentFixture.runsFailure = status; }, status);
      await page.clock.runFor(2500);
      await page.getByRole('alert').filter({ hasText: privateSpace ? 'This private request is no longer available.' : 'Requests are unavailable.' }).waitFor({ timeout: 2000 });
      assert.equal(await page.getByRole('article', { name: 'Earlier request 1', exact: true }).count(), 0);
      const reads = await runReads(page);
      await page.clock.runFor(6000);
      assert.equal(await runReads(page), reads);
      assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}
}

for (const [kind, intent, tool, message] of [
  ['event', 'list_events', 'family.events.list', 'Show upcoming events'],
  ['poll', 'list_polls', 'space.poll.read', 'Show open polls'],
  ['document', 'search_documents', 'documents.search', 'Search documents for picnic'],
  ['page', 'list_pages', 'community.pages.list', 'Find pages about gardening'],
  ['space', 'space_settings', 'spaces.settings.read', 'Show space settings'],
  ['interests', 'list_interests', 'community.interests.read', 'Show my interests'],
]) {
  test(`read-only ${kind} records render safe Markdown, stay approval-free and scoped at desktop and large mobile text`, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
    try {
      const answer = `1. ${kind} source\nPicnic instructions (lines 1-3)\n${'Source'.repeat(35)}\n<img src=x onerror=alert(1)>`;
      const { page, outbound, errors } = await fixture(context, {
        privateSpace: spaceId, seedRuns: 1, seedRecord: {
          message, answer, intent, evidence: [{ kind, ref: spaceId, label: 'Visible source' }],
          tool_calls: [{ id: memoryId, sequence: 1, tool_name: tool, tool_version: '1', effect: 'read', risk: 'low',
            status: 'succeeded', summary: 'Read the authorized source.', result_ref: null, error_code: null, approval_id: null, created_at: '2026-10-01T09:00:00Z' }],
        },
      });
      const card = page.getByRole('article', { name: message, exact: true });
      const content = card.getByRole('listitem').filter({ hasText: `${kind} source` });
      await content.waitFor();
      assert.equal((await content.textContent()).replace(/\s+/g, ' ').trim(), `${kind} source Picnic instructions (lines 1-3) ${'Source'.repeat(35)}`);
      assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
      assert.equal(await card.locator('img, script').count(), 0);
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
      await page.evaluate(() => window.renderAgentFixture());
      await page.getByText('What can I help you with?', { exact: true }).waitFor();
      assert.equal(await page.getByRole('article', { name: message, exact: true }).count(), 0);
      assert.equal((await posts(page, '/api/agent-runs')).length, 0);
      assert.equal((await posts(page, '/approve')).length, 0);
      const read = await page.evaluate(() => window.agentFixture.calls.find(call => /^\/api\/agent-runs\/[^/]+$/.test(call.route)));
      assert.equal(read.headers['x-account-id'], accountId);
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
          id: '10000000-0000-4000-9000-000000000098', run_id: '10000000-0000-4000-9000-000000000001', space_id: null,
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

for (const width of [1280, 320]) for (const decision of ['approve', 'reject', 'retry']) {
  test(`space budget split review preserves all allocations and ${decision} at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'UTC' });
    try {
      const allocations = Array.from({ length: 12 }, (_, index) => `${index + 1}. Participant ${index + 1}: INR ${index < 8 ? '666.67 (includes one extra minor unit for rounding)' : '666.66'}`).join('\n');
      const fields = [
        { label: 'Event', value: 'Goa group trip' },
        { label: 'Change', value: 'Replace the cost-sharing plan; no payment or debt is created' },
        { label: 'Method', value: 'equal' }, { label: 'Based on', value: 'recorded' },
        { label: 'Total', value: 'INR 8000.00' }, { label: 'Shares', value: allocations },
        { label: 'Unallocated', value: 'INR 0.00' },
        { label: 'Visibility', value: 'The organizer and Space owner see all shares; other members see only their own' },
      ];
      const { page, outbound, errors } = await fixture(context, {
        privateSpace: spaceId, seedRuns: 1, loseApprovals: decision === 'retry' ? 1 : 0,
        seedRecord: {
          message: 'Split our Goa trip expenses', answer: null, intent: 'chat', status: 'waiting_for_approval', outcome: null, finished_at: null,
          approval: {
            id: '10000000-0000-4000-9000-000000000098', run_id: '10000000-0000-4000-9000-000000000001', space_id: spaceId,
            tool_name: 'events.budget.split', risk: 'medium', summary: 'Save this cost-sharing plan, without moving money.', fields,
            status: 'pending', reason: null, result_ref: null, created_at: '2026-10-01T09:00:00Z', expires_at: '2026-10-02T09:00:00Z',
            decided_at: null, version: '1', etag: firstEtag,
          },
        },
      });
      const card = page.getByRole('article', { name: 'Split our Goa trip expenses', exact: true });
      const approve = card.getByRole('button', { name: 'Approve', exact: true });
      const reject = card.getByRole('button', { name: "Don't do it", exact: true });
      await approve.waitFor();
      assert.deepEqual(await card.locator('dt').allTextContents(), fields.map(field => field.label));
      assert.deepEqual(await card.locator('dd').allTextContents(), fields.map(field => field.value));
      assert.equal(await card.locator('dd').nth(5).evaluate(element => getComputedStyle(element).whiteSpace), 'pre-wrap');
      assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      const originalSize = await approve.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      if (width === 320) {
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
          for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
        });
        assert.equal(await approve.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await approve.scrollIntoViewIfNeeded();
      await approve.focus();
      await page.keyboard.press('Tab');
      assert.equal(await reject.evaluate(element => document.activeElement === element), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await approve.evaluate(element => document.activeElement === element), true);
      for (const button of [approve, reject]) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        assert.equal(await button.evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }), true);
      }
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-split-review-${width}-${decision}.png`), fullPage: true });
      if (decision === 'reject') {
        await reject.click();
        await card.getByText('Okay. Nothing was changed.', { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
        assert.equal((await posts(page, '/approve')).length, 0);
        assert.equal((await posts(page, '/reject'))[0].headers['if-match'], firstEtag);
      } else {
        await approve.click();
        if (decision === 'retry') {
          await card.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
          await card.getByRole('button', { name: 'Approve again', exact: true }).click();
        }
        await card.getByText('Saved the cost-sharing plan. No money was moved.', { exact: true }).waitFor();
        const approvals = await posts(page, '/approve');
        assert.equal(approvals.length, decision === 'retry' ? 2 : 1);
        for (const approval of approvals) {
          assert.equal(approval.headers['x-account-id'], accountId);
          assert.equal(approval.headers['if-match'], firstEtag);
          assert.equal(approval.headers['idempotency-key'], approvals[0].headers['idempotency-key']);
          assert.deepEqual(approval.body, {});
        }
        assert.equal(await page.evaluate(() => window.agentFixture.created.length), 1);
      }
      await page.evaluate(() => window.renderAgentFixture());
      await page.getByRole('heading', { name: 'Your Main Agent', exact: true }).waitFor();
      assert.equal(await card.count(), 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

for (const width of [1280, 320]) for (const decision of ['approve', 'reject', 'retry']) {
  test(`Space Agent poll review preserves all fields and ${decision} at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try {
      const fields = [
        { label: 'Space', value: 'Morgan family' }, { label: 'Question', value: 'Where shall we meet?' },
        { label: 'Choices', value: '1. Cafe\n2. Park\n3. Library\n4. Community hall\n5. Garden\n6. Home' },
        { label: 'Closes', value: 'No automatic closing time' }, { label: 'Time zone', value: 'Asia/Kolkata' },
        { label: 'Who can see it', value: 'Current members who can see this poll; new members do not gain earlier history' },
        { label: 'Voting', value: "Members choose for themselves. Counts and each person's own choice are shown, not a voter list." },
      ];
      const { page, outbound, errors } = await fixture(context, {
        privateSpace: spaceId, seedRuns: 1, loseApprovals: decision === 'retry' ? 1 : 0,
        seedRecord: { message: 'Prepare our meeting poll', status: 'waiting_for_approval', outcome: null, answer: null, finished_at: null,
          approval: { id: '10000000-0000-4000-9000-000000000098', run_id: '10000000-0000-4000-9000-000000000001',
            space_id: spaceId, tool_name: 'space.poll.create', risk: 'medium', summary: 'Create this Space poll for members to answer.',
            fields, status: 'pending', reason: null, result_ref: null, created_at: '2026-10-01T09:00:00Z',
            expires_at: '2026-10-02T09:00:00Z', decided_at: null, version: '1', etag: firstEtag },
        },
      });
      const card = page.getByRole('article', { name: 'Prepare our meeting poll', exact: true });
      const approve = card.getByRole('button', { name: 'Approve', exact: true });
      await approve.waitFor();
      assert.deepEqual(await card.locator('dd').allTextContents(), fields.map(field => field.value));
      assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      const originalSize = await approve.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      if (width === 320) {
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
          for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
        });
        assert.equal(await approve.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      }
      await approve.scrollIntoViewIfNeeded();
      await approve.focus();
      const box = await approve.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await approve.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return document.activeElement === element && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-poll-review-${width}-${decision}.png`), fullPage: false });
      if (decision === 'reject') {
        await card.getByRole('button', { name: "Don't do it", exact: true }).click();
        await card.getByText('Okay. Nothing was changed.', { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
      } else {
        await approve.click();
        if (decision === 'retry') {
          await card.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
          await card.getByRole('button', { name: 'Approve again', exact: true }).click();
        }
        await card.getByText('Created the reviewed Space poll. No votes were cast.', { exact: true }).waitFor();
        const writes = await posts(page, '/approve');
        assert.equal(writes.length, decision === 'retry' ? 2 : 1);
        assert.equal(writes[0].headers['if-match'], firstEtag);
        assert.equal(writes[0].headers['x-account-id'], accountId);
        if (decision === 'retry') assert.deepEqual(writes[1], writes[0]);
        assert.equal(await page.evaluate(() => window.agentFixture.created.length), 1);
      }
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('a private Space request discloses its real plan, sources, action outcome and timestamped activity', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const resultRef = '10000000-0000-4000-9000-000000000099';
    const eventTime = '2026-10-01T09:00:10Z';
    const { page, outbound, errors } = await fixture(context, {
      privateSpace: spaceId, seedRuns: 1, seedRecord: {
        message: 'Show upcoming events', answer: 'There is one upcoming event.', intent: 'list_events',
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
    const card = page.getByRole('article', { name: 'Show upcoming events', exact: true });
    await card.getByText('There is one upcoming event.', { exact: true }).waitFor();

    const details = card.locator('details').filter({ has: page.locator('summary').getByText('Request details', { exact: true }) });
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

    await page.evaluate(spaceId => window.renderAgentFixture('en', spaceId), spaceId);
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

    await page.evaluate(() => window.renderAgentFixture());
    await page.getByRole('heading', { name: 'Your Main Agent', exact: true }).waitFor();
    assert.equal(await card.count(), 0, 'a private Space record is not shown in the Main Agent');
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('blank record text in older and new API-shaped runs is not rendered as empty detail rows', async () => {
  const blankRecord = {
    plan: [{ id: 'blank-plan', label: '  ', kind: 'check', tool: null, status: 'done' }],
    evidence: [{ kind: 'page', ref: null, label: '  ' }],
    tool_calls: [{ id: '10000000-0000-4000-9000-000000000098', sequence: 1, tool_name: 'community.pages.list', tool_version: '1',
      effect: 'read', risk: 'low', status: 'succeeded', summary: '  ', result_ref: null, error_code: null, approval_id: null,
      created_at: '2026-10-01T09:00:10Z' }],
    events: [{ sequence: 1, event_type: 'run.completed', summary: '  ', created_at: '2026-10-01T09:00:10Z' }],
  };
  for (const [language, headings, missingText, summary] of [
    ['en', ['Plan', 'Sources', 'Actions', 'Activity'], 'Not recorded.', 'Request details'],
    ['te', ['ప్రణాళిక', 'మూలాలు', 'చర్యలు', 'కార్యకలాపం'], 'వివరాలు నమోదు కాలేదు.', 'అభ్యర్థన వివరాలు'],
    ['hi', ['योजना', 'स्रोत', 'कार्रवाई', 'गतिविधि'], 'विवरण दर्ज नहीं है।', 'अनुरोध का विवरण'],
  ]) {
    const context = await browser.newContext({ timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await fixture(context, {
        language, seedRuns: 1, seedRecord: blankRecord,
        readOnly: { kind: 'page', intent: 'list_pages', tool: 'community.pages.list', answer: 'There are no public pages.' },
        record: blankRecord,
      });
      const earlier = page.getByRole('article', { name: 'Earlier request 1', exact: true });
      await earlier.locator('summary').getByText(summary, { exact: true }).click();
      for (const heading of headings) await earlier.getByRole('heading', { name: heading, exact: true }).waitFor();
      const records = card => card.locator('details').filter({ has: page.locator('summary').getByText(summary, { exact: true }) });
      assert.deepEqual(await records(earlier).locator('li > p:first-child').allTextContents(), Array(4).fill(missingText));

      const composer = page.locator('main form').first();
      await composer.locator('textarea').fill('Show pages');
      await composer.locator('button[type="submit"]').click();
      const created = page.getByRole('article', { name: 'Show pages', exact: true });
      await created.locator('summary').getByText(summary, { exact: true }).click();
      for (const heading of headings) await created.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.deepEqual(await records(created).locator('li > p:first-child').allTextContents(), Array(4).fill(missingText));

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
      await page.getByRole('button', { name: 'Send', exact: true }).click();
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
    await page.getByText('What can I help you with?', { exact: true }).waitFor();
    await page.getByText('When AI access is configured, Microsoft Azure OpenAI can receive your request, name, time zone, relevant history and permitted tool results. Web lookups send search words or page addresses to TinyFish.').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Privacy notice', exact: true }).getAttribute('href'), '/privacy');
    assert.equal(await request(page).evaluate(field => document.getElementById(field.getAttribute('aria-describedby').split(' ')[0]).textContent),
      'Ask about pages, posts, people to follow or anything on the web.');
    await request(page).fill('Create a public gardening page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const card = page.getByRole('article', { name: 'Create a public gardening page' });
    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal(await card.getByText('Needs your approval', { exact: true }).isVisible(), true);
    assert.deepEqual(await card.locator('dt').allTextContents(), ['Name', 'Handle', 'Topic', 'Audience']);
    assert.deepEqual(await card.locator('dd').allTextContents(), ['Gardening circle', 'gardening-circle', 'hobbies', 'Public']);
    assert.equal(await card.getByText('Nothing changes until you approve.', { exact: false }).isVisible(), true);
    assert.equal(await request(page).inputValue(), '');
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), [], 'asking only proposes the change');

    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByText('Done. Created \u201cGardening circle\u201d.', { exact: true }).waitFor();
    assert.equal(await card.getByText('Done', { exact: true }).isVisible(), true);
    assert.equal(await card.getByRole('heading', { name: 'Create this public page. (approved)', exact: true }).isVisible(), true);
    assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0);

    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 1);
    assert.deepEqual(asks[0].body, { message: 'Create a public gardening page' });
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
    await request(page).fill('Create a public gardening page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection. Your changes are not confirmed.' }).waitFor();
    assert.equal(await request(page).isDisabled(), true, 'a request with an unknown outcome cannot be edited into a different one');
    await page.getByRole('button', { name: 'Send again', exact: true }).click();

    const card = page.getByRole('article', { name: 'Create a public gardening page' });
    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 2);
    assert.equal(asks[1].headers['idempotency-key'], asks[0].headers['idempotency-key']);
    assert.equal(await page.evaluate(() => window.agentFixture.runs.length), 1);

    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByText('No connection. Your changes are not confirmed.', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Approve again', exact: true }).click();
    await card.getByText('Done. Created \u201cGardening circle\u201d.', { exact: true }).waitFor();
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
    await request(page).fill('Write a post for my page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: 'Write a post for my page' });
    await card.getByText('What should the post say?', { exact: true }).waitFor();
    assert.equal(await card.getByText('Needs your answer', { exact: true }).isVisible(), true);
    const answer = card.getByRole('textbox', { name: 'Your answer', exact: true });
    assert.equal(await answer.evaluate(field => document.getElementById(field.getAttribute('aria-describedby')).textContent), 'What should the post say?');
    assert.equal(await card.getByRole('button', { name: 'Answer', exact: true }).isDisabled(), true);
    await answer.fill('The garden meetup is tomorrow.');
    await card.getByRole('button', { name: 'Answer', exact: true }).click();

    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.deepEqual(await card.locator('dd').allTextContents(), ['Garden update', 'The garden meetup is tomorrow.', 'Private draft']);
    const [question] = await page.evaluate(() => window.agentFixture.questions);
    assert.deepEqual((await posts(page, '/resume')).map(call => call.body), [{ question_id: question, answer: 'The garden meetup is tomorrow.' }]);

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

test('Main Agent history excludes Space requests and earlier ones load only when asked', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 3, seedSpaceRuns: true, pageSize: 2, initialSpaceId: spaceId });
    await page.getByText('Earlier request 1', { exact: true }).waitFor();
    assert.equal(await page.getByText('Earlier request 2', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Earlier request 3', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Show earlier requests', exact: true }).click();
    await page.getByText('Earlier request 3', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Show earlier requests', exact: true }).count(), 0);
    const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'GET' && call.route === '/api/agent-runs').map(call => call.query));
    assert.deepEqual(reads, [{ limit: '20' }, { limit: '20', cursor: 'after-2' }]);
    assert.equal(await page.getByRole('article', { name: /^Private request in/ }).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Open the chat', exact: true }).getAttribute('href'), `/app/messages?space_id=${spaceId}`);
    await request(page).fill('Create a public gardening page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('article', { name: 'Create a public gardening page' }).getByText('Gardening circle', { exact: true }).waitFor();
    assert.deepEqual((await posts(page, '/api/agent-runs')).map(call => call.body), [{ message: 'Create a public gardening page' }]);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('Main Agent stays available when Spaces are unavailable and only links to a requested Space chat', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { spacesFailure: 503, initialSpaceId: spaceId });
    await request(page).fill('My unsent message');
    assert.equal(await request(page).inputValue(), 'My unsent message');
    assert.equal(await page.getByRole('link', { name: 'Open the chat', exact: true }).getAttribute('href'), `/app/messages?space_id=${spaceId}`);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.route === '/api/spaces').length), 0);
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent read recovery: failed history has an explicit Retry without sending an Agent request', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { runsFailure: 503 });
    const failure = page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' });
    await failure.waitFor();
    const retry = failure.getByRole('button', { name: 'Retry', exact: true });
    assert.equal(await retry.count(), 1, 'The failed history read must have its own Retry');
    assert.equal(await page.getByText('What can I help you with?', { exact: true }).count(), 0);
    await page.evaluate(() => { window.agentFixture.runsFailure = 0; });
    await retry.click();
    await page.getByText('What can I help you with?', { exact: true }).waitFor();
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
    assert.equal(await page.getByText('Nothing saved yet.', { exact: true }).count(), 0);
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

test('agent read privacy: denied Main Agent history hides old requests and its composer', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { seedRuns: 1 });
    await page.getByRole('article', { name: 'Earlier request 1', exact: true }).waitFor();
    await page.evaluate(() => { window.agentFixture.runsFailure = 403; });
    await page.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' }).waitFor();
    assert.equal(await page.getByRole('article', { name: 'Earlier request 1', exact: true }).count(), 0);
    assert.equal(await request(page).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).count(), 0);
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent read recovery: a temporary history outage preserves the typed request until Retry succeeds', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await request(page).fill('My unsent request');
    await page.evaluate(() => { window.agentFixture.runsFailure = 503; });
    await page.evaluate(() => window.refreshAgentFixture('agentRuns'));
    const failure = page.getByRole('alert').filter({ hasText: 'Requests are unavailable.' });
    await failure.waitFor();
    assert.equal(await request(page).inputValue(), 'My unsent request');
    await page.evaluate(() => { window.agentFixture.runsFailure = 0; });
    await failure.getByRole('button', { name: 'Retry', exact: true }).click();
    await failure.waitFor({ state: 'detached' });
    assert.equal(await request(page).inputValue(), 'My unsent request');
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) {
  for (const mode of ['edit', 'lost reply', 'wrong target', 'conflict', 'failed read', 'denied read']) {
    test(`memory controls ${mode} preserve state and exact decisions at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      try {
        const { page, outbound, errors } = await fixture(context, {
          loseMemoryEdits: mode === 'lost reply' ? 1 : 0, memoryWrongResult: mode === 'wrong target',
        });
        await page.getByRole('button', { name: 'Memories', exact: true }).click();
        await page.getByRole('button', { name: 'Edit memory: Prefers mornings', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit memory', exact: true });
        const text = dialog.getByRole('textbox', { name: 'Memory text', exact: true });
        const enabled = dialog.getByRole('checkbox', { name: 'Use for future requests', exact: true });
        const save = dialog.getByRole('button', { name: 'Save changes', exact: true });
        await text.fill('Prefers afternoon trips');
        await enabled.uncheck();
        assert.equal(await dialog.getByText('Disabling stops future memory retrieval. It does not erase earlier conversations or information already sent to a provider.', { exact: true }).isVisible(), true);
        if (width === 320) {
          const originalSize = await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
          await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
            for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
          });
          assert.equal(await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
        await save.scrollIntoViewIfNeeded();
        await save.focus();
        assert.equal(await save.evaluate(element => document.activeElement === element), true);
        const box = await save.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        assert.equal(await save.evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }), true);
        await page.screenshot({ path: path.join(root, `.local/screenshots/agent-memory-${width}-${mode.replaceAll(' ', '-')}.png`), fullPage: true });
        if (mode === 'failed read' || mode === 'denied read') {
          await page.evaluate(status => { window.agentFixture.memoriesFailure = status; }, mode === 'denied read' ? 403 : 503);
          await page.evaluate(() => window.refreshAgentFixture('agentMemories'));
          if (mode === 'denied read') {
            await dialog.waitFor({ state: 'hidden' });
            assert.equal(await page.getByRole('button', { name: 'Edit memory: Prefers mornings', exact: true }).count(), 0);
            assert.equal(await page.getByText('Prefers mornings', { exact: true }).count(), 0);
          } else {
            assert.equal(await text.inputValue(), 'Prefers afternoon trips');
            assert.equal(await enabled.isChecked(), false);
            assert.equal(await save.isDisabled(), true);
            await page.evaluate(() => { window.agentFixture.memoriesFailure = 0; });
            await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
            await save.waitFor();
            assert.equal(await text.inputValue(), 'Prefers afternoon trips');
          }
          assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'PATCH').length), 0);
          await finished(page, outbound, errors);
          return;
        }
        if (mode === 'conflict') {
          await page.evaluate(() => Object.assign(window.agentFixture.memories[0], {
            content: 'A newer saved note', enabled: true, version: '2', etag: `"${'c'.repeat(64)}"`,
          }));
        }
        await save.click();
        if (mode === 'lost reply' || mode === 'wrong target') {
          const retry = dialog.getByRole('button', { name: 'Retry original memory change', exact: true });
          await retry.waitFor();
          assert.equal(await text.isDisabled(), true);
          assert.equal(await enabled.isDisabled(), true);
          await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
          await page.getByRole('button', { name: 'Retry original memory change', exact: true }).click();
        } else if (mode === 'conflict') {
          await dialog.getByRole('button', { name: 'Review latest memory', exact: true }).click();
          assert.equal(await text.inputValue(), 'A newer saved note');
          assert.equal(await enabled.isChecked(), true);
          assert.equal(await page.evaluate(() => window.agentFixture.memoryEffects), 0);
          await enabled.uncheck();
          await save.click();
        }
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('status').filter({ hasText: 'Memory changes confirmed.' }).waitFor();
        const stored = await page.evaluate(() => window.agentFixture.memories[0]);
        assert.equal(stored.enabled, false);
        assert.equal(stored.content, mode === 'conflict' ? 'A newer saved note' : 'Prefers afternoon trips');
        assert.equal(await page.evaluate(() => window.agentFixture.memoryEffects), 1);
        const writes = await page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'PATCH'));
        assert.equal(writes.length, mode === 'edit' ? 1 : 2);
        assert.equal(writes[0].headers['if-match'], `"${'a'.repeat(64)}"`);
        assert.equal(writes[0].headers['x-account-id'], accountId);
        assert.deepEqual(writes[0].body, { content: 'Prefers afternoon trips', enabled: false });
        if (mode === 'lost reply' || mode === 'wrong target') assert.deepEqual(writes[1], writes[0]);
        if (mode === 'conflict') {
          assert.notEqual(writes[1].headers['idempotency-key'], writes[0].headers['idempotency-key']);
          assert.equal(writes[1].headers['if-match'], `"${'c'.repeat(64)}"`);
          assert.deepEqual(writes[1].body, { content: 'A newer saved note', enabled: false });
        }
        if (mode === 'edit') {
          await page.getByRole('button', { name: 'Edit memory: Prefers afternoon trips', exact: true }).click();
          await enabled.check();
          await save.click();
          await dialog.waitFor({ state: 'hidden' });
          assert.equal(await page.evaluate(() => window.agentFixture.memories[0].enabled), true);
          assert.equal(await page.evaluate(() => window.agentFixture.memoryEffects), 2);
        }
        await finished(page, outbound, errors);
      } finally { await context.close(); }
    });
  }
}

for (const language of ['te', 'hi']) {
  test(`memory controls stay usable in ${language} at 320px doubled text`, async () => {
    const { messages: { translate } } = loadMessages();
    const textFor = (key, values) => translate(language, key, values);
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, { language });
      await page.getByRole('button', { name: textFor('agent.memories'), exact: true }).click();
      await page.getByRole('button', { name: textFor('agent.editNamedMemory', { content: 'Prefers mornings' }), exact: true }).click();
      const dialog = page.getByRole('dialog', { name: textFor('agent.memoryEditTitle'), exact: true });
      await dialog.getByRole('textbox', { name: textFor('agent.memoryText'), exact: true }).fill('Prefers afternoons');
      await dialog.getByRole('checkbox', { name: textFor('agent.memoryEnabled'), exact: true }).uncheck();
      const save = dialog.getByRole('button', { name: textFor('agent.memorySave'), exact: true });
      const originalSize = await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      assert.equal(await save.evaluate(element => document.activeElement === element), true);
      const box = await save.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await save.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-memory-${language}-320.png`), fullPage: true });
      await save.click();
      await dialog.waitFor({ state: 'hidden' });
      const memory = await page.evaluate(() => window.agentFixture.memories[0]);
      assert.equal(memory.enabled, false);
      assert.equal(memory.content, 'Prefers afternoons');
      assert.equal(await page.evaluate(() => window.agentFixture.memoryEffects), 1);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

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
    assert.equal(await remove.evaluate(element => document.activeElement === element), true);
    await remove.click();
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await remove.evaluate(element => document.activeElement === element), true);
    const deletes = () => page.evaluate(() => window.agentFixture.calls.filter(call => call.method === 'DELETE'));
    assert.deepEqual(await deletes(), [], 'closing the dialog deletes nothing');
    assert.equal(await saved.isVisible(), true);

    await remove.click();
    assert.equal(await dialog.getByText('This removes the saved memory from future retrieval, not from earlier conversations or providers. Deletion cannot be undone.', { exact: true }).isVisible(), true);
    await dialog.getByRole('button', { name: 'Delete memory', exact: true }).click();
    await page.getByText('Nothing saved yet.', { exact: true }).waitFor();
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
    const { page, outbound, errors } = await fixture(context, { title: `Garden-${'A'.repeat(70)}`, seedRuns: 1 });
    await request(page).fill(`Create a page called Garden-${'A'.repeat(70)}`);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.equal(await fits(), true, 'requests at 320px');
    for (const name of ['Send', 'Approve', 'Don\'t do it', 'Refresh requests', 'Chat', 'Memories']) {
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

test('a request can be 2000 emoji long, and a longer one is explained before anything is sent', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByText('What can I help you with?', { exact: true }).waitFor();
    await request(page).focus();
    // Typed input is held to the field's maxLength, as a person's typing is.
    await page.keyboard.insertText('a'.repeat(2001));
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Keep a message under 2,000 characters.' }).waitFor();
    assert.equal((await posts(page, '/api/agent-runs')).length, 0);
    const emoji = '\u{1F600}'.repeat(2000);
    await request(page).fill('');
    await request(page).focus();
    await page.keyboard.insertText(emoji);
    assert.equal(await request(page).inputValue(), emoji, 'The request field must take 2000 emoji.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('article', { name: emoji }).getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const asks = await posts(page, '/api/agent-runs');
    assert.equal(asks.length, 1);
    assert.equal(asks[0].body.message, emoji);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

for (const action of ['approve', 'reject']) {
  test(`agent response binding: ${action} retains the reviewed command after a wrong-run receipt`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { wrongResponses: { [action]: 'id' } });
      await request(page).fill('Create a public gardening page');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      const card = page.getByRole('article', { name: 'Create a public gardening page', exact: true });
      await card.getByRole('button', { name: action === 'approve' ? 'Approve' : "Don't do it", exact: true }).click();
      await card.getByRole('alert').waitFor();
      assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
      assert.equal(await card.getByText('Done', { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.agentFixture.created.length), action === 'approve' ? 1 : 0);
      await card.getByRole('button', { name: action === 'approve' ? 'Approve again' : "Don't do it", exact: true }).click();
      await card.getByText(action === 'approve' ? 'Done. Created \u201cGardening circle\u201d.' : 'Okay. Nothing was changed.', { exact: true }).waitFor();
      const writes = await posts(page, `/${action}`);
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1], writes[0]);
      assert.equal(writes[0].headers['if-match'], firstEtag);
      assert.equal(writes[0].headers['x-account-id'], accountId);
      assert.equal(Boolean(writes[0].headers['idempotency-key']), action === 'approve');
      assert.equal(await page.evaluate(() => window.agentFixture.created.length), action === 'approve' ? 1 : 0);
      await finished(page, outbound, errors);
    } finally { await context.close(); }
  });
}

test('agent response binding: a wrong private read is never installed and recovery performs no write', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { privateSpace: spaceId, seedRuns: 1 });
    await page.evaluate(async () => {
      window.agentFixture.wrongResponses.read = 'id';
      await window.refreshAgentFixture('agentMessageRun');
    });
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    await page.getByRole('article', { name: 'Earlier request 1', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.agentFixture.calls.filter(call => call.method !== 'GET').length), 0);
    const reads = await page.evaluate(() => window.agentFixture.calls.filter(call => /^\/api\/agent-runs\/[^/]+$/.test(call.route)));
    assert.ok(reads.length >= 3);
    assert.ok(reads.every(call => call.route === reads[0].route && call.headers['x-account-id'] === accountId));
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});

test('agent response binding: an unconfirmed answer keeps the original question and text for retry', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { wrongResponses: { resume: 'id' } });
    await request(page).fill('Write a post for my page');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: 'Write a post for my page', exact: true });
    const answer = card.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('The garden meetup is tomorrow.');
    await card.getByRole('button', { name: 'Answer', exact: true }).click();
    await card.getByRole('alert').waitFor();
    assert.equal(await answer.inputValue(), 'The garden meetup is tomorrow.');
    assert.equal(await answer.isDisabled(), true, 'An unconfirmed answer cannot be changed into a different retry.');
    assert.equal(await page.getByText('Unrelated answer must remain hidden.', { exact: true }).count(), 0);
    await page.evaluate(async () => { await window.refreshAgentFixture('agentRuns'); });
    assert.equal(await answer.inputValue(), 'The garden meetup is tomorrow.');
    await card.getByRole('button', { name: 'Send again', exact: true }).click();
    await answer.waitFor({ state: 'detached' });
    await card.getByText('The garden meetup is tomorrow.', { exact: true }).waitFor();
    const writes = await posts(page, '/resume');
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[0].headers['x-account-id'], accountId);
    assert.equal(await page.evaluate(() => Object.keys(window.agentFixture.answers).length), 1);
    assert.deepEqual(await page.evaluate(() => window.agentFixture.created), []);
    await finished(page, outbound, errors);
  } finally { await context.close(); }
});