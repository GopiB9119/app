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

function budgetClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/events/budget-client.ts', fetch, { '@/features/identity/client': identity });
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

test('Event timezone resolves aliases only to an equivalent API-listed name', () => {
  const client = eventsClient();
  const available = ['America/New_York', 'Asia/Kolkata', 'Europe/Kyiv', 'UTC'];
  for (const [current, expected] of [
    ['Asia/Calcutta', 'Asia/Kolkata'], ['Europe/Kiev', 'Europe/Kyiv'], ['US/Eastern', 'America/New_York'],
    ['Asia/Kolkata', 'Asia/Kolkata'], ['UTC', 'UTC'], ['Not/AZone', ''],
  ]) assert.equal(client.eventTimezone(current, available), expected, current);
  assert.equal(client.eventTimezone('Asia/Calcutta', ['Asia/Calcutta', 'Asia/Kolkata']), 'Asia/Calcutta');
  assert.equal(client.eventTimezone('Asia/Calcutta', ['Not/AZone', 'Asia/Kolkata']), 'Asia/Kolkata');
  assert.equal(client.eventTimezone('America/Phoenix', ['America/Denver', 'UTC']), '');
  assert.equal(client.eventTimezone('Asia/Calcutta', []), '');
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

test('Event quality: impossible local dates are refused without rejecting leap days', () => {
  const client = eventsClient();
  const form = { title: 'Dinner', description: '', location: '', timezone: 'UTC', local_start: '2028-02-29T18:30', local_end: '' };
  assert.equal(client.formProblem(form), null);
  for (const local_start of ['2026-02-29T18:30', '2026-02-30T18:30', '2026-13-01T18:30', '2026-10-01T24:00', '2026-10-01T18:60', '0000-01-01T12:00']) {
    assert.equal(client.formProblem({ ...form, local_start }), 'Choose a valid start date and time.', local_start);
  }
  assert.equal(client.formProblem({ ...form, local_end: '2028-02-30T19:30' }), 'Choose a valid end date and time.');
});

test('Event quality: response text limits count characters and match the event API', () => {
  const client = eventsClient();
  for (const [field, limit] of [['title', 120], ['location', 200], ['description', 2000]]) {
    assert.equal(client.eventSchema.safeParse(event({ [field]: '\u{1f642}'.repeat(limit) })).success, true, field);
    assert.equal(client.eventSchema.safeParse(event({ [field]: 'x'.repeat(limit + 1) })).success, false, field);
    assert.equal(client.eventSchema.safeParse(event({ [field]: '\u{1f642}'.repeat(limit + 1) })).success, false, field);
  }
});

test('Event quality: dates use the requested language and equivalent viewer zones do not repeat the same time', () => {
  const client = eventsClient();
  assert.equal(client.formatWhen(event(), 'Asia/Calcutta').yours, null);
  const date = new Date('2026-09-25T00:00:00Z');
  const expected = new Intl.DateTimeFormat('hi-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  const formatted = client.formatWhen(event(), 'UTC', {
    locale: 'hi-IN', range: (start, end) => `${start} -> ${end}`, own: time => `Local: ${time}`,
  });
  assert.ok(formatted.main.includes(expected));
  assert.match(formatted.main, /18:30 -> 21:00 \(Asia\/Kolkata\)$/);
  assert.match(formatted.yours, /^Local: /);
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

// Event budgets (DEC-039, T159).
const categoryId = '8c1d7e52-5a3b-4f0e-9a61-0d4e6f2b7c11';
const expenseId = '9d2e8f63-6b4c-4a1f-8b72-1e5f7a3c8d22';
const ownExpenseId = 'a1b2c3d4-0e1f-4a2b-9c3d-4e5f6a7b8c90';
const looseExpenseId = 'b2c3d4e5-1f2a-4b3c-8d4e-5f6a7b8c9d01';
const contributionId = 'c3d4e5f6-2a3b-4c4d-9e5f-6a7b8c9d0e12';
const ownContributionId = 'd4e5f6a7-3b4c-4d5e-8f6a-7b8c9d0e1f23';
const budget = (overrides = {}) => ({
  event_id: eventId, currency: 'INR',
  categories: [{ id: categoryId, name: 'Food', estimate_minor: 999_999, recorded_minor: 30, remaining_minor: 999_969 }],
  expenses: [
    { id: expenseId, amount_minor: 20, category_id: categoryId, note: 'Milk', recorded_by_name: 'Sam', recorded_at: '2026-09-19T10:02:00Z', mine: false, can_delete: true },
    { id: ownExpenseId, amount_minor: 10, category_id: categoryId, note: 'Bread', recorded_by_name: 'Alex Morgan', recorded_at: '2026-09-19T10:01:00Z', mine: true, can_delete: true },
    { id: looseExpenseId, amount_minor: 5, category_id: null, note: '', recorded_by_name: null, recorded_at: '2026-09-19T10:00:00Z', mine: false, can_delete: true },
  ],
  estimate_minor: 999_999, recorded_minor: 35, uncategorized_minor: 5, remaining_minor: 999_964,
  contributions: [
    { id: contributionId, amount_minor: 50_000, state: 'given', note: 'Cash to Sam', contributor_name: 'Riya', recorded_at: '2026-09-19T10:04:00Z', mine: false, can_change: false },
    { id: ownContributionId, amount_minor: 2_550, state: 'promised', note: null, contributor_name: 'Alex Morgan', recorded_at: '2026-09-19T10:03:00Z', mine: true, can_change: true },
  ],
  all_contributions: true, given_minor: 50_000, promised_minor: 2_550, contribution_count: 2,
  split: null, split_candidates: [{ account_id: otherId, name: 'Sam' }],
  can_manage: true, can_record: true, etag: '"budget-1"', ...overrides,
});

test('Budget BFF forwards only the budget routes', async () => {
  for (const [method, route] of [
    ['GET', `events/${eventId}/budget`], ['PUT', `events/${eventId}/budget`], ['POST', `events/${eventId}/expenses`],
    ['DELETE', `events/${eventId}/expenses/${otherId}`], ['POST', `events/${eventId}/contributions`],
    ['PUT', `events/${eventId}/contributions/${otherId}`], ['DELETE', `events/${eventId}/contributions/${otherId}`],
    ['PUT', `events/${eventId}/budget/split`], ['DELETE', `events/${eventId}/budget/split`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.method, method);
    if (method !== 'GET') {
      assert.equal(upstream.options.headers['Idempotency-Key'], key);
      assert.equal(upstream.options.headers['If-Match'], '"v1"');
    }
  }
  for (const [method, route] of [
    ['DELETE', `events/${eventId}/budget`], ['PATCH', `events/${eventId}/budget`], ['POST', `events/${eventId}/budget`],
    ['GET', `events/${eventId}/expenses`], ['DELETE', `events/${eventId}/expenses`], ['POST', `events/${eventId}/expenses/${otherId}`],
    ['GET', `events/${eventId}/expenses/${otherId}`], ['PUT', `events/${eventId}`], ['DELETE', `events/${eventId}/expenses/not-an-id`],
    ['GET', `events/${eventId}/contributions`], ['PUT', `events/${eventId}/contributions`], ['POST', `events/${eventId}/contributions/${otherId}`],
    ['PATCH', `events/${eventId}/contributions/${otherId}`], ['GET', `events/${eventId}/contributions/${otherId}`],
    ['DELETE', `events/${eventId}/contributions/not-an-id`],
    ['GET', `events/${eventId}/budget/split`], ['POST', `events/${eventId}/budget/split`], ['PATCH', `events/${eventId}/budget/split`],
    ['PUT', `events/${eventId}/budget/split/${otherId}`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [['PUT', `events/${eventId}/budget?currency=USD`], ['POST', `events/${eventId}/expenses?as=${otherId}`], ['GET', `events/${eventId}/budget?limit=5`]]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 400, `${method} ${route}`);
    assert.equal(proxy.calls.filter(call => !call.url.endsWith('/v1/me')).length, 0);
  }
});

test('Budget money is read and shown in exact paise or cents', () => {
  const client = budgetClient();
  for (const [text, expected] of [
    ['0.1', 10], ['0.10', 10], ['1,234.5', 123450], [' 1500 ', 150000], ['250.75', 25075], ['0', 0],
    ['1000000000', 100_000_000_000], ['1000000000.00', 100_000_000_000],
  ]) assert.equal(client.parseMinor(text), expected, text);
  for (const text of ['', '.5', '1.234', '-5', '1e3', '1000000000.01', '12a', '\u0661\u0662', '1..2', 'NaN', 'Infinity']) {
    assert.equal(client.parseMinor(text), null, text);
  }
  for (const [value, expected] of [[123450, '1234.50'], [5, '0.05'], [0, '0.00'], [-1_833_333, '-18333.33'], [100_000_333_368, '1000003333.68']]) {
    assert.equal(client.minorText(value), expected, String(value));
  }
  // The largest possible total still shows every paisa.
  assert.equal(client.formatMoney(100_000_333_368, 'INR', 'en'), new Intl.NumberFormat('en', { style: 'currency', currency: 'INR' }).format(1000003333.68));
  assert.match(client.formatMoney(100_000_333_368, 'INR', 'en'), /1,000,003,333\.68$/);
  assert.match(client.formatMoney(20_000_000_000_000, 'USD', 'en'), /200,000,000,000\.00$/);
  assert.equal(client.formatMoney(-1_833_333, 'USD', 'en'), '-$18,333.33');
  assert.equal(client.formatMoney(30, 'EUR', 'en'), '€0.30');
});

test('Budget responses that do not add up are refused', () => {
  const client = budgetClient();
  assert.equal(client.budgetSchema.safeParse(budget()).success, true);
  assert.equal(client.budgetSchema.safeParse(budget({
    currency: null, categories: [], expenses: [], estimate_minor: 0, recorded_minor: 0, uncategorized_minor: 0, remaining_minor: 0, can_record: false,
    contributions: [], given_minor: 0, promised_minor: 0, contribution_count: 0,
  })).success, true);
  const [milk, bread, loose] = budget().expenses;
  const [gift, promise] = budget().contributions;
  // Someone who does not manage the budget sees only their own contributions, inside the totals for everyone.
  assert.equal(client.budgetSchema.safeParse(budget({
    all_contributions: false, contributions: [promise], given_minor: 60_000, promised_minor: 2_550, contribution_count: 5,
  })).success, true);
  for (const changes of [
    { recorded_minor: 36 }, { uncategorized_minor: 0 }, { remaining_minor: 999_965 }, { estimate_minor: 1_000_000 },
    { categories: [{ id: categoryId, name: 'Food', estimate_minor: 999_999, recorded_minor: 30, remaining_minor: 0 }] },
    { categories: [{ id: categoryId, name: 'Food', estimate_minor: 999_999, recorded_minor: 31, remaining_minor: 999_968 }] },
    { expenses: [milk, { ...bread, category_id: otherId }, loose] },
    { expenses: [milk, { ...bread, id: expenseId }, loose] },
    { expenses: [milk, { ...bread, amount_minor: 10.5 }, loose], recorded_minor: 35.5 },
    { expenses: [{ ...milk, amount_minor: 0 }, bread, loose] },
    { currency: 'JPY' }, { can_manage: true, etag: null }, { event_id: 'not-an-id' },
    { currency: null, can_record: false },
    { given_minor: 50_001 }, { promised_minor: 0 }, { contribution_count: 3 },
    { contributions: [{ ...gift, can_change: true }, promise] },
    { contributions: [gift, { ...promise, id: contributionId }] },
    { contributions: [{ ...gift, state: 'paid' }, promise] },
    { contributions: [gift, { ...promise, note: '' }] },
    { all_contributions: false },
    { all_contributions: false, contributions: [promise], promised_minor: 100 },
    { all_contributions: false, contributions: [promise], contribution_count: 0 },
    { currency: null, categories: [], expenses: [], estimate_minor: 0, recorded_minor: 0, uncategorized_minor: 0, remaining_minor: 0, can_record: false,
      contributions: [], given_minor: 0, promised_minor: 0, contribution_count: 1, all_contributions: false },
  ]) {
    assert.equal(client.budgetSchema.safeParse(budget(changes)).success, false, JSON.stringify(changes));
  }
});

test('Budget plans and expenses are checked before sending, and every change is confirmed by the answer', async () => {
  const client = budgetClient();
  assert.equal(client.planProblem('', []), 'Choose a currency.');
  assert.equal(client.planProblem('INR', []), null);
  assert.equal(client.planProblem('INR', [{ id: null, name: ' ', estimate: '1' }]), 'Name each category.');
  assert.equal(client.planProblem('INR', [{ id: null, name: 'Food', estimate: '1' }, { id: null, name: ' food ', estimate: '' }]), 'Give each category a different name.');
  assert.equal(client.planProblem('INR', [{ id: null, name: 'Food', estimate: '1.234' }]), 'Enter each planned amount as a number, such as 1500 or 1500.50.');
  assert.equal(client.planProblem('INR', [{ id: null, name: 'x'.repeat(61), estimate: '1' }]), 'Category names can have up to 60 characters.');
  assert.equal(client.planProblem('INR', Array.from({ length: 31 }, (_, index) => ({ id: null, name: `Part ${index}`, estimate: '1' }))), 'A budget can have up to 30 categories.');
  assert.deepEqual(JSON.parse(JSON.stringify(client.planBody('INR', [{ id: categoryId, name: '  Food   and drink ', estimate: '1,500.5' }, { id: null, name: 'Gifts', estimate: '' }]))), {
    currency: 'INR', categories: [{ id: categoryId, name: 'Food and drink', estimate_minor: 150050 }, { name: 'Gifts', estimate_minor: 0 }],
  });
  assert.equal(client.expenseProblem({ amount: '0', categoryId: '', note: 'Bread' }), 'Enter an amount, such as 250 or 250.75.');
  assert.equal(client.expenseProblem({ amount: '10', categoryId: '', note: '  ' }), 'Add a short note about what it was for.');
  assert.equal(client.expenseProblem({ amount: '10', categoryId: '', note: 'x'.repeat(121) }), 'Notes can have up to 120 characters.');
  assert.equal(client.expenseProblem({ amount: '10', categoryId: '', note: 'Gift\u202e' }), 'Remove control characters.');
  assert.deepEqual(JSON.parse(JSON.stringify(client.expenseBody({ amount: '0.10', categoryId: categoryId, note: ' Bread ' }))), { amount_minor: 10, note: 'Bread', category_id: categoryId });
  assert.deepEqual(JSON.parse(JSON.stringify(client.expenseBody({ amount: '5', categoryId: '', note: 'Tip' }))), { amount_minor: 500, note: 'Tip' });

  const calls = [];
  const recording = budgetClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: budget() }); });
  const intent = { accountId, eventId, key, body: { amount_minor: 10, note: 'Bread', category_id: categoryId } };
  await recording.recordExpense(intent);
  await recording.recordExpense(intent);
  assert.equal(calls[0].url, `/api/events/${eventId}/expenses`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  await assert.rejects(recording.recordExpense({ ...intent, body: { amount_minor: 11, note: 'Bread', category_id: categoryId } }), { status: 502 });
  await assert.rejects(budgetClient(async () => Response.json({ data: budget({ event_id: otherId }) })).recordExpense(intent), { status: 502 });
  await recording.deleteExpense(accountId, eventId, otherId);
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.equal(calls.at(-1).options.body, '{}');
  await assert.rejects(recording.deleteExpense(accountId, eventId, expenseId), { status: 502 });
  const plan = { currency: 'INR', categories: [{ id: categoryId, name: 'Food', estimate_minor: 999_999 }] };
  await recording.saveBudget(accountId, eventId, '"budget-1"', plan);
  assert.equal(calls.at(-1).options.method, 'PUT');
  assert.equal(calls.at(-1).options.headers['If-Match'], '"budget-1"');
  await assert.rejects(recording.saveBudget(accountId, eventId, '"budget-1"', { ...plan, currency: 'USD' }), { status: 502 });
});

test('Contributions are checked before sending, carry their state, and every change is confirmed by the answer', async () => {
  const client = budgetClient();
  assert.equal(client.contributionProblem({ amount: '0', state: 'given', note: '' }), 'Enter an amount, such as 250 or 250.75.');
  assert.equal(client.contributionProblem({ amount: '10', state: '', note: '' }), 'Choose promised or given.');
  assert.equal(client.contributionProblem({ amount: '10', state: 'paid', note: '' }), 'Choose promised or given.');
  assert.equal(client.contributionProblem({ amount: '10', state: 'given', note: 'x'.repeat(121) }), 'Notes can have up to 120 characters.');
  assert.equal(client.contributionProblem({ amount: '10', state: 'given', note: 'Gift\u202e' }), 'Remove control characters.');
  assert.equal(client.contributionProblem({ amount: '10', state: 'promised', note: '   ' }), null);
  // A blank note is left out, so the request matches the one without a note.
  assert.deepEqual(JSON.parse(JSON.stringify(client.contributionBody({ amount: '25.5', state: 'promised', note: '   ' }))), { amount_minor: 2550, state: 'promised' });
  assert.deepEqual(JSON.parse(JSON.stringify(client.contributionBody({ amount: '500', state: 'given', note: ' Cash  to Sam ' }))), { amount_minor: 50000, state: 'given', note: 'Cash to Sam' });

  const calls = [];
  const recording = budgetClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: budget() }); });
  const intent = { accountId, eventId, key, body: { amount_minor: 2_550, state: 'promised' } };
  await recording.recordContribution(intent);
  await recording.recordContribution(intent);
  assert.equal(calls[0].url, `/api/events/${eventId}/contributions`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.deepEqual(JSON.parse(calls[0].options.body), { amount_minor: 2_550, state: 'promised' });
  // Only one's own contribution with the same amount, state and note confirms the record.
  for (const body of [{ amount_minor: 2_551, state: 'promised' }, { amount_minor: 2_550, state: 'given' }, { amount_minor: 2_550, state: 'promised', note: 'Late' }, { amount_minor: 50_000, state: 'given', note: 'Cash to Sam' }]) {
    await assert.rejects(recording.recordContribution({ ...intent, body }), { status: 502 }, JSON.stringify(body));
  }
  await recording.changeContribution(accountId, eventId, ownContributionId, 'promised');
  assert.equal(calls.at(-1).url, `/api/events/${eventId}/contributions/${ownContributionId}`);
  assert.equal(calls.at(-1).options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { state: 'promised' });
  await assert.rejects(recording.changeContribution(accountId, eventId, ownContributionId, 'given'), { status: 502 });
  await assert.rejects(recording.changeContribution(accountId, eventId, contributionId, 'given'), { status: 502 });
  await recording.withdrawContribution(accountId, eventId, otherId);
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.equal(calls.at(-1).options.body, '{}');
  await assert.rejects(recording.withdrawContribution(accountId, eventId, ownContributionId), { status: 502 });
});

// DEC-042 (T174): splits divide the current total exactly and say how they were rounded.
const share = (account, name, mine, value, shareMinor, roundedUp = false) => ({ account_id: account, name, mine, value, share_minor: shareMinor, rounded_up: roundedUp });
const equalSplit = {
  method: 'equal', base: 'planned', base_minor: 999_999, people_count: 2, all_shares: true, allocated_minor: 999_999, difference_minor: 0, rounding_count: 1,
  shares: [share(accountId, 'Alex Morgan', true, null, 500_000, true), share(otherId, 'Sam', false, null, 499_999)],
};

test('Split responses must divide the current total and account for every rounded share', () => {
  const client = budgetClient();
  const thirds = {
    method: 'percentages', base: 'recorded', base_minor: 35, people_count: 3, all_shares: true, allocated_minor: 35, difference_minor: 0, rounding_count: 2,
    shares: [share(accountId, 'Alex Morgan', true, 3_333, 12, true), share(otherId, 'Sam', false, 3_333, 11), share(null, null, false, 3_334, 12, true)],
  };
  const set = {
    method: 'amounts', base: 'planned', base_minor: 999_999, people_count: 2, all_shares: true, allocated_minor: 900_000, difference_minor: 99_999, rounding_count: 0,
    shares: [share(accountId, 'Alex Morgan', true, 600_000, 600_000), share(otherId, 'Sam', false, 300_000, 300_000)],
  };
  const member = { can_manage: false, etag: null, split_candidates: [] };
  for (const split of [equalSplit, thirds, set]) assert.equal(client.budgetSchema.safeParse(budget({ split })).success, true, split.method);
  assert.equal(client.budgetSchema.safeParse(budget({ ...member, split: { ...equalSplit, all_shares: false, shares: [equalSplit.shares[0]] } })).success, true);
  assert.equal(client.budgetSchema.safeParse(budget({ ...member, split: { ...set, all_shares: false, shares: [] } })).success, true);
  for (const changes of [
    { split: { ...equalSplit, base_minor: 1 } }, { split: { ...equalSplit, base: 'recorded' } },
    { split: { ...equalSplit, difference_minor: 1 } }, { split: { ...equalSplit, allocated_minor: 999_998, difference_minor: 1 } },
    { split: { ...equalSplit, rounding_count: 0 } }, { split: { ...equalSplit, people_count: 3 } },
    { split: { ...equalSplit, shares: [share(accountId, 'Alex Morgan', true, null, 500_001, true), share(otherId, 'Sam', false, null, 499_998)] } },
    { split: { ...equalSplit, shares: [share(accountId, 'Alex Morgan', true, 1, 500_000, true), share(otherId, 'Sam', false, null, 499_999)] } },
    { split: { ...thirds, shares: [thirds.shares[0], thirds.shares[1], share(null, null, false, 3_333, 12, true)] } },
    { split: { ...set, rounding_count: 1 } }, { split: { ...set, shares: [set.shares[0], share(otherId, 'Sam', false, 300_000, 299_999)] } },
    { split: { ...equalSplit, method: 'shares' } },
    { ...member, split: { ...equalSplit, all_shares: false } },
    { ...member, split: { ...equalSplit, all_shares: false, shares: [equalSplit.shares[1]] } },
    { ...member, split_candidates: [{ account_id: otherId, name: 'Sam' }] },
    { currency: null, categories: [], expenses: [], estimate_minor: 0, recorded_minor: 0, uncategorized_minor: 0, remaining_minor: 0, can_record: false,
      contributions: [], given_minor: 0, promised_minor: 0, contribution_count: 0, split: { ...equalSplit, base_minor: 0, allocated_minor: 0, shares: [], all_shares: false, rounding_count: 0 } },
  ]) {
    assert.equal(client.budgetSchema.safeParse(budget(changes)).success, false, JSON.stringify(changes));
  }
});

test('Splits are checked before sending, carry exact percentages and amounts, and are confirmed by the answer', async () => {
  const client = budgetClient();
  for (const [text, expected] of [['33.33', 3_333], ['100', 10_000], ['0', 0], [' 12.5 ', 1_250], ['0.05', 5]]) assert.equal(client.parsePercent(text), expected, text);
  for (const text of ['', '100.01', '33.333', '-1', '1e2', '50%', '.5']) assert.equal(client.parsePercent(text), null, text);
  assert.deepEqual([client.percentText(3_333), client.percentText(10_000), client.percentText(5)], ['33.33', '100.00', '0.05']);
  const person = (accountIdValue, value = '') => ({ accountId: accountIdValue, value });
  assert.equal(client.splitProblem({ method: 'equal', base: 'planned', people: [] }), 'Choose at least one person.');
  assert.equal(client.splitProblem({ method: 'equal', base: 'planned', people: [person(accountId)] }), null);
  assert.equal(client.splitProblem({ method: 'percentages', base: 'planned', people: [person(accountId, '50'), person(otherId, 'half')] }), 'Enter each percentage as a number from 0 to 100, such as 33.33.');
  assert.equal(client.splitProblem({ method: 'percentages', base: 'planned', people: [person(accountId, '50'), person(otherId, '49.99')] }), 'The percentages must add up to 100.');
  assert.equal(client.splitProblem({ method: 'percentages', base: 'planned', people: [person(accountId, '50'), person(otherId, '50.00')] }), null);
  assert.equal(client.splitProblem({ method: 'amounts', base: 'planned', people: [person(accountId, '1.234')] }), 'Enter each amount as a number, such as 1500 or 1500.50.');
  assert.deepEqual(JSON.parse(JSON.stringify(client.splitBody({ method: 'equal', base: 'recorded', people: [person(accountId, '5')] }))), {
    method: 'equal', base: 'recorded', people: [{ account_id: accountId }],
  });
  assert.deepEqual(client.splitBody({ method: 'percentages', base: 'planned', people: [person(accountId, '33.33'), person(otherId, '66.67')] }).people.map(item => item.value), [3_333, 6_667]);
  assert.deepEqual(client.splitBody({ method: 'amounts', base: 'planned', people: [person(accountId, '1,500.5'), person(otherId, '0')] }).people.map(item => item.value), [150_050, 0]);

  const calls = [];
  let answer = budget({ split: equalSplit });
  const recording = budgetClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: answer }); });
  const body = client.splitBody({ method: 'equal', base: 'planned', people: [person(accountId), person(otherId)] });
  await recording.saveSplit(accountId, eventId, '"budget-1"', body);
  assert.equal(calls[0].url, `/api/events/${eventId}/budget/split`);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers['If-Match'], '"budget-1"');
  assert.deepEqual(JSON.parse(calls[0].options.body), JSON.parse(JSON.stringify(body)));
  for (const other of [{ ...body, method: 'amounts' }, { ...body, base: 'recorded' }, { ...body, people: body.people.slice(0, 1) }]) {
    await assert.rejects(recording.saveSplit(accountId, eventId, '"budget-1"', other), { status: 502 }, JSON.stringify(other));
  }
  await assert.rejects(recording.removeSplit(accountId, eventId, '"budget-2"'), { status: 502 });
  answer = budget();
  await recording.removeSplit(accountId, eventId, '"budget-2"');
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.equal(calls.at(-1).options.headers['If-Match'], '"budget-2"');
  assert.equal(calls.at(-1).options.body, '{}');
});
