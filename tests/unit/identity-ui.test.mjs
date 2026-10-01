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
let componentBundle;

before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { AuthScreen } from './src/features/identity/auth-screen';
        const root = createRoot(document.getElementById('root'));
        window.renderAccountForm = (mode) => root.render(<AuthScreen key={mode} mode={mode} />);`,
      resolveDir: web,
      loader: 'tsx',
      sourcefile: 'offline-account-fixture.tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'offline-next-link',
      setup(builder) {
        builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
        builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
          contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
          resolveDir: web,
          loader: 'jsx',
        }));
      },
    }],
  });
  componentBundle = result.outputFiles[0].text;
  const executable = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executable) assert.ok(existsSync(executable), 'The selected isolated Chromium executable must exist.');
  browser = await chromium.launch({ executablePath: executable, headless: true });
});

after(async () => { await browser?.close(); });

async function fixture(context, mode = 'recover', timezones = ['UTC', 'Asia/Kolkata']) {
  const outbound = [];
  const consoleErrors = [];
  await context.route('**/*', route => {
    outbound.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.setContent('<html><head><title>Offline account component</title></head><body><div id="root"></div></body></html>');
  await page.evaluate(zones => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`,
      configurable: true,
    });
    window.componentApi = { calls: [], failures: {} };
    window.fetch = async (input, options = {}) => {
      const route = String(input);
      const request = {
        route,
        method: options.method ?? 'GET',
        body: options.body ? JSON.parse(options.body) : undefined,
        headers: Object.fromEntries(new Headers(options.headers)),
      };
      window.componentApi.calls.push(request);
      const failure = window.componentApi.failures[route];
      if (failure?.remaining > 0) {
        failure.remaining -= 1;
        return new Response(JSON.stringify({ error: { code: failure.code, message: failure.message, details: {} }, request_id: 'offline-fixture' }), { status: failure.status });
      }
      let data;
      switch (route) {
        case '/api/timezones': data = zones; break;
        case '/api/auth/bootstrap': data = { status: 'ok' }; break;
        case '/api/auth/register':
        case '/api/auth/recover':
          data = { challenge_id: crypto.randomUUID(), expires_at: '2026-09-19T18:00:00Z', delivery_status: 'queued' };
          break;
        case '/api/auth/reset-password': data = { status: 'ok' }; break;
        default: throw new Error(`No network is permitted in this component fixture: ${route}`);
      }
      return new Response(JSON.stringify({ data, request_id: 'offline-fixture' }), { status: 200 });
    };
  }, timezones);
  await page.addScriptTag({ content: componentBundle });
  await page.evaluate(selected => window.renderAccountForm(selected), mode);
  await page.getByRole('heading', { name: mode === 'recover' ? 'Recover your account' : 'Create your account' }).waitFor();
  return { page, outbound, consoleErrors };
}

async function requestRecovery(page, email = 'alex@example.test') {
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
}

test('offline recovery component requests a code and confirms password reset', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, consoleErrors } = await fixture(context);
    await requestRecovery(page);
    await page.locator('input[name="code"]').fill('123456');
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-42!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByRole('status').filter({ hasText: 'Password changed.' }).waitFor();
    const calls = await page.evaluate(() => window.componentApi.calls);
    const started = calls.find(call => call.route === '/api/auth/recover');
    const reset = calls.find(call => call.route === '/api/auth/reset-password');
    assert.equal(started.body.email, 'alex@example.test');
    assert.equal(reset.body.code, '123456');
    assert.equal(reset.body.password, 'Synthetic-password-42!');
    assert.deepEqual(Object.keys(reset.body).sort(), ['challenge_id', 'code', 'password']);
    assert.equal(await page.locator('input[name="password"]').count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Back to sign in' }).getAttribute('href'), '/login');
    assert.deepEqual(outbound, []);
    assert.deepEqual(consoleErrors, []);
  } finally { await context.close(); }
});

test('offline recovery validation prevents an invalid proof or short password from being submitted', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound } = await fixture(context);
    await requestRecovery(page);
    await page.locator('input[name="code"]').fill('123');
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-42!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByText('Enter the six-digit code.', { exact: true }).waitFor();
    await page.locator('input[name="code"]').fill('123456');
    await page.getByLabel('New password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByText('Use 12 to 128 characters.', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.componentApi.calls);
    assert.equal(calls.filter(call => call.route === '/api/auth/reset-password').length, 0);
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('offline recovery shows a failed reset without claiming success or discarding the proof', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound } = await fixture(context);
    await requestRecovery(page);
    await page.evaluate(() => {
      window.componentApi.failures['/api/auth/reset-password'] = { remaining: 1, status: 400, code: 'CHALLENGE_INVALID', message: 'This code is invalid, expired or already used.' };
    });
    await page.locator('input[name="code"]').fill('123456');
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-42!');
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByRole('alert').filter({ hasText: 'invalid, expired or already used' }).waitFor();
    assert.equal(await page.getByRole('status').count(), 0);
    assert.equal(await page.locator('input[name="code"]').inputValue(), '123456');
    assert.equal(await page.getByRole('heading', { name: 'Choose a new password' }).count(), 1);
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

for (const [browserZone, listed, expected] of [
  ['Europe/Berlin', ['UTC', 'Asia/Kolkata', 'Europe/Berlin'], 'Europe/Berlin'],
  // Chromium reports Asia/Kolkata as Asia/Calcutta, a name the service does not list.
  ['Asia/Kolkata', ['UTC', 'Asia/Kolkata'], 'Asia/Kolkata'],
  ['America/Chicago', ['UTC', 'Asia/Kolkata'], 'UTC'],
]) {
test(`offline registration in ${browserZone} starts in ${expected} and sends it`, async () => {
  const context = await browser.newContext({ timezoneId: browserZone });
  try {
    const { page, outbound, consoleErrors } = await fixture(context, 'register', listed);
    await page.evaluate(() => {
      window.componentApi.failures['/api/auth/verify-email'] = { remaining: 1, status: 400, code: 'CHALLENGE_INVALID', message: 'Synthetic stop before the account exists.' };
    });
    await page.locator('input[name="email"]').fill('alex@example.test');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByRole('heading', { name: 'Complete your account' }).waitFor();
    assert.equal(await page.getByLabel('Timezone', { exact: true }).inputValue(), expected);
    await page.locator('input[name="code"]').fill('123456');
    await page.getByLabel('Display name', { exact: true }).fill('Alex Morgan');
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-password-42!');
    await page.getByRole('button', { name: 'Verify and create account' }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic stop before the account exists.' }).waitFor();
    const verify = (await page.evaluate(() => window.componentApi.calls)).find(call => call.route === '/api/auth/verify-email');
    assert.equal(verify.body.timezone, expected);
    assert.deepEqual(outbound, []);
    assert.deepEqual(consoleErrors, []);
  } finally { await context.close(); }
});
}

for (const mode of ['register', 'recover']) {
test(`offline ${mode} retry keeps its key until the requested email changes`, async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound } = await fixture(context, mode);
    const endpoint = `/api/auth/${mode}`;
    await page.evaluate(route => {
      window.componentApi.failures[route] = { remaining: 2, status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Synthetic service outage.' };
    }, endpoint);
    await page.locator('input[name="email"]').fill('first@example.test');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByRole('alert').filter({ hasText: 'Synthetic service outage.' }).waitFor();
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.waitForFunction(route => window.componentApi.calls.filter(call => call.route === route).length === 2, endpoint);
    await page.getByRole('alert').filter({ hasText: 'Synthetic service outage.' }).waitFor();
    await page.locator('input[name="email"]').fill('second@example.test');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await page.getByRole('heading', { name: mode === 'recover' ? 'Choose a new password' : 'Complete your account' }).waitFor();
    const calls = await page.evaluate(route => window.componentApi.calls.filter(call => call.route === route), endpoint);
    assert.equal(calls[0].headers['idempotency-key'], calls[1].headers['idempotency-key']);
    assert.notEqual(calls[1].headers['idempotency-key'], calls[2].headers['idempotency-key']);
    assert.equal(calls[2].body.email, 'second@example.test');
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});
}