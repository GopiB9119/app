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
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { AccountScreen } from './src/features/identity/account-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderAccountFixture = () => root.render(<Providers><AccountScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-account-settings.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-account-settings.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-account-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

// The signed-in account settings. The timezone list fails while `timezoneFailures` is above zero.
async function fixture(context, timezoneFailures) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline account settings</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, timezoneFailures }) => {
    const state = window.accountFixture = { calls: [], timezoneFailures };
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-account', ...extra }), { status: 200 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      state.calls.push({ route: url.pathname, method });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'Europe/Berlin', email_verified: true, version: 1 });
      if (url.pathname === '/api/me/sessions' || url.pathname === '/api/me/security-events') return reply([]);
      if (url.pathname === '/api/notifications') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/timezones') {
        if (state.timezoneFailures > 0) return new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is temporarily unavailable.', details: {} }, request_id: 'offline-account' }), { status: 503 });
        return reply(['Asia/Kolkata', 'Europe/Berlin', 'UTC']);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, timezoneFailures });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderAccountFixture());
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
  return { page, outbound, errors };
}

test('account timezone says when the list did not load, and Retry loads it without saving', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors } = await fixture(context, Infinity);
    const zones = page.getByLabel('Timezone', { exact: true }).locator('option');
    const problem = page.getByRole('alert').filter({ hasText: 'The list of timezones did not load' });
    await problem.waitFor();
    assert.deepEqual(await zones.allTextContents(), ['Europe/Berlin']);
    await page.evaluate(() => { window.accountFixture.timezoneFailures = 0; });
    await problem.getByRole('button', { name: 'Retry', exact: true }).click();
    await problem.waitFor({ state: 'detached' });
    assert.deepEqual(await zones.allTextContents(), ['Asia/Kolkata', 'Europe/Berlin', 'UTC']);
    assert.equal(await page.getByLabel('Timezone', { exact: true }).inputValue(), 'Europe/Berlin');
    assert.equal(await page.evaluate(() => window.accountFixture.calls.filter(call => call.method !== 'GET').length), 0, 'Retry must not submit the profile form.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
