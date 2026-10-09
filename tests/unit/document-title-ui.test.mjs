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
let browser;
let javascript;

before(async () => {
  const bundled = await build({
    stdin: { contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { DocumentTitle } from './src/features/platform/document-title';
      const root = createRoot(document.getElementById('root'));
      // heading: text of the main h1 (null = no h1 yet); icon: an aria-hidden svg before the text, as the Agent heading has.
      window.renderTitleFixture = ({ title = true, heading = null, icon = false, pathname = '/app' }) => {
        window.testPathname = pathname;
        root.render(<>{title && <DocumentTitle />}<main>{heading !== null && <h1>{icon && <svg aria-hidden="true" width="12" height="12" />}{heading}</h1>}</main></>);
      };`,
      resolveDir: web, sourcefile: 'offline-document-title.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-document-title.js'),
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-document-title', setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export function usePathname() { return window.testPathname; }', resolveDir: web, loader: 'js',
      }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><head><title>Community Platform</title></head><body><div id="root"></div></body></html>' }));
  await page.goto('http://127.0.0.1:3000/app');
  await page.addScriptTag({ content: javascript });
  const show = options => page.evaluate(value => window.renderTitleFixture(value), options);
  const title = expected => page.waitForFunction(value => document.title === value, expected);
  return { context, page, errors, show, title };
}

test('the visible screen heading names the tab and keeps the site name after it', async () => {
  const { context, show, title, errors } = await fixture();
  try {
    await show({ heading: 'Tasks' });
    await title('Tasks | Community Platform');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the title follows a heading that changes without a page change, such as a language switch', async () => {
  const { context, show, title } = await fixture();
  try {
    await show({ heading: 'Tasks' });
    await title('Tasks | Community Platform');
    await show({ heading: '\u0c2a\u0c28\u0c41\u0c32\u0c41' });
    await title('\u0c2a\u0c28\u0c41\u0c32\u0c41 | Community Platform');
    await show({ heading: 'Reminders', pathname: '/app/reminders' });
    await title('Reminders | Community Platform');
  } finally { await context.close(); }
});

test('a screen that has no heading yet keeps the site name, then takes its heading when it appears', async () => {
  const { context, show, title } = await fixture();
  try {
    await show({ heading: null });
    await title('Community Platform');
    await show({ heading: 'Spaces' });
    await title('Spaces | Community Platform');
    await show({ heading: null });
    await title('Community Platform');
  } finally { await context.close(); }
});

test('icons and extra spaces in the heading do not reach the title', async () => {
  const { context, show, title } = await fixture();
  try {
    await show({ heading: '  Agent\n  ', icon: true });
    await title('Agent | Community Platform');
  } finally { await context.close(); }
});

test('a title written back by the page after hydration is replaced again by the screen name', async () => {
  const { context, page, show, title } = await fixture();
  try {
    await show({ heading: 'Welcome back' });
    await title('Welcome back | Community Platform');
    await page.evaluate(() => { document.title = 'Community Platform'; });
    await title('Welcome back | Community Platform');
    await page.evaluate(() => { document.querySelector('title').remove(); document.head.insertAdjacentHTML('beforeend', '<title>Community Platform</title>'); });
    await title('Welcome back | Community Platform');
  } finally { await context.close(); }
});

test('leaving the app puts the site name back so the next page does not show a stale screen name', async () => {
  const { context, page, show, title } = await fixture();
  try {
    await show({ heading: 'Documents' });
    await title('Documents | Community Platform');
    await show({ title: false, heading: 'Sign in' });
    await title('Community Platform');
    // Nothing keeps watching after the title component is gone.
    await show({ title: false, heading: 'Something else' });
    await page.waitForTimeout(150);
    assert.equal(await page.title(), 'Community Platform');
  } finally { await context.close(); }
});
