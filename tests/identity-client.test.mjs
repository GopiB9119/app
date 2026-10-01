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
const proxyKey = 'synthetic-proxy-key';

function proxy(settings = {}) {
  const source = readFileSync(new URL('../web/src/app/api/[...path]/route.ts', import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/v1/me')) return Response.json({ data: { id: accountId } });
    if (String(url).endsWith('/v1/auth/login')) return Response.json({ data: { session_token: 'synthetic-session', expires_at: '2026-10-01T18:00:00Z' } });
    return Response.json({ data: [] });
  };
  const handlers = {};
  runInNewContext(compiled.outputText, {
    exports: handlers, require, fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: origin, ...settings } },
  }, { filename: 'route.ts' });
  async function send(method, route, headers = {}) {
    const request = new NextRequest(`${origin}/api/${route}`, {
      method, body: method === 'GET' ? undefined : '{"email":"visitor@example.test","password":"synthetic-password-1"}',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: 'cp_signup_context=synthetic-context; cp_session=synthetic-session', 'X-Account-ID': accountId, ...headers },
    });
    const response = await handlers[method](request, { params: Promise.resolve({ path: route.split('/') }) });
    return { response, upstream: calls.at(-1) };
  }
  return { send };
}

const configured = { COMMUNITY_PROXY_KEY: proxyKey, COMMUNITY_TRUSTED_PROXY_HOPS: '1' };

test('Sign-in requests name the browser address added by the trusted proxy, with the proxy key', async () => {
  for (const route of ['auth/login', 'auth/register', 'auth/verify-email', 'auth/recover', 'auth/reset-password']) {
    const { upstream } = await proxy(configured).send('POST', route, { 'X-Forwarded-For': '203.0.113.5' });
    assert.equal(upstream.url, `https://backend.example.test/v1/${route}`);
    assert.equal(upstream.options.headers['X-Community-Client-Address'], '203.0.113.5');
    assert.equal(upstream.options.headers['X-Community-Proxy-Key'], proxyKey);
  }
  const spoofed = await proxy(configured).send('POST', 'auth/login', { 'X-Forwarded-For': '198.51.100.1, 2001:db8::7' });
  assert.equal(spoofed.upstream.options.headers['X-Community-Client-Address'], '2001:db8::7');
  const twoHops = await proxy({ ...configured, COMMUNITY_TRUSTED_PROXY_HOPS: '2' }).send('POST', 'auth/login', { 'X-Forwarded-For': '198.51.100.1, 203.0.113.9, 192.0.2.10' });
  assert.equal(twoHops.upstream.options.headers['X-Community-Client-Address'], '203.0.113.9');
});

test('No browser address is named without both settings or a valid trusted entry', async () => {
  const cases = [
    [{}, '203.0.113.5'],
    [{ COMMUNITY_PROXY_KEY: proxyKey }, '203.0.113.5'],
    [{ COMMUNITY_TRUSTED_PROXY_HOPS: '1' }, '203.0.113.5'],
    [{ ...configured, COMMUNITY_TRUSTED_PROXY_HOPS: 'many' }, '203.0.113.5'],
    [configured, 'unknown'],
    [configured, '203.0.113.5:4431'],
    [configured, ''],
    [{ ...configured, COMMUNITY_TRUSTED_PROXY_HOPS: '2' }, '203.0.113.5'],
  ];
  for (const [settings, forwarded] of cases) {
    const { response, upstream } = await proxy(settings).send('POST', 'auth/login', forwarded ? { 'X-Forwarded-For': forwarded } : {});
    assert.equal(response.status, 200);
    assert.equal(upstream.options.headers['X-Community-Client-Address'], undefined, JSON.stringify(settings) + forwarded);
    assert.equal(upstream.options.headers['X-Community-Proxy-Key'], undefined);
  }
});

test('Browser-sent proxy headers are never forwarded and other routes name no address', async () => {
  const forged = { 'X-Community-Client-Address': '192.0.2.44', 'X-Community-Proxy-Key': proxyKey, 'X-Forwarded-For': '203.0.113.5' };
  const unconfigured = await proxy().send('POST', 'auth/login', forged);
  assert.equal(unconfigured.upstream.options.headers['X-Community-Client-Address'], undefined);
  assert.equal(unconfigured.upstream.options.headers['X-Community-Proxy-Key'], undefined);
  const trusted = await proxy(configured).send('POST', 'auth/login', forged);
  assert.equal(trusted.upstream.options.headers['X-Community-Client-Address'], '203.0.113.5');
  for (const [method, route] of [['GET', 'timezones'], ['GET', 'me'], ['POST', 'auth/logout']]) {
    const { upstream } = await proxy(configured).send(method, route, forged);
    assert.equal(upstream.options.headers['X-Community-Client-Address'], undefined, route);
    assert.equal(upstream.options.headers['X-Community-Proxy-Key'], undefined, route);
  }
});
