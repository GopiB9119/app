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
const decisionId = '0b6c1f9e-3f53-4c1a-9a43-1d1f6f1e2a10';
const appealId = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const key = 'a3a5a6c2-9a43-4f53-8c1a-1d1f6f1e2a10';

function proxy() {
  const source = readFileSync(new URL('../web/src/app/api/[...path]/route.ts', import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [] });
  };
  const handlers = {};
  runInNewContext(compiled.outputText, {
    exports: handlers, require, fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin } },
  }, { filename: 'route.ts' });
  return async (method, route, headers = {}) => {
    const request = new NextRequest(`${origin}/api/${route}`, {
      method, body: method === 'GET' ? undefined : '{"note":""}',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: 'cp_session=synthetic-session', 'X-Account-ID': accountId, ...headers },
    });
    const path = route.split('?')[0].split('/');
    const response = await handlers[method](request, { params: Promise.resolve({ path }) });
    return { response, calls };
  };
}

const forwarded = calls => calls.filter(call => !call.url.endsWith('/v1/me'));

test('Moderation passes only the eight reviewed operations, signed in as the same account', async () => {
  for (const [method, route] of [
    ['GET', 'me/moderator'], ['GET', 'moderation/queue'], ['POST', 'moderation/decisions'], ['GET', 'moderation/appeals'],
    ['POST', `moderation/decisions/${decisionId}/appeal`], ['POST', `moderation/appeals/${appealId}/resolve`],
    ['GET', 'me/moderation-notices'], ['GET', 'me/reports'],
  ]) {
    const { response, calls } = await proxy()(method, route, { 'Idempotency-Key': key });
    assert.equal(response.status, 200, `${method} ${route}`);
    const [upstream] = forwarded(calls);
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.method, method);
    assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-session');
    assert.equal(upstream.options.headers['Idempotency-Key'], key);
  }
  for (const [method, route] of [
    ['POST', 'me/moderator'], ['DELETE', 'moderation/queue'], ['GET', 'moderation/decisions'], ['POST', 'moderation/appeals'],
    ['GET', `moderation/decisions/${decisionId}/appeal`], ['POST', `moderation/appeals/${appealId}/restore`],
    ['POST', 'moderation/decisions/not-a-decision/appeal'], ['POST', 'me/reports'], ['GET', 'moderation/moderators'],
  ]) {
    const { response, calls } = await proxy()(method, route);
    assert.equal(response.status, 404, `${method} ${route}`);
    assert.deepEqual(forwarded(calls), [], `${method} ${route} must not reach the service`);
  }
  const switched = await proxy()('POST', 'moderation/decisions', { 'X-Account-ID': '11111111-1111-4111-8111-111111111111' });
  assert.equal(switched.response.status, 409);
  assert.deepEqual(forwarded(switched.calls), []);
  const anonymous = await proxy()('GET', 'moderation/queue', { Cookie: '' });
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.calls.length, 0);
});

test('Moderation lists forward only their own query fields, and commands accept none', async () => {
  const queue = await proxy()('GET', 'moderation/queue?limit=20&cursor=next-page');
  assert.equal(forwarded(queue.calls)[0].url, 'https://backend.example.test/v1/moderation/queue?limit=20&cursor=next-page');
  const appeals = await proxy()('GET', 'moderation/appeals?status=open');
  assert.equal(forwarded(appeals.calls)[0].url, 'https://backend.example.test/v1/moderation/appeals?status=open');
  for (const route of ['moderation/queue?status=open', 'moderation/queue?limit=1&limit=2', 'moderation/appeals?cursor=x', 'me/reports?limit=5', 'me/moderator?as=someone']) {
    const { response, calls } = await proxy()('GET', route);
    assert.equal(response.status, 400, route);
    assert.deepEqual(forwarded(calls), [], route);
  }
  for (const route of ['moderation/decisions?target=x', `moderation/appeals/${appealId}/resolve?outcome=overturned`]) {
    const { response, calls } = await proxy()('POST', route);
    assert.equal(response.status, 400, route);
    assert.deepEqual(forwarded(calls), [], route);
  }
});
