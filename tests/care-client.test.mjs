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
const instructionId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const otherId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const key = '7b2eac20-1b89-4e77-8c4b-3b3b9f8b3c03';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: relative });
  return exports;
}

function careClient(fetch = async () => { throw new Error('Unexpected network request'); }) {
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/care/client.ts', fetch, { '@/features/identity/client': identity });
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
      'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': '"v1"', ...overrides,
    };
    const request = new NextRequest(`${origin}/api/${route}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
    return handlers[method](request, { params: Promise.resolve({ path: route.split('?')[0].split('/') }) });
  }
  return { calls, request };
}

const instruction = (overrides = {}) => ({
  id: instructionId, medicine_name: 'Synthetic tablet', strength: '5 mg', form: 'tablet', dose: 'One tablet', instructions: '',
  source: 'package_label', timezone: 'Asia/Kolkata', times: ['08:00', '20:00'], start_date: '2026-09-20', end_date: null,
  status: 'active', version: 1, confirmed_by_account_id: accountId, confirmed_at: '2026-09-20T05:00:00Z',
  created_at: '2026-09-20T05:00:00Z', stopped_at: null, etag: '"i1"', ...overrides,
});
const occurrence = (overrides = {}) => ({
  instruction_id: instructionId, local_date: '2026-09-25', local_time: '08:00', display_time: '08:00', timezone: 'Asia/Kolkata',
  scheduled_at: '2026-09-25T02:30:00Z', clock_change: 'none', report: null, can_report: true, etag: '"o1"', ...overrides,
});
const day = (overrides = {}) => ({
  local_date: '2026-09-25',
  instructions: [{ id: instructionId, medicine_name: 'Synthetic tablet', strength: '5 mg', form: 'tablet', dose: 'One tablet', status: 'active' }],
  occurrences: [occurrence()], omitted: [], ...overrides,
});
const form = (overrides = {}) => ({
  medicine_name: '  Synthetic   tablet ', strength: '5 mg', form: 'tablet', dose: 'One tablet', instructions: '', source: 'package_label',
  timezone: 'Asia/Kolkata', times: ['20:00', '08:00'], start_date: '2026-09-20', end_date: '', confirmed: true, ...overrides,
});

test('Care BFF forwards only the reviewed routes, headers and parameters', async () => {
  for (const [method, route] of [
    ['GET', 'care/instructions?status=stopped'], ['POST', 'care/instructions'], ['GET', `care/instructions/${instructionId}`],
    ['POST', `care/instructions/${instructionId}/stop`], ['POST', `care/instructions/${instructionId}/reports`], ['GET', 'care/day?date=2026-09-25'],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 200, `${method} ${route}`);
    const upstream = proxy.calls.at(-1);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    if (method !== 'GET') {
      assert.equal(upstream.options.headers['Idempotency-Key'], key);
      assert.equal(upstream.options.headers['If-Match'], '"v1"');
    }
  }
  for (const [method, route] of [
    ['DELETE', `care/instructions/${instructionId}`], ['PATCH', `care/instructions/${instructionId}`], ['GET', `care/instructions/${instructionId}/reports`],
    ['POST', 'care/day'], ['GET', 'care'], ['POST', `care/instructions/${instructionId}/delete`], ['GET', `care/instructions/${instructionId}/stop`],
  ]) {
    const proxy = bff();
    assert.equal((await proxy.request(method, route)).status, 404, `${method} ${route}`);
    assert.equal(proxy.calls.length, 0);
  }
  for (const route of ['care/day?date=2026-09-25&date=2026-09-26', `care/day?account_id=${otherId}`, 'care/instructions?status=active&status=stopped', `care/instructions/${instructionId}?status=active`]) {
    assert.equal((await bff().request('GET', route)).status, 400, route);
  }
  const command = bff();
  assert.equal((await command.request('POST', `care/instructions/${instructionId}/reports?account_id=${otherId}`)).status, 400);
  assert.equal(command.calls.length, 0);
  const foreign = bff();
  assert.equal((await foreign.request('POST', 'care/instructions', { Origin: 'https://foreign.example' })).status, 403);
  assert.equal(foreign.calls.length, 0);
  const anonymous = bff();
  assert.equal((await anonymous.request('GET', 'care/day?date=2026-09-25', { Cookie: '' })).status, 401);
  assert.equal(anonymous.calls.length, 0);
});

test('Care schemas reject contradictory facts', () => {
  const client = careClient();
  assert.equal(client.instructionSchema.safeParse(instruction()).success, true);
  assert.equal(client.instructionSchema.safeParse(instruction({ status: 'stopped', stopped_at: '2026-09-21T05:00:00Z' })).success, true);
  for (const changes of [
    { status: 'stopped' }, { stopped_at: '2026-09-21T05:00:00Z' }, { end_date: '2026-09-19' }, { times: ['08:00', '08:00'] },
    { times: [] }, { times: ['8:00'] }, { source: 'friend' }, { start_date: '20 Sep' }, { etag: null },
  ]) {
    assert.equal(client.instructionSchema.safeParse(instruction(changes)).success, false, JSON.stringify(changes));
  }
  assert.equal(client.daySchema.safeParse(day()).success, true);
  for (const changes of [{ occurrences: [occurrence({ report: { outcome: 'adhered', revision: 1, reported_at: '2026-09-25T03:00:00Z', updated_at: '2026-09-25T03:00:00Z' } })] }, { occurrences: [occurrence({ clock_change: 'maybe' })] }]) {
    assert.equal(client.daySchema.safeParse(day(changes)).success, false);
  }
});

test('Care create keeps one key and exact body and confirms what was saved', async () => {
  const calls = [];
  const client = careClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: instruction() }); });
  const body = client.careBody(form());
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    medicine_name: 'Synthetic tablet', strength: '5 mg', form: 'tablet', dose: 'One tablet', instructions: '', source: 'package_label',
    timezone: 'Asia/Kolkata', times: ['08:00', '20:00'], start_date: '2026-09-20', end_date: null, confirmed: true,
  });
  const intent = { accountId, key, body };
  await client.createInstruction(intent);
  await client.createInstruction(intent);
  assert.equal(calls[0].url, '/api/care/instructions');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.equal(calls[0].options.body, calls[1].options.body);
  for (const changes of [{ dose: 'Two tablets' }, { times: ['09:00', '20:00'] }, { status: 'stopped', stopped_at: '2026-09-21T05:00:00Z' }]) {
    const mismatch = careClient(async () => Response.json({ data: instruction(changes) }));
    await assert.rejects(mismatch.createInstruction(intent), { status: 502 });
  }
});

test('Care form refuses unconfirmed or incomplete instructions', () => {
  const client = careClient();
  assert.equal(client.formProblem(form()), null);
  for (const changes of [
    { confirmed: false }, { medicine_name: ' ' }, { dose: '' }, { source: '' }, { times: [''] }, { times: ['08:00', '08:00'] },
    { end_date: '2026-09-01' }, { medicine_name: 'Bad\u0007name' }, { times: ['', '08:00'] }, { start_date: '' },
  ]) {
    assert.notEqual(client.formProblem(form(changes)), null, JSON.stringify(changes));
  }
  assert.equal(client.shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(client.todayIn('Asia/Kolkata', new Date('2026-09-25T20:00:00Z')), '2026-09-26');
});

test('Dose notes carry the reviewed version and are confirmed before being shown', async () => {
  const calls = [];
  const client = careClient(async (url, options) => {
    calls.push({ url: String(url), options });
    const outcome = JSON.parse(options.body).outcome;
    return Response.json({ data: occurrence({ report: { outcome, revision: 1, reported_at: '2026-09-25T03:00:00Z', updated_at: '2026-09-25T03:00:00Z' }, etag: '"o2"' }) });
  });
  const shown = occurrence();
  const confirmed = await client.reportDose({ accountId, key, occurrence: shown, outcome: 'taken' });
  assert.equal(confirmed.report.outcome, 'taken');
  assert.equal(calls[0].url, `/api/care/instructions/${instructionId}/reports`);
  assert.equal(calls[0].options.headers['If-Match'], '"o1"');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(calls[0].options.body), { local_date: '2026-09-25', local_time: '08:00', outcome: 'taken' });
  const other = careClient(async () => Response.json({ data: occurrence({ report: { outcome: 'skipped', revision: 1, reported_at: '2026-09-25T03:00:00Z', updated_at: '2026-09-25T03:00:00Z' } }) }));
  await assert.rejects(other.reportDose({ accountId, key, occurrence: shown, outcome: 'taken' }), { status: 502 });
  const wrongDose = careClient(async () => Response.json({ data: occurrence({ local_time: '20:00', report: { outcome: 'taken', revision: 1, reported_at: '2026-09-25T03:00:00Z', updated_at: '2026-09-25T03:00:00Z' } }) }));
  await assert.rejects(wrongDose.reportDose({ accountId, key, occurrence: shown, outcome: 'taken' }), { status: 502 });
});

test('Day plan and stop responses must match the request', async () => {
  const good = careClient(async () => Response.json({ data: day() }));
  assert.equal((await good.careDay(accountId, '2026-09-25')).occurrences.length, 1);
  for (const data of [day({ local_date: '2026-09-26' }), day({ occurrences: [occurrence(), occurrence()] }), day({ occurrences: [occurrence({ instruction_id: otherId })] }), day({ occurrences: [occurrence({ local_date: '2026-09-24' })] })]) {
    await assert.rejects(careClient(async () => Response.json({ data })).careDay(accountId, '2026-09-25'), { status: 502 });
  }
  const calls = [];
  const stopper = careClient(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ data: instruction({ status: 'stopped', stopped_at: '2026-09-21T05:00:00Z', version: 2 }) }); });
  const stopped = await stopper.stopInstruction(accountId, instruction(), key);
  assert.equal(stopped.status, 'stopped');
  assert.equal(calls[0].options.headers['If-Match'], '"i1"');
  assert.equal(calls[0].options.headers['Idempotency-Key'], key);
  await assert.rejects(careClient(async () => Response.json({ data: instruction() })).stopInstruction(accountId, instruction(), key), { status: 502 });
  const list = careClient(async () => Response.json({ data: [instruction({ status: 'stopped', stopped_at: '2026-09-21T05:00:00Z' })] }));
  await assert.rejects(list.listInstructions(accountId, 'active'), { status: 502 });
});
