import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
const sessionId = '2d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const runId = '359bd05a-c95c-4975-b061-d647e82a6959';
const approvalId = '359bd05a-c95c-4975-b061-d647e82a6960';
const memoryId = '7b0c2f4e-5d1a-4c3b-9e8f-1a2b3c4d5e6f';
const mixedName = 'Sita \u0c2e\u0c3e\u0c27\u0c35\u0c3f \u0939\u093f\u0928\u094d\u0926\u0940';
const deviceName = `Phone ${mixedName}`;
const spaceName = `Space ${mixedName}`;
const pageName = `Page ${mixedName}`;
const requestText = `Plan ${mixedName}`;
const serverAnswer = `Answer ${mixedName}`;
const serverQuestion = `Question ${mixedName}?`;
const memoryLabel = `Note ${mixedName}`;
const memoryContent = `Morning ${mixedName}`;
const approvalEtag = `"${'1'.padStart(64, '0')}"`;
const email = 'sita@example.test';
const password = 'Synthetic-password-42!';
const date = '2026-10-09T18:00:00Z';
const serverMessage = 'Synthetic server response. No account was created.';
const { messages: { dictionaries: texts } } = loadMessages();
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
        import { AgentScreen } from './src/features/agents/agent-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        const { language, mode } = window.t98Fixture;
        window.unmountT98 = () => root.unmount();
        root.render(<Providers language={language}>{mode === 'account' ? <AccountScreen /> : mode === 'agent' ? <AgentScreen /> : <AuthScreen mode="register" />}</Providers>);`,
      resolveDir: web, sourcefile: 'offline-account-agent.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/t98/offline-account-agent.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-account-agent', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
      builder.onLoad({ filter: /^navigation$/, namespace: 'fixture' }, () => ({
        contents: 'export function usePathname() { return window.location.pathname; }', loader: 'js',
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

async function fixture(context, language, options = {}) {
  const result = { outbound: [], errors: [], calls: [], unexpected: [] };
  const routePath = options.mode === 'account' ? '/app/settings/account' : options.mode === 'agent' ? '/app/agent' : '/register';
  await context.route('**/*', route => {
    if (route.request().resourceType() === 'document' && route.request().method() === 'GET' && route.request().url() === origin + routePath) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><link rel="icon" href="data:,"></head><body><div id="root"></div></body></html>' });
    }
    result.outbound.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = result.page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  await page.exposeFunction('recordT98Call', call => { result.calls.push(call); });
  await page.exposeFunction('recordT98Unexpected', call => { result.unexpected.push(call); });
  await page.goto(origin + routePath);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ language, date, serverMessage, accountId, sessionId, spaceId, runId, approvalId, memoryId, mixedName, deviceName, spaceName, pageName, requestText, serverAnswer, serverQuestion, memoryLabel, memoryContent, approvalEtag, email, options }) => {
    const state = window.t98Fixture = {
      language, mode: options.mode, liveOpened: 0, liveClosed: 0, failSave: false, offlineAsk: false,
      profile: { id: accountId, display_name: mixedName, email, timezone: 'Asia/Kolkata', email_verified: true, version: 1 },
      sessions: [
        { id: accountId, device_name: `Web ${mixedName}`, platform: 'web', current: true, created_at: date, expires_at: '2026-10-10T02:00:00Z' },
        { id: sessionId, device_name: deviceName, platform: 'android', current: false, created_at: date, expires_at: '2026-10-10T02:00:00Z' },
      ],
      events: [], runs: [],
      memories: [{ id: memoryId, kind: 'note', key: null, label: memoryLabel, content: memoryContent, source: 'agent', source_run_id: null, created_at: date }],
    };
    const run = {
      id: runId, agent_kind: 'main', space_id: null, message: requestText, status: 'waiting_for_approval', outcome: null, stop_reason: null, intent: null, answer: serverAnswer,
      question: null, approval: {
        id: approvalId, run_id: runId, space_id: null, tool_name: 'community.posts.create', risk: 'medium', summary: `Summary ${mixedName}`,
        fields: [{ label: `Title ${mixedName}`, value: requestText }, { label: 'Page', value: pageName }],
        status: 'pending', reason: null, result_ref: null, created_at: date, expires_at: '2026-10-09T18:15:00Z', decided_at: null, version: '1', etag: approvalEtag,
      },
      plan: [], tool_calls: [], evidence: [], events: [], created_at: date, updated_at: date, finished_at: null, version: '1',
    };
    if (options.seedRun === 'question') Object.assign(run, { status: 'waiting_for_user', approval: null, question: { id: approvalId, text: serverQuestion, expires_at: '2026-10-09T18:15:00Z' } });
    if (options.seedRun) state.runs.push(run);
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}` });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-t98-account-agent', ...extra }), { headers: { ETag: `"profile-${state.profile.version}"` } });
    const failure = () => new Response(JSON.stringify({ error: { code: 'PRECONDITION_FAILED', message: serverMessage, details: {} }, request_id: 'offline-t98-account-agent' }), { status: 412 });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://127.0.0.1:3000');
      const method = config.method ?? 'GET';
      if (url.pathname === '/api/live' && method === 'GET') return new Response(new ReadableStream({ start(controller) {
        state.liveOpened++;
        const abort = () => { state.liveClosed++; try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} };
        if (config.signal?.aborted) abort();
        else config.signal?.addEventListener('abort', abort, { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      const call = { route: url.pathname, method, body: config.body ? JSON.parse(config.body) : null, headers: Object.fromEntries(new Headers(config.headers)) };
      await window.recordT98Call(call);
      if (url.pathname === '/api/me' && method === 'GET') return reply(state.profile);
      if (url.pathname === '/api/me/sessions' && method === 'GET') return reply(state.sessions);
      if (url.pathname === '/api/me/security-events' && method === 'GET') return reply(state.events);
      if (url.pathname === '/api/me/profile' && method === 'PATCH') {
        if (state.failSave) return failure();
        if (call.headers['if-match'] !== `"profile-${state.profile.version}"`) return failure();
        Object.assign(state.profile, call.body, { version: state.profile.version + 1 });
        state.events = [{ id: approvalId, action: 'profile.updated', created_at: date }];
        return reply(state.profile);
      }
      if (url.pathname === `/api/me/sessions/${sessionId}` && method === 'DELETE') {
        state.sessions = state.sessions.filter(session => session.id !== sessionId);
        return reply({ status: 'ok' });
      }
      if (url.pathname === '/api/me/sessions/revoke-others' && method === 'POST') {
        state.sessions = state.sessions.filter(session => session.current);
        return reply({ status: 'ok' });
      }
      if (url.pathname === '/api/notifications' && method === 'GET') return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      if (url.pathname === '/api/spaces' && method === 'GET') return reply([{ id: spaceId, name: spaceName, description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner', version: '1', created_at: date }], { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/agent-runs' && method === 'GET') return reply(state.runs, { pagination: { next_cursor: null, has_more: false } });
      if (url.pathname === '/api/agent-runs' && method === 'POST') {
        if (state.offlineAsk) throw new TypeError('Synthetic offline request');
        Object.assign(run, { message: call.body.message });
        state.runs = [run];
        return reply(run);
      }
      if (url.pathname === `/api/agent-approvals/${approvalId}/approve` && method === 'POST') {
        Object.assign(run.approval, { status: 'approved', decided_at: date, version: '2' });
        Object.assign(run, { status: 'completed', outcome: 'action_completed', finished_at: date });
        return reply(run);
      }
      if (url.pathname === `/api/agent-runs/${runId}/resume` && method === 'POST') {
        Object.assign(run, { status: 'completed', outcome: 'answered', question: null, finished_at: date });
        return reply(run);
      }
      if (url.pathname === '/api/agent-memories' && method === 'GET') return reply(state.memories);
      if (url.pathname === `/api/agent-memories/${memoryId}` && method === 'DELETE') {
        state.memories = [];
        return reply({ id: memoryId, status: 'deleted' });
      }
      if (url.pathname === '/api/timezones' && method === 'GET') return reply(['UTC', 'Asia/Kolkata']);
      if (url.pathname === '/api/auth/bootstrap' && method === 'GET') return reply({ status: 'ok' });
      if (url.pathname === '/api/auth/register' && method === 'POST') return reply({ challenge_id: crypto.randomUUID(), expires_at: date, delivery_status: 'queued' });
      if (url.pathname === '/api/auth/verify-email' && method === 'POST') return new Response(JSON.stringify({ error: { code: 'CHALLENGE_INVALID', message: serverMessage, details: {} }, request_id: 'offline-t98-account-agent' }), { status: 400 });
      await window.recordT98Unexpected(call);
      throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
    };
  }, { language, date, serverMessage, accountId, sessionId, spaceId, runId, approvalId, memoryId, mixedName, deviceName, spaceName, pageName, requestText, serverAnswer, serverQuestion, memoryLabel, memoryContent, approvalEtag, email, options });
  await page.addScriptTag({ content: javascript });
  await page.locator('main h1').waitFor();
  return result;
}

function assertClean(result) {
  assert.deepEqual(result.outbound, [], 'No request may reach the network.');
  assert.deepEqual(result.errors, [], 'The real screens must render without page errors.');
  assert.deepEqual(result.unexpected, [], 'Every API call must have an explicit answer.');
  assert.equal(result.calls.some(call => call.route === '/api/live'), false, 'The open live stream is not an API call count.');
}

async function assertStreamCloses(page) {
  await page.waitForFunction(() => window.t98Fixture.liveOpened > 0);
  await page.evaluate(() => window.unmountT98());
  await page.waitForFunction(() => window.t98Fixture.liveOpened === window.t98Fixture.liveClosed);
}

async function expectedDate(page, language, value, options) {
  return page.evaluate(({ locale, value, options }) => new Intl.DateTimeFormat(locale, options).format(new Date(value)), { locale: language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en', value, options });
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    regions: [...document.querySelectorAll('main, dialog[open], .app-header, .app-footer, .main-nav')].map(element => ({ className: element.className, width: element.clientWidth, scroll: element.scrollWidth })),
    outside: [...document.querySelectorAll('button, input, select, textarea')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => element.outerHTML.slice(0, 150)),
  }));
  assert.ok(dimensions.page <= dimensions.viewport && dimensions.body <= dimensions.viewport, `${state}: page overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.regions.every(region => region.scroll <= region.width + 1), `${state}: region overflow ${JSON.stringify(dimensions)}`);
  assert.deepEqual(dimensions.outside, [], `${state}: controls must stay within the viewport.`);
}

test('account Telugu heading matches the Android draft, independently of the web dictionary', async () => {
  const context = await browser.newContext();
  try {
    const outbound = [];
    await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
    const page = await context.newPage();
    const xml = readFileSync(path.join(root, 'android/app/src/main/res/values-te/strings.xml'), 'utf8');
    const expected = await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xml').querySelector('string[name="your_account"]').textContent, xml);
    assert.equal(texts.te['account.heading'], expected, 'The Telugu heading must reuse the Android wording, not an arbitrary replacement.');
    assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

for (const language of ['te', 'hi']) {
  test(`${language}: account translates actions, notices, confirmations and dates without changing personal content`, async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, language, { mode: 'account' });
      const { page } = result;
      const dictionary = texts[language];
      await page.getByRole('heading', { name: dictionary['account.heading'], exact: true }).waitFor();
      await page.getByText(dictionary['account.emptyActivity'], { exact: true }).waitFor();
      assert.equal(await page.getByText(dictionary['account.active'], { exact: true }).count(), 1);
      assert.equal(await page.getByText(dictionary['account.thisSession'], { exact: true }).count(), 1);
      assert.equal(await page.getByLabel(dictionary['account.displayName'], { exact: true }).inputValue(), mixedName);
      assert.equal(await page.locator('.person-row strong').textContent(), mixedName);
      assert.equal(await page.locator('.person-row span').textContent(), email);
      assert.equal(await page.getByText(deviceName, { exact: true }).count(), 1);
      const options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' };
      assert.deepEqual(await page.locator('.session-info time').allTextContents(), Array(2).fill(await expectedDate(page, language, date, options)));
      assert.equal(await page.getByRole('button', { name: dictionary['account.refreshSessions'], exact: true }).getAttribute('title'), dictionary['account.refreshSessions']);
      assert.equal(await page.getByRole('button', { name: dictionary['account.saveChanges'], exact: true }).isDisabled(), true);
      const updated = `${mixedName} updated`;
      await page.getByLabel(dictionary['account.displayName'], { exact: true }).fill(updated);
      assert.equal(await page.getByRole('button', { name: dictionary['account.discard'], exact: true }).count(), 1);
      await page.getByRole('button', { name: dictionary['account.saveChanges'], exact: true }).click();
      await page.getByRole('status').filter({ hasText: dictionary['account.profileSaved'] }).waitFor();
      const saved = result.calls.filter(call => call.route === '/api/me/profile');
      assert.equal(saved.length, 1);
      assert.deepEqual(saved[0].body, { display_name: updated, timezone: 'Asia/Kolkata' });
      assert.equal(saved[0].headers['if-match'], '"profile-1"');
      assert.equal(saved[0].headers['x-account-id'], accountId);
      await page.getByText(dictionary['account.eventProfileUpdated'], { exact: true }).waitFor();
      assert.equal(await page.locator('.activity-list time').textContent(), await expectedDate(page, language, date, options));
      await page.getByLabel(dictionary['account.displayName'], { exact: true }).fill('a'.repeat(81));
      await page.getByRole('alert').filter({ hasText: dictionary['account.nameLength'].replace('{limit}', '80') }).waitFor();
      assert.equal(await page.getByRole('button', { name: dictionary['account.saveChanges'], exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: dictionary['account.discard'], exact: true }).click();
      assert.equal(result.calls.filter(call => call.method === 'PATCH').length, 1);
      await page.getByRole('button', { name: dictionary['account.revokeNamedSession'].replace('{name}', deviceName), exact: true }).click();
      const dialog = page.getByRole('dialog', { name: dictionary['account.confirmRevoke'].replace('{name}', deviceName), exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button', { name: dictionary['account.closeConfirmation'], exact: true }).getAttribute('title'), dictionary['account.closeConfirmation']);
      assert.equal(result.calls.filter(call => call.method === 'DELETE').length, 0);
      await dialog.getByRole('button', { name: dictionary['account.confirm'], exact: true }).click();
      await page.getByRole('status').filter({ hasText: dictionary['account.sessionRevokedNotice'] }).waitFor();
      assert.equal(result.calls.filter(call => call.method === 'DELETE')[0].route, `/api/me/sessions/${sessionId}`);
      const otherLanguage = language === 'te' ? 'hi' : 'te';
      await page.locator('.language-picker select').selectOption(otherLanguage);
      await page.getByRole('status').filter({ hasText: texts[otherLanguage]['account.sessionRevokedNotice'] }).waitFor();
      assert.equal(await page.getByLabel(texts[otherLanguage]['account.displayName'], { exact: true }).inputValue(), updated);
      assert.equal(await page.locator('.session-info time').textContent(), await expectedDate(page, otherLanguage, date, options));
      await page.evaluate(() => { window.t98Fixture.failSave = true; });
      await page.locator('input[name="display_name"]').fill(`${mixedName} refused`);
      await page.getByRole('button', { name: texts[otherLanguage]['account.saveChanges'], exact: true }).click();
      await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
      assert.equal(await page.getByRole('alert').evaluate(element => element.firstChild.textContent), serverMessage);
      await assertStreamCloses(page);
      assertClean(result);
    } finally { await context.close(); }
  });

  test(`${language}: agent translates requests, validation, approvals and dates but preserves server and user content`, async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, language, { mode: 'agent' });
      const { page } = result;
      const dictionary = texts[language];
      await page.getByRole('heading', { name: dictionary['agent.heading'], exact: true }).waitFor();
      await page.getByText(dictionary['agent.emptyRequests'], { exact: true }).waitFor();
      const request = page.getByRole('textbox', { name: dictionary['agent.message'], exact: true });
      assert.equal(await page.getByRole('combobox', { name: dictionary['agent.space'], exact: true }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: dictionary['agent.mainScope'], exact: true }).count(), 1);
      await page.getByRole('button', { name: dictionary['agent.ask'], exact: true }).click();
      await page.getByRole('alert').filter({ hasText: dictionary['agent.requestRequired'] }).waitFor();
      await request.fill('a'.repeat(2001));
      await page.getByRole('button', { name: dictionary['agent.ask'], exact: true }).click();
      await page.getByRole('alert').filter({ hasText: dictionary['agent.requestLength'] }).waitFor();
      assert.equal(result.calls.filter(call => call.method === 'POST').length, 0);
      await request.fill(requestText);
      await page.getByRole('button', { name: dictionary['agent.ask'], exact: true }).click();
      const card = page.getByRole('article', { name: requestText, exact: true });
      await card.getByRole('heading', { name: dictionary['agent.check'], exact: true }).waitFor();
      assert.equal(await card.getByText(dictionary['agent.status.waiting_for_approval'], { exact: true }).count(), 1);
      assert.equal(await card.getByText(serverAnswer, { exact: true }).textContent(), serverAnswer);
      assert.deepEqual(await card.locator('dt').allTextContents(), [`Title ${mixedName}`, 'Page']);
      assert.deepEqual(await card.locator('dd').allTextContents(), [requestText, pageName]);
      const options = { dateStyle: 'medium', timeStyle: 'short' };
      const when = await expectedDate(page, language, date, options);
      assert.equal(await card.getByText(when, { exact: true }).count(), 1);
      const until = await expectedDate(page, language, '2026-10-09T18:15:00Z', options);
      assert.equal(await card.getByText(dictionary['agent.waiting'].replace('{date}', until), { exact: true }).count(), 1);
      assert.equal(await card.getByRole('button', { name: dictionary['agent.reject'], exact: true }).count(), 1);
      const ask = result.calls.find(call => call.route === '/api/agent-runs' && call.method === 'POST');
      assert.deepEqual(ask.body, { message: requestText });
      assert.equal(ask.headers['x-account-id'], accountId);
      await card.getByRole('button', { name: dictionary['agent.approve'], exact: true }).click();
      await card.getByText(dictionary['agent.status.completed'], { exact: true }).waitFor();
      assert.equal(await card.getByRole('heading', { name: `Summary ${mixedName} ${dictionary['agent.decision.approved']}`, exact: true }).count(), 1);
      const approval = result.calls.find(call => call.route.endsWith('/approve'));
      assert.equal(approval.route, `/api/agent-approvals/${approvalId}/approve`);
      assert.equal(approval.headers['if-match'], approvalEtag);
      assert.match(approval.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
      assert.deepEqual(approval.body, {});
      await assertStreamCloses(page);
      assertClean(result);
    } finally { await context.close(); }
  });

  test(`${language}: agent answers and memory deletion keep mixed-script content verbatim`, async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, language, { mode: 'agent', seedRun: 'question' });
      const { page } = result;
      const dictionary = texts[language];
      const card = page.getByRole('article', { name: requestText, exact: true });
      await card.getByText(serverQuestion, { exact: true }).waitFor();
      assert.equal(await card.getByText(dictionary['agent.status.waiting_for_user'], { exact: true }).count(), 1);
      assert.equal(await card.getByRole('button', { name: dictionary['agent.stop'], exact: true }).count(), 1);
      const answer = card.getByRole('textbox', { name: dictionary['agent.answerLabel'], exact: true });
      await answer.fill('a'.repeat(1001));
      await card.getByRole('alert').filter({ hasText: dictionary['agent.answerLength'] }).waitFor();
      assert.equal(await card.getByRole('button', { name: dictionary['agent.answer'], exact: true }).isDisabled(), true);
      await answer.fill(mixedName);
      await card.getByRole('button', { name: dictionary['agent.answer'], exact: true }).click();
      await card.getByText(dictionary['agent.status.completed'], { exact: true }).waitFor();
      assert.deepEqual(result.calls.find(call => call.route.endsWith('/resume')).body, { question_id: approvalId, answer: mixedName });
      await page.getByRole('button', { name: dictionary['agent.memories'], exact: true }).click();
      await page.getByRole('heading', { name: dictionary['agent.memoriesHeading'], exact: true }).waitFor();
      const remove = page.getByRole('button', { name: dictionary['agent.deleteNamedMemory'].replace('{content}', memoryContent), exact: true });
      await remove.waitFor();
      assert.equal(await page.getByRole('listitem').filter({ hasText: memoryContent }).locator('p').textContent(), memoryLabel + memoryContent);
      await remove.click();
      const dialog = page.getByRole('dialog', { name: dictionary['agent.deleteTitle'], exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.locator('p').first().textContent(), `${memoryLabel}: ${memoryContent}`);
      await dialog.getByRole('button', { name: dictionary['agent.keep'], exact: true }).click();
      assert.equal(result.calls.filter(call => call.method === 'DELETE').length, 0);
      await remove.click();
      await dialog.getByRole('button', { name: dictionary['agent.deleteMemory'], exact: true }).click();
      await page.getByText(dictionary['agent.emptyMemories'], { exact: true }).waitFor();
      assert.equal(result.calls.filter(call => call.method === 'DELETE').length, 1);
      await assertStreamCloses(page);
      assertClean(result);
    } finally { await context.close(); }
  });
}

for (const mode of ['account', 'agent']) {
  test(`Telugu ${mode} fits 320 px with genuinely doubled text, including its confirmation`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, 'te', { mode, seedRun: 'approval' });
      const { page } = result;
      if (mode === 'account') await page.getByText(deviceName, { exact: true }).waitFor();
      else await page.getByRole('heading', { name: texts.te['agent.check'], exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await assertFits(page, `${mode} desktop`);
      await page.screenshot({ path: path.join(root, `.local/t98/${mode}-te-desktop.png`), fullPage: true });
      await page.setViewportSize({ width: 320, height: 844 });
      await assertFits(page, `${mode} 320 px`);
      const original = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize) }));
      await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
      const enlarged = await page.evaluate(() => ({ body: parseFloat(getComputedStyle(document.body).fontSize), picker: parseFloat(getComputedStyle(document.querySelector('.language-picker')).fontSize) }));
      assert.equal(enlarged.body, original.body * 2, 'Body-sized text must really double.');
      assert.equal(enlarged.picker, original.picker * 2, 'Rem-sized text must really double.');
      await assertFits(page, `${mode} 320 px / 200%`);
      await page.screenshot({ path: path.join(root, `.local/t98/${mode}-te-320-200.png`), fullPage: true });
      if (mode === 'account') await page.getByRole('button', { name: texts.te['account.revokeNamedSession'].replace('{name}', deviceName), exact: true }).click();
      else {
        await page.getByRole('button', { name: texts.te['agent.memories'], exact: true }).click();
        await page.getByRole('button', { name: texts.te['agent.deleteNamedMemory'].replace('{content}', memoryContent), exact: true }).click();
      }
      await page.getByRole('dialog').waitFor();
      await assertFits(page, `${mode} confirmation 320 px / 200%`);
      await page.screenshot({ path: path.join(root, `.local/t98/${mode}-dialog-te-320-200.png`), fullPage: true });
      await assertStreamCloses(page);
      assertClean(result);
    } finally { await context.close(); }
  });
}

for (const language of ['en', 'te', 'hi']) {
  test(`${language}: sign-up accepts the full character limit and translates an oversized name`, async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    try {
      const result = await fixture(context, language);
      const { page } = result;
      await page.getByLabel(texts[language]['auth.email'], { exact: true }).fill(email);
      await page.getByRole('button', { name: texts[language]['auth.sendCode'], exact: true }).click();
      await page.getByRole('heading', { name: texts[language]['auth.completeHeading'], exact: true }).waitFor();
      await page.getByLabel(texts[language]['auth.code'], { exact: true }).fill('123456');
      await page.getByLabel(texts[language]['auth.newPassword'], { exact: true }).fill(password);
      await page.getByRole('combobox', { name: texts[language]['auth.timezone'], exact: true }).selectOption('Asia/Kolkata');
      assert.equal(await page.getByLabel(texts[language]['auth.displayName'], { exact: true }).count(), 1);
      const field = page.locator('input[name="display_name"]');
      for (const length of [41, 80]) {
        const name = '\u{1f642}'.repeat(length);
        await field.fill(name);
        assert.equal(await field.inputValue(), name, `The field must retain all ${length} emoji.`);
        const before = result.calls.filter(call => call.route === '/api/auth/verify-email').length;
        await page.getByRole('button', { name: texts[language]['auth.verifyCreate'], exact: true }).click();
        await page.getByRole('alert').filter({ hasText: serverMessage }).waitFor();
        const submissions = result.calls.filter(call => call.route === '/api/auth/verify-email');
        assert.equal(submissions.length, before + 1);
        assert.equal(submissions.at(-1).body.display_name, name);
        assert.equal(submissions.at(-1).body.timezone, 'Asia/Kolkata');
        assert.equal(await page.locator('#name-error').textContent(), '');
      }
      const oversized = '\u{1f642}'.repeat(41) + 'a'.repeat(40);
      await field.fill(oversized);
      assert.equal(await field.inputValue(), oversized);
      const before = result.calls.length;
      await page.getByRole('button', { name: texts[language]['auth.verifyCreate'], exact: true }).click();
      const message = texts[language]['auth.error.displayNameLength'].replace('{limit}', '80');
      await page.getByText(message, { exact: true }).waitFor();
      assert.equal(await field.getAttribute('aria-invalid'), 'true');
      assert.equal(result.calls.length, before, 'An oversized name must never be submitted.');
      const nextLanguage = language === 'te' ? 'hi' : 'te';
      await page.locator('.language-picker select').selectOption(nextLanguage);
      await page.getByText(texts[nextLanguage]['auth.error.displayNameLength'].replace('{limit}', '80'), { exact: true }).waitFor();
      assert.equal(await field.inputValue(), oversized);
      assertClean(result);
    } finally { await context.close(); }
  });
}