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
const commentId = '11111111-1111-4111-8111-111111111111';
const decisionId = '0b6c1f9e-3f53-4c1a-9a43-000000000001';
const appealedDecisionId = '0b6c1f9e-3f53-4c1a-9a43-000000000002';
const appealId = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const blockId = '0b6c1f9e-3f53-4c1a-9a43-000000000020';
const created = '2026-10-02T02:00:00Z';
const previewText = 'Preview <b>markup</b> with plain text.';
const queueItem = {
  target_type: 'post', target_id: postId, preview: { title: 'Reported post', body: previewText, status: 'published' },
  page_name: 'Synthetic page', report_count: 3, reasons: [{ reason: 'spam', count: 1 }, { reason: 'privacy', count: 2 }], first_reported_at: created,
};
const appealReview = {
  appeal: { id: appealId, decision_id: appealedDecisionId, note: 'Please review <b>markup</b> again.', status: 'open', created_at: created, resolved_at: null },
  decision: { id: appealedDecisionId, target_type: 'post', target_id: postId, action: 'hide', reason: 'privacy', note: 'Private moderator note.',
    decided_by: '22222222-2222-4222-8222-222222222222', decided_at: created, appeal_of: null },
  preview: { title: 'Appealed post', body: 'Appeal <b>markup</b> preview.', status: 'published' }, page_name: 'Synthetic page', resolution_note: null,
};
const notices = [
  { id: decisionId, action: 'hide', appeal_status: null, appeal_of: null },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000003', action: 'no_action', appeal_status: null, appeal_of: null },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000004', action: 'hide', appeal_status: 'open', appeal_of: null },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000005', action: 'hide', appeal_status: 'upheld', appeal_of: null },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000006', action: 'hide', appeal_status: 'overturned', appeal_of: null },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000007', action: 'restore', appeal_status: null, appeal_of: decisionId },
  { id: '0b6c1f9e-3f53-4c1a-9a43-000000000008', action: 'hide', appeal_status: null, appeal_of: decisionId },
].map((item, index) => ({ ...item, target_type: ['page', 'post', 'comment'][index % 3], target_id: [pageId, postId, commentId][index % 3], reason: 'privacy', decided_at: created }));
const reports = [
  { target_type: 'page', target_id: pageId, status: 'open', outcome: null, action: null, reviewed_at: null },
  { target_type: 'post', target_id: postId, status: 'reviewed', outcome: 'action_taken', action: 'hide', reviewed_at: created },
  { target_type: 'comment', target_id: commentId, status: 'reviewed', outcome: 'no_action', action: 'no_action', reviewed_at: created },
].map((item, index) => ({ ...item, id: `0b6c1f9e-3f53-4c1a-9a43-${(30 + index).toString().padStart(12, '0')}`, reason: 'spam', created_at: created }));
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import ModerationPage from './src/app/app/moderation/page';
        import { SafetyScreen } from './src/features/community/safety-screen';
        import { PostScreen } from './src/features/community/post-screen';
        import { PublicPageScreen } from './src/features/community/page-screen';
        import { MyPagesScreen } from './src/features/community/pages-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderModerationFixture = mode => {
          window.fixtureMode = mode;
          root.render(<Providers>{mode === 'safety' ? <SafetyScreen /> : mode === 'post' ? <PostScreen postId="${postId}" />
            : mode === 'page' ? <PublicPageScreen reference="synthetic-page" /> : mode === 'pages' ? <MyPagesScreen /> : <ModerationPage />}</Providers>);
        };`,
      resolveDir: web, sourcefile: 'offline-moderation.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-moderation.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-moderation-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.fixtureMode === "safety" ? "/app/safety" : window.fixtureMode === "moderation" ? "/app/moderation" : "/app/pages";',
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

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  const unexpected = [];
  const calls = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordModerationCall', call => { calls.push(call); });
  await page.exposeFunction('recordUnexpectedCall', call => { unexpected.push(call); });
  await page.setContent('<html><head><title>Offline moderation</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, pageId, postId, commentId, decisionId, appealId, blockId, created, queueItem, appealReview, notices, reports, options }) => {
    const state = window.moderationFixture = {
      calls: [], unexpected: [], uuidSequence: 0,
      moderator: options.moderator ?? true, accessFailures: options.accessFailures ?? 0,
      queue: options.queue ?? [queueItem], queueFailures: options.queueFailures ?? 0, queueStartReads: 0, cursorReset: false,
      appeals: options.appeals ?? [appealReview], appealListFailures: options.appealListFailures ?? 0,
      notices, reports, noticeFailures: options.noticeFailures ?? 0, reportFailures: options.reportFailures ?? 0,
      decisionLostAnswers: options.decisionLostAnswers ?? 0, appealLostAnswers: options.appealLostAnswers ?? 0,
      decisionError: options.decisionError ?? null, resolutionError: options.resolutionError ?? null,
      decisions: {}, appealReceipts: {},
      blocks: [{ id: blockId, target_type: 'page', page_id: pageId, label: 'Synthetic blocked page', created_at: created }],
      post: {
        id: postId, page_id: pageId, page_handle: 'synthetic-page', page_name: 'Synthetic page', title: 'Your hidden post',
        body: 'Author <b>markup</b> body.', status: 'published', like_count: 0, comment_count: 1,
        created_at: created, published_at: created, edited_at: null, liked: false, saved: false, pinned: false,
        can_manage: true, etag: '"post-1"', moderation: { hidden: true, reason: 'privacy' },
      },
      publicPage: {
        id: pageId, handle: 'synthetic-page', name: 'Your hidden page', description: 'Page description.', rules: '', topic: 'community', status: 'active',
        follower_count: 0, created_at: created, updated_at: created, following: false, blocked: false, can_manage: true, etag: '"page-1"', purge_after: null,
        moderation: { hidden: true, reason: 'spam' },
      },
      comment: { id: commentId, post_id: postId, parent_id: null, author_name: 'Alex Morgan', body: 'Comment <b>markup</b> body.', status: 'visible',
        created_at: created, mine: true, can_remove: true, moderation: { hidden: true, reason: 'harassment' } },
    };
    if (options.longText) {
      state.queue[0].page_name = `Synthetic ${'LongPageName'.repeat(18)}`;
      state.queue[0].preview.body = `${state.queue[0].preview.body} ${'LongPreview'.repeat(30)}`;
      state.appeals[0].preview.body = `${state.appeals[0].preview.body} ${'LongAppealPreview'.repeat(20)}`;
      state.appeals[0].appeal.note = `Appeal ${'LongAppealNote'.repeat(30)}`;
    }
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.uuidSequence).toString(16).padStart(12, '0')}` });
    const reply = (data, status = 200, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-moderation', ...extra }), { status });
    const failure = (code, message, status = 409) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-moderation' }), { status });
    const paged = (data, cursor = null) => reply(data, 200, { pagination: { next_cursor: cursor, has_more: cursor !== null } });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      const headers = Object.fromEntries(new Headers(config.headers));
      const body = config.body === undefined ? null : JSON.parse(config.body);
      const call = { method, path: url.pathname, query: url.search, headers, body };
      state.calls.push(call);
      await window.recordModerationCall(call);
      if (url.pathname === '/api/live' && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      if (url.pathname === '/api/me' && method === 'GET') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], 200, { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/me/moderator' && method === 'GET') {
        if (state.accessFailures-- > 0) return failure('SERVICE_UNAVAILABLE', 'Moderator access is temporarily unavailable.', 503);
        return reply({ moderator: state.moderator });
      }
      if (url.pathname === '/api/moderation/queue' && method === 'GET') {
        if (!state.moderator) throw new Error('A non-moderator must never request the queue.');
        if (state.queueFailures-- > 0) return failure('SERVICE_UNAVAILABLE', 'Reports are temporarily unavailable.', 503);
        const cursor = url.searchParams.get('cursor');
        if (!cursor) {
          state.queueStartReads++;
          return state.cursorReset ? paged(state.queue.map(item => ({ ...item, preview: { ...item.preview, title: 'Reloaded post' } })))
            : paged(state.queue, options.hasMore ? 'queue-cursor-1' : null);
        }
        if (cursor === 'queue-cursor-1') return paged([{ ...queueItem, target_type: 'comment', target_id: commentId,
          preview: { body: 'Later comment <b>markup</b>.', status: 'visible' } }], options.cursorFailure ? 'queue-cursor-2' : null);
        if (cursor === 'queue-cursor-2' && options.cursorFailure) {
          state.cursorReset = true;
          return failure(options.cursorFailure, 'Reload the moderation queue.', options.cursorFailure === 'CURSOR_EXPIRED' ? 410 : 400);
        }
      }
      if (url.pathname === '/api/moderation/decisions' && method === 'POST') {
        if (state.decisionError) return failure(state.decisionError.code, state.decisionError.message);
        const key = headers['idempotency-key'];
        if (!key) return failure('IDEMPOTENCY_KEY_REQUIRED', 'A request key is required.', 422);
        const receipt = state.decisions[key];
        if (receipt && JSON.stringify(receipt.body) !== JSON.stringify(body)) return failure('IDEMPOTENCY_CONFLICT', 'This retry does not match the original decision.');
        if (!receipt) {
          state.decisions[key] = { body, result: { id: decisionId, ...body, decided_by: accountId, decided_at: created, appeal_of: null } };
          state.queue = state.queue.filter(item => item.target_type !== body.target_type || item.target_id !== body.target_id);
        }
        if (state.decisionLostAnswers-- > 0) throw new TypeError('Synthetic lost answer after committing the decision.');
        return reply(state.decisions[key].result, 201);
      }
      if (url.pathname === '/api/moderation/appeals' && method === 'GET') {
        if (state.appealListFailures-- > 0) return failure('SERVICE_UNAVAILABLE', 'Appeals are temporarily unavailable.', 503);
        return reply(state.appeals.filter(item => item.appeal.status === url.searchParams.get('status')));
      }
      if (url.pathname === `/api/moderation/appeals/${appealId}/resolve` && method === 'POST') {
        if (state.resolutionError) return failure(state.resolutionError.code, state.resolutionError.message);
        const item = state.appeals.find(item => item.appeal.id === appealId);
        if (!item) throw new Error('Unknown appeal.');
        item.appeal = { ...item.appeal, status: body.outcome, resolved_at: created };
        item.resolution_note = body.note;
        return reply(item.appeal);
      }
      if (url.pathname === '/api/me/moderation-notices' && method === 'GET') {
        if (state.noticeFailures-- > 0) return failure('SERVICE_UNAVAILABLE', 'Decisions are temporarily unavailable.', 503);
        return reply(state.notices);
      }
      if (url.pathname === '/api/me/reports' && method === 'GET') {
        if (state.reportFailures-- > 0) return failure('SERVICE_UNAVAILABLE', 'Your reports are temporarily unavailable.', 503);
        return reply(state.reports);
      }
      if (url.pathname === `/api/moderation/decisions/${decisionId}/appeal` && method === 'POST') {
        const key = headers['idempotency-key'];
        if (!key) return failure('IDEMPOTENCY_KEY_REQUIRED', 'A request key is required.', 422);
        const receipt = state.appealReceipts[key];
        if (receipt && receipt.note !== body.note) return failure('IDEMPOTENCY_CONFLICT', 'This retry does not match the original appeal.');
        state.appealReceipts[key] ??= { id: appealId, decision_id: decisionId, note: body.note, status: 'open', created_at: created, resolved_at: null };
        state.notices.find(item => item.id === decisionId).appeal_status = 'open';
        if (state.appealLostAnswers-- > 0) throw new TypeError('Synthetic lost answer after committing the appeal.');
        return reply(state.appealReceipts[key], 201);
      }
      if (url.pathname === '/api/me/blocks' && method === 'GET') return reply(state.blocks);
      if (url.pathname === `/api/blocks/${blockId}/remove` && method === 'POST') { state.blocks = []; return reply({ id: blockId, status: 'removed' }); }
      if (url.pathname === `/api/posts/${postId}` && method === 'GET') return reply(state.post);
      if (url.pathname === `/api/posts/${postId}/comments` && method === 'GET') return paged([state.comment]);
      if (url.pathname === '/api/pages/synthetic-page' && method === 'GET') return reply(state.publicPage);
      if (url.pathname === `/api/pages/${pageId}/posts` && method === 'GET') return paged([state.post]);
      if (url.pathname === `/api/pages/${pageId}/pinned-posts` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/drafts` && method === 'GET') return reply([]);
      // Page roles and handover (T84) have nothing to show here: no moderators, roles or offers.
      if (url.pathname === `/api/pages/${pageId}/moderators` && method === 'GET') return reply([]);
      if (url.pathname === `/api/pages/${pageId}/handover` && method === 'GET') return failure('NOT_FOUND', 'Handover offer not found.', 404);
      if (url.pathname === '/api/me/moderator-roles' && method === 'GET') return reply([]);
      if (url.pathname === '/api/me/handover-offers' && method === 'GET') return reply([]);
      if (url.pathname === '/api/me/pages' && method === 'GET') return reply([state.publicPage]);
      if (url.pathname === '/api/me/following' && method === 'GET') return paged([]);
      state.unexpected.push(call);
      await window.recordUnexpectedCall(call);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}${url.search}`);
    };
  }, { accountId, pageId, postId, commentId, decisionId, appealId, blockId, created, queueItem, appealReview, notices, reports, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(mode => window.renderModerationFixture(mode), options.mode ?? 'moderation');
  await page.getByRole('main').waitFor();
  return { page, outbound, errors, unexpected, calls };
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'All network requests must be blocked; fixtures supply every response.');
  assert.deepEqual(result.errors, [], 'No component may raise a pageerror.');
  assert.deepEqual(result.unexpected, [], 'Unknown API endpoints are test failures.');
}
const commands = (result, path) => result.calls.filter(call => call.path === path && call.method === 'POST');
const reportCard = page => page.getByRole('article', { name: 'Post report', exact: true });
const appealCard = page => page.getByRole('article', { name: 'Post appeal', exact: true });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('moderation: a non-moderator sees only the refusal and never requests either review list', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { moderator: false });
    await result.page.getByText('Only platform moderators can open this page.', { exact: true }).waitFor();
    assert.equal(await result.page.getByRole('tablist').count(), 0);
    assert.equal(await result.page.getByRole('heading', { name: 'Moderation', exact: true }).count(), 0);
    assert.equal(result.calls.filter(call => call.path.startsWith('/api/moderation/')).length, 0);
    const access = result.calls.find(call => call.path === '/api/me/moderator');
    assert.equal(access.headers['x-account-id'], accountId);
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: Hide retries the exact body and Idempotency-Key after a lost answer, then removes the item', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { decisionLostAnswers: 1 });
    const { page } = result;
    const card = reportCard(page);
    await card.getByText(previewText, { exact: true }).waitFor();
    assert.equal(await card.locator('b').count(), 0, 'Preview markup must be literal text, not HTML.');
    assert.equal(await card.getByText('3 reports', { exact: true }).count(), 1);
    assert.equal(await card.getByText('Spam or scam: 1', { exact: true }).count(), 1);
    assert.equal(await card.getByText('Shares private information: 2', { exact: true }).count(), 1);
    assert.equal(await card.getByRole('combobox', { name: 'Reason', exact: true }).inputValue(), 'privacy', 'The highest-count reason is selected.');
    assert.equal(await card.getByRole('radio', { name: 'Hide', exact: true }).isChecked(), false);
    assert.equal(await card.getByRole('radio', { name: 'No action', exact: true }).isChecked(), false);
    assert.equal(await card.getByRole('button', { name: 'Record decision', exact: true }).isDisabled(), true);
    await card.getByRole('radio', { name: 'Hide', exact: true }).check();
    await card.getByRole('combobox', { name: 'Reason', exact: true }).selectOption('harassment');
    await card.getByRole('textbox', { name: 'Note for moderators (optional)', exact: true }).fill('  Reviewed <b>markup</b>.  ');
    await card.getByRole('button', { name: 'Record decision', exact: true }).click();
    await card.getByRole('alert').filter({ hasText: 'No connection. Your changes are not confirmed.' }).waitFor();
    assert.equal(commands(result, '/api/moderation/decisions').length, 1, 'Mutations never retry automatically.');
    assert.equal(await card.getByRole('combobox', { name: 'Reason', exact: true }).isDisabled(), true);
    assert.equal(await card.getByRole('textbox').isDisabled(), true);
    assert.equal(await card.getByRole('textbox').inputValue(), '  Reviewed <b>markup</b>.  ');
    await card.getByRole('button', { name: 'Record decision', exact: true }).click();
    await page.waitForFunction(() => window.moderationFixture.calls.filter(call => call.path === '/api/moderation/decisions').length === 2);
    const sent = commands(result, '/api/moderation/decisions');
    const body = { target_type: 'post', target_id: postId, action: 'hide', reason: 'harassment', note: 'Reviewed <b>markup</b>.' };
    assert.deepEqual(sent.map(call => call.body), [body, body]);
    assert.match(sent[0].headers['idempotency-key'], uuidPattern);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key'], 'A lost answer must keep the same decision key.');
    assert.equal(sent[0].headers['x-account-id'], accountId);
    await page.getByText('Decision recorded.', { exact: true }).waitFor();
    assert.equal(await card.count(), 0);
    await page.getByText('No reports are waiting.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Profile', exact: true }).getAttribute('aria-current'), 'page');
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: conflict of interest shows the server message and keeps the reported content', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { decisionError: { code: 'CONFLICT_OF_INTEREST', message: 'Another moderator must review this content.' } });
    const card = reportCard(result.page);
    await card.getByRole('radio', { name: 'Hide', exact: true }).check();
    await card.getByRole('button', { name: 'Record decision', exact: true }).click();
    await card.getByRole('alert').getByText('Another moderator must review this content.', { exact: true }).waitFor();
    assert.equal(await card.count(), 1);
    assert.equal(await result.page.getByText('Decision recorded.', { exact: true }).count(), 0);
    assert.equal(commands(result, '/api/moderation/decisions').length, 1);
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: No action sends an empty optional note and enforces the 1000-character limit', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const card = reportCard(result.page);
    await card.getByRole('radio', { name: 'No action', exact: true }).check();
    await card.getByRole('textbox').fill('x'.repeat(1001));
    await card.getByText('1001/1000 characters', { exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: 'Record decision', exact: true }).isDisabled(), true);
    await card.getByRole('textbox').fill('');
    await card.getByRole('button', { name: 'Record decision', exact: true }).click();
    await result.page.getByText('Decision recorded.', { exact: true }).waitFor();
    assert.deepEqual(commands(result, '/api/moderation/decisions')[0].body, { target_type: 'post', target_id: postId, action: 'no_action', reason: 'privacy', note: '' });
    assertClean(result);
  } finally { await context.close(); }
});

for (const code of ['CURSOR_INVALID', 'CURSOR_EXPIRED']) test(`moderation: Load more sends the cursor and ${code} replaces all pages from the start`, async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { hasMore: true, cursorFailure: code });
    const { page } = result;
    await reportCard(page).waitFor();
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.getByText('Later comment <b>markup</b>.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.getByRole('heading', { name: 'Reloaded post', exact: true }).waitFor();
    assert.equal(await page.getByText('Later comment <b>markup</b>.', { exact: true }).count(), 0, 'Old cursor pages must be discarded.');
    assert.equal(await page.getByRole('button', { name: 'Load more', exact: true }).count(), 0);
    const reads = result.calls.filter(call => call.path === '/api/moderation/queue');
    assert.deepEqual(reads.map(call => Object.fromEntries(new URLSearchParams(call.query))), [
      { limit: '20' }, { limit: '20', cursor: 'queue-cursor-1' }, { limit: '20', cursor: 'queue-cursor-2' }, { limit: '20' },
    ]);
    assert.ok(reads.every(call => call.headers['x-account-id'] === accountId));
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: Restore content resolves the right appeal with the exact note and removes it', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    await page.getByRole('tab', { name: 'Appeals', exact: true }).click();
    const card = appealCard(page);
    await card.getByText('Please review <b>markup</b> again.', { exact: true }).waitFor();
    assert.equal(await card.getByText('Appeal <b>markup</b> preview.', { exact: true }).count(), 1);
    assert.equal(await card.locator('b').count(), 0);
    await card.getByRole('textbox', { name: 'Note for moderators (optional)', exact: true }).fill('  Hiding was mistaken.  ');
    await card.getByRole('button', { name: 'Restore content', exact: true }).click();
    await page.getByText('Appeal resolved.', { exact: true }).waitFor();
    assert.equal(await card.count(), 0);
    await page.getByText('No appeals are waiting.', { exact: true }).waitFor();
    const sent = commands(result, `/api/moderation/appeals/${appealId}/resolve`);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, { outcome: 'overturned', note: 'Hiding was mistaken.' });
    assert.equal(sent[0].headers['x-account-id'], accountId);
    assert.equal(result.calls.find(call => call.path === '/api/moderation/appeals').query, '?status=open');
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: Keep decision sends upheld, and an appeal conflict preserves the review', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { resolutionError: { code: 'CONFLICT_OF_INTEREST', message: 'Another moderator must review this appeal.' } });
    const { page } = result;
    await page.getByRole('tab', { name: 'Appeals', exact: true }).click();
    const card = appealCard(page);
    await card.getByRole('button', { name: 'Keep decision', exact: true }).click();
    await card.getByRole('alert').getByText('Another moderator must review this appeal.', { exact: true }).waitFor();
    assert.equal(await card.count(), 1);
    assert.deepEqual(commands(result, `/api/moderation/appeals/${appealId}/resolve`)[0].body, { outcome: 'upheld', note: '' });
    await page.evaluate(() => { window.moderationFixture.resolutionError = null; });
    await card.getByRole('button', { name: 'Keep decision', exact: true }).click();
    await page.getByText('Appeal resolved.', { exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('safety: notices gate Appeal precisely, reports show all three states and a non-moderator has no queue link', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'safety', moderator: false });
    const { page } = result;
    const decisions = page.getByRole('region', { name: 'Decisions about your content', exact: true });
    await decisions.getByText('Decision kept after appeal', { exact: true }).waitFor();
    await page.getByRole('region', { name: 'Your reports', exact: true }).getByText('Reviewed: no action', { exact: true }).waitFor();
    assert.equal(await decisions.getByRole('listitem').count(), 7);
    assert.equal(await decisions.getByRole('button', { name: 'Appeal', exact: true }).count(), 1);
    assert.equal(await decisions.getByText('Appeal waiting', { exact: true }).count(), 1);
    assert.equal(await decisions.getByText('Restored after appeal', { exact: true }).count(), 2);
    assert.equal(await decisions.getByText('Post / No action', { exact: true }).count(), 1);
    assert.equal(await decisions.getByText('Comment / Restored', { exact: true }).count(), 1);
    const personalReports = page.getByRole('region', { name: 'Your reports', exact: true });
    for (const text of ['Waiting for review', 'Reviewed: action taken', 'Reviewed: no action']) assert.equal(await personalReports.getByText(text, { exact: true }).count(), 1);
    for (const text of ['Page / Spam or scam', 'Post / Spam or scam', 'Comment / Spam or scam']) assert.equal(await personalReports.getByText(text, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Moderation queue', exact: true }).count(), 0);
    assert.equal(await page.getByText('Private moderator note.', { exact: true }).count(), 0);
    await decisions.getByRole('button', { name: 'Appeal', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Appeal decision', exact: true });
    const note = dialog.getByRole('textbox', { name: 'Note', exact: true });
    assert.equal(await note.getAttribute('required'), '');
    assert.equal(await dialog.getByRole('button', { name: 'Send appeal', exact: true }).isDisabled(), true);
    await note.fill('x'.repeat(1001));
    await dialog.getByText('1001/1000 characters', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Send appeal', exact: true }).isDisabled(), true);
    await note.fill('  Please reconsider <b>markup</b>.  ');
    await dialog.getByRole('button', { name: 'Send appeal', exact: true }).click();
    await page.getByText('Appeal sent.', { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(await decisions.getByRole('button', { name: 'Appeal', exact: true }).count(), 0);
    const sent = commands(result, `/api/moderation/decisions/${decisionId}/appeal`);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, { note: 'Please reconsider <b>markup</b>.' });
    assert.match(sent[0].headers['idempotency-key'], uuidPattern);
    assert.equal(sent[0].headers['x-account-id'], accountId);
    assertClean(result);
  } finally { await context.close(); }
});

test('safety: a lost appeal answer keeps its note and key even after Cancel and reopening', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'safety', appealLostAnswers: 1 });
    const { page } = result;
    await page.getByRole('button', { name: 'Appeal', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Appeal decision', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(commands(result, `/api/moderation/decisions/${decisionId}/appeal`).length, 0, 'Cancel before sending has no effect.');
    await page.getByRole('button', { name: 'Appeal', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Note', exact: true }).fill('Keep this exact note.');
    await dialog.getByRole('button', { name: 'Send appeal', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'No connection. Your changes are not confirmed.' }).waitFor();
    assert.equal(await dialog.getByRole('textbox').isDisabled(), true);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Appeal', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox').inputValue(), 'Keep this exact note.');
    assert.equal(await dialog.getByRole('textbox').isDisabled(), true);
    await dialog.getByRole('button', { name: 'Send appeal', exact: true }).click();
    await page.getByText('Appeal sent.', { exact: true }).waitFor();
    const sent = commands(result, `/api/moderation/decisions/${decisionId}/appeal`);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map(call => call.body), [{ note: 'Keep this exact note.' }, { note: 'Keep this exact note.' }]);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    assertClean(result);
  } finally { await context.close(); }
});

test('safety: a moderator gets the queue link, and blocked/unblock still works', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'safety' });
    const { page } = result;
    await page.getByRole('link', { name: 'Moderation queue', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Moderation queue', exact: true }).getAttribute('href'), '/app/moderation');
    await page.getByRole('button', { name: 'Unblock Synthetic blocked page', exact: true }).click();
    await page.getByRole('group', { name: 'Confirm unblock Synthetic blocked page', exact: true }).getByRole('button', { name: 'Unblock', exact: true }).click();
    await page.getByText('You have not blocked anyone.', { exact: true }).waitFor();
    assert.deepEqual(commands(result, `/api/blocks/${blockId}/remove`).map(call => call.body), [{}]);
    assertClean(result);
  } finally { await context.close(); }
});

test('safety: errors in new sections have their own Retry and cannot break the blocked list', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'safety', noticeFailures: 1, reportFailures: 1, accessFailures: 1 });
    const { page } = result;
    const decisions = page.getByRole('region', { name: 'Decisions about your content', exact: true });
    const personalReports = page.getByRole('region', { name: 'Your reports', exact: true });
    await decisions.getByRole('alert').filter({ hasText: 'Decisions are temporarily unavailable.' }).waitFor();
    await personalReports.getByRole('alert').filter({ hasText: 'Your reports are temporarily unavailable.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Unblock Synthetic blocked page', exact: true }).count(), 1);
    await decisions.getByRole('button', { name: 'Retry', exact: true }).click();
    await decisions.getByRole('button', { name: 'Appeal', exact: true }).waitFor();
    await personalReports.getByRole('button', { name: 'Retry', exact: true }).click();
    await personalReports.getByText('Waiting for review', { exact: true }).waitFor();
    await page.getByRole('alert').filter({ hasText: 'Moderator access is temporarily unavailable.' }).getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('link', { name: 'Moderation queue', exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('authors: hidden post and comment notes come from moderation metadata and keep all markup literal', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode: 'post' });
    const { page } = result;
    await page.getByText('Hidden by moderators: Shares private information. Only you can see it.', { exact: true }).waitFor();
    await page.getByText('Hidden by moderators: Harassment or bullying. Only you can see it.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Author <b>markup</b> body.', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Comment <b>markup</b> body.', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('main').locator('b').count(), 0);
    assertClean(result);
  } finally { await context.close(); }
});

for (const mode of ['page', 'pages']) test(`authors: hidden page metadata is marked in the ${mode} view`, async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { mode });
    await result.page.getByText('Hidden by moderators: Spam or scam. Only you can see it.', { exact: true }).waitFor();
    if (mode === 'page') await result.page.getByText('Hidden by moderators: Shares private information. Only you can see it.', { exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: arrow keys, Home and End select and focus tabs with one tab stop', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    const reportsTab = page.getByRole('tab', { name: 'Reports', exact: true });
    const appealsTab = page.getByRole('tab', { name: 'Appeals', exact: true });
    await reportsTab.waitFor();
    assert.equal(await reportsTab.getAttribute('tabindex'), '0');
    assert.equal(await appealsTab.getAttribute('tabindex'), '-1');
    await reportsTab.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await appealsTab.getAttribute('aria-selected'), 'true');
    assert.equal(await appealsTab.evaluate(element => element === document.activeElement), true);
    assert.equal(await reportsTab.getAttribute('tabindex'), '-1');
    assert.equal(await appealsTab.getAttribute('tabindex'), '0');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await reportsTab.evaluate(element => element === document.activeElement), true);
    assert.equal(await reportsTab.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await appealsTab.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('Home');
    assert.equal(await reportsTab.evaluate(element => element === document.activeElement), true);
    assert.equal(await page.getByRole('tabpanel').count(), 1, 'Only the selected tab panel is exposed.');
    assertClean(result);
  } finally { await context.close(); }
});

test('moderation: failed access, queue and appeals load only on explicit Retry and show truthful empty states', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { accessFailures: 1, queueFailures: 1, appealListFailures: 1, queue: [], appeals: [] });
    const { page } = result;
    const accessError = page.getByRole('alert').filter({ hasText: 'Moderator access is temporarily unavailable.' });
    await accessError.waitFor();
    assert.equal(result.calls.some(call => call.path === '/api/moderation/queue'), false);
    await accessError.getByRole('button', { name: 'Retry', exact: true }).click();
    const queueError = page.getByRole('alert').filter({ hasText: 'Reports are temporarily unavailable.' });
    await queueError.waitFor();
    assert.equal(await page.getByText('No reports are waiting.', { exact: true }).count(), 0);
    await queueError.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('No reports are waiting.', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Appeals', exact: true }).click();
    const appealError = page.getByRole('alert').filter({ hasText: 'Appeals are temporarily unavailable.' });
    await appealError.waitFor();
    assert.equal(await page.getByText('No appeals are waiting.', { exact: true }).count(), 0);
    await appealError.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('No appeals are waiting.', { exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

async function assertFits(page, label) {
  const bounds = await page.evaluate(() => {
    const main = document.querySelector('main');
    const dialog = document.querySelector('dialog[open]');
    const shortButtons = [...document.querySelectorAll('button')].filter(element => element.getClientRects().length > 0 && element.getBoundingClientRect().height < 44)
      .map(element => element.textContent.trim());
    return { viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
      main: main.scrollWidth, mainWidth: main.clientWidth, dialog: dialog?.scrollWidth ?? 0, dialogWidth: dialog?.clientWidth ?? 0,
      dialogLeft: dialog?.getBoundingClientRect().left ?? 0, dialogRight: dialog?.getBoundingClientRect().right ?? 0, shortButtons };
  });
  assert.ok(bounds.body <= bounds.viewport && bounds.document <= bounds.viewport, `${label}: horizontal page overflow ${JSON.stringify(bounds)}`);
  assert.ok(bounds.main <= bounds.mainWidth, `${label}: horizontal screen overflow ${JSON.stringify(bounds)}`);
  assert.ok(bounds.dialog <= bounds.dialogWidth && bounds.dialogLeft >= 0 && bounds.dialogRight <= bounds.viewport, `${label}: dialog overflow ${JSON.stringify(bounds)}`);
  assert.deepEqual(bounds.shortButtons, [], `${label}: buttons must be at least 44px high`);
}

for (const mode of ['moderation', 'safety']) test(`layout: ${mode} and its controls fit 320px with measured 200% body text`, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, { mode, longText: true });
    const { page } = result;
    const bodyText = mode === 'moderation' ? reportCard(page).getByText('3 reports', { exact: true }) : page.getByText('Reviewed: action taken', { exact: true });
    await bodyText.waitFor();
    await page.evaluate(() => document.fonts.ready);
    const normalSize = await bodyText.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    for (const width of [1440, 320, 390, 768]) { await page.setViewportSize({ width, height: 844 }); await assertFits(page, `${mode} at ${width}px`); }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
    assert.equal(await bodyText.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), normalSize * 2, 'Body-sized screen text must really double.');
    await assertFits(page, `${mode} at 320px and 200% text`);
    if (mode === 'moderation') {
      // Each decision's radio sits beside its word, not as a 46 px radio stacked above it by the shared label and input styles.
      const choices = await reportCard(page).getByRole('group', { name: 'Decision', exact: true }).locator('label').all();
      assert.equal(choices.length, 2);
      for (const choice of choices) {
        const placement = await choice.evaluate(element => {
          const radio = element.querySelector('input[type="radio"]').getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents([...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
          const words = range.getBoundingClientRect();
          return { radio: { left: radio.left, right: radio.right, top: radio.top, bottom: radio.bottom }, words: { left: words.left, top: words.top, bottom: words.bottom }, height: element.getBoundingClientRect().height };
        });
        const { radio, words } = placement;
        assert.ok(radio.right <= words.left && radio.top < words.bottom && radio.bottom > words.top && placement.height >= 44, `${await choice.innerText()}: ${JSON.stringify(placement)}`);
      }
    }
    await page.screenshot({ path: path.join(root, `.local/gaps/web-${mode}-320-large.png`), fullPage: true });
    if (mode === 'moderation') {
      await page.getByRole('tab', { name: 'Appeals', exact: true }).click();
      await appealCard(page).getByRole('button', { name: 'Restore content', exact: true }).waitFor();
      await assertFits(page, 'Appeals at 320px and 200% text');
    } else {
      await page.getByRole('button', { name: 'Appeal', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Appeal decision', exact: true });
      await dialog.getByRole('textbox').fill('LongNote'.repeat(100));
      assert.equal(await dialog.getByRole('button', { name: 'Send appeal', exact: true }).isEnabled(), true);
      assert.equal(await dialog.getByRole('textbox').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), normalSize * 2);
      await assertFits(page, 'Appeal dialog at 320px and 200% text');
      for (const [label, maximumLines] of [['Cancel', 1], ['Send appeal', 2]]) {
        const lines = await dialog.getByRole('button', { name: label, exact: true }).evaluate(element => {
          const node = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length;
        });
        assert.ok(lines <= maximumLines, `${label} must not wrap into columns of letters at 200% text.`);
      }
      await page.screenshot({ path: path.join(root, '.local/gaps/web-appeal-dialog-320-large.png') });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await dialog.count(), 0);
    }
    assertClean(result);
  } finally { await context.close(); }
});