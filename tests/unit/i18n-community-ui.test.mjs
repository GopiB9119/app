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
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const commentId = '11111111-1111-4111-8111-111111111111';
const decisionId = '0b6c1f9e-3f53-4c1a-9a43-000000000001';
const appealId = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const blockId = '0b6c1f9e-3f53-4c1a-9a43-000000000020';
const created = '2026-10-02T02:30:00Z';
const pageName = 'Garden మాధవి हिन्दी';
const personName = 'Alex మాధవి हिन्दी';
const postTitle = 'Seeds విత్తనాలు बीज';
const postBody = 'Seeds are in. విత్తనాలు तैयार हैं. <b>literal</b> {name} @friend';
const commentBody = 'My comment తెలుగు हिन्दी <b>literal</b>.';
const rules = 'Be kind. మర్యాదగా रहें.';
const serverMessage = 'Synthetic refusal. తెలుగు हिन्दी stays unchanged.';
const { en, te, hi } = loadMessages().messages;
const texts = { en, te, hi };
const modes = ['feed', 'discover', 'page', 'post', 'pages', 'safety', 'moderation', 'interests'];
const paths = { feed: '/app/home', discover: '/app/discover', page: '/pages/garden-club', post: `/posts/${postId}`, pages: '/app/pages', safety: '/app/safety', moderation: '/app/moderation', interests: '/app/settings/interests' };
const androidTelugu = readFileSync(path.join(root, 'android/app/src/main/res/values-te/strings.xml'), 'utf8');
const message = (language, id, values = {}) => texts[language][`community.${id}`].replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
let browser;
let javascript;
let css;

before(async () => {
  mkdirSync(evidence, { recursive: true });
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { HomeScreen } from './src/features/community/home-screen';
        import { DiscoverScreen } from './src/features/community/discover-screen';
        import { PublicPageScreen } from './src/features/community/page-screen';
        import { PostScreen } from './src/features/community/post-screen';
        import { MyPagesScreen } from './src/features/community/pages-screen';
        import { SafetyScreen } from './src/features/community/safety-screen';
        import { ModerationScreen } from './src/features/community/moderation-screen';
        import { InterestsScreen } from './src/features/community/interests-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderCommunityI18nFixture = () => {
          const { mode, language } = window.communityI18nFixture;
          const screens = { feed: <HomeScreen />, discover: <DiscoverScreen />, page: <PublicPageScreen reference="garden-club" />,
            post: <PostScreen postId="${postId}" />, pages: <MyPagesScreen />, safety: <SafetyScreen />, moderation: <ModerationScreen />, interests: <InterestsScreen /> };
          root.render(<Providers language={language}>{screens[mode]}</Providers>);
        };
        window.unmountCommunityI18nFixture = () => root.unmount();`,
      resolveDir: web, sourcefile: 'offline-i18n-community.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(evidence, 'offline-i18n-community.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-i18n-community', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.communityI18nFixture.path;', loader: 'js',
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
  const mode = options.mode ?? 'feed';
  const language = options.language ?? 'te';
  const outbound = [];
  const errors = [];
  const calls = [];
  const unexpected = [];
  await context.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'document' && request.method() === 'GET' && request.url() === origin + paths[mode]) {
      return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Offline community languages</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(request.url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordCommunityI18nCall', call => { calls.push(call); });
  await page.exposeFunction('recordCommunityI18nUnexpected', call => { unexpected.push(call); });
  await page.goto(origin + paths[mode]);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ mode, language, routePath, accountId, pageId, postId, commentId, decisionId, appealId, blockId, created, pageName, personName, postTitle, postBody, commentBody, rules, serverMessage, options, topicNames }) => {
    const owner = options.owner ?? (mode === 'page' || mode === 'pages');
    const publicPage = {
      id: pageId, handle: 'garden-club', name: pageName, description: postBody, rules, topic: 'hobbies', status: 'active',
      follower_count: 1, created_at: created, updated_at: created, following: false, blocked: false, can_manage: owner,
      etag: owner ? '"page-1"' : null, purge_after: null,
    };
    const post = {
      id: postId, page_id: pageId, page_handle: 'garden-club', page_name: pageName, title: postTitle, body: postBody,
      status: 'published', like_count: 1, comment_count: 1, created_at: created, published_at: created, edited_at: created,
      liked: false, saved: false, pinned: false, can_manage: owner, etag: owner ? '"post-1"' : null,
    };
    const comment = { id: commentId, post_id: postId, parent_id: null, author_name: personName, body: commentBody,
      status: 'visible', created_at: created, mine: false, can_remove: owner };
    const state = window.communityI18nFixture = {
      mode, language, path: routePath, calls: [], sequence: 0, liveOpened: 0, liveAborted: 0,
      publicPage, post, comments: options.emptyComments ? [] : [comment],
      blocks: [{ id: blockId, target_type: 'page', page_id: pageId, label: pageName, created_at: created }],
      notices: [{ id: decisionId, target_type: 'post', target_id: postId, action: 'hide', reason: 'privacy', decided_at: created, appeal_status: null, appeal_of: null }],
      queue: [{ target_type: 'post', target_id: postId, preview: { title: postTitle, body: postBody, status: 'published' }, page_name: pageName,
        report_count: 2, reasons: [{ reason: 'privacy', count: 2 }], first_reported_at: created }],
      appeals: options.appealReview ? [{
        appeal: { id: appealId, decision_id: decisionId, note: commentBody, status: 'open', created_at: created, resolved_at: null },
        decision: { id: decisionId, target_type: 'post', target_id: postId, action: 'hide', reason: 'privacy', note: '',
          decided_by: '22222222-2222-4222-8222-222222222222', decided_at: created, appeal_of: null },
        preview: { title: postTitle, body: postBody, status: 'published' }, page_name: pageName, resolution_note: null,
      }] : [],
      failReport: options.failReport ?? false, offlineReport: options.offlineReport ?? false,
      offlineFeed: options.offlineFeed ?? false, releaseFeed: null,
      interests: { topics: ['hobbies'], interests: [], languages: [], places: [], etag: '"interests-1"' },
    };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-community-i18n', ...extra }));
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failure = () => new Response(JSON.stringify({ error: { code: 'SYNTHETIC_REFUSAL', message: serverMessage, details: {} }, request_id: 'offline-community-i18n' }), { status: 409 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') {
        state.liveOpened++;
        return new Response(new ReadableStream({ start(controller) {
          const abort = () => { state.liveAborted++; try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} };
          if (config.signal?.aborted) abort();
          else config.signal?.addEventListener('abort', abort, { once: true });
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      const body = config.body ? JSON.parse(config.body) : null;
      const call = { path: url.pathname, query: url.search, method, body, headers: Object.fromEntries(new Headers(config.headers)) };
      state.calls.push(call);
      await window.recordCommunityI18nCall(call);
      if (url.pathname === '/api/me' && method === 'GET') return reply({ id: accountId, display_name: personName, email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/taxonomy' && method === 'GET') return reply(Object.entries(topicNames).map(([code, names]) => ({ dimension: 'topic', code, names, parent: null, sensitive: false, status: 'active' })));
      if (url.pathname === '/api/me/interests' && method === 'GET') return reply(state.interests);
      if (url.pathname === '/api/me/interests' && method === 'PUT') { state.interests = { ...body, etag: '"interests-2"' }; return reply(state.interests); }
      if (url.pathname === '/api/me/suggested-pages' && method === 'GET') return reply({ ranking: 'interests-1', items: [] });
      if (url.pathname === '/api/me/interest-posts' && method === 'GET') return paged(options.interestPosts ? [{
        post: { ...state.post, topics: ['hobbies'], interests: [] }, reasons: [{ dimension: 'topic', code: 'hobbies' }],
      }] : []);
      if (url.pathname === '/api/feed' && method === 'GET') {
        if (state.offlineFeed) throw new TypeError('Synthetic offline feed.');
        if (options.holdFeed) await new Promise(resolve => { state.releaseFeed = resolve; });
        return paged([state.post]);
      }
      if (url.pathname === '/api/discover/posts' && method === 'GET') return paged(url.searchParams.has('q') ? [] : [state.post]);
      if (url.pathname === '/api/me/saved-posts' && method === 'GET') return paged([]);
      if (url.pathname === '/api/discover/pages' && method === 'GET') return paged(url.searchParams.has('q') ? [] : [{ ...state.publicPage, can_manage: false, etag: null }]);
      if (url.pathname === '/api/pages/garden-club' && method === 'GET') return reply(state.publicPage);
      if (url.pathname === `/api/pages/${pageId}/posts` && method === 'GET') return paged([state.post]);
      if (url.pathname === `/api/pages/${pageId}/pinned-posts` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/help-posts` && method === 'GET') return paged([]);
      if (url.pathname === '/api/me/help-posts' && method === 'GET') return paged([]);
      if (url.pathname === `/api/pages/${pageId}/events` && method === 'GET') return reply([]);
      if (url.pathname === '/api/me/page-events' && method === 'GET') return reply([]);
      if (url.pathname === '/api/discover/events' && method === 'GET') return reply([]);
      if (url.pathname === '/api/me/help-review' && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/drafts` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}` && method === 'PATCH') { Object.assign(state.publicPage, body); return reply(state.publicPage); }
      if (url.pathname === '/api/me/pages' && method === 'GET') return reply([{ ...state.publicPage, can_manage: true, etag: '"page-1"' }]);
      if (url.pathname === '/api/me/following' && method === 'GET') return paged([]);
      // Page roles and handover (T84) have nothing to show here: no moderators, roles or offers.
      if (url.pathname === `/api/pages/${pageId}/moderators` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/handover` && method === 'GET') {
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No handover offer.', details: {} }, request_id: 'offline-community-i18n' }), { status: 404 });
      }
      if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply([]);
      if (url.pathname === '/api/me/handover-offers' && method === 'GET') return reply([]);
      if (url.pathname === `/api/posts/${postId}` && method === 'GET') return reply(state.post);
      if (url.pathname === `/api/posts/${postId}/comments` && method === 'GET') return paged(state.comments);
      if (url.pathname === `/api/posts/${postId}/comments` && method === 'POST') {
        const saved = { ...comment, id: crypto.randomUUID(), body: body.body, parent_id: body.parent_id ?? null, mine: true, can_remove: true };
        state.comments.push(saved);
        return reply(saved);
      }
      if (url.pathname === '/api/me/blocks' && method === 'GET') return reply(state.blocks);
      if (url.pathname === `/api/blocks/${blockId}/remove` && method === 'POST') { state.blocks = []; return reply({ id: blockId, status: 'removed' }); }
      if (url.pathname === '/api/me/moderator' && method === 'GET') return reply({ moderator: options.moderator ?? true });
      if (url.pathname === '/api/me/moderation-notices' && method === 'GET') return reply(state.notices);
      if (url.pathname === '/api/me/reports' && method === 'GET') return reply([]);
      if (url.pathname === '/api/moderation/queue' && method === 'GET') return paged(state.queue);
      if (url.pathname === '/api/moderation/appeals' && method === 'GET') return reply(state.appeals);
      if (url.pathname === '/api/moderation/decisions' && method === 'POST') {
        state.queue = [];
        return reply({ id: decisionId, ...body, decided_by: accountId, decided_at: created, appeal_of: null });
      }
      if (url.pathname === `/api/moderation/decisions/${decisionId}/appeal` && method === 'POST') {
        state.notices[0].appeal_status = 'open';
        return reply({ id: appealId, decision_id: decisionId, note: body.note, status: 'open', created_at: created, resolved_at: null });
      }
      if (url.pathname === `/api/moderation/appeals/${appealId}/resolve` && method === 'POST') {
        const saved = { ...state.appeals[0].appeal, status: body.outcome, resolved_at: created };
        state.appeals = [];
        return reply(saved);
      }
      if (url.pathname === '/api/reports' && method === 'POST') {
        if (state.offlineReport) throw new TypeError('Synthetic offline report.');
        if (state.failReport) return failure();
        return reply({ id: crypto.randomUUID(), target_type: body.target_type, target_id: body.target_id, reason: body.reason, status: 'received', created_at: created });
      }
      await window.recordCommunityI18nUnexpected(call);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}${url.search}`);
    };
  }, { mode, language, routePath: paths[mode], accountId, pageId, postId, commentId, decisionId, appealId, blockId, created, pageName, personName, postTitle, postBody, commentBody, rules, serverMessage, options,
    topicNames: Object.fromEntries(['community', 'hobbies', 'education'].map(code => [code, Object.fromEntries(['en', 'te', 'hi'].map(language => [language, texts[language][`community.topic.${code}`]]))])),
  });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderCommunityI18nFixture());
  await page.locator('main h1').waitFor();
  await page.waitForFunction(expected => document.documentElement.lang === expected, language);
  return { page, outbound, errors, calls, unexpected };
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'Every real network request must stay blocked.');
  assert.deepEqual(result.errors, [], 'The actual screens must not raise page errors.');
  assert.deepEqual(result.unexpected, [], 'Every API call must have an explicit fixture.');
  assert.equal(result.calls.some(call => call.path === '/api/live'), false, 'The open stream is not an API call in this fixture.');
}

async function assertDates(page, language) {
  await page.locator('main time').first().waitFor();
  const dates = await page.locator('main time').evaluateAll((elements, language) => {
    const locale = language === 'en' ? undefined : language === 'te' ? 'te-IN' : 'hi-IN';
    const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    return elements.filter(element => element.getClientRects().length > 0).map(element => ({ actual: element.textContent, expected: formatter.format(new Date(element.dateTime)) }));
  }, language);
  assert.ok(dates.length > 0);
  for (const date of dates) assert.equal(date.actual, date.expected, `Date must follow ${language}, retaining undefined for English.`);
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, main section, main article, main form, dialog[open], .app-header, .app-footer, .main-nav')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select, textarea')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 150)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay in the viewport.`);
}

async function doubleText(page) {
  await page.setViewportSize({ width: 320, height: 844 });
  const original = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
  const enlarged = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  assert.equal(enlarged, original * 2, 'Body text must genuinely double, not only the root size.');
}

async function checkScreen(result, mode, language) {
  const { page } = result;
  const text = (id, values) => message(language, id, values);
  const main = page.getByRole('main');
  if (mode === 'feed') {
    await main.getByRole('heading', { name: text('feed'), exact: true }).waitFor();
    await main.getByText(postBody, { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: text('refreshPosts'), exact: true }).getAttribute('title'), text('refreshPosts'));
    for (const id of ['following', 'latest', 'savedTab']) assert.equal(await main.getByRole('button', { name: text(id), exact: true }).count(), 1);
    if (language === 'te') {
      const existing = await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xml').querySelector('string[name="community_home"]').textContent, androidTelugu);
      assert.equal(await main.locator('h1').textContent(), existing, 'The Feed heading must reuse the independent Android Telugu resource.');
    }
  } else if (mode === 'discover') {
    await main.getByRole('heading', { name: text('discover'), exact: true }).waitFor();
    await main.getByRole('link', { name: pageName, exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: text('search'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('link', { name: text('createAPage'), exact: true }).count(), 1);
    assert.equal(await main.getByText(text('followers.one'), { exact: true }).count(), 1);
    assert.equal(await main.getByRole('combobox', { name: text('topic'), exact: true }).locator('option[value="hobbies"]').textContent(), text('topic.hobbies'));
    await main.getByRole('heading', { name: text('interests.suggested'), exact: true }).waitFor();
    assert.equal(await main.getByRole('link', { name: text('interests.choose'), exact: true }).getAttribute('href'), '/app/settings/interests');
    await main.getByRole('button', { name: text('posts'), exact: true }).click();
    await main.getByText(postBody, { exact: true }).waitFor();
  } else if (mode === 'page') {
    await main.getByRole('heading', { name: pageName, exact: true }).waitFor();
    await main.getByText(text('noDrafts'), { exact: true }).waitFor();
    for (const id of ['editPage', 'saveDraft', 'edit', 'pin', 'delete']) assert.equal(await main.getByRole('button', { name: text(id), exact: true }).count(), 1);
    await main.getByRole('heading', { name: text('posts'), exact: true }).waitFor();
    assert.equal(await main.getByRole('region', { name: text('rules'), exact: true }).locator('p').textContent(), rules);
  } else if (mode === 'post') {
    await main.getByRole('heading', { name: text('postFrom', { name: pageName }), exact: true }).waitFor();
    await main.getByText(commentBody, { exact: true }).waitFor();
    await main.getByText(personName, { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: text('postComment'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text('reply'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('heading', { name: text('comments'), exact: true }).count(), 1);
  } else if (mode === 'pages') {
    await main.getByRole('heading', { name: text('yourPages'), exact: true }).waitFor();
    await main.getByRole('link', { name: pageName, exact: true }).waitFor();
    await main.getByText(text('noFollowingPagesBefore'), { exact: false }).waitFor();
    assert.equal(await main.getByRole('heading', { name: text('createPublicPage'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text('createPage'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('textbox', { name: text('pageName'), exact: true }).count(), 1);
  } else if (mode === 'safety') {
    await main.getByRole('heading', { name: text('blockedHeading'), exact: true }).waitFor();
    await main.getByText(text('noYourReports'), { exact: true }).waitFor();
    await main.getByRole('link', { name: pageName, exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: text('unblockName', { name: pageName }), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text('appeal'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('link', { name: text('moderationQueue'), exact: true }).count(), 1);
    await main.getByText(text('reason.privacy'), { exact: true }).waitFor();
  } else if (mode === 'interests') {
    await main.getByRole('heading', { name: text('interests.title'), exact: true }).waitFor();
    await main.getByText(text('interests.privacy'), { exact: true }).waitFor();
    await main.getByRole('checkbox', { name: text('topic.hobbies'), exact: true }).waitFor();
    assert.equal(await main.getByRole('checkbox', { name: text('topic.hobbies'), exact: true }).isChecked(), true);
    for (const field of ['topics', 'interests', 'languages', 'places']) assert.equal(await main.getByRole('group', { name: text(`taxonomy.${field}`), exact: true }).count(), 1);
    assert.equal(await main.getByRole('button', { name: text('interests.save'), exact: true }).count(), 1);
  } else {
    await main.getByRole('heading', { name: text('moderation'), exact: true }).waitFor();
    await main.getByText(postBody, { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: text('recordDecision'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('radio', { name: text('hide'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('radio', { name: text('action.no_action'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('combobox', { name: text('reason'), exact: true }).inputValue(), 'privacy');
  }
  if (['feed', 'discover', 'page', 'post', 'moderation'].includes(mode)) {
    assert.ok((await main.getByText(postBody, { exact: true }).count()) > 0, 'Mixed-script user content must not be translated.');
    assert.equal(await main.locator('b').count(), 0, 'User markup stays literal.');
  }
  if (mode !== 'pages' && mode !== 'interests') await assertDates(page, language);
}

async function checkEmptyState(result, mode, language) {
  const { page } = result;
  const text = (id, values) => message(language, id, values);
  if (mode === 'feed') {
    await page.getByRole('button', { name: text('savedTab'), exact: true }).click();
    await page.getByText(text('savedEmpty'), { exact: true }).waitFor();
  } else if (mode === 'discover') {
    await page.getByRole('searchbox', { name: text('searchPosts'), exact: true }).fill('no-match');
    await page.getByRole('button', { name: text('search'), exact: true }).click();
    await page.getByText(text('noMatchingPosts'), { exact: true }).waitFor();
  } else if (mode === 'post') {
    await page.evaluate(() => { window.communityI18nFixture.comments = []; window.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText(text('noComments'), { exact: true }).waitFor();
  } else if (mode === 'moderation') {
    await page.getByRole('radio', { name: text('action.no_action'), exact: true }).check();
    await page.getByRole('button', { name: text('recordDecision'), exact: true }).click();
    await page.getByRole('status').filter({ hasText: text('decisionRecorded') }).waitFor();
    await page.getByText(text('noReportsWaiting'), { exact: true }).waitFor();
    const sent = result.calls.find(call => call.path === '/api/moderation/decisions');
    assert.deepEqual(sent.body, { target_type: 'post', target_id: postId, action: 'no_action', reason: 'privacy', note: '' });
    await page.getByRole('tab', { name: text('appeals'), exact: true }).click();
    await page.getByText(text('noAppealsWaiting'), { exact: true }).waitFor();
  }
}

for (const language of ['te', 'hi']) for (const mode of modes) {
  test(`${language}: ${mode} translates controls and states, preserves content and localizes dates`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, { mode, language });
      await checkScreen(result, mode, language);
      if (language === 'te') {
        await result.page.evaluate(() => document.fonts.ready);
        await assertFits(result.page, `${mode} Telugu desktop`);
        await result.page.setViewportSize({ width: 320, height: 844 });
        await assertFits(result.page, `${mode} Telugu 320 px`);
        await doubleText(result.page);
        await assertFits(result.page, `${mode} Telugu 320 px / 200%`);
        await result.page.screenshot({ path: path.join(evidence, `community-${mode}-te-320-200.png`), fullPage: true });
      }
      await checkEmptyState(result, mode, language);
      if (language === 'te') await assertFits(result.page, `${mode} Telugu empty/status 320 px / 200%`);
      assertClean(result);
    } finally { await context.close(); }
  });
}

test('T129 interest posts switch reasons and own-term names across all three languages and fit doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { mode: 'discover', language: 'en', interestPosts: true });
    const { page } = result;
    for (const language of ['en', 'te', 'hi']) {
      await page.locator('.language-picker select').selectOption(language);
      const section = page.getByRole('region', { name: message(language, 'interestPosts.title'), exact: true });
      const name = message(language, 'topic.hobbies');
      await section.getByText(message(language, 'interestPosts.because', { names: name }), { exact: true }).waitFor();
      assert.deepEqual(await section.getByRole('list', { name: message(language, 'postTerms'), exact: true }).getByRole('listitem').allTextContents(), [name]);
      assert.equal(await section.getByText(postBody, { exact: true }).textContent(), postBody);
      await assertDates(page, language);
      await assertFits(page, `${language} interest posts desktop`);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    const reason = page.getByText(message('hi', 'interestPosts.because', { names: message('hi', 'topic.hobbies') }), { exact: true });
    const before = await reason.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await reason.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), before * 2);
    await assertFits(page, 'Hindi interest posts 320 px / measured 200% text');
    await page.screenshot({ path: path.join(evidence, 't129-interest-posts-hi-320-200.png'), fullPage: true });
    assertClean(result);
  } finally { await context.close(); }
});

test('English dates keep the browser default locale, then visible community text and dates switch without reloading', async () => {
  const context = await browser.newContext({ locale: 'en-GB', timezoneId: 'Asia/Kolkata' });
  try {
    const result = await fixture(context, { mode: 'feed', language: 'en' });
    await checkScreen(result, 'feed', 'en');
    for (const language of ['te', 'hi', 'en']) {
      await result.page.locator('.language-picker select').selectOption(language);
      await result.page.getByRole('heading', { name: message(language, 'feed'), exact: true }).waitFor();
      await assertDates(result.page, language);
      assert.equal(await result.page.getByText(postBody, { exact: true }).textContent(), postBody);
    }
    assertClean(result);
    await result.page.evaluate(() => window.unmountCommunityI18nFixture());
    await result.page.waitForFunction(() => window.communityI18nFixture.liveAborted === window.communityI18nFixture.liveOpened);
    assert.ok(await result.page.evaluate(() => window.communityI18nFixture.liveOpened > 0), 'A real open fixture stream must be cleaned up on unmount.');
  } finally { await context.close(); }
});

test('Telugu report dialog translates reasons and validation, preserves server errors and sends raw reason values', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const result = await fixture(context, { mode: 'post', language: 'te', failReport: true, offlineReport: true });
    const { page } = result;
    await page.getByRole('article', { name: postTitle, exact: true }).getByRole('button', { name: te['community.report'], exact: true }).click();
    const dialog = page.getByRole('dialog', { name: te['community.reportTitle.post'], exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('group', { name: te['community.reportWhy'], exact: true }).count(), 1);
    for (const reason of ['spam', 'harassment', 'hate', 'violence', 'sexual', 'misinformation', 'self_harm', 'privacy', 'other']) {
      assert.equal(await dialog.getByRole('radio', { name: te[`community.reason.${reason}`], exact: true }).getAttribute('value'), reason);
    }
    await dialog.getByRole('radio', { name: te['community.reason.privacy'], exact: true }).check();
    const details = dialog.getByRole('textbox', { name: te['community.detailsOptional'], exact: true });
    await details.fill('x'.repeat(1001));
    await dialog.getByText(message('te', 'textLimit', { limit: 1000 }), { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: te['community.sendReport'], exact: true }).isDisabled(), true);
    await details.fill(commentBody);
    await doubleText(page);
    await assertFits(page, 'Telugu report dialog at 320 px / 200%');
    await dialog.getByRole('button', { name: te['community.sendReport'], exact: true }).click();
    await dialog.getByRole('alert').getByText(te['community.offline'], { exact: true }).waitFor();
    await page.evaluate(() => { window.communityI18nFixture.offlineReport = false; });
    await dialog.getByRole('button', { name: te['community.sendReport'], exact: true }).click();
    await dialog.getByRole('alert').getByText(serverMessage, { exact: true }).waitFor();
    await page.evaluate(() => { window.communityI18nFixture.failReport = false; });
    await dialog.getByRole('button', { name: te['community.sendReport'], exact: true }).click();
    await dialog.getByRole('status').getByText(te['community.reportReceived'], { exact: true }).waitFor();
    assert.deepEqual(result.calls.filter(call => call.path === '/api/reports').map(call => call.body), [1, 2, 3].map(() => ({ target_type: 'post', target_id: postId, reason: 'privacy', details: commentBody })));
    await assertFits(page, 'Telugu report success at 320 px / 200%');
    await dialog.getByRole('button', { name: te['community.close'], exact: true }).click();
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu Safety appeal dialog keeps the exact note and translates its outcome and blocked confirmation', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const result = await fixture(context, { mode: 'safety', language: 'te' });
    const { page } = result;
    await page.getByRole('button', { name: te['community.appeal'], exact: true }).click();
    const dialog = page.getByRole('dialog', { name: te['community.appealDecision'], exact: true });
    await dialog.getByRole('textbox', { name: te['community.note'], exact: true }).fill(commentBody);
    await dialog.getByText(message('te', 'noteCount', { count: [...commentBody].length }), { exact: true }).waitFor();
    await doubleText(page);
    await assertFits(page, 'Telugu appeal dialog at 320 px / 200%');
    await dialog.getByRole('button', { name: te['community.sendAppeal'], exact: true }).click();
    await page.getByRole('status').getByText(te['community.appealSent'], { exact: true }).waitFor();
    await page.getByText(te['community.appealStatus.open'], { exact: true }).waitFor();
    assert.deepEqual(result.calls.find(call => call.path === `/api/moderation/decisions/${decisionId}/appeal`).body, { note: commentBody });
    await page.getByRole('button', { name: message('te', 'unblockName', { name: pageName }), exact: true }).click();
    const confirmation = page.getByRole('group', { name: message('te', 'confirmUnblock', { name: pageName }), exact: true });
    assert.equal(await confirmation.getByRole('button', { name: te['community.keepBlocked'], exact: true }).count(), 1);
    await assertFits(page, 'Telugu unblock confirmation at 320 px / 200%');
    await confirmation.getByRole('button', { name: te['community.unblock'], exact: true }).click();
    await page.getByText(te['community.noBlocks'], { exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu moderation appeals translate controls and status without translating notes or outcomes sent to the API', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const result = await fixture(context, { mode: 'moderation', language: 'te', appealReview: true });
    const { page } = result;
    await page.getByRole('tab', { name: te['community.appeals'], exact: true }).click();
    const card = page.getByRole('article', { name: message('te', 'appealCard', { target: te['community.target.post'] }), exact: true });
    await card.getByText(commentBody, { exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: te['community.keepDecision'], exact: true }).count(), 1);
    const note = card.getByRole('textbox', { name: te['community.moderatorNote'], exact: true });
    await note.fill('x'.repeat(1001));
    await card.getByText(message('te', 'textLimit', { limit: 1000 }), { exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: te['community.restoreContent'], exact: true }).isDisabled(), true);
    await note.fill(commentBody);
    await doubleText(page);
    await assertFits(page, 'Telugu moderation appeal at 320 px / 200%');
    await card.getByRole('button', { name: te['community.restoreContent'], exact: true }).click();
    await page.getByRole('status').getByText(te['community.appealResolved'], { exact: true }).waitFor();
    assert.deepEqual(result.calls.find(call => call.path === `/api/moderation/appeals/${appealId}/resolve`).body, { outcome: 'overturned', note: commentBody });
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu page editor translates field errors and topic labels while preserving rules and topic values', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const result = await fixture(context, { mode: 'page', language: 'te' });
    const { page } = result;
    await page.getByRole('button', { name: te['community.editPage'], exact: true }).click();
    const form = page.getByRole('form', { name: te['community.editPage'], exact: true });
    const name = form.getByRole('textbox', { name: te['community.name'], exact: true });
    assert.equal(await name.inputValue(), pageName);
    await name.fill('');
    await form.getByText(te['community.textRequired'], { exact: true }).waitFor();
    await name.fill(pageName);
    const ruleInput = form.getByRole('textbox', { name: te['community.rulesOptional'], exact: true });
    assert.equal(await ruleInput.inputValue(), rules);
    await ruleInput.fill('x'.repeat(2001));
    await form.getByText(message('te', 'textLimit', { limit: 2000 }), { exact: true }).waitFor();
    await ruleInput.fill(rules);
    await form.getByRole('combobox', { name: te['community.topic'], exact: true }).selectOption('education');
    await doubleText(page);
    await assertFits(page, 'Telugu page editor at 320 px / 200%');
    await form.getByRole('button', { name: te['community.savePage'], exact: true }).click();
    await form.waitFor({ state: 'detached' });
    assert.deepEqual(result.calls.find(call => call.method === 'PATCH').body, { topic: 'education' });
    assert.equal(await page.getByRole('region', { name: te['community.rules'], exact: true }).locator('p').textContent(), rules);
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu replies interpolate the untouched author name and send the exact mixed-script comment', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const result = await fixture(context, { mode: 'post', language: 'te' });
    const { page } = result;
    const comment = page.getByRole('article', { name: message('te', 'commentBy', { name: personName }), exact: true });
    await comment.getByRole('button', { name: te['community.reply'], exact: true }).click();
    const reply = comment.getByRole('textbox', { name: message('te', 'replyTo', { name: personName }), exact: true });
    await reply.fill(commentBody);
    await doubleText(page);
    await assertFits(page, 'Telugu reply form at 320 px / 200%');
    await comment.getByRole('button', { name: te['community.postReply'], exact: true }).click();
    await page.getByRole('list', { name: message('te', 'repliesTo', { name: personName }), exact: true }).getByText(commentBody, { exact: true }).waitFor();
    assert.deepEqual(result.calls.find(call => call.path === `/api/posts/${postId}/comments` && call.method === 'POST').body, { body: commentBody, parent_id: commentId });
    await assertFits(page, 'Telugu posted reply at 320 px / 200%');
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu feed reports a held response as loading, never as an empty feed', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'feed', language: 'te', holdFeed: true });
    const { page } = result;
    await page.getByRole('status').getByText(te['community.loadingPosts'], { exact: true }).waitFor();
    assert.equal(await page.getByText(te['community.noPublicPosts'], { exact: true }).count(), 0);
    await page.waitForFunction(() => typeof window.communityI18nFixture.releaseFeed === 'function');
    await page.evaluate(() => window.communityI18nFixture.releaseFeed());
    await page.getByText(postBody, { exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('Local offline read errors and Retry follow the chosen language without changing server error handling', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'feed', language: 'te', offlineFeed: true });
    const { page } = result;
    const error = page.getByRole('main').getByRole('alert');
    await error.filter({ hasText: te['community.offline'] }).waitFor();
    await page.locator('.language-picker select').selectOption('hi');
    await error.filter({ hasText: hi['community.offline'] }).waitFor();
    await page.evaluate(() => { window.communityI18nFixture.offlineFeed = false; });
    await error.getByRole('button', { name: hi['community.retry'], exact: true }).click();
    await page.getByText(postBody, { exact: true }).waitFor();
    assert.equal(await error.count(), 0);
    assertClean(result);
  } finally { await context.close(); }
});