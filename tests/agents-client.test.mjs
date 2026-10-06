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
const spaceId = '6a2d8c3e-1f4b-4d5a-9c7e-2b3a4c5d6e7f';
const runId = '0b1f4f58-5a0c-4e67-9b7a-6f5f2a7f4c11';
const approvalId = '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4';
const questionId = '2d3c4b5a-6978-4f1e-8d2c-3b4a59687786';
const memoryId = '3c2b1a09-8f7e-4d6c-b5a4-938271605f4e';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';
const etag = `"${'a'.repeat(64)}"`;

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date, TextEncoder, crypto, Headers,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function load(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/agents/client.ts', fetch, { '@/features/identity/client': identity });
}

function recorder(respond) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options, body: options?.body ? JSON.parse(options.body) : undefined });
    return respond(String(url), options);
  };
  return { calls, fetch };
}

function bff() {
  const calls = [];
  const handlers = loadSource('app/api/[...path]/route.ts', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [] });
  });
  async function request(method, route, overrides = {}) {
    const headers = {
      Cookie: 'cp_session=synthetic-session', Origin: origin, 'X-Account-ID': accountId,
      'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': etag, ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const approval = (overrides = {}) => ({
  id: approvalId, run_id: runId, space_id: spaceId, tool_name: 'tasks.create', risk: 'medium', summary: 'Create this task.',
  fields: [{ label: 'Title', value: 'Water the plants' }, { label: 'Due date', value: 'Sun 20 Sep 2026' }],
  status: 'pending', reason: null, result_ref: null, created_at: '2026-09-19T10:00:00Z', expires_at: '2026-09-19T10:15:00Z',
  decided_at: null, version: '1', etag, ...overrides,
});
const run = (overrides = {}) => ({
  id: runId, space_id: spaceId, message: 'add a task to water the plants tomorrow', status: 'waiting_for_approval', outcome: null,
  stop_reason: null, intent: 'create_task', answer: null, question: null, approval: approval(),
  plan: [{ id: 'understand', label: 'Understand the request', kind: 'check', tool: null, status: 'done' }],
  tool_calls: [], evidence: [], events: [{ sequence: 1, event_type: 'run.created', summary: 'Request received.', created_at: '2026-09-19T10:00:00Z' }],
  created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z', finished_at: null, version: '2', ...overrides,
});
const memory = (overrides = {}) => ({
  id: memoryId, kind: 'note', key: null, label: 'Note', content: 'The plumber comes on Fridays', source: 'approved_request',
  source_run_id: runId, created_at: '2026-09-19T10:00:00Z', ...overrides,
});

test('Web sources retain provenance and only matching YouTube IDs can be embedded', () => {
  const client = load();
  const source = { title: 'A cooking video', url: 'https://www.youtube.com/watch?v=pKtweGSC2FU', read: false, video_id: 'pKtweGSC2FU' };
  const result = client.runSchema.parse(run({ sources: [source] }));
  assert.deepEqual(JSON.parse(JSON.stringify(result.sources)), [source]);
  assert.deepEqual(JSON.parse(JSON.stringify(client.runSchema.parse(run()).sources)), []);
  for (const unsafe of [
    { ...source, url: 'javascript:alert(1)' },
    { ...source, url: 'https://youtube.com.attacker.example/watch?v=pKtweGSC2FU' },
    { ...source, url: 'https://user:secret@www.youtube.com/watch?v=pKtweGSC2FU' },
    { ...source, video_id: 'different11' },
    { ...source, video_id: '../script' },
  ]) assert.equal(client.runSchema.safeParse(run({ sources: [unsafe] })).success, false);
  for (const url of ['https://youtu.be/pKtweGSC2FU', 'https://www.youtube.com/shorts/pKtweGSC2FU']) {
    assert.equal(client.runSchema.safeParse(run({ sources: [{ ...source, url }] })).success, true);
  }
  const middleware = loadSource('proxy.ts', async () => { throw new Error('No network expected'); });
  const response = middleware.proxy(new NextRequest(`${origin}/app/agent`));
  assert.match(response.headers.get('Content-Security-Policy'), /(?:^|; )frame-src https:\/\/www\.youtube-nocookie\.com(?:;|$)/);
  assert.match(response.headers.get('Content-Security-Policy'), /object-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});

test('Saved web text is bounded, read-only and tied to its requested run', async () => {
  const item = { source: { title: 'Transit report', url: 'https://news.example.org/transit', read: true, video_id: null },
    text: 'Service begins October 9.', offset: 0, partial: false };
  const preview = { run_id: runId, sources: [item] };
  const network = recorder(() => Response.json({ data: preview }));
  const client = load(network.fetch);
  const actual = await client.readWebText(accountId, runId);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), preview);
  assert.equal(network.calls[0].url, `/api/agent-runs/${runId}/web-text`);
  assert.equal(network.calls[0].options.method, 'GET');
  assert.equal(network.calls[0].options.headers['X-Account-ID'], accountId);
  for (const malformed of [
    { ...preview, sources: [item, item] },
    { ...preview, sources: [{ ...item, text: 'x'.repeat(2601) }] },
    { ...preview, sources: [{ ...item, offset: -1 }] },
    { ...preview, sources: [{ ...item, offset: 200 }] },
    { ...preview, sources: [{ ...item, source: { ...item.source, read: false } }] },
    { ...preview, sources: [{ ...item, source: { ...item.source, url: 'javascript:alert(1)' } }] },
  ]) assert.equal(client.webTextSchema.safeParse(malformed).success, false);
  const wrongRun = load(async () => Response.json({ data: { ...preview, run_id: spaceId } }));
  await assert.rejects(wrongRun.readWebText(accountId, runId), error => error.code === 'INVALID_RESPONSE');
});

test('Agent routes pass the BFF only with reviewed methods and parameters', async () => {
  for (const [method, route] of [
    ['POST', 'agent-runs'], ['GET', `agent-runs?space_id=${spaceId}&limit=20`], ['GET', `agent-runs?space_id=${spaceId}&cursor=c`],
    ['GET', `agent-runs/${runId}`], ['GET', `agent-runs/${runId}/web-text`], ['POST', `agent-runs/${runId}/resume`], ['POST', `agent-runs/${runId}/cancel`],
    ['POST', `agent-approvals/${approvalId}/approve`], ['POST', `agent-approvals/${approvalId}/reject`],
    ['GET', 'agent-memories'], ['DELETE', `agent-memories/${memoryId}`], ['GET', 'agent-tools'],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(upstream.options.headers['Idempotency-Key'], key);
  }
  for (const [method, route] of [
    ['DELETE', `agent-runs/${runId}`], ['PATCH', `agent-runs/${runId}`], ['GET', `agent-runs/${runId}/resume`],
    ['POST', `agent-approvals/${approvalId}`], ['GET', `agent-approvals/${approvalId}/approve`], ['POST', `agent-approvals/${approvalId}/edit`],
    ['POST', 'agent-memories'], ['PATCH', `agent-memories/${memoryId}`], ['GET', `agent-memories/${memoryId}`], ['POST', 'agent-tools'],
    ['GET', 'agent-runs/not-a-uuid'], ['GET', 'agent-runs/not-a-uuid/web-text'], ['POST', `agent-runs/${runId}/web-text`],
    ['GET', 'agent-web-fetches'], ['POST', 'agent-web-fetches'], ['GET', `agent-web-fetches/${runId}`],
    ['POST', `agent-web-fetches/${runId}`], ['GET', 'agent-web-fetches/not-a-uuid'],
    ['POST', 'agent-web-fetches?force=1'], ['GET', `agent-web-fetches/${runId}?account_id=${accountId}`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const [method, route] of [
    ['GET', `agent-runs?account_id=${accountId}`], ['GET', `agent-runs?space_id=${spaceId}&space_id=${spaceId}`],
    ['GET', `agent-runs/${runId}?space_id=${spaceId}`], ['GET', 'agent-memories?limit=5'], ['POST', `agent-runs?space_id=${spaceId}`],
    ['POST', `agent-approvals/${approvalId}/approve?force=1`], ['DELETE', `agent-memories/${memoryId}?all=1`],
    ['GET', `agent-runs/${runId}/web-text?url=https://news.example.org/transit`],
  ]) {
    assert.equal((await bff().request(method, route)).status, 400, `${method} ${route}`);
  }
  const foreign = bff();
  assert.equal((await foreign.request('POST', `agent-approvals/${approvalId}/approve`, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
});

test('Agent responses must be consistent before the screen uses them', () => {
  const client = load();
  assert.equal(client.runSchema.safeParse(run()).success, true);
  assert.equal(client.runSchema.safeParse(run({ status: 'waiting_for_user', approval: null, question: { id: questionId, text: 'What time?', expires_at: '2026-09-19T10:15:00Z' } })).success, true);
  for (const changes of [
    { status: 'waiting_for_user' }, { question: { id: questionId, text: 'What time?', expires_at: '2026-09-19T10:15:00Z' } },
    { approval: null }, { approval: approval({ status: 'approved', decided_at: null, result_ref: runId }) },
    { approval: approval({ etag: 'W/"weak"' }) }, { approval: approval({ fields: Array.from({ length: 11 }, () => ({ label: 'x', value: 'y' })) }) },
    { status: 'thinking' }, { version: '0' }, { created_at: '2026-09-19 10:00' }, { message: '' },
  ]) {
    assert.equal(client.runSchema.safeParse(run(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.memorySchema.safeParse(memory()).success, true);
  assert.equal(client.memorySchema.safeParse(memory({ kind: 'health' })).success, false);
  assert.equal(client.messageSchema.safeParse('  add a task  ').data, 'add a task');
  for (const message of ['', '   ', 'x'.repeat(501), 'line one\nline two']) {
    assert.equal(client.messageSchema.safeParse(message).success, false, JSON.stringify(message));
  }
});

for (const kind of ['event', 'document', 'page', 'space', 'interests']) {
  test(`Read-only agent ${kind} evidence survives answers and request history`, async () => {
    const reference = kind === 'interests' ? 'topic:environment' : spaceId;
    const result = run({
      status: 'completed', outcome: 'answered', approval: null, intent: `list_${kind}s`,
      answer: 'Here is the information you can see.', finished_at: '2026-09-19T10:00:01Z',
      evidence: [{ kind, ref: reference, label: `Visible ${kind}` }],
    });
    const network = recorder(url => Response.json({
      data: url.includes('?') ? [result] : result,
      pagination: { next_cursor: null, has_more: false }, request_id: 'r',
    }));
    const client = load(network.fetch);
    const answer = await client.askAgent({ accountId, spaceId, message: 'Show me what I can see', key });
    const history = await client.runPage(accountId, spaceId, null);
    assert.equal(answer.evidence[0].kind, kind);
    assert.equal(answer.evidence[0].ref, reference);
    assert.equal(history.data[0].evidence[0].label, `Visible ${kind}`);
    assert.equal(client.runSchema.safeParse({
      ...result, evidence: [{ kind: 'unregistered', ref: spaceId, label: 'Unknown source' }],
    }).success, false);
  });
}

for (const kind of ['post', 'comment', 'report', 'message']) {
  test(`Reviewed public ${kind} results survive decisions and history`, async () => {
    const result = run({
      status: 'completed', outcome: 'action_completed', intent: 'public_action', answer: 'Approved action completed.',
      finished_at: '2026-09-19T10:00:01Z',
      approval: approval({ status: 'approved', decided_at: '2026-09-19T10:00:01Z', result_ref: memoryId }),
      evidence: [{ kind, ref: memoryId, label: `Reviewed ${kind}` }],
    });
    const network = recorder(url => Response.json({
      data: url.includes('?') ? [result] : result,
      pagination: { next_cursor: null, has_more: false }, request_id: 'r',
    }));
    const client = load(network.fetch);
    const decided = await client.decide({ accountId, approval: approval(), action: 'approve', key });
    const history = await client.runPage(accountId, spaceId, null);
    assert.equal(decided.evidence[0].kind, kind);
    assert.equal(history.data[0].approval.result_ref, memoryId);
    assert.equal(network.calls[0].options.headers['Idempotency-Key'], key);
    assert.equal(network.calls[0].options.headers['If-Match'], etag);
  });
}

test('Agent run plan, evidence, action result references and timestamped events survive create and history parsing', async () => {
  const resultRef = '5b7c9d11-2468-4ace-8bdf-13579bdf2468';
  const createdAt = '2026-09-19T10:00:01Z';
  const record = run({
    status: 'completed', outcome: 'answered', approval: null, answer: 'Here is the information you can see.',
    finished_at: createdAt,
    plan: [{ id: 'check', label: 'Check the selected Space', kind: 'check', tool: null, status: 'done' }],
    tool_calls: [{ id: runId, sequence: 1, tool_name: 'family.events.list', tool_version: '1', effect: 'read', risk: 'low',
      status: 'succeeded', summary: 'Read the authorized events.', result_ref: resultRef, error_code: null, approval_id: null, created_at: createdAt }],
    evidence: [{ kind: 'event', ref: spaceId, label: 'Upcoming events' }],
    events: [{ sequence: 2, event_type: 'run.completed', summary: 'The request finished.', created_at: createdAt }],
  });
  const network = recorder(url => Response.json({
    data: url.includes('?') ? [record] : record,
    pagination: { next_cursor: null, has_more: false }, request_id: 'r',
  }));
  const client = load(network.fetch);
  const created = await client.askAgent({ accountId, spaceId, message: 'Show upcoming events', key });
  const history = await client.runPage(accountId, spaceId, null);
  for (const parsed of [created, history.data[0]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.plan)), record.plan);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.evidence)), record.evidence);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.tool_calls)), record.tool_calls);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.events)), record.events);
  }
});

test('A private Agent request is read by its existing run ID route', async () => {
  const record = run({ answer: 'The private answer.', plan: [{ id: 'step-1', label: 'Read task 12', kind: 'tool', tool: 'tasks.list', status: 'done' }] });
  const network = recorder(() => Response.json({ data: record, request_id: 'r' }));
  const client = load(network.fetch);
  const actual = await client.readRun(accountId, runId);
  assert.equal(actual.id, runId);
  assert.equal(actual.answer, 'The private answer.');
  assert.equal(actual.plan[0].label, 'Read task 12');
  assert.equal(network.calls[0].url, `/api/agent-runs/${runId}`);
  assert.equal(network.calls[0].options.headers['X-Account-ID'], accountId);
  assert.equal(network.calls[0].options.method, 'GET');
});

test('Asking, answering and deciding send the exact reviewed request', async () => {
  const network = recorder(() => Response.json({ data: run(), request_id: 'r' }));
  const client = load(network.fetch);
  await client.askAgent({ accountId, spaceId, message: 'add a task to water the plants tomorrow', key });
  await client.answerQuestion(accountId, run({ status: 'waiting_for_user', approval: null, question: { id: questionId, text: 'What time?', expires_at: '2026-09-19T10:15:00Z' } }), '6 pm');
  await client.decide({ accountId, approval: approval(), action: 'approve', key });
  await client.decide({ accountId, approval: approval(), action: 'reject', key });
  await client.cancelRun(accountId, runId);
  const [ask, resume, approve, reject, cancel] = network.calls;
  assert.equal(ask.url, '/api/agent-runs');
  assert.equal(ask.options.method, 'POST');
  assert.equal(ask.options.headers['Idempotency-Key'], key);
  assert.deepEqual(ask.body, { space_id: spaceId, message: 'add a task to water the plants tomorrow' });
  assert.equal(resume.url, `/api/agent-runs/${runId}/resume`);
  assert.deepEqual(resume.body, { question_id: questionId, answer: '6 pm' });
  assert.equal(approve.url, `/api/agent-approvals/${approvalId}/approve`);
  assert.equal(approve.options.headers['If-Match'], etag);
  assert.equal(approve.options.headers['Idempotency-Key'], key);
  assert.deepEqual(approve.body, {});
  assert.equal(reject.url, `/api/agent-approvals/${approvalId}/reject`);
  assert.equal(reject.options.headers['If-Match'], etag);
  assert.equal(reject.options.headers['Idempotency-Key'], undefined);
  assert.equal(cancel.url, `/api/agent-runs/${runId}/cancel`);
  assert.deepEqual(cancel.body, {});
  for (const call of network.calls) assert.equal(call.options.headers['X-Account-ID'], accountId);
  await assert.rejects(client.answerQuestion(accountId, run(), '6 pm'), /no open question/);
});

test('History pages and memories are read and deleted with bounded requests', async () => {
  const network = recorder(url => {
    if (url.startsWith('/api/agent-runs')) return Response.json({ data: [run()], pagination: { next_cursor: 'next', has_more: true }, request_id: 'r' });
    if (url === '/api/agent-memories') return Response.json({ data: [memory()], request_id: 'r' });
    return Response.json({ data: { id: memoryId, status: 'deleted' }, request_id: 'r' });
  });
  const client = load(network.fetch);
  const first = await client.runPage(accountId, spaceId, null);
  assert.equal(first.pagination.next_cursor, 'next');
  await client.runPage(accountId, spaceId, 'next');
  assert.equal((await client.readMemories(accountId))[0].content, 'The plumber comes on Fridays');
  assert.deepEqual(await client.forgetMemory(accountId, memoryId), { id: memoryId, status: 'deleted' });
  assert.equal(network.calls[0].url, `/api/agent-runs?space_id=${spaceId}&limit=20`);
  assert.equal(network.calls[1].url, `/api/agent-runs?space_id=${spaceId}&limit=20&cursor=next`);
  const deletion = network.calls[3];
  assert.equal(deletion.url, `/api/agent-memories/${memoryId}`);
  assert.equal(deletion.options.method, 'DELETE');
  assert.deepEqual(deletion.body, {});
});

test('Deleting a memory that is already gone counts as deleted, and only that memory may be confirmed', async () => {
  let answer = () => Response.json({ error: { code: 'NOT_FOUND', message: 'Memory not found.' }, request_id: 'r' }, { status: 404 });
  const client = load(recorder(() => answer()).fetch);
  // The client runs in its own realm, so compare a plain copy rather than the object's prototype.
  assert.deepEqual({ ...(await client.forgetMemory(accountId, memoryId)) }, { id: memoryId, status: 'deleted' });
  answer = () => Response.json({ data: { id: spaceId, status: 'deleted' }, request_id: 'r' });
  await assert.rejects(client.forgetMemory(accountId, memoryId), error => error.status === 502 && error.code === 'INVALID_RESPONSE');
  answer = () => Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again.' }, request_id: 'r' }, { status: 503 });
  await assert.rejects(client.forgetMemory(accountId, memoryId), error => error.status === 503);
});
