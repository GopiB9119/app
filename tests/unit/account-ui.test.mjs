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
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { AccountScreen } from './src/features/identity/account-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderAccountFixture = () => root.render(<Providers><AccountScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-account-settings.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-account-settings.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-account-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

// The signed-in account settings. The timezone list fails while `timezoneFailures` is above zero.
async function fixture(context, timezoneFailures) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline account settings</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, timezoneFailures }) => {
    const state = window.accountFixture = {
      calls: [], timezoneFailures,
      profile: { id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'Europe/Berlin', email_verified: true, version: 1 },
      // A held profile read answers with the profile as it was when the read began, once released; aborting it rejects it.
      holdNextMe: false, held: null, heldSettled: false,
    };
    const reply = (data, extra = {}, headers = {}) => new Response(JSON.stringify({ data, request_id: 'offline-account', ...extra }), { status: 200, headers });
    const profileReply = profile => reply(profile, {}, { ETag: `"profile-${profile.version}"` });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      state.calls.push({ route: url.pathname, method, headers: Object.fromEntries(new Headers(config.headers)) });
      if (url.pathname === '/api/live') {
        // The live connection stays open without hints, and closes when the page aborts it.
        return new Response(new ReadableStream({ start(controller) { config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} }); } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url.pathname === '/api/me' && method === 'GET') {
        if (!state.holdNextMe) return profileReply(state.profile);
        state.holdNextMe = false;
        const before = structuredClone(state.profile);
        return new Promise((resolve, reject) => {
          const settle = () => { state.heldSettled = true; };
          state.held = { release: () => { settle(); resolve(profileReply(before)); } };
          config.signal?.addEventListener('abort', () => { settle(); reject(new DOMException('Aborted', 'AbortError')); });
        });
      }
      if (url.pathname === '/api/me/profile' && method === 'PATCH') {
        if (new Headers(config.headers).get('If-Match') !== `"profile-${state.profile.version}"`) return new Response(JSON.stringify({ error: { code: 'PRECONDITION_FAILED', message: 'The profile changed.', details: {} }, request_id: 'offline-account' }), { status: 412 });
        Object.assign(state.profile, JSON.parse(config.body), { version: state.profile.version + 1 });
        return profileReply(state.profile);
      }
      if (url.pathname === '/api/me/sessions' || url.pathname === '/api/me/security-events') return reply([]);
      if (url.pathname === '/api/notifications') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/timezones') {
        if (state.timezoneFailures > 0) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable.', details: {} }, request_id: 'offline-account' }), { status: 503 });
        return reply(['Asia/Kolkata', 'Europe/Berlin', 'UTC']);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, timezoneFailures });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderAccountFixture());
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
  return { page, outbound, errors };
}

test('account timezone says when the list did not load, and Retry loads it without saving', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, Infinity);
    const zones = page.getByLabel('Timezone', { exact: true }).locator('option');
    const problem = page.getByRole('alert').filter({ hasText: 'The list of timezones did not load' });
    await problem.waitFor();
    assert.deepEqual(await zones.allTextContents(), ['Europe/Berlin']);
    await page.evaluate(() => { window.accountFixture.timezoneFailures = 0; });
    await problem.getByRole('button', { name: 'Retry', exact: true }).click();
    await problem.waitFor({ state: 'detached' });
    assert.deepEqual(await zones.allTextContents(), ['Asia/Kolkata', 'Europe/Berlin', 'UTC']);
    assert.equal(await page.getByLabel('Timezone', { exact: true }).inputValue(), 'Europe/Berlin');
    assert.equal(await page.evaluate(() => window.accountFixture.calls.filter(call => call.method !== 'GET').length), 0, 'Retry must not submit the profile form.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// A read that began before a save must not undo it when its older answer arrives afterwards (T87).
test('account profile: a save is not undone by an older read that answers after it', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, 0);
    const name = page.getByLabel('Display name', { exact: true });
    await name.waitFor();
    await page.evaluate(() => { window.accountFixture.holdNextMe = true; });
    // Returning to the window refetches the profile; that read is held.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.accountFixture.held !== null);
    await name.fill('Alex Updated');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('status').filter({ hasText: 'Profile saved.' }).waitFor();
    await page.evaluate(() => window.accountFixture.held.release());
    await page.waitForFunction(() => window.accountFixture.heldSettled);
    const reverted = await page.waitForFunction(() => document.querySelector('.person-row strong')?.textContent === 'Alex Morgan', null, { timeout: 1500 }).then(() => true, () => false);
    assert.equal(reverted, false, 'The older read must not replace the saved profile.');
    assert.equal(await page.locator('.person-row strong').textContent(), 'Alex Updated');
    assert.equal(await page.getByRole('button', { name: 'Discard' }).count(), 0, 'A saved profile must not show unsaved changes.');
    assert.equal((await page.evaluate(() => window.accountFixture.calls.filter(call => call.method === 'PATCH'))).length, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// T100: the server counts characters, an emoji counting once. Typing must reach the full 80, and longer is refused here.
test('account profile: the display name takes 80 emoji and says when a name is longer', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, 0);
    const name = page.getByLabel('Display name', { exact: true });
    const save = page.getByRole('button', { name: 'Save changes' });
    const tooLong = page.getByRole('alert').filter({ hasText: 'Use up to 80 characters.' });
    const emoji = '\u{1F600}'.repeat(80);
    await name.fill('');
    await name.focus();
    // Typed input is held to the field's maxLength, as a person's typing is.
    await page.keyboard.insertText(emoji);
    assert.equal(await name.inputValue(), emoji, 'The field must take 80 emoji.');
    assert.equal(await tooLong.count(), 0);
    await save.click();
    await page.getByRole('status').filter({ hasText: 'Profile saved.' }).waitFor();
    assert.equal(await page.evaluate(() => window.accountFixture.profile.display_name), emoji);
    await name.fill('');
    await name.focus();
    await page.keyboard.insertText('a'.repeat(81));
    await tooLong.waitFor();
    assert.equal(await save.isDisabled(), true, 'A name over 80 characters must not be sent.');
    await page.keyboard.press('Enter');
    assert.equal((await page.evaluate(() => window.accountFixture.calls.filter(call => call.method === 'PATCH'))).length, 1);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});