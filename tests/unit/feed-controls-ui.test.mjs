import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
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
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const { messages } = loadMessages();
const text = (language, key) => messages[language][`community.feedControls.${key}`];
const control = (overrides = {}) => ({
  id: '55555555-5555-4555-8555-555555555555', kind: 'mute_page', page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club',
  post_id: null, post_title: null, post_available: null, dimension: null, code: null, created_at: '2026-10-03T10:00:00Z', ...overrides,
});
const allControls = () => [
  control(),
  control({ id: '66666666-6666-4666-8666-666666666666', page_id: null, page_name: null, page_handle: null, created_at: '2026-10-02T10:00:00Z' }),
  control({ id: '77777777-7777-4777-8777-777777777777', kind: 'mute_term', page_id: null, page_name: null, page_handle: null, dimension: 'topic', code: 'hobbies' }),
  control({ id: '88888888-8888-4888-8888-888888888888', kind: 'mute_term', page_id: null, page_name: null, page_handle: null, dimension: 'interest', code: 'gardening' }),
  control({ id: '99999999-9999-4999-8999-999999999999', kind: 'hide_post', post_id: postId, post_title: 'Spring plants', post_available: true }),
  control({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'hide_post', post_id: '22222222-2222-4222-8222-222222222222', post_available: true }),
  control({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', kind: 'hide_post', post_id: null, post_available: false }),
  control({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'hide_suggestion' }),
];
let browser;
let javascript;
let css;

before(async () => {
  mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
  const bundled = await build({
    stdin: { contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Providers } from './src/app/providers';
      import { HomeScreen } from './src/features/community/home-screen';
      import { DiscoverScreen } from './src/features/community/discover-screen';
      import { FeedControlsScreen } from './src/features/community/feed-controls-screen';
      import { InterestsScreen } from './src/features/community/interests-screen';
      import { AccountScreen } from './src/features/identity/account-screen';
      import { PublicPageScreen } from './src/features/community/page-screen';
      import './src/app/globals.css';
      const root = createRoot(document.getElementById('root'));
      window.renderFeedFixture = (mode, language = 'en') => {
        const screens = { home: <HomeScreen />, discover: <DiscoverScreen />, settings: <FeedControlsScreen />, interests: <InterestsScreen />,
          account: <AccountScreen />, page: <PublicPageScreen reference="garden-club" /> };
        root.render(<Providers language={language}>{screens[mode]}</Providers>);
      };`,
      resolveDir: web, sourcefile: 'offline-feed-controls.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-feed-controls.js'), loader: { '.otf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-feed-controls', setup(builder) {
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

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  const calls = [];
  const mode = options.mode ?? 'home';
  const language = options.language ?? 'en';
  const paths = { home: '/app/home', discover: '/app/discover', settings: '/app/settings/feed', interests: '/app/settings/interests', account: '/app/settings/account', page: '/pages/garden-club' };
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest() && new URL(route.request().url()).origin === 'http://127.0.0.1:3000') {
      return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Offline feed controls</title></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(route.request().url()); return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordFeedCall', call => calls.push(call));
  await page.goto(`http://127.0.0.1:3000${paths[mode]}`);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, postId, options, topicNames }) => {
    const created = '2026-10-03T10:00:00Z';
    const term = (dimension, code, name, parent = null) => ({ dimension, code, parent, sensitive: false, status: 'active',
      names: dimension === 'topic' ? topicNames[code] : { en: name, te: '\u0c24\u0c4b\u0c1f\u0c2a\u0c28\u0c3f', hi: '\u092c\u093e\u0917\u0935\u093e\u0928\u0940' } });
    const publicPage = { id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Growing together.', topic: 'hobbies',
      classification: { other_topics: [], interests: ['gardening'], languages: [], places: [], community_types: [], audiences: [], activities: [], content_kinds: [] },
      status: 'active', follower_count: 3, created_at: created, updated_at: created, following: true, blocked: false, can_manage: false, etag: null };
    const post = { id: postId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', title: 'Spring plants', body: 'Seeds are in.',
      topics: ['hobbies'], interests: ['gardening'], status: 'published', like_count: 0, comment_count: 0, created_at: created, published_at: created, edited_at: null,
      liked: false, saved: true, can_manage: options.ownPost ?? false, etag: options.ownPost ? '"post-1"' : null };
    const state = window.feedFixture = {
      calls: [], unexpected: [], sequence: 0, controls: options.controls ?? [], holdRefresh: false, waitingReads: [],
      listFailure: options.listFailure ?? null,
      page: publicPage,
      posts: [post, { ...post, id: '22222222-2222-4222-8222-222222222222', title: 'Seed library', topics: ['education'], interests: [] },
        { ...post, id: '33333333-3333-4333-8333-333333333333', page_id: '44444444-4444-4444-8444-444444444444', page_handle: 'town-news', page_name: 'Town News', title: 'Town news', topics: [], interests: [] }],
      terms: [term('topic', 'hobbies', 'Hobbies'), term('topic', 'education', 'Education'), term('interest', 'gardening', 'Gardening', 'hobbies')],
    };
    const reply = (data, extra = {}, status = 200) => new Response(JSON.stringify({ data, request_id: 'offline-feed-controls', ...extra }), { status });
    const failed = (status, code) => new Response(JSON.stringify({ error: { code, message: 'Synthetic refusal.', details: {} } }), { status });
    const visible = post => !state.controls.some(control => (control.kind === 'mute_page' && control.page_id === post.page_id)
      || (control.kind === 'hide_post' && control.post_id === post.id)
      || (control.kind === 'mute_term' && (control.dimension === 'topic' ? post.topics : post.interests).includes(control.code)));
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), location.origin);
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      if (url.pathname === '/api/live') return new Response(new ReadableStream({ start(controller) {
        config.signal?.addEventListener('abort', () => controller.close(), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      state.calls.push({ route: url.pathname, query: url.search, method, body, headers });
      await window.recordFeedCall({ route: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === '/api/me') return options.signedOut ? failed(401, 'AUTHENTICATION_REQUIRED') : reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/notifications') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/taxonomy') return reply(state.terms);
      if (url.pathname === '/api/timezones') return reply(['UTC']);
      if (url.pathname === '/api/me/sessions' || url.pathname === '/api/me/security-events') return reply([]);
      if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply([]);
      if (url.pathname === '/api/pages/garden-club') return reply(state.page);
      if (url.pathname === `/api/pages/${pageId}/posts`) return reply(state.posts.filter(post => post.page_id === pageId), { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `/api/pages/${pageId}/pinned-posts`) return reply([]);
      // Page events and help posts have nothing to show here.
      if (url.pathname === `/api/pages/${pageId}/events` || url.pathname === '/api/discover/events') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/help-posts`) return reply([], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/discover/pages') return reply([state.page], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/me/interests') return reply({ topics: ['hobbies'], interests: ['gardening'], languages: [], places: [], etag: '"interests-1"' });
      if (url.pathname === '/api/me/interest-posts') return reply(state.posts.slice(0, 1).filter(visible).map(post => ({ post,
        reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'interest', code: 'gardening' }],
      })), { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/me/suggested-pages') return reply({ ranking: 'interests-1',
        items: state.controls.some(control => ['mute_page', 'hide_suggestion'].includes(control.kind) && control.page_id === pageId) ? []
          : [{ page: { ...state.page, following: false }, reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'interest', code: 'gardening' }] }],
      });
      if (url.pathname === '/api/feed' || url.pathname === '/api/discover/posts' || url.pathname === '/api/me/saved-posts') {
        if (state.holdRefresh) await new Promise(resolve => state.waitingReads.push(resolve));
        const items = url.searchParams.has('q') || url.pathname === '/api/me/saved-posts' ? state.posts : state.posts.filter(visible);
        return reply(items, { pagination: { next_cursor: null, has_more: false } });
      }
      if (url.pathname === '/api/me/feed-controls' && method === 'GET') return state.listFailure ? failed(state.listFailure.status, state.listFailure.code) : reply(state.controls);
      if (url.pathname === '/api/me/feed-controls' && method === 'POST') {
        if (state.failNext) { const failure = state.failNext; state.failNext = null; return failed(failure.status, failure.code); }
        const previous = state.controls.find(control => control.kind === body.kind && (body.page_id ? control.page_id === body.page_id
          : body.post_id ? control.post_id === body.post_id : control.dimension === body.dimension && control.code === body.code));
        if (previous) return reply(previous, {}, 201);
        const target = body.post_id ? state.posts.find(post => post.id === body.post_id) : null;
        const isPage = body.kind === 'mute_page' || body.kind === 'hide_suggestion';
        const control = { id: `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}`, ...body,
          page_id: isPage ? body.page_id : target?.page_id ?? null, page_handle: isPage ? state.page.handle : target?.page_handle ?? null,
          page_name: isPage ? state.page.name : target?.page_name ?? null, post_id: body.post_id ?? null, post_title: target?.title ?? null,
          post_available: target ? true : null, dimension: body.dimension ?? null, code: body.code ?? null, created_at: created };
        state.controls.unshift(control);
        if (state.loseAnswer) { state.loseAnswer = false; throw new TypeError('Synthetic lost answer'); }
        return reply(control, {}, 201);
      }
      const remove = url.pathname.match(/^\/api\/me\/feed-controls\/([^/]+)\/remove$/);
      if (remove && method === 'POST') {
        if (state.failUndo) return failed(503, 'SERVICE_UNAVAILABLE');
        const before = state.controls.length;
        state.controls = state.controls.filter(control => control.id !== remove[1]);
        return before === state.controls.length ? failed(404, 'NOT_FOUND') : reply({ id: remove[1], status: 'removed' });
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, pageId, postId, options, topicNames: Object.fromEntries(['hobbies', 'education'].map(code => [code,
    Object.fromEntries(['en', 'te', 'hi'].map(language => [language, messages[language][`community.topic.${code}`]])),
  ])) });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(({ mode, language }) => window.renderFeedFixture(mode, language), { mode, language });
  if (options.signedOut && mode === 'settings') await page.waitForURL('**/login');
  else {
    const heading = mode === 'page' ? 'Garden Club' : messages[language][{
      home: 'community.feed', discover: 'community.discover', settings: 'community.feedControls.title', interests: 'community.interests.title', account: 'account.heading',
    }[mode]];
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  return { page, outbound, errors, calls };
}

async function assertOffline(result) {
  assert.deepEqual(result.outbound, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(await result.page.evaluate(() => window.feedFixture.unexpected), []);
}

async function doubleText(page) {
  await page.evaluate(() => document.fonts.ready);
  const before = await page.locator('body').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
  assert.equal(await page.locator('body').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), before * 2);
}

async function assertFits(page) {
  const bounds = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('main article, main button, main select, main section, main nav, main li, [role="menu"], dialog[open], dialog[open] button')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1));
    }).map(element => element.outerHTML.slice(0, 220)),
  }));
  assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds));
  assert.deepEqual(bounds.outside, [], JSON.stringify(bounds));
}

test('feed controls: Not interested removes a post in place before refresh and Undo restores it', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await page.evaluate(() => { window.feedFixture.holdRefresh = true; });
    await post.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    const notice = page.getByRole('status').filter({ hasText: 'Post marked Not interested.' });
    await notice.waitFor();
    assert.equal(await page.evaluate(() => window.feedFixture.waitingReads.length), 1);
    await page.evaluate(() => { window.feedFixture.holdRefresh = false; window.feedFixture.waitingReads.splice(0).forEach(resolve => resolve()); });
    await notice.getByRole('button', { name: 'Undo', exact: true }).click();
    await post.waitFor();
    const writes = await page.evaluate(() => window.feedFixture.calls.filter(call => call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].body, { kind: 'hide_post', post_id: postId });
    assert.equal(writes[0].headers['x-account-id'], accountId);
    assert.deepEqual(writes[1].body, {});
    assert.match(writes[1].route, /\/feed-controls\/[a-f0-9-]{36}\/remove$/);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: Mute page removes its posts but Saved has no menu and retains them', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Mute Garden Club', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('article', { name: 'Seed library', exact: true }).count(), 0);
    await page.getByRole('article', { name: 'Town news', exact: true }).waitFor();
    await page.getByRole('group', { name: 'Feed', exact: true }).getByRole('button', { name: 'Saved', exact: true }).click();
    await post.waitFor();
    assert.equal(await page.getByRole('article').getByRole('button', { name: 'More', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Following', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    await page.getByRole('status').filter({ hasText: 'Garden Club muted.' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await post.waitFor();
    await page.getByRole('article', { name: 'Seed library', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.feedFixture.calls.find(call => call.method === 'POST').body), { kind: 'mute_page', page_id: pageId });
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: More is keyboard usable and Why explains Following and Latest', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    const more = post.getByRole('button', { name: 'More', exact: true });
    await more.focus(); await more.press('ArrowDown');
    assert.equal(await post.getByRole('menuitem', { name: 'Not interested', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await post.getByRole('menuitem', { name: 'Mute Garden Club', exact: true }).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Why am I seeing this?', exact: true });
    await dialog.getByText('You follow Garden Club.', { exact: true }).waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    assert.equal(await more.evaluate(element => element === document.activeElement), true);
    await more.press('ArrowUp'); await page.keyboard.press('Home'); await page.keyboard.press('Escape');
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    await page.getByRole('button', { name: 'Latest', exact: true }).click();
    await more.click();
    await post.getByRole('menuitem', { name: 'Why am I seeing this?', exact: true }).click();
    await dialog.getByText('Latest shows every public post, newest first.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.evaluate(() => window.feedFixture.calls.filter(call => call.method === 'POST').length), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: post-owned chips supply mute choices and an unclassified post supplies none', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    assert.deepEqual(await post.getByRole('menuitem').allTextContents(), ['Not interested', 'Mute Garden Club', 'Mute Hobbies', 'Mute Gardening', 'Why am I seeing this?']);
    await post.getByRole('menuitem', { name: 'Mute Gardening', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => window.feedFixture.calls.find(call => call.method === 'POST').body), { kind: 'mute_term', dimension: 'interest', code: 'gardening' });
    await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
    await post.waitFor();
    const noTerms = page.getByRole('article', { name: 'Town news', exact: true });
    await noTerms.getByRole('button', { name: 'More', exact: true }).click();
    assert.deepEqual(await noTerms.getByRole('menuitem').allTextContents(), ['Not interested', 'Mute Town News', 'Why am I seeing this?']);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: interest posts explain their matched choices, hide, undo and mute their own topic', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'discover' });
    const { page } = result;
    const section = page.getByRole('region', { name: 'From your interests', exact: true });
    const post = section.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Why am I seeing this?', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Why am I seeing this?', exact: true });
    await dialog.getByText('Because you chose: Hobbies, Gardening', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    await section.getByText('No matching posts yet.', { exact: true }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Post marked Not interested.' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await post.waitFor();
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Mute Hobbies', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    const writes = await page.evaluate(() => window.feedFixture.calls.filter(call => call.method === 'POST'));
    assert.deepEqual(writes[0].body, { kind: 'hide_post', post_id: postId });
    assert.deepEqual(writes.at(-1).body, { kind: 'mute_term', dimension: 'topic', code: 'hobbies' });
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: suggestion Why uses its reasons, Not interested affects suggestions only, and Mute affects posts too', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'discover' });
    const { page } = result;
    const suggestions = page.getByRole('list', { name: 'Suggested for you', exact: true });
    const suggestion = suggestions.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Garden Club', exact: true }) });
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await suggestion.getByRole('button', { name: 'More', exact: true }).click();
    assert.deepEqual(await suggestion.getByRole('menuitem').allTextContents(), ['Not interested', 'Mute', 'Why am I seeing this?']);
    await suggestion.getByRole('menuitem', { name: 'Why am I seeing this?', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Why am I seeing this?', exact: true });
    await dialog.getByText('Matched Topic: Hobbies', { exact: true }).waitFor();
    await dialog.getByText('Matched Interest: Gardening', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await suggestion.getByRole('button', { name: 'More', exact: true }).click();
    await suggestion.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
    await suggestion.waitFor({ state: 'detached' });
    await post.waitFor();
    const searchResults = page.getByRole('list', { name: 'Pages', exact: true });
    await searchResults.getByRole('link', { name: 'Garden Club', exact: true }).waitFor();
    assert.equal(await searchResults.getByRole('button', { name: 'More', exact: true }).count(), 0);
    await page.getByRole('status').filter({ hasText: 'Suggestion marked Not interested.' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await suggestion.waitFor();
    await suggestion.getByRole('button', { name: 'More', exact: true }).click();
    await suggestion.getByRole('menuitem', { name: 'Mute', exact: true }).click();
    await suggestion.waitFor({ state: 'detached' });
    await post.waitFor({ state: 'detached' });
    await page.getByRole('status').filter({ hasText: 'Garden Club muted.' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await suggestion.waitFor(); await post.waitFor();
    const writes = await page.evaluate(() => window.feedFixture.calls.filter(call => call.method === 'POST' && call.route === '/api/me/feed-controls'));
    assert.deepEqual(writes.map(call => call.body), [{ kind: 'hide_suggestion', page_id: pageId }, { kind: 'mute_page', page_id: pageId }]);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: Discover unfiltered posts offer controls but search results do not', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'discover' });
    const { page } = result;
    await page.getByRole('button', { name: 'Posts', exact: true }).click();
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Why am I seeing this?', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Why am I seeing this?', exact: true });
    await dialog.getByText('Latest shows every public post, newest first.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    await page.getByRole('searchbox', { name: 'Search posts', exact: true }).fill('Seeds');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await post.waitFor();
    assert.equal(await post.getByRole('button', { name: 'More', exact: true }).count(), 0);
    await page.getByRole('status').filter({ hasText: 'Post marked Not interested.' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await post.waitFor();
    assert.equal(await post.getByRole('button', { name: 'More', exact: true }).count(), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: Muted and hidden groups all controls with vocabulary names and unavailable labels', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'settings', controls: allControls() });
    const { page } = result;
    const pages = page.getByRole('list', { name: 'Muted pages', exact: true });
    await pages.getByRole('link', { name: 'Garden Club', exact: true }).waitFor();
    assert.match((await pages.getByRole('listitem').allTextContents())[0], /^Garden Club/);
    await pages.getByText('No longer available', { exact: true }).waitFor();
    const terms = page.getByRole('list', { name: 'Muted topics and interests', exact: true });
    await terms.getByText('Hobbies', { exact: true }).waitFor();
    await terms.getByText('Gardening', { exact: true }).waitFor();
    const posts = page.getByRole('list', { name: 'Posts marked Not interested', exact: true });
    await posts.getByRole('link', { name: 'Spring plants', exact: true }).waitFor();
    await posts.getByRole('link', { name: 'Untitled post', exact: true }).waitFor();
    const missing = posts.getByRole('listitem').filter({ has: page.getByText('No longer available', { exact: true }) });
    assert.equal(await missing.getByRole('link').count(), 0);
    await missing.getByText('Garden Club', { exact: true }).waitFor();
    await page.getByRole('list', { name: 'Suggestions marked Not interested', exact: true }).getByRole('link', { name: 'Garden Club', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Undo / }).count(), 8);
    await terms.getByRole('button', { name: 'Undo Gardening', exact: true }).click();
    await terms.getByText('Gardening', { exact: true }).waitFor({ state: 'detached' });
    const removal = result.calls.find(call => call.method === 'POST');
    assert.equal(removal.route, '/api/me/feed-controls/88888888-8888-4888-8888-888888888888/remove');
    assert.deepEqual(removal.body, {});
    assert.equal(removal.headers['x-account-id'], accountId);
    assert.equal(await page.getByRole('link', { name: 'Your interests', exact: true }).getAttribute('href'), '/app/settings/interests');
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: settings Undo handles already-removed controls and shows section empty states', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'settings', controls: [control()] });
    const { page } = result;
    await page.getByRole('button', { name: 'Undo Garden Club', exact: true }).waitFor();
    await page.evaluate(() => { window.feedFixture.controls = []; });
    await page.getByRole('button', { name: 'Undo Garden Club', exact: true }).click();
    for (const label of ['No muted pages.', 'No muted topics or interests.', 'No posts marked Not interested.', 'No suggestions marked Not interested.']) {
      await page.getByText(label, { exact: true }).waitFor();
    }
    await page.getByRole('status').filter({ hasText: 'Feed control removed.' }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: Profile and Your interests link to settings, and page-owned lists never offer the menu', async () => {
  for (const mode of ['account', 'interests', 'page']) {
    const context = await browser.newContext();
    try {
      const result = await fixture(context, { mode });
      const { page } = result;
      if (mode === 'page') {
        await page.getByRole('article', { name: 'Spring plants', exact: true }).waitFor();
        assert.equal(await page.getByRole('article').getByRole('button', { name: 'More', exact: true }).count(), 0);
      } else assert.equal(await page.getByRole('link', { name: 'Muted and hidden', exact: true }).getAttribute('href'), '/app/settings/feed');
      await assertOffline(result);
    } finally { await context.close(); }
  }
});

test('feed controls: settings requires sign-in and never reads controls for a signed-out visitor', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'settings', signedOut: true });
    assert.equal(new URL(result.page.url()).pathname, '/login');
    assert.equal(result.calls.some(call => call.route === '/api/me/feed-controls'), false);
    assert.equal(await result.page.getByRole('heading', { name: 'Muted and hidden', exact: true }).count(), 0);
    assert.deepEqual(result.outbound, []); assert.deepEqual(result.errors, []);
  } finally { await context.close(); }
});

test('feed controls: rejected changes retain the post and show specific errors without automatic retries', async () => {
  for (const [status, code, key] of [[409, 'OWN_CONTENT', 'ownContent'], [409, 'FEED_CONTROL_LIMIT_REACHED', 'limitReached'], [422, 'TERM_UNAVAILABLE', 'termUnavailable']]) {
    const context = await browser.newContext();
    try {
      const result = await fixture(context);
      const { page } = result;
      const post = page.getByRole('article', { name: 'Spring plants', exact: true });
      await page.evaluate(failure => { window.feedFixture.failNext = failure; }, { status, code });
      await post.getByRole('button', { name: 'More', exact: true }).click();
      await post.getByRole('menuitem', { name: code === 'TERM_UNAVAILABLE' ? 'Mute Hobbies' : 'Not interested', exact: true }).click();
      const alert = page.getByRole('alert');
      await alert.waitFor();
      assert.equal(await alert.textContent(), `${text('en', key)}Retry`);
      await post.waitFor();
      assert.equal(await page.getByRole('status').filter({ hasText: 'Post marked Not interested.' }).count(), 0);
      assert.equal(result.calls.filter(call => call.method === 'POST').length, 1);
      assert.equal(await page.evaluate(() => window.feedFixture.controls.length), 0);
      await assertOffline(result);
    } finally { await context.close(); }
  }
});

test('feed controls: an unknown add retries the same target and a failed Undo stays retryable', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await page.evaluate(() => { window.feedFixture.loseAnswer = true; });
    await post.getByRole('button', { name: 'More', exact: true }).click();
    await post.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
    await page.getByRole('alert').waitFor(); await post.waitFor();
    assert.equal(await page.evaluate(() => window.feedFixture.controls.length), 1);
    assert.equal(result.calls.filter(call => call.method === 'POST').length, 1);
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await post.waitFor({ state: 'detached' });
    const adds = result.calls.filter(call => call.method === 'POST' && call.route === '/api/me/feed-controls');
    assert.equal(adds.length, 2);
    assert.deepEqual(adds[1], adds[0]);
    assert.equal(await page.evaluate(() => window.feedFixture.controls.length), 1);
    await page.evaluate(() => { window.feedFixture.failUndo = true; });
    const notice = page.getByRole('status').filter({ hasText: 'Post marked Not interested.' });
    await notice.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('alert').waitFor(); await notice.waitFor();
    assert.equal(await post.count(), 0);
    await page.evaluate(() => { window.feedFixture.failUndo = false; });
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await post.waitFor();
    const undos = result.calls.filter(call => call.route.endsWith('/remove'));
    assert.equal(undos.length, 2); assert.deepEqual(undos[1], undos[0]);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('feed controls: settings retries a failed read and clears private rows after an account mismatch', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'settings', controls: [control()], listFailure: { status: 503, code: 'SERVICE_UNAVAILABLE' } });
    const { page } = result;
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Undo Garden Club', exact: true }).count(), 0);
    await page.evaluate(() => { window.feedFixture.listFailure = null; });
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Undo Garden Club', exact: true }).waitFor();
    await page.evaluate(() => { window.feedFixture.listFailure = { status: 409, code: 'ACCOUNT_CHANGED' }; });
    await page.getByRole('button', { name: text('en', 'refresh'), exact: true }).click();
    await page.waitForURL('**/login');
    assert.equal(await page.getByText('Garden Club', { exact: true }).count(), 0);
    assert.deepEqual(result.outbound, []); assert.deepEqual(result.errors, []);
  } finally { await context.close(); }
});

test('feed controls: own posts and signed-out visitors get explanations but no mutating actions', async () => {
  for (const options of [{ ownPost: true }, { signedOut: true }]) {
    const context = await browser.newContext();
    try {
      const result = await fixture(context, options);
      const post = result.page.getByRole('article', { name: 'Spring plants', exact: true });
      await post.getByRole('button', { name: 'More', exact: true }).click();
      assert.deepEqual(await post.getByRole('menuitem').allTextContents(), ['Why am I seeing this?']);
      assert.equal(result.calls.some(call => call.method === 'POST'), false);
      await assertOffline(result);
    } finally { await context.close(); }
  }
});

for (const surface of ['following', 'latest', 'interest-posts', 'suggestions', 'discover-latest', 'why', 'settings', 'account', 'interests']) {
  test(`feed controls: ${surface} fits at 320 px and 200% actual text`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
    try {
      const mode = ['interest-posts', 'suggestions', 'discover-latest'].includes(surface) ? 'discover'
        : ['settings', 'account', 'interests'].includes(surface) ? surface : 'home';
      const result = await fixture(context, { mode, controls: mode === 'settings' ? allControls() : [] });
      const { page } = result;
      if (surface === 'latest') await page.getByRole('button', { name: 'Latest', exact: true }).click();
      if (surface === 'discover-latest') await page.getByRole('button', { name: 'Posts', exact: true }).click();
      if (!['settings', 'account', 'interests'].includes(surface)) {
        const item = surface === 'suggestions' ? page.getByRole('list', { name: 'Suggested for you', exact: true })
          : page.getByRole('article', { name: 'Spring plants', exact: true });
        await item.getByRole('button', { name: 'More', exact: true }).click();
        if (surface === 'why') {
          await item.getByRole('menuitem', { name: 'Why am I seeing this?', exact: true }).click();
          await page.getByRole('dialog').getByText('You follow Garden Club.', { exact: true }).waitFor();
        }
      } else if (surface === 'settings') await page.getByRole('button', { name: 'Undo Gardening', exact: true }).waitFor();
      else if (surface === 'interests') await page.getByRole('button', { name: 'Save interests', exact: true }).waitFor();
      await assertFits(page);
      await doubleText(page);
      await assertFits(page);
      if (surface === 'settings') {
        const stacked = await page.getByRole('list', { name: 'Muted topics and interests', exact: true }).getByRole('listitem').first().evaluate(row => {
          const label = row.firstElementChild.getBoundingClientRect();
          const button = row.querySelector('button').getBoundingClientRect();
          return button.top >= label.bottom;
        });
        assert.equal(stacked, true, 'Undo wraps below the label instead of squeezing vocabulary names into a narrow column.');
      }
      await page.screenshot({ path: path.join(root, `.local/screenshots/t136-${surface}-320-200.png`), fullPage: true });
      if (surface === 'following') {
        await page.getByRole('menuitem', { name: 'Not interested', exact: true }).click();
        await page.getByRole('article', { name: 'Spring plants', exact: true }).waitFor({ state: 'detached' });
        await assertFits(page);
        await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
        await page.getByRole('article', { name: 'Spring plants', exact: true }).waitFor();
      }
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const language of ['te', 'hi']) {
  for (const mode of ['home', 'settings']) {
    test(`feed controls: ${language} ${mode} uses translated controls and fits at 320 px / 200% text`, async () => {
      const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
      try {
        const result = await fixture(context, { mode, language, controls: mode === 'settings' ? allControls() : [] });
        const { page } = result;
        if (mode === 'home') {
          const post = page.getByRole('article', { name: 'Spring plants', exact: true });
          await post.getByRole('button', { name: text(language, 'more'), exact: true }).click();
          await post.getByRole('menuitem', { name: text(language, 'notInterested'), exact: true }).waitFor();
          await post.getByRole('menuitem', { name: text(language, 'muteName').replace('{name}', messages[language]['community.topic.hobbies']), exact: true }).waitFor();
        } else {
          const terms = page.getByRole('list', { name: text(language, 'mutedTerms'), exact: true });
          await terms.getByText(messages[language]['community.topic.hobbies'], { exact: true }).waitFor();
          await page.getByRole('list', { name: text(language, 'hiddenPosts'), exact: true }).getByRole('link', { name: text(language, 'untitled'), exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: new RegExp(text(language, 'undo')) }).count(), 8);
        }
        await assertFits(page); await doubleText(page); await assertFits(page);
        await page.screenshot({ path: path.join(root, `.local/screenshots/t136-${language}-${mode}-320-200.png`), fullPage: true });
        if (mode === 'home') {
          await page.getByRole('menuitem', { name: text(language, 'notInterested'), exact: true }).click();
          const notice = page.getByRole('status').filter({ hasText: text(language, 'postHidden') });
          await notice.getByRole('button', { name: text(language, 'undo'), exact: true }).click();
          await page.getByRole('article', { name: 'Spring plants', exact: true }).waitFor();
        }
        await assertOffline(result);
      } finally { await context.close(); }
    });
  }
}

test('feed controls: desktop menu and settings remain usable', async () => {
  for (const mode of ['home', 'settings']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const result = await fixture(context, { mode, controls: mode === 'settings' ? allControls() : [] });
      const { page } = result;
      if (mode === 'home') await page.getByRole('article', { name: 'Spring plants', exact: true }).getByRole('button', { name: 'More', exact: true }).click();
      else await page.getByRole('button', { name: 'Undo Gardening', exact: true }).waitFor();
      await assertFits(page);
      await page.screenshot({ path: path.join(root, `.local/screenshots/t136-${mode}-desktop.png`), fullPage: true });
      await assertOffline(result);
    } finally { await context.close(); }
  }
});