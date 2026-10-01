import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const exportId = '0b6c1f9e-3f53-4c1a-9a43-000000000001';
const createdAt = '2026-10-02T02:00:00Z';
const expiresAt = '2026-10-03T02:01:00Z';
const purgeAfter = '2026-10-09T18:00:00Z';
const password = 'synthetic-password-1';
const categories = ['profile', 'security', 'spaces', 'tasks', 'reminders'];
const exportView = {
  id: exportId, status: 'queued', reason: null, categories, created_at: createdAt,
  completed_at: null, expires_at: null, size_bytes: null, requested_here: true,
};
const readyExport = { ...exportView, status: 'ready', completed_at: createdAt, expires_at: expiresAt, size_bytes: 512 };
const archive = {
  format: 'community-platform-account-export', version: 1,
  profile: { display_name: 'Alex Morgan', email: 'alex@example.test' },
  spaces: [], tasks: [{ title: 'Synthetic shared task' }], reminders: [], omitted: [],
};
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { DataScreen } from './src/features/identity/data-screen';
        import { AuthScreen } from './src/features/identity/auth-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderDataFixture = () => root.render(<Providers><DataScreen /></Providers>);
        window.renderSignInFixture = () => root.render(<Providers><AuthScreen mode="login" /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-account-data.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-account-data.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-data-dependencies', setup(builder) {
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

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  const calls = [];
  const unexpected = [];
  const navigations = [];
  const origin = 'http://127.0.0.1:3000';
  const html = '<html><head><title>Offline account data</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>';
  await context.route('**/*', route => {
    const url = route.request().url();
    if (options.fakeOrigin && route.request().resourceType() === 'document' && [origin + '/login', origin + '/app/settings/account'].includes(url)) {
      navigations.push(url);
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    outbound.push(url);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordDataCall', call => { calls.push(call); });
  await page.exposeFunction('recordUnexpectedCall', call => { unexpected.push(call); });
  if (options.fakeOrigin) await page.goto(origin + '/login');
  else await page.setContent(html);
  if (options.clock) await page.clock.install({ time: new Date(createdAt) });
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, exportView, readyExport, archive, purgeAfter, options }) => {
    const state = window.dataFixture = {
      calls: [], profile: { id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'Asia/Kolkata', email_verified: true, version: 1 },
      exports: options.exports ?? [], baseExport: exportView, readyExport, archive, purgeAfter,
      lostPrepareAnswers: options.lostPrepareAnswers ?? 0, prepareError: options.prepareError ?? null,
      receipts: {}, exportSequence: 0, uuidSequence: 0, listReads: 0,
      progression: options.progression ?? false, listFailures: options.listFailures ?? 0, holdList: options.holdList ?? false, releaseList: null,
      archiveError: options.archiveError ?? null, afterArchiveError: options.afterArchiveError ?? null,
      deletionCodes: options.deletionCodes ?? [], holdDeletion: false, releaseDeletion: null, deleted: false,
      refuseCancellation: options.refuseCancellation ?? false, holdLogin: false, releaseLogin: null,
      blobTexts: [], blobTypes: [], revokedUrls: [], downloads: [],
    };
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.uuidSequence).toString(16).padStart(12, '0')}` });
    URL.createObjectURL = blob => {
      state.blobTypes.push(blob.type);
      blob.text().then(text => state.blobTexts.push(text));
      return 'blob:offline-account-data';
    };
    URL.revokeObjectURL = url => { state.revokedUrls.push(url); };
    HTMLAnchorElement.prototype.click = function () { state.downloads.push({ name: this.download, href: this.href, connected: this.isConnected }); };
    const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-data', ...extra }), { status });
    const failure = (code, message, status, details = {}) => new Response(JSON.stringify({ error: { code, message, details }, request_id: 'offline-data' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      const headers = Object.fromEntries(new Headers(config.headers));
      const body = config.body === undefined ? null : JSON.parse(config.body);
      const call = { route: url.pathname, method, headers, body, at: Date.now() };
      state.calls.push(call);
      await window.recordDataCall(call);
      if (state.deleted) {
        await window.recordUnexpectedCall(call);
        throw new Error('No API is allowed after account deletion is accepted.');
      }
      if (url.pathname === '/api/live' && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      if (url.pathname === '/api/me' && method === 'GET') return reply(state.profile);
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], 200, { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/timezones' && method === 'GET') return reply(['UTC', 'Asia/Kolkata', 'America/Los_Angeles']);
      if (url.pathname === '/api/me/exports' && method === 'GET') {
        state.listReads++;
        const answer = () => {
          if (state.listFailures > 0) { state.listFailures--; return failure('SERVICE_UNAVAILABLE', 'Downloads are temporarily unavailable.', 503); }
          if (state.progression && state.exports.length) {
            if (state.listReads === 3) state.exports[0] = { ...state.exports[0], status: 'building' };
            if (state.listReads >= 4) state.exports[0] = { ...state.exports[0], status: 'ready', completed_at: state.readyExport.completed_at, expires_at: state.readyExport.expires_at, size_bytes: 512 };
          }
          return reply(state.exports);
        };
        if (state.holdList) { state.holdList = false; return new Promise(resolve => { state.releaseList = () => resolve(answer()); }); }
        return answer();
      }
      if (url.pathname === '/api/me/exports' && method === 'POST') {
        if (state.prepareError) return failure(state.prepareError.code, state.prepareError.message, state.prepareError.status);
        const key = headers['idempotency-key'];
        if (!key) return failure('IDEMPOTENCY_KEY_REQUIRED', 'A request key is required.', 422);
        let receipt = state.receipts[key];
        if (receipt && JSON.stringify(receipt.categories) !== JSON.stringify(body.categories)) return failure('IDEMPOTENCY_CONFLICT', 'This key belongs to a different selection.', 409);
        if (!receipt) {
          receipt = { ...state.baseExport, id: `0b6c1f9e-3f53-4c1a-9a43-${(++state.exportSequence).toString(16).padStart(12, '0')}`, categories: body.categories };
          state.receipts[key] = receipt; state.exports.unshift(receipt);
        }
        if (state.lostPrepareAnswers > 0) { state.lostPrepareAnswers--; throw new TypeError('Synthetic lost answer after the request was accepted.'); }
        return reply(receipt, 202);
      }
      const exportRoute = url.pathname.match(/^\/api\/me\/exports\/([^/]+)(\/archive)?$/);
      if (exportRoute) {
        const item = state.exports.find(value => value.id === exportRoute[1]);
        if (!item) throw new Error('The fixture has no such export.');
        if (method === 'DELETE' && !exportRoute[2]) { item.status = 'cancelled'; item.reason = 'cancelled'; return reply(item); }
        if (method === 'GET' && exportRoute[2]) {
          if (state.archiveError) {
            Object.assign(item, state.afterArchiveError);
            return failure(state.archiveError.code, state.archiveError.message, state.archiveError.status);
          }
          return reply(state.archive);
        }
        if (method === 'GET') return reply(item);
      }
      if (url.pathname === '/api/me/deletion' && method === 'POST') {
        const code = state.deletionCodes.shift();
        if (code === 'PASSWORD_INCORRECT') return failure(code, 'The supplied password did not match.', 403);
        if (code === 'OWNED_SPACES_WITH_MEMBERS') return failure(code, 'Space ownership must be resolved.', 409, { spaces: 'Family planning\nFriends circle', space_ids: 'synthetic-family,synthetic-friends' });
        const accepted = () => { state.deleted = true; return reply({ status: 'deletion_requested', purge_after: state.purgeAfter }, 202); };
        if (state.holdDeletion) return new Promise(resolve => { state.releaseDeletion = () => resolve(accepted()); });
        return accepted();
      }
      if (url.pathname === '/api/auth/login' && method === 'POST') {
        const answer = failure('ACCOUNT_DELETION_PENDING', 'Deletion is pending.', 409, { purge_after: state.purgeAfter });
        if (state.holdLogin) { state.holdLogin = false; return new Promise(resolve => { state.releaseLogin = () => resolve(answer); }); }
        return answer;
      }
      if (url.pathname === '/api/auth/cancel-deletion' && method === 'POST') return state.refuseCancellation
        ? failure('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)
        : reply({ session_id: '11111111-1111-4111-8111-111111111111', expires_at: '2026-10-02T18:00:00Z', user: state.profile });
      if (url.pathname === '/api/auth/logout' && method === 'POST') return reply({ status: 'ok' });
      await window.recordUnexpectedCall(call);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, exportView, readyExport, archive, purgeAfter, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(login => login ? window.renderSignInFixture() : window.renderDataFixture(), options.login ?? false);
  await page.getByRole('heading', { name: options.login ? 'Welcome back' : 'Your data', exact: true }).waitFor();
  return { page, outbound, errors, calls, unexpected, navigations };
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'Every non-fixture network request must stay blocked.');
  assert.deepEqual(result.errors, [], 'The components must not raise browser errors.');
  assert.deepEqual(result.unexpected, [], 'Every API call must have an explicit fixture endpoint.');
}
const preparations = result => result.calls.filter(call => call.route === '/api/me/exports' && call.method === 'POST');
const downloadButtons = page => page.getByRole('button', { name: /^Download data requested / });
const deletionPanel = page => page.getByRole('alert').filter({ hasText: 'This account is waiting to be deleted on' });
async function formattedDate(page, value, useAccountTimezone = true) {
  return page.evaluate(({ value, useAccountTimezone }) => new Intl.DateTimeFormat('en', {
    dateStyle: 'long', timeStyle: 'short', ...(useAccountTimezone ? { timeZone: window.dataFixture.profile.timezone } : {}),
  }).format(new Date(value)), { value, useAccountTimezone });
}

test('preparing a download: a lost answer keeps the selection and key, polling reaches ready, and the archive becomes a JSON file', async () => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  try {
    const result = await fixture(context, { lostPrepareAnswers: 1, progression: true, clock: true });
    const { page } = result;
    for (const label of ['Profile', 'Security activity', 'Spaces', 'Tasks', 'Reminders']) assert.equal(await page.getByRole('checkbox', { name: label, exact: true }).isChecked(), true);
    await page.getByRole('checkbox', { name: 'Security activity' }).uncheck();
    await page.getByRole('checkbox', { name: 'Reminders' }).uncheck();
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection. Your changes are not confirmed.' }).waitFor();
    await page.clock.fastForward(1000);
    assert.equal(preparations(result).length, 1, 'A lost answer must not trigger an automatic mutation retry.');
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.getByText('Being prepared', { exact: true }).waitFor();
    const sent = preparations(result);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map(call => call.body), [{ categories: ['profile', 'spaces', 'tasks'] }, { categories: ['profile', 'spaces', 'tasks'] }]);
    assert.match(sent[0].headers['idempotency-key'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    assert.equal(sent[0].headers['x-account-id'], accountId);
    await page.clock.fastForward(5100);
    await page.waitForFunction(() => window.dataFixture.listReads === 3);
    assert.equal(await page.getByText('Being prepared', { exact: true }).count(), 1, 'Building exports still poll.');
    await page.clock.fastForward(5100);
    await downloadButtons(page).waitFor();
    assert.equal(await page.getByText(`Ready until ${await formattedDate(page, expiresAt)}`, { exact: true }).count(), 1);
    const reads = await page.evaluate(() => window.dataFixture.listReads);
    await page.clock.fastForward(12000);
    assert.equal(await page.evaluate(() => window.dataFixture.listReads), reads, 'Ready exports must stop polling.');
    assert.equal(await downloadButtons(page).getAttribute('aria-label'), `Download data requested ${await formattedDate(page, createdAt)}`);
    await downloadButtons(page).click();
    await page.waitForFunction(() => window.dataFixture.blobTexts.length === 1);
    const saved = await page.evaluate(() => ({ texts: window.dataFixture.blobTexts, types: window.dataFixture.blobTypes, anchors: window.dataFixture.downloads, revoked: window.dataFixture.revokedUrls }));
    assert.deepEqual(JSON.parse(saved.texts[0]), archive);
    assert.deepEqual(saved.types, ['application/json']);
    assert.equal(saved.anchors.length, 1);
    assert.match(saved.anchors[0].name, /^community-platform-data-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(saved.anchors[0].connected, true);
    assert.deepEqual(saved.revoked, ['blob:offline-account-data']);
    assert.equal(await page.locator('a[download]').count(), 0);
    const archiveCall = result.calls.find(call => call.route === `/api/me/exports/${exportId}/archive`);
    assert.equal(archiveCall.method, 'GET'); assert.equal(archiveCall.headers['x-account-id'], accountId);
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.waitForFunction(() => window.dataFixture.calls.filter(call => call.method === 'POST').length === 3);
    assert.notEqual(preparations(result)[2].headers['idempotency-key'], sent[0].headers['idempotency-key'], 'Success must finish the old request key.');
    assertClean(result);
  } finally { await context.close(); }
});

test('download selection: changing it replaces an uncertain key and choosing nothing disables preparation', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { lostPrepareAnswers: 1 });
    const { page } = result;
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('checkbox', { name: 'Tasks', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.getByText('Being prepared', { exact: true }).first().waitFor();
    const sent = preparations(result);
    assert.deepEqual(sent[0].body, { categories });
    assert.deepEqual(sent[1].body, { categories: ['profile', 'security', 'spaces', 'reminders'] });
    assert.notEqual(sent[0].headers['idempotency-key'], sent[1].headers['idempotency-key']);
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.uncheck();
    assert.equal(await page.getByRole('button', { name: 'Prepare download', exact: true }).isDisabled(), true);
    assert.equal(preparations(result).length, 2);
    assertClean(result);
  } finally { await context.close(); }
});

test('download reauthentication: the recent-sign-in error offers an explicit sign-in-again action', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { prepareError: { code: 'REAUTHENTICATION_REQUIRED', message: 'Sign in again to export your data.', status: 403 } });
    await result.page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await result.page.getByRole('alert').filter({ hasText: 'For your safety, sign in again before downloading your data.' }).waitFor();
    assert.equal(await result.page.getByRole('button', { name: 'Sign in again', exact: true }).isEnabled(), true);
    assert.equal(result.calls.some(call => call.route === '/api/auth/logout'), false);
    assertClean(result);
  } finally { await context.close(); }
});

test('another browser download: no Download action is offered, but Cancel sends the bound DELETE and empty body', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { exports: [{ ...readyExport, requested_here: false }] });
    const { page } = result;
    await page.getByText('Download it in the browser that asked for it.', { exact: true }).waitFor();
    assert.equal(await downloadButtons(page).count(), 0);
    const cancel = page.getByRole('button', { name: /^Cancel data requested / });
    assert.equal(await cancel.getAttribute('aria-label'), `Cancel data requested ${await formattedDate(page, createdAt)}`);
    await cancel.click();
    await page.getByText('Cancelled', { exact: true }).waitFor();
    const sent = result.calls.filter(call => call.method === 'DELETE');
    assert.equal(sent.length, 1); assert.equal(sent[0].route, `/api/me/exports/${exportId}`);
    assert.deepEqual(sent[0].body, {}); assert.equal(sent[0].headers['x-account-id'], accountId);
    assertClean(result);
  } finally { await context.close(); }
});

test('download list: loading, Retry, empty results and every terminal status are visible', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { holdList: true, listFailures: 2 });
    const { page } = result;
    await page.getByText('Loading your downloads...', { exact: true }).waitFor();
    await page.waitForFunction(() => window.dataFixture.releaseList !== null);
    await page.evaluate(() => window.dataFixture.releaseList());
    const error = page.getByRole('alert').filter({ hasText: 'Downloads are temporarily unavailable.' });
    await error.waitFor();
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('You have not asked for a download yet.', { exact: true }).waitFor();
    await page.evaluate(() => {
      window.dataFixture.listFailures = 2;
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await error.waitFor();
    await page.evaluate(() => {
      const state = window.dataFixture;
      state.listFailures = 0;
      state.exports = ['queued', 'building', 'ready', 'expired', 'cancelled', 'failed', 'outdated'].map((status, index) => ({
        ...state.readyExport, id: `0b6c1f9e-3f53-4c1a-9a43-${(index + 1).toString(16).padStart(12, '0')}`, status,
      }));
    });
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Out of date because your access changed', { exact: true }).waitFor();
    assert.equal(await page.getByText('Being prepared', { exact: true }).count(), 2);
    for (const status of ['Expired', 'Cancelled', 'Could not be prepared']) assert.equal(await page.getByText(status, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('list', { name: 'Your downloads', exact: true }).getByRole('listitem').count(), 7);
    assertClean(result);
  } finally { await context.close(); }
});

test('archive errors: expiry, another session, changed access and unavailable data show the server message and refresh the list', async () => {
  for (const [code, status, update, label] of [
    ['EXPORT_EXPIRED', 410, { status: 'expired' }, 'Expired'],
    ['EXPORT_OTHER_SESSION', 403, { requested_here: false }, 'Download it in the browser that asked for it.'],
    ['EXPORT_OUTDATED', 409, { status: 'outdated' }, 'Out of date because your access changed'],
    ['EXPORT_UNAVAILABLE', 409, { status: 'failed' }, 'Could not be prepared'],
  ]) {
    const context = await browser.newContext();
    try {
      const message = `Synthetic server message for ${code}.`;
      const result = await fixture(context, { exports: [readyExport], archiveError: { code, status, message }, afterArchiveError: update });
      const { page } = result;
      await downloadButtons(page).click();
      await page.getByRole('alert').filter({ hasText: message }).waitFor();
      await page.getByText(label, { exact: true }).waitFor();
      assert.ok(result.calls.filter(call => call.route === '/api/me/exports' && call.method === 'GET').length >= 2, `${code} must refresh the list.`);
      assert.equal(await downloadButtons(page).count(), 0);
      assert.equal(await page.evaluate(() => window.dataFixture.blobTexts.length), 0);
      assertClean(result);
    } finally { await context.close(); }
  }
});

test('delete account: passwords are forgotten, refusal stays in the dialog, owned Spaces are named, and acceptance ends all reads', async () => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  try {
    const result = await fixture(context, { exports: [exportView], deletionCodes: ['PASSWORD_INCORRECT', 'OWNED_SPACES_WITH_MEMBERS'], clock: true });
    const { page } = result;
    const opener = page.getByRole('main').getByRole('button', { name: 'Delete account', exact: true });
    await page.getByText('Being prepared', { exact: true }).waitFor();
    await opener.click();
    let dialog = page.getByRole('dialog', { name: 'Delete your account?', exact: true });
    await dialog.getByLabel('Password', { exact: true }).fill(password);
    await dialog.getByRole('button', { name: 'Keep my account', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.getByLabel('Password', { exact: true }).count(), 0);
    await opener.click();
    dialog = page.getByRole('dialog', { name: 'Delete your account?', exact: true });
    const field = dialog.getByLabel('Password', { exact: true });
    assert.equal(await field.inputValue(), '');
    assert.equal(await field.getAttribute('type'), 'password');
    assert.equal(await field.getAttribute('autocomplete'), 'current-password');
    assert.equal(await field.getAttribute('maxlength'), '128');
    assert.equal(await field.evaluate(element => element.required), true);
    await field.fill('wrong-synthetic-password');
    await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'The password is incorrect.' }).waitFor();
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await field.fill(password);
    await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
    const ownership = dialog.getByRole('alert').filter({ hasText: 'You own Spaces that other people are in. Hand ownership to someone else or remove the members first:' });
    await ownership.waitFor();
    assert.deepEqual(await ownership.getByRole('listitem').allTextContents(), ['Family planning', 'Friends circle']);
    assert.equal(await ownership.getByRole('link', { name: 'Go to Spaces', exact: true }).getAttribute('href'), '/app/spaces');
    const expectedDate = await formattedDate(page, purgeAfter);
    await page.evaluate(() => { window.dataFixture.holdDeletion = true; });
    await field.fill(password);
    await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.waitForFunction(() => window.dataFixture.releaseDeletion !== null);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 1, 'Escape cannot close a pending deletion.');
    assert.equal(await dialog.getByRole('button', { name: 'Keep my account', exact: true }).isDisabled(), true);
    await page.evaluate(() => window.dataFixture.releaseDeletion());
    const status = page.getByRole('status').filter({ hasText: 'Your account will be deleted on' });
    await status.waitFor();
    assert.equal(await status.locator('p').textContent(), `Your account will be deleted on ${expectedDate}. You are signed out everywhere. To keep your account, sign in before then and choose to cancel the deletion.`);
    assert.equal(await page.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href'), '/login');
    assert.equal(await page.getByLabel('Password', { exact: true }).count(), 0);
    assert.equal(await page.locator('dialog').count(), 0);
    const sent = result.calls.filter(call => call.route === '/api/me/deletion');
    assert.equal(sent.length, 3);
    assert.deepEqual(sent.map(call => call.body), [{ password: 'wrong-synthetic-password' }, { password }, { password }]);
    assert.ok(sent.every(call => call.method === 'POST' && call.headers['x-account-id'] === accountId));
    const callsAtDeletion = result.calls.length;
    await page.clock.fastForward(20000);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    assert.equal(result.calls.length, callsAtDeletion, 'No API calls may happen after acceptance, including polling and focus refresh.');
    assertClean(result);
  } finally { await context.close(); }
});

test('sign-in: pending deletion shows its date and cancelling uses the same credentials before navigating', async () => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  try {
    const result = await fixture(context, { login: true, fakeOrigin: true });
    const { page } = result;
    await page.getByLabel('Email address', { exact: true }).fill('alex@example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const panel = deletionPanel(page);
    await panel.waitFor();
    assert.equal(await panel.locator('p').textContent(), `This account is waiting to be deleted on ${await formattedDate(page, purgeAfter, false)}. Cancel the deletion to keep your account and sign in.`);
    await panel.getByRole('button', { name: 'Cancel deletion and sign in', exact: true }).click();
    await page.waitForURL('http://127.0.0.1:3000/app/settings/account');
    const login = result.calls.find(call => call.route === '/api/auth/login');
    const cancel = result.calls.filter(call => call.route === '/api/auth/cancel-deletion');
    assert.equal(cancel.length, 1); assert.equal(cancel[0].method, 'POST');
    assert.deepEqual(login.body, { email: 'alex@example.test', password });
    assert.deepEqual(cancel[0].body, login.body);
    assert.deepEqual(result.navigations, ['http://127.0.0.1:3000/login', 'http://127.0.0.1:3000/app/settings/account']);
    assertClean(result);
  } finally { await context.close(); }
});

test('sign-in cancellation: edits and resubmission clear the panel, and refusal shows its message', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { login: true, refuseCancellation: true });
    const { page } = result;
    const email = page.getByLabel('Email address', { exact: true });
    const secret = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: 'Sign in', exact: true });
    await email.fill('alex@example.test'); await secret.fill(password); await submit.click();
    await deletionPanel(page).waitFor();
    await email.fill('other@example.test');
    assert.equal(await deletionPanel(page).count(), 0);
    await email.fill('alex@example.test'); await submit.click();
    await deletionPanel(page).waitFor();
    await secret.fill('another-synthetic-password');
    assert.equal(await deletionPanel(page).count(), 0);
    await secret.fill(password); await submit.click();
    await deletionPanel(page).waitFor();
    await page.evaluate(() => { window.dataFixture.holdLogin = true; });
    await submit.click();
    await page.waitForFunction(() => window.dataFixture.releaseLogin !== null);
    assert.equal(await deletionPanel(page).count(), 0, 'Resubmitting must clear the old panel while the new answer is pending.');
    await page.evaluate(() => window.dataFixture.releaseLogin());
    await deletionPanel(page).waitFor();
    await page.evaluate(() => { window.dataFixture.holdLogin = true; window.dataFixture.releaseLogin = null; });
    await submit.click();
    await page.waitForFunction(() => window.dataFixture.releaseLogin !== null);
    await email.fill('changed-while-signing-in@example.test');
    await page.evaluate(() => window.dataFixture.releaseLogin());
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(await deletionPanel(page).count(), 0, 'A late reply for old credentials must not restore the deletion panel.');
    await email.fill('alex@example.test'); await submit.click();
    await deletionPanel(page).getByRole('button', { name: 'Cancel deletion and sign in', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }).waitFor();
    const cancel = result.calls.filter(call => call.route === '/api/auth/cancel-deletion');
    assert.equal(cancel.length, 1); assert.deepEqual(cancel[0].body, { email: 'alex@example.test', password });
    assertClean(result);
  } finally { await context.close(); }
});

test('layout: the data page and deletion dialog fit 320 px at measured 200% text with 44 px buttons', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  try {
    const result = await fixture(context, { exports: [readyExport] });
    const { page } = result;
    await downloadButtons(page).waitFor();
    const bodyText = page.getByRole('main').locator('section p').first();
    const original = await bodyText.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
    const enlarged = await bodyText.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.equal(enlarged, original * 2, 'A body-sized text element must really double.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'The page must not scroll horizontally.');
    for (const button of await page.getByRole('main').getByRole('button').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds.height >= 44, 'Main buttons need a 44 px target.');
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'Main buttons must stay in the viewport.');
    }
    await page.getByRole('main').getByRole('button', { name: 'Delete account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?', exact: true });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Opening the dialog must not overflow the page.');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The dialog must not clip horizontal content.');
    for (const button of await dialog.getByRole('button').all()) assert.ok((await button.boundingBox()).height >= 44, 'Dialog buttons need a 44 px target.');
    assertClean(result);
  } finally { await context.close(); }
});