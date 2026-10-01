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
    };
    const receipts = new Map();
    window.history.pushState = (_data, _unused, next) => { state.address = String(next); };
    const space = {
      id: spaceId, name: spaceName, description: '', space_type: 'family', visibility: 'private', status: 'active',
      role: 'owner', version: '1', created_at: addedAt,
    };
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-documents', ...extra }), { status: 200 });
    const paged = data => reply(data, { pagination: { next_cursor: null, has_more: false } });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: url.search, method, body, text: config.body ?? null, headers });
      if (url.pathname === '/api/me' && method === 'GET') return reply({
        id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1,
      });
      if (url.pathname === '/api/spaces' && method === 'GET') return paged([space]);
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
        const empty = state.emptySearch;
        return reply({
          query: url.searchParams.get('q'), space_id: url.searchParams.get('space_id'),
          documents: empty ? [] : state.documents.map(item => ({
            document_id: item.id, space_id: spaceId, space_name: spaceName, name: item.name, media_type: item.media_type,
            start_line: 3, end_line: 4, excerpt: 'Picnic <img src="https://external.invalid/search.png"> blankets by the gate.', added_at: addedAt,
          })),
          tasks: empty ? [] : [{
            task_id: taskId, space_id: spaceId, space_name: spaceName, title: 'Picnic shopping',
            excerpt: 'Picnic food to bring.', status: 'open', due_date: '2026-10-10',
          }],
          events: empty ? [] : [{
            event_id: eventId, space_id: spaceId, space_name: spaceName, title: 'Picnic in the park',
            excerpt: 'Picnic at noon.', status: 'scheduled', starts_at: '2026-10-10T12:00:00Z', timezone: 'UTC', local_start: '2026-10-10T12:00',
          }],
          more_documents: false, more_tasks: false, more_events: false,
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
    assert.equal(await tasks.getByRole('link', { name: 'Picnic shopping', exact: true }).getAttribute('href'), `/app/tasks?space_id=${spaceId}`);
    assert.equal(await events.getByRole('link', { name: 'Picnic in the park', exact: true }).getAttribute('href'), `/app/events?space_id=${spaceId}`);
    assert.deepEqual(await page.locator('main mark').allTextContents(), ['Picnic', 'Picnic', 'Picnic']);
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