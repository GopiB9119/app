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
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const eventId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const otherId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function eventsClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/events/client.ts', fetch, { '@/features/identity/client': identity });
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [], pagination: { next_cursor: null, has_more: false } });
  });
  async function request(method, route, overrides = {}) {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': '"v1"', ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const event = (overrides = {}) => ({
  id: eventId, space_id: spaceId, space_name: 'Morgan family', title: 'Dinner', description: '', location: 'Home',
  timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: '2026-09-25T21:00',
  starts_at: '2026-09-25T13:00:00Z', ends_at: '2026-09-25T15:30:00Z', status: 'scheduled', ended: false,
  created_by_name: 'Alex Morgan', created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z',
  schedule_changed_at: null, cancelled_at: null, going: 0, maybe: 0, not_going: 0, my_response: null,
  my_response_outdated: false, can_manage: true, can_respond: true, etag: '"v1"', attendees: [], ...overrides,
});

test('Event BFF forwards only the reviewed routes, headers and list parameters', async () => {
  for (const [method, route] of [
    ['GET', `spaces/${spaceId}/events`], ['POST', `spaces/${spaceId}/events`], ['GET', `events/${eventId}`],
    ['PATCH', `events/${eventId}`], ['POST', `events/${eventId}/cancel`], ['POST', `events/${eventId}/attendance`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    if (method !== 'GET') {
      assert.equal(upstream.options.headers['Idempotency-Key'], key);
      assert.equal(upstream.options.headers['If-Match'], '"v1"');
    }
  }
  for (const [method, route] of [
    ['DELETE', `events/${eventId}`], ['POST', `events/${eventId}`], ['GET', `events/${eventId}/attendance`],
    ['PATCH', `spaces/${spaceId}/events`], ['POST', 'events'], ['POST', `events/${eventId}/publish`], ['GET', 'events'],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  const listed = bff();
  assert.equal((await listed.request('GET', `spaces/${spaceId}/events?when=past&limit=5&cursor=abc`)).status, 200);
  const upstream = new URL(listed.calls.at(-1).url);
  assert.deepEqual([...upstream.searchParams.keys()], ['when', 'limit', 'cursor']);
  for (const route of [`spaces/${spaceId}/events?space_id=${otherId}`, `events/${eventId}?when=past`, `spaces/${spaceId}/events?when=past&when=upcoming`]) {
    assert.equal((await bff().request('GET', route)).status, 400, route);
  }
  const command = bff();
  assert.equal((await command.request('POST', `events/${eventId}/attendance?as=${otherId}`)).status, 400);
  assert.equal(command.calls.length, 0);
  const foreign = bff();
  assert.equal((await foreign.request('POST', `spaces/${spaceId}/events`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
});

test('Event schema rejects contradictory facts', () => {
  const client = eventsClient();
  assert.equal(client.eventSchema.safeParse(event()).success, true);
  assert.equal(client.eventSchema.safeParse(event({ status: 'cancelled', cancelled_at: '2026-09-20T10:00:00Z', can_manage: false, can_respond: false })).success, true);
  for (const changes of [
    { status: 'cancelled' }, { cancelled_at: '2026-09-20T10:00:00Z' }, { local_end: null }, { ends_at: '2026-09-25T12:00:00Z' },
    { etag: null }, { ended: true }, { my_response_outdated: true }, { response: 'going', my_response: 'attending' },
    { local_start: '2026-09-25 18:30' }, { going: -1 },
    { attendees: [{ name: 'A', response: 'going', responded_at: '2026-09-19T10:00:00Z', outdated: false, mine: true }, { name: 'B', response: 'maybe', responded_at: '2026-09-19T10:00:00Z', outdated: false, mine: true }] },
  ]) {
    assert.equal(client.eventSchema.safeParse(event(changes)).success, false, JSON.stringify(changes));
  }
});

test('Create keeps one key and exact body, and responses are confirmed', async () => {
  const calls = [];
  const client = eventsClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/attendance')) return Response.json({ data: event({ my_response: JSON.parse(options.body).response, going: 1 }) });
    return Response.json({ data: event() });
  });
  const body = client.eventBody({ title: '  Dinner  ', description: 'Bring\r\ndessert ', location: ' Home ', timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: '2026-09-25T21:00' });
  assert.deepEqual(JSON.parse(JSON.stringify(body)), { title: 'Dinner', description: 'Bring\ndessert', location: 'Home', timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: '2026-09-25T21:00' });
  const intent = { accountId, spaceId, key, body };
  await client.createEvent(intent);
  await client.createEvent(intent);
  assert.equal(calls[0].url, `/api/spaces/${spaceId}/events`);
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  const confirmed = await client.respondToEvent(accountId, eventId, 'going');
  assert.equal(confirmed.my_response, 'going');
  const mismatch = eventsClient(async () => Response.json({ data: event({ title: 'Other' }) }));
  await assert.rejects(mismatch.createEvent(intent), { status: 502 });
  const foreign = eventsClient(async () => Response.json({ data: event({ space_id: otherId }) }));
  await assert.rejects(foreign.createEvent(intent), { status: 502 });
  const unconfirmed = eventsClient(async () => Response.json({ data: event({ my_response: 'maybe' }) }));
  await assert.rejects(unconfirmed.respondToEvent(accountId, eventId, 'going'), { status: 502 });
  const stale = eventsClient(async () => Response.json({ data: event({ my_response: 'going', my_response_outdated: true }) }));
  await assert.rejects(stale.respondToEvent(accountId, eventId, 'going'), { status: 502 });
  const edits = [];
  const editor = eventsClient(async (url, options) => { edits.push(options); return Response.json({ data: event({ version: undefined }) }); });
  await editor.updateEvent(accountId, event({ etag: '"v7"' }), body);
  assert.equal(edits[0].method, 'PATCH');
  assert.equal(edits[0].headers['If-Match'], '"v7"');
});

test('Lists reject foreign, duplicated, wrong-period or repeated pages; form checks explain problems', async () => {
  const list = (data, next = null) => async () => Response.json({ data, pagination: { next_cursor: next, has_more: next !== null } });
  await assert.rejects(eventsClient(list([event({ space_id: otherId })])).listEvents(accountId, spaceId, 'upcoming'), { status: 502 });
  await assert.rejects(eventsClient(list([event(), event()])).listEvents(accountId, spaceId, 'upcoming'), { status: 502 });
  await assert.rejects(eventsClient(list([event()])).listEvents(accountId, spaceId, 'past'), { status: 502 });
  await assert.rejects(eventsClient(list([event()], 'same')).listEvents(accountId, spaceId, 'upcoming', 'same'), { status: 502 });
  const valid = await eventsClient(list([event({ attendees: undefined })])).listEvents(accountId, spaceId, 'upcoming');
  assert.equal(valid.data.length, 1);
  await assert.rejects(eventsClient(async () => Response.json({ data: event({ attendees: undefined }) })).readEvent(accountId, eventId), { status: 502 });
  const client = eventsClient();
  const form = { title: 'Dinner', description: '', location: '', timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: '' };
  assert.equal(client.formProblem(form), null);
  assert.equal(client.formProblem({ ...form, title: '  ' }), 'Enter a title.');
  assert.equal(client.formProblem({ ...form, local_start: '' }), 'Choose a start date and time.');
  assert.equal(client.formProblem({ ...form, local_end: '2026-09-25T18:00' }), 'The end must be after the start.');
  assert.match(client.formProblem({ ...form, title: 'x'.repeat(121) }), /120/);
  assert.match(client.formProblem({ ...form, location: 'Home\u202e' }), /control/);
  const when = client.formatWhen(event(), 'Asia/Kolkata');
  assert.match(when.main, /18:30 to 21:00 \(Asia\/Kolkata\)$/);
  assert.equal(when.yours, null);
  assert.match(client.formatWhen(event(), 'UTC').yours, /your time/);
});
