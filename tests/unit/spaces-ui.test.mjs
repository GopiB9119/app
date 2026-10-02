import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
      spaces: structuredClone(options.spaces ?? []),
      members: Object.fromEntries(Object.entries(options.members ?? {}).map(([id, list]) => [id, list.map(member => ({ version: 1, ...member }))])),
      groups: structuredClone(options.groups ?? []), joinQueue: structuredClone(options.joinQueue ?? {}),
      writes: { create: 0, role: 0, remove: 0, settings: 0, join: 0, invite: 0, policy: 0 },
      lose: { ...options.lose }, hold: { ...options.hold }, holding: {}, release: {},
    };
    const find = id => state.spaces.find(item => item.id === id);
    state.addMember = (spaceId, member) => {
      state.members[spaceId].push({ version: 1, ...member });
      find(spaceId).version = String(Number(find(spaceId).version) + 1);
    };
    state.bump = (spaceId, fields) => { Object.assign(find(spaceId), fields); find(spaceId).version = String(Number(find(spaceId).version) + 1); };
    const memberOut = member => ({ account_id: member.account_id, display_name: member.display_name, role: member.role, joined_at: created, etag: `"m-${member.account_id}-v${member.version}"` });
    const spaceOut = ({ id, name, description, space_type, visibility, member_invites, role, version, created_at }) => ({ id, name, description, space_type, visibility, member_invites: member_invites === true, status: 'active', role, version, created_at });
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
      if (path === '/api/invitations' && method === 'GET') return paged([]);
      let match = path.match(/^\/api\/spaces\/([^/]+)\/invitations$/);
      if (match && method === 'GET') {
        const item = find(match[1]);
        // A member who may no longer invite gets "not found"; staleSent lets a test keep answering to prove the Spaces list alone ends the panel.
        if (item?.role === 'member' && item.member_invites !== true && !state.staleSent) return failed(404, 'NOT_FOUND', 'Synthetic invitations are unavailable.');
        return paged(state.sent[match[1]] ?? []);
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
          inviter_name: 'Alex Morgan', recipient_account_id: body.recipient_account_id, role: 'member', status: 'pending',
          created_at: created, expires_at: '2026-10-04T10:00:00Z',
        };
        (state.sent[item.id] ??= []).push(invitation);
        state.writes.invite += 1;
        remember('invite', key, config, undefined, invitation);
        return reply(invitation);
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

    await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).click();
    await dialog.getByText('Discard the unsaved changes and load current settings?', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await dialog.getByText('This Space changed. Reload and review the name.', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'Morgan household');
    assert.equal(await description.inputValue(), 'Changed elsewhere');
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
