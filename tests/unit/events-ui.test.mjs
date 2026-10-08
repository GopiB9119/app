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
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const clubId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const eventId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { EventsScreen } from './src/features/events/events-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderEventsFixture = (spaceId, eventId = '') => root.render(<Providers><EventsScreen initialSpaceId={spaceId} initialEventId={eventId} /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-events.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-events.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-events-dependencies', setup(builder) {
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

// Two Spaces; the first has one upcoming event the person manages. Saves are refused unless If-Match names the stored
// version, and creation is idempotent by its key, as the API does. `loseCreates` saves an event but loses the response.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  const fixtureUrl = 'http://127.0.0.1:3000/offline-events';
  await context.route('**/*', route => {
    if (route.request().resourceType() === 'document' && route.request().url() === fixtureUrl) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><title>Offline events</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(route.request().url()); return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixtureUrl);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, clubId, eventId, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const created = '2026-09-19T10:00:00Z';
    const event = {
      id: eventId, space_id: spaceId, space_name: 'Morgan family', title: 'Picnic', description: 'Bring a blanket.', location: 'Riverside park',
      timezone: 'UTC', local_start: '2026-10-10T12:00', local_end: null, starts_at: '2026-10-10T12:00:00Z', ends_at: null,
      status: 'scheduled', ended: false, created_by_name: 'Alex Morgan', created_at: created, updated_at: created,
      schedule_changed_at: null, cancelled_at: null, going: 0, maybe: 0, not_going: 0, my_response: null, my_response_outdated: false,
      can_manage: true, can_respond: true, etag: '"event-1"',
      ...options.event,
    };
    // An event a search result names can be one the upcoming list does not show.
    const past = options.pastEvent ? {
      ...event, id: options.pastEvent, title: 'Autumn lunch', local_start: '2026-09-01T12:00', starts_at: '2026-09-01T12:00:00Z',
      ended: true, past: true, can_respond: false, etag: '"event-past-1"',
    } : null;
    const state = window.eventsFixture = {
      calls: [], servedDetail: null, event, events: past ? [event, past] : [event], byKey: {}, loseCreates: options.loseCreates ?? 0,
      holdNextDetail: false, held: null, heldSettled: false,
      holdSaves: options.holdSaves ?? false, releaseSave: null, failDetail: false,
      createError: options.createError ?? null, patchError: options.patchError ?? null, attendees: null,
      holdZones: options.holdZones ?? false, zoneUnavailable: options.zoneUnavailable ?? false, releaseZones: null,
      budgets: options.budget ? { [eventId]: options.budget } : {}, budgetManager: options.budgetManager ?? true, loseExpenses: options.loseExpenses ?? 0,
      expenseKeys: {}, loseContributions: options.loseContributions ?? 0, contributionKeys: {},
      candidates: options.candidates ?? [{ account_id: accountId, name: 'Alex Morgan' }],
    };
    const spaces = [[spaceId, 'Morgan family'], [clubId, 'Garden club']].map(([id, name]) => ({
      id, name, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created,
    }));
    Object.assign(spaces[0], options.spaceFields ?? {});
    Object.assign(spaces[1], options.clubFields ?? {});
    state.spaces = spaces;
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-events', ...extra }), { status: 200 });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failed = (status, code, message, details = {}) => new Response(JSON.stringify({ error: { code, message, details }, request_id: 'offline-events' }), { status });
    const timezones = ['America/New_York', 'Asia/Kolkata', 'Europe/London', 'UTC'];
    // Budgets (DEC-039) worked out from the stored amounts each time, as the API does.
    const budgetView = id => {
      const plan = state.budgets[id] ??= { currency: null, categories: [], expenses: [], version: 0 };
      const open = state.events.find(item => item.id === id).status === 'scheduled';
      const sum = values => values.reduce((total, value) => total + value, 0);
      const recordedIn = category => sum(plan.expenses.filter(item => item.category_id === category).map(item => item.amount_minor));
      const estimate = sum(plan.categories.map(item => item.estimate_minor));
      const recorded = sum(plan.expenses.map(item => item.amount_minor));
      // Contributions (DEC-041): totals for everyone; who gave what only for the person and the managers.
      const gifts = plan.contributions ??= [];
      const given = kind => sum(gifts.filter(item => item.state === kind).map(item => item.amount_minor));
      // Splits (DEC-042) divided from the current total each time, rounded as the API rounds them.
      let split = null;
      if (plan.split) {
        const base = plan.split.base === 'planned' ? estimate : recorded;
        const values = plan.split.people.map(item => item.value);
        let divided;
        if (plan.split.method === 'amounts') divided = values.map(value => [value, false]);
        else if (plan.split.method === 'equal') {
          const each = Math.floor(base / values.length), extra = base % values.length;
          divided = values.map((_, index) => index < extra ? [each + 1, true] : [each, false]);
        } else {
          const exact = values.map(value => base * value), floors = exact.map(part => Math.floor(part / 10000));
          const order = [...exact.keys()].sort((a, b) => (exact[b] % 10000) - (exact[a] % 10000) || a - b);
          const extra = new Set(order.slice(0, Math.max(base - sum(floors), 0)));
          divided = floors.map((floor, index) => extra.has(index) ? [floor + 1, true] : [floor, false]);
        }
        const shares = plan.split.people.map((item, index) => ({ ...item, share_minor: divided[index][0], rounded_up: divided[index][1] }));
        const allocated = sum(divided.map(item => item[0]));
        split = {
          method: plan.split.method, base: plan.split.base, base_minor: base, people_count: shares.length,
          shares: state.budgetManager ? shares : shares.filter(item => item.mine), all_shares: state.budgetManager,
          allocated_minor: allocated, difference_minor: base - allocated, rounding_count: divided.filter(item => item[1]).length,
        };
      }
      return {
        event_id: id, currency: plan.currency,
        categories: plan.categories.map(item => ({ ...item, recorded_minor: recordedIn(item.id), remaining_minor: item.estimate_minor - recordedIn(item.id) })),
        expenses: [...plan.expenses].reverse().map(item => ({ ...item, can_delete: open && (item.mine || state.budgetManager) })),
        estimate_minor: estimate, recorded_minor: recorded, uncategorized_minor: recordedIn(null), remaining_minor: estimate - recorded,
        contributions: gifts.filter(item => item.mine || state.budgetManager).reverse().map(item => ({ ...item, can_change: open && item.mine })),
        all_contributions: state.budgetManager, given_minor: given('given'), promised_minor: given('promised'), contribution_count: gifts.length,
        split, split_candidates: state.budgetManager && open && plan.currency !== null ? state.candidates : [],
        can_manage: state.budgetManager && open, can_record: open && plan.currency !== null,
        etag: state.budgetManager ? `"budget-${plan.version}"` : null,
      };
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged(spaces);
      if (url.pathname === '/api/timezones' && method === 'GET') {
        if (state.zoneUnavailable) return failed(503, 'UNAVAILABLE', 'Synthetic timezone outage.');
        if (state.holdZones) return new Promise(resolve => { state.releaseZones = () => { state.holdZones = false; resolve(reply(timezones)); }; });
        return reply(timezones);
      }
      const list = url.pathname.match(/^\/api\/spaces\/([^/]+)\/events$/);
      if (list && method === 'GET') {
        return paged(url.searchParams.get('when') === 'upcoming' ? state.events.filter(item => item.space_id === list[1] && !item.past) : []);
      }
      if (list && method === 'POST') {
        if (state.createError) return failed(state.createError.status, state.createError.code, state.createError.message, state.createError.details);
        if (!timezones.includes(body.timezone)) return failed(422, 'VALIDATION_ERROR', 'Choose a supported time zone.');
        if (state.holdSaves) await new Promise(resolve => { state.releaseSave = resolve; });
        const key = headers['idempotency-key'];
        if (!state.byKey[key]) {
          const space = spaces.find(item => item.id === list[1]);
          state.byKey[key] = {
            ...event, ...body, id: crypto.randomUUID(), space_id: space.id, space_name: space.name, starts_at: `${body.local_start}:00Z`,
            ends_at: null, local_end: null, etag: '"event-new-1"',
          };
          state.events.push(state.byKey[key]);
          if (state.loseCreates > 0) { state.loseCreates -= 1; throw new TypeError('Synthetic lost response after the event was saved'); }
        }
        return reply(state.byKey[key]);
      }
      const detail = url.pathname.match(/^\/api\/events\/([^/]+)(\/alert)?$/);
      const found = detail && state.events.find(item => item.id === detail[1]);
      if (detail && !found && !detail[2] && method === 'GET') return failed(404, 'NOT_FOUND', 'Event not found.');
      if (found && !detail[2] && method === 'GET') {
        if (state.failDetail) return options.denyDetail
          ? failed(404, 'NOT_FOUND', 'Event not found.') : failed(503, 'UNAVAILABLE', 'Synthetic detail outage.');
        if (state.holdNextDetail) {
          // A held read answers with the event as it was when the read began, once released; aborting it rejects it.
          state.holdNextDetail = false;
          const before = { ...found, attendees: [] };
          return new Promise((resolve, reject) => {
            state.held = { release: () => { state.heldSettled = true; resolve(reply(before)); } };
            config.signal?.addEventListener('abort', () => { state.heldSettled = true; reject(new DOMException('Aborted', 'AbortError')); });
          });
        }
        state.servedDetail = found.etag;
        return reply({ ...found, attendees: state.attendees ?? [] });
      }
      if (found && detail[2] && method === 'GET') return reply({ event_id: found.id, minutes_before: null });
      if (found && !detail[2] && method === 'PATCH') {
        if (state.patchError) return failed(state.patchError.status, state.patchError.code, state.patchError.message);
        if (headers['if-match'] !== found.etag) return failed(412, 'EVENT_CHANGED', 'This event changed since you reviewed it. Reload to continue.');
        if (!timezones.includes(body.timezone)) return failed(422, 'VALIDATION_ERROR', 'Choose a supported time zone.');
        Object.assign(found, body, { etag: `"event-${Number(found.etag.slice(7, -1)) + 1}"` });
        return reply(found);
      }
      const budget = url.pathname.match(/^\/api\/events\/([^/]+)\/(budget|expenses|contributions)(?:\/([^/]+))?$/);
      if (budget && state.events.some(item => item.id === budget[1])) {
        const id = budget[1];
        const plan = (budgetView(id), state.budgets[id]);
        if (budget[2] === 'budget' && !budget[3] && method === 'GET') return reply(budgetView(id));
        if (budget[2] === 'budget' && budget[3] === 'split' && (method === 'PUT' || method === 'DELETE')) {
          if (headers['if-match'] !== `"budget-${plan.version}"`) return failed(412, 'BUDGET_CHANGED', 'This budget changed since you reviewed it. Reload to continue.');
          if (method === 'DELETE') {
            if (plan.split) { plan.split = null; plan.version += 1; }
            return reply(budgetView(id));
          }
          plan.split = { method: body.method, base: body.base, people: body.people.map(item => ({
            account_id: item.account_id, name: state.candidates.find(candidate => candidate.account_id === item.account_id).name,
            mine: item.account_id === accountId, value: item.value ?? null,
          })) };
          plan.version += 1;
          return reply(budgetView(id));
        }
        if (budget[2] === 'budget' && !budget[3] && method === 'PUT') {
          if (headers['if-match'] !== `"budget-${plan.version}"`) return failed(412, 'BUDGET_CHANGED', 'This budget changed since you reviewed it. Reload to continue.');
          const kept = new Set(body.categories.filter(item => item.id).map(item => item.id));
          if (plan.categories.some(item => !kept.has(item.id) && plan.expenses.some(expense => expense.category_id === item.id))) {
            return failed(409, 'CATEGORY_IN_USE', 'Expenses are recorded in this category.');
          }
          if ((plan.expenses.length > 0 || plan.contributions.length > 0 || plan.split) && plan.currency !== body.currency) {
            return failed(409, 'BUDGET_CURRENCY_LOCKED', 'The currency can change only while no expense, contribution or split is recorded.');
          }
          plan.currency = body.currency;
          plan.categories = body.categories.map(item => ({ id: item.id ?? crypto.randomUUID(), name: item.name, estimate_minor: item.estimate_minor }));
          plan.version += 1;
          return reply(budgetView(id));
        }
        if (budget[2] === 'expenses' && !budget[3] && method === 'POST') {
          const key = headers['idempotency-key'];
          if (!state.expenseKeys[key]) {
            state.expenseKeys[key] = true;
            plan.expenses.push({
              id: crypto.randomUUID(), amount_minor: body.amount_minor, category_id: body.category_id ?? null, note: body.note,
              recorded_by_name: 'Alex Morgan', recorded_at: '2026-09-19T10:05:00Z', mine: true,
            });
            if (state.loseExpenses > 0) { state.loseExpenses -= 1; throw new TypeError('Synthetic lost response after the expense was recorded'); }
          }
          return reply(budgetView(id));
        }
        if (budget[2] === 'expenses' && budget[3] && method === 'DELETE') {
          plan.expenses = plan.expenses.filter(item => item.id !== budget[3]);
          return reply(budgetView(id));
        }
        if (budget[2] === 'contributions' && !budget[3] && method === 'POST') {
          const key = headers['idempotency-key'];
          if (!state.contributionKeys[key]) {
            state.contributionKeys[key] = true;
            plan.contributions.push({
              id: crypto.randomUUID(), amount_minor: body.amount_minor, state: body.state, note: body.note ?? null,
              contributor_name: 'Alex Morgan', recorded_at: '2026-09-19T10:06:00Z', mine: true,
            });
            if (state.loseContributions > 0) { state.loseContributions -= 1; throw new TypeError('Synthetic lost response after the contribution was recorded'); }
          }
          return reply(budgetView(id));
        }
        const gift = budget[2] === 'contributions' && budget[3] && plan.contributions.find(item => item.id === budget[3]);
        if (gift && !gift.mine) return failed(403, 'CONTRIBUTION_CHANGE_DENIED', 'Only the person who recorded a contribution can change or withdraw it.');
        if (budget[2] === 'contributions' && budget[3] && method === 'PUT') {
          if (!gift) return failed(404, 'CONTRIBUTION_NOT_FOUND', 'This contribution was withdrawn.');
          gift.state = body.state;
          return reply(budgetView(id));
        }
        if (budget[2] === 'contributions' && budget[3] && method === 'DELETE') {
          plan.contributions = plan.contributions.filter(item => item.id !== budget[3]);
          return reply(budgetView(id));
        }
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, spaceId, clubId, eventId, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(([id, opened]) => window.renderEventsFixture(id, opened), [options.initialSpaceId ?? spaceId, options.initialEventId ?? '']);
  await page.getByRole('button', { name: 'Picnic', exact: true }).waitFor();
  return { page, outbound, errors };
}

const pollId = 'ab3d7e52-5a3b-4f0e-9a61-0d4e6f2b7c11';
const firstChoiceId = 'bc2e8f63-6b4c-4a1f-8b72-1e5f7a3c8d22';
const secondChoiceId = 'cd3f9074-7c5d-4b20-9c83-2f6a8b4d9e33';
const pollTag = version => `"${version.toString(16).padStart(64, '0')}"`;
const pollSeed = (overrides = {}) => ({
  id: pollId, event_id: eventId, question: 'Which day?',
  options: [{ id: firstChoiceId, text: 'Saturday', votes: 0 }, { id: secondChoiceId, text: 'Sunday', votes: 0 }],
  status: 'open', total_votes: 0, my_option_id: null, vote_etag: pollTag(1), can_vote: true, can_close: true,
  etag: pollTag(2), created_at: '2026-10-07T10:00:00Z', closed_at: null, ...overrides,
});

async function pollFixture(context, options = {}) {
  const result = await fixture(context, options);
  await result.page.evaluate(({ options, initialPolls }) => {
    const state = window.eventsFixture;
    const originalFetch = window.fetch;
    Object.assign(state, {
      polls: initialPolls, pollCalls: [], pollCreates: {}, pollVotes: {}, pollRevision: 10,
      losePollCreates: options.losePollCreates ?? 0, losePollVotes: options.losePollVotes ?? 0, losePollCloses: options.losePollCloses ?? 0,
      pollReadError: options.pollReadError ?? null, pollWriteError: null, pollWriteOverride: null, pollAccessDenied: false,
      holdPollRead: false, releasePollRead: null, holdPollWrite: false, releasePollWrite: null,
    });
    const reply = data => new Response(JSON.stringify({ data, request_id: 'offline-event-polls' }), { status: 200 });
    const fail = (status, code) => new Response(JSON.stringify({ error: { code, message: 'Synthetic poll refusal.', details: {} } }), { status });
    const tag = () => `"${(++state.pollRevision).toString(16).padStart(64, '0')}"`;
    const view = poll => {
      const event = state.events.find(item => item.id === poll.event_id);
      const active = event.status === 'scheduled' && !event.ended;
      const open = active && poll.status === 'open';
      return { ...poll, status: open ? 'open' : 'closed', closed_at: open ? null : poll.closed_at ?? '2026-10-07T12:00:00Z',
        can_vote: open, can_close: open && event.can_manage, etag: event.can_manage ? poll.etag : null };
    };
    const writeReply = poll => reply({ ...view(poll), ...state.pollWriteOverride });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const route = url.pathname.match(/^\/api\/events\/([^/]+)\/polls(?:\/([^/]+))?(?:\/(vote|close))?$/);
      if (!route) return originalFetch(input, config);
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      state.pollCalls.push({ route: url.pathname, search: url.search, method, body, rawBody: config.body ?? null, headers });
      if (method !== 'GET' && state.holdPollWrite) {
        state.holdPollWrite = false;
        await new Promise(resolve => { state.releasePollWrite = resolve; });
      }
      if (state.pollAccessDenied) return fail(404, 'NOT_FOUND');
      const event = state.events.find(item => item.id === route[1]);
      if (!event) return fail(404, 'NOT_FOUND');
      const poll = route[2] && state.polls.find(item => item.id === route[2] && item.event_id === event.id);
      if (route[2] && !poll) return fail(404, 'NOT_FOUND');
      if (method === 'GET') {
        if (state.pollReadError) return fail(state.pollReadError.status, state.pollReadError.code);
        const snapshot = structuredClone(poll ? view(poll) : state.polls.filter(item => item.event_id === event.id).map(view));
        if (state.holdPollRead) {
          state.holdPollRead = false;
          return new Promise(resolve => { state.releasePollRead = () => resolve(reply(snapshot)); });
        }
        return reply(snapshot);
      }
      if (state.pollWriteError) return fail(state.pollWriteError.status, state.pollWriteError.code);
      const active = event.status === 'scheduled' && !event.ended;
      if (method === 'POST' && !route[2]) {
        if (!event.can_manage) return fail(403, 'EVENT_MANAGEMENT_DENIED');
        const key = headers['idempotency-key'];
        if (!key) return fail(428, 'PRECONDITION_REQUIRED');
        if (state.pollCreates[key]) {
          const previous = state.pollCreates[key];
          return previous.rawBody === config.body ? writeReply(state.polls.find(item => item.id === previous.id)) : fail(409, 'IDEMPOTENCY_CONFLICT');
        }
        if (!active) return fail(409, 'EVENT_CLOSED');
        if (state.polls.filter(item => item.event_id === event.id).length >= 20) return fail(409, 'POLL_LIMIT_REACHED');
        const created = { id: crypto.randomUUID(), event_id: event.id, question: body.question,
          options: body.options.map(text => ({ id: crypto.randomUUID(), text, votes: 0 })), status: 'open', total_votes: 0,
          my_option_id: null, vote_etag: tag(), etag: tag(), created_at: '2026-10-07T10:00:00Z', closed_at: null };
        state.polls.push(created);
        state.pollCreates[key] = { id: created.id, rawBody: config.body };
        if (state.losePollCreates > 0) { state.losePollCreates -= 1; throw new TypeError('Synthetic lost poll creation response'); }
        return writeReply(created);
      }
      if (method === 'PUT' && route[3] === 'vote') {
        const key = headers['idempotency-key'];
        if (!key || !headers['if-match']) return fail(428, 'PRECONDITION_REQUIRED');
        const signature = JSON.stringify([poll.id, headers['if-match'], config.body]);
        if (state.pollVotes[key]) return state.pollVotes[key] === signature ? writeReply(poll) : fail(409, 'IDEMPOTENCY_CONFLICT');
        if (!active || poll.status !== 'open') return fail(409, 'POLL_CLOSED');
        if (poll.vote_etag !== headers['if-match']) return fail(412, 'POLL_VOTE_CHANGED');
        if (body.option_id !== null && !poll.options.some(option => option.id === body.option_id)) return fail(422, 'POLL_OPTION_UNKNOWN');
        for (const option of poll.options) option.votes += Number(option.id === body.option_id) - Number(option.id === poll.my_option_id);
        poll.my_option_id = body.option_id;
        poll.total_votes = poll.options.reduce((total, option) => total + option.votes, 0);
        poll.vote_etag = tag();
        state.pollVotes[key] = signature;
        if (state.losePollVotes > 0) { state.losePollVotes -= 1; throw new TypeError('Synthetic lost poll vote response'); }
        return writeReply(poll);
      }
      if (method === 'POST' && route[3] === 'close') {
        if (!event.can_manage) return fail(403, 'EVENT_MANAGEMENT_DENIED');
        if (poll.status === 'closed' || !active) return writeReply(poll);
        if (poll.etag !== headers['if-match']) return fail(412, 'POLL_CHANGED');
        poll.status = 'closed'; poll.closed_at = '2026-10-07T12:00:00Z'; poll.etag = tag();
        if (state.losePollCloses > 0) { state.losePollCloses -= 1; throw new TypeError('Synthetic lost poll close response'); }
        return writeReply(poll);
      }
      throw new Error(`Unexpected poll route ${method} ${url.pathname}`);
    };
  }, { options, initialPolls: options.polls ?? [pollSeed()] });
  return result;
}

async function openPolls(page) {
  await page.getByRole('button', { name: 'Picnic', exact: true }).click();
  const panel = page.getByTestId('event-polls');
  await panel.getByRole('button', { name: 'Polls', exact: true }).click();
  await panel.getByRole('button', { name: 'Refresh polls', exact: true }).and(page.locator(':enabled')).waitFor();
  return panel;
}

async function reviewPoll(page, question = 'Which day?') {
  await page.getByTestId('event-polls').getByRole('button', { name: 'New poll', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Question', exact: true }).fill(question);
  await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('Saturday');
  await dialog.getByRole('textbox', { name: 'Choice 2', exact: true }).fill('Sunday');
  await dialog.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review poll', exact: true }).waitFor();
  return dialog;
}

const pollWrites = page => page.evaluate(() => window.eventsFixture.pollCalls.filter(call => call.method !== 'GET'));

test('event polls: page scrolling keeps focused controls above resized mobile navigation', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    const save = panel.getByRole('button', { name: 'Save choice', exact: true });
    const originalSize = await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)
      - document.querySelector('.main-nav').getBoundingClientRect().height) < 1);
    await save.evaluate(element => element.scrollIntoView({ block: 'end' }));
    await save.focus();
    assert.equal(await save.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const navigation = document.querySelector('.main-nav').getBoundingClientRect();
      return document.activeElement === element && bounds.bottom <= navigation.top + 1
        && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    }), true, 'Doubled-text controls must remain above the measured sticky navigation.');
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom), '0px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(await pollWrites(page), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: create, vote, change, withdraw and close are explicit and event-bound', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { polls: [] });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const panel = page.getByTestId('event-polls');
    assert.equal(await page.evaluate(() => window.eventsFixture.pollCalls.length), 0, 'Opening an event must not fetch polls.');
    await panel.getByRole('button', { name: 'Polls', exact: true }).click();
    await panel.getByText('No polls yet.', { exact: true }).waitFor();
    const dialog = await reviewPoll(page, '  Which day?  ');
    assert.equal((await pollWrites(page)).length, 0, 'Review does not create the poll.');
    await dialog.getByText('Which day?', { exact: true }).waitFor();
    await dialog.getByText('Event: Picnic', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), '  Which day?  ');
    await dialog.getByRole('button', { name: 'Add choice', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Choice 3', exact: true }).fill('Monday');
    await dialog.getByRole('button', { name: 'Remove choice 3', exact: true }).click();
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await dialog.getByRole('button', { name: 'Create poll', exact: true }).click();
    await panel.getByText('Poll created.', { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    assert.equal((await pollWrites(page)).length, 1, 'A radio choice is only a draft until Save.');
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByText('Your choice: Saturday', { exact: true }).waitFor();
    await panel.getByText('Total votes: 1', { exact: true }).waitFor();
    mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/event-polls-desktop.png') });
    await panel.getByRole('radio', { name: /^Sunday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByText('Your choice: Sunday', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await panel.getByText('Your choice is withdrawn.', { exact: true }).waitFor();
    await panel.getByText('You have not voted.', { exact: true }).waitFor();
    await panel.getByText('Total votes: 0', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review closure', exact: true });
    await review.getByText('Which day?', { exact: true }).waitFor();
    assert.equal((await pollWrites(page)).length, 4, 'Closure requires its own review.');
    await review.getByRole('button', { name: 'Close poll', exact: true }).click();
    await panel.getByText('Poll closed.', { exact: true }).waitFor();
    await panel.getByText('Closed', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Save choice', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Close poll', exact: true }).count(), 0);
    const writes = await pollWrites(page);
    assert.equal(writes.length, 5);
    assert.deepEqual(writes[0].body, { question: 'Which day?', options: ['Saturday', 'Sunday'] });
    assert.equal(writes[3].rawBody, '{"option_id":null}');
    assert.equal(writes[4].rawBody, '{}');
    assert.equal(writes[4].headers['idempotency-key'], undefined);
    assert.equal(new Set(writes.slice(0, 4).map(call => call.headers['idempotency-key'])).size, 4);
    assert.equal(new Set(writes.slice(1, 4).map(call => call.headers['if-match'])).size, 3);
    assert.ok(writes.every(call => call.route.startsWith(`/api/events/${eventId}/polls`) && call.headers['x-account-id'] === accountId && call.search === ''));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: unconfirmed creation keeps exact bytes across dialog closure, reads and filters', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { polls: [], losePollCreates: 1 });
    let panel = await openPolls(page);
    const dialog = await reviewPoll(page);
    await dialog.getByRole('button', { name: 'Create poll', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    await dialog.getByRole('button', { name: 'Close poll dialog', exact: true }).click();
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).isDisabled(), true);
    assert.equal(await panel.getByText('Poll created.', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Past', exact: true }).click();
    assert.equal(await page.getByTestId('event-polls').count(), 0);
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    panel = page.getByTestId('event-polls');
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText('Poll created.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.polls.length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: older vote replay returns the newer choice without false success or rollback', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { losePollVotes: 1 });
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    await page.evaluate(({ choice, etag }) => {
      const poll = window.eventsFixture.polls[0];
      poll.my_option_id = choice; poll.vote_etag = etag;
      poll.options.forEach(option => { option.votes = Number(option.id === choice); });
    }, { choice: secondChoiceId, etag: pollTag(90) });
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByText('Your choice: Sunday', { exact: true }).waitFor();
    await panel.getByText('Requested choice: Saturday', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText('The current choice is shown. It differs from the earlier request; no newer choice was undone.', { exact: true }).waitFor();
    assert.equal(await panel.getByText('Your choice is saved.', { exact: true }).count(), 0);
    assert.equal(await panel.getByRole('radio', { name: /^Sunday/ }).isChecked(), true);
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[0].headers['if-match'], pollTag(1));
    assert.equal(await page.evaluate(() => window.eventsFixture.polls[0].my_option_id), secondChoiceId);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const ending of ['cancelled', 'ended']) test(`event polls: a committed vote remains confirmable after the event is ${ending}`, async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { losePollVotes: 1 });
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    await page.evaluate(ending => {
      const event = window.eventsFixture.events[0];
      event.can_manage = false;
      event.can_respond = false;
      if (ending === 'cancelled') {
        event.status = 'cancelled';
        event.cancelled_at = '2026-10-07T12:00:00Z';
      } else event.ended = true;
    }, ending);
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByText('Closed', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Refresh polls', exact: true }).and(page.locator(':enabled')).waitFor();
    const retry = panel.getByRole('button', { name: 'Retry the same poll request', exact: true });
    assert.equal(await retry.isEnabled(), true, 'The original vote receipt remains confirmable after event closure.');
    assert.equal(await panel.getByRole('button', { name: 'Save choice', exact: true }).count(), 0);
    await retry.click();
    await panel.getByText('Your choice is saved.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.polls[0].total_votes), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: withdrawal and closure retry unchanged after fresh reads and closed dialogs', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const voted = pollSeed({ my_option_id: firstChoiceId, total_votes: 1,
      options: [{ id: firstChoiceId, text: 'Saturday', votes: 1 }, { id: secondChoiceId, text: 'Sunday', votes: 0 }] });
    const { page, outbound, errors } = await pollFixture(context, { polls: [voted], losePollVotes: 1, losePollCloses: 1 });
    const panel = await openPolls(page);
    await panel.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByText('You have not voted.', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText('Your choice is withdrawn.', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
    await dialog.getByRole('button', { name: 'Close poll', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    await dialog.getByRole('button', { name: 'Close poll dialog', exact: true }).click();
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByText('Closed', { exact: true }).waitFor();
    assert.equal(await panel.getByText('Poll closed.', { exact: true }).count(), 0, 'A read alone does not confirm the unknown close command.');
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText('Poll closed.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 4);
    assert.deepEqual(writes[1], writes[0]); assert.deepEqual(writes[3], writes[2]);
    assert.equal(writes[0].rawBody, '{"option_id":null}');
    assert.equal(writes[2].headers['if-match'], pollTag(2));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: stale votes and closures require a fresh read and a new explicit review', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await page.evaluate(({ choice, etag }) => {
      const poll = window.eventsFixture.polls[0];
      poll.my_option_id = choice; poll.vote_etag = etag; poll.total_votes = 1;
      poll.options.forEach(option => { option.votes = Number(option.id === choice); });
    }, { choice: secondChoiceId, etag: pollTag(50) });
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'The poll or your choice changed.' }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Save choice', exact: true }).isDisabled(), true);
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByText('Your choice: Sunday', { exact: true }).waitFor();
    assert.equal((await pollWrites(page)).length, 1, 'A reload cannot retry or roll back a rejected vote.');
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByText('Your choice is saved.', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
    await page.evaluate(etag => { window.eventsFixture.polls[0].etag = etag; }, pollTag(70));
    await dialog.getByRole('button', { name: 'Close poll', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'The poll or your choice changed.' }).waitFor();
    await dialog.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal((await pollWrites(page)).length, 3, 'The refreshed manager ETag still requires a new review.');
    await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
    await dialog.getByRole('button', { name: 'Close poll', exact: true }).click();
    await panel.getByText('Poll closed.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 4);
    assert.equal(writes[0].headers['if-match'], pollTag(1));
    assert.equal(writes[1].headers['if-match'], pollTag(50));
    assert.notEqual(writes[1].headers['idempotency-key'], writes[0].headers['idempotency-key']);
    assert.equal(writes[2].headers['if-match'], pollTag(2));
    assert.equal(writes[3].headers['if-match'], pollTag(70));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [1280, 320]) for (const change of ['changed', 'missing', 'tally']) {
  test(`event polls: an unsubmitted closure review is invalidated by a ${change} poll at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await pollFixture(context);
      const panel = await openPolls(page);
      await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
      await dialog.getByText('Which day?', { exact: true }).waitFor();
      assert.equal((await pollWrites(page)).length, 0);
      await page.evaluate(({ change, etag }) => {
        if (change === 'missing') window.eventsFixture.polls = [];
        else if (change === 'tally') {
          window.eventsFixture.polls[0].total_votes = 1;
          window.eventsFixture.polls[0].options[0].votes = 1;
        }
        else Object.assign(window.eventsFixture.polls[0], { question: 'Updated question?', etag });
        document.querySelector('button[aria-label="Refresh events"]').click();
      }, { change, etag: pollTag(70) });
      const refreshed = change === 'missing' ? panel.getByText('No polls yet.', { exact: true })
        : change === 'tally' ? panel.getByText('Total votes: 1', { exact: true })
          : panel.locator('legend').filter({ hasText: 'Updated question?' });
      await refreshed.waitFor();
      assert.equal(await dialog.count(), 0, 'A fresh read must invalidate an obsolete, unsubmitted closure review.');
      assert.equal((await pollWrites(page)).length, 0, 'Refreshing must not close any poll.');
      if (change !== 'missing') {
        await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
        await dialog.getByText(change === 'changed' ? 'Updated question?' : 'Which day?', { exact: true }).waitFor();
        if (change === 'changed') assert.equal(await dialog.getByText('Which day?', { exact: true }).count(), 0);
        else await dialog.getByText('Total votes: 1', { exact: true }).waitFor();
        const confirm = dialog.getByRole('button', { name: 'Close poll', exact: true });
        if (width === 320) {
          const originalSize = await confirm.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
          await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
            for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
          });
          assert.equal(await confirm.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await confirm.scrollIntoViewIfNeeded();
        await confirm.focus();
        const box = await confirm.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
        await page.screenshot({ path: path.join(root, `.local/screenshots/event-poll-close-refreshed-${change}-${width}.png`), animations: 'disabled' });
        assert.equal(await confirm.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return document.activeElement === element && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }), true);
        await confirm.click();
        await panel.getByText('Poll closed.', { exact: true }).waitFor();
        const writes = await pollWrites(page);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].route, `/api/events/${eventId}/polls/${pollId}/close`);
        assert.equal(writes[0].headers['if-match'], change === 'changed' ? pollTag(70) : pollTag(2));
        assert.equal(writes[0].headers['x-account-id'], accountId);
        assert.equal(await page.evaluate(() => window.eventsFixture.polls[0].status), 'closed');
      }
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('event polls: an unchanged refresh keeps the unsubmitted closure review and blocks sending during the read', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
    await dialog.getByText('Which day?', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.eventsFixture.holdPollRead = true;
      document.querySelector('button[aria-label="Refresh events"]').click();
    });
    await page.waitForFunction(() => window.eventsFixture.releasePollRead !== null);
    const confirm = dialog.getByRole('button', { name: 'Close poll', exact: true });
    await confirm.and(page.locator(':disabled')).waitFor();
    assert.equal(await dialog.count(), 1);
    assert.equal((await pollWrites(page)).length, 0);
    await page.evaluate(() => window.eventsFixture.releasePollRead());
    await confirm.and(page.locator(':enabled')).waitFor();
    await dialog.getByText('Which day?', { exact: true }).waitFor();
    assert.equal((await pollWrites(page)).length, 0);
    await confirm.click();
    await panel.getByText('Poll closed.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].headers['if-match'], pollTag(2));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: a changed list preserves an unsent creation draft', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await panel.getByRole('button', { name: 'New poll', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Question', exact: true }).fill('My unsent question');
    await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('Morning');
    await dialog.getByRole('textbox', { name: 'Choice 2', exact: true }).fill('Evening');
    await page.evaluate(() => {
      window.eventsFixture.polls[0].question = 'Changed elsewhere?';
      document.querySelector('button[aria-label="Refresh events"]').click();
    });
    await panel.locator('legend').filter({ hasText: 'Changed elsewhere?' }).waitFor();
    assert.equal(await dialog.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), 'My unsent question');
    assert.equal(await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).inputValue(), 'Morning');
    assert.equal(await dialog.getByRole('textbox', { name: 'Choice 2', exact: true }).inputValue(), 'Evening');
    assert.equal((await pollWrites(page)).length, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: failed and denied reads hide cached actions and interrupt an open review', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await page.evaluate(() => { window.eventsFixture.pollReadError = { status: 503, code: 'UNAVAILABLE' }; });
    await panel.getByRole('button', { name: 'Refresh polls', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'Polls could not load.' }).waitFor();
    assert.equal(await panel.getByRole('radio').count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Close poll', exact: true }).count(), 0);
    await page.evaluate(() => { window.eventsFixture.pollReadError = null; });
    await panel.getByRole('button', { name: 'Retry', exact: true }).click();
    await panel.getByRole('radio', { name: /^Saturday/ }).and(page.locator(':enabled')).waitFor();
    const dialog = await reviewPoll(page, 'Private review draft');
    await page.evaluate(() => {
      window.eventsFixture.pollReadError = { status: 403, code: 'ACCESS_DENIED' };
      document.querySelector('button[aria-label="Refresh events"]').click();
    });
    await dialog.getByRole('alert').filter({ hasText: 'These polls are no longer available to you.' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Create poll', exact: true }).count(), 0);
    assert.equal(await dialog.getByText('Private review draft', { exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Close poll dialog', exact: true }).click();
    assert.equal(await panel.getByRole('radio').count(), 0);
    assert.equal((await pollWrites(page)).length, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const keepDialog of [true, false]) {
  test(`event polls: unconfirmed closure hides missing target details with its dialog ${keepDialog ? 'open' : 'closed'}`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await pollFixture(context, { losePollCloses: 1 });
      const panel = await openPolls(page);
      await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Review closure', exact: true });
      await dialog.getByRole('button', { name: 'Close poll', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
      const saved = await page.evaluate(() => structuredClone(window.eventsFixture.polls[0]));
      if (!keepDialog) await dialog.getByRole('button', { name: 'Close poll dialog', exact: true }).click();
      const recovery = keepDialog ? dialog : panel;
      await page.evaluate(() => { window.eventsFixture.pollReadError = { status: 403, code: 'ACCESS_DENIED' }; });
      await recovery.getByRole('button', { name: 'Reload polls', exact: true }).click();
      await recovery.getByRole('alert').filter({ hasText: 'These polls are no longer available to you.' }).first().waitFor();
      assert.equal(await recovery.getByText('Which day?', { exact: true }).count(), 0);
      await page.evaluate(() => { window.eventsFixture.pollReadError = null; window.eventsFixture.polls = []; });
      await recovery.getByRole('button', { name: 'Reload polls', exact: true }).click();
      await panel.getByText('No polls yet.', { exact: true }).waitFor();
      assert.equal(await recovery.getByText('Which day?', { exact: true }).count(), 0, 'A successful empty list must not reveal the unavailable poll snapshot.');
      assert.equal(await recovery.getByText('Saturday: 0', { exact: true }).count(), 0);
      assert.equal(await recovery.getByText('Total votes: 0', { exact: true }).count(), 0);
      assert.equal(await recovery.getByRole('button', { name: 'Retry the same poll request', exact: true }).isDisabled(), true);
      assert.equal((await pollWrites(page)).length, 1);
      await page.evaluate(poll => { window.eventsFixture.polls = [poll]; }, saved);
      await recovery.getByRole('button', { name: 'Reload polls', exact: true }).click();
      await recovery.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
      await recovery.getByText('Which day?', { exact: true }).first().waitFor();
      await recovery.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
      await panel.getByText('Poll closed.', { exact: true }).waitFor();
      const writes = await pollWrites(page);
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[1], writes[0]);
      assert.equal(await page.evaluate(() => window.eventsFixture.polls[0].status), 'closed');
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('event polls: lost admission is rechecked on exact replay and never reported as success', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { losePollVotes: 1 });
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await page.evaluate(() => { window.eventsFixture.pollAccessDenied = true; });
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'These polls are no longer available to you.' }).first().waitFor();
    assert.equal(await panel.getByRole('radio').count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Save choice', exact: true }).count(), 0);
    assert.equal(await panel.getByText('Your choice is saved.', { exact: true }).count(), 0);
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: event grants, not the Space role, control management and refresh revokes an open review', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { event: { can_manage: false, etag: null } });
    const panel = await openPolls(page);
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Close poll', exact: true }).count(), 0);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByText('Your choice is saved.', { exact: true }).waitFor();
    await page.evaluate(() => { Object.assign(window.eventsFixture.event, { can_manage: true, etag: '"event-2"' }); });
    await panel.getByRole('button', { name: 'Refresh polls', exact: true }).click();
    const dialog = await reviewPoll(page);
    await page.evaluate(() => {
      Object.assign(window.eventsFixture.event, { can_manage: false, etag: null });
      document.querySelector('button[aria-label="Refresh events"]').click();
    });
    await dialog.getByRole('alert').filter({ hasText: 'Only the event organizer or Space owner' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Create poll', exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Close poll dialog', exact: true }).click();
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Close poll', exact: true }).count(), 0);
    assert.equal((await pollWrites(page)).length, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const [state, changes] of [
  ['ended', { ended: true, can_respond: false }],
  ['cancelled', { status: 'cancelled', cancelled_at: '2026-10-07T09:00:00Z', can_respond: false, can_manage: false, etag: null }],
]) test(`event polls: ${state} events show closed read-only polls`, async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    await page.evaluate(changes => { Object.assign(window.eventsFixture.event, changes); }, changes);
    const panel = await openPolls(page);
    await panel.getByText('Closed', { exact: true }).waitFor();
    await panel.getByText('This event or poll is closed. No more changes are allowed.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('radio', { name: /^Saturday/ }).isDisabled(), true);
    for (const name of ['New poll', 'Save choice', 'Withdraw', 'Close poll']) assert.equal(await panel.getByRole('button', { name, exact: true }).count(), 0);
    assert.equal((await pollWrites(page)).length, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: late reads and unresolved commands stay bound to the original event across Space switches', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { losePollVotes: 1 });
    const secondEventId = 'ef3f9074-7c5d-4b20-9c83-2f6a8b4d9e44';
    await page.evaluate(({ id, space, poll }) => {
      const state = window.eventsFixture;
      state.events.push({ ...state.event, id, space_id: space, space_name: 'Garden club', title: 'Planting day' });
      state.polls.push(poll);
    }, { id: secondEventId, space: clubId, poll: pollSeed({ id: secondChoiceId, event_id: secondEventId, question: 'Which seeds?' }) });
    let panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await page.evaluate(() => { window.eventsFixture.holdPollRead = true; });
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await page.waitForFunction(() => window.eventsFixture.releasePollRead !== null);
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption(clubId);
    await page.getByRole('button', { name: 'Planting day', exact: true }).click();
    panel = page.getByTestId('event-polls');
    await panel.getByRole('button', { name: 'Polls', exact: true }).click();
    await panel.getByRole('group', { name: 'Which seeds?', exact: true }).waitFor();
    await page.evaluate(() => window.eventsFixture.releasePollRead());
    assert.equal(await panel.getByRole('group', { name: 'Which day?', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption(spaceId);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    panel = page.getByTestId('event-polls');
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText('Your choice is saved.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    assert.ok(writes.every(call => call.route.startsWith(`/api/events/${eventId}/polls/`)));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const kind of ['create', 'vote', 'close']) test(`event polls: mismatched ${kind} confirmation stays unknown until an unchanged retry succeeds`, async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { polls: kind === 'create' ? [] : [pollSeed()] });
    const panel = await openPolls(page);
    await page.evaluate(override => { window.eventsFixture.pollWriteOverride = override; }, kind === 'create'
      ? { question: 'Wrong question' } : kind === 'vote' ? { event_id: clubId } : { status: 'open', closed_at: null, can_vote: true, can_close: true });
    if (kind === 'create') {
      const dialog = await reviewPoll(page);
      await dialog.getByRole('button', { name: 'Create poll', exact: true }).click();
    } else if (kind === 'vote') {
      await panel.getByRole('radio', { name: /^Saturday/ }).check();
      await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    } else {
      await panel.getByRole('button', { name: 'Close poll', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Close poll', exact: true }).click();
    }
    await page.getByRole('alert').filter({ hasText: 'The result is not confirmed.' }).waitFor();
    if (kind !== 'vote') await page.getByRole('dialog').getByRole('button', { name: 'Close poll dialog', exact: true }).click();
    for (const text of ['Poll created.', 'Your choice is saved.', 'Poll closed.']) assert.equal(await panel.getByText(text, { exact: true }).count(), 0);
    await page.evaluate(() => { window.eventsFixture.pollWriteOverride = null; });
    await panel.getByRole('button', { name: 'Reload polls', exact: true }).click();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).and(page.locator(':enabled')).waitFor();
    await panel.getByRole('button', { name: 'Retry the same poll request', exact: true }).click();
    await panel.getByText(kind === 'create' ? 'Poll created.' : kind === 'vote' ? 'Your choice is saved.' : 'Poll closed.', { exact: true }).waitFor();
    const writes = await pollWrites(page);
    assert.equal(writes.length, 2); assert.deepEqual(writes[1], writes[0]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: creation validates Unicode lengths, distinct choices and the two-to-eight choice bounds', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context, { polls: [] });
    const panel = await openPolls(page);
    await panel.getByRole('button', { name: 'New poll', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const question = dialog.getByRole('textbox', { name: 'Question', exact: true });
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await question.evaluate(element => element === document.activeElement), true);
    assert.equal(await dialog.getByRole('button', { name: 'Remove choice 1', exact: true }).isDisabled(), true);
    await question.fill('Which day?');
    await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill(' Same ');
    await dialog.getByRole('textbox', { name: 'Choice 2', exact: true }).fill('same');
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal((await pollWrites(page)).length, 0);
    await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('A');
    await dialog.getByRole('textbox', { name: 'Choice 2', exact: true }).fill('B');
    await question.fill('x'.repeat(121));
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    await question.fill('\u{1f642}'.repeat(120));
    await dialog.getByText('120 / 120 characters', { exact: true }).waitFor();
    await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('x'.repeat(81));
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('textbox', { name: 'Choice 1', exact: true }).fill('\u{1f642}'.repeat(80));
    await dialog.getByText('80 / 80 characters', { exact: true }).waitFor();
    for (let index = 3; index <= 8; index += 1) {
      await dialog.getByRole('button', { name: 'Add choice', exact: true }).click();
      const input = dialog.getByRole('textbox', { name: `Choice ${index}`, exact: true });
      assert.equal(await input.evaluate(element => element === document.activeElement), true);
      await input.fill(`Choice ${index}`);
    }
    assert.equal(await dialog.getByRole('button', { name: 'Add choice', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Remove choice 8', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox', { name: 'Choice 7', exact: true }).evaluate(element => element === document.activeElement), true);
    await dialog.getByRole('button', { name: 'Add choice', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Choice 8', exact: true }).fill('Last choice');
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    assert.equal(await dialog.getByRole('listitem').count(), 8);
    assert.equal((await pollWrites(page)).length, 0);
    await dialog.getByRole('button', { name: 'Create poll', exact: true }).click();
    await panel.getByText('Poll created.', { exact: true }).waitFor();
    const [write] = await pollWrites(page);
    assert.equal([...write.body.question].length, 120);
    assert.equal([...write.body.options[0]].length, 80);
    assert.equal(write.body.options.length, 8);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: loading disables stale actions and an in-flight vote locks event navigation', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await pollFixture(context);
    const panel = await openPolls(page);
    await panel.getByRole('radio', { name: /^Saturday/ }).check();
    await page.evaluate(() => { window.eventsFixture.holdPollRead = true; });
    await panel.getByRole('button', { name: 'Refresh polls', exact: true }).click();
    await page.waitForFunction(() => window.eventsFixture.releasePollRead !== null);
    await panel.getByRole('button', { name: 'Save choice', exact: true }).and(page.locator(':disabled')).waitFor();
    await panel.getByRole('status').filter({ hasText: 'Loading polls' }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).isDisabled(), true);
    assert.equal(await panel.getByRole('button', { name: 'Close poll', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.eventsFixture.releasePollRead());
    await panel.getByRole('button', { name: 'Save choice', exact: true }).and(page.locator(':enabled')).waitFor();
    await page.evaluate(() => { window.eventsFixture.holdPollWrite = true; });
    await panel.getByRole('button', { name: 'Save choice', exact: true }).click();
    await page.waitForFunction(() => window.eventsFixture.releasePollWrite !== null);
    await page.getByRole('button', { name: 'Past', exact: true }).and(page.locator(':disabled')).waitFor();
    for (const name of ['Close event', 'Edit event', 'New event', 'Past', 'Upcoming', 'Refresh events']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).isDisabled(), true, name);
    }
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).isDisabled(), true);
    assert.equal(await panel.getByRole('radio', { name: /^Saturday/ }).isDisabled(), true);
    assert.equal((await pollWrites(page)).length, 1);
    await page.evaluate(() => window.eventsFixture.releasePollWrite());
    await panel.getByText('Your choice is saved.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Past', exact: true }).and(page.locator(':enabled')).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event polls: twenty polls is a complete bounded list with no creation or pagination control', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const polls = Array.from({ length: 20 }, (_, index) => pollSeed({ id: `ab3d7e52-5a3b-4f0e-9a61-${index.toString(16).padStart(12, '0')}`, question: `Question ${index + 1}` }));
    const { page, outbound, errors } = await pollFixture(context, { polls });
    const panel = await openPolls(page);
    await panel.getByText('This event already has 20 polls.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('group').count(), 20);
    assert.equal(await panel.getByRole('button', { name: 'New poll', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: 'Show more', exact: true }).count(), 0);
    assert.equal((await pollWrites(page)).length, 0);
    assert.equal(await page.evaluate(() => window.eventsFixture.pollCalls.every(call => call.search === '' && call.method === 'GET')), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function doublePollFonts(page) {
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll('body, body *')];
    for (const element of elements) if (element.hasAttribute('data-poll-base-font')) element.style.removeProperty('font-size');
    const sizes = elements.map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) {
      element.setAttribute('data-poll-base-font', String(size));
      element.style.setProperty('font-size', `${size * 2}px`, 'important');
    }
  });
}

async function assertPollReachable(page, region) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No document overflow at 320px and measured 200% text.');
  const geometry = await region.locator('button, input, label:has(input[type="radio"])').evaluateAll(elements => elements.map(element => {
    const target = element.matches('input[type="radio"]') ? element.closest('label') : element;
    const box = target.getBoundingClientRect();
    return { name: element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent, left: box.left, right: box.right, width: box.width, height: box.height };
  }));
  assert.ok(geometry.length > 0);
  assert.deepEqual(geometry.filter(box => box.left < -0.5 || box.right > 320.5 || box.width < 43.5 || box.height < 43.5), [], JSON.stringify(geometry));
  const textProblems = await region.getByRole('button').evaluateAll(buttons => buttons.flatMap(button => {
    const bounds = button.getBoundingClientRect();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    const problems = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('svg')) continue;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()];
        const font = parseFloat(getComputedStyle(node.parentElement).fontSize);
        if (rects.some(rect => rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5)
          || Math.max(...rects.map(rect => rect.top)) - Math.min(...rects.map(rect => rect.top)) > font * 0.8) problems.push(match[0]);
      }
    }
    return problems;
  }));
  assert.deepEqual(textProblems, [], 'Button words must fit without splitting.');
  for (const control of await region.locator('button:enabled, input:enabled').all()) {
    await control.click({ trial: true });
    await control.focus();
    assert.equal(await control.evaluate(element => element === document.activeElement), true, 'Control must accept keyboard focus.');
    assert.equal(await control.evaluate(element => {
      const target = element.matches('input[type="radio"]') ? element.closest('label') : element;
      const box = target.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === target || target.contains(hit);
    }), true, 'Control must remain pointer reachable.');
  }
}

for (const language of ['en', 'te', 'hi']) test(`event polls: ${language} ballots and dialogs fit 320px at measured double text with focus and 44px targets`, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, timezoneId: 'UTC' });
  try {
    const { messages, diagnostics } = loadMessages();
    assert.deepEqual(diagnostics, []);
    const text = (id, values) => messages.translate(language, id, values);
    const { page, outbound, errors } = await pollFixture(context, { polls: [pollSeed({ my_option_id: firstChoiceId, total_votes: 1,
      options: [{ id: firstChoiceId, text: 'Saturday', votes: 1 }, { id: secondChoiceId, text: 'Sunday', votes: 0 }] })] });
    const panel = await openPolls(page);
    if (language !== 'en') {
      await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(language);
      await page.waitForFunction(value => document.documentElement.lang === value, language);
    }
    const save = panel.getByRole('button', { name: text('events.polls.saveChoice'), exact: true });
    const base = await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await doublePollFonts(page);
    assert.equal(await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), base * 2);
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), 32);
    await assertPollReachable(page, panel);
    const first = panel.getByRole('radio', { name: /^Saturday/ });
    await first.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await panel.getByRole('radio', { name: /^Sunday/ }).isChecked(), true);
    assert.equal((await pollWrites(page)).length, 0, 'Keyboard navigation does not submit a vote.');
    mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
    await panel.getByRole('group', { name: 'Which day?', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, `.local/screenshots/event-polls-320-200-${language}.png`) });
    await panel.getByRole('button', { name: text('events.polls.close'), exact: true }).click();
    let dialog = page.getByRole('dialog', { name: text('events.polls.reviewClose'), exact: true });
    await doublePollFonts(page);
    await assertPollReachable(page, dialog);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await panel.getByRole('button', { name: text('events.polls.close'), exact: true }).evaluate(element => element === document.activeElement), true);
    await panel.getByRole('button', { name: text('events.polls.new'), exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: text('events.polls.question'), exact: true }).fill('Which day?');
    await dialog.getByRole('textbox', { name: text('events.polls.option', { number: 1 }), exact: true }).fill('Saturday');
    await dialog.getByRole('textbox', { name: text('events.polls.option', { number: 2 }), exact: true }).fill('Sunday');
    await doublePollFonts(page);
    const input = dialog.getByRole('textbox', { name: text('events.polls.question'), exact: true });
    const inputFont = await input.evaluate(element => ({ size: parseFloat(getComputedStyle(element).fontSize), base: Number(element.getAttribute('data-poll-base-font')) }));
    assert.ok(inputFont.base > 0);
    assert.equal(inputFont.size, inputFont.base * 2);
    await assertPollReachable(page, dialog);
    await input.focus();
    await page.screenshot({ path: path.join(root, `.local/screenshots/event-polls-create-320-200-${language}.png`) });
    await dialog.getByRole('button', { name: text('events.polls.review'), exact: true }).click();
    await doublePollFonts(page);
    await assertPollReachable(page, dialog);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await panel.getByRole('button', { name: text('events.polls.new'), exact: true }).evaluate(element => element === document.activeElement), true);
    assert.equal((await pollWrites(page)).length, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('space header: Events says where you are and who is here, links the Space sections, and fits 320 px at doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, {
      spaceFields: { member_count: 4, member_preview: ['Sam Lee', 'Priya Rao'], agent_enabled: true }, clubFields: { agent_enabled: false },
    });
    const header = page.getByRole('region', { name: 'Morgan family Space', exact: true });
    await header.getByText('4 members: Sam Lee, Priya Rao + 1 more', { exact: true }).waitFor();
    for (const text of ['Family', 'Private', 'Agent on']) await header.getByText(text, { exact: true }).waitFor();
    const sections = header.getByRole('navigation', { name: 'Sections of Morgan family', exact: true });
    assert.deepEqual(await sections.getByRole('link').evaluateAll(links => links.map(link => [link.getAttribute('aria-label'), link.getAttribute('href'), link.getAttribute('aria-current')])), [
      ['Chat for Morgan family', `/app/messages?space_id=${spaceId}`, null],
      ['Tasks for Morgan family', `/app/tasks?space_id=${spaceId}`, null],
      ['Events for Morgan family', `/app/events?space_id=${spaceId}`, 'page'],
      ['Documents for Morgan family', `/app/documents?space_id=${spaceId}`, null],
      ['Polls for Morgan family', `/app/polls?space_id=${spaceId}`, null],
    ]);
    const ask = header.getByRole('link', { name: 'Ask Agent', exact: true });
    assert.equal(await ask.getAttribute('href'), `/app/messages?space_id=${spaceId}&ask=agent`);
    const privacy = header.locator('details');
    assert.equal(await privacy.evaluate(element => element.open), false);
    await privacy.getByText('Who can see what', { exact: true }).click();
    assert.deepEqual(await privacy.locator('li').allTextContents(), [
      'Members of this Space see its chat, tasks, events and documents from the time each person joined.',
      "Only you see the Agent's answers to you and what it remembers about you, unless you choose to share an answer.",
      'Only you see your medicines. The owner and admins cannot.',
      'A direct chat is seen only by its two people.',
    ]);
    await page.screenshot({ path: path.join(root, '.local/screenshots/space-header-events-desktop.png') });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The Space header must fit 320 px at doubled text.');
    for (const link of [...await sections.getByRole('link').all(), ask]) {
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 320.5 && box.height >= 44, JSON.stringify(box));
    }
    await header.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, '.local/screenshots/space-header-events-320-large-text.png') });

    // A Space whose agent is off offers no Ask Agent button.
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'Garden club' });
    const club = page.getByRole('region', { name: 'Garden club Space', exact: true });
    await club.getByText('Agent off', { exact: true }).waitFor();
    assert.equal(await club.getByRole('link', { name: 'Ask Agent', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.every(call => call.method === 'GET')), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: closing an unsaved form asks first and cancel keeps the exact fields', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Planning in progress');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.locator('button.icon-button').click();
    assert.equal(dialogs.length, 1, 'Closing a dirty form must ask before losing the draft');
    assert.match(dialogs[0], /unsaved/i);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Planning in progress');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: closing an unconfirmed create cannot silently discard its retry key', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep the original retry');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    await editor.locator('button.icon-button').click();
    assert.equal(dialogs.length, 1, 'Closing an unconfirmed create must warn about duplicates');
    assert.match(dialogs[0], /duplicate/i);
    await editor.getByRole('button', { name: 'Retry', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.deepEqual(creates[1], creates[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Keep the original retry').length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: switching Space while editing asks first and preserves the opened version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('My unsaved plan');
    await page.getByRole('combobox', { name: 'Space' }).selectOption(clubId);
    assert.equal(dialogs.length, 1, 'Editing must have the same navigation protection as creating');
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).inputValue(), spaceId);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'My unsaved plan');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await editor.waitFor({ state: 'detached' });
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].headers['if-match'], '"event-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: view switches and navigation links ask, but an empty form and confirmed discard can leave', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    const dialogs = [];
    const dismiss = dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); };
    page.on('dialog', dismiss);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('button', { name: 'Close form', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(dialogs.length, 0);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep my draft');
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    assert.equal(dialogs.length, 0, 'The already-selected view does not discard anything');
    await page.getByRole('button', { name: 'Past', exact: true }).click();
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    assert.equal(dialogs.length, 2);
    await page.evaluate(() => {
      const base = document.createElement('base'); base.href = 'https://offline.invalid/'; document.head.append(base);
    });
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Spaces', exact: true }).click();
    assert.equal(dialogs.length, 3);
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep my draft');
    const warnsOnUnload = () => page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    });
    assert.equal(await warnsOnUnload(), true);
    page.off('dialog', dismiss);
    page.once('dialog', dialog => dialog.accept());
    await editor.getByRole('button', { name: 'Close form', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await warnsOnUnload(), false);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), '');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: an active save disables navigation until the server confirms', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { holdSaves: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Save in progress');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => window.eventsFixture.releaseSave !== null);
    // The held request can arrive before React shows the saving state; wait for that state, then check all of it.
    await editor.getByRole('button', { name: 'Close form', exact: true }).and(page.locator(':disabled')).waitFor();
    assert.equal(await editor.getByRole('button', { name: 'Close form', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Past', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Picnic', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), true);
    await page.evaluate(() => window.eventsFixture.releaseSave());
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: a failed background detail refresh keeps the draft and its original version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Draft through a refresh failure');
    await page.evaluate(() => { window.eventsFixture.failDetail = true; window.dispatchEvent(new Event('visibilitychange')); });
    await editor.getByRole('alert').filter({ hasText: 'Your draft is still here' }).waitFor();
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Draft through a refresh failure');
    await page.evaluate(() => { window.eventsFixture.failDetail = false; });
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await editor.waitFor({ state: 'detached' });
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].headers['if-match'], '"event-1"');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: lost access hides the editor instead of keeping protected text on screen', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { denyDetail: true });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Protected unsaved draft');
    await page.evaluate(() => { window.eventsFixture.failDetail = true; window.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('alert').filter({ hasText: 'Event not found.' }).waitFor();
    assert.equal(await editor.count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Title', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    }), false);
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: refreshing a reordered Space list cannot change the draft destination', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { initialSpaceId: '' });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Only for this Space');
    await editor.getByLabel('Starts', { exact: true }).fill('2026-10-12T18:30');
    await page.evaluate(() => window.eventsFixture.spaces.reverse());
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await page.waitForFunction(id => [...document.querySelectorAll('select[aria-label="Space"] option')][0]?.value === id, clubId);
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).inputValue(), spaceId);
    assert.equal(await editor.getByRole('textbox', { name: 'Title', exact: true }).inputValue(), 'Only for this Space');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 1);
    assert.equal(creates[0].route, `/api/spaces/${spaceId}/events`);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event draft: a missing selected Space never reuses its draft in another Space', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Private family draft');
    await page.evaluate(() => window.eventsFixture.spaces.splice(0, 1));
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('combobox', { name: 'Space', exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'New event', exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption(clubId);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    assert.equal(await editor.getByRole('textbox', { name: 'Title', exact: true }).inputValue(), '');
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: invalid fields are identified and focused without sending, and counters count whole characters', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    const title = editor.getByRole('textbox', { name: 'Title', exact: true });
    const starts = editor.getByLabel('Starts', { exact: true });
    await editor.getByRole('button', { name: 'Create event' }).click();
    assert.equal(await title.getAttribute('aria-invalid'), 'true');
    assert.equal(await starts.getAttribute('aria-invalid'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'title');
    assert.equal(await title.evaluate(element => document.getElementById(element.getAttribute('aria-describedby').split(' ').at(-1)).textContent), 'Enter a title.');
    await title.fill('x'.repeat(121));
    await starts.fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByText('Titles can have up to 120 characters.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await title.fill('\u{1f642}'.repeat(120));
    await editor.getByText('120 / 120 characters', { exact: true }).waitFor();
    assert.notEqual(await title.getAttribute('aria-invalid'), 'true');
    await editor.getByLabel('Ends (optional)', { exact: true }).fill('2026-10-12T17:00');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'local_end');
    await editor.getByText('The end must be after the start.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: a backend time refusal points at the field and keeps the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { createError: {
      status: 422, code: 'EVENT_IN_PAST', message: 'Choose a start time in the future.',
    } });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('My draft stays');
    const starts = editor.getByLabel('Starts', { exact: true });
    await starts.fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'local_start');
    assert.equal(await starts.getAttribute('aria-invalid'), 'true');
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'My draft stays');
    await editor.getByText('Choose a start time in the future.', { exact: true }).waitFor();
    await page.evaluate(() => { window.eventsFixture.createError = null; });
    await starts.fill('2026-10-13T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.notEqual(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: cards show the viewer time and an outdated response, dates follow language and Refresh reads again', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { event: {
      timezone: 'Asia/Kolkata', local_start: '2026-10-10T18:30', local_end: '2026-10-10T19:30',
      starts_at: '2026-10-10T13:00:00Z', ends_at: '2026-10-10T14:00:00Z',
      my_response: 'going', going: 1, my_response_outdated: true, schedule_changed_at: '2026-10-02T12:00:00Z',
    } });
    const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Picnic', exact: true }) });
    await card.getByText('Your response: Going (before the time changed)', { exact: true }).waitFor();
    await card.getByText(/^Starts .* your time \(UTC\)$/).waitFor();
    assert.ok((await card.getByRole('button', { name: 'Picnic', exact: true }).boundingBox()).height >= 44);
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('hi');
    await page.waitForFunction(() => document.documentElement.lang === 'hi');
    const expected = await page.evaluate(() => new Intl.DateTimeFormat('hi-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date('2026-10-10T00:00:00Z')));
    await card.getByText(expected, { exact: false }).waitFor();
    assert.equal(await card.getByText(/^Starts /).count(), 0);
    await page.getByRole('combobox').filter({ has: page.locator('option[value="en"]') }).selectOption('en');
    await page.evaluate(() => { window.eventsFixture.event.title = 'Updated picnic'; });
    await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
    await page.getByRole('button', { name: 'Updated picnic', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event clarity: validation and controls fit at 320px with 200% text', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 320, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.getByText('Check the highlighted fields.', { exact: true }).waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), 32);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const clipped = await editor.locator('label, input, select, textarea, button, p').evaluateAll(elements => elements.filter(element => {
      const box = element.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth;
    }).map(element => ({ tag: element.tagName, text: element.textContent })));
    assert.deepEqual(clipped, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/events-quality-validation-320-200.png'), fullPage: true });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Weekend picnic');
    await editor.getByLabel('Starts', { exact: true }).fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    await page.getByRole('region', { name: 'Weekend picnic', exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: a browser alias uses the API name without changing the local time', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Timezone regression');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    const timezone = editor.getByRole('combobox', { name: 'Time zone', exact: true });
    assert.equal(await timezone.inputValue(), 'Asia/Kolkata');
    assert.deepEqual(await timezone.locator('option').evaluateAll(options => options.map(option => option.value)),
      ['America/New_York', 'Asia/Kolkata', 'Europe/London', 'UTC']);
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 1);
    assert.equal(creates[0].body.timezone, 'Asia/Kolkata');
    assert.equal(creates[0].body.local_start, '2026-10-12T18:30');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: loading blocks submission without dropping the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context, { holdZones: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep this draft');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await page.waitForFunction(() => window.eventsFixture.releaseZones !== null);
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isDisabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).isDisabled(), true);
    await editor.evaluate(form => form.requestSubmit());
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await page.evaluate(() => window.eventsFixture.releaseZones());
    await page.waitForFunction(() => document.querySelector('form select').value === 'Asia/Kolkata');
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep this draft');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isEnabled(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: failed list has Retry at 320 px and 200% text and keeps the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta', viewport: { width: 320, height: 900 } });
  try {
    const { page, outbound, errors } = await fixture(context, { zoneUnavailable: true });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Keep this draft');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    const failure = editor.getByRole('alert').filter({ hasText: 'The list of timezones did not load' });
    await failure.waitFor();
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isDisabled(), true);
    await editor.evaluate(form => form.requestSubmit());
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    const bounds = await failure.evaluate(element => {
      const box = element.getBoundingClientRect();
      const retry = element.querySelector('button').getBoundingClientRect();
      return { left: box.left, right: box.right, retryLeft: retry.left, retryRight: retry.right, font: parseFloat(getComputedStyle(element).fontSize) };
    });
    assert.ok(bounds.font >= 28, JSON.stringify(bounds));
    assert.ok(bounds.left >= 0 && bounds.right <= 320 && bounds.retryLeft >= 0 && bounds.retryRight <= 320, JSON.stringify(bounds));
    await failure.screenshot({ path: path.join(root, '.local/screenshots/event-timezone-list-error-320-200.png') });
    await page.evaluate(() => { window.eventsFixture.zoneUnavailable = false; });
    await failure.getByRole('button', { name: 'Retry', exact: true }).click();
    await failure.waitFor({ state: 'detached' });
    assert.equal(await editor.getByRole('textbox', { name: 'Title' }).inputValue(), 'Keep this draft');
    assert.equal(await editor.getByLabel('Starts').inputValue(), '2026-10-12T18:30');
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).inputValue(), 'Asia/Kolkata');
    assert.equal(await editor.getByRole('button', { name: 'Create event' }).isEnabled(), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event timezone: an unconfirmed create retries its exact body during a list outage', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Calcutta' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Created once');
    await editor.getByLabel('Starts').fill('2026-10-12T18:30');
    await editor.getByRole('button', { name: 'Create event' }).click();
    const retry = editor.locator('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('form button[type="submit"]').textContent === 'Retry');
    await page.evaluate(() => { window.eventsFixture.zoneUnavailable = true; window.dispatchEvent(new Event('visibilitychange')); });
    await editor.getByRole('alert').filter({ hasText: 'The list of timezones did not load' }).waitFor();
    assert.equal(await retry.isEnabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).isDisabled(), true);
    assert.equal(await editor.getByRole('combobox', { name: 'Time zone' }).inputValue(), 'Asia/Kolkata');
    await retry.click();
    await editor.waitFor({ state: 'detached' });
    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.equal(creates[0].body.timezone, 'Asia/Kolkata');
    assert.deepEqual(creates[1], creates[0]);
    assert.equal(await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Created once').length), 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event editor saves against the version it opened with, so a change made while editing is refused', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.waitFor();

    // Another device moves the event, then this tab regains focus and refetches every query.
    await page.evaluate(() => Object.assign(window.eventsFixture.event, { location: 'North lawn', etag: '"event-2"' }));
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.getByText('North lawn', { exact: true }).waitFor();
    await page.waitForFunction(() => window.eventsFixture.servedDetail === '"event-2"');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));

    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic and games');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    await page.waitForFunction(() => window.eventsFixture.calls.some(call => call.method === 'PATCH'));
    const sent = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"event-1"', 'The save must name the version the editor showed.');
    await editor.getByText('This event changed since you reviewed it. Reload to continue.').waitFor();
    await editor.getByRole('button', { name: 'Reload event' }).waitFor();
    const stored = await page.evaluate(() => window.eventsFixture.event);
    assert.equal(stored.location, 'North lawn', 'The newer location must not be reverted.');
    assert.equal(stored.title, 'Picnic');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an unconfirmed new event keeps its retry: leaving asks first, and Retry creates it once', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseCreates: 1 });
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Seed swap');
    await editor.getByLabel('Starts').fill('2026-10-12T10:00');
    await editor.getByRole('button', { name: 'Create event' }).click();
    await editor.getByRole('button', { name: 'Retry', exact: true }).waitFor();

    await page.getByRole('combobox', { name: 'Space' }).selectOption(clubId);
    assert.equal(dialogs.length, 1, 'Changing Space must ask before dropping an unconfirmed event.');
    assert.match(dialogs[0], /duplicate/);
    assert.equal(await page.getByRole('combobox', { name: 'Space' }).inputValue(), spaceId);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    assert.equal(dialogs.length, 2, 'Opening another event must ask too.');
    await editor.getByRole('button', { name: 'Retry', exact: true }).click();
    await editor.waitFor({ state: 'detached' });

    const creates = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/events')));
    assert.equal(creates.length, 2);
    assert.equal(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key'], 'Retry must reuse the original key.');
    const stored = await page.evaluate(() => window.eventsFixture.events.filter(item => item.title === 'Seed swap').length);
    assert.equal(stored, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
// A read that began before a save must not undo it when its older answer arrives afterwards (T87).
test('event detail: a save is not undone by an older read that answers after it', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).waitFor();
    await page.evaluate(() => { window.eventsFixture.holdNextDetail = true; });
    // Returning to the window refetches the event; that read is held.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.eventsFixture.held !== null);
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit event' });
    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic and games');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('heading', { level: 2, name: 'Picnic and games', exact: true }).waitFor();
    await page.evaluate(() => window.eventsFixture.held.release());
    await page.waitForFunction(() => window.eventsFixture.heldSettled);
    const reverted = await page.waitForFunction(() => [...document.querySelectorAll('h2')].some(element => element.textContent === 'Picnic'), null, { timeout: 1500 }).then(() => true, () => false);
    assert.equal(reverted, false, 'The older read must not replace the saved event.');
    // Editing again starts from the saved version, so the next change is not refused.
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Title' }).fill('Picnic, games and music');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('heading', { level: 2, name: 'Picnic, games and music', exact: true }).waitFor();
    const saves = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').map(call => call.headers['if-match']));
    assert.deepEqual(saves, ['"event-1"', '"event-2"']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// DEC-032 (T154): a capacity, places taken, the line and each person's place in it.
test('event capacity: cards and details show places taken, the line and the viewer’s own place', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { event: {
      capacity: 2, going: 2, waitlisted: 2, my_response: 'going', my_waitlist_position: 2,
    } });
    const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Picnic', exact: true }) });
    await card.getByText('2 of 2 places taken · Waiting in line: 2', { exact: true }).waitFor();
    await card.getByText('You are waiting in line: number 2. You will be going when a place opens.', { exact: true }).waitFor();
    await page.evaluate(() => {
      const event = window.eventsFixture.event;
      const attendee = (name, mine, place) => ({ name, response: 'going', responded_at: event.created_at, outdated: false, mine, waitlist_position: place });
      window.eventsFixture.attendees = [attendee('Sam', false, null), attendee('Ana', false, null), attendee('Ravi', false, 1), attendee('Alex Morgan', true, 2)];
    });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Picnic', exact: true });
    await panel.getByText('Ravi: waiting, number 1', { exact: true }).waitFor();
    await panel.getByText('You: waiting, number 2', { exact: true }).waitFor();
    await panel.getByText('Sam: Going', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event capacity: the form checks the number and sends a capacity only when one is set or removed', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Title', exact: true }).fill('Limited dinner');
    await editor.getByLabel('Starts', { exact: true }).fill('2026-10-12T18:30');
    const places = editor.getByRole('textbox', { name: 'Places (optional)', exact: true });
    assert.match(await places.evaluate(element => element.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent).join(' ')), /no limit/);
    for (const value of ['0', '501', '2.5', 'ten']) {
      await places.fill(value);
      await editor.getByRole('button', { name: 'Create event', exact: true }).click();
      await editor.getByText('Enter a whole number from 1 to 500, or leave it empty.', { exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'capacity');
    }
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await places.fill('12');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const created = await page.evaluate(() => window.eventsFixture.calls.find(call => call.method === 'POST' && call.route.endsWith('/events')).body);
    assert.equal(created.capacity, 12);
    await page.getByRole('region', { name: 'Limited dinner', exact: true }).getByText('0 of 12 places taken', { exact: true }).waitFor();

    const edits = async (change) => {
      await page.getByRole('button', { name: 'Picnic', exact: true }).click();
      await page.getByRole('button', { name: 'Edit event', exact: true }).click();
      const form = page.getByRole('form', { name: 'Edit event' });
      await change(form);
      await form.getByRole('button', { name: 'Save changes', exact: true }).click();
      await form.waitFor({ state: 'detached' });
      return page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').at(-1).body);
    };
    const renamed = await edits(form => form.getByRole('textbox', { name: 'Title', exact: true }).fill('Picnic in the park'));
    assert.equal('capacity' in renamed, false, 'An edit that leaves the field empty on an event without a limit sends no capacity.');
    await page.getByRole('button', { name: 'Close event', exact: true }).click();
    await page.getByRole('button', { name: 'Picnic in the park', exact: true }).waitFor();
    const limited = await (async () => {
      await page.getByRole('button', { name: 'Picnic in the park', exact: true }).click();
      await page.getByRole('button', { name: 'Edit event', exact: true }).click();
      const form = page.getByRole('form', { name: 'Edit event' });
      await form.getByRole('textbox', { name: 'Places (optional)', exact: true }).fill('5');
      await form.getByRole('button', { name: 'Save changes', exact: true }).click();
      await form.waitFor({ state: 'detached' });
      return page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').at(-1).body);
    })();
    assert.equal(limited.capacity, 5);
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const form = page.getByRole('form', { name: 'Edit event' });
    assert.equal(await form.getByRole('textbox', { name: 'Places (optional)', exact: true }).inputValue(), '5');
    await form.getByRole('textbox', { name: 'Places (optional)', exact: true }).fill('');
    await form.getByRole('button', { name: 'Save changes', exact: true }).click();
    await form.waitFor({ state: 'detached' });
    const removed = await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method === 'PATCH').at(-1).body);
    assert.equal(removed.capacity, null, 'Emptying the field removes the capacity.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event capacity: a refused lower capacity points at the field and keeps the draft', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { event: { capacity: 4, going: 3 }, patchError: {
      status: 409, code: 'CAPACITY_BELOW_GOING', message: 'People going: 3. Choose a capacity of at least 3.',
    } });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('button', { name: 'Edit event', exact: true }).click();
    const form = page.getByRole('form', { name: 'Edit event' });
    const places = form.getByRole('textbox', { name: 'Places (optional)', exact: true });
    await places.fill('2');
    await form.getByRole('button', { name: 'Save changes', exact: true }).click();
    await form.getByText('More people are already going. Choose a larger number.', { exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'capacity');
    assert.equal(await places.getAttribute('aria-invalid'), 'true');
    assert.equal(await places.inputValue(), '2');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event capacity: the field, places and line fit at 320px with 200% text', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 320, height: 1000 } });
  try {
    const { page, outbound, errors } = await fixture(context, { event: {
      capacity: 2, going: 2, waitlisted: 1, my_response: 'going', my_waitlist_position: 1,
    } });
    await page.getByRole('button', { name: 'New event', exact: true }).click();
    const editor = page.getByRole('form', { name: 'New event' });
    await editor.getByRole('textbox', { name: 'Places (optional)', exact: true }).fill('0');
    await editor.getByRole('button', { name: 'Create event', exact: true }).click();
    await editor.getByText('Enter a whole number from 1 to 500, or leave it empty.', { exact: true }).waitFor();
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
        .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
    });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), 32);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const clipped = await page.locator('main').locator('label, input, button, p').evaluateAll(elements => elements.filter(element => {
      const box = element.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth;
    }).map(element => ({ tag: element.tagName, text: element.textContent })));
    assert.deepEqual(clipped, []);
    await page.screenshot({ path: path.join(root, '.local/screenshots/events-capacity-320-200.png'), fullPage: true });
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// DEC-039 (T159): budgets in exact money; recording an expense is never a payment.
const foodId = '8c1d7e52-5a3b-4f0e-9a61-0d4e6f2b7c11';
const venueId = 'a7e3c1d2-4b5f-4e6a-8b9c-0d1e2f3a4b5c';
const snackId = '9d2e8f63-6b4c-4a1f-8b72-1e5f7a3c8d22';
const riyaGiftId = 'c3d4e5f6-2a3b-4c4d-9e5f-6a7b8c9d0e12';
const ownGiftId = 'd4e5f6a7-3b4c-4d5e-8f6a-7b8c9d0e1f23';
const planned = (extra = {}) => ({
  currency: 'INR', version: 3,
  categories: [{ id: foodId, name: 'Food', estimate_minor: 50_000 }, { id: venueId, name: 'Venue', estimate_minor: 100_000 }],
  expenses: [{ id: snackId, amount_minor: 1_200, category_id: foodId, note: 'Snacks', recorded_by_name: 'Sam', recorded_at: '2026-09-19T10:01:00Z', mine: false }],
  ...extra,
});
const amount = (page, value, currency = 'INR') => page.evaluate(([value, currency]) => new Intl.NumberFormat('en', {
  style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value), [value, currency]);
const calls = (page, method, ending) => page.evaluate(([method, ending]) => window.eventsFixture.calls
  .filter(call => call.method === method && call.route.endsWith(ending)), [method, ending]);
const moment = (page, value) => page.evaluate(value => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)), value);

test('event budget: a plan and expenses add up exactly, and recording is never a payment', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Budget', exact: true });
    await section.getByText('Recording an expense is not a payment. Nothing is collected or owed here.', { exact: true }).waitFor();
    await section.getByText('No budget yet. Set one up to plan what this event costs.', { exact: true }).waitFor();
    await section.getByRole('button', { name: 'Set up budget', exact: true }).click();
    const plan = section.getByRole('form', { name: 'Set up budget' });
    await plan.getByRole('button', { name: 'Save budget', exact: true }).click();
    await plan.getByText('Choose a currency.', { exact: true }).waitFor();
    await plan.getByRole('combobox', { name: 'Currency', exact: true }).selectOption('INR');
    await plan.getByRole('button', { name: 'Add category', exact: true }).click();
    await plan.getByRole('textbox', { name: 'Category 1', exact: true }).fill('Venue');
    await plan.getByRole('textbox', { name: 'Planned amount for category 1', exact: true }).fill('15,000');
    await plan.getByRole('button', { name: 'Add category', exact: true }).click();
    await plan.getByRole('textbox', { name: 'Category 2', exact: true }).fill(' venue ');
    await plan.getByRole('textbox', { name: 'Planned amount for category 2', exact: true }).fill('9999.99');
    await plan.getByRole('button', { name: 'Save budget', exact: true }).click();
    await plan.getByText('Give each category a different name.', { exact: true }).waitFor();
    await plan.getByRole('textbox', { name: 'Category 2', exact: true }).fill('Food');
    assert.equal((await calls(page, 'PUT', '/budget')).length, 0);
    await plan.getByRole('button', { name: 'Save budget', exact: true }).click();
    await plan.waitFor({ state: 'detached' });
    const [saved] = await calls(page, 'PUT', '/budget');
    assert.deepEqual(saved.body, { currency: 'INR', categories: [{ name: 'Venue', estimate_minor: 1_500_000 }, { name: 'Food', estimate_minor: 999_999 }] });
    assert.equal(saved.headers['if-match'], '"budget-0"');

    const recorder = section.getByRole('form', { name: 'Record an expense' });
    for (const typed of ['', 'abc', '0', '1.234', '-5']) {
      await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill(typed);
      await recorder.getByRole('textbox', { name: 'What it was for', exact: true }).fill('Bread');
      await recorder.getByRole('button', { name: 'Record', exact: true }).click();
      await recorder.getByText('Enter an amount, such as 250 or 250.75.', { exact: true }).waitFor();
    }
    await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill('10');
    await recorder.getByRole('textbox', { name: 'What it was for', exact: true }).fill('   ');
    await recorder.getByRole('button', { name: 'Record', exact: true }).click();
    await recorder.getByText('Add a short note about what it was for.', { exact: true }).waitFor();
    assert.equal((await calls(page, 'POST', '/expenses')).length, 0);
    // 0.10 + 0.20 is 0.30 exactly: the amounts are whole paise.
    for (const [typed, category, note] of [['0.10', 'Food', 'Bread'], ['0.20', 'Food', 'Milk'], ['3,333.33', 'Venue', 'Hall deposit'], ['0.05', 'No category', 'Tip']]) {
      await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill(typed);
      await recorder.getByRole('combobox', { name: 'Category (optional)', exact: true }).selectOption({ label: category });
      await recorder.getByRole('textbox', { name: 'What it was for', exact: true }).fill(note);
      await recorder.getByRole('button', { name: 'Record', exact: true }).click();
      await section.getByText(note, { exact: true }).waitFor();
    }
    const posted = (await calls(page, 'POST', '/expenses')).map(call => call.body);
    assert.deepEqual(posted.map(body => body.amount_minor), [10, 20, 333_333, 5]);
    assert.equal('category_id' in posted[3], false);
    await section.getByText(`Food: planned ${await amount(page, 9999.99)}, recorded ${await amount(page, 0.3)}, ${await amount(page, 9999.69)} left`, { exact: true }).waitFor();
    await section.getByText(`Recorded without a category: ${await amount(page, 0.05)}`, { exact: true }).waitFor();
    const totals = section.locator('dl').first();
    assert.deepEqual(await totals.locator('dt').allInnerTexts(), ['Planned', 'Recorded', 'Left']);
    assert.deepEqual(await totals.locator('dd').allInnerTexts(), [await amount(page, 24999.99), await amount(page, 3333.68), await amount(page, 21666.31)]);
    // Going over shows how much over, not a negative amount.
    await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill('30000');
    await recorder.getByRole('combobox', { name: 'Category (optional)', exact: true }).selectOption({ label: 'Venue' });
    await recorder.getByRole('textbox', { name: 'What it was for', exact: true }).fill('Catering');
    await recorder.getByRole('button', { name: 'Record', exact: true }).click();
    await section.getByText(`Venue: planned ${await amount(page, 15000)}, recorded ${await amount(page, 33333.33)}, over by ${await amount(page, 18333.33)}`, { exact: true }).waitFor();
    assert.deepEqual(await totals.locator('dt').allInnerTexts(), ['Planned', 'Recorded', 'Over by']);
    assert.equal(await totals.locator('dd').nth(2).innerText(), await amount(page, 8333.69));
    await section.getByText(`Recorded by You, ${await moment(page, '2026-09-19T10:05:00Z')}`, { exact: true }).first().waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event budget: a lost answer is recorded once on retry, and deleting asks first', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseExpenses: 1, budget: { currency: 'USD', categories: [], expenses: [], version: 1 } });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Budget', exact: true });
    const recorder = section.getByRole('form', { name: 'Record an expense' });
    await recorder.getByRole('textbox', { name: 'Amount (USD)', exact: true }).fill('250');
    await recorder.getByRole('textbox', { name: 'What it was for', exact: true }).fill('Taxi');
    await recorder.getByRole('button', { name: 'Record', exact: true }).click();
    await recorder.getByText(/Record again with the same details; it will not be counted twice\.$/).waitFor();
    await recorder.getByRole('button', { name: 'Record', exact: true }).click();
    await section.getByText('Taxi', { exact: true }).waitFor();
    const keys = (await calls(page, 'POST', '/expenses')).map(call => call.headers['idempotency-key']);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal(await page.evaluate(id => window.eventsFixture.budgets[id].expenses.length, eventId), 1);
    assert.equal(await recorder.getByRole('textbox', { name: 'Amount (USD)', exact: true }).inputValue(), '');

    const remove = section.getByRole('button', { name: `Delete expense ${await amount(page, 250, 'USD')}: Taxi`, exact: true });
    await remove.click();
    const confirm = section.getByRole('group', { name: 'Confirm deletion', exact: true });
    await confirm.getByText(`Delete the expense of ${await amount(page, 250, 'USD')} for everyone? Expenses cannot be edited; record it again if needed.`, { exact: true }).waitFor();
    await confirm.getByRole('button', { name: 'Keep expense', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal((await calls(page, 'DELETE', '')).length, 0);
    await remove.click();
    await confirm.getByRole('button', { name: 'Yes, delete', exact: true }).click();
    await section.getByText('No expenses recorded yet.', { exact: true }).waitFor();
    const deleted = await calls(page, 'DELETE', '');
    assert.equal(deleted.length, 1);
    assert.match(deleted[0].route, new RegExp(`^/api/events/${eventId}/expenses/[0-9a-f-]{36}$`));
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event budget: the plan saves only against the version it opened, and a used category and the currency stay', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { budget: planned() });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Budget', exact: true });
    await section.getByText(`Recorded by Sam, ${await moment(page, '2026-09-19T10:01:00Z')}`, { exact: true }).waitFor();
    await section.getByRole('button', { name: 'Edit budget', exact: true }).click();
    const plan = section.getByRole('form', { name: 'Edit budget' });
    assert.equal(await plan.getByRole('combobox', { name: 'Currency', exact: true }).isDisabled(), true);
    await plan.getByText('The currency can change only while no expense, contribution or split is recorded.', { exact: true }).waitFor();
    assert.equal(await plan.getByRole('textbox', { name: 'Category 1', exact: true }).inputValue(), 'Food');
    assert.equal(await plan.getByRole('textbox', { name: 'Planned amount for category 1', exact: true }).inputValue(), '500.00');
    await plan.getByText('Expenses are recorded in this category, so it stays.', { exact: true }).waitFor();
    assert.equal(await plan.getByRole('button', { name: 'Remove category 1', exact: true }).count(), 0);
    assert.equal(await plan.getByRole('button', { name: 'Remove category 2', exact: true }).count(), 1);
    // Someone else changes the budget while this draft is open; a background reload must not adopt their version.
    await page.evaluate(id => { const stored = window.eventsFixture.budgets[id]; stored.version += 1; stored.categories[1].name = 'Hall'; }, eventId);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.eventsFixture.calls.filter(call => call.method === 'GET' && call.route.endsWith('/budget')).length >= 2);
    await plan.getByRole('textbox', { name: 'Planned amount for category 2', exact: true }).fill('1200');
    await plan.getByRole('button', { name: 'Save budget', exact: true }).click();
    await plan.getByText('The budget changed since you opened it. Reload to see the latest version.', { exact: true }).waitFor();
    const [refused] = await calls(page, 'PUT', '/budget');
    assert.equal(refused.headers['if-match'], '"budget-3"');
    assert.deepEqual(refused.body.categories.map(item => [item.id, item.name, item.estimate_minor]), [[foodId, 'Food', 50_000], [venueId, 'Venue', 120_000]]);
    await plan.getByRole('button', { name: 'Reload budget', exact: true }).click();
    await plan.waitFor({ state: 'detached' });
    await section.getByText(`Hall: planned ${await amount(page, 1000)}, recorded ${await amount(page, 0)}, ${await amount(page, 1000)} left`, { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event budget: totals, the plan and the expense form fit at 320px with 200% text in Telugu and Hindi', async () => {
  for (const [language, title] of [['te', 'బడ్జెట్'], ['hi', 'बजट']]) {
    const context = await browser.newContext({ timezoneId: 'UTC', viewport: { width: 320, height: 1000 } });
    try {
      const { page, outbound, errors } = await fixture(context, { budget: planned({
        categories: [
          { id: foodId, name: 'Food, sweets and drinks for the evening after the ceremony', estimate_minor: 50_000 },
          { id: venueId, name: 'Venue', estimate_minor: 100_000 },
        ],
        expenses: [{ id: snackId, amount_minor: 99_999_999_999, category_id: foodId, note: 'Snacks and tea for everyone who helped set up the chairs, the stage, the lights and the flowers in the hall', recorded_by_name: 'Sam', recorded_at: '2026-09-19T10:01:00Z', mine: false }],
        contributions: [
          { id: riyaGiftId, amount_minor: 99_999_999_999, state: 'given', note: 'For the flowers, the sweets and the lamps in the hall, given in cash to Sam on Friday evening', contributor_name: 'Riya Venkataraman-Subramanian', recorded_at: '2026-09-19T10:02:00Z', mine: false },
          { id: ownGiftId, amount_minor: 2_500, state: 'promised', note: null, contributor_name: 'Alex Morgan', recorded_at: '2026-09-19T10:03:00Z', mine: true },
        ],
        split: { method: 'percentages', base: 'planned', people: [
          { account_id: accountId, name: 'Alex Morgan', mine: true, value: 3_333 },
          { account_id: samId, name: 'Saraswati Venkataraman-Subramanian', mine: false, value: 6_667 },
        ] },
      }), candidates: [{ account_id: accountId, name: 'Alex Morgan' }, { account_id: samId, name: 'Saraswati Venkataraman-Subramanian' }] });
      await page.getByRole('button', { name: 'Picnic', exact: true }).click();
      await page.getByRole('region', { name: 'Budget', exact: true }).getByRole('button', { name: 'Edit budget', exact: true }).click();
      await page.getByRole('region', { name: 'Budget', exact: true }).getByRole('button', { name: `Withdraw your contribution of ${await amount(page, 25)}`, exact: true }).click();
      await page.getByRole('region', { name: 'Split', exact: true }).getByRole('button', { name: 'Change the split', exact: true }).click();
      await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption(language);
      await page.waitForFunction(value => document.documentElement.lang === value, language);
      const section = page.getByRole('region', { name: title, exact: true });
      await section.waitFor();
      // A checkbox's target is its whole label, as on the checklist screen.
      const small = await section.locator('button, input, select').evaluateAll(elements => elements.map(element => element.type === 'checkbox' ? element.closest('label') : element)
        .filter(element => element.getBoundingClientRect().height < 44)
        .map(element => ({ tag: element.tagName, text: element.textContent || element.getAttribute('name') })));
      assert.deepEqual(small, [], language);
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body, body *')].filter(element => element instanceof HTMLElement)
          .map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
      });
      assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), 32);
      // The innermost elements that reach past the screen, so a failure names the cause rather than every parent.
      const wide = await page.evaluate(() => {
        const past = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.right > innerWidth + 0.5; };
        return [...document.querySelectorAll('body *')].filter(element => past(element) && ![...element.children].some(past))
          .slice(0, 8).map(element => `${element.tagName}.${element.className} ${Math.round(element.getBoundingClientRect().width)}px: ${element.textContent.slice(0, 40)}`);
      });
      assert.deepEqual(wide, [], language);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, language);
      const clipped = await section.locator('h3, h4, label, input, select, button, p, dt, dd, li, legend').evaluateAll(elements => elements.filter(element => {
        const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < 0 || box.right > innerWidth);
      }).map(element => ({ tag: element.tagName, text: element.textContent })));
      assert.deepEqual(clipped, [], language);
      await page.screenshot({ path: path.join(root, `.local/screenshots/events-budget-320-200-${language}.png`), fullPage: true });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

// DEC-041 (T173): contributions people record for themselves; never a payment.
test('event contributions: a member records their own, promised or given, apart from spending, and sees only theirs', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { budgetManager: false, budget: planned({
      contributions: [{ id: riyaGiftId, amount_minor: 500_000, state: 'given', note: 'Riya cash', contributor_name: 'Riya', recorded_at: '2026-09-19T10:02:00Z', mine: false }],
    }) });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Budget', exact: true });
    await section.getByText('Contributions are what people say they promised or gave. Recording one is not a payment, and nothing is collected or held here.', { exact: true }).waitFor();
    await section.getByText('Only you, the organizer and the Space owner see your contributions. Others see only the totals.', { exact: true }).waitFor();
    await section.getByText('You have not recorded a contribution.', { exact: true }).waitFor();
    await section.getByText('Contributions recorded: 1', { exact: true }).waitFor();
    // Who gave what is not on this person's screen, only the totals.
    assert.equal(await section.getByText('Riya cash').count(), 0);
    const [spending, gifts] = [section.locator('dl').first(), section.locator('dl').nth(1)];
    assert.deepEqual(await gifts.locator('dt').allInnerTexts(), ['Given', 'Promised']);
    assert.deepEqual(await gifts.locator('dd').allInnerTexts(), [await amount(page, 5000), await amount(page, 0)]);
    const before = await spending.locator('dd').allInnerTexts();

    const recorder = section.getByRole('form', { name: 'Record your contribution' });
    const record = recorder.getByRole('button', { name: 'Record contribution', exact: true });
    await record.click();
    await recorder.getByText('Enter an amount, such as 250 or 250.75.', { exact: true }).waitFor();
    await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill('250');
    await record.click();
    await recorder.getByText('Choose promised or given.', { exact: true }).waitFor();
    assert.equal((await calls(page, 'POST', '/contributions')).length, 0);
    const promised = recorder.getByRole('group', { name: 'This contribution is' }).getByRole('button', { name: 'Promised', exact: true });
    await promised.click();
    assert.equal(await promised.getAttribute('aria-pressed'), 'true');
    await recorder.getByRole('textbox', { name: 'Note (optional)', exact: true }).fill('  Sweets   from the shop ');
    await record.click();
    const mine = section.getByTestId('budget-contribution');
    await mine.getByText('Sweets from the shop', { exact: true }).waitFor();
    const [posted] = await calls(page, 'POST', '/contributions');
    assert.deepEqual(posted.body, { amount_minor: 25_000, state: 'promised', note: 'Sweets from the shop' });
    assert.match(posted.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
    await mine.getByText(`${await amount(page, 250)} · Promised`, { exact: true }).waitFor();
    await mine.getByText(`From You, recorded ${await moment(page, '2026-09-19T10:06:00Z')}`, { exact: true }).waitFor();
    assert.deepEqual(await gifts.locator('dd').allInnerTexts(), [await amount(page, 5000), await amount(page, 250)]);
    await section.getByText('Contributions recorded: 2', { exact: true }).waitFor();
    assert.equal(await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).inputValue(), '');
    assert.equal(await recorder.getByRole('button', { name: 'Promised', exact: true }).getAttribute('aria-pressed'), 'false');
    // Contributions are kept apart: the plan, spending and what is left do not move.
    assert.deepEqual(await spending.locator('dd').allInnerTexts(), before);

    await section.getByRole('button', { name: `Mark your contribution of ${await amount(page, 250)} as given`, exact: true }).click();
    await mine.getByText(`${await amount(page, 250)} · Given`, { exact: true }).waitFor();
    const ownId = await page.evaluate(id => window.eventsFixture.budgets[id].contributions.find(item => item.mine).id, eventId);
    assert.deepEqual((await calls(page, 'PUT', `/contributions/${ownId}`)).map(call => call.body), [{ state: 'given' }]);
    assert.deepEqual(await gifts.locator('dd').allInnerTexts(), [await amount(page, 5250), await amount(page, 0)]);

    const withdraw = section.getByRole('button', { name: `Withdraw your contribution of ${await amount(page, 250)}`, exact: true });
    await withdraw.click();
    const confirm = section.getByRole('group', { name: 'Confirm withdrawal', exact: true });
    await confirm.getByText(`Withdraw your contribution of ${await amount(page, 250)}? It leaves the totals; record it again if needed.`, { exact: true }).waitFor();
    await confirm.getByRole('button', { name: 'Keep contribution', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal((await calls(page, 'DELETE', '')).length, 0);
    await withdraw.click();
    await confirm.getByRole('button', { name: 'Yes, withdraw', exact: true }).click();
    await section.getByText('You have not recorded a contribution.', { exact: true }).waitFor();
    const withdrawn = await calls(page, 'DELETE', '');
    assert.deepEqual(withdrawn.map(call => call.route), [`/api/events/${eventId}/contributions/${ownId}`]);
    assert.deepEqual(await gifts.locator('dd').allInnerTexts(), [await amount(page, 5000), await amount(page, 0)]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event contributions: a lost answer is recorded once on retry; managers see who gave what but change only their own', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { loseContributions: 1, budget: planned({
      expenses: [],
      contributions: [{ id: riyaGiftId, amount_minor: 500_000, state: 'given', note: 'Riya cash', contributor_name: 'Riya', recorded_at: '2026-09-19T10:02:00Z', mine: false }],
    }) });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Budget', exact: true });
    const theirs = section.getByTestId('budget-contribution').filter({ hasText: 'Riya cash' });
    await theirs.getByText(`From Riya, recorded ${await moment(page, '2026-09-19T10:02:00Z')}`, { exact: true }).waitFor();
    assert.equal(await theirs.getByRole('button').count(), 0);
    assert.equal(await section.getByText('Only you, the organizer and the Space owner see your contributions. Others see only the totals.').count(), 0);

    const recorder = section.getByRole('form', { name: 'Record your contribution' });
    await recorder.getByRole('textbox', { name: 'Amount (INR)', exact: true }).fill('1,000.50');
    await recorder.getByRole('button', { name: 'Given', exact: true }).click();
    await recorder.getByRole('button', { name: 'Record contribution', exact: true }).click();
    await recorder.getByText(/Record again with the same details; it will not be counted twice\.$/).waitFor();
    await recorder.getByRole('button', { name: 'Record contribution', exact: true }).click();
    await section.getByText(`${await amount(page, 1000.5)} · Given`, { exact: true }).waitFor();
    const posted = await calls(page, 'POST', '/contributions');
    assert.equal(posted.length, 2);
    assert.equal(posted[0].headers['idempotency-key'], posted[1].headers['idempotency-key']);
    assert.deepEqual(posted[1].body, { amount_minor: 100_050, state: 'given' });
    assert.equal(await page.evaluate(id => window.eventsFixture.budgets[id].contributions.length, eventId), 2);

    // With a contribution recorded and no expense, the currency is still fixed.
    await section.getByRole('button', { name: 'Edit budget', exact: true }).click();
    const plan = section.getByRole('form', { name: 'Edit budget' });
    assert.equal(await plan.getByRole('combobox', { name: 'Currency', exact: true }).isDisabled(), true);
    await plan.getByText('The currency can change only while no expense, contribution or split is recorded.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// DEC-042 (T174): splits divide the current total exactly and say how; a member sees only their own share.
const samId = 'b3c4d5e6-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const riyaId = 'c4d5e6f7-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
const people = [{ account_id: accountId, name: 'Alex Morgan' }, { account_id: samId, name: 'Sam Rao' }, { account_id: riyaId, name: 'Riya Iyer' }];

test('event split: the organizer divides the cost equally, by percentages or by set amounts, with the rounding shown', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { budget: planned(), candidates: people });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Split', exact: true });
    await section.getByText('A split is a plan for dividing the cost, not a bill. Nobody is charged, and nothing is owed through the app.', { exact: true }).waitFor();
    await section.getByText('The cost is not split. You can divide the planned total or the recorded spending among people.', { exact: true }).waitFor();
    await section.getByRole('button', { name: 'Split the cost', exact: true }).click();
    const editor = section.getByRole('form', { name: 'Split the cost' });
    await editor.getByRole('button', { name: 'Save split', exact: true }).click();
    await editor.getByText('Choose at least one person.', { exact: true }).waitFor();
    for (const person of people) await editor.getByRole('checkbox', { name: person.name, exact: true }).check();
    await editor.getByRole('button', { name: 'Save split', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const [equal] = await calls(page, 'PUT', '/budget/split');
    assert.deepEqual(equal.body, { method: 'equal', base: 'planned', people: people.map(person => ({ account_id: person.account_id })) });
    assert.equal(equal.headers['if-match'], '"budget-3"');
    await section.getByText(`The planned total: ${await amount(page, 1500)}, divided equally.`, { exact: true }).waitFor();
    await section.getByText('People in the split: 3', { exact: true }).waitFor();
    assert.deepEqual(await section.locator('li').allInnerTexts(), [`You: ${await amount(page, 500)}`, `Sam Rao: ${await amount(page, 500)}`, `Riya Iyer: ${await amount(page, 500)}`]);

    // 33.33% + 33.33% + 33.33% is refused before sending; 33.34% for the last one adds up, and the rounding is shown.
    await section.getByRole('button', { name: 'Change the split', exact: true }).click();
    const change = section.getByRole('form', { name: 'Change the split' });
    await change.getByRole('combobox', { name: 'How to divide', exact: true }).selectOption({ label: 'By percentage' });
    await change.getByRole('combobox', { name: 'What to divide', exact: true }).selectOption({ label: 'The recorded spending' });
    for (const person of people) await change.getByRole('textbox', { name: `Percentage for ${person.name}`, exact: true }).fill('33.33');
    await change.getByRole('button', { name: 'Save split', exact: true }).click();
    await change.getByText('The percentages must add up to 100.', { exact: true }).waitFor();
    assert.equal((await calls(page, 'PUT', '/budget/split')).length, 1);
    await change.getByRole('textbox', { name: 'Percentage for Riya Iyer', exact: true }).fill('33.34');
    await change.getByRole('button', { name: 'Save split', exact: true }).click();
    await change.waitFor({ state: 'detached' });
    assert.deepEqual((await calls(page, 'PUT', '/budget/split')).at(-1).body.people.map(item => item.value), [3_333, 3_333, 3_334]);
    await section.getByText(`The recorded spending: ${await amount(page, 12)}, divided by percentages.`, { exact: true }).waitFor();
    const cent = await amount(page, 0.01);
    assert.deepEqual(await section.locator('li').allInnerTexts(), [
      `You: 33.33%, ${await amount(page, 4)}, including ${cent} from rounding`, `Sam Rao: 33.33%, ${await amount(page, 4)}, including ${cent} from rounding`,
      `Riya Iyer: 33.34%, ${await amount(page, 4)}`,
    ]);
    await section.getByText(`Shares are rounded to ${cent}. To add up to the total exactly, 2 of them carry ${cent} more.`, { exact: true }).waitFor();

    // Set amounts are never adjusted: the difference from the total is shown instead.
    await section.getByRole('button', { name: 'Change the split', exact: true }).click();
    await change.getByRole('combobox', { name: 'How to divide', exact: true }).selectOption({ label: 'By set amount' });
    await change.getByRole('combobox', { name: 'What to divide', exact: true }).selectOption({ label: 'The planned total' });
    await change.getByRole('checkbox', { name: 'Riya Iyer', exact: true }).uncheck();
    await change.getByRole('textbox', { name: 'Amount for Alex Morgan (INR)', exact: true }).fill('1,000');
    await change.getByRole('textbox', { name: 'Amount for Sam Rao (INR)', exact: true }).fill('400');
    await change.getByRole('button', { name: 'Save split', exact: true }).click();
    await change.waitFor({ state: 'detached' });
    await section.getByText(`The set amounts add up to ${await amount(page, 1400)}, ${await amount(page, 100)} less than the total.`, { exact: true }).waitFor();

    // With a split, the currency stays; removing the split asks first.
    const budgetSection = page.getByRole('region', { name: 'Budget', exact: true });
    await budgetSection.getByRole('button', { name: 'Edit budget', exact: true }).click();
    assert.equal(await budgetSection.getByRole('combobox', { name: 'Currency', exact: true }).isDisabled(), true);
    await budgetSection.getByRole('button', { name: 'Close without saving', exact: true }).click();
    await section.getByRole('button', { name: 'Remove split', exact: true }).click();
    const confirm = section.getByRole('group', { name: 'Confirm removal', exact: true });
    await confirm.getByText('Remove this split for everyone? The plan, expenses and contributions stay.', { exact: true }).waitFor();
    await confirm.getByRole('button', { name: 'Keep split', exact: true }).click();
    assert.equal((await calls(page, 'DELETE', '/budget/split')).length, 0);
    await section.getByRole('button', { name: 'Remove split', exact: true }).click();
    await confirm.getByRole('button', { name: 'Yes, remove', exact: true }).click();
    await section.getByText('The cost is not split. You can divide the planned total or the recorded spending among people.', { exact: true }).waitFor();
    assert.equal((await calls(page, 'DELETE', '/budget/split')).length, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event split: a member sees how the cost is divided and only their own share', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const split = { method: 'equal', base: 'planned', people: [
      { account_id: samId, name: 'Sam Rao', mine: false, value: null }, { account_id: accountId, name: 'Alex Morgan', mine: true, value: null },
      { account_id: riyaId, name: 'Riya Iyer', mine: false, value: null },
    ] };
    const { page, outbound, errors } = await fixture(context, { budgetManager: false, budget: planned({ categories: [{ id: foodId, name: 'Food', estimate_minor: 100_000 }], split }) });
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    const section = page.getByRole('region', { name: 'Split', exact: true });
    await section.getByText(`The planned total: ${await amount(page, 1000)}, divided equally.`, { exact: true }).waitFor();
    await section.getByText('People in the split: 3', { exact: true }).waitFor();
    // 1,000.00 by 3: Sam, listed first, carries the extra paisa; Alex's own share is the plain third.
    await section.getByText(`Your share: ${await amount(page, 333.33)}`, { exact: true }).waitFor();
    assert.equal(await section.getByText('Sam Rao').count(), 0);
    assert.equal(await section.getByRole('button').count(), 0);
    await page.evaluate(id => { const stored = window.eventsFixture.budgets[id].split; stored.people = stored.people.filter(item => !item.mine); }, eventId);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await section.getByText('You are not part of this split.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
// DEC-051: an event result of the Space search opens that very event, even one the upcoming list does not show.
test('event deep link: a search result opens that very event, even a past one, and puts focus on it', async () => {
  const pastId = '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e33';
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { pastEvent: pastId, initialEventId: pastId });
    await page.getByRole('heading', { name: 'Autumn lunch', exact: true, level: 2 }).waitFor();
    await page.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Autumn lunch');
    // The list below still shows the upcoming event, and only the named event was read.
    assert.equal(await page.getByRole('button', { name: 'Picnic', exact: true }).count(), 1);
    const reads = await page.evaluate(() => window.eventsFixture.calls.filter(call => /^\/api\/events\/[^/]+$/.test(call.route)).map(call => `${call.method} ${call.route}`));
    assert.deepEqual(reads, [`GET /api/events/${pastId}`]);
    assert.equal(await page.evaluate(() => window.eventsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('event deep link: an event that is gone says so and leaves the list usable', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { initialEventId: '9d3a6a1e-4c2f-4a37-8f21-5b7f0d9c1e99' });
    await page.getByRole('alert').filter({ hasText: 'Event not found.' }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: 'Picnic', exact: true }).click();
    await page.getByRole('heading', { name: 'Picnic', exact: true, level: 2 }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
