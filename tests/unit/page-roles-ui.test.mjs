import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Page moderators, handing a page over, and archiving, deleting and restoring it (DEC-025 parts 3 to 5), offline in Chromium.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '1b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e';
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const hillId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const activeId = '2c3d4e5f-6071-4c8d-8e9f-1a2b3c4d5e6f';
const invitedId = '3d4e5f60-7182-4d9e-9fa0-2b3c4d5e6f70';
const offerId = '4f5e6d7c-8b9a-4c0d-9e1f-2a3b4c5d6e7f';
const created = '2026-09-19T10:00:00Z';
const later = '2099-01-01T00:00:00Z';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { PublicPageScreen } from './src/features/community/page-screen';
        import { MyPagesScreen } from './src/features/community/pages-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderPageFixture = () => root.render(<Providers><PublicPageScreen reference="garden-club" /></Providers>);
        window.renderPagesFixture = () => root.render(<Providers><MyPagesScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-page-roles.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-page-roles.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-page-roles-dependencies', setup(builder) {
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

const moderator = (overrides = {}) => ({
  id: activeId, page_id: pageId, account_id: otherId, display_name: 'Sam Lee', status: 'active',
  created_at: created, expires_at: null, resolved_at: created, etag: '"a1"', ...overrides,
});
const role = (overrides = {}) => ({
  id: invitedId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', status: 'pending',
  created_at: created, expires_at: later, resolved_at: null, etag: '"r1"', ...overrides,
});
const offer = (overrides = {}) => ({
  id: offerId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', from_account_id: otherId, from_name: 'Ana Rao',
  to_account_id: accountId, to_name: 'Alex Morgan', status: 'pending', created_at: created, expires_at: later, resolved_at: null, etag: '"h1"', ...overrides,
});

// One page, its moderators, handover offers and state, and the signed-in person's own roles. Commands are refused unless
// If-Match names the version shown, as the API does, and every call is recorded with its body and headers.
async function open(context, { owner = true, moderators = [], roles = [], offers = [], screen = 'page' } = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline page roles</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, postId, invitedId, offerId, created, later, owner, moderators, roles, offers }) => {
    const state = window.rolesFixture = {
      calls: [], moderators, roles, offers, handover: null, sequence: 0, reauthenticate: false, holdPage: false, held: [],
      page: {
        id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Weekly meetups in the park.', rules: '', topic: 'hobbies',
        status: 'active', purge_after: null, follower_count: 3, created_at: created, updated_at: created, following: false, blocked: false,
        can_manage: owner, etag: owner ? '"page-1"' : null,
      },
      post: {
        id: postId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', title: 'Spring plants', body: 'Seeds are in.',
        status: 'published', like_count: 0, comment_count: 0, created_at: created, published_at: created, edited_at: null,
        liked: false, saved: false, pinned: false, can_manage: owner, etag: owner ? '"post-1"' : null,
      },
    };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    // A slow server: reading the page waits until the test lets it answer.
    state.releasePage = () => { state.holdPage = false; state.held.splice(0).forEach(resolve => resolve()); };
    const next = etag => etag.replace(/(\d+)"$/, (_match, number) => `${Number(number) + 1}"`);
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-page-roles', ...extra }), { status: 200 });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-page-roles' }), { status });
    const changed = () => failed(412, 'CONTENT_CHANGED', 'This changed since you reviewed it. Reload to continue.');
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      const base = `/api/pages/${pageId}`;
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/pages/garden-club' && method === 'GET') {
        if (state.holdPage) await new Promise(resolve => state.held.push(resolve));
        return reply(state.page);
      }
      if (url.pathname === `${base}/posts` && method === 'GET') return reply([state.post], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `${base}/pinned-posts` && method === 'GET') return reply(state.post.pinned ? [state.post] : []);
      if (url.pathname === `${base}/drafts` && method === 'GET') return reply([]);
      if (url.pathname === `/api/posts/${postId}/pin` && method === 'POST') { state.post.pinned = true; return reply(state.post); }
      if (url.pathname === `/api/posts/${postId}/unpin` && method === 'POST') { state.post.pinned = false; return reply(state.post); }
      if (url.pathname === `${base}/moderators` && method === 'GET') return reply(state.moderators);
      if (url.pathname === `${base}/moderators` && method === 'POST') {
        const row = { id: invitedId, page_id: pageId, account_id: body.account_id, display_name: 'Kim Ray', status: 'pending', created_at: created, expires_at: later, resolved_at: null, etag: '"m1"' };
        state.moderators = [...state.moderators, row];
        return reply(row);
      }
      const resolve = url.pathname.match(/^\/api\/pages\/([^/]+)\/moderators\/([^/]+)\/(withdraw|remove|accept|decline|step-down)$/);
      if (resolve && method === 'POST') {
        const outcome = { withdraw: 'withdrawn', remove: 'removed', accept: 'active', decline: 'declined', 'step-down': 'stepped_down' }[resolve[3]];
        const listed = state.moderators.find(item => item.id === resolve[2]);
        const mine = state.roles.find(item => item.id === resolve[2] && item.page_id === resolve[1]);
        const row = listed ?? (mine && { ...mine, account_id: accountId, display_name: 'Alex Morgan' });
        if (!row) return failed(404, 'NOT_FOUND', 'Invitation not found.');
        if (headers['if-match'] !== row.etag) return changed();
        const result = { id: row.id, page_id: row.page_id, account_id: row.account_id, display_name: row.display_name, status: outcome, created_at: created, expires_at: null, resolved_at: created, etag: next(row.etag) };
        state.moderators = state.moderators.filter(item => item.id !== row.id);
        state.roles = state.roles.flatMap(item => item.id !== row.id ? [item] : outcome === 'active' ? [{ ...item, status: 'active', expires_at: null, resolved_at: created, etag: result.etag }] : []);
        return reply(result);
      }
      if (url.pathname === `${base}/handover` && method === 'GET') return state.handover ? reply(state.handover) : failed(404, 'NOT_FOUND', 'Handover offer not found.');
      if (url.pathname === `${base}/handover` && method === 'POST') {
        if (headers['if-match'] !== state.page.etag) return changed();
        if (state.reauthenticate) return failed(403, 'REAUTHENTICATION_REQUIRED', 'Sign in again before changing who owns the page.');
        const target = state.moderators.find(item => item.account_id === body.to_account_id && item.status === 'active');
        if (!target) return failed(409, 'MODERATOR_REQUIRED', 'Offer the page to a person who is a current moderator.');
        state.handover = {
          id: offerId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', from_account_id: accountId, from_name: 'Alex Morgan',
          to_account_id: body.to_account_id, to_name: target.display_name, status: 'pending', created_at: created, expires_at: later, resolved_at: null, etag: '"h1"',
        };
        return reply(state.handover);
      }
      const answer = url.pathname.match(/^\/api\/pages\/([^/]+)\/handover\/([^/]+)\/(accept|decline|cancel)$/);
      if (answer && method === 'POST') {
        const current = state.handover?.id === answer[2] ? state.handover : state.offers.find(item => item.id === answer[2] && item.page_id === answer[1]);
        if (!current) return failed(404, 'NOT_FOUND', 'Handover offer not found.');
        if (headers['if-match'] !== current.etag) return changed();
        const done = { ...current, status: { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[answer[3]], expires_at: null, resolved_at: created, etag: next(current.etag) };
        if (state.handover?.id === current.id) state.handover = done;
        state.offers = state.offers.filter(item => item.id !== current.id);
        return reply(done);
      }
      const lifecycle = url.pathname.match(/^\/api\/pages\/([^/]+)\/(archive|restore|delete)$/);
      if (lifecycle && method === 'POST') {
        if (headers['if-match'] !== state.page.etag) return changed();
        if (lifecycle[2] === 'delete' && body.confirm !== state.page.name) return failed(409, 'PAGE_NAME_MISMATCH', "Type the page's name exactly to delete it.");
        const status = { archive: { status: 'read_only' }, delete: { status: 'deleted', purge_after: '2026-09-26T10:00:00Z' }, restore: { status: 'active', purge_after: null } }[lifecycle[2]];
        Object.assign(state.page, status, { etag: next(state.page.etag) });
        return reply(state.page);
      }
      if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply(state.roles);
      if (url.pathname === '/api/me/handover-offers' && method === 'GET') return reply(state.offers);
      if (url.pathname === '/api/me/pages' && method === 'GET') return reply(owner ? [state.page] : []);
      if (url.pathname === '/api/me/following' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false } });
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, pageId, postId, invitedId, offerId, created, later, owner, moderators, roles, offers });
  await page.addScriptTag({ content: javascript });
  if (screen === 'pages') {
    await page.evaluate(() => window.renderPagesFixture());
    await page.getByRole('heading', { name: 'Your pages', exact: true }).waitFor();
  } else {
    await page.evaluate(() => window.renderPageFixture());
    await page.getByRole('heading', { name: 'Garden Club', exact: true }).waitFor();
  }
  return { page, outbound, errors };
}

const commands = page => page.evaluate(() => window.rolesFixture.calls.filter(call => call.method === 'POST')
  .map(call => [call.route.replace(/^\/api\//, ''), call.body, call.headers['if-match'] ?? null, call.headers['idempotency-key'] ?? null]));

// Another device changes the page, then this tab regains focus and refetches every query.
async function changeElsewhereAndRefocus(page, change) {
  await page.evaluate(change);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
}

// The screen fits 320 px without sideways scrolling and every action is at least 44 px tall, at normal and at 200% text.
async function fitsNarrowAndLarge(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const shortTargets = () => page.evaluate(() => [...document.querySelectorAll('[class*="actions"] button, [class*="actions"] a')]
    .filter(element => element.getClientRects().length > 0 && element.getBoundingClientRect().height < 44)
    .map(element => element.textContent.trim()));
  assert.equal(await fits(), true, `${label} at 320px`);
  assert.deepEqual(await shortTargets(), [], `${label}: actions at least 44px tall`);
  const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
  assert.equal(await fits(), true, `${label} at 320px and 200% text`);
  assert.deepEqual(await shortTargets(), [], `${label}: actions at least 44px tall at 200% text`);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
}

test('an owner invites only another full account ID, and withdrawing or removing a moderator asks first, naming them', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context, { moderators: [moderator()] });
    const section = page.getByRole('region', { name: 'Moderators', exact: true });
    await section.getByText('Sam Lee', { exact: true }).waitFor();
    const form = section.getByRole('form', { name: 'Invite a moderator' });
    const field = form.getByRole('textbox', { name: 'Their account ID' });
    const send = form.getByRole('button', { name: 'Send invitation' });
    for (const typed of ['1b2c3d4e', accountId.toUpperCase()]) {
      await field.fill(typed);
      await form.getByText('Enter the full account ID of another person.', { exact: true }).waitFor();
      assert.equal(await send.isDisabled(), true, typed);
    }
    await field.fill(`  ${otherId.toUpperCase()}  `);
    await send.click();
    await page.getByRole('status').filter({ hasText: 'Invitation sent. They have 72 hours to accept.' }).waitFor();
    await section.getByText('Kim Ray', { exact: true }).waitFor();
    await section.getByText('Invited. They can answer until', { exact: false }).waitFor();
    // While an invitation waits, no second one can be sent.
    await form.waitFor({ state: 'detached' });
    await fitsNarrowAndLarge(page, 'moderators');

    await section.getByRole('button', { name: 'Withdraw invitation', exact: true }).click();
    const question = section.getByRole('group', { name: 'Moderators', exact: true });
    await question.getByText('Withdraw the invitation to Kim Ray? They will no longer be able to accept.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Withdraw invitation', exact: true }).click();
    await section.getByText('Kim Ray', { exact: true }).waitFor({ state: 'detached' });
    await form.waitFor();

    await section.getByRole('button', { name: 'Remove', exact: true }).click();
    await question.getByText('Remove Sam Lee? They will no longer moderate Garden Club.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Keep', exact: true }).click();
    await question.waitFor({ state: 'detached' });
    await section.getByRole('button', { name: 'Remove', exact: true }).click();
    await question.getByRole('button', { name: 'Remove', exact: true }).click();
    await section.getByText('No moderators yet.', { exact: true }).waitFor();
    assert.deepEqual(await commands(page), [
      [`pages/${pageId}/moderators`, { account_id: otherId }, null, '00000000-0000-4000-8000-000000000001'],
      [`pages/${pageId}/moderators/${invitedId}/withdraw`, {}, '"m1"', null],
      [`pages/${pageId}/moderators/${activeId}/remove`, {}, '"a1"', null],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an owner offers the page to a moderator against the version shown, sees it waiting and can cancel it', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context, { moderators: [moderator()] });
    const section = page.getByRole('region', { name: 'Moderators', exact: true });
    const question = section.getByRole('group', { name: 'Moderators', exact: true });
    await page.evaluate(() => { window.rolesFixture.reauthenticate = true; });
    await section.getByRole('button', { name: 'Hand over the page', exact: true }).click();
    await question.getByText('Hand Garden Club over to Sam Lee? If they accept within 15 minutes, they own the page and you become one of its moderators. You need to have signed in within the last 15 minutes.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Offer the page', exact: true }).click();
    // A sign-in that is too old is a definite refusal, so nothing waits for a retry.
    await page.getByRole('alert').filter({ hasText: 'Sign in again before changing who owns the page.' }).waitFor();
    assert.equal(await section.getByRole('button', { name: 'Retry offer', exact: true }).count(), 0);

    await page.evaluate(() => { window.rolesFixture.reauthenticate = false; });
    await question.getByRole('button', { name: 'Offer the page', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Offer sent. It lasts 15 minutes.' }).waitFor();
    await section.getByText('Offered to Sam Lee until', { exact: false }).waitFor();
    assert.equal(await section.getByRole('button', { name: 'Hand over the page', exact: true }).count(), 0, 'One offer at a time.');
    await fitsNarrowAndLarge(page, 'a waiting offer');

    await section.getByRole('button', { name: 'Cancel the offer', exact: true }).click();
    await section.getByRole('button', { name: 'Hand over the page', exact: true }).waitFor();
    assert.equal(await section.getByText('Offered to Sam Lee until', { exact: false }).count(), 0);
    assert.deepEqual(await commands(page), [
      [`pages/${pageId}/handover`, { to_account_id: otherId }, '"page-1"', '00000000-0000-4000-8000-000000000001'],
      [`pages/${pageId}/handover`, { to_account_id: otherId }, '"page-1"', '00000000-0000-4000-8000-000000000002'],
      [`pages/${pageId}/handover/${offerId}/cancel`, {}, '"h1"', null],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('T151: an unconfirmed handover hides Offer and retries the exact original command', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context, { moderators: [moderator()] });
    const section = page.getByRole('region', { name: 'Moderators', exact: true });
    const question = section.getByRole('group', { name: 'Moderators', exact: true });
    await page.evaluate(pageId => {
      const originalFetch = window.fetch;
      let lost = false;
      window.fetch = async (input, config = {}) => {
        const response = await originalFetch(input, config);
        if (String(input) === `/api/pages/${pageId}/handover` && config.method === 'POST' && !lost) {
          lost = true;
          throw new TypeError('Synthetic lost handover response');
        }
        return response;
      };
    }, pageId);
    await section.getByRole('button', { name: 'Hand over the page', exact: true }).click();
    await question.getByRole('button', { name: 'Offer the page', exact: true }).click();
    const retry = section.getByRole('button', { name: 'Retry offer', exact: true });
    await retry.waitFor();
    assert.equal(await question.isVisible(), true, 'The reviewed recipient stays visible after the lost answer.');
    assert.equal(await section.getByRole('button', { name: 'Offer the page', exact: true }).count(), 0, 'A tracked retry must not allow a second offer key.');
    assert.equal(await section.getByRole('button', { name: 'Hand over the page', exact: true }).count(), 0);
    const original = await commands(page);
    assert.deepEqual(original, [[`pages/${pageId}/handover`, { to_account_id: otherId }, '"page-1"', '00000000-0000-4000-8000-000000000001']]);

    await page.evaluate(() => document.fonts.ready);
    const normalSize = await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await retry.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), normalSize * 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The tracked offer fits at 320px and 200% text.');
    const retryBox = await retry.boundingBox();
    assert.ok(retryBox.x >= 0 && retryBox.x + retryBox.width <= 320 && retryBox.height >= 44);

    await retry.click();
    await page.getByRole('status').filter({ hasText: 'Offer sent. It lasts 15 minutes.' }).waitFor();
    await section.getByText('Offered to Sam Lee until', { exact: false }).waitFor();
    await retry.waitFor({ state: 'detached' });
    assert.equal(await question.count(), 0);
    assert.deepEqual(await commands(page), [original[0], original[0]], 'Retry preserves the recipient, reviewed version and original key.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('archiving makes the page read only; deleting needs its exact name, hides it and offers Restore for 7 days', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context);
    const state = page.getByRole('region', { name: 'Archive or delete', exact: true });
    await page.getByRole('form', { name: 'New post' }).waitFor();
    await state.getByRole('button', { name: 'Archive page', exact: true }).click();
    const archive = state.getByRole('group', { name: 'Archive page', exact: true });
    await archive.getByText('Archive Garden Club? It stays readable, but nothing new can be posted, commented on, liked or followed until you restore it.', { exact: true }).waitFor();
    await archive.getByRole('button', { name: 'Archive page', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Page archived. It is read only until you restore it.' }).waitFor();
    await page.getByText('This page is archived. You can read it, but nothing new can be posted, commented on, liked or followed.', { exact: true }).waitFor();
    await page.getByRole('form', { name: 'New post' }).waitFor({ state: 'detached' });
    for (const name of ['Edit page', 'Send invitation', 'Hand over the page', 'Edit', 'Pin to top']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, `${name} is not offered on a read-only page`);
    }
    await page.getByText('Seeds are in.', { exact: true }).waitFor();
    await fitsNarrowAndLarge(page, 'a read-only page');

    await state.getByRole('button', { name: 'Restore page', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Page restored.' }).waitFor();
    await page.getByRole('form', { name: 'New post' }).waitFor();

    await state.getByRole('button', { name: 'Delete page', exact: true }).click();
    const remove = state.getByRole('form', { name: 'Delete page' });
    await remove.getByText('Delete Garden Club? The page and everything on it are hidden from everyone at once. You can restore it for 7 days; then it is erased, and its handle stays reserved.', { exact: true }).waitFor();
    const confirm = remove.getByRole('button', { name: 'Delete page', exact: true });
    const name = remove.getByRole('textbox', { name: "Type the page's name to confirm" });
    assert.equal(await confirm.isDisabled(), true);
    await name.fill('Garden Clu');
    assert.equal(await confirm.isDisabled(), true);
    await name.fill('  Garden   Club ');
    await confirm.click();
    const deleted = page.getByRole('region', { name: 'Deleted', exact: true });
    await deleted.getByText('You deleted this page, so nobody else can see it. Restore it before', { exact: false }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Page deleted. You can restore it for 7 days.' }).waitFor();
    for (const region of ['Posts', 'Moderators', 'Drafts', 'Archive or delete']) {
      assert.equal(await page.getByRole('region', { name: region, exact: true }).count(), 0, `${region} is hidden on a deleted page`);
    }
    await fitsNarrowAndLarge(page, 'a deleted page');
    await deleted.getByRole('button', { name: 'Restore page', exact: true }).click();
    await page.getByRole('region', { name: 'Posts', exact: true }).getByText('Seeds are in.', { exact: true }).waitFor();
    assert.deepEqual((await commands(page)).map(([route, body, version]) => [route, body, version]), [
      [`pages/${pageId}/archive`, {}, '"page-1"'],
      [`pages/${pageId}/restore`, {}, '"page-2"'],
      [`pages/${pageId}/delete`, { confirm: 'Garden Club' }, '"page-3"'],
      [`pages/${pageId}/restore`, {}, '"page-4"'],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// Found by the live journey: Delete right after Restore was sent with the version before the restore and refused as changed.
test('a page change shows the version the server answered with at once, so the next change is not refused while the page reloads', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context);
    const state = page.getByRole('region', { name: 'Archive or delete', exact: true });
    await page.getByRole('form', { name: 'New post' }).waitFor();
    await state.getByRole('button', { name: 'Archive page', exact: true }).click();
    await state.getByRole('group', { name: 'Archive page', exact: true }).getByRole('button', { name: 'Archive page', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Page archived. It is read only until you restore it.' }).waitFor();
    await page.evaluate(() => { window.rolesFixture.holdPage = true; });

    await state.getByRole('button', { name: 'Restore page', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Page restored.' }).waitFor();
    await state.getByRole('button', { name: 'Archive page', exact: true }).waitFor();
    await state.getByRole('button', { name: 'Delete page', exact: true }).click();
    const remove = state.getByRole('form', { name: 'Delete page' });
    await remove.getByRole('textbox', { name: "Type the page's name to confirm" }).fill('Garden Club');
    await remove.getByRole('button', { name: 'Delete page', exact: true }).click();
    await page.getByRole('region', { name: 'Deleted', exact: true }).getByText('You deleted this page, so nobody else can see it. Restore it before', { exact: false }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.evaluate(() => window.rolesFixture.releasePage());
    assert.deepEqual((await commands(page)).map(([route, body, version]) => [route, body, version]), [
      [`pages/${pageId}/archive`, {}, '"page-1"'],
      [`pages/${pageId}/restore`, {}, '"page-2"'],
      [`pages/${pageId}/delete`, { confirm: 'Garden Club' }, '"page-3"'],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a moderator pins the page's posts without the owner's controls, and an archived page offers neither pin nor follow", async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await open(context, { owner: false });
    const posts = page.getByRole('region', { name: 'Posts', exact: true });
    await posts.getByText('Seeds are in.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Pin to top', exact: true }).count(), 0, 'Someone who does not moderate the page cannot pin.');

    await changeElsewhereAndRefocus(page, () => { window.rolesFixture.roles = [{ ...window.rolesFixture.roles[0], id: '2c3d4e5f-6071-4c8d-8e9f-1a2b3c4d5e6f', page_id: '359bd05a-c95c-4975-b061-d647e82a6958', page_handle: 'garden-club', page_name: 'Garden Club', status: 'active', created_at: '2026-09-19T10:00:00Z', expires_at: null, resolved_at: '2026-09-19T10:00:00Z', etag: '"r2"' }]; });
    await page.getByText('You moderate this page', { exact: true }).waitFor();
    await posts.getByRole('button', { name: 'Pin to top', exact: true }).click();
    const pinned = page.getByRole('region', { name: 'Pinned', exact: true });
    await pinned.getByRole('button', { name: 'Unpin', exact: true }).waitFor();
    for (const name of ['Edit page', 'Edit', 'Publish', 'Delete']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, name);
    for (const region of ['Moderators', 'Archive or delete', 'Drafts']) assert.equal(await page.getByRole('region', { name: region, exact: true }).count(), 0, region);
    await page.getByRole('button', { name: 'Follow', exact: true }).waitFor();
    await fitsNarrowAndLarge(page, "a moderator's view");

    await changeElsewhereAndRefocus(page, () => { window.rolesFixture.page.status = 'read_only'; });
    await page.getByText('This page is archived. You can read it, but nothing new can be posted, commented on, liked or followed.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Unpin', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: 'Pin to top', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Follow', exact: true }).count(), 0, 'An archived page cannot be followed.');
    // Someone who already follows it can still unfollow.
    await changeElsewhereAndRefocus(page, () => { window.rolesFixture.page.following = true; });
    await page.getByRole('button', { name: 'Following', exact: true }).waitFor();
    assert.deepEqual((await commands(page)).map(([route]) => route), [`posts/${postId}/pin`]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('your pages list offers, invitations and the pages you moderate, and taking over, agreeing or stepping down ask first', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const hill = role({ id: activeId, page_id: hillId, page_handle: 'hill-runners', page_name: 'Hill Runners', status: 'active', expires_at: null, resolved_at: created, etag: '"r2"' });
    const { page, outbound, errors } = await open(context, { owner: false, screen: 'pages', roles: [role(), hill], offers: [offer()] });
    const section = page.getByRole('region', { name: 'Pages you help moderate', exact: true });
    await section.getByText('Ana Rao offers you Garden Club until', { exact: false }).waitFor();
    await section.getByText('You are invited to moderate Garden Club. Answer by', { exact: false }).waitFor();
    await section.getByRole('link', { name: 'Hill Runners', exact: true }).waitFor();
    assert.equal(await section.getByRole('link', { name: 'Hill Runners', exact: true }).getAttribute('href'), '/pages/hill-runners');
    await fitsNarrowAndLarge(page, 'pages you help moderate');
    const question = section.getByRole('group', { name: 'Pages you help moderate', exact: true });

    await section.getByRole('button', { name: 'Take over', exact: true }).click();
    await question.getByText('Take over Garden Club? You become its owner and Ana Rao becomes one of its moderators. You need to have signed in within the last 15 minutes.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Not now', exact: true }).click();
    await question.waitFor({ state: 'detached' });
    await section.getByRole('button', { name: 'Take over', exact: true }).click();
    await question.getByRole('button', { name: 'Take over', exact: true }).click();
    await section.getByRole('status').filter({ hasText: 'You own the page now. Its previous owner is one of its moderators.' }).waitFor();
    await section.getByText('Ana Rao offers you Garden Club until', { exact: false }).waitFor({ state: 'detached' });

    await section.getByRole('button', { name: 'Accept', exact: true }).click();
    await question.getByText('Moderate Garden Club? You can remove comments and pin posts on this page, and step down at any time.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Accept', exact: true }).click();
    await section.getByRole('link', { name: 'Garden Club', exact: true }).waitFor();

    await section.getByRole('button', { name: 'Step down', exact: true }).first().click();
    await question.getByText('Step down from Garden Club? You will no longer moderate it.', { exact: true }).waitFor();
    await question.getByRole('button', { name: 'Step down', exact: true }).click();
    await section.getByRole('link', { name: 'Garden Club', exact: true }).waitFor({ state: 'detached' });
    await section.getByRole('button', { name: 'Step down', exact: true }).click();
    await question.getByRole('button', { name: 'Step down', exact: true }).click();
    await section.getByText('You do not moderate any pages.', { exact: true }).waitFor();
    assert.deepEqual((await commands(page)).map(([route, body, version]) => [route, body, version]), [
      [`pages/${pageId}/handover/${offerId}/accept`, {}, '"h1"'],
      [`pages/${pageId}/moderators/${invitedId}/accept`, {}, '"r1"'],
      [`pages/${pageId}/moderators/${invitedId}/step-down`, {}, '"r2"'],
      [`pages/${hillId}/moderators/${activeId}/step-down`, {}, '"r2"'],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('declining an offer or an invitation is sent at once, and a refused answer keeps the list as the server has it', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await open(context, { owner: false, screen: 'pages', roles: [role()], offers: [offer()] });
    const section = page.getByRole('region', { name: 'Pages you help moderate', exact: true });
    await section.getByText('Ana Rao offers you Garden Club until', { exact: false }).waitFor();
    // Another device already answered the invitation, so its version changed.
    await page.evaluate(() => { window.rolesFixture.roles[0].etag = '"r9"'; });
    await section.getByRole('button', { name: 'Decline', exact: true }).nth(1).click();
    await section.getByRole('alert').filter({ hasText: 'This changed since you reviewed it. Reload to continue.' }).waitFor();
    await section.getByRole('button', { name: 'Decline', exact: true }).nth(1).click();
    await section.getByText('You are invited to moderate Garden Club. Answer by', { exact: false }).waitFor({ state: 'detached' });
    await section.getByRole('button', { name: 'Decline', exact: true }).click();
    await section.getByText('You do not moderate any pages.', { exact: true }).waitFor();
    assert.deepEqual((await commands(page)).map(([route, body, version]) => [route, body, version]), [
      [`pages/${pageId}/moderators/${invitedId}/decline`, {}, '"r1"'],
      [`pages/${pageId}/moderators/${invitedId}/decline`, {}, '"r9"'],
      [`pages/${pageId}/handover/${offerId}/decline`, {}, '"h1"'],
    ]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
