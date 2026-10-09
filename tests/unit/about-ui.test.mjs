import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The start page and the privacy notice and terms drafts (Product Research 2026-10-07, section 5), offline.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { LandingScreen, PrivacyNoticeScreen, TermsScreen } from './src/features/platform/about-screen';
        import { AuthScreen } from './src/features/identity/auth-screen';
        import './src/app/globals.css';
        const screens = {
          landing: LandingScreen, privacy: PrivacyNoticeScreen, terms: TermsScreen,
          register: () => <AuthScreen mode="register" />, login: () => <AuthScreen mode="login" />,
        };
        const root = createRoot(document.getElementById('root'));
        window.renderAbout = (screen, language = 'en') => {
          const Screen = screens[screen];
          root.render(<Providers key={language} language={language}><Screen /></Providers>);
        };`,
      resolveDir: web, sourcefile: 'offline-about.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-about.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-about', setup(builder) {
      builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path.slice(5), namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'offline-fixture' }, () => ({
        contents: 'export const usePathname = () => "/"; export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });',
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

async function open(screen, { language = 'en', width = 1280 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const outbound = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest()) {
      return route.fulfill({ contentType: 'text/html', body: '<html><head><title>Community Platform</title></head><body><div id="root"></div></body></html>' });
    }
    outbound.push(route.request().url());
    // The sign-up screen reads the timezone list; nothing else may leave the page.
    if (new URL(route.request().url()).pathname === '/api/timezones') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: ['UTC', 'Asia/Kolkata'], request_id: 'offline-about' }) });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('http://127.0.0.1:3000/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(([name, value]) => window.renderAbout(name, value), [screen, language]);
  await page.getByRole('heading', { level: 1 }).waitFor();
  return { context, page, errors, outbound };
}

async function doubleText(page) {
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll('body, body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
}

async function assertFits(page, label) {
  const report = await page.evaluate(() => ({
    width: innerWidth, scroll: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('main *')].filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 120)).slice(0, 5),
  }));
  assert.ok(report.scroll <= report.width, `${label}: ${JSON.stringify(report)}`);
  assert.deepEqual(report.outside, [], label);
}

const hrefs = async (page, scope = page.getByRole('main')) => scope.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')));

for (const screen of ['landing', 'privacy', 'terms']) {
  for (const language of ['en', 'te', 'hi']) {
    test(`public trust surface ${screen}/${language} fits 320 px and 200% text`, async () => {
      const { context, page, errors, outbound } = await open(screen, { language, width: 320 });
      try {
        if (screen !== 'landing') {
          await page.getByRole('note').waitFor();
          assert.equal(await page.getByRole('article').getAttribute('lang'), 'en');
        }
        await assertFits(page, `${screen}/${language} at 320 px`);
        await doubleText(page);
        await assertFits(page, `${screen}/${language} at 320 px with 200% text`);
        for (const link of await page.getByRole('main').getByRole('link').all()) {
          const box = await link.boundingBox();
          assert.ok(box && box.height >= 44, `${screen}/${language}: ${await link.textContent()} is too small to tap`);
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(outbound, [], 'Public trust information must not require an authenticated API.');
      } finally { await context.close(); }
    });
  }
}

test('a visitor learns what the product is, how data is treated, and can sign up, sign in or look around', async () => {
  const { context, page, errors, outbound } = await open('landing');
  try {
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Private plans and public communities, clearly separated');
    assert.deepEqual(await hrefs(page), ['/register', '/login', '/app/discover', '/privacy', '/terms']);
    const promises = page.getByRole('region', { name: 'How we treat your data' });
    for (const text of ['This local preview has no advertising feature. Review the draft notice before sharing data.', 'Private Space content is excluded from public recommendations.',
      'Messages are encrypted on our server. They are not end-to-end encrypted, and we say so.']) {
      await promises.getByText(text, { exact: true }).waitFor();
    }
    assert.equal(await page.getByRole('region', { name: 'What you can do' }).getByRole('listitem').count(), 4);
    await page.getByText('This is a test version with sample data only.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, [], 'The start page needs no API call.');
  } finally { await context.close(); }
});

test('the start page fits 320 px with normal and doubled text, and its actions stay large enough to tap', async () => {
  const { context, page, errors } = await open('landing', { width: 320 });
  try {
    await assertFits(page, 'start page at 320 px');
    await doubleText(page);
    await assertFits(page, 'start page at 320 px with 200% text');
    for (const name of ['Create an account', 'Sign in', 'Explore public pages', 'Privacy notice', 'Terms of use']) {
      const box = await page.getByRole('main').getByRole('link', { name, exact: true }).boundingBox();
      assert.ok(box.height >= 44, `${name} is ${box.height}px tall`);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the start page follows the chosen language', async () => {
  for (const [language, heading] of [['te', 'ప్రైవేట్ ప్రణాళికలు, పబ్లిక్ సమూహాలు — స్పష్టంగా వేరు'], ['hi', 'निजी योजनाएँ और सार्वजनिक समुदाय — साफ़ तौर पर अलग']]) {
    const { context, page, errors } = await open('landing', { language, width: 320 });
    try {
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), heading);
      await doubleText(page);
      await assertFits(page, `${language} start page at 320 px with 200% text`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('the privacy notice is marked as an unreviewed draft and names what leaves the service', async () => {
  const { context, page, errors, outbound } = await open('privacy');
  try {
    await page.getByRole('heading', { level: 1, name: 'Privacy notice' }).waitFor();
    assert.equal(await page.getByRole('note').textContent(), 'Draft for review. A lawyer has not checked it yet, and it is not in force.');
    const text = await page.getByRole('article').textContent();
    for (const fact of ['Microsoft Azure OpenAI', 'TinyFish', 'not end-to-end encrypted', 'not for anyone under 18', '7 days to cancel',
      'never used to suggest pages or posts', 'Data Protection Board of India', '[To complete before launch]']) {
      assert.ok(text.includes(fact), fact);
    }
    assert.deepEqual(await hrefs(page, page.getByRole('navigation', { name: 'Start page' })), ['/', '/terms']);
    await assertFits(page, 'privacy notice');
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('the terms draft covers rules, the assistant and medicines, and stays readable at 320 px with doubled text', async () => {
  const { context, page, errors } = await open('terms', { width: 320 });
  try {
    await page.getByRole('heading', { level: 1, name: 'Terms of use' }).waitFor();
    const text = await page.getByRole('article').textContent();
    for (const fact of ['You must be 18 or older.', 'Changes normally require an exact review.', 'not for emergencies', 'No payments are made in the app.']) {
      assert.ok(text.includes(fact), fact);
    }
    await doubleText(page);
    await assertFits(page, 'terms at 320 px with 200% text');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('in Telugu or Hindi the drafts say they are English for now, and mark the English text for screen readers', async () => {
  const { context, page, errors } = await open('privacy', { language: 'hi' });
  try {
    await page.getByRole('heading', { level: 1, name: 'गोपनीयता सूचना' }).waitFor();
    await page.getByText('यह मसौदा अंग्रेज़ी में है। समीक्षा के बाद तेलुगु और हिंदी संस्करण आएँगे।', { exact: true }).waitFor();
    assert.equal(await page.getByRole('article').getAttribute('lang'), 'en');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the landing page distinguishes public content, personal medicine records, and optional automatic actions', async () => {
  const { context, page, errors, outbound } = await open('landing');
  try {
    const text = await page.getByRole('main').textContent();
    for (const fact of ['private Spaces and public pages', 'Medicine records are only for you',
      'opt-in auto-approve', 'selected account data', 'Shared records may remain']) {
      assert.ok(text.includes(fact), fact);
    }
    for (const overpromise of ['trusted communities', 'Download or delete everything', 'It shows every change before making it']) {
      assert.equal(text.includes(overpromise), false, overpromise);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('privacy and terms drafts disclose actual approval and data-exit limits instead of unconditional guarantees', async () => {
  for (const screen of ['privacy', 'terms']) {
    const { context, page, errors } = await open(screen);
    try {
      const text = await page.getByRole('article').textContent();
      assert.ok(text.includes('opt-in auto-approve'), screen);
      assert.ok(text.includes('New public pages, publishing and comments still require review'), screen);
      assert.equal(text.includes('It never makes a change without your approval'), false);
      assert.equal(text.includes('shows every change before making it'), false);
      assert.equal(text.includes('delete your account at any time'), false, screen);
      for (const fact of ['Space with other members', 'hand over ownership', '7 days to cancel']) {
        assert.ok(text.includes(fact), `${screen}: ${fact}`);
      }
      if (screen === 'privacy') {
        for (const fact of ['The downloaded file is not encrypted', 'selected account data',
          'Provider retention and training settings', 'Age verification and guardian consent are not implemented',
          'not a promise to erase every copy']) assert.ok(text.includes(fact), fact);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('sign-up says the service is for people 18 or older before an email is sent, with the drafts one tap away; sign-in does not', async () => {
  const { context, page, errors, outbound } = await open('register', { width: 320 });
  try {
    await page.getByText('This service is for people 18 or older. By creating an account, you confirm that you are 18 or older.', { exact: true }).waitFor();
    const form = page.locator('form');
    assert.deepEqual(await hrefs(page, form), ['/privacy', '/terms']);
    await doubleText(page);
    await assertFits(page, 'sign-up at 320 px with 200% text');
    for (const name of ['Privacy notice', 'Terms of use']) {
      const box = await form.getByRole('link', { name, exact: true }).boundingBox();
      assert.ok(box.height >= 44, `${name} is ${box.height}px tall`);
    }
    assert.deepEqual(outbound.map(url => new URL(url).pathname), ['/api/timezones']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const signIn = await open('login');
  try {
    await signIn.page.locator('form').waitFor();
    assert.equal(await signIn.page.getByText(/18 or older/).count(), 0);
  } finally { await signIn.context.close(); }
});

for (const [language, script] of [['te', /[\u0C00-\u0C7F]/u], ['hi', /[\u0900-\u097F]/u]]) {
  test(`sign-up notice and policy links remain localized and usable in ${language}`, async () => {
    const { context, page, errors, outbound } = await open('register', { language, width: 320 });
    try {
      const form = page.locator('form');
      const notice = form.getByText(/18/);
      await notice.waitFor();
      assert.match(await notice.textContent(), script);
      assert.deepEqual(await hrefs(page, form), ['/privacy', '/terms']);
      await assertFits(page, `${language} sign-up at 320 px`);
      await doubleText(page);
      await assertFits(page, `${language} sign-up at 320 px with 200% text`);
      for (const link of await form.getByRole('link').all()) {
        assert.match(await link.textContent(), script);
        const box = await link.boundingBox();
        assert.ok(box && box.height >= 44, `${language}: ${await link.textContent()} is too small to tap`);
      }
      assert.deepEqual(outbound.map(url => new URL(url).pathname), ['/api/timezones']);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
    const signIn = await open('login', { language });
    try {
      await signIn.page.locator('form').waitFor();
      assert.equal(await signIn.page.getByText(/18/).count(), 0);
      assert.deepEqual(signIn.errors, []);
      assert.deepEqual(signIn.outbound, []);
    } finally { await signIn.context.close(); }
  });
}
