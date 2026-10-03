import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '359bd05a-c95c-4975-b061-d647e82a6958';
const pageId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const postId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const commentId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function communityClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/community/client.ts', fetch, { '@/features/identity/client': identity });
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [], pagination: { next_cursor: null, has_more: false } });
  });
  async function request(method, route, overrides = {}, { session = true } = {}) {
    const headers = {
      ...(session ? { Cookie: 'cp_session=synthetic-session' } : {}), Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, ...overrides,
    };
    for (const [name, value] of Object.entries(headers)) if (value === undefined) delete headers[name];
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const page = (overrides = {}) => ({
  id: pageId, handle: 'river-walkers', name: 'River Walkers', description: 'Walks', topic: 'hobbies', follower_count: 1,
  created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', following: false, blocked: false, can_manage: false, etag: null, ...overrides,
});
const post = (overrides = {}) => ({
  id: postId, page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers', title: 'Saturday walk', body: 'Meet at 7',
  status: 'published', like_count: 0, comment_count: 0, created_at: '2026-09-19T10:00:00Z', published_at: '2026-09-19T10:01:00Z',
  edited_at: null, liked: false, saved: false, can_manage: false, etag: null, ...overrides,
});
const comment = (overrides = {}) => ({
  id: commentId, post_id: postId, parent_id: null, author_name: 'Sam', body: 'Count me in', status: 'visible',
  created_at: '2026-09-19T10:02:00Z', mine: true, can_remove: true, ...overrides,
});

const insights = (overrides = {}) => ({
  page_id: pageId, follower_count: 12, as_of: '2026-10-03T00:30:00.123Z',
  periods: Array.from({ length: 8 }, (_, index) => ({
    start: new Date(Date.parse('2026-10-03T00:30:00.123Z') - (index + 1) * 7 * 86400000).toISOString(),
    end: new Date(Date.parse('2026-10-03T00:30:00.123Z') - index * 7 * 86400000).toISOString(),
    new_followers: index, posts: index + 1, comments: index + 2, likes: index + 3,
  })), ...overrides,
});

test('T132 insights require eight ordered contiguous seven-day periods and nonnegative totals only', () => {
  const client = communityClient();
  assert.equal(client.pageInsightsSchema.safeParse(insights()).success, true);
  const invalid = [
    insights({ periods: insights().periods.slice(0, 7) }),
    insights({ periods: [...insights().periods, insights().periods[7]] }),
    insights({ periods: insights().periods.toReversed() }),
    insights({ as_of: '2026-10-03T00:31:00.123Z' }),
    insights({ page_id: 'not-a-uuid' }), insights({ as_of: 'not-a-date' }),
    insights({ follower_count: -1 }), insights({ follower_count: 1.5 }),
    insights({ follower_ids: [otherId] }),
  ];
  for (const changes of [
    { start: '2026-09-18T00:30:00.123Z' }, { end: '2026-09-26T00:31:00.123Z' },
    { start: insights().periods[1].end }, { start: '2026-10-04T00:30:00.123Z' },
    { start: 'not-a-date' }, { people: [otherId] },
    ...['new_followers', 'posts', 'comments', 'likes'].flatMap(field => [{ [field]: -1 }, { [field]: 0.5 }]),
  ]) {
    const value = insights();
    Object.assign(value.periods[1], changes);
    invalid.push(value);
  }
  const gap = insights();
  gap.periods[1].start = '2026-09-18T00:30:00.123Z';
  gap.periods[1].end = '2026-09-25T00:30:00.123Z';
  invalid.push(gap);
  for (const value of invalid) assert.equal(client.pageInsightsSchema.safeParse(value).success, false, JSON.stringify(value));
});

test('T132 pageInsights binds the account and page, passes cancellation and refuses malformed responses', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: insights() }); });
  const signal = new AbortController().signal;
  assert.deepEqual(JSON.parse(JSON.stringify(await client.pageInsights(accountId, pageId, signal))), insights());
  assert.equal(calls[0].url, `/api/pages/${pageId}/insights`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.cache, 'no-store');
  for (const data of [insights({ page_id: otherId }), insights({ periods: insights().periods.slice(0, 7) }), insights({ follower_count: -1 })]) {
    await assert.rejects(communityClient(async () => Response.json({ data })).pageInsights(accountId, pageId), { status: 502, code: 'INVALID_RESPONSE' });
  }
  await assert.rejects(communityClient().pageInsights(accountId, '../other'), { status: 422 });
});

test('T132 insights preserve missing-page, owner-only, session and service errors', async () => {
  for (const [status, code] of [[403, 'PAGE_MANAGER_REQUIRED'], [404, 'NOT_FOUND'], [401, 'AUTHENTICATION_REQUIRED'], [503, 'UNAVAILABLE']]) {
    const client = communityClient(async () => Response.json({ error: { code, message: 'Unavailable.', details: {} } }, { status }));
    await assert.rejects(client.pageInsights(accountId, pageId), { status, code });
  }
});

test('T132 BFF insights allow only an account-bound GET without query parameters', async () => {
  const route = `pages/${pageId}/insights`;
  const proxy = bff();
  const response = await proxy.request('GET', route);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(proxy.calls.length, 2);
  assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
  assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(proxy.calls[1].options.cache, 'no-store');
  assert.equal((await bff().request('GET', route, {}, { session: false })).status, 401);
  for (const expectedAccount of [otherId, undefined]) {
    const changed = bff();
    assert.equal((await changed.request('GET', route, { 'X-Account-ID': expectedAccount })).status, 409);
    assert.equal(changed.calls.some(call => !call.url.endsWith('/v1/me')), false);
  }
  const foreign = bff();
  assert.equal((await foreign.request('GET', route, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
  for (const query of ['q=walk', 'limit=8', 'cursor=next', `account_id=${otherId}`, 'timezone=UTC', 'x=1&x=2']) {
    const queried = bff();
    assert.equal((await queried.request('GET', `${route}?${query}`)).status, 400);
    assert.equal(queried.calls.some(call => !call.url.endsWith('/v1/me')), false);
  }
  for (const [method, path] of [
    ['POST', route], ['PUT', route], ['PATCH', route], ['DELETE', route],
    ['GET', 'pages/river-walkers/insights'], ['GET', 'pages/------------------------------------/insights'],
    ['GET', `${route}/people`],
  ]) {
    const denied = bff();
    assert.equal((await denied.request(method, path)).status, 404, `${method} ${path}`);
    assert.equal(denied.calls.length, 0);
  }
});

const feedControl = (overrides = {}) => ({
  id: key, kind: 'mute_page', page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers',
  post_id: null, post_title: null, post_available: null, dimension: null, code: null,
  created_at: '2026-10-03T10:00:00Z', ...overrides,
});

test('T136 feed control schemas validate each target and preserve unavailable targets', () => {
  const client = communityClient();
  const hidden = feedControl({ kind: 'hide_post', post_id: postId, post_title: 'Saturday walk', post_available: true });
  const mutedTerm = feedControl({ kind: 'mute_term', page_id: null, page_name: null, page_handle: null, dimension: 'topic', code: 'hobbies' });
  for (const value of [feedControl(), feedControl({ kind: 'hide_suggestion' }), mutedTerm,
    { ...mutedTerm, dimension: 'interest', code: 'gardening' }, hidden, { ...hidden, post_title: null },
    { ...hidden, post_available: false, post_title: null },
    { ...hidden, post_id: null, page_id: null, page_handle: null, page_name: null, post_title: null, post_available: false },
    feedControl({ page_id: null, page_handle: null, page_name: null }),
  ]) assert.equal(client.feedControlSchema.safeParse(value).success, true, JSON.stringify(value));
  for (const value of [feedControl({ kind: 'unknown' }), feedControl({ post_id: postId }), feedControl({ post_available: false }),
    feedControl({ dimension: 'topic', code: 'hobbies' }), feedControl({ page_handle: null }), feedControl({ page_id: null }),
    { ...mutedTerm, dimension: null }, { ...mutedTerm, dimension: 'place' }, { ...mutedTerm, code: 'Bad Code' },
    { ...mutedTerm, post_id: postId }, { ...mutedTerm, page_id: pageId },
    { ...hidden, post_available: null }, { ...hidden, post_available: false }, { ...hidden, post_id: null },
    { ...hidden, page_id: null }, feedControl({ id: '../other' }),
  ]) assert.equal(client.feedControlSchema.safeParse(value).success, false, JSON.stringify(value));
  assert.equal(client.feedControlsSchema.safeParse([feedControl(), feedControl()]).success, false);
});

test('T136 feed controls read an account-bound list and reject invalid answers', async () => {
  const calls = [];
  const controls = [feedControl(), feedControl({ id: otherId, kind: 'hide_suggestion', created_at: '2026-10-02T10:00:00Z' })];
  const client = communityClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: controls }); });
  const signal = new AbortController().signal;
  assert.deepEqual(JSON.parse(JSON.stringify(await client.feedControls(accountId, signal))), controls);
  assert.equal(calls[0].url, '/api/me/feed-controls');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.signal, signal);
  for (const data of [[feedControl(), feedControl()], [feedControl({ kind: 'hide_post' })], {}]) {
    await assert.rejects(communityClient(async () => Response.json({ data })).feedControls(accountId), { status: 502 });
  }
});

test('T136 adding a feed control sends only its target and confirms the returned target', async () => {
  const cases = [
    [{ kind: 'mute_page', page_id: pageId }, feedControl()],
    [{ kind: 'hide_suggestion', page_id: pageId }, feedControl({ kind: 'hide_suggestion' })],
    [{ kind: 'hide_post', post_id: postId }, feedControl({ kind: 'hide_post', post_id: postId, post_available: true })],
    [{ kind: 'mute_term', dimension: 'topic', code: 'hobbies' }, feedControl({ kind: 'mute_term', page_id: null, page_handle: null, page_name: null, dimension: 'topic', code: 'hobbies' })],
    [{ kind: 'mute_term', dimension: 'interest', code: 'gardening' }, feedControl({ kind: 'mute_term', page_id: null, page_handle: null, page_name: null, dimension: 'interest', code: 'gardening' })],
  ];
  for (const [input, answer] of cases) {
    const calls = [];
    const client = communityClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: answer }, { status: 201 }); });
    assert.equal((await client.addFeedControl(accountId, input)).id, key);
    assert.equal((await client.addFeedControl(accountId, input)).id, key);
    assert.equal(calls[0].url, '/api/me/feed-controls');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
    assert.deepEqual(JSON.parse(calls[0].options.body), input);
    assert.equal(calls[1].options.body, calls[0].options.body);
    const wrongTarget = 'page_id' in input ? { ...answer, page_id: otherId }
      : 'post_id' in input ? { ...answer, post_id: otherId } : { ...answer, code: 'other' };
    await assert.rejects(communityClient(async () => Response.json({ data: wrongTarget })).addFeedControl(accountId, input), { status: 502 });
  }
  const client = communityClient();
  for (const input of [{ kind: 'mute_page' }, { kind: 'hide_post', page_id: pageId },
    { kind: 'mute_page', page_id: pageId, post_id: postId }, { kind: 'hide_suggestion', page_id: 'bad' },
    { kind: 'mute_term', dimension: 'place', code: 'in' }, { kind: 'mute_term', dimension: 'topic', code: '' },
    { kind: 'mute_term', dimension: 'topic', code: 'hobbies', account_id: otherId },
  ]) await assert.rejects(client.addFeedControl(accountId, input), { status: 422 });
});

test('T136 Undo sends an empty body, confirms its id and treats 404 as already removed', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url, options }); return Response.json({ data: { id: key, status: 'removed' } });
  });
  assert.equal((await client.removeFeedControl(accountId, key)).status, 'removed');
  assert.equal(calls[0].url, `/api/me/feed-controls/${key}/remove`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
  const missing = communityClient(async () => Response.json({ error: { code: 'NOT_FOUND', message: 'Not found.', details: {} } }, { status: 404 }));
  assert.deepEqual({ ...await missing.removeFeedControl(accountId, key) }, { id: key, status: 'removed' });
  for (const data of [{ id: otherId, status: 'removed' }, { id: key, status: 'active' }]) {
    await assert.rejects(communityClient(async () => Response.json({ data })).removeFeedControl(accountId, key), { status: 502 });
  }
  await assert.rejects(communityClient().removeFeedControl(accountId, '../other'), { status: 422 });
});

test('T136 feed control errors remain errors except for an already removed control', async () => {
  for (const [status, code] of [[409, 'OWN_CONTENT'], [404, 'NOT_FOUND'], [422, 'TERM_UNAVAILABLE'],
    [422, 'VALIDATION_ERROR'], [409, 'FEED_CONTROL_LIMIT_REACHED'], [401, 'AUTHENTICATION_REQUIRED'], [503, 'UNAVAILABLE']]) {
    const client = communityClient(async () => Response.json({ error: { code, message: 'Not saved.', details: {} } }, { status }));
    await assert.rejects(client.addFeedControl(accountId, { kind: 'mute_page', page_id: pageId }), { status, code });
    await assert.rejects(client.feedControls(accountId), { status, code });
    if (status !== 404) await assert.rejects(client.removeFeedControl(accountId, key), { status, code });
  }
});

test('T136 BFF allows only account-bound feed control routes, with Origin checks and no query parameters', async () => {
  for (const [method, route] of [['GET', 'me/feed-controls'], ['POST', 'me/feed-controls'], ['POST', `me/feed-controls/${key}/remove`]]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    assert.equal(proxy.calls.length, 2);
    assert.equal(proxy.calls[1].url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
    if (method === 'POST') assert.deepEqual(JSON.parse(proxy.calls[1].options.body), {});
    assert.equal((await bff().request(method, route, {}, { session: false })).status, 401);
    assert.equal((await bff().request(method, route, { 'X-Account-ID': otherId })).status, 409);
    assert.equal((await bff().request(method, route, { 'X-Account-ID': undefined })).status, 409);
    assert.equal((await bff().request(method, route, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    if (method === 'POST') for (const Origin of ['https://foreign.example', undefined]) {
      const foreign = bff();
      assert.equal((await foreign.request(method, route, { Origin })).status, 403);
      assert.equal(foreign.calls.length, 0);
    }
    for (const query of ['q=walk', 'limit=20', 'cursor=next', `account_id=${otherId}`, 'x=1&x=2']) {
      const queried = bff();
      assert.equal((await queried.request(method, `${route}?${query}`)).status, 400);
      assert.equal(queried.calls.some(call => !call.url.endsWith('/v1/me')), false);
    }
  }
  for (const [method, route] of [['PUT', 'me/feed-controls'], ['PATCH', 'me/feed-controls'], ['DELETE', 'me/feed-controls'],
    ['GET', `me/feed-controls/${key}`], ['POST', `me/feed-controls/${key}`], ['DELETE', `me/feed-controls/${key}`],
    ['GET', `me/feed-controls/${key}/remove`], ['POST', 'me/feed-controls/not-a-uuid/remove'],
    ['POST', 'me/feed-controls/------------------------------------/remove'], ['POST', `me/feed-controls/${key}/reset`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Community BFF allows the reviewed writes and refuses unknown routes or command queries', async () => {
  for (const [method, route] of [
    ['POST', 'pages'], ['PATCH', `pages/${pageId}`], ['POST', `pages/${pageId}/follow`], ['POST', `pages/${pageId}/unfollow`],
    ['POST', `pages/${pageId}/posts`], ['PATCH', `posts/${postId}`], ['POST', `posts/${postId}/publish`], ['POST', `posts/${postId}/delete`],
    ['POST', `posts/${postId}/like`], ['POST', `posts/${postId}/save`], ['POST', `posts/${postId}/comments`], ['POST', `comments/${commentId}/delete`],
    ['POST', 'reports'], ['POST', 'blocks'], ['POST', `blocks/${commentId}/remove`], ['GET', 'feed'], ['GET', 'me/pages'], ['GET', 'me/blocks'],
    ['GET', `pages/${pageId}/drafts`], ['GET', 'me/saved-posts'], ['GET', 'me/following'],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    assert.equal(proxy.calls.at(-1).url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['DELETE', `posts/${postId}`], ['POST', `posts/${postId}`], ['GET', 'reports'], ['POST', `pages/${pageId}/drafts`],
    ['PATCH', 'pages/river-walkers'], ['POST', 'comments'], ['GET', `blocks/${commentId}/remove`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  const command = bff();
  assert.equal((await command.request('POST', `posts/${postId}/like?as=${otherId}`)).status, 400);
  assert.equal(command.calls.length, 0);
  const foreign = bff();
  assert.equal((await foreign.request('POST', 'pages', { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
  assert.equal((await bff().request('POST', 'pages', {}, { session: false })).status, 401);
});

test('Public reads work signed out without forwarding a session and bind the session only with the account header', async () => {
  const anonymous = bff();
  assert.equal((await anonymous.request('GET', 'pages/river-walkers', { 'X-Account-ID': undefined }, { session: false })).status, 200);
  assert.equal(anonymous.calls.length, 1);
  assert.equal(anonymous.calls[0].options.headers.Authorization, undefined);
  const unbound = bff();
  assert.equal((await unbound.request('GET', `posts/${postId}/comments?limit=50`, { 'X-Account-ID': undefined })).status, 200);
  assert.equal(unbound.calls.length, 1);
  assert.equal(unbound.calls[0].options.headers.Authorization, undefined);
  const bound = bff();
  assert.equal((await bound.request('GET', 'discover/pages?q=walk&topic=hobbies&limit=5')).status, 200);
  assert.equal(bound.calls.length, 2);
  assert.equal(bound.calls[1].options.headers.Authorization, 'Bearer synthetic-session');
  const upstream = new URL(bound.calls[1].url);
  assert.equal(upstream.searchParams.get('q'), 'walk');
  assert.equal(upstream.searchParams.get('topic'), 'hobbies');
  for (const route of ['discover/pages?owner=1', 'discover/posts?topic=hobbies', `posts/${postId}?limit=1`, 'feed?q=1', 'pages/river-walkers/posts?q=1', 'me/saved-posts?q=1']) {
    assert.equal((await bff().request('GET', route)).status, 400, route);
  }
  const search = bff();
  assert.equal((await search.request('GET', 'discover/posts?q=river%20walk&limit=5', { 'X-Account-ID': undefined }, { session: false })).status, 200);
  assert.equal(search.calls.length, 1);
  assert.equal(new URL(search.calls[0].url).searchParams.get('q'), 'river walk');
  assert.equal((await bff().request('GET', 'feed', {}, { session: false })).status, 401);
  const switched = bff();
  assert.equal((await switched.request('GET', 'pages/river-walkers', { 'X-Account-ID': otherId })).status, 409);
});

test('Schemas reject public facts that contradict each other', () => {
  const client = communityClient();
  assert.equal(client.pageSchema.safeParse(page()).success, true);
  assert.equal(client.postSchema.safeParse(post()).success, true);
  assert.equal(client.commentSchema.safeParse(comment()).success, true);
  for (const changes of [{ can_manage: true }, { etag: '"x"' }, { following: true, blocked: true }, { topic: 'Gossip!' }, { handle: 'Bad Handle' }]) {
    assert.equal(client.pageSchema.safeParse(page(changes)).success, false, JSON.stringify(changes));
  }
  for (const changes of [{ status: 'draft' }, { published_at: null }, { status: 'draft', published_at: null }, { etag: '"x"' }, { like_count: -1 }]) {
    assert.equal(client.postSchema.safeParse(post(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.postSchema.safeParse(post({ status: 'draft', published_at: null, can_manage: true, etag: '"d1"' })).success, true);
  for (const changes of [{ body: null }, { status: 'deleted' }, { status: 'removed', body: null, can_remove: true }, { parent_id: commentId }]) {
    assert.equal(client.commentSchema.safeParse(comment(changes)).success, false, JSON.stringify(changes));
  }
});

test('T135 page limits and post flags parse with backwards-compatible defaults', () => {
  const client = communityClient();
  assert.equal(client.pageSchema.parse(page()).limited, false);
  assert.equal(client.pageSchema.parse(page()).limit, undefined);
  assert.equal(client.postSchema.parse(post()).page_limited, false);
  for (const limited of [false, true]) {
    assert.equal(client.pageSchema.parse(page({ limited })).limited, limited);
    assert.equal(client.postSchema.parse(post({ page_limited: limited })).page_limited, limited);
  }
  const owner = page({ can_manage: true, etag: '"p1"', limited: true, limit: { reason: 'spam' } });
  assert.equal(client.pageSchema.parse(owner).limit.reason, 'spam');
  assert.equal(client.pageSchema.parse(page({ can_manage: true, etag: '"p1"', moderation: { hidden: true, reason: 'spam' } })).moderation.hidden, true);
  for (const invalid of [null, 'true', 1]) {
    assert.equal(client.pageSchema.safeParse(page({ limited: invalid })).success, false);
    assert.equal(client.postSchema.safeParse(post({ page_limited: invalid })).success, false);
  }
  for (const limit of [null, {}, { reason: 'unknown' }]) {
    assert.equal(client.pageSchema.safeParse({ ...owner, limit }).success, false);
  }
});

test('T135 moderation decisions, notices and reports accept limit and restore but refuse unknown actions', async () => {
  const client = communityClient();
  const notice = {
    id: key, target_type: 'page', target_id: pageId, reason: 'spam',
    decided_at: '2026-10-03T10:00:00Z', appeal_status: null, appeal_of: null,
  };
  const report = {
    id: key, target_type: 'page', target_id: pageId, reason: 'spam', status: 'reviewed',
    outcome: 'action_taken', created_at: '2026-10-03T09:00:00Z', reviewed_at: '2026-10-03T10:00:00Z',
  };
  for (const action of ['no_action', 'hide', 'limit', 'restore']) {
    assert.equal(client.moderationDecisionSchema.parse({ ...notice, action, note: '', decided_by: accountId }).action, action);
    assert.equal(client.moderationNoticeSchema.parse({ ...notice, action }).action, action);
    assert.equal(client.myReportSchema.parse({ ...report, action }).action, action);
  }
  for (const [schema, value] of [
    [client.moderationDecisionSchema, { ...notice, note: '', decided_by: accountId }],
    [client.moderationNoticeSchema, notice], [client.myReportSchema, report],
  ]) assert.equal(schema.safeParse({ ...value, action: 'unknown' }).success, false);
  const restored = { ...notice, id: otherId, action: 'restore', appeal_of: key };
  assert.equal(client.moderationNoticeSchema.parse(restored).appeal_of, key);
  const reader = communityClient(async url => Response.json({ data: url === '/api/me/reports'
    ? [{ ...report, action: 'limit' }] : [{ ...notice, action: 'limit' }, restored] }));
  assert.equal((await reader.moderationNotices(accountId))[0].action, 'limit');
  assert.equal((await reader.myReports(accountId))[0].action, 'limit');
  assert.equal(client.moderationActionLabels.limit, 'Limited');
});

test('T135 limit decisions are page-only before sending and preserve the reviewed intent', async () => {
  const calls = [];
  const body = { target_type: 'page', target_id: pageId, action: 'limit', reason: 'spam', note: 'Pause new content.' };
  const client = communityClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { ...body, id: key, decided_by: accountId, decided_at: '2026-10-03T10:00:00Z', appeal_of: null } });
  });
  for (const target_type of ['post', 'comment']) {
    await assert.rejects(client.recordModerationDecision({ accountId, key, body: { ...body, target_type } }), { status: 422, code: 'VALIDATION_ERROR' });
  }
  assert.equal(calls.length, 0);
  assert.equal((await client.recordModerationDecision({ accountId, key, body })).action, 'limit');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/moderation/decisions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
});

test('T129 post terms default to empty and preserve bounded unique code lists in owner order', () => {
  const client = communityClient();
  const legacy = client.postSchema.parse(post());
  assert.deepEqual([...legacy.topics], []);
  assert.deepEqual([...legacy.interests], []);
  for (const [field, maximum] of Object.entries(client.POST_TERM_LIMITS)) {
    const codes = Array.from({ length: maximum }, (_, index) => `term-${maximum - index}`);
    assert.deepEqual([...client.postSchema.parse(post({ [field]: codes }))[field]], codes);
    for (const invalid of [null, ['same', 'same'], [...codes, 'extra'], [''], ['Gossip!'], ['two--words'], ['x'.repeat(65)]]) {
      assert.equal(client.postSchema.safeParse(post({ [field]: invalid })).success, false, `${field}: ${JSON.stringify(invalid)}`);
    }
  }
});

test('T126 vocabulary codes replace the fixed topic enum without accepting malformed classification', () => {
  const client = communityClient();
  for (const topic of ['technology', 'arts-culture', 'gossip']) {
    assert.equal(client.pageSchema.safeParse(page({ topic })).success, true, 'The server decides whether a well-formed code is available.');
  }
  for (const topic of ['', 'Gossip!', '-topic', 'topic-', 'two--words', 'two words', 'x'.repeat(65)]) {
    assert.equal(client.pageSchema.safeParse(page({ topic })).success, false, topic);
  }
  const classification = client.pageSchema.parse(page()).classification;
  assert.deepEqual(JSON.parse(JSON.stringify(classification)), {
    other_topics: [], interests: [], languages: [], places: [], community_types: [], audiences: [], activities: [], content_kinds: [],
  });
  for (const [field, maximum] of Object.entries(client.CLASSIFICATION_LIMITS)) {
    const codes = Array.from({ length: maximum }, (_, index) => `term-${index}`);
    assert.equal(client.pageSchema.safeParse(page({ classification: { [field]: codes } })).success, true, field);
    for (const values of [[...codes, 'extra'], ['Gossip!'], null, ['same', 'same']]) {
      assert.equal(client.pageSchema.safeParse(page({ classification: { [field]: values } })).success, false, field);
    }
  }
  assert.equal(client.pageSchema.safeParse(page({ classification: null })).success, false);
});

const term = (dimension, code, overrides = {}) => ({
  dimension, code, parent: null, sensitive: false, status: 'active', names: { en: code, te: null, hi: null }, ...overrides,
});
const choices = { topics: ['hobbies'], interests: ['gardening'], languages: ['te'], places: ['in'] };

test('Taxonomy reads are public, cached only after validation, refreshable, and names fall back to English', async () => {
  const calls = [];
  const terms = [term('topic', 'hobbies', { names: { en: 'Hobbies', te: '\u0c05\u0c2d\u0c3f\u0c30\u0c41\u0c1a\u0c41\u0c32\u0c41', hi: null } }), term('interest', 'gardening', { parent: 'hobbies', status: 'retired' })];
  const client = communityClient(async (url, options) => { calls.push({ url, options }); return Response.json({ data: terms }); });
  const first = await client.readTaxonomy();
  assert.equal(await client.readTaxonomy(), first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/taxonomy');
  assert.equal(calls[0].options.headers['X-Account-ID'], undefined);
  await client.readTaxonomy(undefined, true);
  assert.equal(calls.length, 2);
  assert.equal(client.termName(first[0], 'hi'), 'Hobbies');
  assert.equal(client.termName(first[0], 'te'), terms[0].names.te);
  assert.equal(client.termLabel(first, 'interest', 'gardening', 'en'), 'gardening');
  assert.equal(client.termLabel(first, 'topic', 'future-topic', 'en'), 'future-topic');
  for (const invalid of [[terms[0], terms[0]], [term('unknown', 'hobbies')], [term('topic', 'Gossip!')], [term('topic', 'hobbies', { status: 'hidden' })], [term('topic', 'hobbies', { names: { te: null, hi: null } })]]) {
    assert.equal(client.taxonomySchema.safeParse(invalid).success, false);
  }
  let attempts = 0;
  const recovering = communityClient(async () => Response.json({ data: ++attempts === 1 ? [term('bad', 'code')] : terms }));
  await assert.rejects(recovering.readTaxonomy(), { status: 502 });
  assert.equal((await recovering.readTaxonomy()).length, 2);
  assert.equal(attempts, 2, 'Invalid answers must not be cached.');
});

test('Classification writes preserve omitted lists, empty replacements and the reviewed page version', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: page({ can_manage: true, etag: '"v2"', classification: { interests: ['gardening'] } }) });
  });
  const classification = { interests: ['gardening'], languages: [] };
  await client.createPage({ accountId, key, body: { handle: 'river-walkers', name: 'River Walkers', description: '', topic: 'hobbies', classification } });
  const changes = { classification };
  await client.updatePage(accountId, client.pageSchema.parse(page({ can_manage: true, etag: '"v1"' })), changes);
  assert.deepEqual(JSON.parse(calls[0].options.body).classification, classification);
  assert.deepEqual(JSON.parse(calls[1].options.body), changes);
  assert.equal(calls[1].options.headers['If-Match'], '"v1"');
  assert.equal(Object.hasOwn(JSON.parse(calls[1].options.body).classification, 'places'), false);
});

test('Interests require all four bounded lists, keep the reviewed If-Match, and confirm the saved choices', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { ...(options.method === 'PUT' ? JSON.parse(options.body) : choices), etag: '"interests-2"' } });
  });
  const current = await client.readInterests(accountId);
  await client.saveInterests(accountId, current, { ...choices, places: [] });
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['If-Match'], '"interests-2"');
  assert.deepEqual(JSON.parse(calls[1].options.body), { ...choices, places: [] });
  assert.equal(client.interestsSchema.safeParse({ ...choices }).success, false);
  for (const [field, maximum] of Object.entries(client.INTEREST_LIMITS)) {
    const full = { ...choices, [field]: Array.from({ length: maximum }, (_, index) => `term-${index}`) };
    assert.equal(client.interestsInputSchema.safeParse(full).success, true);
    for (const invalid of [null, ['same', 'same'], [...full[field], 'extra'], ['Gossip!']]) {
      await assert.rejects(client.saveInterests(accountId, current, { ...choices, [field]: invalid }), { status: 422 });
    }
    const incomplete = { ...choices }; delete incomplete[field];
    await assert.rejects(client.saveInterests(accountId, current, incomplete), { status: 422 });
  }
  assert.equal(calls.length, 2, 'Invalid input is never sent.');
  const wrong = communityClient(async () => Response.json({ data: { ...choices, places: [], etag: '"interests-3"' } }));
  await assert.rejects(wrong.saveInterests(accountId, current, choices), { status: 502 });
});

test('Interest failures preserve 428, 412 and string TERM_UNAVAILABLE details without treating them as success', async () => {
  for (const [status, code, details] of [
    [428, 'PRECONDITION_REQUIRED', {}], [412, 'CONTENT_CHANGED', {}],
    [422, 'TERM_UNAVAILABLE', { field: 'interests', codes: 'gardening' }],
  ]) {
    const client = communityClient(async () => Response.json({ error: { code, message: 'Not saved.', details } }, { status }));
    await assert.rejects(client.saveInterests(accountId, { etag: '"old"' }, choices), error => {
      assert.equal(error.status, status); assert.equal(error.code, code);
      assert.deepEqual({ ...error.details }, details);
      return true;
    });
  }
});

test('Discover sends each vocabulary filter and accepts a matching other topic or containing place', async () => {
  let sent;
  const filters = { topic: 'education', interest: 'gardening', language: 'te', place: 'in', community_type: 'club', audience: 'everyone', activity: 'sharing-tips', content_kind: 'guides' };
  const client = communityClient(async url => {
    sent = new URL(String(url), origin);
    return Response.json({ data: [page({ classification: { other_topics: ['education'], places: ['hyderabad'] } })], pagination: { next_cursor: null, has_more: false } });
  });
  assert.equal((await client.discoverPages(accountId, '  river  walk ', filters, 'next')).items.length, 1);
  for (const [name, code] of Object.entries(filters)) assert.equal(sent.searchParams.get(name), code);
  assert.equal(sent.searchParams.get('q'), 'river walk');
  assert.equal(sent.searchParams.get('cursor'), 'next');
  await assert.rejects(client.discoverPages(accountId, '', { interest: 'Gossip!' }), { status: 422 });
});

test('Suggestions validate ranking, matches, unique visible pages and the requested limit', async () => {
  const suggestion = { page: page(), reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'place', code: 'in' }] };
  let sent;
  const client = communityClient(async (url, options) => {
    sent = { url, options };
    return Response.json({ data: { ranking: 'interests-1', items: [suggestion] } });
  });
  assert.equal((await client.suggestedPages(accountId, 1)).items.length, 1);
  assert.equal(sent.url, '/api/me/suggested-pages?limit=1');
  assert.equal(sent.options.headers['X-Account-ID'], accountId);
  for (const limit of [0, 21, 1.5]) await assert.rejects(client.suggestedPages(accountId, limit), { status: 422 });
  for (const data of [
    { ranking: 'other', items: [suggestion] },
    { ranking: 'interests-1', items: [suggestion, suggestion] },
    { ranking: 'interests-1', items: [{ ...suggestion, reasons: [] }] },
    { ranking: 'interests-1', items: [{ ...suggestion, reasons: [{ dimension: 'activity', code: 'sharing-tips' }] }] },
    { ranking: 'interests-1', items: [{ ...suggestion, page: page({ blocked: true }) }] },
    { ranking: 'interests-1', items: [{ ...suggestion, page: page({ status: 'deleted' }) }] },
  ]) await assert.rejects(communityClient(async () => Response.json({ data })).suggestedPages(accountId), { status: 502 });
});

test('T129 interest posts require published unique posts, strict non-empty unique reasons and valid pagination', async () => {
  const item = { post: post({ topics: ['hobbies'], interests: ['gardening'] }), reasons: [{ dimension: 'topic', code: 'hobbies' }, { dimension: 'interest', code: 'gardening' }] };
  const pagination = { next_cursor: 'next-page', has_more: true };
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: [item], pagination });
  });
  const signal = new AbortController().signal;
  const result = await client.interestPosts(accountId, 'previous+cursor', signal);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { items: [client.postSchema.parse(item.post)].map(post => ({ post, reasons: item.reasons })), next: 'next-page' });
  const sent = new URL(calls[0].url, origin);
  assert.equal(sent.pathname, '/api/me/interest-posts');
  assert.equal(sent.searchParams.get('limit'), '20');
  assert.equal(sent.searchParams.get('cursor'), 'previous+cursor');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.signal, signal);
  for (const data of [
    [item, item],
    [{ ...item, reasons: [] }],
    [{ ...item, reasons: [item.reasons[0], item.reasons[0]] }],
    [{ ...item, reasons: [{ dimension: 'language', code: 'te' }] }],
    [{ ...item, reasons: [{ dimension: 'topic', code: 'Gossip!' }] }],
    [{ ...item, reasons: [{ ...item.reasons[0], score: 1 }] }],
    [{ ...item, score: 1 }],
    [{ ...item, post: post({ status: 'draft', published_at: null, can_manage: true, etag: '"d1"' }) }],
    [{ ...item, post: post({ topics: null }) }],
    Array.from({ length: 21 }, (_, index) => ({ ...item, post: post({ id: `5f0c8a0e-9f67-4c55-8a29-${String(index).padStart(12, '0')}` }) })),
  ]) await assert.rejects(communityClient(async () => Response.json({ data, pagination })).interestPosts(accountId), { status: 502 });
  for (const invalid of [undefined, { next_cursor: 'previous', has_more: true }, { next_cursor: null, has_more: true }, { next_cursor: '', has_more: false }]) {
    await assert.rejects(communityClient(async () => Response.json({ data: [item], pagination: invalid })).interestPosts(accountId, 'previous'), { status: 502 });
  }
  await assert.rejects(communityClient(async () => Response.json({ data: [], pagination })).interestPosts(accountId), { status: 502 });
  const empty = await communityClient(async () => Response.json({ data: [], pagination: { next_cursor: null, has_more: false } })).interestPosts(accountId);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.next, null);
  await assert.rejects(communityClient(async () => Response.json({ error: { code: 'CURSOR_INVALID', message: 'Reload this list.' } }, { status: 400 })).interestPosts(accountId, 'old'), { status: 400, code: 'CURSOR_INVALID' });
});

test('T129 post writes carry ordered topics and interests, explicit empty replacements and the reviewed version', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: post({ can_manage: true, etag: '"v2"', ...JSON.parse(options.body) }) });
  });
  const body = { title: null, body: 'Garden plans', topics: ['local', 'hobbies'], interests: ['composting', 'gardening'] };
  await client.createPost({ accountId, key, pageId, body });
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  const reviewed = client.postSchema.parse(post({ can_manage: true, etag: '"v1"' }));
  await client.updatePost(accountId, reviewed, { topics: ['hobbies'], interests: [] });
  assert.deepEqual(JSON.parse(calls[1].options.body), { topics: ['hobbies'], interests: [] });
  assert.equal(calls[1].options.headers['If-Match'], '"v1"');
  await client.updatePost(accountId, reviewed, { topics: [] });
  assert.deepEqual(JSON.parse(calls[2].options.body), { topics: [] });
  assert.equal(Object.hasOwn(JSON.parse(calls[2].options.body), 'interests'), false);
  const rejected = communityClient(async () => Response.json({ error: { code: 'TERM_UNAVAILABLE', message: 'Choose another term.', details: { field: 'topics', codes: 'hobbies' } } }, { status: 422 }));
  await assert.rejects(rejected.updatePost(accountId, reviewed, { topics: ['hobbies'] }), error => {
    assert.equal(error.code, 'TERM_UNAVAILABLE');
    assert.deepEqual({ ...error.details }, { field: 'topics', codes: 'hobbies' });
    return true;
  });
});

test('T129 BFF binds interest-post reads to the account and allows only limit and cursor once each', async () => {
  const proxy = bff();
  assert.equal((await proxy.request('GET', 'me/interest-posts?limit=50&cursor=next%2Bpage')).status, 200);
  assert.equal(proxy.calls.at(-1).url, 'https://backend.example.test/v1/me/interest-posts?limit=50&cursor=next%2Bpage');
  assert.equal(proxy.calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(proxy.calls.at(-1).options.cache, 'no-store');
  assert.equal((await bff().request('GET', 'me/interest-posts', {}, { session: false })).status, 401);
  assert.equal((await bff().request('GET', 'me/interest-posts', { 'X-Account-ID': undefined })).status, 409);
  assert.equal((await bff().request('GET', 'me/interest-posts', { 'X-Account-ID': otherId })).status, 409);
  for (const query of ['q=walk', 'topic=hobbies', 'account_id=other', 'limit=1&limit=2', 'cursor=a&cursor=b']) {
    const invalid = bff();
    assert.equal((await invalid.request('GET', `me/interest-posts?${query}`)).status, 400, query);
    assert.equal(invalid.calls.filter(call => !call.url.endsWith('/v1/me')).length, 0);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const invalid = bff();
    assert.equal((await invalid.request(method, 'me/interest-posts')).status, 404, method);
    assert.equal(invalid.calls.length, 0);
  }
});

test('T126/T127 BFF allows only public taxonomy, bound interests, suggestions and the reviewed filters', async () => {
  const publicTerms = bff();
  assert.equal((await publicTerms.request('GET', 'taxonomy', {}, { session: false })).status, 200);
  assert.equal(publicTerms.calls.length, 1);
  assert.equal(publicTerms.calls[0].options.headers.Authorization, undefined);
  for (const [method, route] of [['GET', 'me/interests'], ['PUT', 'me/interests'], ['GET', 'me/suggested-pages?limit=20']]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route, { 'If-Match': '"interests-1"' })).status, 200);
    assert.equal(proxy.calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(proxy.calls.at(-1).options.headers['If-Match'], '"interests-1"');
    assert.equal((await bff().request(method, route, {}, { session: false })).status, 401);
    assert.equal((await bff().request(method, route, { 'X-Account-ID': otherId })).status, 409);
  }
  const filters = 'topic=education&interest=gardening&language=te&place=in&community_type=club&audience=everyone&activity=sharing-tips&content_kind=guides';
  const discovery = bff();
  assert.equal((await discovery.request('GET', `discover/pages?${filters}`)).status, 200);
  assert.equal(new URL(discovery.calls.at(-1).url).search.slice(1), filters);
  for (const [method, route] of [['POST', 'taxonomy'], ['PUT', 'pages'], ['POST', 'me/interests'], ['PATCH', 'me/interests'], ['PUT', 'me/suggested-pages'], ['GET', 'me/interests/other']]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [['GET', 'taxonomy?limit=1'], ['GET', 'me/interests?account_id=other'], ['PUT', 'me/interests?force=true'], ['GET', 'me/suggested-pages?cursor=x'], ['GET', 'me/suggested-pages?limit=1&limit=2'], ['GET', 'discover/pages?interest=gardening&interest=walking']]) {
    assert.equal((await bff().request(method, route)).status, 400, route);
  }
  assert.equal((await bff().request('PUT', 'me/interests', { Origin: 'https://foreign.example' })).status, 403);
});

test('Create commands keep their key and exact body, and confirm what the server returns', async () => {
  const calls = [];
  const client = communityClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/pages')) return Response.json({ data: page({ can_manage: true, etag: '"v1"' }) });
    if (String(url).endsWith('/comments')) return Response.json({ data: comment({ parent_id: commentId === JSON.parse(options.body).parent_id ? commentId : null, id: pageId }) });
    return Response.json({ data: post({ status: 'draft', published_at: null, can_manage: true, etag: '"d1"' }) });
  });
  const intent = { accountId, key, body: { handle: 'river-walkers', name: 'River Walkers', description: 'Walks', topic: 'hobbies' } };
  await client.createPage(intent);
  await client.createPage(intent);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.deepEqual(JSON.parse(calls[0].options.body), intent.body);
  await client.createPost({ accountId, key, pageId, body: { title: null, body: 'Meet at 7' } });
  assert.deepEqual(JSON.parse(calls[2].options.body), { title: null, body: 'Meet at 7' });
  await client.createComment({ accountId, key, postId, body: { body: 'See you', parent_id: commentId } });
  assert.equal(calls[3].url, `/api/posts/${postId}/comments`);
  const mismatch = communityClient(async () => Response.json({ data: page({ can_manage: true, etag: '"v1"', handle: 'other-handle' }) }));
  await assert.rejects(mismatch.createPage(intent), { status: 502 });
  const unconfirmed = communityClient(async () => Response.json({ data: comment({ mine: false, can_remove: false }) }));
  await assert.rejects(unconfirmed.createComment({ accountId, key, postId, body: { body: 'See you' } }), { status: 502 });
});

test('Lists reject foreign, hidden, duplicated or repeated results', async () => {
  const list = (data, next = null) => async () => Response.json({ data, pagination: { next_cursor: next, has_more: next !== null } });
  await assert.rejects(communityClient(list([post({ page_id: otherId, page_handle: 'other-page' })])).pagePosts(pageId), { status: 502 });
  await assert.rejects(communityClient(list([post(), post()])).latestPosts(), { status: 502 });
  await assert.rejects(communityClient(list([post({ status: 'draft', published_at: null, can_manage: true, etag: '"d"' })])).homeFeed(accountId), { status: 502 });
  await assert.rejects(communityClient(list([page({ blocked: true })])).discoverPages(accountId, 'walk', ''), { status: 502 });
  await assert.rejects(communityClient(list([page({ topic: 'news' })])).discoverPages(undefined, '', 'hobbies'), { status: 502 });
  await assert.rejects(communityClient(list([post()], 'same')).latestPosts(undefined, 'same'), { status: 502 });
  await assert.rejects(communityClient(list([post({ saved: false })])).savedPosts(accountId), { status: 502 });
  const valid = await communityClient(list([post({ saved: true })])).savedPosts(accountId);
  assert.equal(valid.items.length, 1);
  assert.equal(communityClient().textProblem('  ', 10), 'Enter some text first.');
  assert.match(communityClient().textProblem('x'.repeat(11), 10), /10/);
  assert.match(communityClient().textProblem('bad\u202e', 10), /control/);
});

test('Post search sends one normalized query and keeps the public list checks', async () => {
  const calls = [];
  const client = communityClient(async url => {
    calls.push(new URL(String(url), origin).searchParams);
    return Response.json({ data: [post()], pagination: { next_cursor: 'next', has_more: true } });
  });
  const found = await client.searchPosts(undefined, '  river \n  walk  ');
  assert.equal(found.items.length, 1);
  assert.equal(found.next, 'next');
  await client.searchPosts(accountId, 'x'.repeat(90), 'first');
  await client.searchPosts(undefined, '   ');
  assert.equal(calls[0].get('q'), 'river walk');
  assert.equal(calls[0].has('cursor'), false);
  assert.equal(calls[1].get('q'), 'x'.repeat(80));
  assert.equal(calls[1].get('cursor'), 'first');
  assert.equal(calls[2].has('q'), false);
  const list = data => async () => Response.json({ data, pagination: { next_cursor: null, has_more: false } });
  await assert.rejects(communityClient(list([post({ status: 'draft', published_at: null, can_manage: true, etag: '"d"' })])).searchPosts(accountId, 'walk'), { status: 502 });
  await assert.rejects(communityClient(list([post(), post()])).searchPosts(undefined, 'walk'), { status: 502 });
});

test('Schemas count characters as the server does, so the longest valid text in emoji is accepted', () => {
  const client = communityClient();
  const leaf = '\u{1F33F}';
  assert.equal(client.pageSchema.safeParse(page({ name: leaf.repeat(80), description: leaf.repeat(500) })).success, true);
  assert.equal(client.postSchema.safeParse(post({ title: leaf.repeat(120), body: leaf.repeat(5000) })).success, true);
  assert.equal(client.commentSchema.safeParse(comment({ author_name: leaf.repeat(80), body: leaf.repeat(2000) })).success, true);
  assert.equal(client.pageSchema.safeParse(page({ name: leaf.repeat(81) })).success, false);
  assert.equal(client.pageSchema.safeParse(page({ description: leaf.repeat(501) })).success, false);
  assert.equal(client.postSchema.safeParse(post({ title: leaf.repeat(121) })).success, false);
  assert.equal(client.postSchema.safeParse(post({ body: leaf.repeat(5001) })).success, false);
  assert.equal(client.commentSchema.safeParse(comment({ body: leaf.repeat(2001) })).success, false);
});

test('BFF accepts the longest valid post however its JSON is encoded, and keeps the small limit elsewhere', async () => {
  async function send(method, route, body) {
    const calls = [];
    const handlers = loadSource('app/api/[...path]/route.ts', async url => {
      calls.push(String(url));
      return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : {} });
    });
    const request = new NextRequest(`${origin}/api/${route}`, {
      method, body,
      headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, 'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': '"v1"' },
    });
    const response = await handlers[method](request, { params: Promise.resolve({ path: route.split('/') }) });
    return { status: response.status, forwarded: calls.filter(url => !url.endsWith('/v1/me')).length };
  }
  const leaf = '\u{1F33F}';
  const raw = JSON.stringify({ title: leaf.repeat(120), body: leaf.repeat(5000) });
  const escaped = raw.replace(/[\u007f-\uffff]/g, unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.ok(Buffer.byteLength(raw) > 16384 && Buffer.byteLength(escaped) > 60000);
  for (const body of [raw, escaped]) {
    assert.deepEqual(await send('POST', `pages/${pageId}/posts`, body), { status: 200, forwarded: 1 });
    assert.deepEqual(await send('PATCH', `posts/${postId}`, body), { status: 200, forwarded: 1 });
  }
  assert.deepEqual(await send('POST', `pages/${pageId}/posts`, `{"body":"${'x'.repeat(70000)}"}`), { status: 413, forwarded: 0 });
  assert.deepEqual(await send('POST', `posts/${postId}/comments`, raw), { status: 413, forwarded: 0 });
});

test('BFF forwards pin commands with the session and the pinned list signed out, and nothing else', async () => {
  for (const route of [`posts/${postId}/pin`, `posts/${postId}/unpin`]) {
    const proxy = bff();
    assert.equal((await proxy.request('POST', route)).status, 200, route);
    assert.equal(proxy.calls.at(-1).url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
  }
  const anonymous = bff();
  assert.equal((await anonymous.request('GET', 'pages/river-walkers/pinned-posts', { 'X-Account-ID': undefined }, { session: false })).status, 200);
  assert.equal(anonymous.calls.length, 1);
  assert.equal(anonymous.calls[0].url, 'https://backend.example.test/v1/pages/river-walkers/pinned-posts');
  assert.equal(anonymous.calls[0].options.headers.Authorization, undefined);
  for (const [method, route] of [['GET', `posts/${postId}/pin`], ['POST', `pages/${pageId}/pinned-posts`], ['POST', `pages/${pageId}/pin`], ['DELETE', `posts/${postId}/pin`]]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  assert.equal((await bff().request('GET', `pages/${pageId}/pinned-posts?limit=3`)).status, 400);
  assert.equal((await bff().request('POST', `posts/${postId}/pin?as=${otherId}`)).status, 400);
  assert.equal((await bff().request('POST', `posts/${postId}/unpin`, {}, { session: false })).status, 401);
});

test('Rules and pins: schemas keep older answers readable, pinned lists are checked and pin commands confirmed', async () => {
  const client = communityClient();
  const leaf = '\u{1F33F}';
  assert.equal(client.pageSchema.parse(page()).rules, '', 'A page from a server without rules reads as having none.');
  assert.equal(client.postSchema.parse(post()).pinned, false, 'A post from a server without pins reads as not pinned.');
  assert.equal(client.pageSchema.safeParse(page({ rules: leaf.repeat(2000) })).success, true);
  assert.equal(client.pageSchema.safeParse(page({ rules: leaf.repeat(2001) })).success, false);
  assert.equal(client.postSchema.safeParse(post({ pinned: true })).success, true);
  assert.equal(client.postSchema.safeParse(post({ status: 'draft', published_at: null, can_manage: true, etag: '"d1"', pinned: true })).success, false);

  const shown = page();
  const pinned = (id, overrides = {}) => post({ id, pinned: true, ...overrides });
  const four = ['01', '02', '03', '04'].map(end => pinned(`0d1f3c52-7a3e-4b6f-9c11-2f5e8d7a4b${end}`));
  const list = data => async () => Response.json({ data });
  assert.equal((await communityClient(list(four.slice(0, 3))).pinnedPosts(shown)).length, 3);
  await assert.rejects(communityClient(list(four)).pinnedPosts(shown), { status: 502 });
  await assert.rejects(communityClient(list([pinned(postId), pinned(postId)])).pinnedPosts(shown), { status: 502 });
  await assert.rejects(communityClient(list([post()])).pinnedPosts(shown), { status: 502 });
  await assert.rejects(communityClient(list([pinned(postId, { page_id: otherId, page_handle: 'other-page' })])).pinnedPosts(shown), { status: 502 });

  const calls = [];
  const answering = flag => communityClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: post({ pinned: flag, can_manage: true, etag: '"p2"' }) });
  });
  assert.equal((await answering(true).pinPost(accountId, postId, true)).pinned, true);
  assert.equal((await answering(false).pinPost(accountId, postId, false)).pinned, false);
  assert.deepEqual(calls.map(call => [call.url, call.options.method, call.options.body]), [
    [`/api/posts/${postId}/pin`, 'POST', '{}'], [`/api/posts/${postId}/unpin`, 'POST', '{}'],
  ]);
  await assert.rejects(answering(false).pinPost(accountId, postId, true), { status: 502 });
  await assert.rejects(answering(true).pinPost(accountId, postId, false), { status: 502 });
});

test('BFF accepts the longest page rules, name and description however their JSON is encoded', async () => {
  async function send(body) {
    const calls = [];
    const handlers = loadSource('app/api/[...path]/route.ts', async url => {
      calls.push(String(url));
      return Response.json({ data: String(url).endsWith('/v1/me') ? { id: accountId } : {} });
    });
    const request = new NextRequest(`${origin}/api/pages/${pageId}`, {
      method: 'PATCH', body,
      headers: { Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId, 'Content-Type': 'application/json', 'If-Match': '"v1"' },
    });
    const response = await handlers.PATCH(request, { params: Promise.resolve({ path: ['pages', pageId] }) });
    return { status: response.status, forwarded: calls.filter(url => !url.endsWith('/v1/me')).length };
  }
  const leaf = '\u{1F33F}';
  const raw = JSON.stringify({ name: leaf.repeat(80), description: leaf.repeat(500), rules: leaf.repeat(2000) });
  const escaped = raw.replace(/[\u007f-\uffff]/g, unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.ok(Buffer.byteLength(escaped) > 16384);
  assert.deepEqual(await send(raw), { status: 200, forwarded: 1 });
  assert.deepEqual(await send(escaped), { status: 200, forwarded: 1 });
  assert.deepEqual(await send(`{"rules":"${'x'.repeat(70000)}"}`), { status: 413, forwarded: 0 });
});
test('BFF accepts the moderator, handover and lifecycle routes and refuses unknown ones', async () => {
  const moderatorId = '8c3fad31-2c9a-4e88-9d5c-4c4c0f9c4d04';
  const offerId = '9d4fbe42-3dab-4f99-aedd-5d5d1f0d5e05';
  for (const [method, route] of [
    ['POST', `pages/${pageId}/moderators`], ['GET', `pages/${pageId}/moderators`], ['GET', 'me/moderator-roles'],
    ['POST', `pages/${pageId}/moderators/${moderatorId}/accept`], ['POST', `pages/${pageId}/moderators/${moderatorId}/decline`],
    ['POST', `pages/${pageId}/moderators/${moderatorId}/withdraw`], ['POST', `pages/${pageId}/moderators/${moderatorId}/remove`],
    ['POST', `pages/${pageId}/moderators/${moderatorId}/step-down`],
    ['POST', `pages/${pageId}/handover`], ['GET', `pages/${pageId}/handover`], ['GET', 'me/handover-offers'],
    ['POST', `pages/${pageId}/handover/${offerId}/accept`], ['POST', `pages/${pageId}/handover/${offerId}/decline`],
    ['POST', `pages/${pageId}/handover/${offerId}/cancel`],
    ['POST', `pages/${pageId}/archive`], ['POST', `pages/${pageId}/restore`], ['POST', `pages/${pageId}/delete`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    assert.equal(proxy.calls.at(-1).url, `https://backend.example.test/v1/${route}`);
    assert.equal(proxy.calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['GET', `pages/${pageId}/archive`], ['DELETE', `pages/${pageId}/moderators`], ['GET', 'moderator-roles'],
    ['POST', 'handover'], ['GET', 'handover-offers'], ['POST', `pages/${pageId}/moderators/${moderatorId}/cancel`],
    ['POST', `pages/${pageId}/handover/${offerId}/remove`], ['POST', `pages/${pageId}/purge`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [
    ['POST', `pages/${pageId}/moderators?as=${otherId}`], ['POST', `pages/${pageId}/handover?as=${otherId}`],
    ['POST', `pages/${pageId}/archive?limit=1`], ['POST', `pages/${pageId}/delete?confirm=1`],
  ]) {
    assert.equal((await bff().request(method, route)).status, 400, `${method} ${route}`);
  }
  for (const [method, route] of [
    ['POST', `pages/${pageId}/moderators`], ['POST', `pages/${pageId}/handover`],
    ['POST', `pages/${pageId}/archive`], ['POST', `pages/${pageId}/restore`], ['POST', `pages/${pageId}/delete`],
  ]) {
    assert.equal((await bff().request(method, route, {}, { session: false })).status, 401, `${method} ${route}`);
  }
});

test('Moderator, handover and lifecycle schemas keep their invariants and older answers readable', () => {
  const client = communityClient();
  assert.equal(client.pageSchema.parse(page()).status, 'active', 'A page from a server without status reads as active.');
  assert.equal(client.pageSchema.parse(page()).purge_after, null, 'A page from a server without purge_after reads as null.');
  for (const status of ['active', 'read_only', 'deleted']) {
    assert.equal(client.pageSchema.safeParse(page({ status })).success, true, status);
  }
  assert.equal(client.pageSchema.safeParse(page({ status: 'archived' })).success, false);
  assert.equal(client.pageSchema.safeParse(page({ status: 'active', purge_after: '2026-09-26T10:00:00Z' })).success, true);

  const moderator = (overrides = {}) => ({
    id: accountId, page_id: pageId, account_id: otherId, display_name: 'Sam',
    status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-22T10:00:00Z', resolved_at: null, etag: '"m1"', ...overrides,
  });
  assert.equal(client.moderatorRowSchema.safeParse(moderator()).success, true);
  assert.equal(client.moderatorRoleSchema.safeParse({ ...moderator(), page_handle: 'river-walkers', page_name: 'River Walkers' }).success, true);
  for (const changes of [
    { status: 'active' }, { status: 'pending', expires_at: null }, { status: 'pending', resolved_at: '2026-09-20T10:00:00Z' },
    { status: 'active', expires_at: '2026-09-22T10:00:00Z' }, { status: 'active', resolved_at: '2026-09-20T10:00:00Z' },
  ]) {
    assert.equal(client.moderatorRowSchema.safeParse(moderator(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.moderatorRowSchema.safeParse(moderator({ status: 'stepped_down', expires_at: null, resolved_at: '2026-09-20T10:00:00Z' })).success, true);

  const handover = (overrides = {}) => ({
    id: accountId, page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers',
    from_account_id: accountId, from_name: 'Alex', to_account_id: otherId, to_name: 'Sam',
    status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-19T10:15:00Z', resolved_at: null, etag: '"h1"', ...overrides,
  });
  assert.equal(client.handoverSchema.safeParse(handover()).success, true);
  for (const changes of [{ status: 'accepted' }, { status: 'pending', resolved_at: '2026-09-19T10:05:00Z' }, { status: 'accepted', expires_at: '2026-09-19T10:15:00Z' }]) {
    assert.equal(client.handoverSchema.safeParse(handover(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.handoverSchema.safeParse(handover({ status: 'accepted', expires_at: null, resolved_at: '2026-09-19T10:05:00Z' })).success, true);
});
test('Moderator commands send the key, body and reviewed version and confirm the answer', async () => {
  const calls = [];
  const moderator = (overrides = {}) => ({
    id: accountId, page_id: pageId, account_id: otherId, display_name: 'Sam',
    status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-22T10:00:00Z', resolved_at: null, etag: '"m1"', ...overrides,
  });
  const resolved = status => moderator({ status, expires_at: null, resolved_at: '2026-09-19T11:00:00Z' });
  const client = communityClient(async (url, options) => {
    calls.push({ url: String(url), options });
    const route = String(url);
    if (route.endsWith(`/pages/${pageId}/moderators`)) {
      return Response.json({ data: options.method === 'GET' ? [moderator()] : moderator() });
    }
    if (route.endsWith('/accept')) return Response.json({ data: moderator({ status: 'active', expires_at: null, resolved_at: '2026-09-19T11:00:00Z' }) });
    if (route.endsWith('/decline')) return Response.json({ data: resolved('declined') });
    if (route.endsWith('/withdraw')) return Response.json({ data: resolved('withdrawn') });
    if (route.endsWith('/remove')) return Response.json({ data: resolved('removed') });
    if (route.endsWith('/step-down')) return Response.json({ data: resolved('stepped_down') });
    return Response.json({ data: [{ ...moderator(), page_handle: 'river-walkers', page_name: 'River Walkers' }] });
  });
  await client.inviteModerator({ accountId, key, pageId, body: { account_id: otherId } });
  assert.equal(calls[0].url, `/api/pages/${pageId}/moderators`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(calls[0].options.body), { account_id: otherId });
  await assert.rejects(communityClient(async () => Response.json({ data: moderator({ account_id: accountId }) })).inviteModerator({ accountId, key, pageId, body: { account_id: otherId } }), { status: 502 });

  const row = moderator();
  assert.equal((await client.acceptModerator(accountId, pageId, row)).status, 'active');
  assert.equal((await client.declineModerator(accountId, pageId, row)).status, 'declined');
  assert.equal((await client.withdrawModerator(accountId, pageId, row)).status, 'withdrawn');
  assert.equal((await client.removeModerator(accountId, pageId, row)).status, 'removed');
  assert.equal((await client.stepDownModerator(accountId, pageId, row)).status, 'stepped_down');
  for (const action of ['accept', 'decline', 'withdraw', 'remove', 'step-down']) {
    const call = calls.find(item => item.url.endsWith(`/${action}`));
    assert.equal(call.options.method, 'POST', action);
    assert.equal(call.options.headers['If-Match'], '"m1"', action);
    assert.equal(call.options.body, '{}', action);
  }
  await assert.rejects(communityClient(async () => Response.json({ data: moderator({ status: 'active', expires_at: null, resolved_at: '2026-09-19T11:00:00Z' }) })).withdrawModerator(accountId, pageId, row), { status: 502 });

  assert.equal((await client.pageModerators(accountId, pageId)).length, 1);
  await assert.rejects(communityClient(async () => Response.json({ data: [moderator({ page_id: otherId })] })).pageModerators(accountId, pageId), { status: 502 });
  await assert.rejects(communityClient(async () => Response.json({ data: [resolved('removed')] })).pageModerators(accountId, pageId), { status: 502 });
  const roles = await client.myModeratorRoles(accountId);
  assert.deepEqual(roles.map(item => [item.page_handle, item.status]), [['river-walkers', 'pending']]);
});
test('Handover and lifecycle commands send the reviewed version and confirm the answer', async () => {
  const calls = [];
  const handover = (overrides = {}) => ({
    id: accountId, page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers',
    from_account_id: accountId, from_name: 'Alex', to_account_id: otherId, to_name: 'Sam',
    status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-19T10:15:00Z', resolved_at: null, etag: '"h1"', ...overrides,
  });
  const done = status => handover({ status, expires_at: null, resolved_at: '2026-09-19T10:05:00Z' });
  const client = communityClient(async (url, options) => {
    calls.push({ url: String(url), options });
    const route = String(url);
    if (route.endsWith('/handover')) return Response.json({ data: handover() });
    if (route.endsWith('/accept')) return Response.json({ data: done('accepted') });
    if (route.endsWith('/decline')) return Response.json({ data: done('declined') });
    if (route.endsWith('/cancel')) return Response.json({ data: done('cancelled') });
    if (route.endsWith('/archive')) return Response.json({ data: page({ can_manage: true, etag: '"v2"', status: 'read_only' }) });
    if (route.endsWith('/restore')) return Response.json({ data: page({ can_manage: true, etag: '"v3"', status: 'active' }) });
    if (route.endsWith('/delete')) return Response.json({ data: page({ can_manage: true, etag: '"v4"', status: 'deleted', purge_after: '2026-09-26T10:00:00Z' }) });
    // Everything else is a list, and the only list left is the offers waiting for the signed-in account.
    return Response.json({ data: [handover({ to_account_id: accountId })] });
  });
  const shown = page({ can_manage: true, etag: '"v1"' });
  await client.offerHandover({ accountId, key, pageId, etag: shown.etag, body: { to_account_id: otherId } });
  assert.equal(calls[0].url, `/api/pages/${pageId}/handover`);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.headers['If-Match'], '"v1"');
  assert.deepEqual(JSON.parse(calls[0].options.body), { to_account_id: otherId });
  await assert.rejects(communityClient(async () => Response.json({ data: handover({ to_account_id: accountId }) })).offerHandover({ accountId, key, pageId, etag: shown.etag, body: { to_account_id: otherId } }), { status: 502 });

  const offer = handover();
  assert.equal((await client.respondHandover(accountId, pageId, offer, 'accept')).status, 'accepted');
  assert.equal((await client.respondHandover(accountId, pageId, offer, 'decline')).status, 'declined');
  assert.equal((await client.respondHandover(accountId, pageId, offer, 'cancel')).status, 'cancelled');
  for (const action of ['accept', 'decline', 'cancel']) {
    assert.equal(calls.find(item => item.url.endsWith(`/${action}`)).options.headers['If-Match'], '"h1"', action);
  }
  await assert.rejects(communityClient(async () => Response.json({ data: done('accepted') })).respondHandover(accountId, pageId, offer, 'decline'), { status: 502 });

  assert.equal((await client.pageHandover(accountId, pageId)).id, accountId);
  assert.deepEqual((await client.myHandoverOffers(accountId)).map(item => item.id), [accountId]);
  await assert.rejects(communityClient(async () => Response.json({ data: [handover({ to_account_id: otherId })] })).myHandoverOffers(accountId), { status: 502 });

  assert.equal((await client.archivePage(accountId, shown)).status, 'read_only');
  assert.equal((await client.restorePage(accountId, page({ can_manage: true, etag: '"v2"', status: 'read_only' }))).status, 'active');
  assert.equal((await client.deletePage(accountId, shown, 'River Walkers')).status, 'deleted');
  const archive = calls.find(item => item.url.endsWith('/archive'));
  const remove = calls.find(item => item.url.endsWith('/delete'));
  assert.equal(archive.options.headers['If-Match'], '"v1"');
  assert.equal(archive.options.body, '{}');
  assert.deepEqual(JSON.parse(remove.options.body), { confirm: 'River Walkers' });
  await assert.rejects(communityClient(async () => Response.json({ data: page({ can_manage: true, etag: '"v2"', status: 'active' }) })).archivePage(accountId, shown), { status: 502 });
});

test('Offers past their time, restores of archived pages, retried commands and long role lists read as the server means them', async () => {
  const client = communityClient();
  const handover = (overrides = {}) => ({
    id: accountId, page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers',
    from_account_id: accountId, from_name: 'Alex', to_account_id: otherId, to_name: 'Sam',
    status: 'pending', created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-19T10:15:00Z', resolved_at: null, etag: '"h1"', ...overrides,
  });
  // The server reports an offer whose 15 minutes passed, or whose page changed, before anything closed it.
  for (const status of ['expired', 'invalidated']) {
    assert.equal(client.handoverSchema.safeParse(handover({ status })).success, true, status);
    assert.equal(client.handoverSchema.safeParse(handover({ status, expires_at: null, resolved_at: '2026-09-19T10:05:00Z' })).success, true, status);
    assert.equal(client.handoverSchema.safeParse(handover({ status, resolved_at: '2026-09-19T10:05:00Z' })).success, false, status);
  }
  for (const status of ['accepted', 'declined', 'cancelled']) assert.equal(client.handoverSchema.safeParse(handover({ status })).success, false, status);

  // A page without an offer answers 404, which means there is none; other failures stay failures.
  const missing = { error: { code: 'NOT_FOUND', message: 'Handover offer not found.', details: {} } };
  assert.equal(await communityClient(async () => Response.json(missing, { status: 404 })).pageHandover(accountId, pageId), null);
  assert.equal((await communityClient(async () => Response.json({ data: handover({ status: 'expired' }) })).pageHandover(accountId, pageId)).status, 'expired');
  await assert.rejects(communityClient(async () => Response.json({ data: handover({ page_id: otherId }) })).pageHandover(accountId, pageId), { status: 502 });
  await assert.rejects(communityClient(async () => Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again.', details: {} } }, { status: 503 })).pageHandover(accountId, pageId), { status: 503 });

  // A deleted page comes back as it was, which may be archived; an archived page comes back active.
  const owned = page({ can_manage: true, etag: '"v4"', status: 'deleted', purge_after: '2026-09-26T10:00:00Z' });
  const restored = status => communityClient(async () => Response.json({ data: page({ can_manage: true, etag: '"v5"', status }) }));
  assert.equal((await restored('read_only').restorePage(accountId, owned)).status, 'read_only');
  assert.equal((await restored('active').restorePage(accountId, owned)).status, 'active');
  await assert.rejects(restored('deleted').restorePage(accountId, owned), { status: 502 });
  await assert.rejects(restored('read_only').restorePage(accountId, page({ can_manage: true, etag: '"v2"', status: 'read_only' })), { status: 502 });

  // A retry with the same key returns the original invitation or offer, even after it was answered.
  const moderator = { id: accountId, page_id: pageId, account_id: otherId, display_name: 'Sam', status: 'active', created_at: '2026-09-19T10:00:00Z', expires_at: null, resolved_at: '2026-09-19T11:00:00Z', etag: '"m2"' };
  assert.equal((await communityClient(async () => Response.json({ data: moderator })).inviteModerator({ accountId, key, pageId, body: { account_id: otherId } })).status, 'active');
  const accepted = handover({ status: 'accepted', expires_at: null, resolved_at: '2026-09-19T10:05:00Z' });
  assert.equal((await communityClient(async () => Response.json({ data: accepted })).offerHandover({ accountId, key, pageId, etag: '"v1"', body: { to_account_id: otherId } })).status, 'accepted');

  // A person may moderate any number of pages, and be offered more than ten.
  const roles = Array.from({ length: 11 }, (_, index) => ({
    ...moderator, id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`, page_handle: `walkers-${index}`, page_name: `Walkers ${index}`,
  }));
  assert.equal((await communityClient(async () => Response.json({ data: roles })).myModeratorRoles(accountId)).length, 11);
  const offers = roles.map(role => handover({ id: role.id, to_account_id: accountId }));
  assert.equal((await communityClient(async () => Response.json({ data: offers })).myHandoverOffers(accountId)).length, 11);
});