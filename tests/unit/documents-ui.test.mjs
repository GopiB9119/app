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
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const documentId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const taskId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const eventId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const spaceName = 'Morgan family';
const documentName = 'picnic.md';
const fileLabel = 'Text file (.txt, .md or .csv, up to 512 KB)';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { DocumentsScreen } from './src/features/files/documents-screen';
        import { SearchScreen } from './src/features/discovery/search-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderDocumentsFixture = address => {
          const url = new URL(address, 'https://offline.invalid');
          const query = url.searchParams;
          root.render(<Providers>{url.pathname === '/app/search'
            ? <SearchScreen initialQuery={query.get('q') ?? ''} initialSpaceId={query.get('space_id') ?? ''} />
            : <DocumentsScreen initialSpaceId={query.get('space_id') ?? ''} initialDocumentId={query.get('id') ?? ''}
                initialLine={query.get('line') ?? ''} initialEnd={query.get('end') ?? ''} />
          }</Providers>);
        };`,
      resolveDir: web, sourcefile: 'offline-documents.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-documents.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-documents-dependencies', setup(builder) {
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
  const address = options.address ?? `/app/documents?space_id=${spaceId}`;
  const url = new URL(address, 'https://offline.invalid');
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline documents and search</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, documentId, taskId, eventId, spaceName, documentName, address, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const addedAt = '2026-10-01T10:00:00Z';
    const content = options.content ?? '# Picnic notes\nMeeting place\nPicnic blankets by the gate.\nBring fruit for the picnic.\nLast line.';
    function makeDocument(fields = {}) {
      const text = fields.content ?? content;
      const lines = text.split('\n');
      if (lines.length > 1 && lines.at(-1) === '') lines.pop();
      return {
        id: documentId, space_id: spaceId, space_name: spaceName, status: 'active', name: options.name ?? documentName,
        media_type: 'text/markdown', size_bytes: new TextEncoder().encode(text).length, line_count: lines.length,
        sha256: 'a'.repeat(64), added_by_name: 'Alex Morgan', added_at: addedAt, deleted_at: null, can_delete: true,
        ...fields, content: text,
      };
    }
    const state = window.documentsFixture = {
      calls: [], documents: options.seed ? [makeDocument()] : [], address,
      failAdd: !!options.failAdd, emptySearch: !!options.emptySearch, unexpected: [],
      documentTotal: options.documentTotal ?? null, checklistTask: !!options.checklistTask, searchGate: null, openGate: null, live: null, spaces: [],
    };
    const receipts = new Map();
    window.history.pushState = (_data, _unused, next) => { state.address = String(next); };
    window.history.replaceState = (_data, _unused, next) => { state.address = String(next); };
    const space = {
      id: spaceId, name: spaceName, description: '', space_type: 'family', visibility: 'private', status: 'active',
      role: 'owner', version: '1', created_at: addedAt, ...options.spaceFields,
    };
    state.spaces = [space];
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-documents', ...extra }), { status: 200 });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') {
        // The live connection every signed-in page opens (DEC-019) stays open until a test sends it a frame, and closes when the page aborts it.
        return new Response(new ReadableStream({ start(controller) {
          const encoder = new TextEncoder();
          state.live = frame => controller.enqueue(encoder.encode(frame));
          config.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} });
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: url.search, method, body, text: config.body ?? null, headers });
      if (url.pathname === '/api/me' && method === 'GET') return reply({
        id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1,
      });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged(state.spaces);
      // Every signed-in header shows the inbox's unread count on its bell (DEC-014, T38).
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === `/api/spaces/${spaceId}/documents` && method === 'GET') return paged(state.documents);
      if (url.pathname === `/api/spaces/${spaceId}/documents` && method === 'POST') {
        const key = headers['idempotency-key'];
        if (receipts.has(key)) return reply(receipts.get(key));
        const item = makeDocument({ name: body.name, content: body.content });
        state.documents.push(item);
        receipts.set(key, item);
        if (state.failAdd) { state.failAdd = false; throw new TypeError('Synthetic lost add response'); }
        return reply(item);
      }
      if (url.pathname === `/api/documents/${documentId}` && method === 'GET') return reply(state.documents[0]);
      if (url.pathname === `/api/documents/${documentId}/delete` && method === 'POST') {
        state.documents = [];
        return reply({ id: documentId, space_id: spaceId, status: 'deleted', deleted_at: '2026-10-01T11:00:00Z' });
      }
      if (url.pathname === '/api/search' && method === 'GET') {
        if (state.searchGate) await state.searchGate;
        const empty = state.emptySearch;
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const total = state.documentTotal;
        const listed = state.documents.map(item => ({
          document_id: item.id, space_id: spaceId, space_name: spaceName, name: item.name, media_type: item.media_type,
          start_line: 3, end_line: 4, excerpt: 'Picnic <img src="https://external.invalid/search.png"> blankets by the gate.', added_at: addedAt,
        }));
        // With a total, the fixture holds that many documents and answers like the service: the first `limit` of them and whether more exist.
        const counted = Array.from({ length: Math.min(limit, total ?? 0) }, (_, index) => ({
          document_id: `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`, space_id: spaceId, space_name: spaceName,
          name: `picnic-${index + 1}.md`, media_type: 'text/markdown', start_line: 1, end_line: 1, excerpt: `Picnic note ${index + 1}.`, added_at: addedAt,
        }));
        return reply({
          query: url.searchParams.get('q'), space_id: url.searchParams.get('space_id'), limit,
          documents: empty ? [] : total === null ? listed : counted,
          tasks: empty ? [] : [{
            task_id: taskId, space_id: spaceId, space_name: spaceName, title: 'Picnic shopping',
            excerpt: state.checklistTask ? 'Buy picnic blankets' : 'Picnic food to bring.', excerpt_in: state.checklistTask ? 'checklist' : 'notes',
            status: 'open', due_date: '2026-10-10',
          }],
          events: empty ? [] : [{
            event_id: eventId, space_id: spaceId, space_name: spaceName, title: 'Picnic in the park',
            excerpt: 'Picnic at noon.', status: 'scheduled', starts_at: '2026-10-10T12:00:00Z', timezone: 'UTC', local_start: '2026-10-10T12:00',
          }],
          more_documents: !empty && total !== null && total > limit, more_tasks: false, more_events: false,
        });
      }
      state.unexpected.push(`${method} ${url.pathname}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, spaceId, documentId, taskId, eventId, spaceName, documentName, address, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => window.renderDocumentsFixture(value), address);
  if (url.pathname === '/app/search') {
    await page.getByRole('heading', { name: 'Search', exact: true, level: 1 }).waitFor();
    await page.getByLabel('Space', { exact: true }).locator('option').filter({ hasText: spaceName }).waitFor({ state: 'attached' });
    if (url.searchParams.get('q')) await page.getByRole('heading', { name: /^Results for /, level: 2 }).waitFor();
  } else if (url.searchParams.get('id')) {
    await page.getByRole('heading', { name: options.name ?? documentName, exact: true, level: 2 }).waitFor();
  } else {
    await page.getByRole('heading', { name: `Add a document to ${spaceName}`, exact: true }).waitFor();
    if (options.seed) await page.getByRole('button', { name: options.name ?? documentName, exact: true }).waitFor();
    else await page.getByText('No documents yet. Add a .txt, .md or .csv file.', { exact: true }).waitFor();
  }
  return { page, outbound, errors };
}

test('offline Documents shows the Space header with Documents marked and its member facts', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, outbound, errors } = await fixture(context, { spaceFields: { member_count: 2, member_preview: ['Sam Lee'], agent_enabled: false } });
    const header = page.getByRole('region', { name: `${spaceName} Space`, exact: true });
    await header.getByText('2 members: Sam Lee', { exact: true }).waitFor();
    await header.getByText('Agent off', { exact: true }).waitFor();
    assert.equal(await header.getByRole('link', { name: 'Ask Agent', exact: true }).count(), 0);
    const current = header.getByRole('navigation').locator('a[aria-current="page"]');
    assert.equal(await current.getAttribute('aria-label'), `Documents for ${spaceName}`);
    assert.equal(await current.getAttribute('href'), `/app/documents?space_id=${spaceId}`);
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.every(call => call.method === 'GET')), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline document add retries the same key and bytes after a lost response', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { failAdd: true });
    const content = '# Picnic\nBring a blanket.\n';
    await page.getByLabel(fileLabel, { exact: true }).setInputFiles({ name: documentName, mimeType: 'text/markdown', buffer: Buffer.from(content) });
    await page.getByRole('button', { name: 'Add document', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await retry.waitFor();
    assert.equal(await retry.innerText(), 'Retry');
    assert.equal(await page.getByLabel(fileLabel, { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel('Space', { exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method === 'POST').length), 1);
    await retry.click();
    await page.getByText(`Added \u201c${documentName}\u201d to ${spaceName}.`, { exact: true }).waitFor();
    await page.getByRole('button', { name: documentName, exact: true }).waitFor();
    const writes = await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method === 'POST'));
    assert.equal(writes.length, 2);
    assert.equal(writes[0].route, `/api/spaces/${spaceId}/documents`);
    assert.equal(writes[1].route, writes[0].route);
    assert.match(writes[0].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
    assert.equal(writes[0].headers['idempotency-key'], writes[1].headers['idempotency-key']);
    assert.equal(writes[0].text, writes[1].text);
    assert.deepEqual(writes[0].body, { name: documentName, content });
    assert.deepEqual(writes[0].body, writes[1].body);
    assert.equal(await page.evaluate(() => window.documentsFixture.documents.length), 1);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline document picker explains the missing scanner for PDF and sends nothing', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByLabel(fileLabel, { exact: true }).setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n') });
    await page.getByRole('alert').filter({ hasText: 'Other file types need a virus scanner, which is not available yet.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add document', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline document picker refuses files larger than 524288 bytes without sending', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByLabel(fileLabel, { exact: true }).setInputFiles({ name: 'large.md', mimeType: 'text/markdown', buffer: Buffer.alloc(524289, 'a') });
    await page.getByRole('alert').filter({ hasText: 'A document can be at most 512 KB.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add document', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline document picker refuses invalid UTF-8 before sending', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context);
    await page.getByLabel(fileLabel, { exact: true }).setInputFiles({ name: 'invalid.md', mimeType: 'text/markdown', buffer: Buffer.from([0xff, 0xfe]) });
    await page.getByRole('alert').filter({ hasText: 'This file is not UTF-8 text.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add document', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method !== 'GET').length), 0);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline document reader marks cited lines, keeps HTML as text and names the deletion', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const literal = '<img src="https://external.invalid/document.png" onerror="window.documentTextRan = true">';
    const content = `# Picnic\nMeeting place\nPicnic blankets by the gate.\nBring fruit for the picnic.\n${literal}`;
    const { page, outbound, errors } = await fixture(context, {
      seed: true, content, address: `/app/documents?space_id=${spaceId}&id=${documentId}&line=3&end=4`,
    });
    await page.getByText('Lines 3 to 4 are marked below.', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('li[aria-current="location"]').evaluateAll(lines => lines.map(line => line.id)), ['L3', 'L4']);
    assert.equal(await page.locator('#L3').innerText(), 'Picnic blankets by the gate.');
    assert.equal(await page.locator('#L4').innerText(), 'Bring fruit for the picnic.');
    assert.equal(await page.locator('#L5').textContent(), literal);
    assert.equal(await page.locator('main img').count(), 0);
    assert.equal(await page.evaluate(() => window.documentTextRan), undefined);
    await page.getByRole('button', { name: 'Delete document', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete document?', exact: true });
    await dialog.getByText(`Delete \u201c${documentName}\u201d, added by Alex Morgan, from ${spaceName}? Its text is removed for everyone and cannot be recovered.`, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method === 'POST').length), 0);
    await dialog.getByRole('button', { name: 'Delete document', exact: true }).click();
    await page.getByText(`Deleted \u201c${documentName}\u201d.`, { exact: true }).waitFor();
    await page.getByText('No documents yet. Add a .txt, .md or .csv file.', { exact: true }).waitFor();
    const writes = await page.evaluate(() => window.documentsFixture.calls.filter(call => call.method === 'POST'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].route, `/api/documents/${documentId}/delete`);
    assert.deepEqual(writes[0].body, {});
    assert.equal(await page.evaluate(() => window.documentsFixture.address), `/app/documents?space_id=${spaceId}`);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline Space search groups links and plain-text highlights and explains empty results', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, address: `/app/search?q=picnic&space_id=${spaceId}` });
    for (const title of ['Documents (1)', 'Tasks (1)', 'Events (1)']) {
      await page.getByRole('heading', { name: title, exact: true, level: 3 }).waitFor();
    }
    const documents = page.getByRole('region', { name: 'Documents (1)', exact: true });
    const tasks = page.getByRole('region', { name: 'Tasks (1)', exact: true });
    const events = page.getByRole('region', { name: 'Events (1)', exact: true });
    assert.equal(await documents.getByRole('link', { name: documentName, exact: true }).getAttribute('href'), `/app/documents?space_id=${spaceId}&id=${documentId}&line=3&end=4`);
    assert.equal(await tasks.getByRole('link', { name: 'Picnic shopping', exact: true }).getAttribute('href'), `/app/tasks?space_id=${spaceId}&task_id=${taskId}`);
    assert.equal(await events.getByRole('link', { name: 'Picnic in the park', exact: true }).getAttribute('href'), `/app/events?space_id=${spaceId}&event_id=${eventId}`);
    // Titles and names are marked as well as the excerpts (DEC-051).
    assert.deepEqual(await page.locator('main mark').allTextContents(), ['picnic', 'Picnic', 'Picnic', 'Picnic', 'Picnic', 'Picnic']);
    assert.match(await documents.innerText(), /<img src="https:\/\/external\.invalid\/search\.png">/);
    assert.equal(await page.locator('main img').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Search', exact: true }).getAttribute('href'), '/app/search');
    await page.evaluate(() => { window.documentsFixture.emptySearch = true; });
    await page.getByLabel('Search your Spaces', { exact: true }).fill('nothing');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText('Nothing found in your Spaces.', { exact: true }).waitFor();
    assert.equal(await documents.count(), 0);
    const searches = await page.evaluate(() => window.documentsFixture.calls.filter(call => call.route === '/api/search'));
    const query = new URLSearchParams(searches.at(-1).query);
    assert.equal(query.get('q'), 'nothing');
    assert.equal(query.get('space_id'), spaceId);
    assert.equal(await page.evaluate(() => window.documentsFixture.address), `/app/search?q=nothing&space_id=${spaceId}`);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

const strangerSpaceId = '7c1a4b9e-2d44-4f0a-9b55-0e5e1a3d9f11';
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const searchCalls = page => page.evaluate(() => window.documentsFixture.calls.filter(call => call.route === '/api/search'));
const waitForSearches = (page, count) => page.waitForFunction(wanted => window.documentsFixture.calls.filter(call => call.route === '/api/search').length >= wanted, count);
async function sendLive(page, text) {
  await page.waitForFunction(() => window.documentsFixture.live !== null);
  await page.evaluate(value => window.documentsFixture.live(value), text);
}

test('offline search keeps its results and your place while live hints refresh it, and says when something changed', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, address: `/app/search?q=picnic&space_id=${spaceId}` });
    const field = page.getByLabel('Search your Spaces', { exact: true });
    const documents = page.getByRole('region', { name: 'Documents (1)', exact: true });
    await documents.getByRole('link', { name: documentName, exact: true }).waitFor();
    await field.focus();
    assert.equal((await searchCalls(page)).length, 1);
    const placeIsKept = () => page.evaluate(() => document.activeElement?.id.endsWith('-q') === true);

    // A reconnect cannot tell what was missed, so the open search is read once more; nothing changed, so nothing is announced.
    await sendLive(page, frame('ready', { heartbeat_seconds: 20, max_seconds: 600 }));
    await waitForSearches(page, 2);
    await page.waitForFunction(() => !document.body.innerText.includes('Updating results'));
    assert.equal(await page.getByText('Results updated.', { exact: true }).count(), 0);
    assert.equal(await placeIsKept(), true);

    // A change in this Space: the results stay on screen while they are read again, and focus stays where it was.
    await page.evaluate(() => {
      window.documentsFixture.searchGate = new Promise(resolve => { window.documentsFixture.openGate = resolve; });
      window.documentsFixture.documents[0].name = 'picnic-renamed.md';
    });
    await sendLive(page, frame('change', { kind: 'search', space_id: spaceId, reason: 'document' }));
    await waitForSearches(page, 3);
    await page.getByText('Updating results', { exact: true }).waitFor();
    await documents.getByRole('link', { name: documentName, exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: /^Results for /, level: 2 }).count(), 1);
    assert.equal(await placeIsKept(), true);
    await page.evaluate(() => window.documentsFixture.openGate());
    await documents.getByRole('link', { name: 'picnic-renamed.md', exact: true }).waitFor();
    await page.locator('[role="status"]').filter({ hasText: 'Results updated.' }).waitFor();
    assert.equal(await placeIsKept(), true);
    assert.equal(await documents.getByRole('link', { name: documentName, exact: true }).count(), 0);

    // Other Spaces and hints this screen does not know change nothing; a burst of hints is read once.
    const settled = (await searchCalls(page)).length;
    await sendLive(page, frame('change', { kind: 'search', space_id: strangerSpaceId, reason: 'task' }));
    await sendLive(page, frame('change', { kind: 'search', space_id: spaceId, reason: 'something-else' }));
    await sendLive(page, frame('change', { kind: 'conversation', conversation_id: strangerSpaceId, space_id: spaceId, reason: 'message' }));
    await page.waitForTimeout(900);
    assert.equal((await searchCalls(page)).length, settled);
    for (const reason of ['document', 'task', 'event']) await sendLive(page, frame('change', { kind: 'search', space_id: spaceId, reason }));
    await waitForSearches(page, settled + 1);
    await page.waitForTimeout(900);
    assert.equal((await searchCalls(page)).length, settled + 1);
    // The hints carried no words of the search, and the reads kept to the open search.
    for (const call of await searchCalls(page)) {
      const query = new URLSearchParams(call.query);
      assert.equal(query.get('q'), 'picnic');
      assert.equal(query.get('space_id'), spaceId);
      assert.equal(query.has('limit'), false);
    }
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline search shows more of one kind at a time up to 100 and says when that is all it shows', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { documentTotal: 150, address: `/app/search?q=picnic&space_id=${spaceId}` });
    await page.getByRole('heading', { name: 'Documents (20+)', exact: true, level: 3 }).waitFor();
    const more = page.getByRole('button', { name: 'Show more documents', exact: true });
    assert.equal(await page.getByRole('region', { name: 'Documents (20+)', exact: true }).getByRole('listitem').count(), 20);
    assert.equal(await page.getByRole('button', { name: /^Show more (tasks|events)$/ }).count(), 0);

    // The first twenty stay on screen while the next twenty are read, and the person is told.
    await page.evaluate(() => { window.documentsFixture.searchGate = new Promise(resolve => { window.documentsFixture.openGate = resolve; }); });
    await more.click();
    await page.getByText('Loading more results', { exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Documents (20+)', exact: true }).getByRole('listitem').count(), 20);
    assert.equal(await more.isDisabled(), true);
    await page.evaluate(() => window.documentsFixture.openGate());
    await page.getByRole('heading', { name: 'Documents (40+)', exact: true, level: 3 }).waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === 'Show more documents');
    for (const shown of [60, 80, 100]) {
      await more.click();
      await page.getByRole('heading', { name: `Documents (${shown}+)`, exact: true, level: 3 }).waitFor();
    }
    assert.deepEqual((await searchCalls(page)).map(call => new URLSearchParams(call.query).get('limit')), [null, '40', '60', '80', '100']);
    // At the most it shows, the button gives way to a line saying so, and focus moves to the group.
    await page.getByText('Showing the first 100. Add words to narrow the results.', { exact: true }).waitFor();
    assert.equal(await more.count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Documents (100+)', exact: true }).getByRole('listitem').count(), 100);
    await page.waitForFunction(() => document.activeElement?.tagName === 'H3' && document.activeElement.textContent === 'Documents (100+)');
    // Searching again starts from the first page.
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('heading', { name: 'Documents (20+)', exact: true, level: 3 }).waitFor();
    assert.equal(new URLSearchParams((await searchCalls(page)).at(-1).query).has('limit'), false);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline search drops a Space the person lost, says so and searches the rest', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, address: `/app/search?q=picnic&space_id=${spaceId}` });
    await page.getByRole('region', { name: 'Documents (1)', exact: true }).waitFor();
    await page.evaluate(other => {
      window.documentsFixture.spaces = [{ ...window.documentsFixture.spaces[0], id: other, name: 'Neighbours' }];
    }, strangerSpaceId);
    await sendLive(page, frame('change', { kind: 'search', space_id: spaceId, reason: 'access' }));
    await page.getByText('That Space is no longer available to you. Showing all your Spaces.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Space', { exact: true }).inputValue(), '');
    const last = (await searchCalls(page)).at(-1);
    assert.equal(new URLSearchParams(last.query).get('q'), 'picnic');
    assert.equal(new URLSearchParams(last.query).has('space_id'), false);
    assert.equal(await page.evaluate(() => window.documentsFixture.address), '/app/search?q=picnic');
    // Nothing was asked of the Space that is gone.
    assert.equal((await searchCalls(page)).filter(call => new URLSearchParams(call.query).get('space_id') === spaceId).length, 1);
    assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline search says when a task excerpt comes from the checklist', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { seed: true, checklistTask: true, address: `/app/search?q=picnic&space_id=${spaceId}` });
    const tasks = page.getByRole('region', { name: 'Tasks (1)', exact: true });
    await tasks.waitFor();
    assert.equal(await tasks.locator('p', { hasText: 'In the checklist:' }).innerText(), 'In the checklist: Buy picnic blankets');
    assert.deepEqual(await tasks.locator('mark').allTextContents(), ['Picnic', 'picnic']);
    const events = page.getByRole('region', { name: 'Events (1)', exact: true });
    assert.equal(await events.getByText('In the checklist:').count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline search with more results and a notice fits 320px at doubled text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors } = await fixture(context, { documentTotal: 45, checklistTask: true, address: `/app/search?q=picnic&space_id=${spaceId}` });
    await page.getByRole('button', { name: 'Show more documents', exact: true }).waitFor();
    await page.evaluate(other => {
      window.documentsFixture.spaces = [{ ...window.documentsFixture.spaces[0], id: other, name: 'Neighbours' }];
    }, strangerSpaceId);
    await sendLive(page, frame('change', { kind: 'search', space_id: spaceId, reason: 'access' }));
    await page.getByText('That Space is no longer available to you. Showing all your Spaces.', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'at 320px');
    const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'at 320px and 200% text');
    const button = await page.getByRole('button', { name: 'Show more documents', exact: true }).boundingBox();
    assert.ok(button.width >= 44 && button.height >= 44, 'the button keeps a usable target');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline documents and search fit 320px at normal and doubled root text sizes', async () => {
  const name = `Document-${'A'.repeat(70)}.md`;
  for (const address of [
    `/app/documents?space_id=${spaceId}`,
    `/app/documents?space_id=${spaceId}&id=${documentId}&line=3&end=4`,
    `/app/search?q=picnic&space_id=${spaceId}`,
  ]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: 'UTC' });
    try {
      const { page, outbound, errors } = await fixture(context, {
        seed: true, address, name, content: `# Picnic\nMeeting place\nPicnic ${'A'.repeat(200)}\nBring a blanket.`,
      });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${address} at 320px`);
      const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size * 2}px`; }, normalSize);
      assert.equal(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), normalSize * 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${address} at 320px and 200% text`);
      assert.deepEqual(await page.evaluate(() => window.documentsFixture.unexpected), []);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});