import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Spaces screens (list, create, members, roles, invitations, join requests, settings and Find groups) with a simulated server and no network.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const me = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const sam = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const priya = 'c3d6f3c2-4444-4c1e-8f4e-000000000004';
const taylor = 'e5d6f3c2-6666-4c1e-8f4e-000000000006';
const lee = 'f6d6f3c2-7777-4c1e-8f4e-000000000007';
const familyId = '359bd05a-c95c-4975-b061-d647e82a6958';
const groupId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const secondFamilyId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const coupleId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const soloId = '7c2e1d66-1b9a-4f3e-8d2b-5a6b7c8d9e03';
const created = '2026-09-19T10:00:00Z';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const lostAnswer = 'No connection. Your changes are not confirmed.';
const coupleHint = 'A couple Space is for two people: you and one partner. One invitation can wait at a time.';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { SpacesScreen } from './src/features/spaces/spaces-screen';
        import { DiscoverScreen } from './src/features/spaces/discover-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderSpacesFixture = screen => {
          window.fixturePathname = screen === 'discover' ? '/app/spaces/discover' : '/app/spaces';
          root.render(<Providers>{screen === 'discover' ? <DiscoverScreen /> : <SpacesScreen />}</Providers>);
        };`,
      resolveDir: web, sourcefile: 'offline-spaces.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local', 'offline-spaces.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-spaces-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      // The main navigation marks the section of the current path.
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.fixturePathname ?? "/app/spaces"; export const useRouter = () => ({ push() {}, replace() {}, refresh() {} }); export const useSearchParams = () => new URLSearchParams();',
        loader: 'js',
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

const space = (id, name, fields = {}) => ({
  id, name, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created, ...fields,
});
const person = (account_id, display_name, role) => ({ account_id, display_name, role });
const settingsEtag = version => `"${String(version).padStart(64, '0')}"`;
const memberEtag = (id, version = 1) => `"m-${id}-v${version}"`;

// Receipts replay before the version check, so a lost answer saves, then throws without the screen seeing it.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setContent('<html><head><title>Offline Spaces</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, created, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
    const state = window.spacesFixture = {
      calls: [], unexpected: [], streams: [], receipts: {}, myRequests: [], sent: structuredClone(options.sent ?? {}), nextId: 0,
      inbox: structuredClone(options.inbox ?? []),
      inboxNextCursor: options.inboxNextCursor ?? null,
      sentNextCursor: options.sentNextCursor ?? null,
      invitationResponse: options.invitationResponse ?? null,
      invitationCreateResponse: options.invitationCreateResponse ?? null,
      invitationWithdrawResponse: options.invitationWithdrawResponse ?? null,
      spaces: structuredClone(options.spaces ?? []),
      members: Object.fromEntries(Object.entries(options.members ?? {}).map(([id, list]) => [id, list.map(member => ({ version: 1, ...member }))])),
      groups: structuredClone(options.groups ?? []), joinQueue: structuredClone(options.joinQueue ?? {}),
      writes: { create: 0, role: 0, remove: 0, settings: 0, join: 0, invite: 0, policy: 0, accept: 0, decline: 0, revoke: 0 },
      lose: { ...options.lose }, hold: { ...options.hold }, holding: {}, release: {},
    };
    const find = id => state.spaces.find(item => item.id === id);
    state.addMember = (spaceId, member) => {
      state.members[spaceId].push({ version: 1, ...member });
      find(spaceId).version = String(Number(find(spaceId).version) + 1);
    };
    state.bump = (spaceId, fields) => { Object.assign(find(spaceId), fields); find(spaceId).version = String(Number(find(spaceId).version) + 1); };
    const memberOut = member => ({ account_id: member.account_id, display_name: member.display_name, role: member.role, joined_at: created, etag: `"m-${member.account_id}-v${member.version}"` });
    const spaceOut = ({ id, name, description, space_type, visibility, member_invites, role, version, created_at, member_count, member_preview, last_message_at, agent_enabled }) => ({
      id, name, description, space_type, visibility, member_invites: member_invites === true, status: 'active', role, version, created_at,
      ...(member_count === undefined ? {} : { member_count }), ...(member_preview === undefined ? {} : { member_preview }),
      ...(last_message_at === undefined ? {} : { last_message_at }), ...(agent_enabled === undefined ? {} : { agent_enabled }),
    });
    const settingsEtag = item => `"${String(item.version).padStart(64, '0')}"`;
    const reply = (data, extra = {}, status = 200) => new Response(JSON.stringify({ data, request_id: 'offline-spaces', ...extra }), { status });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-spaces' }), { status });
    const replay = (scope, key, config, etag) => {
      const receipt = state.receipts[`${scope}|${key}`];
      if (!receipt) return null;
      if (receipt.body !== config.body || receipt.etag !== etag) return failed(409, 'IDEMPOTENCY_CONFLICT', 'The retry changed its request.');
      return reply(receipt.data, {}, receipt.status);
    };
    const remember = (scope, key, config, etag, data, status = 200) => {
      state.receipts[`${scope}|${key}`] = { body: config.body, etag, data: structuredClone(data), status };
    };
    const lost = name => {
      if ((state.lose[name] ?? 0) > 0) { state.lose[name] -= 1; throw new TypeError(`Synthetic lost answer after saving: ${name}`); }
    };
    const hold = async name => {
      if (!state.hold[name]) return;
      state.hold[name] = false; state.holding[name] = true;
      await new Promise(resolve => { state.release[name] = resolve; });
      state.holding[name] = false;
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const path = url.pathname;
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: path, query: url.search, method, body, rawBody: config.body ?? null, headers });
      const key = headers['idempotency-key'];
      const needKey = () => uuid.test(key ?? '') ? null : failed(422, 'INVALID_REQUEST', 'A single Idempotency-Key is required.');
      if (path === '/api/live') {
        const stream = { controller: null, closed: false };
        const response = new Response(new ReadableStream({
          start(controller) { stream.controller = controller; }, cancel() { stream.closed = true; },
        }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
        config.signal.addEventListener('abort', () => {
          stream.closed = true;
          try { stream.controller.error(new DOMException('Aborted', 'AbortError')); } catch {}
        }, { once: true });
        state.streams.push(stream);
        return response;
      }
      if (path === '/api/me' && method === 'GET') {
        return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      }
      if (path === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (path === '/api/spaces' && method === 'GET') return paged(state.spaces.map(spaceOut));
      if (path === '/api/spaces' && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        await hold('create');
        const replayed = replay('create', key, config);
        if (replayed) return replayed;
        const group = body.space_type === 'group';
        const item = {
          id: `d0d0d0d0-0000-4000-8000-${String(++state.nextId).padStart(12, '0')}`, name: body.name, description: body.description ?? '',
          space_type: body.space_type, visibility: group ? body.visibility : 'private', role: 'owner', version: '1', created_at: created,
        };
        state.spaces.push(item);
        state.members[item.id] = [{ version: 1, account_id: accountId, display_name: 'Alex Morgan', role: 'owner' }];
        state.writes.create += 1;
        remember('create', key, config, undefined, spaceOut(item), 201);
        lost('create');
        return reply(spaceOut(item), {}, 201);
      }
      if (path === '/api/invitations' && method === 'GET') {
        if (state.inboxUnavailable) return failed(state.inboxUnavailable, 'UNAVAILABLE', 'Synthetic invitation inbox is unavailable.');
        return reply(state.inbox.filter(item => item.status === 'pending'), { pagination: { next_cursor: state.inboxNextCursor, has_more: !!state.inboxNextCursor } });
      }
      const invitationAction = path.match(/^\/api\/invitations\/([^/]+)\/(accept|decline)$/);
      if (invitationAction && method === 'POST') {
        const invitation = state.inbox.find(item => item.id === invitationAction[1]);
        if (!invitation) return failed(404, 'NOT_FOUND', 'Invitation not found.');
        const action = invitationAction[2];
        await hold(action);
        const status = action === 'accept' ? 'accepted' : 'declined';
        if (invitation.status !== 'pending' && invitation.status !== status) return failed(409, 'INVITATION_CLOSED', 'This invitation is no longer pending.');
        if (invitation.status === 'pending') {
          invitation.status = status;
          state.writes[action] += 1;
          if (action === 'accept' && !find(invitation.space_id)) {
            state.spaces.push({ id: invitation.space_id, name: invitation.space_name, description: '',
              space_type: 'family', visibility: 'private', role: 'member', version: '1', created_at: created });
          }
        }
        const data = action === 'accept' ? spaceOut(find(invitation.space_id)) : { id: invitation.id, status };
        lost(action);
        return reply({ ...data, ...state.invitationResponse });
      }
      let match = path.match(/^\/api\/spaces\/([^/]+)\/invitations$/);
      if (match && method === 'GET') {
        const item = find(match[1]);
        if (state.sentUnavailable === match[1]) return failed(state.sentUnavailableStatus ?? 404, 'NOT_FOUND', 'Synthetic invitations are unavailable.');
        // A member who may no longer invite gets "not found"; staleSent lets a test keep answering to prove the Spaces list alone ends the panel.
        if (item?.role === 'member' && item.member_invites !== true && !state.staleSent) return failed(404, 'NOT_FOUND', 'Synthetic invitations are unavailable.');
        return reply(state.sent[match[1]] ?? [], { pagination: { next_cursor: state.sentNextCursor, has_more: !!state.sentNextCursor } });
      }
      if (match && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        const item = find(match[1]);
        if (!item) return failed(403, 'ACCESS_DENIED', 'Synthetic invitations are unavailable.');
        if (item.role === 'member' && item.member_invites !== true) return failed(404, 'NOT_FOUND', 'Synthetic invitations are unavailable.');
        const replayed = replay('invite', key, config);
        if (replayed) return replayed;
        const invitation = {
          id: `e0e0e0e0-0000-4000-8000-${String(++state.nextId).padStart(12, '0')}`, space_id: item.id, space_name: item.name,
          inviter_name: 'Alex Morgan', recipient_account_id: body.recipient_account_id.toLowerCase(), role: 'member', status: 'pending',
          created_at: created, expires_at: '2026-10-04T10:00:00Z',
        };
        (state.sent[item.id] ??= []).push(invitation);
        state.writes.invite += 1;
        remember('invite', key, config, undefined, invitation);
        lost('invite');
        return reply({ ...invitation, ...state.invitationCreateResponse });
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/invitations\/([^/]+)\/revoke$/);
      if (match && method === 'POST') {
        const invitation = (state.sent[match[1]] ?? []).find(item => item.id === match[2]);
        if (!invitation) return failed(404, 'NOT_FOUND', 'Invitation not found.');
        await hold('revoke');
        if (invitation.status !== 'pending' && invitation.status !== 'revoked') return failed(409, 'INVITATION_CLOSED', 'This invitation is no longer pending.');
        if (invitation.status === 'pending') {
          invitation.status = 'revoked';
          state.writes.revoke += 1;
        }
        lost('revoke');
        return reply({ id: invitation.id, status: 'revoked', ...state.invitationWithdrawResponse });
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/members$/);
      if (match && method === 'GET') {
        const roster = state.members[match[1]];
        return roster ? reply(roster.map(memberOut)) : failed(404, 'NOT_FOUND', 'Synthetic Space is unavailable.');
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/members\/([^/]+)\/role$/);
      if (match && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        const replayed = replay(path, key, config, headers['if-match']);
        if (replayed) return replayed;
        const item = find(match[1]);
        if (!item || item.role !== 'owner' || !['family', 'group'].includes(item.space_type)) return failed(403, 'ACCESS_DENIED', 'Only the owner can change roles.');
        const target = state.members[item.id].find(member => member.account_id === match[2]);
        if (!target || target.role === 'owner') return failed(404, 'NOT_FOUND', 'Synthetic member is unavailable.');
        if (headers['if-match'] !== memberOut(target).etag) return failed(412, 'MEMBERSHIP_CHANGED', 'Membership changed. Review it again.');
        target.role = body.role; target.version += 1;
        item.version = String(Number(item.version) + 1);
        state.writes.role += 1;
        remember(path, key, config, headers['if-match'], memberOut(target));
        lost('role');
        return reply(memberOut(target));
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/members\/([^/]+)\/remove$/);
      if (match && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        const item = find(match[1]);
        const target = state.members[match[1]]?.find(member => member.account_id === match[2]);
        if (!item || !target || item.role === 'member' || target.role === 'owner' || (item.role === 'admin' && target.role !== 'member')) {
          return failed(403, 'ACCESS_DENIED', 'Synthetic removal is not allowed.');
        }
        if (headers['if-match'] !== memberOut(target).etag) return failed(412, 'MEMBERSHIP_CHANGED', 'Membership changed. Review it again.');
        state.members[match[1]] = state.members[match[1]].filter(member => member !== target);
        item.version = String(Number(item.version) + 1);
        state.writes.remove += 1;
        return reply({ space_id: match[1], account_id: match[2], status: 'removed' });
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/ownership-transfers$/);
      if (match && method === 'GET') return paged([]);
      match = path.match(/^\/api\/spaces\/([^/]+)\/settings$/);
      if (match && method === 'GET') {
        await hold('settingsRead');
        if (state.refuseSettingsRead) return failed(503, 'UNAVAILABLE', 'Synthetic settings reload is unavailable.');
        const item = find(match[1]);
        if (!item || item.role !== 'owner') return failed(403, 'ACCESS_DENIED', 'Synthetic settings are unavailable.');
        return reply({ ...spaceOut(item), role: 'owner', etag: settingsEtag(item) });
      }
      if (match && method === 'PATCH') {
        const rejected = needKey();
        if (rejected) return rejected;
        const replayed = replay(path, key, config, headers['if-match']);
        if (replayed) return replayed;
        const item = find(match[1]);
        if (!item || item.role !== 'owner') return failed(403, 'ACCESS_DENIED', 'Synthetic settings are unavailable.');
        if (headers['if-match'] !== settingsEtag(item)) return failed(412, 'SPACE_CHANGED', 'This Space changed. Reload and review the name.');
        item.name = body.name;
        if (body.description !== undefined) item.description = body.description;
        item.version = String(Number(item.version) + 1);
        state.writes.settings += 1;
        const saved = { ...spaceOut(item), role: 'owner', etag: settingsEtag(item) };
        remember(path, key, config, headers['if-match'], saved);
        lost('settings');
        return reply(saved);
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/invite-policy$/);
      if (match && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        const replayed = replay(path, key, config, headers['if-match']);
        if (replayed) return replayed;
        const item = find(match[1]);
        if (!item || item.role !== 'owner') return failed(403, 'ACCESS_DENIED', 'Synthetic policy is unavailable.');
        if (!['family', 'group'].includes(item.space_type) || typeof body?.member_invites !== 'boolean') return failed(422, 'INVALID_REQUEST', 'Synthetic policy is not allowed here.');
        if (headers['if-match'] !== settingsEtag(item)) return failed(412, 'SPACE_CHANGED', 'This Space changed. Reload and review the setting.');
        item.member_invites = body.member_invites;
        item.version = String(Number(item.version) + 1);
        state.writes.policy += 1;
        const saved = { ...spaceOut(item), role: 'owner', etag: settingsEtag(item) };
        remember(path, key, config, headers['if-match'], saved);
        lost('policy');
        return reply(saved);
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/join-requests$/);
      if (match && method === 'GET') {
        const item = find(match[1]);
        if (!item || item.role === 'member') return failed(403, 'ACCESS_DENIED', 'Synthetic requests are unavailable.');
        return reply(state.joinQueue[match[1]] ?? []);
      }
      if (match && method === 'POST') {
        const rejected = needKey();
        if (rejected) return rejected;
        await hold('join');
        const replayed = replay('join', key, config);
        if (replayed) return replayed;
        const group = state.groups.find(item => item.id === match[1]);
        if (!group || !group.can_request) return failed(409, 'NOT_ACCEPTING', 'Synthetic group is not accepting requests.');
        const request = {
          id: `b0b0b0b0-0000-4000-8000-${String(++state.nextId).padStart(12, '0')}`, space_id: group.id, space_name: group.name, note: body.note,
          status: 'pending', created_at: '2026-10-01T10:00:00Z', expires_at: '2026-10-15T10:00:00Z', resolved_at: null,
        };
        group.pending_request_id = request.id; group.can_request = false;
        state.myRequests.push(request);
        state.writes.join += 1;
        remember('join', key, config, undefined, request);
        lost('join');
        return reply(request);
      }
      match = path.match(/^\/api\/spaces\/([^/]+)\/join-requests\/([^/]+)\/(approve|decline)$/);
      if (match && method === 'POST') {
        const item = find(match[1]);
        const queue = state.joinQueue[match[1]] ?? [];
        const review = queue.find(entry => entry.id === match[2]);
        if (!item || item.role === 'member') return failed(403, 'ACCESS_DENIED', 'Synthetic decision is not allowed.');
        if (!review) return failed(404, 'NOT_FOUND', 'Synthetic request is unavailable.');
        state.joinQueue[match[1]] = queue.filter(entry => entry !== review);
        return reply({
          id: review.id, space_id: item.id, space_name: item.name, note: review.note, status: match[3] === 'approve' ? 'approved' : 'declined',
          created_at: review.created_at, expires_at: review.expires_at, resolved_at: '2026-10-01T10:30:00Z',
        });
      }
      if (path === '/api/discover/spaces' && method === 'GET') {
        const query = (url.searchParams.get('q') ?? '').toLowerCase();
        return paged(state.groups.filter(group => !query || `${group.name} ${group.description}`.toLowerCase().includes(query)));
      }
      if (path === '/api/me/space-join-requests' && method === 'GET') return reply(state.myRequests);
      state.unexpected.push(`${method} ${path}${url.search}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${path}`);
    };
  }, { accountId: me, created, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(screen => window.renderSpacesFixture(screen), options.screen ?? 'spaces');
  await page.getByRole('heading', { name: options.screen === 'discover' ? 'Find groups' : 'Spaces', exact: true, level: 1 }).waitFor();
  return { page, outbound, errors };
}

async function assertOffline({ page, outbound, errors }) {
  assert.deepEqual(outbound, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.spacesFixture.unexpected), []);
}

const writes = page => page.evaluate(() => window.spacesFixture.writes);
const requests = (page, method, route) => page.evaluate(({ method, route }) => window.spacesFixture.calls.filter(call => call.method === method && call.route === route), { method, route });

function assertKey(call) {
  assert.deepEqual(Object.keys(call.headers).filter(name => name === 'idempotency-key'), ['idempotency-key']);
  assert.match(call.headers['idempotency-key'], uuid);
  assert.equal(call.headers['x-account-id'], me);
}

for (const [status, width] of [403, 404, 503].flatMap(status => [[status, 1280], [status, 320]])) {
  test(`spaces: an inbox ${status} removes a stale join review and requires fresh review after recovery at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    const invitation = {
      id: secondFamilyId, space_id: familyId, space_name: 'Private invitation family', inviter_name: 'Taylor Morgan',
      recipient_account_id: me, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z',
    };
    try {
      const result = await fixture(context, { inbox: [invitation], inboxNextCursor: 'next-invitation-page' });
      const { page } = result;
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), 32);
      }
      const inbox = page.locator('section[aria-labelledby="invitation-title"]');
      const more = inbox.getByRole('button', { name: 'Load more invitations', exact: true });
      await more.waitFor();
      const row = inbox.getByRole('listitem').filter({ has: page.getByRole('heading', { name: invitation.space_name, exact: true }) });
      await row.getByRole('button').first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes(invitation.space_name));
      await page.evaluate(code => { window.spacesFixture.inboxUnavailable = code; }, status);
      await inbox.locator('button').first().dispatchEvent('click');
      await inbox.locator('[role="alert"]').filter({ hasText: 'Synthetic invitation inbox is unavailable.' }).waitFor();
      assert.equal(await dialog.count(), 0, 'An unavailable inbox must not leave a cached invitation confirmation open.');
      assert.equal(await inbox.getByRole('listitem').count(), 0);
      assert.equal(await more.count(), 0, 'An unavailable inbox must not expose its cached page cursor.');
      assert.equal((await requests(page, 'POST', `/api/invitations/${invitation.id}/accept`)).length, 0);
      await assertFits(page, `Invitation inbox ${status} at ${width}px`);
      if (process.env.COMMUNITY_CAPTURE_DIR && status === 404) {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await inbox.screenshot({ path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `inbox-error-${width}.png`) });
      }

      await page.evaluate(() => {
        window.spacesFixture.inboxUnavailable = null;
        window.spacesFixture.inbox[0].space_name = 'Renamed invitation family';
      });
      await inbox.getByRole('button').first().click();
      const refreshed = inbox.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Renamed invitation family', exact: true }) });
      await refreshed.waitFor();
      assert.equal(await dialog.count(), 0, 'Recovery must not silently reopen the stale review.');
      assert.equal(await more.isEnabled(), true);
      await refreshed.getByRole('button').first().click();
      await dialog.waitFor();
      assert.ok((await dialog.innerText()).includes('Renamed invitation family'));
      assert.equal((await dialog.innerText()).includes(invitation.space_name), false);
      assert.equal((await requests(page, 'POST', `/api/invitations/${invitation.id}/accept`)).length, 0);
      await assertFits(page, `Recovered invitation review at ${width}px`);
      if (process.env.COMMUNITY_CAPTURE_DIR && status === 404) {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await dialog.screenshot({ path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `inbox-review-${width}.png`) });
      }
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const [action, response] of [['accept', { id: groupId }], ['decline', { id: groupId }], ['decline', { status: 'revoked' }]]) {
  test(`spaces: ${action} rejects a mismatched invitation result ${JSON.stringify(response)}`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Invited family', inviter_name: 'Taylor Morgan',
      recipient_account_id: me, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { inbox: [invitation], invitationResponse: response });
      const { page } = result;
      const inbox = page.locator('section[aria-labelledby="invitation-title"]');
      const row = inbox.getByRole('listitem').filter({ has: page.getByRole('heading', { name: invitation.space_name, exact: true }) });
      if (action === 'accept') {
        await row.getByRole('button', { name: 'Review invitation', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Join Space', exact: true }).click();
      } else {
        await row.getByRole('button', { name: `Decline invitation to ${invitation.space_name}`, exact: true }).click();
      }
      await page.waitForFunction(action => window.spacesFixture.writes[action] === 1, action);
      await page.waitForFunction(() => document.querySelector('section[aria-labelledby="invitation-title"] [role="alert"]')
        || document.querySelector('section[aria-labelledby="invitation-title"] .message.success'));
      assert.equal(await inbox.locator('.message.success').count(), 0, 'A mismatched response cannot confirm the requested decision.');
      assert.ok(await inbox.locator('[role="alert"]').count());
      if (action === 'accept') assert.equal(await page.getByRole('dialog').count(), 1);
      assert.equal((await requests(page, 'POST', `/api/invitations/${invitation.id}/${action}`)).length, 1);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const action of ['accept', 'decline']) for (const failure of ['lost', 'mismatched']) for (const width of [1280, 320]) {
  test(`spaces: ${action} retries the same invitation after a ${failure} response at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Invitation retry family', inviter_name: 'Taylor Morgan',
      recipient_account_id: me, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, {
        inbox: [invitation], lose: failure === 'lost' ? { [action]: 1 } : {},
        invitationResponse: failure === 'mismatched' ? { id: groupId } : null,
      });
      const { page } = result;
      if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      const inbox = page.locator('section[aria-labelledby="invitation-title"]');
      const row = inbox.getByRole('listitem').filter({ has: page.getByRole('heading', { name: invitation.space_name, exact: true }) });
      if (action === 'accept') await row.getByRole('button', { name: 'Review invitation', exact: true }).click();
      const submit = action === 'accept'
        ? page.getByRole('dialog').getByRole('button', { name: 'Join Space', exact: true })
        : row.getByRole('button', { name: `Decline invitation to ${invitation.space_name}`, exact: true });
      await submit.click();
      const error = failure === 'lost' ? lostAnswer : 'The invitation decision could not be confirmed.';
      await inbox.locator('[role="alert"]').filter({ hasText: error }).first().waitFor();
      assert.equal(await inbox.locator('.message.success').count(), 0);
      assert.equal((await requests(page, 'POST', `/api/invitations/${invitation.id}/${action}`)).length, 1);
      assert.equal((await writes(page))[action], 1);
      await assertFits(page, `${action} retry at ${width}px`);
      await assertReachable(page, submit, `Retry ${action}`);
      if (process.env.COMMUNITY_CAPTURE_DIR && failure === 'lost') {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        const target = action === 'accept' ? page.getByRole('dialog') : inbox;
        await target.screenshot({ path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `decision-${action}-retry-${width}.png`) });
      }
      await page.evaluate(() => { window.spacesFixture.invitationResponse = null; });
      await submit.click();
      await inbox.locator('.message.success').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await inbox.getByRole('listitem').count(), 0);
      const attempts = await requests(page, 'POST', `/api/invitations/${invitation.id}/${action}`);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].route, attempts[1].route);
      assert.equal(attempts[0].rawBody, attempts[1].rawBody);
      assert.equal(attempts[0].headers['x-account-id'], me);
      assert.deepEqual(attempts[0].headers, attempts[1].headers);
      assert.equal((await writes(page))[action], 1);
      assert.equal(await page.evaluate(spaceId => window.spacesFixture.spaces.filter(item => item.id === spaceId).length, familyId), action === 'accept' ? 1 : 0);
      if (action === 'accept') await page.getByRole('heading', { name: invitation.space_name, exact: true }).waitFor();
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const response of [{ space_id: groupId }, { recipient_account_id: priya }]) for (const width of [1280, 320]) {
  test(`spaces: invitation creation rejects a mismatched target ${JSON.stringify(response)} and keeps its retry identity at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    try {
      const result = await fixture(context, {
        spaces: [space(familyId, 'Morgan family')], invitationCreateResponse: response,
      });
      const { page } = result;
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), 32);
      }
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.locator('section[aria-labelledby="manage-invitations-title"]');
      await panel.getByLabel('Recipient account ID', { exact: true }).fill(lee);
      await panel.getByRole('button', { name: 'Create invitation', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('section[aria-labelledby="manage-invitations-title"] [role="alert"]')
        || document.querySelector('section[aria-labelledby="manage-invitations-title"] .message.success'));
      assert.equal(await panel.locator('.message.success').count(), 0, 'A response for another target cannot confirm this invitation.');
      assert.ok(await panel.locator('[role="alert"]').count());
      assert.equal(await panel.getByLabel('Recipient account ID', { exact: true }).inputValue(), lee);
      assert.equal(await panel.getByLabel('Recipient account ID', { exact: true }).isDisabled(), true);
      assert.equal(await panel.getByRole('button', { name: 'Close invitation management', exact: true }).isDisabled(), true);
      await assertFits(page, `Unconfirmed invitation target at ${width}px`);
      await assertReachable(page, panel.getByRole('button', { name: 'Retry invitation', exact: true }), 'Retry invitation');
      if (process.env.COMMUNITY_CAPTURE_DIR && response.space_id) {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await panel.screenshot({ path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `invitation-target-error-${width}.png`) });
      }

      await page.evaluate(() => { window.spacesFixture.invitationCreateResponse = null; });
      await panel.getByRole('button', { name: 'Retry invitation', exact: true }).click();
      await panel.getByText('Invitation created.', { exact: true }).waitFor();
      const attempts = await requests(page, 'POST', `/api/spaces/${familyId}/invitations`);
      assert.equal(attempts.length, 2);
      assertKey(attempts[0]); assertKey(attempts[1]);
      assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
      assert.equal(attempts[0].rawBody, attempts[1].rawBody);
      assert.deepEqual(attempts[0].body, { recipient_account_id: lee });
      assert.equal((await writes(page)).invite, 1);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const [failure, response] of [['lost', null], ['wrong invitation', { id: groupId }], ['wrong status', { status: 'declined' }]]) for (const width of [1280, 320]) {
  test(`spaces: withdrawal remains unconfirmed after a ${failure} response and retries safely at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
      recipient_account_id: lee, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')], sent: { [familyId]: [invitation] },
        invitationWithdrawResponse: response, lose: failure === 'lost' ? { revoke: 1 } : {} });
      const { page } = result;
      if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Invite to Morgan family', exact: true });
      await panel.getByRole('listitem').getByRole('button').click();
      const dialog = page.getByRole('dialog');
      const withdraw = dialog.getByRole('button', { name: 'Revoke invitation', exact: true });
      await withdraw.click();
      await page.waitForFunction(() => document.querySelector('section[aria-labelledby="manage-invitations-title"] [role="alert"]')
        || document.querySelector('section[aria-labelledby="manage-invitations-title"] .message.success'));
      assert.equal(await panel.locator('.message.success').count(), 0);
      assert.equal(await dialog.count(), 1);
      assert.equal((await writes(page)).revoke, 1);
      await assertFits(page, `Unconfirmed withdrawal at ${width}px`);
      await assertReachable(page, withdraw, 'Retry withdrawal');
      await page.evaluate(() => { window.spacesFixture.invitationWithdrawResponse = null; });
      await withdraw.click();
      await panel.locator('.message.success').waitFor();
      assert.equal(await dialog.count(), 0);
      const attempts = await requests(page, 'POST', `/api/spaces/${familyId}/invitations/${invitation.id}/revoke`);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].rawBody, attempts[1].rawBody);
      assert.deepEqual(attempts[0].headers, attempts[1].headers);
      assert.equal((await writes(page)).revoke, 1);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const [failure, response] of [['lost', null], ['wrong invitation', { id: groupId }], ['wrong status', { status: 'declined' }]]) for (const width of [1280, 320]) {
  test(`spaces: withdrawal retry survives closing and refreshing after a ${failure} response at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
      recipient_account_id: lee, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')], sent: { [familyId]: [invitation] },
        invitationWithdrawResponse: response, lose: failure === 'lost' ? { revoke: 1 } : {} });
      const { page } = result;
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Invite to Morgan family', exact: true });
      await panel.getByRole('listitem').getByRole('button').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: failure === 'lost' ? lostAnswer : 'The invitation withdrawal could not be confirmed.' }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await panel.getByLabel('Recipient account ID', { exact: true }).fill(taylor);
      await panel.getByRole('button', { name: 'Refresh sent invitations', exact: true }).click();
      await panel.getByRole('listitem').getByRole('button').waitFor({ state: 'detached' });
      assert.equal(await panel.getByRole('listitem').count(), 1);
      assert.equal(await panel.locator('.message.success').count(), 0);
      assert.equal(await dialog.count(), 0);
      const retry = panel.getByRole('button', { name: 'Retry original decision', exact: true });
      assert.equal(await retry.count(), 1, 'An unconfirmed withdrawal must remain retryable after its pending action disappears.');
      if (width === 320) {
        const originalSize = await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        await page.evaluate(() => {
          const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
          document.documentElement.style.fontSize = '200%';
          for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
        });
        assert.equal(await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
        assert.equal(await retry.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      }
      await assertFits(page, `Withdrawal reconciliation at ${width}px`);
      await assertReachable(page, retry, 'Retry original withdrawal');
      await retry.evaluate(element => { element.focus(); element.scrollIntoView({ block: 'center' }); });
      assert.equal(await retry.evaluate(element => document.activeElement === element), true);
      assert.equal(await retry.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), true, 'The retry must not be covered by fixed navigation.');
      if (process.env.COMMUNITY_CAPTURE_DIR && failure === 'lost') {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `withdrawal-retry-${width}.png`) });
      }
      await page.evaluate(() => { window.spacesFixture.invitationWithdrawResponse = null; });
      await retry.click();
      await panel.locator('.message.success').waitFor();
      const attempts = await requests(page, 'POST', `/api/spaces/${familyId}/invitations/${invitation.id}/revoke`);
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0]);
      assert.deepEqual(attempts[0].body, {});
      assert.equal(attempts[0].headers['x-account-id'], me);
      assert.equal((await writes(page)).revoke, 1);
      assert.equal((await writes(page)).invite, 0);
      assert.equal(await panel.getByLabel('Recipient account ID', { exact: true }).inputValue(), taylor);
      assert.equal(await retry.count(), 0);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const status of [403, 404, 503]) {
  test(`spaces: withdrawal retry is hidden while sent invitations return ${status}`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width: 320, height: 900 } });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
      recipient_account_id: lee, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')], sent: { [familyId]: [invitation] }, lose: { revoke: 1 } });
      const { page } = result;
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Invite to Morgan family', exact: true });
      await panel.getByRole('listitem').getByRole('button').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: lostAnswer }).waitFor();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      const retry = panel.getByRole('button', { name: 'Retry original decision', exact: true });
      await retry.waitFor();
      await page.evaluate(({ spaceId, status }) => {
        window.spacesFixture.sentUnavailable = spaceId;
        window.spacesFixture.sentUnavailableStatus = status;
      }, { spaceId: familyId, status });
      await panel.getByRole('button', { name: 'Refresh sent invitations', exact: true }).click();
      await retry.waitFor({ state: 'detached' });
      assert.equal(await panel.getByRole('listitem').count(), 0);
      assert.equal(await dialog.count(), 0);
      assert.equal((await requests(page, 'POST', `/api/spaces/${familyId}/invitations/${invitation.id}/revoke`)).length, 1);
      assert.equal((await writes(page)).revoke, 1);
      await assertFits(page, `Unavailable withdrawal history ${status}`);
      if (status === 503) {
        const error = panel.getByRole('alert').filter({ hasText: 'Synthetic invitations are unavailable.' });
        await page.evaluate(() => { window.spacesFixture.sentUnavailable = null; });
        await error.getByRole('button', { name: 'Retry', exact: true }).click();
        await retry.click();
        await panel.locator('.message.success').waitFor();
        const attempts = await requests(page, 'POST', `/api/spaces/${familyId}/invitations/${invitation.id}/revoke`);
        assert.equal(attempts.length, 2);
        assert.deepEqual(attempts[1], attempts[0]);
        assert.equal((await writes(page)).revoke, 1);
      } else {
        const close = panel.getByRole('button', { name: 'Close invitation management', exact: true });
        assert.equal(await close.isEnabled(), true);
        await close.click();
        assert.equal(await panel.count(), 0);
      }
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const status of [404, 409]) {
  test(`spaces: withdrawal retry is not offered after a known ${status} refusal`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
      recipient_account_id: lee, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')], sent: { [familyId]: [invitation] } });
      const { page } = result;
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Invite to Morgan family', exact: true });
      await panel.getByRole('listitem').getByRole('button').click();
      await page.evaluate(({ spaceId, status }) => {
        if (status === 404) window.spacesFixture.sent[spaceId] = [];
        else window.spacesFixture.sent[spaceId][0].status = 'accepted';
      }, { spaceId: familyId, status });
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
      await panel.getByRole('alert').filter({ hasText: status === 404 ? 'Invitation not found.' : 'This invitation is no longer pending.' }).waitFor();
      assert.equal(await dialog.count(), 0);
      assert.equal(await panel.getByRole('button', { name: 'Retry original decision', exact: true }).count(), 0);
      assert.equal(await panel.locator('.message.success').count(), 0);
      assert.equal((await writes(page)).revoke, 0);
      assert.equal((await requests(page, 'POST', `/api/spaces/${familyId}/invitations/${invitation.id}/revoke`)).length, 1);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const width of [1280, 320]) {
  test(`spaces: sent-invitation read failure clears stale withdrawal controls and requires fresh review at ${width}px`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width, height: 900 } });
    const invitation = { id: secondFamilyId, space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan',
      recipient_account_id: lee, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-15T10:00:00Z' };
    try {
      const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')], sent: { [familyId]: [invitation] }, sentNextCursor: 'next-sent-page' });
      const { page } = result;
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), 32);
      }
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Invite to Morgan family', exact: true });
      const more = panel.getByRole('button', { name: /more.*invitation/i });
      await more.waitFor();
      await panel.getByRole('listitem').getByRole('button').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByText(lee, { exact: true }).waitFor();
      await page.evaluate(spaceId => {
        window.spacesFixture.sentUnavailable = spaceId;
        window.spacesFixture.sentUnavailableStatus = 503;
      }, familyId);
      await panel.getByRole('button', { name: /Refresh/i }).dispatchEvent('click');
      const error = panel.getByRole('alert').filter({ hasText: 'Synthetic invitations are unavailable.' });
      await error.waitFor();
      assert.equal(await dialog.count(), 0, 'A failed sent list must not retain an actionable cached withdrawal.');
      assert.equal(await panel.getByRole('listitem').count(), 0);
      assert.equal(await more.count(), 0, 'A failed sent list must not expose a cached page cursor.');
      assert.equal((await writes(page)).revoke, 0);
      await assertFits(page, `Sent invitations unavailable at ${width}px`);

      await page.evaluate(({ spaceId, nextId, recipient }) => {
        const state = window.spacesFixture;
        state.sentUnavailable = null;
        state.sent[spaceId][0].status = 'revoked';
        state.sent[spaceId].push({ ...state.sent[spaceId][0], id: nextId, recipient_account_id: recipient, status: 'pending' });
      }, { spaceId: familyId, nextId: groupId, recipient: taylor });
      await error.getByRole('button', { name: 'Retry', exact: true }).click();
      const fresh = panel.getByRole('listitem').filter({ hasText: taylor });
      await fresh.waitFor();
      assert.equal(await dialog.count(), 0, 'A successful refresh must not reopen the old withdrawal review.');
      assert.equal(await more.isEnabled(), true);
      await fresh.getByRole('button').click();
      await dialog.getByText(taylor, { exact: true }).waitFor();
      assert.equal(await dialog.getByText(lee, { exact: true }).count(), 0);
      assert.equal((await writes(page)).revoke, 0);
      await assertFits(page, `Fresh sent-invitation review at ${width}px`);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

test('spaces: invitation creation accepts the canonical response for an uppercase recipient UUID', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, { spaces: [space(familyId, 'Morgan family')] });
    const { page } = result;
    await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
    const panel = page.locator('section[aria-labelledby="manage-invitations-title"]');
    await panel.getByLabel('Recipient account ID', { exact: true }).fill(lee.toUpperCase());
    await panel.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('section[aria-labelledby="manage-invitations-title"] [role="alert"]')
      || document.querySelector('section[aria-labelledby="manage-invitations-title"] .message.success'));
    assert.equal(await panel.locator('[role="alert"]').count(), 0, 'UUID letter case does not identify a different recipient.');
    await panel.getByText('Invitation created.', { exact: true }).waitFor();
    assert.equal((await writes(page)).invite, 1);
    assert.equal(await page.evaluate(spaceId => window.spacesFixture.sent[spaceId][0].recipient_account_id, familyId), lee);
    assert.equal((await requests(page, 'POST', `/api/spaces/${familyId}/invitations`)).length, 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

const membersRegion = (page, name) => page.getByRole('region', { name: `Members of ${name}`, exact: true });
const personRow = (page, region, name) => region.getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true, level: 3 }) });
const openMembers = async (page, name) => {
  await page.getByRole('button', { name: `Members of ${name}`, exact: true }).click();
  const region = membersRegion(page, name);
  await region.getByRole('heading', { level: 3 }).first().waitFor();
  return region;
};

test('spaces: a couple Space is created with one key, waits for a partner and then shows who joined', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, { hold: { create: true } });
    const { page } = result;
    await page.getByRole('heading', { name: 'No Spaces yet', exact: true }).waitFor();
    const chooser = page.getByRole('combobox', { name: 'Space type', exact: true });
    assert.deepEqual(await chooser.locator('option').allTextContents(), ['Family', 'Couple', 'Group', 'Solo']);
    await chooser.selectOption('couple');
    await page.getByRole('heading', { name: 'New couple Space', exact: true }).waitFor();
    await page.getByText('Private couple Space: only you and one partner you invite', { exact: true }).waitFor();
    await page.getByLabel('Space name', { exact: true }).fill('  Synthetic pair  ');
    await page.getByRole('button', { name: 'Create Space', exact: true }).click();
    await page.waitForFunction(() => window.spacesFixture.holding.create);
    await page.getByRole('button', { name: 'Creating...', exact: true }).waitFor();
    // Nothing is shown as created until the server answers.
    assert.equal(await page.getByRole('heading', { name: 'Synthetic pair', exact: true }).count(), 0);
    assert.equal(await page.getByText('Waiting for your partner', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Couple Space created. Invite your partner to join you.', { exact: true }).count(), 0);
    await page.evaluate(() => window.spacesFixture.release.create());
    await page.getByText('Couple Space created. Invite your partner to join you.', { exact: true }).waitFor();
    const row = page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Synthetic pair', exact: true }) });
    await row.getByText('Waiting for your partner', { exact: true }).waitFor();
    assert.match(await row.innerText(), /Couple\s*\/\s*Owner/);
    const [create] = await requests(page, 'POST', '/api/spaces');
    assert.equal((await requests(page, 'POST', '/api/spaces')).length, 1);
    assert.deepEqual(create.body, { name: 'Synthetic pair', space_type: 'couple' });
    assertKey(create);
    assert.equal((await writes(page)).create, 1);

    await row.getByRole('button', { name: 'Manage invitations for Synthetic pair', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to Synthetic pair', exact: true }).waitFor();
    await page.getByText(coupleHint, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close invitation management', exact: true }).click();

    await page.evaluate(({ accountId }) => {
      const spaceId = window.spacesFixture.spaces[0].id;
      window.spacesFixture.addMember(spaceId, { account_id: accountId, display_name: 'Sam Lee', role: 'member' });
    }, { accountId: sam });
    await page.getByRole('button', { name: 'Refresh Spaces', exact: true }).click();
    await row.getByText('With Sam Lee', { exact: true }).waitFor();
    assert.equal(await row.getByText('Waiting for your partner', { exact: true }).count(), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: the owner changes a role after review; a lost answer is retried with the same key, body and version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      lose: { role: 1 },
      spaces: [space(familyId, 'Morgan family'), space(coupleId, 'Synthetic pair', { space_type: 'couple' })],
      members: {
        [familyId]: [person(me, 'Alex Morgan', 'owner'), person(sam, 'Sam Lee', 'member'), person(priya, 'Priya Shah', 'admin')],
        [coupleId]: [person(me, 'Alex Morgan', 'owner'), person(taylor, 'Taylor Morgan', 'member')],
      },
    });
    const { page } = result;
    const region = await openMembers(page, 'Morgan family');
    const own = personRow(page, region, 'Alex Morgan (you)');
    assert.equal(await own.getByRole('button').count(), 0, 'The owner is offered no role, removal or leave button for themself.');
    await own.getByText('Owner', { exact: true }).waitFor();
    await personRow(page, region, 'Sam Lee').getByText('Member', { exact: true }).waitFor();
    await personRow(page, region, 'Priya Shah').getByText('Admin', { exact: true }).waitFor();
    assert.deepEqual(await region.getByRole('button', { name: /^Make (admin|member): / }).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
      [`Make admin: Sam Lee (${sam})`, `Make member: Priya Shah (${priya})`]);

    await region.getByRole('button', { name: `Make admin: Sam Lee (${sam})`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Make this person an admin?', exact: true });
    await dialog.getByText('Sam Lee', { exact: true }).waitFor();
    await dialog.getByText(sam, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Make admin', exact: true }).click();
    await dialog.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
    await dialog.getByText('The result is unconfirmed.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Sam Lee is now an admin.', { exact: true }).count(), 0, 'A lost answer must not be shown as a success.');
    assert.equal(await personRow(page, region, 'Sam Lee').getByText('Member', { exact: true }).count(), 1);
    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Sam Lee is now an admin.', { exact: true }).waitFor();
    await personRow(page, region, 'Sam Lee').getByText('Admin', { exact: true }).waitFor();
    await region.getByRole('button', { name: `Make member: Sam Lee (${sam})`, exact: true }).waitFor();

    const route = `/api/spaces/${familyId}/members/${sam}/role`;
    const attempts = await requests(page, 'POST', route);
    assert.equal(attempts.length, 2);
    for (const attempt of attempts) {
      assertKey(attempt);
      assert.deepEqual(attempt.body, { role: 'admin' });
      assert.equal(attempt.headers['if-match'], memberEtag(sam));
    }
    assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
    assert.equal(attempts[0].rawBody, attempts[1].rawBody);
    assert.equal((await writes(page)).role, 1);

    await region.getByRole('button', { name: `Make member: Priya Shah (${priya})`, exact: true }).click();
    const demote = page.getByRole('dialog', { name: 'Make this admin a member?', exact: true });
    await demote.getByRole('button', { name: 'Make member', exact: true }).click();
    await page.getByText('Priya Shah is now a member.', { exact: true }).waitFor();
    await personRow(page, region, 'Priya Shah').getByText('Member', { exact: true }).waitFor();
    const [demotion] = await requests(page, 'POST', `/api/spaces/${familyId}/members/${priya}/role`);
    assert.deepEqual(demotion.body, { role: 'member' });
    assert.equal(demotion.headers['if-match'], memberEtag(priya));

    await region.getByRole('button', { name: 'Close member management', exact: true }).click();
    const couple = await openMembers(page, 'Synthetic pair');
    await personRow(page, couple, 'Taylor Morgan').getByText('Member', { exact: true }).waitFor();
    assert.equal(await couple.getByRole('button', { name: /^Make (admin|member): / }).count(), 0, 'A couple Space has no roles to change.');
    await couple.getByRole('button', { name: `Remove Taylor Morgan (${taylor})`, exact: true }).waitFor();
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: an admin cannot change roles or settings and manages only ordinary members, invitations and join requests', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      spaces: [space(familyId, 'Morgan family', { role: 'admin' }), space(groupId, 'Garden club', { space_type: 'group', visibility: 'public', role: 'admin' })],
      members: {
        [familyId]: [person(taylor, 'Taylor Morgan', 'owner'), person(me, 'Alex Morgan', 'admin'), person(sam, 'Sam Lee', 'member'), person(priya, 'Priya Shah', 'admin')],
        [groupId]: [person(taylor, 'Taylor Morgan', 'owner'), person(me, 'Alex Morgan', 'admin')],
      },
      joinQueue: {
        [groupId]: [
          { id: 'a0a0a0a0-0000-4000-8000-000000000001', account_id: priya, display_name: 'Priya Shah', note: 'I grow tomatoes.', created_at: '2026-09-30T10:00:00Z', expires_at: '2026-10-14T10:00:00Z' },
          { id: 'a0a0a0a0-0000-4000-8000-000000000002', account_id: lee, display_name: 'Lee Wong', note: '', created_at: '2026-09-30T11:00:00Z', expires_at: '2026-10-14T11:00:00Z' },
        ],
      },
    });
    const { page } = result;
    await page.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Settings for / }).count(), 0, 'Only an owner gets the settings button.');
    assert.equal(await page.getByRole('button', { name: 'Join requests for Morgan family', exact: true }).count(), 0, 'Only groups take join requests.');

    const region = await openMembers(page, 'Morgan family');
    assert.equal(await region.getByRole('button', { name: /^Make (admin|member): / }).count(), 0, 'An admin cannot change roles.');
    assert.equal(await region.getByLabel('Next owner').count(), 0, 'An admin cannot offer ownership.');
    assert.deepEqual(await region.getByRole('button', { name: /^Remove / }).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
      [`Remove Sam Lee (${sam})`], 'Removal is offered only for the ordinary member.');
    assert.equal(await personRow(page, region, 'Taylor Morgan').getByRole('button').count(), 0);
    assert.equal(await personRow(page, region, 'Priya Shah').getByRole('button').count(), 0);
    await personRow(page, region, 'Alex Morgan (you)').getByRole('button', { name: 'Leave Space', exact: true }).waitFor();
    await region.getByRole('button', { name: `Remove Sam Lee (${sam})`, exact: true }).click();
    const removal = page.getByRole('dialog', { name: 'Remove this family member?', exact: true });
    await removal.getByRole('button', { name: 'Remove member', exact: true }).click();
    await page.getByText('Member removed.', { exact: true }).waitFor();
    await region.getByRole('heading', { name: 'Sam Lee', exact: true }).waitFor({ state: 'detached' });
    const [removed] = await requests(page, 'POST', `/api/spaces/${familyId}/members/${sam}/remove`);
    assertKey(removed);
    assert.deepEqual(removed.body, {});
    assert.equal(removed.headers['if-match'], memberEtag(sam));
    assert.equal(await region.getByRole('button', { name: /^Remove / }).count(), 0);
    await region.getByRole('button', { name: 'Close member management', exact: true }).click();

    await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to Morgan family', exact: true }).waitFor();
    assert.equal(await page.getByText(coupleHint, { exact: true }).count(), 0, 'The couple hint belongs to couple Spaces only.');
    await page.getByLabel('Recipient account ID', { exact: true }).fill(lee);
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await page.getByText('Invitation created.', { exact: true }).waitFor();
    await page.getByText('Pending / Member', { exact: true }).waitFor();
    const [invitation] = await requests(page, 'POST', `/api/spaces/${familyId}/invitations`);
    assertKey(invitation);
    assert.deepEqual(invitation.body, { recipient_account_id: lee });
    await page.getByRole('button', { name: 'Close invitation management', exact: true }).click();

    await page.getByRole('button', { name: 'Join requests for Garden club', exact: true }).click();
    const queue = page.getByRole('dialog', { name: 'Join requests: Garden club', exact: true });
    await queue.getByText('I grow tomatoes.', { exact: true }).waitFor();
    await queue.getByRole('button', { name: 'Approve Priya Shah', exact: true }).click();
    await queue.getByText('Priya Shah joined Garden club.', { exact: true }).waitFor();
    await queue.getByRole('button', { name: 'Decline Lee Wong', exact: true }).click();
    await queue.getByRole('button', { name: 'Confirm decline', exact: true }).click();
    await queue.getByText('You declined Lee Wong. They can ask again in 7 days.', { exact: true }).waitFor();
    await queue.getByText('Nobody is waiting.', { exact: true }).waitFor();
    assert.deepEqual((await requests(page, 'POST', `/api/spaces/${groupId}/join-requests/a0a0a0a0-0000-4000-8000-000000000001/approve`)).map(call => call.body), [{}]);
    assert.deepEqual((await requests(page, 'POST', `/api/spaces/${groupId}/join-requests/a0a0a0a0-0000-4000-8000-000000000002/decline`)).map(call => call.body), [{}]);
    await queue.getByRole('button', { name: 'Close join requests', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^Settings for / }).count(), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: the owner saves settings with the reviewed version and a changed version asks for a reload; admins get no settings button', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      spaces: [space(familyId, 'Morgan family'), space(secondFamilyId, 'Lee household', { role: 'admin' })],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')], [secondFamilyId]: [person(taylor, 'Taylor Morgan', 'owner'), person(me, 'Alex Morgan', 'admin')] },
    });
    const { page } = result;
    await page.getByRole('heading', { name: 'Lee household', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Settings for Lee household', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Settings for Morgan family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    const description = dialog.locator('textarea[name="settings_description"]');
    await dialog.getByText('Family, couple and solo Spaces are always private.', { exact: true }).waitFor();
    await dialog.getByText('0/280', { exact: true }).waitFor();
    await dialog.getByLabel('Description (only members see it)', { exact: true }).waitFor();
    await description.fill('Synthetic note');
    await dialog.getByText('14/280', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await dialog.getByText('Settings saved. Current name: Morgan family', { exact: true }).waitFor();
    const [first] = await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`);
    assertKey(first);
    assert.deepEqual(first.body, { name: 'Morgan family', description: 'Synthetic note' });
    assert.equal(first.headers['if-match'], settingsEtag(1));

    // Someone else changes the Space while the dialog is open.
    await page.evaluate(({ spaceId }) => window.spacesFixture.bump(spaceId, { name: 'Morgan household', description: 'Changed elsewhere' }), { spaceId: familyId });
    await description.fill('Second edit');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await dialog.getByRole('alert').getByText('This Space changed. Reload and review the name.', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('Settings saved. Current name: Morgan family', { exact: true }).count(), 0);
    assert.equal(await description.inputValue(), 'Second edit', 'The draft stays until the person chooses to reload.');
    assert.equal(await dialog.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    const second = (await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`))[1];
    assert.equal(second.headers['if-match'], settingsEtag(2), 'The refused save used the version that was reviewed.');
    assert.notEqual(second.headers['idempotency-key'], first.headers['idempotency-key']);
    assert.equal((await writes(page)).settings, 1);

    await page.evaluate(() => { window.spacesFixture.hold.settingsRead = true; });
    await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).click();
    await dialog.getByText('Discard the unsaved changes and load current settings?', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await page.waitForFunction(() => window.spacesFixture.holding.settingsRead);
    await dialog.getByText('Loading current settings...', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('alert').getByText('This Space changed. Reload and review the name.', { exact: true }).count(), 1, 'The conflict stays visible until current settings have arrived.');
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'Morgan family');
    assert.equal(await description.inputValue(), 'Second edit', 'An unanswered reload must not discard the draft.');
    assert.equal(await description.isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).isDisabled(), true);
    await page.evaluate(() => {
      window.spacesFixture.refuseSettingsRead = true;
      window.spacesFixture.release.settingsRead();
    });
    await dialog.getByRole('alert').getByText('Synthetic settings reload is unavailable.', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'Morgan family');
    assert.equal(await description.inputValue(), 'Second edit', 'A refused reload must not discard the draft or adopt cached settings.');
    assert.equal(await description.isDisabled(), false);
    assert.equal(await dialog.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).isDisabled(), false);
    assert.equal((await requests(page, 'GET', `/api/spaces/${familyId}/settings`)).length, 2);
    assert.equal((await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`)).length, 2);
    assert.equal((await writes(page)).settings, 1);

    await page.evaluate(() => {
      window.spacesFixture.refuseSettingsRead = false;
      window.spacesFixture.hold.settingsRead = true;
    });
    await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).click();
    await dialog.getByText('Discard the unsaved changes and load current settings?', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await page.waitForFunction(() => window.spacesFixture.holding.settingsRead);
    await dialog.getByText('Loading current settings...', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('alert').count(), 1, 'Retrying the reload is not itself a successful reload.');
    assert.equal(await description.inputValue(), 'Second edit');
    assert.equal(await dialog.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.spacesFixture.release.settingsRead());
    await dialog.getByRole('alert').waitFor({ state: 'detached' });
    await dialog.getByText('This Space changed. Reload and review the name.', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'Morgan household');
    assert.equal(await description.inputValue(), 'Changed elsewhere');
    assert.equal((await requests(page, 'GET', `/api/spaces/${familyId}/settings`)).length, 3);
    await dialog.getByLabel('Space name', { exact: true }).fill('Morgan household two');
    await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
    await dialog.getByText('Settings saved. Current name: Morgan household two', { exact: true }).waitFor();
    const third = (await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`))[2];
    assert.deepEqual(third.body, { name: 'Morgan household two' });
    assert.equal(third.headers['if-match'], settingsEtag(3));
    assert.equal((await writes(page)).settings, 2);
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await page.getByRole('heading', { name: 'Morgan household two', exact: true }).waitFor();
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: a refused settings reload hides editing after access is lost', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      spaces: [space(familyId, 'Morgan family')],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')] },
    });
    const { page } = result;
    await page.getByRole('button', { name: 'Settings for Morgan family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    const description = dialog.locator('textarea[name="settings_description"]');
    await description.fill('Unsaved description');
    await page.evaluate(spaceId => window.spacesFixture.bump(spaceId, { name: 'Changed elsewhere' }), familyId);
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await dialog.getByRole('alert').getByText('This Space changed. Reload and review the name.', { exact: true }).waitFor();
    await page.evaluate(spaceId => {
      window.spacesFixture.hold.settingsRead = true;
      window.spacesFixture.bump(spaceId, { role: 'member' });
    }, familyId);
    await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).click();
    await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await page.waitForFunction(() => window.spacesFixture.holding.settingsRead);
    await dialog.getByText('Loading current settings...', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('alert').getByText('This Space changed. Reload and review the name.', { exact: true }).count(), 1);
    assert.equal(await description.inputValue(), 'Unsaved description');
    assert.equal(await description.isDisabled(), true);
    await page.evaluate(() => window.spacesFixture.release.settingsRead());
    await dialog.getByRole('alert').getByText('Synthetic settings are unavailable.', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).count(), 0);
    assert.equal(await description.count(), 0);
    assert.equal(await dialog.getByRole('button', { name: /^Save / }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).count(), 0);
    assert.equal((await requests(page, 'GET', `/api/spaces/${familyId}/settings`)).length, 2);
    assert.equal((await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`)).length, 1);
    assert.equal((await writes(page)).settings, 0);
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: an unconfirmed settings save keeps its original key, body and reviewed version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      lose: { settings: 1 },
      spaces: [space(familyId, 'Morgan family')],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')] },
    });
    const { page } = result;
    await page.getByRole('button', { name: 'Settings for Morgan family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    const name = dialog.getByLabel('Space name', { exact: true });
    const description = dialog.locator('textarea[name="settings_description"]');
    await name.fill('Morgan household');
    await description.fill('Synthetic draft');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await dialog.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
    await dialog.getByText('The result is unconfirmed. Retrying uses the original name, description and review.', { exact: true }).waitFor();
    assert.equal(await name.isDisabled(), true);
    assert.equal(await description.isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).count(), 0);
    assert.equal(await dialog.getByText('Settings saved. Current name: Morgan household', { exact: true }).count(), 0);
    await page.evaluate(spaceId => window.spacesFixture.bump(spaceId, { name: 'Changed elsewhere' }), familyId);
    await dialog.getByRole('button', { name: 'Retry original changes', exact: true }).click();
    await dialog.getByText('Settings saved. Current name: Morgan household', { exact: true }).waitFor();
    const attempts = await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`);
    assert.equal(attempts.length, 2);
    for (const attempt of attempts) {
      assertKey(attempt);
      assert.deepEqual(attempt.body, { name: 'Morgan household', description: 'Synthetic draft' });
      assert.equal(attempt.headers['if-match'], settingsEtag(1));
    }
    assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
    assert.equal(attempts[0].rawBody, attempts[1].rawBody);
    assert.equal((await writes(page)).settings, 1);
    assert.equal((await requests(page, 'GET', `/api/spaces/${familyId}/settings`)).length, 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: Find groups lists public groups and shows a request as sent only after the server answers, retrying the same request', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const entry = (id, name, description, member_count, fields = {}) => ({ id, name, description, member_count, viewer_role: null, pending_request_id: null, can_request: true, ...fields });
    const result = await fixture(context, {
      screen: 'discover',
      groups: [
        entry(groupId, 'Garden club', 'Synthetic gardening talk', 12),
        entry(secondFamilyId, 'Chess night', 'Synthetic board games', 7, { viewer_role: 'admin', can_request: false }),
        entry(coupleId, 'Book circle', 'Synthetic reading', 1, { viewer_role: 'owner', can_request: false }),
        entry('7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c01', 'Quiet group', 'Synthetic closed group', 3, { can_request: false }),
      ],
      lose: { join: 1 },
    });
    const { page } = result;
    const card = name => page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await page.getByRole('heading', { name: 'Newest public groups', exact: true }).waitFor();
    await card('Garden club').getByText('Synthetic gardening talk', { exact: true }).waitFor();
    await card('Garden club').getByText('12 members', { exact: true }).waitFor();
    await card('Chess night').getByText('You are an admin', { exact: true }).waitFor();
    assert.equal(await card('Chess night').getByRole('button', { name: 'Ask to join', exact: true }).count(), 0);
    await card('Chess night').getByRole('link', { name: 'Open in Your Spaces', exact: true }).waitFor();
    await card('Book circle').getByText('1 member', { exact: true }).waitFor();
    await card('Book circle').getByText('You own this group', { exact: true }).waitFor();
    await card('Quiet group').getByText('Not accepting your request right now', { exact: true }).waitFor();

    await page.getByRole('searchbox', { name: 'Search by name or description', exact: true }).fill('garden');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('heading', { name: 'Groups matching "garden"', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Chess night', exact: true }).waitFor({ state: 'detached' });
    assert.ok((await requests(page, 'GET', '/api/discover/spaces')).some(call => call.query === '?limit=20&q=garden'));

    await card('Garden club').getByRole('button', { name: 'Ask to join', exact: true }).click();
    await card('Garden club').getByLabel('Note to the owner (optional)', { exact: true }).fill('  Synthetic note from a gardener.  ');
    await card('Garden club').getByRole('button', { name: 'Send request', exact: true }).click();
    await page.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
    await card('Garden club').getByText('The request was not confirmed. Retrying sends exactly the same request.', { exact: true }).waitFor();
    const waiting = async () => ({
      chip: await page.getByText('Request sent', { exact: true }).count(),
      notice: await page.getByText('Request sent to Garden club. The owner will review it.', { exact: true }).count(),
      withdraw: await page.getByRole('button', { name: 'Withdraw request', exact: true }).count(),
    });
    assert.deepEqual(await waiting(), { chip: 0, notice: 0, withdraw: 0 }, 'A lost answer must not be shown as sent.');

    await page.evaluate(() => { window.spacesFixture.hold.join = true; });
    await card('Garden club').getByRole('button', { name: 'Retry request', exact: true }).click();
    await page.waitForFunction(() => window.spacesFixture.holding.join);
    assert.deepEqual(await waiting(), { chip: 0, notice: 0, withdraw: 0 }, 'An unanswered retry is not shown as sent either.');
    await page.evaluate(() => window.spacesFixture.release.join());
    await page.getByText('Request sent to Garden club. The owner will review it.', { exact: true }).waitFor();
    await card('Garden club').getByText('Request sent', { exact: true }).waitFor();
    await card('Garden club').getByRole('button', { name: 'Withdraw request', exact: true }).waitFor();
    await page.getByText('Waiting for the owner', { exact: false }).waitFor();

    const attempts = await requests(page, 'POST', `/api/spaces/${groupId}/join-requests`);
    assert.equal(attempts.length, 2);
    for (const attempt of attempts) {
      assertKey(attempt);
      assert.deepEqual(attempt.body, { note: 'Synthetic note from a gardener.' });
    }
    assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
    assert.equal(attempts[0].rawBody, attempts[1].rawBody);
    assert.equal((await writes(page)).join, 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => {
    const viewport = innerWidth;
    const wide = [...document.querySelectorAll('body *')].map(element => ({ element, right: Math.round(element.getBoundingClientRect().right) }))
      .filter(item => item.right > viewport).slice(0, 6)
      .map(({ element, right }) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}[${element.getAttribute('aria-label') ?? element.textContent.slice(0, 30)}] right=${right}`);
    return { viewport, page: document.documentElement.scrollWidth, wide };
  });
  assert.ok(dimensions.page <= dimensions.viewport, `${state} overflows the viewport: ${JSON.stringify(dimensions)}`);
}

async function assertReachable(page, locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box, `${label} has no box`);
  const viewport = page.viewportSize().width;
  assert.ok(box.x >= 0 && box.x + box.width <= viewport + 0.5, `${label} does not fit the ${viewport} px viewport: ${JSON.stringify(box)}`);
}

test('spaces: a long name, members and settings fit 320 px at 200% text and keep their buttons reachable', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  try {
    const longName = `Synthetic${'A'.repeat(71)}`;
    const longMember = `Member${'B'.repeat(74)}`;
    const result = await fixture(context, {
      spaces: [space(familyId, longName, { description: 'Synthetic description for a long name.' })],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner'), person(sam, longMember, 'member')] },
    });
    const { page } = result;
    await page.getByRole('heading', { name: longName, exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 700 });
    // Root scaling only: body text is set in px, so only rem-sized parts grow.
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), 32);

    await assertFits(page, 'Spaces list');
    await assertReachable(page, page.getByRole('button', { name: 'Create Space', exact: true }), 'Create Space');
    for (const label of [`Settings for ${longName}`, `Members of ${longName}`, `Manage invitations for ${longName}`]) {
      await assertReachable(page, page.getByRole('button', { name: label, exact: true }), label);
    }
    await assertFits(page, 'Spaces list after scrolling to its buttons');

    const region = await openMembers(page, longName);
    await region.getByRole('heading', { name: longMember, exact: true }).waitFor();
    await assertFits(page, 'Members panel');
    const roleButton = region.getByRole('button', { name: new RegExp(`^Make admin: ${longMember}`) });
    await assertReachable(page, roleButton, 'Make admin');
    await assertReachable(page, region.getByRole('button', { name: new RegExp(`^Remove ${longMember}`) }), 'Remove member');
    await assertFits(page, 'Members panel after scrolling to its buttons');
    await roleButton.click();
    const review = page.getByRole('dialog', { name: 'Make this person an admin?', exact: true });
    await review.getByRole('button', { name: 'Make admin', exact: true }).waitFor();
    await assertFits(page, 'Role confirmation');
    for (const label of ['Cancel', 'Make admin']) await assertReachable(page, review.getByRole('button', { name: label, exact: true }), `Role confirmation: ${label}`);
    assert.equal(await review.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The role confirmation must not clip its content.');
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    await region.getByRole('button', { name: 'Close member management', exact: true }).click();

    await page.getByRole('button', { name: `Settings for ${longName}`, exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Space settings', exact: true });
    await settings.getByLabel('Space name', { exact: true }).waitFor();
    await assertFits(page, 'Space settings');
    assert.equal(await settings.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The settings dialog must not clip its content.');
    await assertReachable(page, settings.getByRole('button', { name: 'Close Space settings', exact: true }), 'Close Space settings');
    await assertReachable(page, settings.getByRole('button', { name: /^Save / }), 'Save');
    await assertFits(page, 'Space settings after scrolling to its buttons');
    assert.equal(await page.evaluate(() => window.spacesFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: each Space row says who is here, whether its agent is on and its privacy, and fits 320 px at doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, { spaces: [
      space(familyId, 'Morgan family', { member_count: 5, member_preview: ['Sam Lee', 'Priya Rao', 'Taylor Kim'], last_message_at: '2026-10-06T18:30:00Z' }),
      space(soloId, 'Just me', { space_type: 'solo', member_count: 1, member_preview: [], last_message_at: null, agent_enabled: false }),
      space(groupId, 'Older answer', { space_type: 'group', role: 'member' }),
      space(secondFamilyId, 'Small family', { member_count: 2, member_preview: ['Sam Lee'] }),
    ] });
    const { page } = result;
    const row = name => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await row('Morgan family').getByText('5 members: Sam Lee, Priya Rao, Taylor Kim + 1 more', { exact: true }).waitFor();
    await row('Morgan family').getByText('Agent on', { exact: true }).waitFor();
    await row('Small family').getByText('2 members: Sam Lee', { exact: true }).waitFor();
    await row('Just me').getByText('1 member', { exact: true }).waitFor();
    await row('Just me').getByText('Agent off', { exact: true }).waitFor();
    const lastMessage = row('Morgan family').locator('time');
    assert.equal(await lastMessage.getAttribute('datetime'), '2026-10-06T18:30:00Z');
    assert.equal(await lastMessage.textContent(), 'Last message Oct 6, 2026, 6:30 PM');
    assert.equal(await row('Just me').locator('time').count(), 0);
    // A list answer without a count shows no guessed number.
    await row('Older answer').getByText('Agent on', { exact: true }).waitFor();
    assert.equal(await row('Older answer').getByText(/members?/).count(), 0);
    const visiblePrivacy = name => row(name).getByText('Private', { exact: true }).evaluateAll(elements => elements.filter(element => element.checkVisibility()).length);
    assert.equal(await visiblePrivacy('Morgan family'), 1);
    await page.screenshot({ path: path.join(root, '.local/screenshots/spaces-row-facts-desktop.png') });

    await page.setViewportSize({ width: 320, height: 700 });
    // The privacy column is hidden on narrow screens, so the facts line carries it instead.
    assert.equal(await visiblePrivacy('Morgan family'), 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await row('Morgan family').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(root, '.local/screenshots/spaces-row-facts-320.png') });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    await assertFits(page, 'Spaces list with member and agent facts');
    const splitLabels = await row('Morgan family').locator('a > span, button > span').evaluateAll(spans => spans
      .filter(span => /^\S+$/.test(span.textContent.trim()))
      .filter(span => { const range = document.createRange(); range.selectNodeContents(span); return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size > 1; })
      .map(span => span.textContent));
    assert.deepEqual(splitLabels, [], 'One-word action labels must not split across lines at doubled text.');
    const facts = row('Morgan family').getByText('5 members: Sam Lee, Priya Rao, Taylor Kim + 1 more', { exact: true });
    await assertReachable(page, facts, 'Member summary');
    assert.ok(await facts.evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 28, 'The member summary must grow with doubled text.');
    await page.screenshot({ path: path.join(root, '.local/screenshots/spaces-row-facts-320-large-text.png'), fullPage: true });
    assert.equal(await page.evaluate(() => window.spacesFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: names, descriptions and members full of emoji load and count each emoji once, as the server does (T79)', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const emoji = count => '\u{1F600}'.repeat(count);
    const name = `Morgan ${emoji(73)}`;
    const result = await fixture(context, {
      spaces: [space(familyId, name, { description: emoji(200) })],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner'), person(sam, `Sam ${emoji(76)}`, 'member')] },
    });
    const { page } = result;
    // Valid on the server: 80 and 200 characters, though 153 and 400 UTF-16 units.
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.getByText(emoji(200), { exact: true }).waitFor();
    const region = await openMembers(page, name);
    await region.getByRole('heading', { name: `Sam ${emoji(76)}`, exact: true }).waitFor();
    await region.getByRole('button', { name: 'Close member management', exact: true }).click();

    await page.getByRole('button', { name: `Settings for ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    const description = dialog.locator('textarea[name="settings_description"]');
    await dialog.getByText('200/280', { exact: true }).waitFor();
    await description.fill(emoji(280));
    await dialog.getByText('280/280', { exact: true }).waitFor();
    assert.equal(await description.inputValue(), emoji(280), 'The field takes the full 280 characters.');
    const save = dialog.getByRole('button', { name: 'Save changes', exact: true });
    assert.equal(await save.isDisabled(), false);
    // The field stops typing at twice the limit in UTF-16 units, so 281 emoji keep 280 whole ones.
    await description.fill(emoji(281));
    assert.equal(await description.inputValue(), emoji(280));
    await description.fill('x'.repeat(281));
    await dialog.getByText('Use up to 280 characters.', { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await description.fill(emoji(280));
    await save.click();
    await dialog.getByText(`Settings saved. Current name: ${name}`, { exact: true }).waitFor();
    const [saved] = await requests(page, 'PATCH', `/api/spaces/${familyId}/settings`);
    assert.deepEqual(saved.body, { name, description: emoji(280) });
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await page.getByText(emoji(280), { exact: true }).waitFor();
    await assertOffline(result);
  } finally { await context.close(); }
});

const inviteHeading = scope => scope.getByRole('heading', { name: 'Who can invite people', exact: true, level: 3 });
const ownerAdminsOnly = 'Only the owner and admins can invite people to this Space now.';
const memberNote = 'Everyone in this Space can invite people. You see only the invitations you sent.';
const confirmOn = 'Everyone in the Space will be able to invite people. They join as members. Each member sees and can withdraw only the invitations they sent.';
const confirmOff = 'Only you and admins will be able to invite people. Invitations that members sent and that are still waiting will be withdrawn.';
const sentByMember = { id: 'e1e1e1e1-0000-4000-8000-000000000001', space_id: familyId, space_name: 'Morgan family', inviter_name: 'Alex Morgan', recipient_account_id: priya, role: 'member', status: 'pending', created_at: created, expires_at: '2026-10-04T10:00:00Z' };

test('spaces: the owner lets everyone invite people after a confirmation; a lost answer is retried with the same key, body and version (DEC-026)', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      lose: { policy: 1 },
      spaces: [space(familyId, 'Morgan family')],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')] },
    });
    const { page } = result;
    const route = `/api/spaces/${familyId}/invite-policy`;
    await page.getByRole('button', { name: 'Settings for Morgan family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    await dialog.getByLabel('Space name', { exact: true }).waitFor();
    await inviteHeading(dialog).waitFor();
    await dialog.getByText('Owner and admins', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('Everyone in the Space', { exact: true }).count(), 0);

    // Keeping the current setting sends nothing.
    await dialog.getByRole('button', { name: 'Let everyone invite people', exact: true }).click();
    await dialog.getByText(confirmOn, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Keep it for owner and admins', exact: true }).click();
    await dialog.getByText(confirmOn, { exact: true }).waitFor({ state: 'detached' });
    assert.equal((await requests(page, 'POST', route)).length, 0);

    await dialog.getByRole('button', { name: 'Let everyone invite people', exact: true }).click();
    await dialog.getByRole('button', { name: 'Let everyone invite', exact: true }).click();
    await dialog.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
    await dialog.getByText('The change is unconfirmed. Retrying sends exactly the same change.', { exact: true }).waitFor();
    // A lost answer is not shown as saved, and the reviewed change cannot be swapped for another.
    assert.equal(await dialog.getByText('Everyone in the Space can now invite people.', { exact: true }).count(), 0);
    assert.equal(await dialog.getByText('Everyone in the Space', { exact: true }).count(), 0);
    await dialog.getByText('Owner and admins', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Keep it for owner and admins', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Let everyone invite', exact: true }).count(), 0, 'The confirm button became Retry.');

    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await dialog.getByText('Everyone in the Space can now invite people.', { exact: true }).waitFor();
    await dialog.getByText('Everyone in the Space', { exact: true }).waitFor();
    assert.equal(await dialog.getByText('Owner and admins', { exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Only owner and admins can invite', exact: true }).waitFor();

    const attempts = await requests(page, 'POST', route);
    assert.equal(attempts.length, 2);
    for (const attempt of attempts) {
      assertKey(attempt);
      assert.deepEqual(attempt.body, { member_invites: true });
      assert.equal(attempt.headers['if-match'], settingsEtag(1));
    }
    assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
    assert.equal(attempts[0].rawBody, attempts[1].rawBody);
    assert.equal((await writes(page)).policy, 1);

    // Turning it off again is a new review: new key, the version the first change produced.
    await dialog.getByRole('button', { name: 'Only owner and admins can invite', exact: true }).click();
    await dialog.getByText(confirmOff, { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Only owner and admins', exact: true }).click();
    await dialog.getByText('Only you and admins can invite people now.', { exact: true }).waitFor();
    await dialog.getByText('Owner and admins', { exact: true }).waitFor();
    const off = (await requests(page, 'POST', route))[2];
    assertKey(off);
    assert.deepEqual(off.body, { member_invites: false });
    assert.equal(off.headers['if-match'], settingsEtag(2));
    assert.notEqual(off.headers['idempotency-key'], attempts[0].headers['idempotency-key']);
    assert.equal((await writes(page)).policy, 2);
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: family and group settings show Who can invite people, but couple and solo settings do not', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      spaces: [
        space(familyId, 'Morgan family'), space(groupId, 'Garden club', { space_type: 'group', visibility: 'public' }),
        space(coupleId, 'Synthetic pair', { space_type: 'couple' }), space(soloId, 'My planning', { space_type: 'solo' }),
      ],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')], [groupId]: [person(me, 'Alex Morgan', 'owner')], [coupleId]: [person(me, 'Alex Morgan', 'owner')] },
    });
    const { page } = result;
    const inspect = async name => {
      await page.getByRole('button', { name: `Settings for ${name}`, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
      await dialog.getByLabel('Space name', { exact: true }).waitFor();
      const shown = { heading: await inviteHeading(dialog).count(), button: await dialog.getByRole('button', { name: /^(Let everyone invite people|Only owner and admins can invite)$/ }).count() };
      if (shown.heading) await dialog.getByText('Owner and admins', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      return shown;
    };
    assert.deepEqual(await inspect('Morgan family'), { heading: 1, button: 1 });
    assert.deepEqual(await inspect('Garden club'), { heading: 1, button: 1 });
    assert.deepEqual(await inspect('Synthetic pair'), { heading: 0, button: 0 });
    assert.deepEqual(await inspect('My planning'), { heading: 0, button: 0 });
    assert.equal((await requests(page, 'POST', `/api/spaces/${familyId}/invite-policy`)).length, 0);
    assert.equal((await writes(page)).policy, 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('spaces: a member sees the invite button only when the family or group Space lets everyone invite, and invites with the member note', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      spaces: [
        space(familyId, 'Morgan family', { role: 'member', member_invites: true }),
        space(secondFamilyId, 'Lee household', { role: 'member' }),
        space(groupId, 'Garden club', { space_type: 'group', visibility: 'public', role: 'member', member_invites: true }),
        space(coupleId, 'Synthetic pair', { space_type: 'couple', role: 'member' }),
      ],
      members: { [coupleId]: [person(taylor, 'Taylor Morgan', 'owner'), person(me, 'Alex Morgan', 'member')] },
      sent: { [familyId]: [sentByMember] },
    });
    const { page } = result;
    await page.getByRole('heading', { name: 'Lee household', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Synthetic pair', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Manage invitations for Garden club', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Manage invitations for Lee household', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Manage invitations for Synthetic pair', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Settings for / }).count(), 0, 'A member gets no settings button.');

    await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to Morgan family', exact: true }).waitFor();
    await page.getByText(memberNote, { exact: true }).waitFor();
    await page.getByText(priya, { exact: true }).waitFor();
    assert.equal(await page.getByText(ownerAdminsOnly, { exact: true }).count(), 0);
    await page.getByLabel('Recipient account ID', { exact: true }).fill(lee);
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await page.getByText('Invitation created.', { exact: true }).waitFor();
    const [invitation] = await requests(page, 'POST', `/api/spaces/${familyId}/invitations`);
    assertKey(invitation);
    assert.deepEqual(invitation.body, { recipient_account_id: lee });
    await page.getByRole('button', { name: 'Close invitation management', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to Morgan family', exact: true }).waitFor({ state: 'detached' });

    await page.getByRole('button', { name: 'Manage invitations for Garden club', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite to Garden club', exact: true }).waitFor();
    await page.getByText(memberNote, { exact: true }).waitFor();
    await assertOffline(result);
  } finally { await context.close(); }
});

for (const role of ['owner', 'admin']) for (const status of [403, 404]) for (const width of [1440, 320]) {
  test(`spaces: ${role} can close an unconfirmed invitation after ${status} at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC', locale: 'en-US' });
    try {
      const result = await fixture(context, {
        lose: { invite: 1 },
        spaces: [space(familyId, 'Morgan family', { role }), space(groupId, 'Garden club', { space_type: 'group' })],
      });
      const { page } = result;
      if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      await page.getByLabel('Recipient account ID', { exact: true }).fill(lee);
      await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
      await page.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
      const close = page.getByRole('button', { name: 'Close invitation management', exact: true });
      assert.equal(await close.isDisabled(), true);
      assert.equal((await writes(page)).invite, 1);
      await page.evaluate(({ spaceId, status }) => {
        window.spacesFixture.sentUnavailable = spaceId;
        window.spacesFixture.sentUnavailableStatus = status;
      }, { spaceId: familyId, status });
      await page.getByRole('button', { name: 'Refresh sent invitations', exact: true }).click();
      await page.getByRole('alert').getByText(/Synthetic invitations are unavailable\.|Spaces unavailable/).waitFor();
      assert.equal(await close.isEnabled(), true, 'A denied read must not trap an unconfirmed invitation.');
      assert.equal(await page.getByLabel('Recipient account ID', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Retry invitation', exact: true }).count(), 0);
      assert.equal((await requests(page, 'POST', `/api/spaces/${familyId}/invitations`)).length, 1);
      await assertFits(page, 'Denied invitation management');
      await assertReachable(page, close, 'Close denied invitation management');
      if (process.env.COMMUNITY_CAPTURE_DIR && role === 'owner' && status === 404) {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await page.getByRole('region', { name: 'Invite to Morgan family', exact: true }).screenshot({
          path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `invitation-denied-${width}.png`),
        });
      }
      await close.click();
      await page.getByRole('heading', { name: 'Invite to Morgan family', exact: true }).waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Manage invitations for Garden club', exact: true }).isEnabled(), true);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

for (const width of [1440, 320]) {
  test(`spaces: invitation retry preserves the original request after a lost response at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC', locale: 'en-US' });
    try {
      const result = await fixture(context, { lose: { invite: 1 }, spaces: [space(familyId, 'Morgan family')] });
      const { page } = result;
      if (width === 320) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      const recipient = page.getByLabel('Recipient account ID', { exact: true });
      await recipient.fill(lee);
      await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
      await page.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
      const retry = page.getByRole('button', { name: 'Retry invitation', exact: true });
      assert.equal(await retry.isEnabled(), true);
      assert.equal(await recipient.isDisabled(), true);
      assert.equal(await recipient.inputValue(), lee);
      assert.equal(await page.getByRole('button', { name: 'Close invitation management', exact: true }).isDisabled(), true);
      assert.equal((await writes(page)).invite, 1);
      await assertFits(page, 'Unconfirmed invitation retry');
      await assertReachable(page, retry, 'Retry the original invitation');
      if (process.env.COMMUNITY_CAPTURE_DIR) {
        mkdirSync(process.env.COMMUNITY_CAPTURE_DIR, { recursive: true });
        await page.getByRole('region', { name: 'Invite to Morgan family', exact: true }).screenshot({
          path: path.join(process.env.COMMUNITY_CAPTURE_DIR, `invitation-retry-${width}.png`),
        });
      }
      await retry.click();
      await page.getByText('Invitation created.', { exact: true }).waitFor();
      const attempts = await requests(page, 'POST', `/api/spaces/${familyId}/invitations`);
      assert.equal(attempts.length, 2);
      for (const attempt of attempts) {
        assertKey(attempt);
        assert.deepEqual(attempt.body, { recipient_account_id: lee });
      }
      assert.equal(attempts[0].headers['idempotency-key'], attempts[1].headers['idempotency-key']);
      assert.equal(attempts[0].rawBody, attempts[1].rawBody);
      assert.equal((await writes(page)).invite, 1);
      assert.equal(await page.evaluate(spaceId => window.spacesFixture.sent[spaceId].length, familyId), 1);
      assert.equal(await recipient.isEnabled(), true);
      assert.equal(await recipient.inputValue(), '');
      await page.getByRole('button', { name: 'Close invitation management', exact: true }).click();
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

// A member's open panel ends when the sent list answers "not found" or the Spaces list says members may no longer invite.
for (const [how, staleSent] of [['the sent list answers not found', false], ['the refreshed Spaces list no longer lets members invite', true]]) {
  test(`spaces: when ${how}, a member's open panel shows that only the owner and admins can invite, and closing it frees the other rows`, async () => {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
    try {
      const result = await fixture(context, {
        spaces: [
          space(familyId, 'Morgan family', { role: 'member', member_invites: true }),
          space(groupId, 'Garden club', { space_type: 'group', visibility: 'public', role: 'member', member_invites: true }),
        ],
        sent: { [familyId]: [sentByMember] },
      });
      const { page } = result;
      const other = name => page.getByRole('button', { name, exact: true });
      await page.getByRole('button', { name: 'Manage invitations for Morgan family', exact: true }).click();
      await page.getByText(memberNote, { exact: true }).waitFor();
      await page.getByText(priya, { exact: true }).waitFor();
      assert.equal(await other('Manage invitations for Garden club').isDisabled(), true, 'Another row is locked while a panel is open.');
      assert.equal(await other('Members of Garden club').isDisabled(), true);

      const sentBefore = (await requests(page, 'GET', `/api/spaces/${familyId}/invitations`)).length;
      const spacesBefore = (await requests(page, 'GET', '/api/spaces')).length;
      await page.evaluate(({ spaceId, staleSent }) => {
        window.spacesFixture.staleSent = staleSent;
        window.spacesFixture.bump(spaceId, { member_invites: false });
      }, { spaceId: familyId, staleSent });
      if (staleSent) await page.getByRole('button', { name: 'Refresh Spaces', exact: true }).click();
      else await page.getByRole('button', { name: 'Refresh sent invitations', exact: true }).click();
      await page.getByRole('alert').getByText(ownerAdminsOnly, { exact: true }).waitFor();
      assert.equal(await page.getByText(memberNote, { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Recipient account ID', { exact: true }).count(), 0);
      assert.equal(await page.getByText(priya, { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Create invitation', exact: true }).count(), 0);
      // The Spaces list was read again, and now the row has no invite button.
      await page.waitForFunction(count => window.spacesFixture.calls.filter(call => call.method === 'GET' && call.route === '/api/spaces').length > count, spacesBefore);
      await other('Manage invitations for Morgan family').waitFor({ state: 'detached' });
      if (staleSent) assert.equal((await requests(page, 'GET', `/api/spaces/${familyId}/invitations`)).length, sentBefore, 'An ended panel does not ask for the sent list again.');
      assert.equal(await other('Manage invitations for Garden club').isDisabled(), true, 'The panel is still open, so the other rows stay locked.');

      const close = page.getByRole('button', { name: 'Close invitation management', exact: true });
      assert.equal(await close.isEnabled(), true);
      await close.click();
      await page.getByRole('heading', { name: 'Invite to Morgan family', exact: true }).waitFor({ state: 'detached' });
      assert.equal(await page.getByText(ownerAdminsOnly, { exact: true }).count(), 0);
      assert.equal(await other('Manage invitations for Garden club').isEnabled(), true);
      assert.equal(await other('Members of Garden club').isEnabled(), true);
      assert.equal(await other('Manage invitations for Morgan family').count(), 0);
      assert.equal((await writes(page)).invite, 0);
      await assertOffline(result);
    } finally { await context.close(); }
  });
}

test('spaces: Who can invite people and its confirmation fit 320 px at 200% text and keep their buttons reachable', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, {
      lose: { policy: 1 },
      spaces: [space(familyId, 'Morgan family')],
      members: { [familyId]: [person(me, 'Alex Morgan', 'owner')] },
    });
    const { page } = result;
    await page.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)), 32);

    await page.getByRole('button', { name: 'Settings for Morgan family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    await dialog.getByLabel('Space name', { exact: true }).waitFor();
    const noClip = async state => assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, `${state} must not clip its content.`);
    const reach = async (name, state) => assertReachable(page, dialog.getByRole('button', { name, exact: true }), `${state}: ${name}`);
    await assertReachable(page, inviteHeading(dialog), 'Who can invite people');
    await assertReachable(page, dialog.getByText('Owner and admins', { exact: true }), 'Owner and admins');
    await reach('Let everyone invite people', 'Setting');
    await assertFits(page, 'Setting'); await noClip('The setting');

    await dialog.getByRole('button', { name: 'Let everyone invite people', exact: true }).click();
    await assertReachable(page, dialog.getByText(confirmOn, { exact: true }), 'Confirmation text');
    await reach('Keep it for owner and admins', 'Confirmation'); await reach('Let everyone invite', 'Confirmation');
    await assertFits(page, 'Confirmation'); await noClip('The confirmation');

    await dialog.getByRole('button', { name: 'Let everyone invite', exact: true }).click();
    await dialog.getByRole('alert').getByText(lostAnswer, { exact: true }).waitFor();
    await assertReachable(page, dialog.getByText('The change is unconfirmed. Retrying sends exactly the same change.', { exact: true }), 'Unconfirmed note');
    await reach('Keep it for owner and admins', 'Unconfirmed'); await reach('Retry', 'Unconfirmed');
    await assertFits(page, 'Unconfirmed change'); await noClip('The unconfirmed change');

    await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
    await assertReachable(page, dialog.getByText('Everyone in the Space can now invite people.', { exact: true }), 'Success notice');
    await reach('Only owner and admins can invite', 'After saving');
    await dialog.getByRole('button', { name: 'Only owner and admins can invite', exact: true }).click();
    await assertReachable(page, dialog.getByText(confirmOff, { exact: true }), 'Confirmation text to restrict');
    await reach('Keep it for everyone', 'Restrict confirmation'); await reach('Only owner and admins', 'Restrict confirmation');
    await assertFits(page, 'Restrict confirmation'); await noClip('The restrict confirmation');
    await assertReachable(page, dialog.getByRole('button', { name: 'Close Space settings', exact: true }), 'Close Space settings');
    assert.equal((await writes(page)).policy, 1);
    await assertOffline(result);
  } finally { await context.close(); }
});
