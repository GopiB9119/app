import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
const evidence = path.join(root, '.local/t98');
const origin = 'http://127.0.0.1:3000';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const documentId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const chatId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const taskId = '7b1f0c55-5d0e-4a3a-9a52-0d3f3e7a1c01';
const instructionId = '463aa3d5-a47c-4560-8fe9-70da2f866a2f';
const postId = '463aa3d5-a47c-4560-8fe9-70da2f866a30';
const exportId = '0b6c1f9e-3f53-4c1a-9a43-000000000001';
const created = '2026-10-02T02:30:00Z';
const expires = '2026-10-03T02:30:00Z';
const now = '2026-10-02T12:00:00Z';
const mixed = '\u0c2e\u0c3e\u0c27\u0c35\u0c3f \u0939\u093f\u0928\u094d\u0926\u0940';
const personName = `Alex ${mixed}`;
const spaceName = `Garden ${mixed}`;
const documentName = `notes-${mixed}.md`;
const title = `Picnic ${mixed} {name}`;
const body = `My text ${mixed} <b>literal</b> {name}.`;
const medicineName = `Synthetic ${mixed}`;
const serverMessage = `Synthetic refusal ${mixed}. Keep the server text.`;
const modes = ['chat', 'care', 'documents', 'search', 'home', 'data'];
const paths = { chat: '/app/messages', care: '/app/care', documents: '/app/documents', search: '/app/search', home: '/app', data: '/app/settings/data' };
const headings = { chat: 'chat.messages', care: 'care.medicines', documents: 'documents.title', search: 'search.title', home: 'home.title', data: 'data.title' };
const androidNames = { chat: 'messages_title', care: 'care_title', documents: 'documents_title', search: 'search_title', home: 'home_title', data: 'account_data_title' };
const android = Object.fromEntries(['te', 'hi'].map(language => [language, readFileSync(path.join(root, `android/app/src/main/res/values-${language}/strings.xml`), 'utf8')]));
const { en, te, hi } = loadMessages().messages;
const texts = { en, te, hi };
const text = (language, id, values = {}) => texts[language][id].replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
let browser;
let javascript;
let css;

before(async () => {
  mkdirSync(evidence, { recursive: true });
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { MessagesScreen } from './src/features/messaging/messages-screen';
        import { CareScreen } from './src/features/care/care-screen';
        import { DocumentsScreen } from './src/features/files/documents-screen';
        import { SearchScreen } from './src/features/discovery/search-screen';
        import { HomeScreen } from './src/features/platform/home-screen';
        import { DataScreen } from './src/features/identity/data-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderScreensI18nFixture = () => {
          const { mode, language } = window.screensI18nFixture;
          const screens = { chat: <MessagesScreen initialSpaceId="" />, care: <CareScreen />,
            documents: <DocumentsScreen initialSpaceId="${spaceId}" initialDocumentId="" initialLine="" initialEnd="" />,
            search: <SearchScreen initialQuery="picnic" initialSpaceId="${spaceId}" />, home: <HomeScreen />, data: <DataScreen /> };
          root.render(<Providers language={language}>{screens[mode]}</Providers>);
        };
        window.unmountScreensI18nFixture = () => root.unmount();`,
      resolveDir: web, sourcefile: 'offline-i18n-screens.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(evidence, 'offline-i18n-screens.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-i18n-screens', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }', resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => window.screensI18nFixture.path; export const useRouter = () => ({ push() {}, replace() {}, refresh() {} }); export const useSearchParams = () => new URLSearchParams();', loader: 'js',
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

async function fixture(context, mode, language, options = {}) {
  const outbound = [];
  const errors = [];
  const calls = [];
  const unexpected = [];
  await context.route('**/*', route => {
    const request = route.request();
    if (request.resourceType() === 'document' && request.method() === 'GET' && request.url() === origin + paths[mode]) {
      return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Offline screen languages</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(request.url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordScreensI18nCall', call => { calls.push(call); });
  await page.exposeFunction('recordScreensI18nUnexpected', call => { unexpected.push(call); });
  await page.goto(origin + paths[mode]);
  await page.clock.setFixedTime(new Date(now));
  await page.addStyleTag({ content: css });
  await page.evaluate(({ mode, language, routePath, accountId, otherId, spaceId, documentId, chatId, taskId, instructionId, postId, exportId, created, expires, personName, spaceName, documentName, title, body, medicineName, serverMessage, options }) => {
    const space = { id: spaceId, name: spaceName, description: body, space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: created };
    const conversation = { id: chatId, space_id: spaceId, space_name: spaceName, kind: 'space', title: spaceName, participants: [], can_send: true,
      protection: 'server_encrypted', last_position: '1', read_position: '1', unread_count: 0, last_message_at: created, created_at: created };
    const message = { id: postId, conversation_id: chatId, position: '1', sender_account_id: otherId, sender_name: personName, mine: false,
      client_message_id: null, status: 'sent', body, created_at: created, deleted_at: null };
    const document = { id: documentId, space_id: spaceId, space_name: spaceName, status: 'active', name: documentName, media_type: 'text/markdown',
      size_bytes: new TextEncoder().encode(body).length, line_count: 1, sha256: 'a'.repeat(64), added_by_name: personName, added_at: created,
      deleted_at: null, can_delete: true, content: body };
    const medicine = { id: instructionId, medicine_name: medicineName, strength: '5 mg', form: 'tablet', dose: body, instructions: body,
      source: 'package_label', timezone: 'UTC', times: ['08:00'], start_date: '2026-10-02', end_date: null, status: 'active', version: 1,
      confirmed_by_account_id: accountId, confirmed_at: created, created_at: created, stopped_at: null, etag: '"instruction-1"' };
    const occurrence = { instruction_id: instructionId, local_date: '2026-10-02', local_time: '08:00', display_time: '08:00', timezone: 'UTC',
      scheduled_at: '2026-10-02T08:00:00Z', clock_change: 'none', report: null, can_report: true, etag: '"dose-1"' };
    const post = { id: postId, page_id: documentId, page_handle: 'garden', page_name: spaceName, title, body, status: 'published', like_count: 0, comment_count: 0,
      created_at: created, published_at: created, edited_at: null, liked: false, saved: false, pinned: false, can_manage: false, etag: null };
    const readyExport = { id: exportId, status: 'ready', reason: null, categories: ['profile', 'security', 'spaces', 'tasks', 'reminders'],
      created_at: created, completed_at: created, expires_at: expires, size_bytes: 512, requested_here: true };
    const state = window.screensI18nFixture = { mode, language, path: routePath, sequence: 0, liveOpened: 0, liveClosed: 0,
      spaces: options.noSpaces ? [] : [space], conversations: [conversation], messages: [message], documents: [document],
      medicines: [medicine], occurrence, feed: [post], exports: [readyExport], emptySearch: false, holdMe: options.holdMe ?? false,
      releaseMe: null, failReads: options.failReads ?? false, loseSend: false, loseAdd: false, ownedSpaces: true, deleted: false };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-screens-i18n', ...extra }));
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const refusal = (code = 'SYNTHETIC_REFUSAL', details = {}) => new Response(JSON.stringify({ error: { code, message: serverMessage, details }, request_id: 'offline-screens-i18n' }), { status: 409 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') {
        state.liveOpened++;
        return new Response(new ReadableStream({ start(controller) {
          const abort = () => { state.liveClosed++; try { controller.close(); } catch {} };
          if (config.signal?.aborted) abort();
          else config.signal?.addEventListener('abort', abort, { once: true });
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      const call = { path: url.pathname, query: url.search, method, body: config.body ? JSON.parse(config.body) : null, headers: Object.fromEntries(new Headers(config.headers)) };
      await window.recordScreensI18nCall(call);
      if (state.deleted) { await window.recordScreensI18nUnexpected(call); throw new Error('No reads after deletion.'); }
      if (url.pathname === '/api/me' && method === 'GET') {
        if (state.holdMe) await new Promise(resolve => { state.releaseMe = resolve; });
        return reply({ id: accountId, display_name: personName, email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      }
      if (url.pathname === '/api/notifications' && method === 'GET') return paged([], { unread_count: 0 });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged(state.spaces);
      if (url.pathname === `/api/spaces/${spaceId}/members` && method === 'GET') return reply([
        { account_id: accountId, display_name: personName, role: 'owner', joined_at: created, etag: '"member-1"' },
        { account_id: otherId, display_name: spaceName, role: 'member', joined_at: created, etag: '"member-2"' },
      ]);
      if (url.pathname === '/api/conversations' && method === 'GET') return paged(state.conversations, { unread_count: 0 });
      if (url.pathname === `/api/conversations/${chatId}` && method === 'GET') return reply(conversation);
      if (url.pathname === `/api/conversations/${chatId}/messages` && method === 'GET') return paged(state.messages);
      if (url.pathname === `/api/conversations/${chatId}/read` && method === 'POST') { conversation.read_position = call.body.through_position; return reply(conversation); }
      if (url.pathname === `/api/conversations/${chatId}/messages` && method === 'POST') {
        if (state.loseSend) { state.loseSend = false; throw new TypeError('Synthetic lost send.'); }
        const saved = { ...message, id: crypto.randomUUID(), position: '2', mine: true, sender_account_id: accountId, sender_name: personName,
          client_message_id: call.headers['idempotency-key'], body: call.body.body };
        state.messages.push(saved); conversation.last_position = '2'; return reply(saved);
      }
      if (url.pathname === '/api/conversations' && method === 'POST') return reply(conversation);
      if (url.pathname === '/api/care/day' && method === 'GET') {
        if (state.failReads) return refusal();
        const localDate = url.searchParams.get('date');
        return reply({ local_date: localDate, instructions: state.medicines, occurrences: localDate === '2026-10-02' ? [state.occurrence] : [], omitted: [] });
      }
      if (url.pathname === '/api/care/instructions' && method === 'GET') return reply(url.searchParams.get('status') === 'active' ? state.medicines : []);
      if (url.pathname === '/api/me/care-alerts' && method === 'GET') return reply([{ instruction_id: instructionId, enabled: false }]);
      if (url.pathname === `/api/care/instructions/${instructionId}/reports` && method === 'POST') {
        state.occurrence.report = { outcome: call.body.outcome, revision: 1, reported_at: created, updated_at: created };
        state.occurrence.etag = '"dose-2"'; return reply(state.occurrence);
      }
      if (url.pathname === `/api/spaces/${spaceId}/documents` && method === 'GET') {
        if (state.failReads) return refusal();
        return paged(state.documents);
      }
      if (url.pathname === `/api/spaces/${spaceId}/documents` && method === 'POST') {
        if (state.loseAdd) { state.loseAdd = false; throw new TypeError('Synthetic lost add.'); }
        const saved = { ...document, name: call.body.name, content: call.body.content }; state.documents = [saved]; return reply(saved);
      }
      if (url.pathname === `/api/documents/${documentId}` && method === 'GET') return reply(state.documents[0]);
      if (url.pathname === `/api/documents/${documentId}/delete` && method === 'POST') { state.documents = []; return reply({ id: documentId, space_id: spaceId, status: 'deleted', deleted_at: created }); }
      if (url.pathname === '/api/search' && method === 'GET') {
        if (state.failReads) return refusal();
        return reply({ query: url.searchParams.get('q'), space_id: url.searchParams.get('space_id'), limit: Number(url.searchParams.get('limit') ?? 20),
          documents: state.emptySearch ? [] : [{ document_id: documentId, space_id: spaceId, space_name: spaceName, name: documentName,
            media_type: 'text/markdown', start_line: 1, end_line: 1, excerpt: body, added_at: created }],
          tasks: state.emptySearch ? [] : [{ task_id: taskId, space_id: spaceId, space_name: spaceName, title, excerpt: body, excerpt_in: 'notes', status: 'open', due_date: '2026-10-10' }],
          events: [], more_documents: false, more_tasks: false, more_events: false });
      }
      if (url.pathname === '/api/invitations' && method === 'GET') return paged([]);
      if (url.pathname === '/api/reminder-requests' && method === 'GET') return paged([]);
      if (url.pathname === '/api/calendar' && method === 'GET') return paged([]);
      if (url.pathname === '/api/feed' && method === 'GET') return paged(state.feed);
      if (url.pathname === '/api/me/exports' && method === 'GET') return reply(state.exports);
      if (url.pathname === '/api/me/exports' && method === 'POST') return refusal();
      if (url.pathname === `/api/me/exports/${exportId}` && method === 'DELETE') { readyExport.status = 'cancelled'; return reply(readyExport); }
      if (url.pathname === `/api/me/exports/${exportId}/archive` && method === 'GET') return refusal();
      if (url.pathname === '/api/me/deletion' && method === 'POST') {
        if (state.ownedSpaces) return refusal('OWNED_SPACES_WITH_MEMBERS', { spaces: spaceName });
        state.deleted = true; return reply({ status: 'deletion_requested', purge_after: '2026-10-09T18:00:00Z' });
      }
      await window.recordScreensI18nUnexpected(call);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}${url.search}`);
    };
  }, { mode, language, routePath: paths[mode], accountId, otherId, spaceId, documentId, chatId, taskId, instructionId, postId, exportId, created, expires, personName, spaceName, documentName, title, body, medicineName, serverMessage, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderScreensI18nFixture());
  if (!options.holdMe) await page.getByRole('main').getByRole('heading', { name: text(language, headings[mode]), exact: true, level: 1 }).waitFor();
  await page.waitForFunction(expected => document.documentElement.lang === expected, language);
  return { page, mode, language, outbound, errors, calls, unexpected };
}

async function expectedDate(page, language, value, options, englishLocale) {
  return page.evaluate(({ language, value, options, englishLocale }) => new Intl.DateTimeFormat(language === 'en' ? englishLocale : language === 'te' ? 'te-IN' : 'hi-IN', options).format(new Date(value)), { language, value, options, englishLocale });
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, main section, main form, dialog[open], .app-header, .app-footer, .main-nav')]
      .filter(element => element.getClientRects().length > 0)
      .map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select, textarea')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 150)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay in the viewport.`);
}

async function doubleText(page) {
  await page.setViewportSize({ width: 320, height: 844 });
  const original = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize)), original * 2, 'Body text must genuinely double.');
}

async function assertClean(result) {
  const { page } = result;
  assert.ok(await page.evaluate(() => window.screensI18nFixture.liveOpened > 0), 'Signed-in screens must use the fixture live stream.');
  await page.evaluate(() => window.unmountScreensI18nFixture());
  await page.waitForFunction(() => window.screensI18nFixture.liveClosed === window.screensI18nFixture.liveOpened);
  assert.deepEqual(result.outbound, [], 'No real network request is allowed.');
  assert.deepEqual(result.errors, [], 'The actual screens must not raise page errors.');
  assert.deepEqual(result.unexpected, [], 'Every API call must have an explicit answer.');
  assert.equal(result.calls.some(call => call.path === '/api/live'), false, 'The live stream is not counted as an API call.');
}

async function checkScreen(result) {
  const { page, mode, language } = result;
  const value = (id, values) => text(language, `${mode}.${id}`, values);
  const main = page.getByRole('main');
  const independent = await page.evaluate(({ xml, name }) => new DOMParser().parseFromString(xml, 'application/xml').querySelector(`string[name="${name}"]`).textContent, { xml: android[language], name: androidNames[mode] });
  assert.equal(await main.locator('h1').textContent(), independent, 'The heading must independently match the Android draft, not just the same mutable dictionary.');
  if (mode === 'chat') {
    await main.getByRole('button', { name: value('refreshConversations'), exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: value('openSpaceChat'), exact: true }).count(), 1);
    await main.getByText(value('chooseConversation'), { exact: true }).waitFor();
    await main.getByRole('button', { name: new RegExp(`^${spaceName}`) }).click();
    await main.getByText(body, { exact: true }).waitFor();
    await main.getByText(personName, { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: value('send'), exact: true }).count(), 1);
    assert.equal(await main.locator('time').first().textContent(), await expectedDate(page, language, created, { dateStyle: 'medium', timeStyle: 'short' }));
    assert.equal(await main.locator('b').count(), 0);
  } else if (mode === 'care') {
    await main.getByText(value('notNoted'), { exact: true }).waitFor();
    await main.getByText(body, { exact: true }).waitFor();
    for (const id of ['dayPlan', 'myMedicines', 'outcome.taken', 'outcome.skipped']) assert.equal(await main.getByRole('button', { name: value(id), exact: true }).count(), 1);
    await main.getByRole('button', { name: value('myMedicines'), exact: true }).click();
    await main.getByText(body, { exact: true }).first().waitFor();
    const date = await expectedDate(page, language, created, { dateStyle: 'medium' });
    await main.getByText(value('sourceLine', { source: value('source.package_label'), date, stopped: '' }), { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: value('addMedicine'), exact: true }).count(), 1);
    assert.equal(await main.getByRole('checkbox', { name: 'Alert me in this app at these times', exact: true }).count(), 1, 'C10 dose-alert text stays English.');
  } else if (mode === 'documents') {
    await main.getByRole('button', { name: documentName, exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: value('add'), exact: true }).count(), 1);
    await main.getByText(value('addedBy', { name: personName, date: await expectedDate(page, language, created, { dateStyle: 'medium' }) }), { exact: true }).waitFor();
    await main.getByRole('button', { name: documentName, exact: true }).click();
    await main.getByText(body, { exact: true }).waitFor();
    assert.equal(await main.getByRole('button', { name: value('delete'), exact: true }).count(), 1);
    assert.equal(await main.locator('b').count(), 0);
  } else if (mode === 'search') {
    await main.getByRole('link', { name: documentName, exact: true }).waitFor();
    await main.getByRole('link', { name: title, exact: true }).waitFor();
    await main.getByText(body, { exact: true }).first().waitFor();
    assert.equal(await main.getByRole('button', { name: value('title'), exact: true }).count(), 1);
    await main.getByText(value('none'), { exact: true }).waitFor();
    const date = await expectedDate(page, language, '2026-10-10T00:00:00Z', { dateStyle: 'medium', timeZone: 'UTC' });
    const task = main.getByRole('listitem').filter({ has: page.getByRole('link', { name: title, exact: true }) });
    assert.equal(await task.locator('p').first().textContent(), `${value('inSpace', { space: spaceName })} \u00b7 ${value('task.open')}${value('due', { date })}`);
    assert.equal(await main.locator('b').count(), 0);
  } else if (mode === 'home') {
    for (const id of ['calendar', 'medicines', 'viewCalendar', 'viewSpaces', 'viewPosts']) assert.equal(await main.getByRole('link', { name: value(id), exact: true }).count(), 1);
    await main.getByText(value('attentionEmpty'), { exact: true }).waitFor();
    await main.getByText(value('todayEmpty'), { exact: true }).waitFor();
    await main.getByRole('link', { name: value('readItem', { title }), exact: true }).waitFor();
    const row = main.getByRole('region', { name: value('pages'), exact: true }).getByRole('listitem').first();
    const date = await expectedDate(page, language, created, { timeZone: 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, 'en-GB');
    assert.equal(await row.locator('span').first().evaluate(element => element.childNodes[0].textContent), title);
    assert.ok((await row.textContent()).includes(`${spaceName} \u00b7 ${date}`));
    assert.equal(await main.getByRole('link', { name: value('tasksIn', { space: spaceName }), exact: true }).getAttribute('href'), `/app/tasks?space_id=${spaceId}`);
  } else {
    for (const id of ['prepare', 'delete']) assert.equal(await main.getByRole('button', { name: value(id), exact: true }).count(), 1);
    const options = { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' };
    const requested = await expectedDate(page, language, created, options, 'en');
    const expiry = await expectedDate(page, language, expires, options, 'en');
    await main.getByText(value('status.readyUntil', { date: expiry }), { exact: true }).waitFor();
    assert.equal(await main.locator('time').textContent(), value('requested', { date: requested }));
    assert.equal(await main.getByRole('button', { name: value('downloadRequested', { date: requested }), exact: true }).count(), 1);
    await main.getByRole('button', { name: value('delete'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: value('confirmTitle'), exact: true });
    await dialog.getByLabel(value('password'), { exact: true }).fill('Synthetic-password-42!');
    await dialog.getByRole('button', { name: value('delete'), exact: true }).click();
    await dialog.getByRole('listitem').getByText(spaceName, { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel(value('password'), { exact: true }).inputValue(), '');
    await dialog.getByRole('button', { name: value('keepAccount'), exact: true }).click();
  }
}

async function checkLargeText(result) {
  const { page, mode, language } = result;
  const value = (id, values) => text(language, `${mode}.${id}`, values);
  await page.evaluate(() => document.fonts.ready);
  await doubleText(page);
  await assertFits(page, `${mode}: Telugu 320 px / 200% text`);
  if (mode === 'chat') {
    await page.getByRole('button', { name: value('back'), exact: true }).click();
    await assertFits(page, 'chat list: Telugu 320 px / 200% text');
  } else if (mode === 'care') {
    await page.getByRole('button', { name: value('stopTracking'), exact: true }).click();
    await assertFits(page, 'care stop confirmation: Telugu 320 px / 200% text');
    await page.getByRole('button', { name: value('keep'), exact: true }).click();
    await page.getByRole('button', { name: value('addMedicine'), exact: true }).click();
    await assertFits(page, 'care editor: Telugu 320 px / 200% text');
  } else if (mode === 'documents') {
    await page.getByRole('button', { name: value('delete'), exact: true }).click();
    await assertFits(page, 'document delete dialog: Telugu 320 px / 200% text');
    await page.getByRole('dialog').getByRole('button', { name: value('cancel'), exact: true }).click();
    await page.getByRole('button', { name: value('back'), exact: true }).click();
    await assertFits(page, 'documents list: Telugu 320 px / 200% text');
  } else if (mode === 'data') {
    await page.getByRole('main').getByRole('button', { name: value('delete'), exact: true }).click();
    await assertFits(page, 'account deletion dialog: Telugu 320 px / 200% text');
    await page.getByRole('dialog').getByRole('button', { name: value('keepAccount'), exact: true }).click();
  }
  await page.screenshot({ path: path.join(evidence, `screens-${mode}-te-320-200.png`), fullPage: true });
}

for (const language of ['te', 'hi']) {
  for (const mode of modes) {
    test(`${language}: ${mode} translates fixed text, keeps mixed scripts and localizes dates`, async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
      try {
        const result = await fixture(context, mode, language);
        await checkScreen(result);
        if (language === 'te') await checkLargeText(result);
        await assertClean(result);
      } finally { await context.close(); }
    });
  }
}

test('Telugu care validation and reported outcomes keep the API values and instruction text', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, 'care', 'te');
    const { page } = result;
    await page.getByRole('button', { name: te['care.outcome.taken'], exact: true }).click();
    await page.getByText(text('te', 'care.noted', { outcome: te['care.outcome.taken'] }), { exact: true }).waitFor();
    assert.deepEqual(result.calls.find(call => call.path.endsWith('/reports')).body, { local_date: '2026-10-02', local_time: '08:00', outcome: 'taken' });
    await page.getByRole('button', { name: te['care.myMedicines'], exact: true }).click();
    await page.getByRole('button', { name: te['care.addMedicine'], exact: true }).click();
    const form = page.getByRole('form', { name: te['care.addTitle'], exact: true });
    await form.getByRole('button', { name: te['care.saveMedicine'], exact: true }).click();
    await form.getByText(te['care.problem.name'], { exact: true }).waitFor();
    await form.getByLabel(te['care.name'], { exact: true }).fill(medicineName);
    await form.getByLabel(te['care.dose'], { exact: true }).fill(body);
    await form.getByRole('combobox', { name: te['care.source'], exact: true }).selectOption('package_label');
    await form.getByLabel(text('te', 'care.time', { number: 1 }), { exact: true }).fill('08:00');
    await form.getByRole('button', { name: te['care.saveMedicine'], exact: true }).click();
    await form.getByText(te['care.problem.confirm'], { exact: true }).waitFor();
    assert.equal(await form.getByLabel(te['care.name'], { exact: true }).inputValue(), medicineName);
    assert.equal(await form.getByLabel(te['care.dose'], { exact: true }).inputValue(), body);
    assert.equal(result.calls.filter(call => call.path === '/api/care/instructions' && call.method === 'POST').length, 0);
    await page.locator('.language-picker select').selectOption('hi');
    await page.getByRole('form', { name: hi['care.addTitle'], exact: true }).getByText(hi['care.problem.confirm'], { exact: true }).waitFor();
    await assertClean(result);
  } finally { await context.close(); }
});

test('Telugu documents translate validation, deletion notices and linked empty states', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, 'documents', 'te');
    const { page } = result;
    await page.getByLabel(te['documents.file'], { exact: true }).setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
    await page.getByText(te['documents.problem.type'], { exact: true }).waitFor();
    assert.equal(result.calls.filter(call => call.method !== 'GET').length, 0);
    await page.getByRole('button', { name: documentName, exact: true }).click();
    await page.getByRole('button', { name: te['documents.delete'], exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(text('te', 'documents.deleteWarning', { name: documentName, person: personName, space: spaceName }), { exact: true }).waitFor();
    await dialog.getByRole('button', { name: te['documents.delete'], exact: true }).click();
    await page.getByText(text('te', 'documents.deleted', { name: documentName }), { exact: true }).waitFor();
    await page.getByText(te['documents.empty'], { exact: true }).waitFor();
    await page.locator('.language-picker select').selectOption('hi');
    await page.getByText(text('hi', 'documents.deleted', { name: documentName }), { exact: true }).waitFor();
    await assertClean(result);
  } finally { await context.close(); }
  const emptyContext = await browser.newContext();
  try {
    const result = await fixture(emptyContext, 'documents', 'te', { noSpaces: true });
    const link = result.page.getByRole('link', { name: te['documents.goToSpaces'], exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), '/app/spaces');
    assert.equal(await link.locator('..').textContent(), text('te', 'documents.noSpaces', { link: te['documents.goToSpaces'] }));
    await assertClean(result);
  } finally { await emptyContext.close(); }
});

test('Telugu search translates validation and empty results without translating the query', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, 'search', 'te');
    const { page } = result;
    await page.getByText(te['search.none'], { exact: true }).waitFor();
    await page.getByLabel(te['search.query'], { exact: true }).fill(' ');
    await page.getByRole('button', { name: te['search.title'], exact: true }).click();
    await page.getByText(te['search.problem.empty'], { exact: true }).waitFor();
    await page.evaluate(() => { window.screensI18nFixture.emptySearch = true; });
    await page.getByLabel(te['search.query'], { exact: true }).fill(mixed);
    await page.getByRole('button', { name: te['search.title'], exact: true }).click();
    await page.getByText(te['search.empty'], { exact: true }).waitFor();
    const sent = result.calls.filter(call => call.path === '/api/search').at(-1);
    assert.equal(new URLSearchParams(sent.query).get('q'), mixed);
    assert.equal(new URLSearchParams(sent.query).get('space_id'), spaceId);
    assert.equal(await page.getByLabel(te['search.query'], { exact: true }).inputValue(), mixed);
    await assertClean(result);
  } finally { await context.close(); }
});

test('Telugu data cancellation and deletion dates preserve passwords and stop all reads on acceptance', async () => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' });
  try {
    const result = await fixture(context, 'data', 'te');
    const { page } = result;
    const requested = await expectedDate(page, 'te', created, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }, 'en');
    await page.getByRole('button', { name: text('te', 'data.cancelRequested', { date: requested }), exact: true }).click();
    await page.getByText(te['data.status.cancelled'], { exact: true }).waitFor();
    const cancel = result.calls.find(call => call.method === 'DELETE');
    assert.equal(cancel.path, `/api/me/exports/${exportId}`);
    assert.deepEqual(cancel.body, {});
    await page.getByRole('main').getByRole('button', { name: te['data.delete'], exact: true }).click();
    await page.evaluate(() => { window.screensI18nFixture.ownedSpaces = false; });
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(te['data.password'], { exact: true }).fill('Synthetic-password-42!');
    const purge = await expectedDate(page, 'te', '2026-10-09T18:00:00Z', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }, 'en');
    await dialog.getByRole('button', { name: te['data.delete'], exact: true }).click();
    await page.getByText(text('te', 'data.deletionNotice', { date: purge }), { exact: true }).waitFor();
    assert.equal(await page.getByLabel(te['data.password'], { exact: true }).count(), 0);
    const sent = result.calls.find(call => call.path === '/api/me/deletion');
    assert.deepEqual(sent.body, { password: 'Synthetic-password-42!' });
    assert.equal(sent.headers['x-account-id'], accountId);
    await doubleText(page);
    await assertFits(page, 'accepted deletion: Telugu 320 px / 200% text');
    await assertClean(result);
  } finally { await context.close(); }
});

test('Server errors keep their mixed-script text on translated screens', async () => {
  for (const mode of ['care', 'documents', 'search', 'data']) {
    const context = await browser.newContext();
    try {
      const result = await fixture(context, mode, 'te', { failReads: true });
      if (mode === 'data') await result.page.getByRole('button', { name: te['data.prepare'], exact: true }).click();
      await result.page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
      assert.ok((await result.page.getByRole('alert').allTextContents()).some(value => value.includes(serverMessage)));
      await assertClean(result);
    } finally { await context.close(); }
  }
});