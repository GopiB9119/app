import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMessages } from '../i18n-messages.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const origin = 'http://127.0.0.1:3000';
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const name = 'Home మాధవి हिन्दी';
const email = 'sita@example.test';
const password = 'Synthetic-password-42!';
const date = '2026-10-09T18:00:00Z';
const serverMessage = 'Enter your password. Synthetic server refusal.';
const { en, te, hi } = loadMessages().messages;
const texts = { en, te, hi };
const locales = { en: 'en', te: 'te-IN', hi: 'hi-IN' };
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { AuthScreen } from './src/features/identity/auth-screen';
        import { AccountScreen } from './src/features/identity/account-screen';
        import { useLanguage, useText, formatDateTime } from './src/features/i18n/i18n';
        import { isLanguage } from './src/features/i18n/messages';
        import './src/app/globals.css';
        function Probe() {
          const { language } = useLanguage();
          const t = useText();
          return <div hidden><output data-testid="language">{language}</output>
            <output data-testid="fallback">{t('shell.brandCommunity')}</output>
            <output data-testid="date">{formatDateTime(language, window.i18nFixture.date, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })}</output></div>;
        }
        const root = createRoot(document.getElementById('root'));
        window.renderI18nFixture = (mode = window.i18nFixture.mode) => {
          window.i18nFixture.mode = mode;
          const preference = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('cp_lang='))?.slice(8);
          const language = isLanguage(preference) ? preference : 'en';
          root.render(<Providers language={language}><Probe />{mode === 'account' ? <AccountScreen /> : <AuthScreen key={mode} mode={mode} />}</Providers>);
        };`,
      resolveDir: web, sourcefile: 'offline-i18n.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/gaps/offline-i18n.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-i18n-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export function usePathname() { return window.i18nFixture.mode === "account" ? "/app/settings/account" : window.location.pathname; }',
        resolveDir: web, loader: 'js',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  const calls = [];
  const unexpected = [];
  const documents = [];
  const mode = options.mode ?? 'login';
  const routePath = mode === 'account' ? '/app/settings/account' : mode === 'login' ? '/login' : `/${mode}`;
  const html = '<html lang="en"><head><title>Offline languages</title><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>';
  await context.route('**/*', route => {
    const url = route.request().url();
    if (route.request().resourceType() === 'document' && route.request().method() === 'GET' && ['/login', '/register', '/recover', '/app/settings/account'].some(value => url === origin + value)) {
      documents.push(url);
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    outbound.push(url);
    return route.abort('blockedbyclient');
  });
  if (options.language) await context.addCookies([{ name: 'cp_lang', value: options.language, url: origin }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordI18nCall', call => { calls.push(call); });
  await page.exposeFunction('recordI18nUnexpected', call => { unexpected.push(call); });
  await page.goto(origin + routePath);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, name, email, date, serverMessage, mode, options }) => {
    const state = window.i18nFixture = {
      mode, date, calls: [], sequence: 0, timezoneFailures: options.timezoneFailures ?? 0,
      holdChallenge: false, releaseChallenge: null,
      profile: { id: accountId, display_name: name, email, timezone: 'Asia/Kolkata', email_verified: true, version: 1 },
    };
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++state.sequence).toString(16).padStart(12, '0')}` });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-i18n', ...extra }), { headers: { ETag: '"profile-1"' } });
    const failure = (code, message, status, details = {}) => new Response(JSON.stringify({ error: { code, message, details }, request_id: 'offline-i18n' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      const call = { route: url.pathname, query: url.search, method, body: config.body ? JSON.parse(config.body) : null, headers: Object.fromEntries(new Headers(config.headers)) };
      state.calls.push(call);
      await window.recordI18nCall(call);
      if (url.pathname === '/api/live' && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        const abort = () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} };
        if (config.signal?.aborted) abort();
        else config.signal?.addEventListener('abort', abort, { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      if (url.pathname === '/api/me' && method === 'GET') return reply(state.profile);
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: options.unreadCount ?? 7 });
      if (['/api/me/sessions', '/api/me/security-events'].includes(url.pathname) && method === 'GET') return reply([]);
      if (url.pathname === '/api/timezones' && method === 'GET') {
        if (state.timezoneFailures > 0) { state.timezoneFailures--; return failure('SERVICE_UNAVAILABLE', 'Synthetic timezone list unavailable.', 503); }
        return reply(['UTC', 'Asia/Kolkata', 'America/Los_Angeles']);
      }
      if (url.pathname === '/api/auth/bootstrap' && method === 'GET') return reply({ status: 'ok' });
      if (['/api/auth/register', '/api/auth/recover'].includes(url.pathname) && method === 'POST') {
        const answer = () => reply({ challenge_id: crypto.randomUUID(), expires_at: date, delivery_status: 'queued' });
        if (state.holdChallenge) return new Promise(resolve => { state.releaseChallenge = () => resolve(answer()); });
        return answer();
      }
      if (url.pathname === '/api/auth/reset-password' && method === 'POST') return reply({ status: 'ok' });
      if (url.pathname === '/api/auth/verify-email' && method === 'POST') return failure('CHALLENGE_INVALID', serverMessage, 400);
      if (url.pathname === '/api/auth/login' && method === 'POST') return options.pendingDeletion
        ? failure('ACCOUNT_DELETION_PENDING', 'Synthetic deletion is pending.', 409, { purge_after: date })
        : failure('INVALID_CREDENTIALS', serverMessage, 401);
      if (url.pathname === '/api/auth/cancel-deletion' && method === 'POST') return failure('INVALID_CREDENTIALS', serverMessage, 401);
      await window.recordI18nUnexpected(call);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, name, email, date, serverMessage, mode, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderI18nFixture());
  await page.locator('main h1').waitFor();
  await page.waitForFunction(() => document.documentElement.lang === document.querySelector('[data-testid="language"]').textContent);
  return { page, outbound, errors, calls, unexpected, documents };
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'All non-fixture network requests stay blocked.');
  assert.deepEqual(result.errors, [], 'The real components must not raise page errors.');
  assert.deepEqual(result.unexpected, [], 'Every API endpoint must have an explicit fixture.');
}

async function choose(page, language) {
  await page.locator('.language-picker select').selectOption(language);
  await page.waitForFunction(value => document.documentElement.lang === value && document.querySelector('[data-testid="language"]').textContent === value, language);
}

async function expectedDate(page, language) {
  return page.evaluate(({ locale, date }) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(date)), { locale: locales[language], date });
}

async function requestCode(page, language) {
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole('button', { name: texts[language]['auth.sendCode'], exact: true }).click();
  await page.getByRole('heading', { name: texts[language]['auth.completeHeading'], exact: true }).waitFor();
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, .app-header, .app-footer, .main-nav')].map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 120)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay within the viewport.`);
}

test('English is the default and preserves the shared shell and sign-in names', async () => {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
    for (const label of ['Email address', 'Password']) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Show password', exact: true }).getAttribute('title'), 'Show password');
    assert.equal(await page.getByRole('navigation', { name: 'Account access', exact: true }).count(), 1);
    for (const label of ['Community Platform home', 'Discover pages', 'Forgot your password?', 'Test inbox']) assert.equal(await page.getByRole('link', { name: label, exact: true }).count(), 1);
    assert.equal(await page.getByText('Local test environment', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Community Platform / Local build', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('combobox', { name: 'Language', exact: true }).inputValue(), 'en');
    assert.deepEqual(await page.locator('.language-picker option').evaluateAll(options => options.map(option => [option.value, option.textContent, option.lang])), [['en', 'English', 'en'], ['te', 'తెలుగు', 'te'], ['hi', 'हिन्दी', 'hi']]);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal((await context.cookies()).some(cookie => cookie.name === 'cp_lang'), false);
    await page.evaluate(() => window.renderI18nFixture('account'));
    await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
    const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
    assert.deepEqual(await navigation.getByRole('link').allTextContents(), ['Home', 'Spaces', 'Messages', 'Discover', 'Profile']);
    await page.getByRole('link', { name: 'Notification inbox, 7 unread', exact: true }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

for (const language of ['te', 'hi']) {
  test(`${language}: the footer switches sign-in and navigation immediately and stores a one-year cookie`, async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context);
      const { page } = result;
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      const before = Date.now() / 1000;
      await choose(page, language);
      await page.getByRole('heading', { name: texts[language]['auth.welcome'], exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: texts[language]['auth.signIn'], exact: true }).count(), 1);
      assert.equal(await page.getByLabel(texts[language]['auth.email'], { exact: true }).inputValue(), email);
      assert.equal(await page.getByLabel(texts[language]['auth.password'], { exact: true }).inputValue(), password);
      assert.equal(await page.getByRole('combobox', { name: texts[language]['language.label'], exact: true }).inputValue(), language);
      await page.getByRole('button', { name: texts[language]['auth.showPassword'], exact: true }).click();
      assert.equal(await page.getByRole('button', { name: texts[language]['auth.hidePassword'], exact: true }).getAttribute('title'), texts[language]['auth.hidePassword']);
      const cookie = (await context.cookies()).find(value => value.name === 'cp_lang');
      assert.equal(cookie.value, language); assert.equal(cookie.path, '/');
      assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.httpOnly, false);
      assert.ok(cookie.expires >= before + 31536000 - 10 && cookie.expires <= Date.now() / 1000 + 31536000 + 10);
      assert.match(await page.evaluate(() => document.cookie), new RegExp(`(?:^|; )cp_lang=${language}(?:;|$)`));
      assert.equal(result.documents.length, 1, 'Changing the language must not reload.');
      await page.evaluate(() => window.renderI18nFixture('account'));
      await page.getByRole('heading', { name: texts[language]['account.heading'], exact: true }).waitFor();
      const navigation = page.getByRole('navigation', { name: texts[language]['nav.main'], exact: true });
      assert.deepEqual(await navigation.getByRole('link').allTextContents(), ['nav.home', 'nav.spaces', 'nav.messages', 'nav.discover', 'nav.profile'].map(id => texts[language][id]));
      assert.equal(await navigation.getByRole('link', { name: texts[language]['nav.profile'], exact: true }).getAttribute('aria-current'), 'page');
      await page.getByRole('link', { name: texts[language]['shell.inboxUnread'].replace('{count}', '7'), exact: true }).waitFor();
      assert.equal(await page.locator('.app-header').getByRole('link', { name: texts[language]['shell.search'], exact: true }).getAttribute('title'), texts[language]['shell.search']);
      assert.equal(await page.getByLabel(texts[language]['account.displayName'], { exact: true }).inputValue(), name);
      assert.equal(await page.getByText(name, { exact: true }).count(), 1, 'User-written names remain unchanged.');
      assertClean(result);
      await page.close();
      const remembered = await fixture(context, { mode: 'register' });
      await remembered.page.getByRole('heading', { name: texts[language]['auth.createHeading'], exact: true }).waitFor();
      assert.equal(await remembered.page.locator('html').getAttribute('lang'), language);
      assert.equal(await remembered.page.locator('.language-picker select').inputValue(), language);
      assertClean(remembered);
    } finally { await context.close(); }
  });
}

test('Missing Telugu ids display their English source, including the visible brand', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context, { language: 'te' });
    assert.equal(Object.hasOwn(te, 'shell.brandCommunity'), false);
    assert.equal(await result.page.getByTestId('fallback').textContent(), 'Community');
    assert.equal(await result.page.locator('.brand strong').textContent(), 'Platform');
    assertClean(result);
  } finally { await context.close(); }
});

test('Date formatting follows the chosen language rather than the browser locale', async () => {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    for (const language of ['en', 'te', 'hi']) {
      await choose(result.page, language);
      assert.equal(await result.page.getByTestId('date').textContent(), await expectedDate(result.page, language));
    }
    assertClean(result);
  } finally { await context.close(); }
});

test('Registration translates existing field errors without losing the name, email or timezone', async () => {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { mode: 'register' });
    const { page } = result;
    await page.locator('input[name="email"]').fill('not-an-email');
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    await page.getByText('Enter a valid email address.', { exact: true }).waitFor();
    await choose(page, 'te');
    assert.equal(await page.locator('#email-error').textContent(), te['auth.error.email']);
    await page.locator('input[name="email"]').fill('sita@example.com');
    await page.getByRole('button', { name: te['auth.sendCode'], exact: true }).click();
    await page.getByText(te['auth.error.syntheticEmail'], { exact: true }).waitFor();
    await requestCode(page, 'te');
    assert.equal(await page.locator('.auth-heading p').textContent(), email);
    assert.equal(await page.locator('.verification-summary > span').first().textContent(), `${te['auth.emailVerification']} ${te['auth.codeRequested']}`);
    assert.equal(await page.getByText(te['auth.codeRequested'], { exact: true }).count(), 1);
    await page.locator('input[name="code"]').fill('123');
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: te['auth.verifyCreate'], exact: true }).click();
    await page.getByText(te['auth.error.code'], { exact: true }).waitFor();
    await choose(page, 'hi');
    assert.equal(await page.locator('#code-error').textContent(), hi['auth.error.code']);
    await page.locator('input[name="code"]').fill('123456');
    await page.locator('input[name="password"]').fill('short');
    await page.getByRole('button', { name: hi['auth.verifyCreate'], exact: true }).click();
    await page.getByText(hi['auth.error.passwordLength'], { exact: true }).waitFor();
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: hi['auth.verifyCreate'], exact: true }).click();
    await page.getByText(hi['auth.error.displayName'], { exact: true }).waitFor();
    await page.locator('input[name="display_name"]').fill(name);
    await page.getByRole('combobox', { name: hi['auth.timezone'], exact: true }).selectOption('Asia/Kolkata');
    assert.deepEqual(await page.locator('select[name="timezone"] option').allTextContents(), ['UTC', 'Asia/Kolkata', 'America/Los Angeles']);
    await choose(page, 'en');
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), name);
    assert.equal(await page.locator('.auth-heading p').textContent(), email);
    await page.getByRole('button', { name: 'Verify and create account', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
    const sent = result.calls.find(call => call.route === '/api/auth/verify-email');
    assert.equal(sent.body.display_name, name); assert.equal(sent.body.timezone, 'Asia/Kolkata');
    assertClean(result);
  } finally { await context.close(); }
});

test('Recover translates headings, hints, pending text and the password-changed notice', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { mode: 'recover', language: 'hi' });
    const { page } = result;
    await page.getByRole('heading', { name: hi['auth.recoverHeading'], exact: true }).waitFor();
    await page.locator('input[name="email"]').fill(email);
    await page.evaluate(() => { window.i18nFixture.holdChallenge = true; });
    await page.getByRole('button', { name: hi['auth.sendCode'], exact: true }).click();
    await page.getByRole('button', { name: hi['auth.wait'], exact: true }).waitFor();
    await page.waitForFunction(() => window.i18nFixture.releaseChallenge !== null);
    await choose(page, 'te');
    assert.equal(await page.getByRole('button', { name: te['auth.wait'], exact: true }).isDisabled(), true);
    await page.evaluate(() => window.i18nFixture.releaseChallenge());
    await page.getByRole('heading', { name: te['auth.choosePassword'], exact: true }).waitFor();
    assert.equal(await page.getByText(te['auth.passwordHint'], { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: te['auth.newCode'], exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: te['auth.backSignIn'], exact: true }).count(), 1);
    await page.locator('input[name="code"]').fill('123456');
    await page.getByLabel(te['auth.newPassword'], { exact: true }).fill(password);
    await page.getByRole('button', { name: te['auth.changePassword'], exact: true }).click();
    await page.getByRole('status').filter({ hasText: te['auth.passwordChanged'] }).waitFor();
    assert.equal(await page.locator('input[name="password"], input[name="code"]').count(), 0);
    await choose(page, 'hi');
    await page.getByRole('status').filter({ hasText: hi['auth.passwordChanged'] }).waitFor();
    assertClean(result);
  } finally { await context.close(); }
});

test('Timezone load hints and Retry are translated only for the account-entry screen', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { mode: 'register', language: 'te', timezoneFailures: 1 });
    const { page } = result;
    await requestCode(page, 'te');
    const warning = page.getByRole('alert').filter({ hasText: te['auth.timezoneProblem'] });
    await warning.waitFor();
    await warning.getByRole('button', { name: te['auth.retry'], exact: true }).click();
    await warning.waitFor({ state: 'detached' });
    assert.equal(result.calls.filter(call => call.route === '/api/timezones').length, 2);
    assertClean(result);
  } finally { await context.close(); }
});

test('Pending deletion translates the panel and its real date while keeping server errors and credentials', async () => {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { pendingDeletion: true });
    const { page } = result;
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel deletion and sign in', exact: true }).waitFor();
    for (const language of ['en', 'te', 'hi']) {
      await choose(page, language);
      assert.equal(await page.locator('.message.error p').textContent(), texts[language]['auth.deletionPending'].replace('{date}', await expectedDate(page, language)));
      assert.equal(await page.getByRole('button', { name: texts[language]['auth.cancelDeletion'], exact: true }).count(), 1);
    }
    await page.getByRole('button', { name: hi['auth.cancelDeletion'], exact: true }).click();
    await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
    const sent = result.calls.find(call => call.route === '/api/auth/cancel-deletion');
    assert.deepEqual(sent.body, { email, password });
    assert.equal(await page.locator('input[name="email"]').inputValue(), email);
    assert.equal(await page.locator('input[name="password"]').inputValue(), password);
    assertClean(result);
  } finally { await context.close(); }
});

test('Login field errors switch live, but server error messages never do', async () => {
  const context = await browser.newContext();
  try {
    const result = await fixture(context);
    const { page } = result;
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Enter your password.', { exact: true }).waitFor();
    await choose(page, 'te');
    assert.equal(await page.locator('#password-error').textContent(), te['auth.error.password']);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: te['auth.signIn'], exact: true }).click();
    await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
    await choose(page, 'hi');
    assert.equal(await page.getByRole('alert').filter({ hasText: serverMessage }).textContent(), serverMessage);
    assert.deepEqual(result.calls.find(call => call.route === '/api/auth/login').body, { email, password });
    assertClean(result);
  } finally { await context.close(); }
});

test('Telugu shell and account-entry screens fit 320 px at genuinely doubled body text', async () => {
  for (const mode of ['login', 'register', 'recover', 'account']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, { mode, language: 'te', pendingDeletion: mode === 'login' });
      const { page } = result;
      if (mode === 'register') await requestCode(page, 'te');
      if (mode === 'account') await page.getByText(name, { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await assertFits(page, `${mode} at desktop width`);
      if (mode === 'login') await page.screenshot({ path: path.join(root, '.local/gaps/web-i18n-te-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 320, height: 844 });
      await assertFits(page, `${mode} at 320 px`);
      const original = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize) }));
      await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
      const enlarged = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize) }));
      assert.equal(enlarged.body, original.body * 2, 'Body-sized text must actually double.');
      assert.equal(enlarged.picker, original.picker * 2, 'The language picker text must actually double.');
      assert.ok(await page.locator('.language-picker select').evaluate(element => element.getBoundingClientRect().height >= 44), 'The picker has a 44 px minimum target.');
      await assertFits(page, `${mode} at 320 px / 200% text`);
      if (mode === 'login') {
        await page.locator('input[name="email"]').fill(email);
        await page.locator('input[name="password"]').fill(password);
        await page.getByRole('button', { name: te['auth.signIn'], exact: true }).click();
        await page.getByRole('button', { name: te['auth.cancelDeletion'], exact: true }).waitFor();
        await assertFits(page, 'Pending deletion at 320 px / 200% text');
        await page.screenshot({ path: path.join(root, '.local/gaps/web-i18n-te-320-200.png'), fullPage: true });
      }
      if (mode === 'account') await page.screenshot({ path: path.join(root, '.local/gaps/web-i18n-nav-te-320-200.png'), fullPage: true });
      assertClean(result);
    } finally { await context.close(); }
  }
});