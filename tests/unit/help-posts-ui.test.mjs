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
const viewerId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { HelpReviewQueue, HelpSection, MyHelpPosts } from './src/features/community/help-posts';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        function Harness({ viewer, initial }) {
          const [page, setPage] = React.useState(initial);
          window.shownPage = page;
          return <HelpSection viewer={viewer} page={page} onPageChanged={setPage} />;
        }
        window.renderHelp = (viewer, page, language = 'en') => root.render(<Providers language={language}><Harness viewer={viewer} initial={page} /></Providers>);
        window.renderMine = (account, language = 'en') => root.render(<Providers language={language}><MyHelpPosts account={account} /></Providers>);
        window.renderQueue = account => root.render(<Providers language="en"><HelpReviewQueue account={account} /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-help.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-help.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-help-dependencies', setup(builder) {
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

const created = '2026-10-06T06:00:00Z';
const page = (extra = {}) => ({
  id: pageId, handle: 'street-helpers', name: 'Street Helpers', description: '', rules: '', topic: 'community',
  classification: { other_topics: [], interests: [], languages: [], places: [], community_types: [], audiences: [], activities: [], content_kinds: [] },
  status: 'active', follower_count: 3, created_at: created, updated_at: created, following: true, blocked: false,
  can_manage: false, etag: null, limited: false, help_open: true, ...extra,
});
const helpPost = (id, extra = {}) => ({
  id, page_id: pageId, page_handle: 'street-helpers', page_name: 'Street Helpers', kind: 'request', title: 'Need a ride to the clinic',
  details: 'Saturday morning.', place: null, need_by: '2026-10-10', status: 'open', author_name: 'Asha', reply_count: 0,
  created_at: created, updated_at: created, ended_at: null, mine: false, can_manage: false, replied: false, helped_reply_id: null, etag: null, ...extra,
});

// A fake API that answers only the help routes and records every call; anything else is a test failure.
async function fixture(context, { viewer = { id: viewerId }, shown = page(), posts = [], replies = [], language = 'en', mine = false, queue = false } = {}) {
  await context.route('**/*', route => route.abort('blockedbyclient'));
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  await tab.setContent('<html><head><title>Offline help</title></head><body><div id="root"></div></body></html>');
  await tab.addStyleTag({ content: css });
  await tab.evaluate(({ shown, posts, replies, pageId }) => {
    const state = window.helpFixture = { calls: [], unexpected: [], page: shown, posts, replies, sequence: 0 };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-help', ...extra }), { status: 200 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ path: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === `/api/pages/${pageId}/help-posts` && method === 'GET') {
        const listed = url.searchParams.get('state') === 'all' ? state.posts : state.posts.filter(item => item.status === 'open' || item.status === 'pending');
        return reply(listed, { pagination: { next_cursor: null, has_more: false } });
      }
      if (url.pathname === `/api/pages/${pageId}/help-posts` && method === 'POST') {
        const made = { ...state.posts[0], ...body, id: '11111111-1111-4111-8111-111111111111', details: body.details, need_by: body.need_by ?? null,
          mine: true, etag: '"help-1"', author_name: 'Alex Morgan', reply_count: 0, replied: false, status: 'open', ended_at: null };
        state.posts = [made, ...state.posts];
        return reply(made);
      }
      if (url.pathname === `/api/pages/${pageId}` && method === 'PATCH') {
        if (headers['if-match'] !== state.page.etag) return new Response(JSON.stringify({ error: { code: 'CONTENT_CHANGED', message: 'Changed.', details: {} } }), { status: 412 });
        state.page = { ...state.page, ...body, etag: '"page-2"' };
        return reply(state.page);
      }
      const replyRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/replies$/);
      if (replyRoute && method === 'GET') return reply(state.replies.filter(item => item.post_id === replyRoute[1]));
      if (replyRoute && method === 'POST') {
        const made = { id: '22222222-2222-4222-8222-222222222222', post_id: replyRoute[1], author_name: 'Alex Morgan', body: body.body,
          status: 'active', created_at: '2026-10-06T06:05:00Z', ended_at: null, mine: true, helped: false };
        state.replies.push(made);
        state.posts = state.posts.map(item => item.id === replyRoute[1] ? { ...item, replied: true, reply_count: item.reply_count + 1 } : item);
        return reply(made);
      }
      const resolveRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/resolve$/);
      if (resolveRoute && method === 'POST') {
        const target = state.posts.find(item => item.id === resolveRoute[1]);
        const done = { ...target, status: body.outcome, helped_reply_id: body.reply_id ?? null, ended_at: '2026-10-06T06:10:00Z', etag: '"help-2"' };
        state.posts = state.posts.map(item => item.id === done.id ? done : item);
        return reply(done);
      }
      const endRoute = url.pathname.match(/^\/api\/help-replies\/([^/]+)\/end$/);
      if (endRoute && method === 'POST') {
        const target = state.replies.find(item => item.id === endRoute[1]);
        const ended = { ...target, status: target.mine ? 'withdrawn' : 'removed', body: null, ended_at: '2026-10-06T06:10:00Z' };
        state.replies = state.replies.map(item => item.id === ended.id ? ended : item);
        state.posts = state.posts.map(item => item.id === ended.post_id ? { ...item, replied: false, reply_count: Math.max(0, item.reply_count - 1) } : item);
        return reply(ended);
      }
      if (url.pathname === '/api/me/help-posts' && method === 'GET') return reply(state.posts, { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/me/help-review' && method === 'GET') return reply(state.posts);
      const reportRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/report$/);
      if (reportRoute && method === 'POST') {
        state.posts = state.posts.map(item => item.id === reportRoute[1] ? { ...item, reported: true } : item);
        return reply({ id: '66666666-6666-4666-8666-666666666666', post_id: reportRoute[1], reason: body.reason, status: 'received', created_at: '2026-10-06T06:00:00Z' });
      }
      const notesRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/reports$/);
      if (notesRoute && method === 'GET') return reply([{ id: '77777777-7777-4777-8777-777777777777', reason: 'scam', details: 'Asks for money first.', created_at: '2026-10-06T06:00:00Z' }]);
      const approveRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/approve$/);
      if (approveRoute && method === 'POST') {
        const approved = { ...state.posts.find(item => item.id === approveRoute[1]), status: 'open', etag: '"help-2"' };
        state.posts = state.posts.map(item => item.id === approved.id ? approved : item);
        return reply(approved);
      }
      const keepRoute = url.pathname.match(/^\/api\/help-posts\/([^/]+)\/keep$/);
      if (keepRoute && method === 'POST') {
        const target = state.posts.find(item => item.id === keepRoute[1]);
        const kept = { ...target, reports: [] };
        state.posts = state.posts.map(item => item.id === kept.id ? kept : item);
        return reply(kept);
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } }), { status: 404 });
    };
  }, { shown, posts, replies, pageId });
  await tab.addScriptTag({ content: javascript });
  await tab.evaluate(({ viewer, shown, language, mine, queue }) => {
    const account = viewer ? { id: viewer.id, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 } : null;
    if (queue) window.renderQueue(account);
    else if (mine) window.renderMine(account, language);
    else window.renderHelp(account, shown, language);
  }, { viewer, shown, language, mine, queue });
  return { tab, errors, calls: () => tab.evaluate(() => window.helpFixture.calls), unexpected: () => tab.evaluate(() => window.helpFixture.unexpected) };
}

test('the page owner turns requests and offers on with the reviewed version', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, calls, unexpected } = await fixture(context, { shown: page({ can_manage: true, etag: '"page-1"', help_open: false, following: false }) });
    await tab.getByText("Followers can't post requests or offers here yet.").waitFor();
    await tab.getByRole('button', { name: 'Take requests and offers' }).click();
    await tab.getByRole('button', { name: 'Stop taking requests and offers' }).waitFor();
    const patch = (await calls()).find(call => call.method === 'PATCH');
    assert.deepEqual(patch.body, { help_open: true });
    assert.equal(patch.headers['if-match'], '"page-1"');
    assert.equal(await tab.evaluate(() => window.shownPage.help_open), true);
    await tab.getByRole('form', { name: 'New request or offer' }).waitFor();
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a follower posts a request without contact details and the list refreshes', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, calls, unexpected } = await fixture(context, { posts: [helpPost('33333333-3333-4333-8333-333333333333')] });
    const form = tab.getByRole('form', { name: 'New request or offer' });
    await form.waitFor();
    await form.getByLabel('In a few words').fill('Call me on 98480 12345');
    await form.getByText('Leave out phone numbers, email addresses and links. People share them in a private reply.').waitFor();
    assert.equal(await form.getByRole('button', { name: 'Post' }).isDisabled(), true);
    await form.getByLabel('In a few words').fill('Need help carrying a sofa');
    await form.getByLabel('Needed by (optional)').fill('2026-10-12');
    await form.getByRole('button', { name: 'Post' }).click();
    await tab.getByRole('heading', { name: 'Need help carrying a sofa' }).waitFor();
    const posted = (await calls()).find(call => call.method === 'POST');
    assert.deepEqual(posted.body, { kind: 'request', title: 'Need help carrying a sofa', details: '', need_by: '2026-10-12' });
    assert.match(posted.headers['idempotency-key'], /^00000000-0000-4000-8000-/);
    assert.equal(await form.getByLabel('In a few words').inputValue(), '');
    await form.getByRole('button', { name: 'I can help' }).click();
    assert.equal(await form.getByLabel('Needed by (optional)').count(), 0, 'An offer has no need-by date');
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('people who do not follow or are signed out are told how to take part, and nothing is posted', async () => {
  for (const options of [{ shown: page({ following: false }) }, { viewer: null }]) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    try {
      const { tab, calls } = await fixture(context, { ...options, posts: [helpPost('33333333-3333-4333-8333-333333333333')] });
      await tab.getByRole('heading', { name: 'Need a ride to the clinic' }).waitFor();
      await tab.getByText(options.viewer === null ? 'Sign in to ask for help or to offer it.' : 'Follow this page to post a request or an offer.').waitFor();
      assert.equal(await tab.getByRole('form', { name: 'New request or offer' }).count(), 0);
      assert.equal(await tab.getByRole('button', { name: 'I can help' }).count(), options.viewer === null ? 0 : 1);
      assert.ok((await calls()).every(call => call.method === 'GET'));
    } finally { await context.close(); }
  }
});

test('a helper replies privately and can withdraw the reply', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const postId = '33333333-3333-4333-8333-333333333333';
    const { tab, errors, calls, unexpected } = await fixture(context, { posts: [helpPost(postId)] });
    const card = tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await card.getByRole('button', { name: 'I can help' }).click();
    await card.getByRole('textbox', { name: 'Your private reply' }).fill('I can drive at 9. Call 98480 12345.');
    await card.getByText('Only the person who posted and the page\'s managers will see this. You can say how to reach you.').waitFor();
    await card.getByRole('button', { name: 'Send privately' }).click();
    await card.getByText('You replied privately.').waitFor();
    const sent = (await calls()).find(call => call.method === 'POST');
    assert.equal(sent.path, `/api/help-posts/${postId}/replies`);
    assert.deepEqual(sent.body, { body: 'I can drive at 9. Call 98480 12345.' });
    await card.getByRole('button', { name: 'Withdraw my reply' }).click();
    await card.getByRole('button', { name: 'I can help' }).waitFor();
    assert.equal((await calls()).filter(call => call.path === '/api/help-replies/22222222-2222-4222-8222-222222222222/end').length, 1);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the author reads private replies and marks the one that helped', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const postId = '33333333-3333-4333-8333-333333333333';
    const replyId = '44444444-4444-4444-8444-444444444444';
    const { tab, errors, calls, unexpected } = await fixture(context, {
      posts: [helpPost(postId, { mine: true, etag: '"help-1"', reply_count: 1, author_name: 'Alex Morgan' })],
      replies: [{ id: replyId, post_id: postId, author_name: 'Sam', author_new: true, body: 'I have a car.', status: 'active', created_at: created, ended_at: null, mine: false, helped: false }],
    });
    const card = tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await card.getByText('By Alex Morgan · Needed by Oct 10, 2026 · 1 private reply').waitFor();
    await card.getByRole('button', { name: 'Show replies' }).click();
    await card.getByText('I have a car.').waitFor();
    await card.getByText('Sam · New account', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'This helped' }).click();
    await tab.getByText('No open requests or offers.').waitFor();
    const resolved = (await calls()).find(call => call.path === `/api/help-posts/${postId}/resolve`);
    assert.deepEqual(resolved.body, { outcome: 'helped', reply_id: replyId });
    assert.equal(resolved.headers['if-match'], '"help-1"');
    await tab.getByRole('button', { name: 'All' }).click();
    await tab.getByRole('article', { name: 'Need a ride to the clinic' }).getByText('Helped', { exact: true }).waitFor();
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the person sees their own requests and offers with the page and progress of each', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, calls, unexpected } = await fixture(context, {
      mine: true,
      posts: [
        helpPost('33333333-3333-4333-8333-333333333333', { mine: true, etag: '"help-1"', reply_count: 2 }),
        helpPost('55555555-5555-4555-8555-555555555555', { mine: true, etag: '"help-2"', kind: 'offer', title: 'Spare moving boxes', page_handle: 'river-walkers', page_name: 'River Walkers', status: 'helped', need_by: null, ended_at: created }),
      ],
    });
    await tab.getByRole('heading', { name: 'Your requests and offers' }).waitFor();
    const ride = tab.getByRole('link', { name: 'Need a ride to the clinic' });
    await ride.waitFor();
    assert.equal(await ride.getAttribute('href'), '/pages/street-helpers');
    await tab.getByText('Street Helpers · Request · 2 private replies', { exact: true }).waitFor();
    assert.equal(await tab.getByRole('link', { name: 'Spare moving boxes' }).getAttribute('href'), '/pages/river-walkers');
    await tab.getByText('River Walkers · Offer · Helped', { exact: true }).waitFor();
    assert.deepEqual((await calls()).map(call => `${call.method} ${call.path}`), ['GET /api/me/help-posts']);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a reader reports a post as a scam and a page manager reads the note and keeps it', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const postId = '33333333-3333-4333-8333-333333333333';
    const reader = await fixture(context, { posts: [helpPost(postId)] });
    const card = reader.tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await card.getByRole('button', { name: 'Report' }).click();
    const dialog = reader.tab.getByRole('dialog', { name: 'Report this request or offer' });
    await dialog.getByRole('radio', { name: 'Asks for money or fraud' }).check();
    await dialog.getByRole('textbox').fill('Asks for money first.');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await dialog.getByText(/^Report received\./).waitFor();
    const sent = (await reader.calls()).find(call => call.path === `/api/help-posts/${postId}/report`);
    assert.deepEqual(sent.body, { reason: 'scam', details: 'Asks for money first.' });
    await dialog.getByRole('button', { name: 'Close' }).click();
    await card.getByText('Reported', { exact: true }).waitFor();
    assert.deepEqual(await reader.unexpected(), []);
    assert.deepEqual(reader.errors, []);
    await reader.tab.close();

    const manager = await fixture(context, {
      shown: page({ can_manage: true, etag: '"page-1"' }),
      posts: [helpPost(postId, { can_manage: true, etag: '"help-1"', reports: [{ reason: 'scam', count: 2 }, { reason: 'spam', count: 1 }] })],
    });
    const managed = manager.tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await managed.getByText('Reports to review: Asks for money or fraud (2), Spam or scam (1)').waitFor();
    assert.equal(await managed.getByRole('button', { name: 'Report', exact: true }).count(), 0);
    await managed.getByRole('button', { name: 'Show report notes' }).click();
    await managed.getByText('Asks for money or fraud: Asks for money first.').waitFor();
    await managed.getByRole('button', { name: 'Keep post' }).click();
    await managed.getByText(/^Reports to review/).waitFor({ state: 'detached' });
    const keep = (await manager.calls()).find(call => call.path === `/api/help-posts/${postId}/keep`);
    assert.deepEqual(keep.body, { reports: 3 });
    assert.equal(keep.headers['if-match'], '"help-1"');
    assert.deepEqual(await manager.unexpected(), []);
    assert.deepEqual(manager.errors, []);
  } finally { await context.close(); }
});

test('a post waiting for review tells its author why, and a page manager approves it', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const postId = '33333333-3333-4333-8333-333333333333';
    const author = await fixture(context, { posts: [helpPost(postId, { status: 'pending', mine: true, etag: '"help-1"' })] });
    const own = author.tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await own.getByText('Waiting for review', { exact: true }).waitFor();
    await own.getByText(/^This page reviews posts from new accounts\./).waitFor();
    assert.equal(await own.getByRole('button', { name: 'Approve' }).count(), 0);
    assert.deepEqual(author.errors, []);
    await author.tab.close();

    const manager = await fixture(context, { shown: page({ can_manage: true, etag: '"page-1"' }),
      posts: [helpPost(postId, { status: 'pending', can_manage: true, etag: '"help-1"', reports: [] })] });
    const card = manager.tab.getByRole('article', { name: 'Need a ride to the clinic' });
    await card.getByRole('button', { name: 'Approve' }).click();
    await card.getByText('Waiting for review', { exact: true }).waitFor({ state: 'detached' });
    const approved = (await manager.calls()).find(call => call.path === `/api/help-posts/${postId}/approve`);
    assert.equal(approved.headers['if-match'], '"help-1"');
    assert.deepEqual(await manager.unexpected(), []);
    assert.deepEqual(manager.errors, []);
  } finally { await context.close(); }
});

test('page managers see held and reported posts across their pages in one list', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  try {
    const { tab, errors, unexpected } = await fixture(context, { queue: true, posts: [
      helpPost('33333333-3333-4333-8333-333333333333', { status: 'pending', can_manage: true, etag: '"help-1"', reports: [] }),
      helpPost('55555555-5555-4555-8555-555555555555', { title: 'Cheap phones for sale', can_manage: true, etag: '"help-2"',
        reports: [{ reason: 'scam', count: 2 }, { reason: 'spam', count: 1 }] }),
    ] });
    await tab.getByRole('heading', { name: 'Needs your review' }).waitFor();
    assert.equal(await tab.getByRole('link', { name: 'Need a ride to the clinic' }).getAttribute('href'), '/pages/street-helpers');
    await tab.getByText('Street Helpers · Waiting for review', { exact: true }).waitFor();
    await tab.getByText('Street Helpers · Reports: 3', { exact: true }).waitFor();
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the section fits 320 px with doubled text in Telugu', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  try {
    const { tab, errors, unexpected } = await fixture(context, { language: 'te', posts: [helpPost('33333333-3333-4333-8333-333333333333', { title: 'ఆసుపత్రికి వెళ్ళడానికి సహాయం కావాలి' })] });
    await tab.getByRole('heading', { name: 'సహాయ అభ్యర్థనలు, సహాయ ఆఫర్‌లు' }).waitFor();
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    await tab.getByRole('heading', { name: 'ఆసుపత్రికి వెళ్ళడానికి సహాయం కావాలి' }).waitFor();
    const overflow = await tab.evaluate(() => [...document.querySelectorAll('article, form, button, input, textarea, p, h2, h3')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
    }).map(element => element.outerHTML.slice(0, 160)));
    assert.deepEqual(overflow, []);
    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await unexpected(), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
