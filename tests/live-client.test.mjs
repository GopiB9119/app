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

function loadSource(relative, fetch, dependencies = {}, globals = {}, transform = source => source) {
  const source = transform(readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8'));
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? (name === '@/features/messaging/client'
      ? loadSource('features/messaging/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) })
      : require(name)), fetch, URL, URLSearchParams, Buffer,
    AbortSignal, AbortController, DOMException, Response, TextDecoder, TextEncoder,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
    ...globals,
  }, { filename: relative });
  return exports;
}

function bff(upstream, current = Response.json({ data: { id: accountId } })) {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).endsWith('/v1/me') ? current : upstream;
  });
  async function request(route = 'live', overrides = {}, method = 'GET') {
    const headers = { Cookie: 'cp_session=synthetic-session', 'X-Account-ID': accountId, ...overrides };
    const incoming = new NextRequest(`${origin}/api/${route}`, { method, headers });
    const response = await handlers[method](incoming, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
    return { response, incoming };
  }
  return { calls, request };
}

test('Live BFF passes the unread stream through with account protection and the browser abort signal', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({ pull() { pulls += 1; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const upstream = new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  upstream.json = () => { throw new Error('The stream must not be parsed as JSON'); };
  const proxy = bff(upstream);
  const { response, incoming } = await proxy.request();
  assert.equal(response.status, 200);
  assert.equal(response.body, body);
  assert.equal(body.locked, false);
  assert.equal(upstream.bodyUsed, false);
  assert.equal(pulls, 0);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(proxy.calls.length, 2);
  assert.equal(proxy.calls[0].url, 'https://backend.example.test/v1/me');
  const stream = proxy.calls[1];
  assert.equal(stream.url, 'https://backend.example.test/v1/live');
  assert.equal(stream.options.headers.Authorization, 'Bearer synthetic-session');
  assert.equal(stream.options.headers.Accept, 'text/event-stream');
  assert.match(stream.options.headers.traceparent, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  assert.equal(stream.options.headers.traceparent, proxy.calls[0].options.headers.traceparent);
  assert.equal(stream.options.cache, 'no-store');
  assert.equal(stream.options.redirect, 'error');
  assert.equal(stream.options.signal, incoming.signal);
  await response.body.cancel();
  assert.equal(cancelled, true);
});

test('Live BFF refuses missing cookies and missing or changed accounts without opening a stream', async () => {
  for (const [headers, status, calls] of [
    [{ Cookie: '' }, 401, 0], [{ 'X-Account-ID': '' }, 409, 0], [{ 'X-Account-ID': otherId }, 409, 1],
  ]) {
    const proxy = bff(Response.json({ data: {} }));
    const { response } = await proxy.request('live', headers);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCOUNT_CHANGED');
    assert.equal(proxy.calls.length, calls);
  }
});

test('Live BFF refuses every query string, cross-site requests and other methods', async () => {
  for (const route of ['live?cursor=secret', 'live?limit=1', 'live?unknown=']) {
    const proxy = bff(Response.json({ data: {} }));
    const { response } = await proxy.request(route);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
    assert.equal(proxy.calls.length, 0);
  }
  const foreign = bff(Response.json({ data: {} }));
  assert.equal((await foreign.request('live', { 'sec-fetch-site': 'cross-site' })).response.status, 403);
  assert.equal(foreign.calls.length, 0);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const proxy = bff(Response.json({ data: {} }));
    assert.equal((await proxy.request('live', { Origin: origin }, method)).response.status, 404);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Live BFF keeps upstream JSON errors and removes a refused session cookie', async () => {
  for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [429, 'LIVE_LIMIT_REACHED'], [503, 'SERVICE_UNAVAILABLE']]) {
    const payload = { error: { code, message: 'Synthetic refusal', details: {} }, request_id: 'synthetic-request' };
    const proxy = bff(Response.json(payload, { status, headers: { 'Retry-After': '30' } }));
    const { response } = await proxy.request();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), payload);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(response.headers.get('set-cookie')?.includes('cp_session=;'), status === 401 ? true : undefined);
  }
});

test('Live BFF also clears the cookie when the account check returns 401', async () => {
  const payload = { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in', details: {} } };
  const proxy = bff(Response.json({ data: {} }), Response.json(payload, { status: 401 }));
  const { response } = await proxy.request();
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), payload);
  assert.match(response.headers.get('set-cookie'), /cp_session=;/);
  assert.equal(proxy.calls.length, 1);
});

function sse() {
  let controller;
  const body = new ReadableStream({ start(value) { controller = value; } });
  return {
    response: new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
    send(event, data) { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); },
    close() { controller.close(); },
    abort() { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const ready = { heartbeat_seconds: 15, max_seconds: 1800 };
const conversationId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const spaceId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const conversationHint = { kind: 'conversation', conversation_id: conversationId, space_id: spaceId, reason: 'message' };

test('Typing hints reach subscribers without invalidating messages, creating alerts or accepting invalid metadata', async () => {
  const fixture = liveClient();
  try {
    fixture.client.useLiveUpdates(accountId);
    await flush();
    const received = [];
    const unsubscribe = fixture.client.subscribeLive(event => received.push(JSON.parse(JSON.stringify(event))));
    const hint = {
      kind: 'typing', conversation_id: conversationId, space_id: spaceId, account_id: otherId,
      client_id: conversationId, sequence: 1, is_typing: true, mentioned_account_ids: [accountId], mentions_agent: true,
      expires_at: '2026-10-02T13:00:36Z',
    };
    fixture.streams[0].send('change', { ...hint, body: 'This must not be propagated' });
    await flush();
    assert.deepEqual(received, [{ ...hint, accountId }]);
    assert.deepEqual(fixture.invalidations, []);
    assert.deepEqual(fixture.alerts, []);
    assert.equal(fixture.calls.length, 1);
    for (const invalid of [
      { ...hint, account_id: 'bad' }, { ...hint, sequence: -1 }, { ...hint, is_typing: false },
      { ...hint, mentioned_account_ids: [accountId, accountId] }, { ...hint, expires_at: 'bad' },
    ]) fixture.streams[0].send('change', invalid);
    await flush();
    assert.equal(received.length, 1);
    const stopped = { ...hint, sequence: 2, is_typing: false, mentioned_account_ids: [], mentions_agent: false };
    fixture.streams[0].send('change', stopped);
    await flush();
    assert.deepEqual(received.at(-1), { ...stopped, accountId });
    assert.deepEqual(fixture.invalidations, []);
    unsubscribe();
  } finally { fixture.cleanup(); }
});

test('Agent change hints refresh private run queries without exposing content or sending actions', async () => {
  const fixture = liveClient();
  try {
    fixture.client.useLiveUpdates(accountId);
    await flush();
    const received = [];
    const unsubscribe = fixture.client.subscribeLive(event => received.push({ ...event }));
    const hint = { kind: 'agent', space_id: spaceId, run_id: otherId, reason: 'changed' };
    fixture.streams[0].send('change', hint);
    await flush();
    assert.deepEqual(received, [{ ...hint, accountId }]);
    assert.ok(fixture.invalidations.some(key => key[0] === 'agentRuns' && key[1] === accountId));
    assert.ok(fixture.invalidations.some(key => key[0] === 'agentMessageRun' && key[1] === accountId));
    assert.equal(fixture.calls.length, 1, 'The hint does not send any command.');
    fixture.streams[0].send('change', { ...hint, run_id: 'not-an-id' });
    await flush();
    assert.equal(received.length, 1, 'Invalid run references are not accepted.');
    const mainHint = { ...hint, space_id: null };
    fixture.streams[0].send('change', mainHint);
    await flush();
    assert.deepEqual(received.at(-1), { ...mainHint, accountId }, 'A Main Agent run names no Space.');
    const { space_id: _omitted, ...withoutSpace } = hint;
    fixture.streams[0].send('change', withoutSpace);
    await flush();
    assert.equal(received.length, 2, 'An Agent hint must say whether it names a Space.');
    unsubscribe();
  } finally { fixture.cleanup(); }
});

test('Poll change hints refresh only the Space poll lists and carry identifiers only', async () => {
  const fixture = liveClient();
  try {
    fixture.client.useLiveUpdates(accountId);
    await flush();
    const received = [];
    const unsubscribe = fixture.client.subscribeLive(event => received.push({ ...event }));
    const hint = { kind: 'poll', space_id: spaceId, poll_id: otherId, reason: 'changed' };
    fixture.streams[0].send('change', hint);
    await flush();
    assert.deepEqual(received, [{ ...hint, accountId }]);
    assert.deepEqual(fixture.invalidations.splice(0), [['spacePolls', accountId]]);
    for (const invalid of [{ ...hint, poll_id: 'not-an-id' }, { ...hint, reason: 'voted' }, { ...hint, space_id: null }, { ...hint, question: 'Where?' }]) {
      fixture.streams[0].send('change', invalid);
      await flush();
    }
    assert.equal(received.length, 2, 'Only an exact poll hint is accepted; extra fields are dropped by the schema.');
    assert.equal(received[1].question, undefined, 'A poll hint never carries poll content.');
    assert.deepEqual(fixture.invalidations.splice(0), [['spacePolls', accountId]]);
    assert.equal(fixture.calls.length, 1, 'The hint does not send any command.');
    unsubscribe();
  } finally { fixture.cleanup(); }
});

function liveClient(options = {}) {
  const effects = [];
  const calls = [];
  const invalidations = [];
  const streams = [];
  const timers = new Map();
  const storage = new Map();
  const alerts = [];
  const target = new EventTarget();
  const navigator = { onLine: options.online ?? true };
  const document = { hidden: false };
  let timerId = 0;
  let focuses = 0;
  let now = Date.UTC(2026, 9, 2, 13, 0, 28);
  class Clock extends Date { static now() { return now; } }
  const navigations = [];
  class Notification {
    static permission = 'granted';
    static requests = 0;
    static async requestPermission() { Notification.requests += 1; return Notification.permission; }
    constructor(title, configuration) { this.title = title; this.configuration = configuration; alerts.push(this); }
    close() { this.closed = true; }
  }
  const window = {
    Notification, focus() { focuses += 1; }, location: { assign(path) { navigations.push(path); } },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } },
    addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
    setTimeout(callback, milliseconds) { const id = ++timerId; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const client = loadSource('features/realtime/live.ts', async (url, config) => {
    calls.push({ url, config });
    if (options.fetch) return options.fetch(url, config);
    const stream = sse();
    config.signal.addEventListener('abort', () => stream.abort(), { once: true });
    streams.push(stream);
    return stream.response;
  }, {
    react: { useEffect(effect) { effects.push(effect()); }, useSyncExternalStore(_subscribe, snapshot) { return snapshot(); } },
    '@tanstack/react-query': { useQueryClient: () => ({ invalidateQueries({ queryKey }) { invalidations.push(Array.from(queryKey)); return Promise.resolve(); } }) },
    '@/features/scheduling/client': { notificationPage: options.notificationPage ?? (async () => ({ data: [], unreadCount: 0 })) },
  }, { window, navigator, document, Date: Clock, Math: Object.assign(Object.create(Math), { random: () => 0.4 }) }, options.transform);
  return {
    client, calls, streams, effects, timers, invalidations, storage, alerts, Notification, navigator, document, navigations,
    focuses: () => focuses,
    now: () => now,
    advance(milliseconds) { now += milliseconds; },
    event(name) { target.dispatchEvent(new Event(name)); },
    tick() { assert.equal(timers.size, 1); const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.milliseconds; timer.callback(); return timer.milliseconds; },
    cleanup() { effects.splice(0).forEach(effect => effect?.()); },
  };
}

test('SSE parser handles every chunk split, CRLF, comments, multiline data and unknown events', () => {
  const source = ': keep-alive\r\nretry: 5000\r\nevent: unknown\r\ndata: first\r\ndata:  second\r\n\r\nevent: ready\ndata: {}\n\ndata: plain\n\n';
  const client = loadSource('features/realtime/live.ts', async () => {}, {
    '@/features/scheduling/client': {},
  });
  for (let split = 0; split <= source.length; split += 1) {
    const frames = [];
    const parser = client.createSseParser(frame => frames.push({ ...frame }));
    parser.push(source.slice(0, split)); parser.push(source.slice(split)); parser.finish();
    assert.deepEqual(frames, [
      { event: 'unknown', data: 'first\n second' }, { event: 'ready', data: '{}' }, { event: 'message', data: 'plain' },
    ], `Split at ${split}`);
  }
  const frames = [];
  const parser = client.createSseParser(frame => frames.push({ ...frame }));
  for (const character of source) parser.push(character);
  parser.finish();
  assert.equal(frames.length, 3);
});

test('SSE parser preserves split UTF-8, empty data and CR lines, and discards incomplete frames', () => {
  const client = loadSource('features/realtime/live.ts', async () => {}, { '@/features/scheduling/client': {} });
  const frames = [];
  const parser = client.createSseParser(frame => frames.push({ ...frame }));
  const decoder = new TextDecoder();
  const bytes = new TextEncoder().encode('event: unknown\ndata: \u0c30\u{1f642}\n\ndata:\r\revent: discarded\ndata: unfinished');
  for (const byte of bytes) parser.push(decoder.decode(Uint8Array.of(byte), { stream: true }));
  parser.push(decoder.decode()); parser.finish();
  assert.deepEqual(frames, [{ event: 'unknown', data: '\u0c30\u{1f642}' }, { event: 'message', data: '' }]);
});

test('Live hooks share one account-bound stream and stop only after the last reference or an account change', async () => {
  const fixture = liveClient();
  try {
    fixture.client.useLiveUpdates(undefined);
    assert.equal(fixture.calls.length, 0);
    fixture.client.useLiveUpdates(accountId); fixture.client.useLiveUpdates(accountId);
    await flush();
    assert.equal(fixture.calls.length, 1);
    const first = fixture.calls[0];
    assert.equal(first.url, '/api/live');
    assert.equal(first.config.headers['X-Account-ID'], accountId);
    assert.equal(first.config.credentials, 'same-origin');
    assert.equal(first.config.cache, 'no-store');
    fixture.effects[1](); fixture.effects[1] = undefined;
    assert.equal(first.config.signal.aborted, false);
    fixture.client.useLiveUpdates(otherId);
    await flush();
    assert.equal(first.config.signal.aborted, true);
    assert.equal(fixture.calls.length, 2);
    assert.equal(fixture.calls[1].config.headers['X-Account-ID'], otherId);
    fixture.effects[2](); fixture.effects[2] = undefined;
    assert.equal(fixture.calls[1].config.signal.aborted, false, 'Old-account cleanup must not stop the new account');
  } finally { fixture.cleanup(); }
  assert.equal(fixture.calls[1].config.signal.aborted, true);
  assert.equal(fixture.timers.size, 0);
});

async function checkSessionRecovery(fixture) {
  try {
    fixture.client.useLiveUpdates(accountId);
    await flush();
    fixture.streams[0].send('ready', ready);
    await flush();
    fixture.client.resumeLiveUpdates(accountId);
    await flush();
    assert.equal(fixture.calls.length, 1, 'A healthy stream must stay open');
    fixture.streams[0].send('end', { reason: 'signed_out' });
    await flush();
    assert.equal(fixture.calls[0].config.signal.aborted, true);
    assert.equal(fixture.timers.size, 0, 'Signing out must not start a retry loop');
    fixture.client.resumeLiveUpdates(otherId);
    await flush();
    assert.equal(fixture.calls.length, 1, 'Another account must not reopen the old stream');
    fixture.client.resumeLiveUpdates(accountId);
    await flush();
    assert.equal(fixture.calls.length, 2, 'A confirmed sign-in must reopen its stream');
    assert.equal(fixture.calls[1].config.headers['X-Account-ID'], accountId);
    fixture.client.resumeLiveUpdates(accountId);
    await flush();
    assert.equal(fixture.calls.length, 2, 'Repeated confirmation must not duplicate an opening stream');
    fixture.streams[1].send('ready', ready);
    await flush();
    assert.equal(fixture.client.useLiveConnected(), true);
  } finally { fixture.cleanup(); }
  fixture.client.resumeLiveUpdates(accountId);
  await flush();
  assert.equal(fixture.calls.length, 2, 'An unmounted app must stay disconnected');
  assert.equal(fixture.timers.size, 0);
}

test('Live session recovery requires the same confirmed account and retains a healthy stream', async () => {
  await checkSessionRecovery(liveClient());
});

test('Live session recovery regression catches a connection left permanently halted', async () => {
  await assert.rejects(() => checkSessionRecovery(liveClient({ transform(source) {
    assert.ok(source.includes('owner.terminal = false;'));
    return source.replace('owner.terminal = false;', '');
  } })), error => error.code === 'ERR_ASSERTION' && error.message.includes('A confirmed sign-in must reopen its stream'));
});

test('Ready and resync re-read all keys; conversation and notification hints invalidate only their prefixes', async () => {
  const fixture = liveClient();
  const allKeys = ['conversations', 'notifications', 'home', 'agentRuns', 'agentMessageRun', 'agentMemories', 'spacePolls'].map(key => [key, accountId]);
  const events = [];
  const unsubscribe = fixture.client.subscribeLive(event => events.push({ ...event }));
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    assert.equal(fixture.client.useLiveConnected(), false);
    const stream = fixture.streams[0];
    stream.send('ready', ready); await flush();
    assert.equal(fixture.client.useLiveConnected(), true);
    assert.deepEqual(fixture.invalidations.splice(0), allKeys);
    assert.deepEqual(events.splice(0), [{ kind: 'resync', accountId }]);
    stream.send('change', conversationHint); await flush();
    assert.deepEqual(fixture.invalidations.splice(0), [['conversations', accountId]]);
    assert.deepEqual(events.splice(0), [{ ...conversationHint, accountId }]);
    // Lost access (T86), an erased member (T68) and an edit or reaction (T162) reach the open chat like any other change.
    for (const reason of ['access', 'member_left', 'changed']) {
      stream.send('change', { ...conversationHint, reason }); await flush();
      assert.deepEqual(fixture.invalidations.splice(0), [['conversations', accountId]], reason);
      assert.deepEqual(events.splice(0), [{ ...conversationHint, reason, accountId }], reason);
    }
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.deepEqual(fixture.invalidations.splice(0), [['notifications', accountId], ['home', accountId]]);
    assert.deepEqual(events.splice(0), [{ kind: 'notifications', reason: 'delivered', accountId }]);
    stream.send('unknown', conversationHint);
    stream.send('change', { ...conversationHint, conversation_id: 'invalid' });
    stream.send('change', { kind: 'notifications', reason: 'unknown' }); await flush();
    assert.deepEqual(fixture.invalidations, []); assert.deepEqual(events, []);
    stream.send('resync', {}); await flush();
    assert.deepEqual(fixture.invalidations, allKeys);
    assert.deepEqual(events, [{ kind: 'resync', accountId }]);
  } finally { unsubscribe(); fixture.cleanup(); }
});

test('Connection failures back off at 1, 2, 5, 10 and 30 seconds with bounded jitter and no tight loop', async () => {
  const fixture = liveClient({ fetch: async () => { throw new TypeError('Synthetic disconnect'); } });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    for (const expected of [1100, 2100, 5100, 10100, 30100, 30100]) {
      const calls = fixture.calls.length;
      assert.equal(fixture.tick(), expected);
      await flush();
      assert.equal(fixture.calls.length, calls + 1);
      assert.equal(fixture.timers.size, 1);
    }
  } finally { fixture.cleanup(); }
  assert.equal(fixture.timers.size, 0);
});

test('Ready resets backoff and an EOF disconnects and schedules another stream', async () => {
  let attempt = 0;
  const stream = sse();
  const fixture = liveClient({ fetch: async (_url, config) => {
    if (++attempt < 3) throw new TypeError('Synthetic disconnect');
    config.signal.addEventListener('abort', () => stream.abort(), { once: true });
    return stream.response;
  } });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    assert.equal(fixture.tick(), 1100); await flush();
    assert.equal(fixture.tick(), 2100); await flush();
    stream.send('ready', ready); await flush();
    assert.equal(fixture.client.useLiveConnected(), true);
    stream.close(); await flush();
    assert.equal(fixture.client.useLiveConnected(), false);
    assert.equal([...fixture.timers.values()][0].milliseconds, 1100);
  } finally { fixture.cleanup(); }
});

test('401 and ACCOUNT_CHANGED stop reconnecting; 429 waits thirty seconds; other errors back off', async () => {
  for (const [status, code, delay] of [
    [401, 'AUTHENTICATION_REQUIRED', null], [409, 'ACCOUNT_CHANGED', null], [429, 'LIVE_LIMIT_REACHED', 30100],
    [409, 'OTHER_CONFLICT', 1100], [503, 'SERVICE_UNAVAILABLE', 1100],
  ]) {
    const fixture = liveClient({ fetch: async () => Response.json({ error: { code } }, { status }) });
    try {
      fixture.client.useLiveUpdates(accountId); await flush();
      assert.equal(fixture.client.useLiveConnected(), false);
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.timers.size, delay === null ? 0 : 1);
      if (delay !== null) assert.equal([...fixture.timers.values()][0].milliseconds, delay);
      else { fixture.event('online'); await flush(); assert.equal(fixture.calls.length, 1); }
    } finally { fixture.cleanup(); }
  }
});

test('Live Retry-After: a 429 waits for the server deadline instead of reconnecting after thirty seconds', async () => {
  let attempt = 0;
  const stream = sse();
  const fixture = liveClient({ fetch: async (_url, config) => {
    if (++attempt === 1) return Response.json({ error: { code: 'LIVE_LIMIT_REACHED' } }, { status: 429, headers: { 'Retry-After': '900' } });
    config.signal.addEventListener('abort', () => stream.abort(), { once: true });
    return stream.response;
  } });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    assert.equal(fixture.client.useLiveConnected(), false);
    assert.equal([...fixture.timers.values()][0].milliseconds, 900100);
    fixture.event('online'); await flush();
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.tick(), 900100); await flush();
    assert.equal(fixture.calls.length, 2);
    stream.send('ready', ready); await flush();
    assert.equal(fixture.client.useLiveConnected(), true);
    assert.equal(fixture.timers.size, 0);
  } finally { fixture.cleanup(); }
});

test('Live Retry-After: going offline and online cannot bypass the remaining cooldown', async () => {
  const fixture = liveClient({ fetch: async () => Response.json({ error: { code: 'LIVE_LIMIT_REACHED' } }, {
    status: 429, headers: { 'Retry-After': '900' },
  }) });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    fixture.advance(30000);
    fixture.navigator.onLine = false; fixture.event('offline'); await flush();
    assert.equal(fixture.timers.size, 0);
    fixture.navigator.onLine = true; fixture.event('online'); await flush();
    assert.equal(fixture.calls.length, 1, 'Reconnecting the network must not send before Retry-After');
    assert.equal([...fixture.timers.values()][0].milliseconds, 870100);
  } finally { fixture.cleanup(); }
});

test('Live Retry-After: remounting preserves the cooldown for that account without blocking another account', async () => {
  const stream = sse();
  const fixture = liveClient({ fetch: async (_url, config) => {
    if (config.headers['X-Account-ID'] === accountId) return Response.json({ error: { code: 'LIVE_LIMIT_REACHED' } }, {
      status: 429, headers: { 'Retry-After': '900' },
    });
    config.signal.addEventListener('abort', () => stream.abort(), { once: true });
    return stream.response;
  } });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    fixture.cleanup();
    assert.equal(fixture.timers.size, 0);
    fixture.advance(30000);
    fixture.client.useLiveUpdates(otherId); await flush();
    assert.equal(fixture.calls.length, 2);
    assert.equal(fixture.calls[1].config.headers['X-Account-ID'], otherId);
    fixture.cleanup(); await flush();
    fixture.client.useLiveUpdates(accountId); await flush();
    assert.equal(fixture.calls.length, 2, 'The original account must keep its deadline after remounting');
    assert.equal([...fixture.timers.values()][0].milliseconds, 870100);
  } finally { fixture.cleanup(); }
});

test('Live Retry-After: HTTP dates and seconds are accepted, while missing or invalid headers keep the existing fallback', async () => {
  const now = Date.UTC(2026, 9, 2, 13, 0, 28);
  for (const [value, expected] of [
    ['900', 900100], [' 900 ', 900100], [new Date(now + 120000).toUTCString(), 120100],
    ['0', 100], [new Date(now - 1000).toUTCString(), 100],
    [null, 30100], ['', 30100], ['not-a-date', 30100], ['-1', 30100], ['1.5', 30100],
  ]) {
    const fixture = liveClient({ fetch: async () => Response.json({ error: { code: 'LIVE_LIMIT_REACHED' } }, {
      status: 429, headers: value === null ? {} : { 'Retry-After': value },
    }) });
    try {
      fixture.client.useLiveUpdates(accountId); await flush();
      assert.equal(fixture.calls.length, 1);
      assert.equal([...fixture.timers.values()][0].milliseconds, expected, String(value));
    } finally { fixture.cleanup(); }
  }
});

test('Live Retry-After: an early timer or an oversized delay cannot reconnect before the deadline', async () => {
  for (const value of ['2147484', '9'.repeat(100)]) {
    const fixture = liveClient({ fetch: async () => Response.json({ error: { code: 'LIVE_LIMIT_REACHED' } }, {
      status: 429, headers: { 'Retry-After': value },
    }) });
    try {
      fixture.client.useLiveUpdates(accountId); await flush();
      const [id, early] = fixture.timers.entries().next().value;
      assert.equal(early.milliseconds, 2147483647);
      fixture.timers.delete(id); early.callback(); await flush();
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.tick(), 2147483647); await flush();
      assert.equal(fixture.calls.length, 1);
      const remaining = [...fixture.timers.values()][0].milliseconds;
      assert.ok(remaining > 0 && remaining <= 2147483647);
      if (value === '2147484') {
        assert.equal(remaining, 453);
        fixture.tick(); await flush();
        assert.equal(fixture.calls.length, 2);
      }
    } finally { fixture.cleanup(); }
  }
});

test('End reconnects after time limits or connection limits but signed_out stops', async () => {
  for (const reason of ['time_limit', 'too_many_connections', 'signed_out']) {
    const fixture = liveClient();
    try {
      fixture.client.useLiveUpdates(accountId); await flush();
      fixture.streams[0].send('ready', ready); await flush();
      fixture.streams[0].send('end', { reason }); await flush();
      assert.equal(fixture.client.useLiveConnected(), false);
      assert.equal(fixture.calls[0].config.signal.aborted, true);
      assert.equal(fixture.timers.size, reason === 'signed_out' ? 0 : 1);
      if (reason !== 'signed_out') { assert.equal(fixture.tick(), 1100); await flush(); assert.equal(fixture.calls.length, 2); }
    } finally { fixture.cleanup(); }
  }
});

test('Offline mounts make no requests, online reconnects, and unmount removes listeners and pending retries', async () => {
  const fixture = liveClient({ online: false });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    assert.equal(fixture.calls.length, 0); assert.equal(fixture.timers.size, 0);
    fixture.navigator.onLine = true; fixture.event('online'); await flush();
    assert.equal(fixture.calls.length, 1);
    fixture.streams[0].send('ready', ready); await flush();
    fixture.navigator.onLine = false; fixture.event('offline'); await flush();
    assert.equal(fixture.calls[0].config.signal.aborted, true);
    assert.equal(fixture.client.useLiveConnected(), false); assert.equal(fixture.timers.size, 0);
    fixture.navigator.onLine = true; fixture.event('online'); await flush();
    assert.equal(fixture.calls.length, 2);
  } finally { fixture.cleanup(); }
  fixture.event('online'); await flush();
  assert.equal(fixture.calls.length, 2); assert.equal(fixture.timers.size, 0);
});

test('Reminder alerts require opt-in, granted permission, a hidden page and delivered hints, and show each unread ID once', async () => {
  const pages = [];
  const fixture = liveClient({ notificationPage: async (...arguments_) => {
    pages.push(arguments_);
    return { data: [
      { id: conversationId, task_title: 'Bring the plates', read_at: null },
      { id: spaceId, task_title: 'Already read', read_at: '2026-10-01T10:00:00Z' },
    ] };
  } });
  try {
    fixture.client.useLiveUpdates(accountId); await flush();
    const stream = fixture.streams[0];
    stream.send('ready', ready);
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.equal(pages.length, 0);
    assert.equal(fixture.client.setBrowserAlertsEnabled(accountId, true), true);
    assert.equal(fixture.storage.get(`cp-browser-alerts:${accountId}`), 'on');
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.equal(pages.length, 0, 'A visible page must not alert');
    fixture.document.hidden = true;
    fixture.Notification.permission = 'denied';
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.equal(pages.length, 0);
    fixture.Notification.permission = 'granted';
    stream.send('change', conversationHint);
    stream.send('change', { kind: 'notifications', reason: 'read' });
    stream.send('resync', {}); await flush();
    assert.equal(pages.length, 0);
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.equal(pages.length, 1); assert.equal(pages[0][0], accountId); assert.equal(pages[0][1], null);
    assert.equal(fixture.alerts.length, 1);
    assert.equal(fixture.alerts[0].title, 'Reminder');
    assert.deepEqual({ ...fixture.alerts[0].configuration }, { body: 'Bring the plates', tag: conversationId });
    stream.send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
    assert.equal(pages.length, 2); assert.equal(fixture.alerts.length, 1);
    assert.equal(fixture.Notification.requests, 0, 'Permission must never be requested by the stream');
    fixture.alerts[0].onclick();
    assert.equal(fixture.focuses(), 1); assert.deepEqual(fixture.navigations, ['/app/notifications']);
    fixture.client.setBrowserAlertsEnabled(accountId, false);
    assert.equal(fixture.storage.has(`cp-browser-alerts:${accountId}`), false);
  } finally { fixture.cleanup(); }
});

test('Late reminder reads cannot alert after an account change or after alerts are turned off', async () => {
  for (const change of ['account', 'off']) {
    let complete;
    let signal;
    const fixture = liveClient({ notificationPage: (_account, _cursor, abort) => { signal = abort; return new Promise(resolve => { complete = resolve; }); } });
    try {
      fixture.client.useLiveUpdates(accountId); await flush();
      fixture.document.hidden = true;
      fixture.client.setBrowserAlertsEnabled(accountId, true);
      fixture.streams[0].send('change', { kind: 'notifications', reason: 'delivered' }); await flush();
      if (change === 'account') { fixture.client.useLiveUpdates(otherId); assert.equal(signal.aborted, true); }
      else fixture.client.setBrowserAlertsEnabled(accountId, false);
      complete({ data: [{ id: conversationId, task_title: 'Old account reminder', read_at: null }] }); await flush();
      assert.equal(fixture.alerts.length, 0);
    } finally { fixture.cleanup(); }
  }
});