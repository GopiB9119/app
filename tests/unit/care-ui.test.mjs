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
const instructionId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const today = '2026-10-01';
const seedLabel = 'Synthetic tablet 5 mg (tablet)';
const newLabel = 'Synthetic capsule 10 mg (capsule)';
const reviewedBody = {
  medicine_name: 'Synthetic capsule', strength: '10 mg', form: 'capsule', dose: 'One synthetic capsule',
  instructions: 'Synthetic instructions.\nCopied from the label.', source: 'package_label', timezone: 'UTC',
  times: ['08:00', '20:00'], start_date: today, end_date: '2026-10-31', confirmed: true,
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { CareScreen } from './src/features/care/care-screen';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        window.renderCareFixture = () => root.render(<Providers><CareScreen /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-care.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local', 'offline-care.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-care-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
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

// Receipts replay before checking the new version. Lost answers save a receipt, then throw without confirming the UI.
async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(`${today}T12:00:00Z`));
  await page.setContent('<html><head><title>Offline care</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, instructionId, today, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const now = `${today}T12:00:00Z`;
    const instruction = {
      id: instructionId, medicine_name: options.longText ? `Synthetic ${'A'.repeat(110)}` : 'Synthetic tablet',
      strength: '5 mg', form: 'tablet', dose: options.longText ? `Synthetic ${'B'.repeat(110)}` : 'One synthetic tablet',
      instructions: options.longText ? `Synthetic note.\n${'C'.repeat(450)}` : 'Synthetic instructions copied from the label.',
      source: 'package_label', timezone: 'UTC', times: ['08:00', '20:00'], start_date: today, end_date: null,
      status: 'active', version: 1, confirmed_by_account_id: accountId, confirmed_at: now, created_at: now,
      stopped_at: null, etag: '"instruction-1"',
    };
    const state = window.careFixture = {
      calls: [], unexpected: [], instructions: [instruction], reports: {}, alerts: {}, receipts: {},
      servedDay: null, servedLists: {}, createWrites: 0, stopWrites: 0, reportWrites: 0,
      loseCreates: options.loseCreates ?? 0, loseStops: options.loseStops ?? 0, loseReports: options.loseReports ?? 0,
      rejectCreates: !!options.rejectCreates, rejectReports: !!options.rejectReports, rejectAlerts: false,
      denyCare: false, denyAccount: !!options.denyAccount,
    };
    const reportKey = (id, date, time) => `${id}|${date}|${time}`;
    if (options.reportOutcome) {
      state.reports[reportKey(instructionId, today, '08:00')] = { outcome: options.reportOutcome, revision: 1, reported_at: now, updated_at: now };
    }
    const occurrence = (item, date, time) => {
      const scheduled = `${date}T${time}:00Z`;
      const report = state.reports[reportKey(item.id, date, time)] ?? null;
      return {
        instruction_id: item.id, local_date: date, local_time: time, display_time: time, timezone: item.timezone,
        scheduled_at: scheduled, clock_change: 'none', report,
        can_report: Date.parse(scheduled) - 3600000 <= Date.now() && Date.now() <= Date.parse(scheduled) + 7 * 86400000,
        etag: `"dose-${item.id}-${date}-${time}-v${item.version}-r${report?.revision ?? 0}"`,
      };
    };
    const day = date => {
      const items = state.instructions.filter(item => item.start_date <= date && (!item.end_date || date <= item.end_date));
      return {
        local_date: date,
        instructions: items.map(({ id, medicine_name, strength, form, dose, status }) => ({ id, medicine_name, strength, form, dose, status })),
        occurrences: items.flatMap(item => item.times.map(time => occurrence(item, date, time))
          .filter(dose => !item.stopped_at || dose.scheduled_at < item.stopped_at)),
        omitted: [],
      };
    };
    const reply = (data, extra = {}, status = 200) => new Response(JSON.stringify({ data, request_id: 'offline-care', ...extra }), { status });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message, details: {} }, request_id: 'offline-care' }), { status });
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'http://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, query: url.search, method, body, rawBody: config.body ?? null, headers });
      if (url.pathname === '/api/me' && method === 'GET') {
        if (state.denyAccount) return failed(403, 'ACCESS_DENIED', 'Synthetic account access is unavailable.');
        return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      }
      if (url.pathname === '/api/notifications' && method === 'GET') {
        return reply([], { pagination: { next_cursor: null, has_more: false }, unread_count: 0 });
      }
      if (state.denyCare && (url.pathname.startsWith('/api/care/') || url.pathname === '/api/me/care-alerts')) {
        return failed(403, 'ACCESS_DENIED', 'Synthetic care access is unavailable.');
      }
      if (url.pathname === '/api/care/day' && method === 'GET') {
        const plan = day(url.searchParams.get('date'));
        state.servedDay = structuredClone(plan);
        return reply(plan);
      }
      if (url.pathname === '/api/care/instructions' && method === 'GET') {
        const status = url.searchParams.get('status');
        const items = state.instructions.filter(item => item.status === status);
        state.servedLists[status] = structuredClone(items);
        return reply(items);
      }
      if (url.pathname === '/api/me/care-alerts' && method === 'GET') {
        return reply(state.instructions.map(item => ({ instruction_id: item.id, enabled: state.alerts[item.id] ?? false })));
      }
      const command = url.pathname.match(/^\/api\/care\/instructions(?:\/([^/]+)\/(stop|reports|alerts))?$/);
      if (command && method === 'POST') {
        const item = command[1] && state.instructions.find(value => value.id === command[1]);
        if (command[1] && !item) return failed(404, 'NOT_FOUND', 'Synthetic medicine is unavailable.');
        if (command[2] === 'alerts') {
          if (state.rejectAlerts) return failed(422, 'ALERT_REJECTED', 'Synthetic alert setting was refused.');
          state.alerts[item.id] = body.enabled;
          return reply({ instruction_id: item.id, enabled: body.enabled });
        }
        const key = headers['idempotency-key'];
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key ?? '')) {
          return failed(422, 'INVALID_REQUEST', 'A single Idempotency-Key is required.');
        }
        const receiptKey = `${url.pathname}|${key}`;
        const receipt = state.receipts[receiptKey];
        if (receipt) {
          if (receipt.body !== config.body || receipt.etag !== headers['if-match']) return failed(409, 'IDEMPOTENCY_CONFLICT', 'The retry changed its request.');
          return reply(receipt.data, {}, receipt.status);
        }
        if (!command[1]) {
          if (state.rejectCreates) return failed(422, 'INSTRUCTION_REJECTED', 'Synthetic instruction was refused.');
          if (body.confirmed !== true) return failed(422, 'INVALID_REQUEST', 'Confirm the instructions first.');
          const { confirmed, ...fields } = body;
          const saved = {
            ...fields, id: crypto.randomUUID(), status: 'active', version: 1, confirmed_by_account_id: accountId,
            confirmed_at: now, created_at: now, stopped_at: null, etag: '"instruction-1"',
          };
          state.instructions.push(saved);
          state.createWrites += 1;
          state.receipts[receiptKey] = { body: config.body, etag: headers['if-match'], data: structuredClone(saved), status: 201 };
          if (state.loseCreates-- > 0) throw new TypeError('Synthetic lost answer after saving the instruction');
          return reply(saved, {}, 201);
        }
        if (command[2] === 'stop') {
          if (headers['if-match'] !== item.etag) return failed(412, 'CARE_CHANGED', 'This medicine changed since you reviewed it.');
          Object.assign(item, { status: 'stopped', stopped_at: now, version: item.version + 1, etag: `"instruction-${item.version + 1}"` });
          state.stopWrites += 1;
          state.receipts[receiptKey] = { body: config.body, etag: headers['if-match'], data: structuredClone(item), status: 200 };
          if (state.loseStops-- > 0) throw new TypeError('Synthetic lost answer after stopping the instruction');
          return reply(item);
        }
        if (command[2] === 'reports') {
          const shown = occurrence(item, body.local_date, body.local_time);
          if (headers['if-match'] !== shown.etag) return failed(412, 'DOSE_CHANGED', 'This dose note changed since you reviewed it.');
          if (state.rejectReports) return failed(422, 'NOTE_REJECTED', 'Synthetic dose note was refused.');
          if (!shown.can_report || !item.times.includes(body.local_time)) return failed(409, 'DOSE_UNAVAILABLE', 'Synthetic dose is outside the note window.');
          const previous = state.reports[reportKey(item.id, body.local_date, body.local_time)];
          state.reports[reportKey(item.id, body.local_date, body.local_time)] = {
            outcome: body.outcome, revision: (previous?.revision ?? 0) + 1, reported_at: previous?.reported_at ?? now, updated_at: now,
          };
          state.reportWrites += 1;
          const saved = occurrence(item, body.local_date, body.local_time);
          state.receipts[receiptKey] = { body: config.body, etag: headers['if-match'], data: structuredClone(saved), status: 200 };
          if (state.loseReports-- > 0) throw new TypeError('Synthetic lost answer after saving the dose note');
          return reply(saved);
        }
      }
      state.unexpected.push(`${method} ${url.pathname}${url.search}`);
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, { accountId, instructionId, today, options });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(() => window.renderCareFixture());
  await page.getByRole('heading', { name: options.denyAccount ? 'Medicines unavailable' : 'Medicines', exact: true }).waitFor();
  return { page, outbound, errors };
}

const card = (page, label = seedLabel) => page.getByRole('main').getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
const morning = page => card(page).filter({ has: page.getByText('08:00', { exact: true }) });
const editor = page => page.getByRole('form', { name: 'Add a medicine', exact: true });

async function medicines(page) {
  await page.getByRole('button', { name: 'My medicines', exact: true }).click();
  await page.getByRole('heading', { name: 'Current medicines', exact: true }).waitFor();
  await card(page).waitFor();
}

async function fillInstruction(page) {
  const form = editor(page);
  await form.getByLabel('Medicine name', { exact: true }).fill('  Synthetic   capsule  ');
  await form.getByLabel('Strength (optional)', { exact: true }).fill(' 10 mg ');
  await form.getByLabel('Form (optional)', { exact: true }).fill('capsule');
  await form.getByLabel('Dose', { exact: true }).fill(' One   synthetic capsule ');
  await form.getByLabel('Instructions as written (optional)', { exact: true }).fill('  Synthetic instructions.\nCopied from the label.  ');
  await form.getByRole('combobox', { name: 'Source', exact: true }).selectOption('package_label');
  await form.getByLabel('Time 1', { exact: true }).fill('20:00');
  await form.getByRole('button', { name: 'Add a time', exact: true }).click();
  await form.getByLabel('Time 2', { exact: true }).fill('08:00');
  await form.getByRole('combobox', { name: 'Time zone', exact: true }).selectOption('UTC');
  await form.getByLabel('First day', { exact: true }).fill(today);
  await form.getByLabel('Last day (optional)', { exact: true }).fill('2026-10-31');
  return form;
}

async function posts(page, route = '/api/care/instructions') {
  return page.evaluate(route => window.careFixture.calls.filter(call => call.method === 'POST' && call.route === route), route);
}

function assertKey(call) {
  assert.deepEqual(Object.keys(call.headers).filter(name => name.toLowerCase() === 'idempotency-key'), ['idempotency-key']);
  assert.match(call.headers['idempotency-key'], uuid);
  assert.equal(call.headers['x-account-id'], accountId);
}

async function assertOffline({ page, outbound, errors }) {
  assert.deepEqual(outbound, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.careFixture.unexpected), []);
}

async function assertFits(page, state) {
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('main');
    return { viewport: innerWidth, page: document.documentElement.scrollWidth, main: main.scrollWidth, mainWidth: main.clientWidth };
  });
  assert.ok(dimensions.page <= dimensions.viewport, `${state} overflows the viewport: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.main <= dimensions.mainWidth, `${state} overflows the care screen: ${JSON.stringify(dimensions)}`);
}

test('care: the day plan renders simulated doses and navigates dates without network', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await morning(page).getByText('Not noted', { exact: true }).waitFor();
    assert.equal(await card(page).count(), 2);
    assert.equal(await morning(page).getByText('One synthetic tablet', { exact: true }).count(), 1);
    await card(page).filter({ has: page.getByText('20:00', { exact: true }) }).getByText('You can note this dose from one hour before its time.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Thursday, October 1, 2026 (today)', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await page.getByRole('heading', { name: 'Friday, October 2, 2026', exact: true }).waitFor();
    await page.waitForFunction(() => window.careFixture.servedDay.local_date === '2026-10-02');
    assert.equal(await page.getByRole('main').getByRole('button', { name: 'Taken', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await morning(page).getByRole('button', { name: 'Taken', exact: true }).waitFor();
    const calls = await page.evaluate(() => window.careFixture.calls);
    assert.ok(calls.some(call => call.route === '/api/care/day' && call.query === '?date=2026-10-02'));
    assert.ok(calls.some(call => call.route === '/api/notifications'));
    assert.equal(calls.filter(call => call.method !== 'GET').length, 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: day, medicine list, stop confirmation and form fit 320 px at 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'UTC', locale: 'en-US' });
  try {
    const result = await fixture(context, { longText: true });
    const { page } = result;
    await page.getByText(`Synthetic ${'A'.repeat(110)} 5 mg (tablet)`, { exact: true }).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const originalTextSize = await page.getByRole('main').locator('strong').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    for (const width of [1440, 320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await assertFits(page, `Day plan at ${width} px`);
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html{font-size:200%}body{font-size:1rem}' });
    const enlargedTextSize = await page.getByRole('main').locator('strong').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.equal(enlargedTextSize, originalTextSize * 2, 'The care text must actually be twice its normal size.');
    await assertFits(page, 'Day plan at 320 px / 200% text');
    await page.getByRole('button', { name: 'My medicines', exact: true }).click();
    await page.getByRole('button', { name: 'Stop tracking', exact: true }).waitFor();
    await assertFits(page, 'Medicine list at 320 px / 200% text');
    await page.getByRole('button', { name: 'Stop tracking', exact: true }).click();
    await page.getByRole('group', { name: 'Confirm stop', exact: true }).waitFor();
    await assertFits(page, 'Stop confirmation at 320 px / 200% text');
    await page.getByRole('button', { name: 'Keep it', exact: true }).click();
    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    await editor(page).waitFor();
    await assertFits(page, 'Medicine form at 320 px / 200% text');
    assert.equal(await editor(page).evaluate(element => element.scrollWidth <= element.clientWidth), true, 'The form must not clip overflowing fields.');
    assert.equal(await page.evaluate(() => window.careFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: creation requires confirmation and retries the exact reviewed body with one key', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { loseCreates: 1 });
    const { page } = result;
    await medicines(page);
    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    const form = await fillInstruction(page);
    await form.getByRole('button', { name: 'Save medicine', exact: true }).click();
    await form.getByRole('alert').getByText('Confirm that these details match your instructions.', { exact: true }).waitFor();
    assert.equal((await posts(page)).length, 0);
    await form.getByRole('checkbox', { name: 'I checked these details against my instructions and they are correct.', exact: true }).check();
    await form.getByRole('button', { name: 'Save medicine', exact: true }).click();
    await form.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.match(await form.getByRole('alert').innerText(), /not confirmed/);
    for (const field of await form.locator('input, select, textarea').all()) assert.equal(await field.isDisabled(), true);
    assert.equal(await card(page, newLabel).count(), 0, 'A lost answer must not add a confirmed card.');
    assert.equal(await page.locator('.message.success').count(), 0);
    const first = await posts(page);
    assert.equal(first.length, 1);
    assertKey(first[0]);
    assert.deepEqual(first[0].body, reviewedBody);
    assert.equal(await page.evaluate(() => window.careFixture.createWrites), 1, 'The fixture saved the instruction before losing the answer.');
    await form.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => window.careFixture.calls.filter(call => call.method === 'POST' && call.route === '/api/care/instructions').length === 2);
    const sent = await posts(page);
    assertKey(sent[1]);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key'], 'Retry must reuse the stored create key.');
    assert.equal(sent[1].rawBody, sent[0].rawBody, 'Retry must send the identical reviewed body.');
    assert.deepEqual(sent[1].body, reviewedBody);
    await form.waitFor({ state: 'detached' });
    await card(page, newLabel).waitFor();
    assert.equal(await card(page, newLabel).count(), 1);
    assert.equal(await page.evaluate(() => window.careFixture.instructions.filter(item => item.medicine_name === 'Synthetic capsule').length), 1);
    assert.equal(await page.evaluate(() => window.careFixture.createWrites), 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a rejected creation stays unconfirmed and does not add a medicine', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { rejectCreates: true });
    const { page } = result;
    await medicines(page);
    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    const form = await fillInstruction(page);
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Save medicine', exact: true }).click();
    await form.getByRole('alert').getByText('Synthetic instruction was refused.', { exact: true }).waitFor();
    assert.equal(await form.getByRole('button', { name: 'Save medicine', exact: true }).isEnabled(), true);
    assert.equal(await form.getByLabel('Medicine name', { exact: true }).isEnabled(), true);
    assert.equal(await card(page, newLabel).count(), 0);
    assert.equal(await card(page).count(), 1);
    assert.equal(await page.locator('.message.success').count(), 0);
    assert.equal(await page.evaluate(() => window.careFixture.createWrites), 0);
    assert.deepEqual((await posts(page))[0].body, reviewedBody);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: stopping requires confirmation and sends the displayed version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await medicines(page);
    const shown = await page.evaluate(() => window.careFixture.servedLists.active[0]);
    await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).click();
    const confirmation = card(page).getByRole('group', { name: 'Confirm stop', exact: true });
    await confirmation.waitFor();
    assert.match(await confirmation.innerText(), /does not tell you to stop taking it/);
    assert.equal((await posts(page, `/api/care/instructions/${instructionId}/stop`)).length, 0);
    await confirmation.getByRole('button', { name: 'Keep it', exact: true }).click();
    await confirmation.waitFor({ state: 'detached' });
    assert.equal((await posts(page, `/api/care/instructions/${instructionId}/stop`)).length, 0);
    await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Yes, stop tracking', exact: true }).click();
    await page.waitForFunction(() => window.careFixture.calls.some(call => call.route.endsWith('/stop')));
    const sent = await posts(page, `/api/care/instructions/${instructionId}/stop`);
    assert.equal(sent.length, 1);
    assertKey(sent[0]);
    assert.equal(sent[0].headers['if-match'], shown.etag, 'Stopping must name the displayed instruction version.');
    assert.deepEqual(sent[0].body, {});
    await page.getByText('No current medicines. Add one exactly as written on your instructions.', { exact: true }).waitFor();
    assert.equal(await card(page).count(), 0);
    await page.getByRole('button', { name: 'Stopped', exact: true }).click();
    await card(page).waitFor();
    assert.match(await card(page).innerText(), /Stopped /);
    assert.equal(await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.careFixture.stopWrites), 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a stale stop is refused until the current instruction is reviewed', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await medicines(page);
    await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).click();
    await page.evaluate(() => Object.assign(window.careFixture.instructions[0], { dose: 'Two synthetic tablets', version: 2, etag: '"instruction-2"' }));
    await card(page).getByRole('button', { name: 'Yes, stop tracking', exact: true }).click();
    await card(page).getByRole('alert').getByText(/This medicine changed since you reviewed it/).waitFor();
    const refused = await posts(page, `/api/care/instructions/${instructionId}/stop`);
    assert.equal(refused.length, 1);
    assert.equal(refused[0].headers['if-match'], '"instruction-1"');
    assert.equal(await page.evaluate(() => window.careFixture.instructions[0].status), 'active');
    assert.equal(await page.evaluate(() => window.careFixture.stopWrites), 0);
    assert.match(await card(page).innerText(), /One synthetic tablet/);
    assert.doesNotMatch(await card(page).innerText(), /Stopped /);
    assert.equal(await page.locator('.message.success').count(), 0);
    await card(page).getByRole('button', { name: 'Reload list', exact: true }).click();
    await card(page).getByText('Two synthetic tablets', { exact: true }).waitFor();
    await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).click();
    await card(page).getByRole('button', { name: 'Yes, stop tracking', exact: true }).click();
    await page.getByText('No current medicines. Add one exactly as written on your instructions.', { exact: true }).waitFor();
    const sent = await posts(page, `/api/care/instructions/${instructionId}/stop`);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].headers['if-match'], '"instruction-2"');
    assert.notEqual(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a lost stop answer stays unconfirmed and Retry stop uses the same key and version', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { loseStops: 1 });
    const { page } = result;
    await medicines(page);
    await card(page).getByRole('button', { name: 'Stop tracking', exact: true }).click();
    await card(page).getByRole('button', { name: 'Yes, stop tracking', exact: true }).click();
    await card(page).getByRole('button', { name: 'Retry stop', exact: true }).waitFor();
    assert.match(await card(page).getByRole('alert').innerText(), /not confirmed/);
    assert.doesNotMatch(await card(page).innerText(), /Stopped /);
    assert.equal(await page.evaluate(() => window.careFixture.instructions[0].status), 'stopped');
    assert.equal(await page.locator('.message.success').count(), 0);
    await card(page).getByRole('button', { name: 'Retry stop', exact: true }).click();
    await page.waitForFunction(() => window.careFixture.calls.filter(call => call.route.endsWith('/stop')).length === 2);
    const sent = await posts(page, `/api/care/instructions/${instructionId}/stop`);
    assert.equal(sent.length, 2);
    sent.forEach(assertKey);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    assert.equal(sent[0].headers['if-match'], '"instruction-1"');
    assert.equal(sent[1].headers['if-match'], sent[0].headers['if-match']);
    assert.equal(sent[1].rawBody, sent[0].rawBody);
    await page.getByText('No current medicines. Add one exactly as written on your instructions.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.careFixture.stopWrites), 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: reporting and changing a dose note send the displayed version without a confirmation dialog', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await morning(page).getByText('Not noted', { exact: true }).waitFor();
    const shown = await page.evaluate(() => window.careFixture.servedDay.occurrences.find(item => item.local_time === '08:00'));
    await morning(page).getByRole('button', { name: 'Taken', exact: true }).click();
    await page.waitForFunction(() => window.careFixture.calls.some(call => call.route.endsWith('/reports')));
    const first = await posts(page, `/api/care/instructions/${instructionId}/reports`);
    assert.equal(first.length, 1);
    assertKey(first[0]);
    assert.equal(first[0].headers['if-match'], shown.etag);
    assert.deepEqual(first[0].body, { local_date: today, local_time: '08:00', outcome: 'taken' });
    await morning(page).getByText('You noted: Taken', { exact: true }).waitFor();
    assert.equal(await morning(page).getByRole('button', { name: 'Taken', exact: true }).isDisabled(), true);
    assert.equal(await morning(page).getByRole('button', { name: 'Taken', exact: true }).getAttribute('aria-pressed'), 'true');
    const updated = await page.evaluate(() => window.careFixture.servedDay.occurrences.find(item => item.local_time === '08:00'));
    assert.notEqual(updated.etag, shown.etag);
    await morning(page).getByRole('button', { name: 'Change to Skipped', exact: true }).click();
    await morning(page).getByText('You noted: Skipped', { exact: true }).waitFor();
    const sent = await posts(page, `/api/care/instructions/${instructionId}/reports`);
    assert.equal(sent.length, 2);
    assertKey(sent[1]);
    assert.equal(sent[1].headers['if-match'], updated.etag);
    assert.deepEqual(sent[1].body, { local_date: today, local_time: '08:00', outcome: 'skipped' });
    assert.notEqual(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    assert.equal(await page.evaluate(() => window.careFixture.reportWrites), 2);
    assert.deepEqual(dialogs, []);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a lost dose-report answer stays unconfirmed and retries one note', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { loseReports: 1 });
    const { page } = result;
    await morning(page).getByRole('button', { name: 'Taken', exact: true }).click();
    await morning(page).getByRole('alert').getByText(/Choose Taken again to retry/).waitFor();
    assert.match(await morning(page).getByRole('alert').innerText(), /not confirmed/);
    assert.equal(await morning(page).getByText('Not noted', { exact: true }).count(), 1);
    assert.equal(await morning(page).getByText('You noted: Taken', { exact: true }).count(), 0);
    assert.equal(await morning(page).getByRole('button', { name: 'Taken', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => Object.values(window.careFixture.reports)[0].outcome), 'taken');
    await morning(page).getByRole('button', { name: 'Taken', exact: true }).click();
    await page.waitForFunction(() => window.careFixture.calls.filter(call => call.route.endsWith('/reports')).length === 2);
    const sent = await posts(page, `/api/care/instructions/${instructionId}/reports`);
    assert.equal(sent.length, 2);
    sent.forEach(assertKey);
    assert.equal(sent[1].headers['idempotency-key'], sent[0].headers['idempotency-key']);
    assert.equal(sent[1].headers['if-match'], sent[0].headers['if-match']);
    assert.equal(sent[1].rawBody, sent[0].rawBody);
    assert.deepEqual(sent[0].body, { local_date: today, local_time: '08:00', outcome: 'taken' });
    await morning(page).getByText('You noted: Taken', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.careFixture.reportWrites), 1);
    assert.equal(await page.evaluate(() => Object.values(window.careFixture.reports)[0].revision), 1);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a rejected dose report leaves the last confirmed note unchanged', async () => {
  for (const reportOutcome of [null, 'skipped']) {
    const context = await browser.newContext({ timezoneId: 'UTC' });
    try {
      const result = await fixture(context, { reportOutcome, rejectReports: true });
      const { page } = result;
      const status = reportOutcome ? 'You noted: Skipped' : 'Not noted';
      await morning(page).getByText(status, { exact: true }).waitFor();
      await morning(page).getByRole('button', { name: reportOutcome ? 'Change to Taken' : 'Taken', exact: true }).click();
      await morning(page).getByRole('alert').getByText('Synthetic dose note was refused.', { exact: true }).waitFor();
      assert.equal(await morning(page).getByText(status, { exact: true }).count(), 1);
      assert.equal(await morning(page).getByText('You noted: Taken', { exact: true }).count(), 0);
      assert.equal(await morning(page).getByRole('button', { name: reportOutcome ? 'Change to Taken' : 'Taken', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => window.careFixture.reportWrites), 0);
      assert.equal(await page.evaluate(() => Object.values(window.careFixture.reports)[0]?.outcome ?? null), reportOutcome);
      assert.equal(await page.locator('.message.success').count(), 0);
      await assertOffline(result);
    } finally { await context.close(); }
  }
});

test('care: dose alerts change only after confirmation and failed saves keep the shown setting', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await medicines(page);
    const checkbox = card(page).getByRole('checkbox', { name: 'Alert me in this app at these times', exact: true });
    await checkbox.waitFor();
    assert.equal(await checkbox.isChecked(), false);
    await checkbox.check();
    await page.waitForFunction(() => document.querySelector('input[name="care_dose_alert"]').checked);
    assert.equal(await page.evaluate(id => window.careFixture.alerts[id], instructionId), true);
    await page.evaluate(() => { window.careFixture.rejectAlerts = true; });
    await checkbox.click();
    await card(page).getByRole('alert').getByText('Synthetic alert setting was refused.', { exact: true }).waitFor();
    assert.equal(await checkbox.isChecked(), true);
    assert.equal(await page.evaluate(id => window.careFixture.alerts[id], instructionId), true);
    const sent = await posts(page, `/api/care/instructions/${instructionId}/alerts`);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map(call => call.body), [{ enabled: true }, { enabled: false }]);
    assert.equal(await page.locator('.message.success').count(), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: denied care reads remove previously displayed protected content', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context);
    const { page } = result;
    await morning(page).getByText('Not noted', { exact: true }).waitFor();
    await page.evaluate(() => { window.careFixture.denyCare = true; window.dispatchEvent(new Event('visibilitychange')); });
    const problem = page.getByRole('main').getByRole('alert').filter({ hasText: 'Synthetic care access is unavailable.' });
    await problem.waitFor();
    assert.equal(await card(page).count(), 0);
    assert.equal(await page.getByRole('main').getByRole('button', { name: 'Taken', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'My medicines', exact: true }).click();
    await problem.waitFor();
    assert.equal(await card(page).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Stop tracking', exact: true }).count(), 0);
    await page.evaluate(() => { window.careFixture.denyCare = false; });
    await problem.getByRole('button', { name: 'Retry', exact: true }).click();
    await card(page).waitFor();
    assert.equal(await page.evaluate(() => window.careFixture.calls.filter(call => call.method !== 'GET').length), 0);
    await assertOffline(result);
  } finally { await context.close(); }
});

test('care: a denied account shows unavailable without reading private care data', async () => {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  try {
    const result = await fixture(context, { denyAccount: true });
    const { page } = result;
    await page.getByRole('main').getByRole('alert').getByText('Synthetic account access is unavailable.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Medicines view', exact: true }).count(), 0);
    assert.equal(await card(page).count(), 0);
    const calls = await page.evaluate(() => window.careFixture.calls);
    assert.equal(calls.filter(call => call.route.startsWith('/api/care/') || call.route === '/api/me/care-alerts').length, 0);
    await assertOffline(result);
  } finally { await context.close(); }
});
