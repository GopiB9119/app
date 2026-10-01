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
const exportId = '0b6c1f9e-3f53-4c1a-9a43-1d1f6f1e2a10';
const proxyKey = 'synthetic-proxy-key';

// The real proxy with a simulated service: `answer(url, options)` may return a Response for any upstream call.
function proxy(answer = () => null, settings = {}) {
  const source = readFileSync(new URL('../web/src/app/api/[...path]/route.ts', import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const answered = answer(String(url), options);
    if (answered) return answered;
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    return Response.json({ data: [] });
  };
  const handlers = {};
  runInNewContext(compiled.outputText, {
    exports: handlers, require, fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin, ...settings } },
  }, { filename: 'route.ts' });
  async function send(method, route, { headers = {}, body } = {}) {
    const request = new NextRequest(`${origin}/api/${route}`, {
      method, body: method === 'GET' ? undefined : body ?? '{}',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: 'cp_session=synthetic-session', 'X-Account-ID': accountId, ...headers },
    });
    const response = await handlers[method](request, { params: Promise.resolve({ path: route.split('/') }) });
    return { response, calls };
  }
  return { send };
}

const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith('cp_session='));

test('Cancelling a deletion is a sign-in: public, from the browser address, and its new session becomes the cookie', async () => {
  const { send } = proxy((url, options) => url.endsWith('/v1/auth/cancel-deletion')
    ? Response.json({ data: { session_token: 'restored-session', session_id: accountId, expires_at: '2026-10-02T18:00:00Z', user: { id: accountId } } })
    : null, { COMMUNITY_PROXY_KEY: proxyKey, COMMUNITY_TRUSTED_PROXY_HOPS: '1' });
  const { response, calls } = await send('POST', 'auth/cancel-deletion', {
    headers: { 'X-Forwarded-For': '203.0.113.5', Cookie: 'cp_session=stale-session' },
    body: JSON.stringify({ email: 'alex@example.test', password: 'synthetic-password-1', platform: 'android', device_name: 'Forged' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.url), ['https://backend.example.test/v1/auth/cancel-deletion']);
  const upstream = calls[0].options;
  assert.equal(upstream.headers.Authorization, undefined, 'A stale session must not be sent with a sign-in.');
  assert.equal(upstream.headers['X-Community-Client-Address'], '203.0.113.5');
  assert.deepEqual(JSON.parse(upstream.body), { email: 'alex@example.test', password: 'synthetic-password-1', platform: 'web', device_name: 'Web browser' });
  const body = await response.json();
  assert.equal(body.data.session_token, undefined, 'The session token stays in the cookie.');
  assert.match(sessionCookie(response), /^cp_session=restored-session;.*HttpOnly/i);
});

test('A refused cancel sets no cookie', async () => {
  const { send } = proxy(url => url.endsWith('/v1/auth/cancel-deletion')
    ? Response.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', details: {} } }, { status: 401 })
    : null);
  const { response } = await send('POST', 'auth/cancel-deletion', { body: JSON.stringify({ email: 'alex@example.test', password: 'wrong' }) });
  assert.equal(response.status, 401);
  assert.equal(sessionCookie(response), undefined);
});

test('Asking to delete the account needs the signed-in account and ends this browser session once accepted', async () => {
  let status = 202;
  const { send } = proxy(url => url.endsWith('/v1/me/deletion')
    ? (status === 202
      ? Response.json({ data: { status: 'deletion_requested', purge_after: '2026-10-08T18:00:00Z' } }, { status: 202 })
      : Response.json({ error: { code: 'PASSWORD_INCORRECT', message: 'The password is incorrect.', details: {} } }, { status: 403 }))
    : null);
  const accepted = await send('POST', 'me/deletion', { body: JSON.stringify({ password: 'synthetic-password-1' }) });
  assert.equal(accepted.response.status, 202);
  const forwarded = accepted.calls.at(-1);
  assert.equal(forwarded.url, 'https://backend.example.test/v1/me/deletion');
  assert.equal(forwarded.options.headers.Authorization, 'Bearer synthetic-session');
  assert.match(sessionCookie(accepted.response), /^cp_session=;/, 'The cookie is cleared.');
  status = 403;
  const refused = await send('POST', 'me/deletion', { body: JSON.stringify({ password: 'wrong' }) });
  assert.equal(refused.response.status, 403);
  assert.equal(sessionCookie(refused.response), undefined, 'A wrong password keeps the session.');
  const reached = calls => calls.some(call => call.url.endsWith('/v1/me/deletion'));
  const switched = await proxy().send('POST', 'me/deletion', { headers: { 'X-Account-ID': '11111111-1111-4111-8111-111111111111' }, body: JSON.stringify({ password: 'synthetic-password-1' }) });
  assert.equal(switched.response.status, 409);
  assert.equal(reached(switched.calls), false, 'Another account signed in here: nothing is deleted.');
  const anonymous = await proxy().send('POST', 'me/deletion', { headers: { Cookie: '' }, body: JSON.stringify({ password: 'synthetic-password-1' }) });
  assert.equal(anonymous.response.status, 401);
  assert.equal(reached(anonymous.calls), false);
  const foreign = await proxy().send('POST', 'me/deletion', { headers: { Origin: 'https://elsewhere.example.test' }, body: JSON.stringify({ password: 'synthetic-password-1' }) });
  assert.equal(foreign.response.status, 403);
  assert.equal(reached(foreign.calls), false);
});

test('Data downloads pass only the five reviewed operations', async () => {
  for (const [method, route] of [
    ['GET', 'me/exports'], ['POST', 'me/exports'], ['GET', `me/exports/${exportId}`], ['DELETE', `me/exports/${exportId}`],
    ['GET', `me/exports/${exportId}/archive`],
  ]) {
    const { response, calls } = await proxy().send(method, route);
    assert.equal(response.status, 200, `${method} ${route}`);
    assert.equal(calls.at(-1).url, `https://backend.example.test/v1/${route}`);
    assert.equal(calls.at(-1).options.method, method);
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer synthetic-session');
  }
  for (const [method, route] of [
    ['DELETE', 'me/exports'], ['PATCH', `me/exports/${exportId}`], ['POST', `me/exports/${exportId}`],
    ['GET', 'me/exports/not-an-export'], ['POST', `me/exports/${exportId}/archive`], ['GET', `me/exports/${exportId}/archive/extra`],
    ['GET', 'me/deletion'], ['GET', 'auth/cancel-deletion'],
  ]) {
    const { response, calls } = await proxy().send(method, route);
    assert.equal(response.status, 404, `${method} ${route}`);
    assert.equal(calls.length, 0, `${method} ${route} must not reach the service`);
  }
});
