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
const pageId = '359bd05a-c95c-4975-b061-d647e82a6958';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
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
        window.renderCommunityFixture = () => root.render(<Providers><PublicPageScreen reference="garden-club" /></Providers>);
        window.renderMyPagesFixture = () => root.render(<Providers><MyPagesScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-community.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-community.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-community-dependencies', setup(builder) {
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

// The owner's page with one published post. Saves are refused unless If-Match names the stored version, as the API does.
async function fixture(context) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline community</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, postId }) => {
    const created = '2026-09-19T10:00:00Z';
    const state = window.communityFixture = {
      calls: [],
      page: {
        id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Weekly meetups in the park.', topic: 'hobbies',
        follower_count: 3, created_at: created, updated_at: created, following: false, blocked: false, can_manage: true, etag: '"page-1"',
      },
      post: {
        id: postId, page_id: pageId, page_handle: 'garden-club', page_name: 'Garden Club', title: 'Spring plants', body: 'Seeds are in.',
        status: 'published', like_count: 0, comment_count: 0, created_at: created, published_at: created, edited_at: null,
        liked: false, saved: false, can_manage: true, etag: '"post-1"',
      },
    };
    const next = etag => etag.replace(/(\d+)"$/, (_match, number) => `${Number(number) + 1}"`);
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-community', ...extra }), { status: 200 });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-community' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/pages/garden-club' && method === 'GET') return reply(state.page);
      if (url.pathname === `/api/pages/${pageId}/posts` && method === 'GET') return reply([state.post], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === `/api/pages/${pageId}/pinned-posts` && method === 'GET') return reply(state.post.pinned ? [state.post] : []);
      if (url.pathname === `/api/pages/${pageId}/drafts` && method === 'GET') return reply([]);
      if (url.pathname === `/api/posts/${postId}/pin` && method === 'POST') {
        if (state.pinLimit) return failed(409, 'PIN_LIMIT_REACHED', 'A page can pin up to 3 posts. Unpin one first.');
        state.post.pinned = true;
        return reply(state.post);
      }
      if (url.pathname === `/api/posts/${postId}/unpin` && method === 'POST') {
        state.post.pinned = false;
        return reply(state.post);
      }
      if (url.pathname === `/api/pages/${pageId}` && method === 'PATCH') {
        if (headers['if-match'] !== state.page.etag) return failed(412, 'CONTENT_CHANGED', 'This page changed since you reviewed it. Reload to continue.');
        Object.assign(state.page, body, { etag: next(state.page.etag) });
        return reply(state.page);
      }
      if (url.pathname === `/api/posts/${postId}` && method === 'PATCH') {
        if (headers['if-match'] !== state.post.etag) return failed(412, 'CONTENT_CHANGED', 'This post changed since you reviewed it. Reload to continue.');
        Object.assign(state.post, body, { edited_at: '2026-09-19T11:00:00Z', etag: next(state.post.etag) });
        return reply(state.post);
      }
      // The owner's page has no moderators and no handover offer (DEC-025); page-roles-ui.test.mjs covers them.
      if (url.pathname === `/api/pages/${pageId}/moderators` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/handover` && method === 'GET') return failed(404, 'NOT_FOUND', 'Handover offer not found.');
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, pageId, postId });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderCommunityFixture());
  await page.getByRole('heading', { name: 'Garden Club', exact: true }).waitFor();
  await page.getByText('Seeds are in.', { exact: true }).waitFor();
  return { page, outbound, errors };
}

// Another device saves a newer version, then this tab regains focus and refetches every query, as it does when someone switches back to it.
async function changeElsewhereAndRefocus(page, change, shown) {
  await page.evaluate(change);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await page.getByText(shown, { exact: true }).first().waitFor();
}

async function saves(page) {
  await page.waitForFunction(() => window.communityFixture.calls.some(call => call.method === 'PATCH'));
  return page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'PATCH'));
}

test('page editor saves against the version it opened with, so a newer change is refused instead of overwritten', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page' });
    await editor.waitFor();

    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.page, { description: 'Moved to the library.', etag: '"page-2"' }), 'Moved to the library.');
    await editor.getByRole('combobox', { name: 'Topic' }).selectOption('education');
    await editor.getByRole('button', { name: 'Save page' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"page-1"', 'The save must name the version the editor showed.');
    await editor.getByText('This page changed since you opened the editor. Close it and reload before editing again.').waitFor();
    const stored = await page.evaluate(() => window.communityFixture.page);
    assert.equal(stored.description, 'Moved to the library.', 'The newer description must not be reverted.');
    assert.equal(stored.topic, 'hobbies');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post editor starts from the post shown when Edit is chosen and sends only the field that changed', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.post, { body: 'Seeds arrive on Friday.', edited_at: '2026-09-19T10:30:00Z', etag: '"post-2"' }), 'Seeds arrive on Friday.');

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit Spring plants' });
    assert.equal(await editor.getByRole('textbox', { name: 'Text' }).inputValue(), 'Seeds arrive on Friday.', 'The editor must show the current text.');
    await editor.getByRole('textbox', { name: 'Title (optional)' }).fill('Spring planting');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"post-2"');
    assert.deepEqual(sent[0].body, { title: 'Spring planting' });
    await editor.waitFor({ state: 'detached' });
    const stored = await page.evaluate(() => window.communityFixture.post);
    assert.equal(stored.body, 'Seeds arrive on Friday.');
    assert.equal(stored.title, 'Spring planting');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('post editor saves against the version it opened with, so a change made while editing is refused', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit Spring plants' });
    await editor.waitFor();

    await changeElsewhereAndRefocus(page, () => Object.assign(window.communityFixture.post, { body: 'Seeds arrive on Friday.', edited_at: '2026-09-19T10:30:00Z', etag: '"post-2"' }), 'Seeds arrive on Friday.');
    await editor.getByRole('textbox', { name: 'Title (optional)' }).fill('Spring planting');
    await editor.getByRole('button', { name: 'Save changes' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"post-1"', 'The save must name the version the editor showed.');
    await page.getByText('This post changed since you opened it. Reload to review the current version.').waitFor();
    const stored = await page.evaluate(() => window.communityFixture.post);
    assert.equal(stored.body, 'Seeds arrive on Friday.', 'The newer text must not be reverted.');
    assert.equal(stored.title, 'Spring plants');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('page rules are saved against the reviewed version and then shown to everyone on the page', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    assert.equal(await page.getByRole('region', { name: 'Rules', exact: true }).count(), 0, 'A page without rules shows no Rules section.');
    await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const editor = page.getByRole('form', { name: 'Edit page' });
    const rules = editor.getByRole('textbox', { name: 'Rules (optional)' });
    assert.equal(await rules.getAttribute('aria-describedby'), 'page-rules-hint');
    await rules.fill('x'.repeat(2001));
    await editor.getByText('Use up to 2000 characters.', { exact: true }).waitFor();
    assert.equal(await editor.getByRole('button', { name: 'Save page' }).isDisabled(), true);
    await rules.fill('  Be kind.\nNo selling.  ');
    await editor.getByRole('button', { name: 'Save page' }).click();

    const sent = await saves(page);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers['if-match'], '"page-1"');
    assert.deepEqual(sent[0].body, { rules: 'Be kind.\nNo selling.' }, 'Only the changed rules are sent, trimmed.');
    await editor.waitFor({ state: 'detached' });
    const shown = page.getByRole('region', { name: 'Rules', exact: true });
    await shown.getByText('Be kind.\nNo selling.', { exact: true }).waitFor();
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a pinned post shows once, marked, above the date list, and unpinning returns it there', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, outbound, errors } = await fixture(context);
    const pinned = page.getByRole('region', { name: 'Pinned', exact: true });
    const posts = page.getByRole('region', { name: 'Posts', exact: true });
    assert.equal(await pinned.count(), 0);
    await posts.getByRole('button', { name: 'Pin to top', exact: true }).click();
    await pinned.getByText('Seeds are in.', { exact: true }).waitFor();
    await pinned.getByRole('article', { name: 'Spring plants', exact: true }).getByText('Pinned', { exact: true }).waitFor();
    await posts.getByText('No other posts.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Seeds are in.', { exact: true }).count(), 1, 'A pinned post is shown once.');

    await changeElsewhereAndRefocus(page, () => { window.communityFixture.page.rules = `Be kind. ${'Share-what-you-grow-'.repeat(12)}`; }, 'Rules');
    await page.evaluate(() => document.fonts.ready);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    // Action rows share one style, so every button and link in them is checked, not only the new ones.
    const shortTargets = () => page.evaluate(() => [...document.querySelectorAll('[class*="actions"] button, [class*="actions"] a')]
      .filter(element => element.getClientRects().length > 0 && element.getBoundingClientRect().height < 44)
      .map(element => element.textContent.trim()));
    assert.equal(await fits(), true, 'rules and the pinned post at 320px');
    assert.deepEqual(await shortTargets(), [], 'action buttons and links are at least 44px tall');
    const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
    assert.equal(await fits(), true, 'rules and the pinned post at 320px and 200% text');
    assert.deepEqual(await shortTargets(), [], 'action buttons and links are at least 44px tall at 200% text');

    await pinned.getByRole('button', { name: 'Unpin', exact: true }).click();
    await pinned.waitFor({ state: 'detached' });
    await posts.getByText('Seeds are in.', { exact: true }).waitFor();
    await page.evaluate(() => { window.communityFixture.pinLimit = true; });
    await posts.getByRole('button', { name: 'Pin to top', exact: true }).click();
    await posts.getByRole('alert').filter({ hasText: 'A page can pin up to 3 posts. Unpin one first.' }).waitFor();
    const commands = await page.evaluate(() => window.communityFixture.calls.filter(call => call.method === 'POST').map(call => [call.route, call.body]));
    assert.deepEqual(commands, [[`/api/posts/${postId}/pin`, {}], [`/api/posts/${postId}/unpin`, {}], [`/api/posts/${postId}/pin`, {}]]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// "Pages you follow" while its list is loading, after loading fails and after Retry. The followed list is held until the test releases it.
test('followed pages show loading and failure instead of claiming the person follows nothing', async () => {
  const context = await browser.newContext();
  try {
    const outbound = [];
    const errors = [];
    await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<html><head><title>Offline pages</title></head><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css });
    await page.evaluate(({ accountId, pageId }) => {
      const created = '2026-09-19T10:00:00Z';
      const followed = {
        id: pageId, handle: 'garden-club', name: 'Garden Club', description: 'Weekly meetups in the park.', topic: 'hobbies',
        follower_count: 3, created_at: created, updated_at: created, following: true, blocked: false, can_manage: false, etag: null,
      };
      const state = window.pagesFixture = { calls: [], fail: true, waiting: [] };
      state.release = () => { for (const resume of state.waiting.splice(0)) resume(); };
      const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-pages', ...extra }), { status: 200 });
      window.fetch = async (input, config = {}) => {
        const url = new URL(String(input), 'https://offline.invalid');
        const method = config.method ?? 'GET';
        state.calls.push({ route: url.pathname, method });
        if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
        if (url.pathname === '/api/me/pages' && method === 'GET') return reply([]);
        // No invitations, roles or offers to moderate pages (DEC-025); page-roles-ui.test.mjs covers them.
        if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply([]);
        if (url.pathname === '/api/me/handover-offers' && method === 'GET') return reply([]);
        if (url.pathname === '/api/me/following' && method === 'GET') {
          await new Promise(resume => state.waiting.push(resume));
          if (state.fail) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable.' }, request_id: 'offline-pages' }), { status: 503 });
          return reply([followed], { pagination: { next_cursor: null, has_more: false } });
        }
        throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
      };
    }, { accountId, pageId });
    await page.addScriptTag({ content: javascript });
    await page.evaluate(() => window.renderMyPagesFixture());
    const following = page.getByRole('region', { name: 'Pages you follow', exact: true });
    await following.waitFor();
    const empty = following.getByText('You do not follow any pages.', { exact: false });
    await following.getByRole('status').filter({ hasText: 'Loading pages you follow' }).waitFor();
    assert.equal(await empty.count(), 0);
    // The failed load is retried once, as every query is.
    for (let answered = 0; answered < 2; answered++) {
      await page.waitForFunction(count => window.pagesFixture.waiting.length === 1 && window.pagesFixture.calls.filter(call => call.route === '/api/me/following').length === count, answered + 1);
      await page.evaluate(() => window.pagesFixture.release());
    }
    await following.getByRole('alert').filter({ hasText: 'Service is temporarily unavailable.' }).waitFor();
    assert.equal(await empty.count(), 0, 'A failed load must not say the person follows no pages.');
    await page.evaluate(() => { window.pagesFixture.fail = false; });
    await following.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => window.pagesFixture.waiting.length === 1);
    await page.evaluate(() => window.pagesFixture.release());
    await following.getByRole('button', { name: 'Unfollow Garden Club', exact: true }).waitFor();
    assert.equal(await following.getByRole('alert').count(), 0);
    assert.equal(await empty.count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});