import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// DEC-032 (T154): an event capacity and the line of people waiting to go.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const eventId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: 'https://client.example.test' } },
  }, { filename: relative });
  return exports;
}

function eventsClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  return loadSource('features/events/client.ts', fetch, { '@/features/identity/client': loadSource('features/identity/client.ts', fetch) });
}

const event = (overrides = {}) => ({
  id: eventId, space_id: spaceId, space_name: 'Morgan family', title: 'Dinner', description: '', location: 'Home',
  timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: null, starts_at: '2026-09-25T13:00:00Z', ends_at: null,
  status: 'scheduled', ended: false, created_by_name: 'Alex Morgan', created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z',
  schedule_changed_at: null, cancelled_at: null, going: 0, maybe: 0, not_going: 0, my_response: null, my_response_outdated: false,
  can_manage: true, can_respond: true, etag: '"v1"', attendees: [], ...overrides,
});
const attendee = (overrides = {}) => ({ name: 'Ravi', response: 'going', responded_at: '2026-09-19T10:00:00Z', outdated: false, mine: false, waitlist_position: null, ...overrides });
const form = (overrides = {}) => ({ title: 'Dinner', description: '', location: '', timezone: 'Asia/Kolkata', local_start: '2026-09-25T18:30', local_end: '', capacity: '', ...overrides });

test('An event answer from before capacities reads as having no limit and nobody waiting', () => {
  const parsed = eventsClient().eventSchema.parse(event({ attendees: [attendee({ waitlist_position: undefined })] }));
  assert.deepEqual([parsed.capacity, parsed.waitlisted, parsed.my_waitlist_position, parsed.attendees[0].waitlist_position], [null, 0, null, null]);
});

test('Capacity facts that contradict each other are refused', () => {
  const client = eventsClient();
  const full = { capacity: 2, going: 2, waitlisted: 2, my_response: 'going', my_waitlist_position: 2 };
  assert.equal(client.eventSchema.safeParse(event(full)).success, true);
  assert.equal(client.eventSchema.safeParse(event({ ...full, attendees: [attendee({ waitlist_position: 1 }), attendee({ mine: true, waitlist_position: 2 })] })).success, true);
  for (const changes of [
    { capacity: null, waitlisted: 1 }, { capacity: null, my_waitlist_position: 1, my_response: 'going' }, { going: 3 },
    { going: 1 }, { my_response: 'maybe' }, { my_waitlist_position: 3 }, { capacity: 0, going: 0, waitlisted: 0, my_waitlist_position: null },
    { capacity: 501, going: 2 }, { attendees: [attendee({ response: 'maybe', waitlist_position: 1 })] },
    { attendees: [attendee({ waitlist_position: 3 })] }, { my_waitlist_position: 0 },
  ]) {
    assert.equal(client.eventSchema.safeParse(event({ ...full, ...changes })).success, false, JSON.stringify(changes));
  }
});

test('The form sends a capacity only when one is set, and checks it is a whole number from 1 to 500', () => {
  const client = eventsClient();
  assert.equal('capacity' in client.eventBody(form()), false);
  assert.equal('capacity' in client.eventBody({ ...form(), capacity: undefined }), false);
  assert.equal(client.eventBody(form({ capacity: ' 12 ' })).capacity, 12);
  assert.equal(client.formProblem(form({ capacity: '500' })), null);
  for (const capacity of ['0', '501', '2.5', '-1', 'ten', '1e2', '0012']) {
    assert.equal(client.formProblem(form({ capacity })), 'Enter a whole number from 1 to 500, or leave it empty.', capacity);
  }
  assert.equal(client.formFromEvent(client.eventSchema.parse(event({ capacity: 8 }))).capacity, '8');
  assert.equal(client.formFromEvent(client.eventSchema.parse(event())).capacity, '');
});

test('An edit removes a capacity only when its field is emptied, and a create must come back with the capacity sent', async () => {
  const sent = [];
  const client = eventsClient(async (url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ data: event({ capacity: sent.at(-1).capacity ?? null }) }); });
  const limited = client.eventSchema.parse(event({ capacity: 6 }));
  const open = client.eventSchema.parse(event());
  await client.updateEvent(accountId, limited, client.eventBody(form()));
  assert.equal(sent.at(-1).capacity, null);
  await client.updateEvent(accountId, limited, client.eventBody(form({ capacity: '7' })));
  assert.equal(sent.at(-1).capacity, 7);
  await client.updateEvent(accountId, open, client.eventBody(form()));
  assert.equal('capacity' in sent.at(-1), false);
  const created = await client.createEvent({ accountId, spaceId, key, body: client.eventBody(form({ capacity: '4' })) });
  assert.equal(created.capacity, 4);
  const lost = eventsClient(async () => Response.json({ data: event() }));
  await assert.rejects(lost.createEvent({ accountId, spaceId, key, body: client.eventBody(form({ capacity: '4' })) }), { status: 502 });
});
