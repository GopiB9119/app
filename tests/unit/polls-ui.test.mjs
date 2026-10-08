import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Space polls screen with a simulated server and no network.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { PollsScreen } from './src/features/polls/polls-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderPollsFixture = () => root.render(<Providers><PollsScreen initialSpaceId="${spaceId}" /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-polls.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-polls.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-polls-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => "/app/polls"; export const useRouter = () => ({ push() {}, replace() {}, refresh() {} }); export const useSearchParams = () => new URLSearchParams();',
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

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline polls</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, options }) => {
    let sequence = 0;
    const next = () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;
    Object.defineProperty(crypto, 'randomUUID', { value: next, configurable: true });
    const state = window.pollsFixture = { calls: [], polls: [], receipts: {}, loseCreates: options.loseCreates ?? 0, owner: options.owner ?? true };
    const reply = (data, extra = {}, status = 200) => new Response(JSON.stringify({ data, request_id: 'offline-polls', ...extra }), { status });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-polls' }), { status });
    const view = poll => {
      const counts = poll.options.map(option => Object.values(poll.votes).filter(choice => choice === option.id).length);
      const most = Math.max(...counts);
      const open = poll.status === 'open';
      const closer = state.owner || poll.creator === accountId;
      return {
        id: poll.id, space_id: spaceId, question: poll.question, status: poll.status, closes_at: null, closed_at: poll.closed_at,
        options: poll.options.map((option, index) => ({ ...option, votes: counts[index] })),
        created_by_name: poll.creator === accountId ? 'Alex Morgan' : 'Sam Lee', created_at: poll.created_at,
        total_votes: counts.reduce((sum, value) => sum + value, 0), my_option_id: poll.votes[accountId] ?? null,
        leading_option_ids: most > 0 ? poll.options.filter((_option, index) => counts[index] === most).map(option => option.id) : [],
        can_vote: open, can_close: open && closer, etag: closer ? `"poll-${poll.version}"` : null,
      };
    };
    for (const seed of options.seed ?? []) {
      state.polls.push({ id: next(), question: seed.question, status: 'open', closed_at: null, version: 1, creator: seed.creator ?? accountId,
        created_at: '2026-10-07T10:00:00Z', options: seed.options.map(label => ({ id: next(), label })), votes: { ...(seed.votes ?? {}) } });
    }
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      if (url.pathname === '/api/live') {
        return new Response(new ReadableStream({ start(controller) { config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} }); } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      state.calls.push({ route: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') return reply([{ id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
        role: state.owner ? 'owner' : 'member', version: '1', created_at: '2026-09-19T10:00:00Z', member_count: 3, member_preview: ['Sam Lee', 'Priya Rao'] }],
        { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `/api/spaces/${spaceId}/polls` && method === 'GET') {
        const status = url.searchParams.get('status');
        return reply(state.polls.filter(poll => poll.status === status).slice().reverse().map(view), { pagination: { next_cursor: null, has_more: false } });
      }
      if (url.pathname === `/api/spaces/${spaceId}/polls` && method === 'POST') {
        const key = headers['idempotency-key'];
        let poll = state.receipts[key];
        if (!poll) {
          poll = { id: next(), question: body.question, status: 'open', closed_at: null, version: 1, creator: accountId, created_at: '2026-10-07T11:00:00Z',
            options: body.options.map(label => ({ id: next(), label })), votes: {} };
          state.polls.push(poll);
          state.receipts[key] = poll;
        }
        if (state.loseCreates > 0) { state.loseCreates -= 1; throw new TypeError('Synthetic lost answer after the poll was saved'); }
        return reply(view(poll), {}, 201);
      }
      const match = url.pathname.match(/^\/api\/polls\/([^/]+)\/(vote|close)$/);
      const poll = match && state.polls.find(item => item.id === match[1]);
      if (!poll) return failed(404, 'NOT_FOUND', 'Poll not found.');
      if (poll.status !== 'open') return failed(409, 'POLL_CLOSED', 'This poll is closed.');
      if (match[2] === 'vote' && method === 'PUT') poll.votes[accountId] = body.option_id;
      else if (match[2] === 'vote' && method === 'DELETE') delete poll.votes[accountId];
      else if (match[2] === 'close' && method === 'POST') {
        if (headers['if-match'] !== `"poll-${poll.version}"`) return failed(412, 'POLL_CHANGED', 'This poll changed since you reviewed it.');
        Object.assign(poll, { status: 'closed', closed_at: '2026-10-07T12:00:00Z', version: poll.version + 1 });
      } else return failed(405, 'METHOD_NOT_ALLOWED', 'Not allowed.');
      return reply(view(poll));
    };
  }, { accountId, spaceId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderPollsFixture());
  await page.getByRole('heading', { name: 'Polls', exact: true, level: 1 }).waitFor();
  return { page, outbound, errors };
}

const writes = page => page.evaluate(() => window.pollsFixture.calls.filter(call => call.method !== 'GET').map(call => `${call.method} ${call.route}`));

test('polls: ask a question, vote, change and withdraw the vote, then close it after confirming', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const header = page.getByRole('region', { name: 'Morgan family Space', exact: true });
    assert.equal(await header.locator('a[aria-current="page"]').getAttribute('href'), `/app/polls?space_id=${spaceId}`);
    await page.getByText(/^No open polls\./).first().waitFor();
    await page.getByLabel('Question', { exact: true }).fill('Where should we eat?');
    await page.getByLabel('Choice 1', { exact: true }).fill('Pizza House');
    await page.getByLabel('Choice 2', { exact: true }).fill('Indian Kitchen');
    await page.getByRole('button', { name: 'Add a choice', exact: true }).click();
    await page.getByLabel('Choice 3', { exact: true }).fill('Burger Place');
    await page.getByRole('button', { name: 'Ask the Space', exact: true }).click();
    const card = page.getByRole('article', { name: 'Where should we eat?', exact: true });
    await card.waitFor();
    const created = await page.evaluate(() => window.pollsFixture.calls.find(call => call.method === 'POST'));
    assert.deepEqual(created.body, { question: 'Where should we eat?', options: ['Pizza House', 'Indian Kitchen', 'Burger Place'] });

    await card.getByRole('button', { name: /^Indian Kitchen/ }).click();
    await card.getByRole('button', { name: /^Indian Kitchen/ }).and(page.locator('[aria-pressed="true"]')).waitFor();
    await card.getByText('1 vote', { exact: true }).waitFor();
    await card.getByRole('button', { name: /^Pizza House/ }).click();
    await card.getByRole('button', { name: /^Pizza House/ }).and(page.locator('[aria-pressed="true"]')).waitFor();
    await card.getByRole('button', { name: 'Take back my vote', exact: true }).click();
    await card.getByText('No votes yet', { exact: true }).waitFor();

    await card.getByRole('button', { name: 'Close poll', exact: true }).click();
    const confirm = card.getByRole('group', { name: 'Close poll', exact: true });
    await confirm.getByRole('button', { name: 'Close poll', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Closed', exact: true }).click();
    const closed = page.getByRole('article', { name: 'Where should we eat?', exact: true });
    await closed.waitFor();
    assert.equal(await closed.getByRole('button').count(), 0, 'A closed poll offers no vote or close buttons.');
    const pollId = await page.evaluate(() => window.pollsFixture.polls[0].id);
    assert.deepEqual(await writes(page), [
      `POST /api/spaces/${spaceId}/polls`, `PUT /api/polls/${pollId}/vote`, `PUT /api/polls/${pollId}/vote`,
      `DELETE /api/polls/${pollId}/vote`, `POST /api/polls/${pollId}/close`,
    ]);
    const close = await page.evaluate(() => window.pollsFixture.calls.find(call => call.route.endsWith('/close')));
    assert.equal(close.headers['if-match'], '"poll-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('polls: an unconfirmed new poll keeps its text and retries with the same key, creating it once', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    await page.getByLabel('Question', { exact: true }).fill('Which day?');
    await page.getByLabel('Choice 1', { exact: true }).fill('Saturday');
    await page.getByLabel('Choice 2', { exact: true }).fill('Sunday');
    await page.getByRole('button', { name: 'Ask the Space', exact: true }).click();
    await page.getByRole('alert').first().waitFor();
    assert.equal(await page.getByLabel('Question', { exact: true }).inputValue(), 'Which day?');
    assert.equal(await page.getByLabel('Question', { exact: true }).isDisabled(), true, 'An unconfirmed poll keeps its exact text.');
    await page.getByRole('button', { name: 'Ask the Space', exact: true }).click();
    await page.getByRole('article', { name: 'Which day?', exact: true }).waitFor();
    const posts = await page.evaluate(() => window.pollsFixture.calls.filter(call => call.method === 'POST'));
    assert.equal(posts.length, 2);
    assert.equal(posts[0].headers['idempotency-key'], posts[1].headers['idempotency-key']);
    assert.equal(posts[0].body.question, posts[1].body.question);
    assert.equal(await page.evaluate(() => window.pollsFixture.polls.length), 1);
    assert.equal(await page.getByLabel('Question', { exact: true }).inputValue(), '');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('polls: duplicate or missing choices are explained before anything is sent', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByLabel('Question', { exact: true }).fill('Which day?');
    await page.getByLabel('Choice 1', { exact: true }).fill('Saturday');
    await page.getByRole('button', { name: 'Ask the Space', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /at least two/i }).waitFor();
    await page.getByLabel('Choice 2', { exact: true }).fill(' saturday ');
    await page.getByRole('button', { name: 'Ask the Space', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /different/i }).waitFor();
    assert.deepEqual(await writes(page), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('polls: a member who did not ask cannot close it, a tie shows both leaders, and everything fits 320 px at doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, timezoneId: 'UTC' });
  try {
    const sam = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
    const { page, outbound, errors } = await fixture(context, { owner: false, seed: [
      { question: 'Picnic or museum this Sunday afternoon?', options: ['Picnic by the river', 'Science museum'], creator: sam },
    ] });
    const card = page.getByRole('article', { name: 'Picnic or museum this Sunday afternoon?', exact: true });
    await card.waitFor();
    assert.equal(await card.getByRole('button', { name: 'Close poll', exact: true }).count(), 0);
    await page.evaluate(sam => { const poll = window.pollsFixture.polls[0]; poll.votes[sam] = poll.options[0].id; }, sam);
    await card.getByRole('button', { name: /^Science museum/ }).click();
    await card.getByText('Tied', { exact: true }).first().waitFor();
    assert.equal(await card.getByText('Tied', { exact: true }).count(), 2);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Polls must fit 320 px at doubled text.');
    for (const button of await card.getByRole('button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320.5 && box.height >= 44, JSON.stringify(box));
    }
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/space-polls-320-large-text.png'), fullPage: true });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
