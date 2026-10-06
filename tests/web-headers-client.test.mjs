import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const { pathToRegexp } = require('next/dist/compiled/path-to-regexp');

async function headersFor(pathname) {
  const source = readFileSync(new URL('../web/next.config.ts', import.meta.url), 'utf8');
  const config = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } }).outputText;
  const handlers = {};
  runInNewContext(config, { exports: handlers, process: { env: {} } }, { filename: 'next.config.ts' });
  const rules = await handlers.default.headers();
  return Object.fromEntries(rules.filter(rule => pathToRegexp(rule.source).test(pathname)).flatMap(rule => rule.headers).map(({ key, value }) => [key.toLowerCase(), value]));
}

const security = {
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

test('pages and API answers are never stored by the browser or a proxy', async () => {
  for (const pathname of ['/login', '/app', '/app/spaces', '/posts/9', '/api/me', '/api/spaces/1/events']) {
    assert.deepEqual(await headersFor(pathname), { ...security, 'cache-control': 'no-store' }, pathname);
  }
});

test('fingerprinted static files keep Next long-lived cache header, so scripts and styles load once per release', async () => {
  for (const pathname of ['/_next/static/chunks/app.js', '/_next/static/media/font.woff2', '/_next/image', '/favicon.ico']) {
    assert.deepEqual(await headersFor(pathname), security, `${pathname} must not be sent with Cache-Control, or Next cannot mark it immutable`);
  }
});
