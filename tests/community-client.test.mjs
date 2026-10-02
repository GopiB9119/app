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
  for (const changes of [{ can_manage: true }, { etag: '"x"' }, { following: true, blocked: true }, { topic: 'gossip' }, { handle: 'Bad Handle' }]) {
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
    if (route.endsWith(`/pages/${pageId}/moderators`)) return Response.json({ data: moderator() });
    if (route.endsWith('/accept')) return Response.json({ data: moderator({ status: 'active', expires_at: null, resolved_at: '2026-09-19T11:00:00Z' }) });
    if (route.endsWith('/decline')) return Response.json({ data: resolved('declined') });
    if (route.endsWith('/withdraw')) return Response.json({ data: resolved('withdrawn') });
    if (route.endsWith('/remove')) return Response.json({ data: resolved('removed') });
    if (route.endsWith('/step-down')) return Response.json({ data: resolved('stepped_down') });
    if (route.endsWith('/moderators')) return Response.json({ data: [moderator()] });
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
    return Response.json({ data: [handover()] });
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
  await assert.rejects(communityClient(async () => Response.json({ data: [handover({ to_account_id: accountId })] })).myHandoverOffers(accountId), { status: 502 });

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