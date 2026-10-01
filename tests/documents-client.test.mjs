import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { NextRequest } = require('next/server');
const origin = 'https://client.example.test';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const documentId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const otherId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';
const addedAt = '2026-10-01T10:00:00Z';
const deletedAt = '2026-10-01T11:00:00Z';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, TextDecoder, AbortSignal, DOMException, Intl, Date,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function documentsClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/files/client.ts', fetch, { '@/features/identity/client': identity });
}

function searchClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/discovery/client.ts', fetch, { '@/features/identity/client': identity });
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [], pagination: { next_cursor: null, has_more: false } });
  });
  async function request(method, route, overrides = {}, body = '{}') {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : body });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

function bodyOfSize(size) {
  const empty = { name: 'notes.md', content: '' };
  return JSON.stringify({ ...empty, content: 'a'.repeat(size - Buffer.byteLength(JSON.stringify(empty))) });
}

const document = (overrides = {}) => ({
  id: documentId, space_id: spaceId, space_name: 'Morgan family', status: 'active', name: 'notes.md',
  media_type: 'text/markdown', size_bytes: 29, line_count: 2, sha256: 'a'.repeat(64), added_by_name: 'Alex Morgan',
  added_at: addedAt, deleted_at: null, can_delete: true, ...overrides,
});

const deletedDocument = (overrides = {}) => document({
  status: 'deleted', name: null, media_type: null, size_bytes: null, line_count: null, sha256: null,
  deleted_at: deletedAt, can_delete: false, ...overrides,
});

const documentHit = (overrides = {}) => ({
  document_id: documentId, space_id: spaceId, space_name: 'Morgan family', name: 'notes.md', media_type: 'text/markdown',
  start_line: 3, end_line: 4, excerpt: 'Picnic plans for Saturday.', added_at: addedAt, ...overrides,
});

const taskHit = (overrides = {}) => ({
  task_id: otherId, space_id: spaceId, space_name: 'Morgan family', title: 'Picnic shopping',
  excerpt: 'Bring picnic blankets.', status: 'open', due_date: '2026-10-10', ...overrides,
});

const eventHit = (overrides = {}) => ({
  event_id: otherId, space_id: spaceId, space_name: 'Morgan family', title: 'Picnic', excerpt: 'Meet for a picnic.',
  status: 'scheduled', starts_at: '2026-10-10T12:00:00Z', timezone: 'UTC', local_start: '2026-10-10T12:00', ...overrides,
});

const searchResults = (overrides = {}) => ({
  query: 'picnic plans', space_id: spaceId, documents: [documentHit()], tasks: [], events: [],
  more_documents: false, more_tasks: false, more_events: false, ...overrides,
});

test('Document schema accepts active and deleted records and rejects inconsistent facts', () => {
  const client = documentsClient();
  assert.equal(client.documentSchema.safeParse(document()).success, true);
  assert.equal(client.documentSchema.safeParse(deletedDocument()).success, true);
  assert.equal(client.documentSchema.safeParse(document({ name: null })).success, false);
  assert.equal(client.documentSchema.safeParse(deletedDocument({ can_delete: true })).success, false);
});

test('Document lists reject repeated pages, duplicate IDs and another Space', async () => {
  const list = (data, next = null) => async () => Response.json({ data, pagination: { next_cursor: next, has_more: next !== null } });
  await assert.rejects(documentsClient(list([document()], 'same')).listDocuments(accountId, spaceId, 'same'), { status: 502 });
  await assert.rejects(documentsClient(list([document(), document()])).listDocuments(accountId, spaceId), { status: 502 });
  await assert.rejects(documentsClient(list([document({ space_id: otherId })])).listDocuments(accountId, spaceId), { status: 502 });
  const valid = await documentsClient(list([document()])).listDocuments(accountId, spaceId);
  assert.equal(valid.data.length, 1);
  assert.equal(valid.data[0].id, documentId);
  assert.equal(valid.pagination.next_cursor, null);
});

test('Adding a document posts the exact body and key to its Space', async () => {
  const calls = [];
  const client = documentsClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: document() });
  });
  const body = { name: 'notes.md', content: '# Picnic\nBring a blanket.\n' };
  const intent = { accountId, spaceId, key, body };
  assert.equal((await client.addDocument(intent)).id, documentId);
  await client.addDocument(intent);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, `/api/spaces/${spaceId}/documents`);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['Idempotency-Key'], key);
    assert.equal(call.options.headers['X-Account-ID'], accountId);
    assert.deepEqual(JSON.parse(call.options.body), body);
  }
  assert.equal(calls[0].options.body, calls[1].options.body);
});

test('Deleting a document posts an empty object and confirms the returned document', async () => {
  const calls = [];
  const client = documentsClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: { id: documentId, space_id: spaceId, status: 'deleted', deleted_at: deletedAt } });
  });
  const outcome = await client.deleteDocument(accountId, document());
  assert.equal(outcome.status, 'deleted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/documents/${documentId}/delete`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(calls[0].options.body, '{}');
});

test('Space search sends the words and Space filter and rejects foreign hits of every kind', async () => {
  const calls = [];
  const client = searchClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: searchResults() });
  });
  const found = await client.searchSpaces(accountId, '  picnic   plans  ', spaceId);
  assert.equal(found.documents[0].document_id, documentId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['X-Account-ID'], accountId);
  const sent = new URL(calls[0].url, origin);
  assert.equal(sent.pathname, '/api/search');
  assert.deepEqual([...sent.searchParams.entries()], [['q', 'picnic plans'], ['space_id', spaceId]]);
  for (const changes of [
    { documents: [documentHit({ space_id: otherId })] },
    { tasks: [taskHit({ space_id: otherId })] },
    { events: [eventHit({ space_id: otherId })] },
    { space_id: otherId },
  ]) {
    const foreign = searchClient(async () => Response.json({ data: searchResults(changes) }));
    await assert.rejects(foreign.searchSpaces(accountId, 'picnic plans', spaceId), { status: 502 });
  }
});

test('File checks refuse unsupported, empty, oversized and folder names but accept uppercase Markdown', () => {
  const client = documentsClient();
  assert.equal(client.fileProblem({ name: 'notes.pdf', size: 100 }), 'Add a .txt, .md or .csv file. Other file types need a virus scanner, which is not available yet.');
  assert.equal(client.fileProblem({ name: 'notes.md', size: 0 }), 'This file is empty.');
  assert.equal(client.fileProblem({ name: 'notes.md', size: 524289 }), 'A document can be at most 512 KB.');
  assert.equal(client.fileProblem({ name: 'folder/notes.md', size: 100 }), 'Use a file name without folders.');
  assert.equal(client.fileProblem({ name: 'folder\\notes.md', size: 100 }), 'Use a file name without folders.');
  assert.equal(client.fileProblem({ name: 'NOTES.MD', size: 524288 }), null);
});

test('Text decoding refuses invalid UTF-8 instead of replacing bytes', () => {
  const client = documentsClient();
  const invalid = client.decodeText(new Uint8Array([0xff, 0xfe]));
  assert.equal(invalid.problem, 'This file is not UTF-8 text.');
  assert.equal('text' in invalid, false);
  assert.equal(client.decodeText(Buffer.from('# Picnic\n', 'utf8')).text, '# Picnic\n');
});

test('Search words and highlights keep Telugu combining signs with the matched word', () => {
  const client = searchClient();
  const prefix = '\u0c39\u0c48\u0c26\u0c30\u0c3e';
  const word = `${prefix}\u0c2c\u0c3e\u0c26\u0c4d`;
  const following = ' \u0c2a\u0c4d\u0c30\u0c2f\u0c3e\u0c23\u0c02';
  const text = `${word}${following}`;
  assert.deepEqual(JSON.parse(JSON.stringify(client.searchWords(prefix))), [prefix]);
  const pieces = client.highlight(text, client.searchWords(prefix));
  assert.deepEqual(JSON.parse(JSON.stringify(pieces)), [
    { text: prefix, marked: true }, { text: text.slice(prefix.length), marked: false },
  ]);
  assert.equal(pieces.map(piece => piece.text).join(''), text);
  assert.deepEqual(JSON.parse(JSON.stringify(client.highlight(text, client.searchWords(word)))), [
    { text: word, marked: true }, { text: following, marked: false },
  ]);
});

test('Document BFF forwards all five routes with their exact method and permitted parameters', async () => {
  for (const [method, route] of [
    ['POST', `spaces/${spaceId}/documents`],
    ['GET', `spaces/${spaceId}/documents?limit=20&cursor=next-page`],
    ['GET', `documents/${documentId}`],
    ['POST', `documents/${documentId}/delete`],
    ['GET', `search?q=picnic+plans&space_id=${spaceId}`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.method, method);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    if (method === 'POST') assert.equal(upstream.options.headers['Idempotency-Key'], key);
  }
});

test('Document BFF accepts a 100000-byte add while keeping the smaller event body limit', async () => {
  const body = bodyOfSize(100000);
  assert.equal(Buffer.byteLength(body), 100000);
  for (const headers of [{}, { 'Content-Length': String(Buffer.byteLength(body)) }]) {
    const allowed = bff();
    assert.equal((await allowed.request('POST', `spaces/${spaceId}/documents`, headers, body)).status, 200);
    assert.equal(allowed.calls.at(-1).url, `https://backend.example.test/v1/spaces/${spaceId}/documents`);
    assert.equal(allowed.calls.at(-1).options.body, body);
    const refused = bff();
    assert.equal((await refused.request('POST', `spaces/${spaceId}/events`, headers, body)).status, 413);
    assert.equal(refused.calls.filter(call => !call.url.endsWith('/v1/me')).length, 0);
    assert.equal(refused.calls.length, headers['Content-Length'] ? 0 : 1);
  }
});

test('Document BFF rejects add bodies above 2200000 bytes by declared and actual size', async () => {
  const body = bodyOfSize(2200001);
  assert.equal(Buffer.byteLength(body), 2200001);
  for (const headers of [{}, { 'Content-Length': String(Buffer.byteLength(body)) }]) {
    const proxy = bff();
    assert.equal((await proxy.request('POST', `spaces/${spaceId}/documents`, headers, body)).status, 413);
    assert.equal(proxy.calls.filter(call => !call.url.endsWith('/v1/me')).length, 0);
    assert.equal(proxy.calls.length, headers['Content-Length'] ? 0 : 1);
  }
});

test('Document BFF refuses query strings on both commands before forwarding anything', async () => {
  for (const route of [`spaces/${spaceId}/documents?limit=20`, `documents/${documentId}/delete?q=picnic`]) {
    const proxy = bff();
    assert.equal((await proxy.request('POST', route)).status, 400, route);
    assert.equal(proxy.calls.length, 0);
  }
});

test('Document BFF refuses unknown and repeated read parameters', async () => {
  for (const route of [
    'search?topic=x', 'search?q=picnic&q=plans', `search?q=picnic&space_id=${spaceId}&space_id=${otherId}`,
    `spaces/${spaceId}/documents?q=x`, `spaces/${spaceId}/documents?limit=10&limit=20`,
    `spaces/${spaceId}/documents?cursor=first&cursor=second`, `documents/${documentId}?line=3`,
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request('GET', route)).status, 400, route);
    assert.equal(proxy.calls.length, 1);
    assert.equal(proxy.calls[0].url, 'https://backend.example.test/v1/me');
  }
});