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
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const commentId = '11111111-1111-4111-8111-111111111111';
let browser;
let javascript;
let css;

before(async () => {
  mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { PublicPageScreen } from './src/features/community/page-screen';
        import { MyPagesScreen } from './src/features/community/pages-screen';
        import { HomeScreen } from './src/features/community/home-screen';
        import { PostScreen } from './src/features/community/post-screen';
        import { InterestsScreen } from './src/features/community/interests-screen';
        import { DiscoverScreen } from './src/features/community/discover-screen';
        import { en, te, hi } from './src/features/i18n/areas/community';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.communityTexts = { en, te, hi };
        window.renderCommunityFixture = (language = 'en') => root.render(<Providers language={language}><PublicPageScreen reference="garden-club" /></Providers>);
        window.renderMyPagesFixture = () => root.render(<Providers><MyPagesScreen /></Providers>);
        window.renderHomeFixture = () => root.render(<Providers><HomeScreen /></Providers>);
        window.renderPostFixture = (id, language = 'en') => root.render(<Providers language={language}><PostScreen postId={id} /></Providers>);
        window.renderInterestsFixture = () => root.render(<Providers><InterestsScreen /></Providers>);
        window.renderDiscoverFixture = () => root.render(<Providers><DiscoverScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-community.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-community.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-community-dependencies', setup(builder) {
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

// The owner's page with one published post. Saves are refused unless If-Match names the stored version, as the API does.
// With manage: false it is someone else's page, so its post offers Report instead of the editing actions.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline community</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, postId, commentId, manage, options }) => {
    const created = '2026-09-19T10:00:00Z';
    const asOf = '2026-10-03T00:30:00.123Z';
    const term = (dimension, code, name, extra = {}) => ({ dimension, code, parent: null, sensitive: false, status: 'active', names: { en: name, te: null, hi: null }, ...extra });
    const state = window.communityFixture = {
      calls: [],
      sequence: 0,
      holdInsights: options.holdInsights ?? false,
      insightsFailure: options.insightsFailure ?? null,
      insights: {
        page_id: pageId, follower_count: 12, as_of: asOf,
        periods: Array.from({ length: 8 }, (_, index) => ({
          start: new Date(Date.parse(asOf) - (index + 1) * 7 * 86400000).toISOString(),
          end: new Date(Date.parse(asOf) - index * 7 * 86400000).toISOString(),
          new_followers: index, posts: index + 1, comments: index + 2, likes: index + 3,
        })),
      },
      draftPosts: [], draftReceipts: {},
      pauseOnPublish: options.pauseOnPublish ?? null,
      pauseOnComment: options.pauseOnComment ?? null,
      interests: { topics: options.noPostChoices ? [] : ['hobbies'], interests: options.noPostChoices ? [] : ['gardening'], languages: ['en'], places: ['in'], etag: '"interests-1"' },
      terms: [term('topic', 'community', 'Community'), term('topic', 'hobbies', 'Hobbies'), term('topic', 'education', 'Education'), term('topic', 'technology', 'Technology'),
        term('interest', 'gardening', 'Gardening', { parent: 'hobbies', status: options.retiredGardening ? 'retired' : 'active' }), term('interest', 'walking', 'Walking', { parent: 'hobbies' }),
        ...Array.from({ length: 4 }, (_, index) => term('interest', `interest-${index + 1}`, `Interest ${index + 1}`, { parent: 'hobbies' })),
        ...Array.from({ length: 6 }, (_, index) => term('language', index === 0 ? 'en' : `lang-${index}`, index === 0 ? 'English' : `Language ${index}`)),
        term('place', 'in', 'India'), term('place', 'hyderabad', 'Hyderabad', { parent: 'in' }),
        term('community_type', 'club', 'Club'), term('audience', 'everyone', 'Everyone'), term('activity', 'sharing-tips', 'Sharing tips'), term('content_kind', 'guides', 'Guides')],
      interestsFailure: options.interestsFailure ?? null,
      page: {
        id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Weekly meetups in the park.', topic: 'hobbies',
        classification: { other_topics: [], interests: [], languages: [], places: [], community_types: [], audiences: [], activities: [], content_kinds: [], ...options.classification },
        status: options.status ?? 'active',
        limited: options.limited ?? false,
        ...(options.limited && manage ? { limit: { reason: options.limitReason ?? 'spam' } } : {}),
        ...(options.hidden && manage ? { moderation: { hidden: true, reason: 'spam' } } : {}),
        follower_count: 3, created_at: created, updated_at: created, following: options.following ?? false, blocked: false, can_manage: manage, etag: manage ? '"page-1"' : null,
      },
      post: {
        id: postId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', title: 'Spring plants', body: 'Seeds are in.',
        topics: options.postTopics ?? [], interests: options.postInterests ?? [],
        status: 'published', like_count: 0, comment_count: 0, created_at: created, published_at: created, edited_at: null,
        page_limited: options.limited ?? false,
        liked: false, saved: false, can_manage: manage, etag: manage ? '"post-1"' : null,
        ...(options.postHidden ? { moderation: { hidden: true, reason: 'spam' } } : {}),
      },
      comments: options.mode === 'post' ? [{
        id: commentId, post_id: postId, parent_id: null, author_name: 'Sam Rivera', body: 'An earlier comment.',
        status: 'visible', created_at: created, mine: false, can_remove: manage,
      }] : [],
    };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    state.suggestedPage = { ...state.page, id: '11111111-1111-4111-8111-111111111111', handle: 'future-garden', name: 'Future Garden', can_manage: false, etag: null };
    state.suggestionFailure = options.suggestionFailure ?? false;
    state.interestPostsFailure = options.interestPostsFailure ?? false;
    state.interestPosts = options.matchingPosts ? [
      { post: { ...state.post, id: '22222222-2222-4222-8222-222222222222', title: 'Compost together', body: 'Making compost this weekend.', topics: ['hobbies'], interests: ['gardening'], can_manage: false, etag: null },
        reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'interest', code: 'gardening' }] },
      { post: { ...state.post, id: '33333333-3333-4333-8333-333333333333', title: 'Walking routes', body: 'A walk around the park.', topics: [], interests: ['walking'], can_manage: false, etag: null },
        reasons: [{ dimension: 'topic', code: 'hobbies' }] },
    ] : [];
    const next = etag => etag.replace(/(\d+)"$/, (_match, number) => `${Number(number) + 1}"`);
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-community', ...extra }), { status: 200 });
    const failed = (status, code, message, details = {}) => new Response(JSON.stringify({ error: { code, message, details }, request_id: 'offline-community' }), { status });
    const pausePage = code => {
      if (code === 'PAGE_LIMITED') {
        state.page.limited = true;
        if (state.page.can_manage) state.page.limit = { reason: 'spam' };
        for (const post of [state.post, ...state.draftPosts]) post.page_limited = true;
      } else state.page.moderation = { hidden: true, reason: 'spam' };
      return failed(409, code, code === 'PAGE_LIMITED' ? 'New posts and comments are paused on this page.'
        : 'Nothing new can be posted or commented on this page while it is hidden.');
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      if (url.pathname === '/api/live') return new Response(new ReadableStream({ start(controller) {
        config.signal?.addEventListener('abort', () => controller.close(), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      state.calls.push({ route: url.pathname, query: url.search, method, body, headers });
      if (url.pathname === '/api/me') return options.signedOut ? failed(401, 'AUTHENTICATION_REQUIRED', 'Sign in.') : reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/notifications') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/taxonomy') return reply(state.terms);
      if (url.pathname === '/api/discover/pages') return reply([state.page], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/discover/posts') return reply([state.post], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/me/suggested-pages') {
        if (state.suggestionFailure) return failed(503, 'SERVICE_UNAVAILABLE', 'Suggestions are unavailable.');
        return reply({ ranking: 'interests-1', items: options.emptySuggestions || state.suggestedPage.following ? [] : [{ page: state.suggestedPage,
          reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'interest', code: 'gardening' }, { dimension: 'language', code: 'en' }, { dimension: 'place', code: 'in' }],
        }] });
      }
      if (url.pathname === '/api/me/interest-posts' && method === 'GET') {
        if (state.interestPostsFailure) return failed(503, 'SERVICE_UNAVAILABLE', 'Interest posts are unavailable.');
        const cursor = url.searchParams.get('cursor');
        const currentCursor = `posts-${state.interests.etag}`;
        if (cursor && cursor !== currentCursor) return failed(400, 'CURSOR_INVALID', 'Reload posts for your changed interests.');
        if (!state.interests.topics.length && !state.interests.interests.length) return reply([], { pagination: { next_cursor: null, has_more: false } });
        const hasMore = !cursor && state.interestPosts.length > 1;
        return reply(state.interestPosts.slice(cursor ? 1 : 0, cursor ? 2 : 1), { pagination: { next_cursor: hasMore ? currentCursor : null, has_more: hasMore } });
      }
      if (url.pathname === `/api/pages/${state.suggestedPage.id}/follow` && method === 'POST') {
        state.suggestedPage.following = true;
        state.suggestedPage.follower_count++;
        return reply(state.suggestedPage);
      }
      if (url.pathname === '/api/me/pages') return reply([state.page, ...(state.createdPages ?? [])]);
      if (url.pathname === '/api/me/following') return reply([], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/me/handover-offers') return reply([]);
      if (url.pathname === '/api/pages' && method === 'POST') {
        const createdPage = { ...state.page, ...body, id: crypto.randomUUID(), etag: '"new-page-1"' };
        state.createdPages = [...(state.createdPages ?? []), createdPage];
        return reply(createdPage);
      }
      if (url.pathname === '/api/me/interests' && method === 'GET') {
        if (state.interestsFailure) return failed(503, 'SERVICE_UNAVAILABLE', 'Interests are unavailable.');
        return reply(state.interests);
      }
      if (url.pathname === '/api/me/interests' && method === 'PUT') {
        if (state.unavailableTerm) {
          const code = state.unavailableTerm;
          state.terms.find(term => term.dimension === 'interest' && term.code === code).status = 'retired';
          state.unavailableTerm = null;
          return failed(422, 'TERM_UNAVAILABLE', 'Unavailable choice.', { field: 'interests', codes: code });
        }
        if (state.offlineSave) throw new TypeError('Synthetic offline');
        if (headers['if-match'] !== state.interests.etag) return failed(412, 'CONTENT_CHANGED', 'Interests changed.');
        state.interests = { ...body, etag: next(state.interests.etag) };
        return reply(state.interests);
      }
      if (url.pathname === '/api/pages/garden-club' && method === 'GET') return reply(state.page);
      if (url.pathname === `/api/posts/${postId}` && method === 'GET') return reply(state.post);
      if (url.pathname === `/api/posts/${postId}/comments` && method === 'GET') return reply(state.comments, { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `/api/posts/${postId}/comments` && method === 'POST') {
        const paused = state.pauseOnComment ?? (state.page.moderation?.hidden ? 'PAGE_SUSPENDED' : state.page.limited ? 'PAGE_LIMITED' : null);
        if (paused) return pausePage(paused);
        const comment = { id: crypto.randomUUID(), post_id: postId, parent_id: body.parent_id ?? null, author_name: 'Alex Morgan',
          body: body.body, status: 'visible', created_at: created, mine: true, can_remove: true };
        state.comments.push(comment);
        state.post.comment_count++;
        return reply(comment);
      }
      const reaction = ['like', 'unlike', 'save', 'unsave'].find(action => url.pathname === `/api/posts/${postId}/${action}`);
      if (reaction && method === 'POST') {
        if (reaction === 'like' || reaction === 'unlike') { state.post.liked = reaction === 'like'; state.post.like_count = state.post.liked ? 1 : 0; }
        else state.post.saved = reaction === 'save';
        return reply(state.post);
      }
      if (url.pathname === `/api/pages/${pageId}/insights` && method === 'GET') {
        if (state.holdInsights) await new Promise((resolve, reject) => {
          state.releaseInsights = resolve;
          config.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
        if (!state.page.can_manage) return failed(403, 'PAGE_MANAGER_REQUIRED', 'Only the page owner can see insights.');
        if (state.insightsFailure) return failed(state.insightsFailure, state.insightsFailure === 403 ? 'PAGE_MANAGER_REQUIRED' : 'SERVICE_UNAVAILABLE', 'Insights are unavailable.');
        return reply(state.insights);
      }
      if ((url.pathname === `/api/pages/${pageId}/posts` && method === 'POST' || url.pathname.startsWith('/api/posts/') && method === 'PATCH') && state.unavailablePostTerm) {
        const { field, code } = state.unavailablePostTerm;
        state.terms.find(term => term.dimension === (field === 'topics' ? 'topic' : 'interest') && term.code === code).status = 'retired';
        state.unavailablePostTerm = null;
        return failed(422, 'TERM_UNAVAILABLE', 'Unavailable choice.', { field, codes: code });
      }
      if (url.pathname === `/api/pages/${pageId}/posts` && method === 'POST') {
        const key = headers['idempotency-key'];
        if (!state.draftReceipts[key]) {
          const draft = { ...state.post, ...body, id: crypto.randomUUID(), status: 'draft', published_at: null, edited_at: null, can_manage: true, etag: '"draft-1"' };
          state.draftReceipts[key] = draft;
          state.draftPosts.push(draft);
        }
        if (state.loseDraftAnswer) { state.loseDraftAnswer = false; throw new TypeError('Synthetic lost answer'); }
        return reply(state.draftReceipts[key]);
      }
      if (url.pathname === `/api/pages/${pageId}/posts` && method === 'GET') return reply([state.post], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `/api/pages/${pageId}/pinned-posts` && method === 'GET') return reply(state.post.pinned ? [state.post] : []);
      if (url.pathname === `/api/pages/${pageId}/drafts` && method === 'GET') return reply(state.draftPosts);
      if (url.pathname.startsWith('/api/posts/') && url.pathname.endsWith('/publish') && method === 'POST') {
        const post = state.draftPosts.find(item => url.pathname === `/api/posts/${item.id}/publish`);
        if (!post) return failed(404, 'NOT_FOUND', 'Post not found.');
        const paused = state.pauseOnPublish ?? (state.page.moderation?.hidden ? 'PAGE_SUSPENDED' : state.page.limited ? 'PAGE_LIMITED' : null);
        if (paused) return pausePage(paused);
        if (headers['if-match'] !== post.etag) return failed(412, 'CONTENT_CHANGED', 'This post changed.');
        Object.assign(post, { status: 'published', published_at: created, etag: next(post.etag) });
        state.draftPosts = state.draftPosts.filter(item => item.id !== post.id);
        return reply(post);
      }
      if (url.pathname === `/api/posts/${postId}/pin` && method === 'POST') {
        if (state.pinLimit) return failed(409, 'PIN_LIMIT_REACHED', 'A page can pin up to 3 posts. Unpin one first.');
        state.post.pinned = true;
        return reply(state.post);
      }
      if (url.pathname === `/api/posts/${postId}/unpin` && method === 'POST') {
        state.post.pinned = false;
        return reply(state.post);
      }
      if (url.pathname === `/api/pages/${pageId}` && method === 'PATCH') {
        if (headers['if-match'] !== state.page.etag) return failed(412, 'CONTENT_CHANGED', 'This page changed since you reviewed it. Reload to continue.');
        const classification = { ...state.page.classification, ...body.classification };
        Object.assign(state.page, body, { classification, etag: next(state.page.etag) });
        return reply(state.page);
      }
      if (url.pathname.startsWith('/api/posts/') && method === 'PATCH') {
        const post = [state.post, ...state.draftPosts].find(post => url.pathname === `/api/posts/${post.id}`);
        if (!post) return failed(404, 'NOT_FOUND', 'Post not found.');
        if (headers['if-match'] !== post.etag) return failed(412, 'CONTENT_CHANGED', 'This post changed since you reviewed it. Reload to continue.');
        Object.assign(post, body, { edited_at: post.status === 'published' ? '2026-09-19T11:00:00Z' : null, etag: next(post.etag) });
        return reply(post);
      }
      // The owner's page has no moderators and no handover offer (DEC-025); page-roles-ui.test.mjs covers them.
      if (url.pathname === `/api/pages/${pageId}/moderators` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/handover` && method === 'GET') return failed(404, 'NOT_FOUND', 'Handover offer not found.');
      if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply(options.moderating ? [{
        id: '11111111-1111-4111-8111-111111111111', page_id: pageId, page_handle: state.page.handle, page_name: state.page.name,
        status: 'active', created_at: created, expires_at: null, resolved_at: created, etag: '"role-1"',
      }] : []);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, pageId, postId, commentId, manage: options.manage ?? true, options });
  await page.addScriptTag({ content: javascript });
  if (options.mode === 'post') {
    await page.evaluate(({ postId, language }) => window.renderPostFixture(postId, language), { postId, language: options.language ?? 'en' });
    await page.getByRole('article', { name: 'Spring plants', exact: true }).waitFor();
    await page.getByText('An earlier comment.', { exact: true }).waitFor();
  } else if (options.mode === 'interests') {
    await page.evaluate(() => window.renderInterestsFixture());
    await page.getByRole('heading', { name: 'Your interests', exact: true }).waitFor();
  } else if (options.mode === 'pages') {
    await page.evaluate(() => window.renderMyPagesFixture());
    await page.getByRole('heading', { name: 'Your pages', exact: true }).waitFor();
  } else if (options.mode === 'discover') {
    await page.evaluate(() => window.renderDiscoverFixture());
    await page.getByRole('heading', { name: 'Discover', exact: true }).waitFor();
  } else {
    await page.evaluate(language => window.renderCommunityFixture(language), options.language ?? 'en');
    await page.getByRole('heading', { name: 'Garden Club', exact: true }).waitFor();
    await page.getByText('Seeds are in.', { exact: true }).waitFor();
  }
  return { page, outbound, errors };
}

async function doubleCommunityText(page) {
  await page.evaluate(() => document.fonts.ready);
  const before = await page.locator('body').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
  assert.equal(await page.locator('body').evaluate(element => parseFloat(getComputedStyle(element).fontSize)), before * 2);
}

async function assertCommunityFits(page) {
  const bounds = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('main article, main fieldset, main button, main select, main [class*="classification"], main [class*="matchReasons"]')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
    }).map(element => element.outerHTML.slice(0, 180)),
  }));
  assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds));
  assert.deepEqual(bounds.outside, []);
}

const insightCalls = page => page.evaluate(() => window.communityFixture.calls.filter(call => call.route.endsWith('/insights')));

const pageLimitedNotice = 'New posts and comments are paused on this page.';
const pageSuspendedNotice = 'Nothing new can be posted or commented on this page while it is hidden.';
const commentsPausedNotice = 'Comments are paused on this page.';
const limitOwnerNotice = 'A platform moderator limited this page for Spam or scam. It is left out of Discover and new posts and comments are paused. You can appeal in Safety.';

async function saveLimitDraft(page, title = 'A paused draft') {
  const composer = page.getByRole('form', { name: 'New post', exact: true });
  await composer.getByRole('textbox').first().fill(title);
  await composer.getByRole('textbox').nth(1).fill('Keep this private draft.');
  await composer.getByRole('button', { name: 'Save draft', exact: true }).click();
  const draft = page.getByRole('article', { name: title, exact: true });
  await draft.getByText('Keep this private draft.', { exact: true }).waitFor();
  return draft;
}

for (const [viewer, options] of [
  ['visitor', { manage: false }], ['follower', { manage: false, following: true }], ['signed-out visitor', { manage: false, signedOut: true }],
]) test(`T135 page: a limited page stays readable to a ${viewer} with a calm public notice`, async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { ...options, limited: true });
    await page.getByRole('status').getByText(pageLimitedNotice, { exact: true }).waitFor();
    assert.equal(await page.getByText('Seeds are in.', { exact: true }).count(), 1);
    assert.equal(await page.getByText(limitOwnerNotice, { exact: true }).count(), 0);
    assert.equal(await page.getByRole('form', { name: 'New post', exact: true }).count(), 0);
    if (!options.signedOut) {
      assert.equal(await page.getByRole('button', { name: /^Like/ }).isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true);
    }
    const reads = await page.evaluate(() => window.communityFixture.calls);
    assert.equal(reads.some(call => call.route.endsWith('/drafts')), false);
    assert.equal(reads.some(call => call.method !== 'GET'), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [restriction, options, notice] of [
  ['limited', { limited: true }, limitOwnerNotice],
  ['suspended', { hidden: true }, 'Hidden by moderators: Spam or scam. Only you can see it.'],
]) test(`T135 page: the ${restriction} owner sees why, saves and edits drafts without Publish`, async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, options);
    await page.getByText(notice, { exact: true }).waitFor();
    const composer = page.getByRole('form', { name: 'New post', exact: true });
    await composer.getByText(`${restriction === 'limited' ? pageLimitedNotice : pageSuspendedNotice} You can still save drafts.`, { exact: true }).waitFor();
    const draft = await saveLimitDraft(page);
    assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Publish now', exact: true }).count(), 0);
    assert.equal(await draft.getByRole('button', { name: 'Delete', exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('article', { name: 'Spring plants', exact: true }).getByRole('button', { name: 'Pin to top', exact: true }).isEnabled(), true);
    await draft.getByRole('button', { name: 'Edit', exact: true }).click();
    await draft.getByRole('textbox').nth(1).fill('The private draft can still be edited.');
    await draft.getByRole('button', { name: 'Save changes', exact: true }).click();
    await draft.getByText('The private draft can still be edited.', { exact: true }).waitFor();
    assert.equal(await draft.getByRole('button', { name: 'Publish', exact: true }).count(), 0);
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method !== 'GET'));
    assert.equal(commands.length, 2);
    assert.equal(commands[0].route, `/api/pages/${pageId}/posts`);
    assert.equal(commands[0].body.body, 'Keep this private draft.');
    assert.ok(commands[0].headers['idempotency-key']);
    assert.equal(commands[1].method, 'PATCH');
    assert.equal(commands[1].headers['if-match'], '"draft-1"');
    assert.equal(commands.some(call => call.route.endsWith('/publish')), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [code, message] of [['PAGE_LIMITED', pageLimitedNotice], ['PAGE_SUSPENDED', pageSuspendedNotice]]) {
  test(`T135 page: stale Publish shows ${code}, refreshes the restriction and preserves drafts`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context);
      const draft = await saveLimitDraft(page);
      const composer = page.getByRole('form', { name: 'New post', exact: true });
      await composer.getByRole('textbox').nth(1).fill('Another unsaved draft.');
      await draft.getByRole('button', { name: 'Publish', exact: true }).click();
      const beforeReads = await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/pages/garden-club').length);
      await page.evaluate(code => { window.communityFixture.pauseOnPublish = code; }, code);
      await draft.getByRole('button', { name: 'Publish now', exact: true }).click();
      await draft.getByRole('alert').getByText(message, { exact: true }).waitFor();
      await composer.getByText(`${message} You can still save drafts.`, { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Publish now', exact: true }).count(), 0);
      assert.equal(await draft.getByRole('button', { name: 'Edit', exact: true }).isEnabled(), true);
      assert.equal(await composer.getByRole('textbox').nth(1).inputValue(), 'Another unsaved draft.');
      const evidence = await page.evaluate(() => ({
        reads: window.communityFixture.calls.filter(call => call.route === '/api/pages/garden-club').length,
        publishes: window.communityFixture.calls.filter(call => call.route.endsWith('/publish')),
        statuses: window.communityFixture.draftPosts.map(post => post.status),
      }));
      assert.ok(evidence.reads > beforeReads);
      assert.equal(evidence.publishes.length, 1);
      assert.deepEqual(evidence.statuses, ['draft']);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const language of ['en', 'te', 'hi']) for (const restriction of ['limited', 'suspended']) {
  test(`T135 layout: ${language} ${restriction} owner notices fit 320px with measured 200% text`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    try {
      const { page, outbound, errors } = await fixture(context, { language, limited: restriction === 'limited', hidden: restriction === 'suspended', limitReason: 'privacy' });
      const texts = await page.evaluate(language => window.communityTexts[language], language);
      const text = restriction === 'limited' ? texts['community.limitedByModerators'].replace('{reason}', texts['community.reason.privacy']) : texts['community.suspendedDraftHint'];
      const notice = page.getByText(text, { exact: true });
      await notice.waitFor();
      await assertCommunityFits(page);
      if (language === 'en') await page.screenshot({ path: path.join(root, `.local/screenshots/t135-${restriction}-owner-desktop.png`), fullPage: true });
      const normalSize = await notice.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
      await page.setViewportSize({ width: 320, height: 844 });
      await doubleCommunityText(page);
      assert.equal(await notice.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), normalSize * 2);
      await assertCommunityFits(page);
      const bounds = await notice.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
      assert.equal(await notice.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      if (language !== 'en') for (const key of ['community.pageLimited', 'community.commentsPaused', 'community.limitedByModerators', 'community.limitedDraftHint', 'community.suspendedDraftHint']) {
        assert.match(texts[key], language === 'te' ? /[\u0c00-\u0c7f]/ : /[\u0900-\u097f]/, key);
      }
      await page.screenshot({ path: path.join(root, `.local/screenshots/t135-${restriction}-owner-${language}-320-large-text.png`), fullPage: true });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('T135 post: a limited post keeps comment history and Like/Save, without a comment form or Reply', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'post', manage: false, limited: true });
    const card = page.getByRole('article', { name: 'Spring plants', exact: true });
    await card.getByRole('status').getByText(commentsPausedNotice, { exact: true }).waitFor();
    assert.equal(await page.getByText('An earlier comment.', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Post comment', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).count(), 0);
    assert.equal(await card.getByRole('button', { name: /^Like/ }).isEnabled(), true);
    assert.equal(await card.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true);
    assert.equal(await card.getByRole('link', { name: /^Comments/ }).getAttribute('href'), `/posts/${postId}`);
    await card.getByRole('button', { name: /^Like/ }).click();
    await page.waitForFunction(() => window.communityFixture.post.liked);
    await card.getByRole('button', { name: 'Save', exact: true }).click();
    await card.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: /^Like/ }).getAttribute('aria-pressed'), 'true');
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method !== 'GET'));
    assert.deepEqual(commands.map(call => [call.route, call.body]), [[`/api/posts/${postId}/like`, {}], [`/api/posts/${postId}/save`, {}]]);
    assert.ok(commands.every(call => call.headers['x-account-id'] === accountId));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T135 cards: the hidden page context pauses comments without mistaking post moderation for page suspension', async () => {
  for (const options of [{ hidden: true }, { mode: 'post', postHidden: true }]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, options);
      const card = page.getByRole('article', { name: 'Spring plants', exact: true });
      if (options.hidden) await card.getByRole('status').getByText(commentsPausedNotice, { exact: true }).waitFor();
      else {
        assert.equal(await card.getByText(commentsPausedNotice, { exact: true }).count(), 0);
        assert.equal(await page.getByRole('textbox', { name: 'Write a comment', exact: true }).isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).isEnabled(), true);
      }
      assert.equal(await card.getByRole('button', { name: /^Like/ }).isEnabled(), true);
      assert.equal(await card.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true);
      assert.equal(await page.evaluate(() => window.communityFixture.post.page_limited), false);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

for (const kind of ['comment', 'reply']) for (const [code, message] of [['PAGE_LIMITED', pageLimitedNotice], ['PAGE_SUSPENDED', pageSuspendedNotice]]) {
  test(`T135 post: stale ${kind} shows ${code}, refreshes the post and pauses comments without replay`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { mode: 'post', manage: code === 'PAGE_SUSPENDED' });
      const comment = page.getByRole('article').filter({ hasText: 'An earlier comment.' });
      if (kind === 'reply') await comment.getByRole('button', { name: 'Reply', exact: true }).click();
      const textbox = kind === 'reply' ? comment.getByRole('textbox') : page.getByRole('textbox', { name: 'Write a comment', exact: true });
      await textbox.fill('A new note.');
      const beforeReads = await page.evaluate(postId => window.communityFixture.calls.filter(call => call.route === `/api/posts/${postId}` && call.method === 'GET').length, postId);
      await page.evaluate(code => { window.communityFixture.pauseOnComment = code; }, code);
      await page.getByRole('button', { name: kind === 'reply' ? 'Post reply' : 'Post comment', exact: true }).click();
      await page.getByRole('alert').getByText(message, { exact: true }).waitFor();
      await page.getByRole('status').getByText(commentsPausedNotice, { exact: true }).waitFor();
      await page.waitForFunction(({ postId, beforeReads }) => window.communityFixture.calls.filter(call => call.route === `/api/posts/${postId}` && call.method === 'GET').length > beforeReads, { postId, beforeReads });
      assert.equal(await page.getByRole('textbox').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Like/ }).isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true);
      const evidence = await page.evaluate(() => ({
        commands: window.communityFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/comments')),
        comments: window.communityFixture.comments.length, limited: window.communityFixture.post.page_limited,
      }));
      assert.equal(evidence.commands.length, 1);
      assert.deepEqual(evidence.commands[0].body, { body: 'A new note.', ...(kind === 'reply' ? { parent_id: commentId } : {}) });
      assert.equal(evidence.comments, 1);
      assert.equal(evidence.limited, code === 'PAGE_LIMITED');
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('T135 post: a restored response lifts a previously refused comment pause', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'post', manage: false, pauseOnComment: 'PAGE_LIMITED' });
    await page.getByRole('textbox', { name: 'Write a comment', exact: true }).fill('A new note.');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await page.getByRole('alert').getByText(pageLimitedNotice, { exact: true }).waitFor();
    await page.getByRole('status').getByText(commentsPausedNotice, { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0);
    await page.evaluate(() => {
      window.communityFixture.page.limited = false;
      window.communityFixture.post.page_limited = false;
      window.communityFixture.pauseOnComment = null;
    });
    await page.getByRole('button', { name: /^Like/ }).click();
    await page.getByRole('textbox', { name: 'Write a comment', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).isEnabled(), true);
    assert.equal(await page.getByText(commentsPausedNotice, { exact: true }).count(), 0);
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T135 post: a fresh limited response closes an already open reply without hiding other comment actions', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'post', manage: false });
    const comment = page.getByRole('article').filter({ hasText: 'An earlier comment.' });
    await comment.getByRole('button', { name: 'Reply', exact: true }).click();
    await comment.getByRole('textbox').fill('An unsent reply.');
    await page.evaluate(() => { window.communityFixture.page.limited = true; window.communityFixture.post.page_limited = true; });
    await page.getByRole('button', { name: /^Like/ }).click();
    await page.getByRole('status').getByText(commentsPausedNotice, { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await comment.getByRole('button', { name: 'Reply', exact: true }).count(), 0);
    assert.equal(await comment.getByRole('button', { name: 'Report', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => window.communityFixture.calls.some(call => call.method === 'POST' && call.route.endsWith('/comments'))), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const language of ['en', 'te', 'hi']) test(`T135 layout: ${language} paused post notice fits 320px with measured 200% text`, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'post', language, limited: true, manage: false });
    const texts = await page.evaluate(language => window.communityTexts[language], language);
    const notice = page.getByRole('status').getByText(texts['community.commentsPaused'], { exact: true });
    await notice.waitFor();
    await assertCommunityFits(page);
    if (language === 'en') await page.screenshot({ path: path.join(root, '.local/screenshots/t135-post-desktop.png'), fullPage: true });
    const normalSize = await notice.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.setViewportSize({ width: 320, height: 844 });
    await doubleCommunityText(page);
    assert.equal(await notice.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), normalSize * 2);
    await assertCommunityFits(page);
    const bounds = await notice.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
    assert.equal(await notice.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/t135-post-${language}-320-large-text.png`), fullPage: true });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('insights: the owner opens a lazy table of eight local date ranges and can refresh totals', async () => {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });
  try {
    const { page, outbound, errors } = await fixture(context, { holdInsights: true });
    const section = page.getByRole('region', { name: 'Insights', exact: true });
    await section.getByRole('heading', { name: 'Insights', exact: true }).waitFor();
    const show = section.getByRole('button', { name: 'Show insights', exact: true });
    assert.equal(await show.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await insightCalls(page), []);
    assert.equal(await section.getByRole('table').count(), 0);
    await show.click();
    await section.getByRole('status').waitFor();
    assert.equal(await section.getByRole('status').getAttribute('aria-busy'), 'true');
    assert.equal(await section.getByRole('table').count(), 0);
    await page.evaluate(() => { window.communityFixture.holdInsights = false; window.communityFixture.releaseInsights(); });
    const table = section.getByRole('table', { name: 'Eight seven-day periods', exact: true });
    await table.waitFor();
    assert.equal(await table.locator('caption').textContent(), 'Eight seven-day periods');
    assert.equal(await table.getByRole('row').count(), 9);
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['Period', 'New followers', 'Posts', 'Comments', 'Likes']);
    const expected = await page.evaluate(() => {
      const format = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' });
      return window.communityFixture.insights.periods.map(period => format.formatRange(new Date(period.start), new Date(period.end)));
    });
    assert.deepEqual(await table.getByRole('rowheader').allTextContents(), expected);
    assert.deepEqual(await table.locator('tbody tr').first().getByRole('cell').allTextContents(), ['0', '1', '2', '3']);
    await section.getByText('Current followers: 12', { exact: true }).waitFor();
    await section.getByText('Totals only. Nothing about who is shown. A follow, comment or like that is taken back no longer counts. Your own activity is not counted.', { exact: true }).waitFor();
    const calls = await insightCalls(page);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['x-account-id'], accountId);
    assert.equal(calls[0].query, '');
    assert.equal(calls[0].method, 'GET');
    await section.screenshot({ path: path.join(root, '.local/screenshots/page-insights-desktop.png') });
    await page.evaluate(() => { window.communityFixture.insights.follower_count = 11; window.communityFixture.insights.periods[0].likes = 1; });
    await section.getByRole('button', { name: 'Refresh insights', exact: true }).click();
    await section.getByText('Current followers: 11', { exact: true }).waitFor();
    assert.equal(await table.locator('tbody tr').first().getByRole('cell').last().textContent(), '1');
    assert.equal((await insightCalls(page)).length, 2);
    await section.getByRole('button', { name: 'Hide insights', exact: true }).click();
    assert.equal(await section.getByRole('table').count(), 0);
    assert.equal(await section.getByRole('button', { name: 'Refresh insights', exact: true }).count(), 0);
    assert.equal((await insightCalls(page)).length, 2);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [visitor, options] of [
  ['signed-in visitor', { manage: false }], ['page moderator', { manage: false, moderating: true }],
  ['signed-out visitor', { manage: false, signedOut: true }],
]) test(`insights: a ${visitor} never sees the section or requests totals`, async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, options);
    if (options.moderating) await page.getByText('You moderate this page', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Insights', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Show insights', exact: true }).count(), 0);
    assert.equal(await page.getByRole('table').count(), 0);
    assert.deepEqual(await insightCalls(page), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('insights: failures need Retry and access denial removes previously loaded totals', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { insightsFailure: 503 });
    const section = page.getByRole('region', { name: 'Insights', exact: true });
    await section.getByRole('button', { name: 'Show insights', exact: true }).click();
    await section.getByRole('alert').waitFor();
    assert.equal(await section.getByRole('table').count(), 0);
    assert.equal((await insightCalls(page)).length, 1);
    await page.evaluate(() => { window.communityFixture.insightsFailure = null; });
    await section.getByRole('button', { name: 'Retry', exact: true }).click();
    await section.getByRole('table').waitFor();
    assert.equal((await insightCalls(page)).length, 2);
    assert.equal(await section.getByRole('alert').count(), 0);
    await page.evaluate(() => { window.communityFixture.insightsFailure = 403; });
    await section.getByRole('button', { name: 'Refresh insights', exact: true }).click();
    await section.getByRole('alert').waitFor();
    assert.equal(await section.getByRole('table').count(), 0);
    assert.equal(await section.getByText('Current followers: 12', { exact: true }).count(), 0);
    assert.equal((await insightCalls(page)).length, 3);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const language of ['en', 'te', 'hi']) test(`insights: ${language} at 320px and 200% text shows every number without sideways scrolling`, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
  try {
    const { page, outbound, errors } = await fixture(context, { language });
    const texts = await page.evaluate(language => window.communityTexts[language], language);
    const section = page.getByRole('region', { name: texts['community.insights.title'], exact: true });
    await section.getByRole('button', { name: texts['community.insights.show'], exact: true }).click();
    const table = section.getByRole('table', { name: texts['community.insights.caption'], exact: true });
    await table.waitFor();
    if (language !== 'en') for (const [key, value] of Object.entries(texts).filter(([key]) => key.startsWith('community.insights.'))) {
      assert.match(value, language === 'te' ? /[\u0c00-\u0c7f]/ : /[\u0900-\u097f]/, key);
    }
    const expected = await page.evaluate(language => {
      const format = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : `${language}-IN`, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      return window.communityFixture.insights.periods.map(period => format.formatRange(new Date(period.start), new Date(period.end)));
    }, language);
    assert.deepEqual(await table.getByRole('rowheader').allTextContents(), expected);
    await doubleCommunityText(page);
    await assertCommunityFits(page);
    const scroll = section.getByRole('region', { name: texts['community.insights.caption'], exact: true });
    // 2026-10-03 live check: a wide table hid four of five columns off to the right at this size. Every number must show.
    const bounds = await scroll.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, right: element.getBoundingClientRect().right }));
    assert.ok(bounds.content <= bounds.width + 1, JSON.stringify(bounds));
    assert.ok(bounds.right <= 320, JSON.stringify(bounds));
    assert.equal(await scroll.getAttribute('tabindex'), '0');
    assert.equal(await table.getByRole('cell').count(), 32);
    const hidden = await table.getByRole('cell').evaluateAll(cells => cells.filter(cell => {
      const box = cell.getBoundingClientRect();
      return box.width === 0 || box.left < 0 || box.right > 321;
    }).length);
    assert.equal(hidden, 0);
    const first = await table.getByRole('cell').first().evaluate(cell => getComputedStyle(cell, '::before').content);
    assert.equal(first, JSON.stringify(texts['community.insights.newFollowers']));
    // Column headers are visually hidden at this size (each number carries its own label), so only the body is measured.
    assert.deepEqual(await table.locator('tbody th, tbody td').evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent)), []);
    await section.screenshot({ path: path.join(root, `.local/screenshots/page-insights-${language}-320-large-text.png`) });
    await assertCommunityFits(page);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post terms: the composer enforces both limits, sends owner order and resets only after a saved draft', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    const form = page.getByRole('form', { name: 'New post', exact: true });
    await form.getByRole('textbox', { name: 'Title (optional)', exact: true }).fill('Summer beds');
    await form.getByRole('textbox', { name: 'Text', exact: true }).fill('Prepare the garden.');
    await form.locator('summary').filter({ hasText: 'Topics and interests' }).click();
    for (const name of ['Technology', 'Hobbies', 'Education']) await form.getByRole('checkbox', { name, exact: true }).check();
    assert.equal(await form.getByRole('checkbox', { name: 'Community', exact: true }).isDisabled(), true);
    for (const name of ['Gardening', 'Walking', 'Interest 1', 'Interest 2', 'Interest 3']) await form.getByRole('checkbox', { name, exact: true }).check();
    assert.equal(await form.getByRole('checkbox', { name: 'Interest 4', exact: true }).isDisabled(), true);
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    const draft = page.getByRole('article', { name: 'Summer beds', exact: true });
    await draft.waitFor();
    assert.deepEqual(await draft.getByRole('list', { name: 'Topics and interests' }).getByRole('listitem').allTextContents(), ['Technology', 'Hobbies', 'Education', 'Gardening', 'Walking', 'Interest 1', 'Interest 2', 'Interest 3']);
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.route.endsWith('/posts') && call.method === 'POST'));
    assert.equal(commands.length, 1);
    assert.equal(commands[0].headers['x-account-id'], accountId);
    assert.ok(commands[0].headers['idempotency-key']);
    assert.deepEqual(commands[0].body, { title: 'Summer beds', body: 'Prepare the garden.', topics: ['technology', 'hobbies', 'education'], interests: ['gardening', 'walking', 'interest-1', 'interest-2', 'interest-3'] });
    assert.equal(await form.getByRole('checkbox', { checked: true }).count(), 0);
    await draft.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = draft.getByRole('form');
    await editor.locator('summary').click();
    await editor.getByRole('button', { name: 'Remove Technology', exact: true }).click();
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const edits = await saves(page);
    assert.deepEqual(edits.at(-1).body, { topics: ['hobbies', 'education'] });
    assert.equal(edits.at(-1).headers['if-match'], '"draft-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post terms: an unknown draft save locks choices and retries the exact key and terms', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    const form = page.getByRole('form', { name: 'New post', exact: true });
    await form.getByRole('textbox', { name: 'Title (optional)', exact: true }).fill('Retry garden');
    await form.getByRole('textbox', { name: 'Text', exact: true }).fill('Keep this draft.');
    await form.locator('summary').click();
    await form.getByRole('checkbox', { name: 'Education', exact: true }).check();
    await form.getByRole('checkbox', { name: 'Walking', exact: true }).check();
    await page.evaluate(() => { window.communityFixture.loseDraftAnswer = true; });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await form.getByRole('button', { name: /Retry/ }).waitFor();
    assert.equal(await form.getByRole('checkbox', { name: 'Education', exact: true }).isDisabled(), true);
    assert.equal(await form.getByRole('checkbox', { name: 'Education', exact: true }).isChecked(), true);
    await form.getByRole('button', { name: /Retry/ }).click();
    await page.getByRole('article', { name: 'Retry garden', exact: true }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.route.endsWith('/posts') && call.method === 'POST'));
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[1], commands[0]);
    assert.deepEqual(commands[0].body.topics, ['education']);
    assert.deepEqual(commands[0].body.interests, ['walking']);
    assert.equal(await page.evaluate(() => window.communityFixture.draftPosts.length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post terms: text-only edits retain retired terms and changed lists replace or clear with If-Match', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { postTopics: ['hobbies'], postInterests: ['gardening'], retiredGardening: true });
    const post = page.getByRole('article', { name: 'Spring plants', exact: true });
    await post.getByRole('button', { name: 'Edit', exact: true }).click();
    let editor = post.getByRole('form');
    await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('The seeds are ready.');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual((await saves(page))[0].body, { body: 'The seeds are ready.' });
    await post.getByRole('button', { name: 'Edit', exact: true }).click();
    editor = post.getByRole('form');
    await editor.locator('summary').click();
    await editor.getByText('Gardening (Retired)', { exact: true }).waitFor();
    await editor.getByRole('button', { name: 'Remove Gardening', exact: true }).click();
    await editor.getByRole('button', { name: 'Remove Hobbies', exact: true }).click();
    await editor.getByRole('checkbox', { name: 'Education', exact: true }).check();
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const commands = await saves(page);
    assert.deepEqual(commands[1].body, { topics: ['education'], interests: [] });
    assert.equal(commands[1].headers['if-match'], '"post-2"');
    await post.getByText('Edited', { exact: true }).waitFor();
    assert.deepEqual(await post.getByRole('list', { name: 'Topics and interests' }).getByRole('listitem').allTextContents(), ['Education']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post terms: composer and editor keep drafts and name unavailable terms until corrected', async () => {
  for (const editing of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context);
      const post = page.getByRole('article', { name: 'Spring plants', exact: true });
      if (editing) await post.getByRole('button', { name: 'Edit', exact: true }).click();
      const form = editing ? post.getByRole('form') : page.getByRole('form', { name: 'New post', exact: true });
      await form.getByRole('textbox', { name: 'Text', exact: true }).fill('Keep my words.');
      await form.locator('summary').click();
      await form.getByRole('checkbox', { name: 'Gardening', exact: true }).check();
      await page.evaluate(() => { window.communityFixture.unavailablePostTerm = { field: 'interests', code: 'gardening' }; });
      await form.getByRole('button', { name: editing ? 'Save changes' : 'Save draft', exact: true }).click();
      await (editing ? post : form).getByRole('alert').filter({ hasText: 'These choices are no longer available: Gardening.' }).waitFor();
      await form.getByText('Gardening (Retired)', { exact: true }).waitFor();
      assert.equal(await form.getByRole('textbox', { name: 'Text', exact: true }).inputValue(), 'Keep my words.');
      await form.getByRole('button', { name: 'Remove Gardening', exact: true }).click();
      await form.getByRole('checkbox', { name: 'Walking', exact: true }).check();
      await form.getByRole('button', { name: editing ? 'Save changes' : 'Save draft', exact: true }).click();
      if (editing) await form.waitFor({ state: 'detached' });
      else await form.getByRole('textbox', { name: 'Text', exact: true }).waitFor();
      await page.waitForFunction(() => window.communityFixture.post.interests.includes('walking') || window.communityFixture.draftPosts.some(post => post.interests.includes('walking')));
      const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'POST' || call.method === 'PATCH'));
      assert.equal(commands.length, 2);
      assert.deepEqual(commands[1].body.interests, ['walking']);
      assert.equal(commands[1].body.body, 'Keep my words.');
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('post terms: public posts show only their own chips, and unclassified posts add nothing', async () => {
  for (const ownTerms of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { signedOut: true, manage: false, classification: { interests: ['gardening'] }, postTopics: ownTerms ? ['education', 'hobbies'] : [], postInterests: ownTerms ? ['walking'] : [] });
      const post = page.getByRole('article', { name: 'Spring plants', exact: true });
      const chips = post.getByRole('list', { name: 'Topics and interests', exact: true });
      if (ownTerms) {
        await chips.getByText('Walking', { exact: true }).waitFor();
        assert.deepEqual(await chips.getByRole('listitem').allTextContents(), ['Education', 'Hobbies', 'Walking']);
        await page.screenshot({ path: path.join(root, '.local/screenshots/t129-post-terms-desktop.png'), fullPage: true });
      } else assert.equal(await chips.count(), 0);
      assert.equal(await post.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('post terms: composer, editor and chips fit 320px with measured 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { postTopics: ['technology', 'hobbies'], postInterests: ['gardening'] });
    const composer = page.getByRole('form', { name: 'New post', exact: true });
    await composer.locator('summary').click();
    await composer.getByRole('checkbox', { name: 'Technology', exact: true }).check();
    await page.getByRole('article', { name: 'Spring plants', exact: true }).getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('article', { name: 'Spring plants', exact: true }).getByRole('form');
    await editor.locator('summary').click();
    const original = await editor.getByRole('searchbox', { name: 'Search Topics', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await doubleCommunityText(page);
    assert.equal(await editor.getByRole('searchbox', { name: 'Search Topics', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize)), original * 2);
    await assertCommunityFits(page);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t129-authoring-320-large-text.png'), fullPage: true });
    await editor.getByRole('checkbox', { name: 'Education', exact: true }).check();
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual((await saves(page)).at(-1).body, { topics: ['technology', 'hobbies', 'education'] });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interests: search, selection limits, private notice and all four lists save with the reviewed version', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'interests' });
    await page.getByText('Only you see these; used only to suggest pages and posts to you', { exact: true }).waitFor();
    const form = page.getByRole('form', { name: 'Your interests' });
    await form.getByRole('checkbox', { name: 'Technology', exact: true }).check();
    const interests = form.getByRole('group', { name: 'Interests', exact: true });
    await interests.getByRole('searchbox', { name: 'Search Interests' }).fill('walk');
    assert.equal(await interests.getByRole('checkbox', { name: 'Gardening', exact: true }).count(), 0);
    await interests.getByRole('checkbox', { name: 'Walking', exact: true }).check();
    await interests.getByText('2 of 30', { exact: true }).waitFor();
    const languages = form.getByRole('group', { name: 'Languages', exact: true });
    for (const index of [1, 2, 3, 4]) await languages.getByRole('checkbox', { name: `Language ${index}`, exact: true }).check();
    assert.equal(await languages.getByRole('checkbox', { name: 'Language 5', exact: true }).isDisabled(), true);
    await languages.getByText('5 of 5', { exact: true }).waitFor();
    await form.getByRole('button', { name: 'Remove India', exact: true }).click();
    await form.getByRole('button', { name: 'Save interests', exact: true }).click();
    await form.getByText('Interests saved.', { exact: true }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'PUT'));
    assert.equal(commands.length, 1);
    assert.equal(commands[0].headers['if-match'], '"interests-1"');
    assert.equal(commands[0].headers['x-account-id'], accountId);
    assert.deepEqual(commands[0].body, { topics: ['hobbies', 'technology'], interests: ['gardening', 'walking'], languages: ['en', 'lang-1', 'lang-2', 'lang-3', 'lang-4'], places: [] });
    assert.equal(await form.getByRole('button', { name: 'Save interests', exact: true }).isDisabled(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interests: a 412 preserves the draft, blocks stale saves, and reloads only after explicit confirmation', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'interests' });
    const form = page.getByRole('form', { name: 'Your interests' });
    await form.getByRole('checkbox', { name: 'Technology', exact: true }).check();
    await page.evaluate(() => { window.communityFixture.interests = { topics: ['education'], interests: [], languages: [], places: [], etag: '"interests-2"' }; });
    await form.getByRole('button', { name: 'Save interests', exact: true }).click();
    await form.getByRole('alert').filter({ hasText: 'Your interests changed elsewhere. Your draft is kept.' }).waitFor();
    assert.equal(await form.getByRole('checkbox', { name: 'Technology', exact: true }).isChecked(), true);
    assert.equal(await form.getByRole('button', { name: 'Save interests', exact: true }).isDisabled(), true);
    page.once('dialog', dialog => dialog.dismiss());
    await form.getByRole('button', { name: 'Reload saved interests', exact: true }).click();
    assert.equal(await form.getByRole('checkbox', { name: 'Technology', exact: true }).isChecked(), true);
    page.once('dialog', dialog => dialog.accept());
    await form.getByRole('button', { name: 'Reload saved interests', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[type="checkbox"]:checked')?.closest('label')?.textContent === 'Education');
    assert.equal(await form.getByRole('checkbox', { name: 'Technology', exact: true }).isChecked(), false);
    await form.getByRole('checkbox', { name: 'Technology', exact: true }).check();
    await form.getByRole('button', { name: 'Save interests', exact: true }).click();
    await form.getByText('Interests saved.', { exact: true }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'PUT'));
    assert.deepEqual(commands.map(call => call.headers['if-match']), ['"interests-1"', '"interests-2"']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interests: unavailable choices stay removable, refresh the vocabulary, and can be cleared without losing other choices', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'interests' });
    const form = page.getByRole('form', { name: 'Your interests' });
    await form.getByRole('checkbox', { name: 'Walking', exact: true }).check();
    await page.evaluate(() => { window.communityFixture.unavailableTerm = 'gardening'; });
    await form.getByRole('button', { name: 'Save interests', exact: true }).click();
    await form.getByRole('alert').filter({ hasText: 'These choices are no longer available: Gardening.' }).waitFor();
    await form.getByText('Gardening (Retired)', { exact: true }).waitFor();
    assert.equal(await form.getByRole('checkbox', { name: 'Walking', exact: true }).isChecked(), true);
    for (const name of ['Hobbies', 'Gardening', 'Walking', 'English', 'India']) await form.getByRole('button', { name: `Remove ${name}`, exact: true }).click();
    await form.getByRole('button', { name: 'Save interests', exact: true }).click();
    await form.getByText('Interests saved.', { exact: true }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'PUT'));
    assert.deepEqual(commands.at(-1).body, { topics: [], interests: [], languages: [], places: [] });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interests: a failed load is not an empty profile and Retry recovers', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'interests', interestsFailure: true });
    await page.getByRole('alert').filter({ hasText: 'Interests are unavailable.' }).waitFor();
    assert.equal(await page.getByRole('form', { name: 'Your interests' }).count(), 0);
    await page.evaluate(() => { window.communityFixture.interestsFailure = null; });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Hobbies', exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: 'Hobbies', exact: true }).isChecked(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interests: pickers and actions fit at 320px with every visible text size doubled', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'interests' });
    await page.getByRole('checkbox', { name: 'Technology', exact: true }).check();
    await page.evaluate(() => document.fonts.ready);
    const before = await page.getByRole('searchbox', { name: 'Search Interests', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const after = await page.getByRole('searchbox', { name: 'Search Interests', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.equal(after, before * 2);
    const bounds = await page.evaluate(() => ({
      width: innerWidth, scroll: document.documentElement.scrollWidth,
      outside: [...document.querySelectorAll('main button, main input, main fieldset')].filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
      }).map(element => element.outerHTML.slice(0, 180)),
      short: [...document.querySelectorAll('main button, main label')].filter(element => element.querySelector('input[type="checkbox"]') || element.tagName === 'BUTTON')
        .filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent),
    }));
    assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds));
    assert.deepEqual(bounds.outside, []); assert.deepEqual(bounds.short, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t126-interests-320-large-text.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save interests', exact: true }).click();
    await page.getByText('Interests saved.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('classification: public chips name all eight dimensions and only active owners get an editor', async () => {
  const classification = { other_topics: ['education'], interests: ['gardening'], languages: ['en'], places: ['in'], community_types: ['club'], audiences: ['everyone'], activities: ['sharing-tips'], content_kinds: ['guides'] };
  for (const options of [{ manage: true }, { manage: false }, { manage: true, status: 'read_only' }]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { ...options, classification });
      const chips = page.getByRole('list', { name: 'About this page', exact: true });
      await chips.getByText('Interests: Gardening', { exact: true }).waitFor();
      for (const text of ['Other topics: Education', 'Languages: English', 'Places: India', 'Community types: Club', 'Audiences: Everyone', 'Activities: Sharing tips', 'Content kinds: Guides']) {
        await chips.getByText(text, { exact: true }).waitFor();
      }
      assert.equal(await chips.getByRole('listitem').count(), 8);
      assert.equal(await page.getByRole('button', { name: 'Edit page', exact: true }).count(), options.manage && options.status !== 'read_only' ? 1 : 0);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('classification: the owner sends changed lists only, preserves other categories and clears a redundant topic', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { classification: { languages: ['en'], other_topics: ['education'] } });
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page', exact: true });
    await editor.locator('summary').filter({ hasText: 'About this page' }).click();
    await editor.getByRole('group', { name: 'Interests', exact: true }).getByRole('searchbox').fill('garden');
    await editor.getByRole('checkbox', { name: 'Gardening', exact: true }).check();
    await editor.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('education');
    await editor.getByRole('group', { name: 'Other topics', exact: true }).getByText('0 of 2', { exact: true }).waitFor();
    await editor.getByRole('button', { name: 'Save page', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const sent = await saves(page);
    assert.deepEqual(sent[0].body, { topic: 'education', classification: { other_topics: [], interests: ['gardening'] } });
    assert.equal(sent[0].headers['if-match'], '"page-1"');
    const chips = page.getByRole('list', { name: 'About this page', exact: true });
    await chips.getByText('Interests: Gardening', { exact: true }).waitFor();
    await chips.getByText('Languages: English', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('classification: page creation chooses a new vocabulary topic and optional classification', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'pages' });
    const form = page.getByRole('form', { name: 'Create a public page', exact: true });
    await form.getByRole('textbox', { name: 'Handle', exact: true }).fill('future-garden');
    await form.getByRole('textbox', { name: 'Page name', exact: true }).fill('Future Garden');
    await form.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('technology');
    await form.locator('summary').filter({ hasText: 'About this page' }).click();
    await form.getByRole('checkbox', { name: 'Gardening', exact: true }).check();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Create-page controls fit at 320px and 200% text.');
    await page.screenshot({ path: path.join(root, '.local/screenshots/t126-create-page-320-large-text.png'), fullPage: true });
    await form.getByRole('button', { name: 'Create page', exact: true }).click();
    const submission = await page.evaluate(() => ({
      calls: window.communityFixture.calls.filter(call => call.route === '/api/pages' && call.method === 'POST'),
      error: document.querySelector('[role="alert"]')?.textContent ?? null,
    }));
    assert.deepEqual(errors, [], 'Creating the page must not raise a browser error.');
    assert.equal(submission.calls.length, 1, JSON.stringify(submission));
    await form.getByRole('link', { name: 'Open @future-garden', exact: true }).waitFor();
    const sent = await page.evaluate(() => window.communityFixture.calls.find(call => call.route === '/api/pages' && call.method === 'POST'));
    assert.equal(sent.body.topic, 'technology');
    assert.deepEqual(sent.body.classification.interests, ['gardening']);
    assert.equal(sent.body.handle, 'future-garden');
    assert.ok(sent.headers['idempotency-key']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('classification: chips and searchable owner controls fit at 320px with doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context, { classification: { interests: ['gardening'], places: ['hyderabad'], community_types: ['club'] } });
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page', exact: true });
    await editor.locator('summary').filter({ hasText: 'About this page' }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      outside: [...document.querySelectorAll('main input, main button, main select, main fieldset, main [class*="classification"]')].filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
      }).map(element => element.outerHTML.slice(0, 180)),
    }));
    assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds)); assert.deepEqual(bounds.outside, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t126-page-editor-320-large-text.png'), fullPage: true });
    await editor.getByRole('checkbox', { name: 'Walking', exact: true }).check();
    await editor.getByRole('button', { name: 'Save page', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interest posts: Discover shows published posts with named reasons below suggestions and pages with Show more', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, matchingPosts: true });
    const section = page.getByRole('region', { name: 'From your interests', exact: true });
    await section.getByRole('article', { name: 'Compost together', exact: true }).waitFor();
    await section.getByText('Because you chose: Hobbies, Gardening', { exact: true }).waitFor();
    assert.deepEqual(await section.getByRole('list', { name: 'Topics and interests' }).getByRole('listitem').allTextContents(), ['Hobbies', 'Gardening']);
    assert.equal(await section.getByRole('link', { name: 'Compost together', exact: true }).getAttribute('href'), '/posts/22222222-2222-4222-8222-222222222222');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('suggested-pages-heading').compareDocumentPosition(document.getElementById('interest-posts-heading')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await section.getByRole('button', { name: 'Show more', exact: true }).click();
    await section.getByRole('article', { name: 'Walking routes', exact: true }).waitFor();
    assert.deepEqual(await section.getByRole('article').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))), ['Compost together', 'Walking routes']);
    await section.getByRole('article', { name: 'Walking routes', exact: true }).getByText('Because you chose: Hobbies', { exact: true }).waitFor();
    assert.equal(await section.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
    const calls = await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/me/interest-posts'));
    assert.equal(calls.length, 2);
    assert.equal(new URLSearchParams(calls[0].query).has('cursor'), false);
    assert.equal(new URLSearchParams(calls[1].query).get('cursor'), 'posts-"interests-1"');
    for (const call of calls) { assert.equal(call.headers['x-account-id'], accountId); assert.equal(new URLSearchParams(call.query).get('limit'), '20'); }
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interest posts: no chosen topics or interests offers settings, while signed-out people make no private request', async () => {
  for (const signedOut of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, noPostChoices: true, signedOut });
      const section = page.getByRole('region', { name: 'From your interests', exact: true });
      if (signedOut) {
        assert.equal(await section.count(), 0);
        assert.equal(await page.evaluate(() => window.communityFixture.calls.some(call => ['/api/me/interest-posts', '/api/me/interests', '/api/me/suggested-pages'].includes(call.route))), false);
      } else {
        await section.getByText('Choose topics or interests to see posts here.', { exact: false }).waitFor();
        assert.equal(await section.getByRole('link', { name: 'Choose interests', exact: true }).getAttribute('href'), '/app/settings/interests');
        assert.equal(await section.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => window.communityFixture.calls.some(call => call.route === '/api/me/interest-posts')), false, 'Languages and places alone do not enable post matching.');
      }
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('interest posts: chosen interests without matches show an empty result, not a request to choose again', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false });
    const section = page.getByRole('region', { name: 'From your interests', exact: true });
    await section.getByText('No matching posts yet.', { exact: true }).waitFor();
    assert.equal(await section.getByText('Choose topics or interests to see posts here.', { exact: false }).count(), 0);
    assert.equal(await section.getByRole('article').count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('interest posts: CURSOR_INVALID discards earlier pages and reloads current choices from the start', async () => {
  for (const cleared of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, matchingPosts: true });
      const section = page.getByRole('region', { name: 'From your interests', exact: true });
      await section.getByRole('article', { name: 'Compost together', exact: true }).waitFor();
      await page.evaluate(cleared => {
        const state = window.communityFixture;
        state.interests = { ...state.interests, topics: cleared ? [] : ['education'], interests: [], etag: '"interests-2"' };
        state.interestPosts = cleared ? [] : [{ post: { ...state.interestPosts[1].post, title: 'Learning outdoors', topics: ['education'], interests: [] }, reasons: [{ dimension: 'topic', code: 'education' }] }];
      }, cleared);
      await section.getByRole('button', { name: 'Show more', exact: true }).click();
      if (cleared) await section.getByRole('link', { name: 'Choose interests', exact: true }).waitFor();
      else {
        await section.getByRole('article', { name: 'Learning outdoors', exact: true }).waitFor();
        await section.getByText('Because you chose: Education', { exact: true }).waitFor();
      }
      assert.equal(await section.getByRole('article', { name: 'Compost together', exact: true }).count(), 0);
      assert.equal(await section.getByRole('alert').count(), 0);
      assert.equal(await section.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
      const calls = await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/me/interest-posts'));
      assert.ok(calls.some(call => new URLSearchParams(call.query).get('cursor') === 'posts-"interests-1"'));
      assert.equal(new URLSearchParams(calls.at(-1).query).has('cursor'), false, 'Recovery starts without an old cursor.');
      assert.ok(await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/me/interests').length) >= 2);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('interest posts: failed interests and post loads stay errors and recover with Retry', async () => {
  for (const failedChoices of [false, true]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, matchingPosts: true, interestsFailure: failedChoices, interestPostsFailure: !failedChoices });
      const section = page.getByRole('region', { name: 'From your interests', exact: true });
      await section.getByRole('alert').filter({ hasText: failedChoices ? 'Interests are unavailable.' : 'Interest posts are unavailable.' }).waitFor();
      assert.equal(await section.getByText('No matching posts yet.', { exact: true }).count(), 0);
      assert.equal(await section.getByRole('link', { name: 'Choose interests', exact: true }).count(), 0);
      await page.evaluate(() => { window.communityFixture.interestsFailure = false; window.communityFixture.interestPostsFailure = false; });
      await section.getByRole('button', { name: 'Retry', exact: true }).click();
      await section.getByRole('article', { name: 'Compost together', exact: true }).waitFor();
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('interest posts: reasons, chips and Show more fit desktop and 320px at measured 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, matchingPosts: true });
    const section = page.getByRole('region', { name: 'From your interests', exact: true });
    await section.getByText('Because you chose: Hobbies, Gardening', { exact: true }).waitFor();
    await assertCommunityFits(page);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t129-interest-posts-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    const before = await section.getByText('Because you chose: Hobbies, Gardening', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await doubleCommunityText(page);
    assert.equal(await section.getByText('Because you chose: Hobbies, Gardening', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize)), before * 2);
    await assertCommunityFits(page);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t129-interest-posts-320-large-text.png'), fullPage: true });
    await section.getByRole('button', { name: 'Show more', exact: true }).click();
    await section.getByRole('article', { name: 'Walking routes', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('discover: signed-in suggestions explain every server match and refresh after following', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false });
    const suggestions = page.getByRole('region', { name: 'Suggested for you', exact: true });
    await suggestions.getByRole('link', { name: 'Future Garden', exact: true }).waitFor();
    for (const reason of ['Matched Topic: Hobbies', 'Matched Interest: Gardening', 'Matched Language: English', 'Matched Place: India']) {
      await suggestions.getByText(reason, { exact: true }).waitFor();
    }
    assert.equal(await suggestions.getByRole('link', { name: 'Choose interests', exact: true }).getAttribute('href'), '/app/settings/interests');
    await suggestions.getByRole('button', { name: 'Follow Future Garden', exact: true }).click();
    await suggestions.getByText('No matching pages yet.', { exact: true }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'POST'));
    assert.equal(commands.length, 1); assert.equal(commands[0].headers['x-account-id'], accountId);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('discover: suggestions are never requested signed out, and an empty signed-in list links to interests', async () => {
  for (const signedOut of [true, false]) {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, signedOut, emptySuggestions: true });
      await page.getByRole('link', { name: 'Garden Club', exact: true }).waitFor();
      const suggestions = page.getByRole('region', { name: 'Suggested for you', exact: true });
      if (signedOut) {
        assert.equal(await suggestions.count(), 0);
        assert.equal(await page.evaluate(() => window.communityFixture.calls.some(call => call.route === '/api/me/suggested-pages' || call.route === '/api/me/interests')), false);
      } else {
        await suggestions.getByText('No matching pages yet.', { exact: true }).waitFor();
        assert.equal(await suggestions.getByRole('link', { name: 'Choose interests', exact: true }).getAttribute('href'), '/app/settings/interests');
      }
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('discover: failed suggestions show Retry rather than an empty result', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false, suggestionFailure: true });
    const suggestions = page.getByRole('region', { name: 'Suggested for you', exact: true });
    await suggestions.getByRole('alert').filter({ hasText: 'Suggestions are unavailable.' }).waitFor();
    assert.equal(await suggestions.getByText('No matching pages yet.', { exact: true }).count(), 0);
    await page.evaluate(() => { window.communityFixture.suggestionFailure = false; });
    await suggestions.getByRole('button', { name: 'Retry', exact: true }).click();
    await suggestions.getByRole('link', { name: 'Future Garden', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('discover: collapsible filters send all vocabulary dimensions without changing post search', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false });
    const form = page.getByRole('search');
    assert.equal(await form.getByRole('combobox', { name: 'Interest', exact: true }).isVisible(), false);
    await form.locator('summary').filter({ hasText: 'More filters' }).click();
    await form.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('hobbies');
    const selections = [['Interest', 'gardening'], ['Language', 'en'], ['Place', 'in'], ['Community type', 'club'], ['Audience', 'everyone'], ['Activity', 'sharing-tips'], ['Content kind', 'guides']];
    for (const [name, code] of selections) await form.getByRole('combobox', { name, exact: true }).selectOption(code);
    await form.getByRole('searchbox', { name: 'Search pages', exact: true }).fill('garden');
    await form.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForFunction(() => window.communityFixture.calls.some(call => call.route === '/api/discover/pages' && call.query.includes('interest=gardening')));
    const query = new URLSearchParams(await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/discover/pages').at(-1).query));
    for (const [name, code] of Object.entries({ topic: 'hobbies', interest: 'gardening', language: 'en', place: 'in', community_type: 'club', audience: 'everyone', activity: 'sharing-tips', content_kind: 'guides', q: 'garden' })) assert.equal(query.get(name), code);
    await page.getByRole('button', { name: 'Posts', exact: true }).click();
    await page.getByText('Seeds are in.', { exact: true }).waitFor();
    const posts = new URLSearchParams(await page.evaluate(() => window.communityFixture.calls.filter(call => call.route === '/api/discover/posts').at(-1).query));
    assert.equal(posts.get('q'), 'garden'); assert.equal(posts.has('interest'), false); assert.equal(posts.has('topic'), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('discover: suggestions and expanded filters fit desktop and 320px with all text doubled', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context, { mode: 'discover', manage: false });
    await page.getByText('Matched Interest: Gardening', { exact: true }).waitFor();
    await page.getByRole('search').locator('summary').click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t126-discover-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    const before = await page.getByRole('searchbox', { name: 'Search pages', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.getByRole('searchbox', { name: 'Search pages', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize)), before * 2);
    const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      outside: [...document.querySelectorAll('main input, main select, main button, main section, main form')].filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1);
      }).map(element => element.outerHTML.slice(0, 200)),
    }));
    assert.ok(bounds.scroll <= bounds.width, JSON.stringify(bounds)); assert.deepEqual(bounds.outside, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t126-discover-320-large-text.png'), fullPage: true });
    await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// Another device saves a newer version, then this tab regains focus and refetches every query, as it does when someone switches back to it.
async function changeElsewhereAndRefocus(page, change, shown) {
  await page.evaluate(change);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.getByText(shown, { exact: true }).first().waitFor();
}

async function saves(page) {
  await page.waitForFunction(() => window.communityFixture.calls.some(call => call.method === 'PATCH'));
  return page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'PATCH'));
}

test('page editor saves against the version it opened with, so a newer change is refused instead of overwritten', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page' });
    await editor.waitFor();

    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.page, { description: 'Moved to the library.', etag: '"page-2"' }), 'Moved to the library.');
    await editor.getByRole('combobox', { name: 'Topic' }).selectOption('education');
    await editor.getByRole('button', { name: 'Save page' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"page-1"', 'The save must name the version the editor showed.');
    await editor.getByText('This page changed since you opened the editor. Close it and reload before editing again.').waitFor();
    const stored = await page.evaluate(() => window.communityFixture.page);
    assert.equal(stored.description, 'Moved to the library.', 'The newer description must not be reverted.');
    assert.equal(stored.topic, 'hobbies');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post editor starts from the post shown when Edit is chosen and sends only the field that changed', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.post, { body: 'Seeds arrive on Friday.', edited_at: '2026-09-19T10:30:00Z', etag: '"post-2"' }), 'Seeds arrive on Friday.');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit Spring plants' });
    assert.equal(await editor.getByRole('textbox', { name: 'Text' }).inputValue(), 'Seeds arrive on Friday.', 'The editor must show the current text.');
    await editor.getByRole('textbox', { name: 'Title (optional)' }).fill('Spring planting');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"post-2"');
    assert.deepEqual(sent[0].body, { title: 'Spring planting' });
    await editor.waitFor({ state: 'detached' });
    const stored = await page.evaluate(() => window.communityFixture.post);
    assert.equal(stored.body, 'Seeds arrive on Friday.');
    assert.equal(stored.title, 'Spring planting');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post editor saves against the version it opened with, so a change made while editing is refused', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit Spring plants' });
    await editor.waitFor();

    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.post, { body: 'Seeds arrive on Friday.', edited_at: '2026-09-19T10:30:00Z', etag: '"post-2"' }), 'Seeds arrive on Friday.');
    await editor.getByRole('textbox', { name: 'Title (optional)' }).fill('Spring planting');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"post-1"', 'The save must name the version the editor showed.');
    await page.getByText('This post changed since you opened it. Reload to review the current version.').waitFor();
    const stored = await page.evaluate(() => window.communityFixture.post);
    assert.equal(stored.body, 'Seeds arrive on Friday.', 'The newer text must not be reverted.');
    assert.equal(stored.title, 'Spring plants');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('page rules are saved against the reviewed version and then shown to everyone on the page', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    assert.equal(await page.getByRole('region', { name: 'Rules', exact: true }).count(), 0, 'A page without rules shows no Rules section.');
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page' });
    const rules = editor.getByRole('textbox', { name: 'Rules (optional)' });
    assert.equal(await rules.getAttribute('aria-describedby'), 'page-rules-hint');
    await rules.fill('x'.repeat(2001));
    await editor.getByText('Use up to 2000 characters.', { exact: true }).waitFor();
    assert.equal(await editor.getByRole('button', { name: 'Save page' }).isDisabled(), true);
    await rules.fill('  Be kind.\nNo selling.  ');
    await editor.getByRole('button', { name: 'Save page' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"page-1"');
    assert.deepEqual(sent[0].body, { rules: 'Be kind.\nNo selling.' }, 'Only the changed rules are sent, trimmed.');
    await editor.waitFor({ state: 'detached' });
    const shown = page.getByRole('region', { name: 'Rules', exact: true });
    await shown.getByText('Be kind.\nNo selling.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a pinned post shows once, marked, above the date list, and unpinning returns it there', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    const pinned = page.getByRole('region', { name: 'Pinned', exact: true });
    const posts = page.getByRole('region', { name: 'Posts', exact: true });
    assert.equal(await pinned.count(), 0);
    await posts.getByRole('button', { name: 'Pin to top', exact: true }).click();
    await pinned.getByText('Seeds are in.', { exact: true }).waitFor();
    await pinned.getByRole('article', { name: 'Spring plants', exact: true }).getByText('Pinned', { exact: true }).waitFor();
    await posts.getByText('No other posts.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Seeds are in.', { exact: true }).count(), 1, 'A pinned post is shown once.');

    await changeElsewhereAndRefocus(page, () => { window.communityFixture.page.rules = `Be kind. ${'Share-what-you-grow-'.repeat(12)}`; }, 'Rules');
    await page.evaluate(() => document.fonts.ready);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    // Action rows share one style, so every button and link in them is checked, not only the new ones.
    const shortTargets = () => page.evaluate(() => [...document.querySelectorAll('[class*="actions"] button, [class*="actions"] a')]
      .filter(element => element.getClientRects().length > 0 && element.getBoundingClientRect().height < 44)
      .map(element => element.textContent.trim()));
    assert.equal(await fits(), true, 'rules and the pinned post at 320px');
    assert.deepEqual(await shortTargets(), [], 'action buttons and links are at least 44px tall');
    const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
    assert.equal(await fits(), true, 'rules and the pinned post at 320px and 200% text');
    assert.deepEqual(await shortTargets(), [], 'action buttons and links are at least 44px tall at 200% text');

    await pinned.getByRole('button', { name: 'Unpin', exact: true }).click();
    await pinned.waitFor({ state: 'detached' });
    await posts.getByText('Seeds are in.', { exact: true }).waitFor();
    await page.evaluate(() => { window.communityFixture.pinLimit = true; });
    await posts.getByRole('button', { name: 'Pin to top', exact: true }).click();
    await posts.getByRole('alert').filter({ hasText: 'A page can pin up to 3 posts. Unpin one first.' }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'POST').map(call => [call.route, call.body]));
    assert.deepEqual(commands, [[`/api/posts/${postId}/pin`, {}], [`/api/posts/${postId}/unpin`, {}], [`/api/posts/${postId}/pin`, {}]]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// "Pages you follow" while its list is loading, after loading fails and after Retry. The followed list is held until the test releases it.
test('followed pages show loading and failure instead of claiming the person follows nothing', async () => {
  const context = await browser.newContext();
  try {
    const outbound = [];
    const errors = [];
    await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<html><head><title>Offline pages</title></head><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css });
    await page.evaluate(({ accountId, pageId }) => {
      const created = '2026-09-19T10:00:00Z';
      const followed = {
        id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Weekly meetups in the park.', topic: 'hobbies',
        follower_count: 3, created_at: created, updated_at: created, following: true, blocked: false, can_manage: false, etag: null,
      };
      const state = window.pagesFixture = { calls: [], fail: true, waiting: [] };
      state.release = () => { for (const resume of state.waiting.splice(0)) resume(); };
      const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-pages', ...extra }), { status: 200 });
      window.fetch = async (input, config = {}) => {
        const url = new URL(String(input), 'https://offline.invalid');
        const method = config.method ?? 'GET';
        state.calls.push({ route: url.pathname, method });
        if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
        if (url.pathname === '/api/me/pages' && method === 'GET') return reply([]);
        if (url.pathname === '/api/taxonomy' && method === 'GET') return reply(['community', 'hobbies', 'education'].map(code => ({ dimension: 'topic', code, parent: null, sensitive: false, status: 'active', names: { en: code, te: null, hi: null } })));
        // No invitations, roles or offers to moderate pages (DEC-025); page-roles-ui.test.mjs covers them.
        if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply([]);
        if (url.pathname === '/api/me/handover-offers' && method === 'GET') return reply([]);
        if (url.pathname === '/api/me/following' && method === 'GET') {
          await new Promise(resume => state.waiting.push(resume));
          if (state.fail) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable.' }, request_id: 'offline-pages' }), { status: 503 });
          return reply([followed], { pagination: { next_cursor: null, has_more: false } });
        }
        throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
      };
    }, { accountId, pageId });
    await page.addScriptTag({ content: javascript });
    await page.evaluate(() => window.renderMyPagesFixture());
    const following = page.getByRole('region', { name: 'Pages you follow', exact: true });
    await following.waitFor();
    const empty = following.getByText('You do not follow any pages.', { exact: false });
    await following.getByRole('status').filter({ hasText: 'Loading pages you follow' }).waitFor();
    assert.equal(await empty.count(), 0);
    // The failed load is retried once, as every query is.
    for (let answered = 0; answered < 2; answered++) {
      await page.waitForFunction(count => window.pagesFixture.waiting.length === 1 && window.pagesFixture.calls.filter(call => call.route === '/api/me/following').length === count, answered + 1);
      await page.evaluate(() => window.pagesFixture.release());
    }
    await following.getByRole('alert').filter({ hasText: 'Service is temporarily unavailable.' }).waitFor();
    assert.equal(await empty.count(), 0, 'A failed load must not say the person follows no pages.');
    await page.evaluate(() => { window.pagesFixture.fail = false; });
    await following.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => window.pagesFixture.waiting.length === 1);
    await page.evaluate(() => window.pagesFixture.release());
    await following.getByRole('button', { name: 'Unfollow Garden Club', exact: true }).waitFor();
    assert.equal(await following.getByRole('alert').count(), 0);
    assert.equal(await empty.count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// A radio beside its words ends before them and overlaps their lines; shared label and input styles can instead stack a full-width radio above them.
async function radioPlacement(label) {
  return label.evaluate(element => {
    const radio = element.querySelector('input[type="radio"]').getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents([...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
    const words = range.getBoundingClientRect();
    return { radio: { left: radio.left, right: radio.right, top: radio.top, bottom: radio.bottom }, words: { left: words.left, top: words.top, bottom: words.bottom } };
  });
}

test('report reasons are rows that take the 44 px target, each radio beside its reason, at 320 px and 200% text', async () => {
  for (const large of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    try {
      const { page, outbound, errors } = await fixture(context, { manage: false });
      if (large) await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
      await page.getByRole('article', { name: 'Spring plants', exact: true }).getByRole('button', { name: 'Report', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Report post', exact: true });
      const reasons = await dialog.getByRole('group', { name: 'Why are you reporting this?', exact: true }).locator('label').all();
      assert.ok(reasons.length >= 3);
      for (const reason of reasons) {
        const name = await reason.innerText();
        assert.ok((await reason.boundingBox()).height >= 44, `${name} is at least 44 px tall.`);
        const { radio, words } = await radioPlacement(reason);
        assert.ok(radio.right <= words.left && radio.top < words.bottom && radio.bottom > words.top, `The radio for ${name} sits beside it: ${JSON.stringify({ radio, words })}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
      if (large) await page.screenshot({ path: path.join(root, '.local/screenshots/community-report-320-large-text.png') });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

// Posts of an archived page: the feed holds one active post, one read-only post and one read-only post the viewer liked and saved.
// The server refuses a new like, save and comment on an archived page (409 PAGE_READ_ONLY), but allows undoing a like or save.
const archivedIds = {
  open: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', closed: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a02', kept: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a03',
  mine: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a11', theirs: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a12',
};
async function archivedFixture(context, screen) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline archived posts</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, ids }) => {
    const created = '2026-09-19T10:00:00Z';
    const post = (id, title, extra) => ({
      id, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', title, body: `${title} body.`,
      status: 'published', like_count: 0, comment_count: 0, created_at: created, published_at: created, edited_at: null,
      liked: false, saved: false, can_manage: false, etag: null, page_status: 'read_only', ...extra,
    });
    const comment = (id, mine, body) => ({ id, post_id: ids.closed, parent_id: null, author_name: mine ? 'Alex Morgan' : 'Sam Rivera', body, status: 'visible', created_at: created, mine, can_remove: false });
    const state = window.archivedFixture = {
      calls: [],
      posts: [post(ids.open, 'Open post', { page_status: 'active' }), post(ids.closed, 'Closed post', { comment_count: 2 }),
        post(ids.kept, 'Kept post', { liked: true, saved: true, like_count: 1 })],
      comments: [comment(ids.mine, true, 'My earlier note.'), comment(ids.theirs, false, 'Welcome back.')],
    };
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-archived', ...extra }), { status: 200 });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-archived' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      state.calls.push({ route: url.pathname, method, body: config.body ? JSON.parse(config.body) : null });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/feed' && method === 'GET') return reply(state.posts, { pagination: { next_cursor: null, has_more: false } });
      const found = state.posts.find(item => url.pathname.startsWith(`/api/posts/${item.id}`));
      if (found && url.pathname === `/api/posts/${found.id}` && method === 'GET') return reply(found);
      if (found && url.pathname === `/api/posts/${found.id}/comments` && method === 'GET') {
        return reply(found.id === ids.closed ? state.comments : [], { pagination: { next_cursor: null, has_more: false } });
      }
      if (found && url.pathname === `/api/posts/${found.id}/unlike` && method === 'POST') { found.liked = false; found.like_count -= 1; return reply(found); }
      if (found && method === 'POST') return failed(409, 'PAGE_READ_ONLY', 'This page is archived.');
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, pageId, ids: archivedIds });
  await page.addScriptTag({ content: javascript });
  if (screen === 'feed') {
    await page.evaluate(() => window.renderHomeFixture());
    await page.getByRole('article', { name: 'Kept post', exact: true }).waitFor();
  } else {
    await page.evaluate(id => window.renderPostFixture(id), archivedIds.closed);
    await page.getByText('My earlier note.', { exact: true }).waitFor();
  }
  return { page, outbound, errors };
}

test('on an archived page the feed offers no new Like or Save, keeps undoing them, and marks the post read only', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await archivedFixture(context, 'feed');
    const open = page.getByRole('article', { name: 'Open post', exact: true });
    const closed = page.getByRole('article', { name: 'Closed post', exact: true });
    const kept = page.getByRole('article', { name: 'Kept post', exact: true });
    await open.getByRole('button', { name: /^Like/ }).waitFor();
    await open.getByRole('button', { name: 'Save', exact: true }).waitFor();
    assert.equal(await open.getByText('Archived, read only', { exact: true }).count(), 0, 'An active post has no archive badge.');
    assert.equal(await closed.getByRole('button', { name: /^Like/ }).count(), 0);
    assert.equal(await closed.getByRole('button', { name: 'Save', exact: true }).count(), 0);
    assert.equal(await closed.getByRole('button', { name: 'Saved', exact: true }).count(), 0);
    await closed.getByText('Archived, read only', { exact: true }).waitFor();
    await closed.getByRole('link', { name: /^Comments/ }).waitFor();
    await kept.getByText('Archived, read only', { exact: true }).waitFor();
    assert.equal(await kept.getByRole('button', { name: /^Like/ }).getAttribute('aria-pressed'), 'true');
    assert.equal(await kept.getByRole('button', { name: 'Saved', exact: true }).getAttribute('aria-pressed'), 'true');

    await kept.getByRole('button', { name: /^Like/ }).click();
    await page.waitForFunction(() => window.archivedFixture.calls.some(call => call.method === 'POST'));
    await kept.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.equal(await kept.getByRole('button', { name: /^Like/ }).count(), 0, 'With the like undone, a read-only post offers no new Like.');
    const commands = await page.evaluate(() => window.archivedFixture.calls.filter(call => call.method === 'POST').map(call => [call.route, call.body]));
    assert.deepEqual(commands, [[`/api/posts/${archivedIds.kept}/unlike`, {}]]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

const archivedNotice = 'This page is archived. You can read it, but nothing new can be posted, commented on, liked or followed.';
async function checkArchivedPostScreen(page) {
  await page.getByRole('status').filter({ hasText: archivedNotice }).waitFor();
  await page.getByText('Welcome back.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox').count(), 0, 'No comment form.');
  assert.equal(await page.getByRole('button', { name: 'Post comment', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).count(), 0, 'No Reply button.');
  assert.equal(await page.getByRole('button', { name: 'Delete', exact: true }).count(), 0, 'No Delete, even on the viewer\'s own comment.');
  assert.equal(await page.getByRole('button', { name: 'Remove', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /^Like/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
}

test('the post screen of an archived page shows the notice instead of the comment form, Reply and Delete', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await archivedFixture(context, 'post');
    await checkArchivedPostScreen(page);
    const theirs = page.getByRole('article').filter({ hasText: 'Welcome back.' });
    await theirs.getByRole('button', { name: 'Report', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.archivedFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the archived page notice on the post screen stays readable at 320 px and 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await archivedFixture(context, 'post');
    await page.evaluate(() => document.fonts.ready);
    const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
    await checkArchivedPostScreen(page);
    const notice = page.getByRole('status').filter({ hasText: archivedNotice });
    await notice.scrollIntoViewIfNeeded();
    const box = await notice.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, 'The notice stays inside the 320 px window.');
    assert.equal(await notice.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The notice text is not clipped.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Nothing scrolls sideways.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});