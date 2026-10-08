import assert from 'node:assert/strict';
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
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const invitationId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const { messages: { dictionaries } } = loadMessages();
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Providers } from './src/app/providers';
        import { InvitationInbox } from './src/features/spaces/invitations';
        import './src/app/globals.css';
        const root = createRoot(document.getElementById('root'));
        root.render(<Providers language={window.invitationRecovery.language}><main><InvitationInbox user={window.invitationRecovery.user} /></main></Providers>);`,
      resolveDir: web, sourcefile: 'offline-invitation-recovery.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-invitation-recovery.js'), loader: { '.otf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'local-fonts', setup(builder) {
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  browser = await chromium.launch({ executablePath: process.env.COMMUNITY_CHROMIUM_PATH, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(context, failure, language = 'en') {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, spaceId, invitationId, failure, language }) => {
    const state = window.invitationRecovery = {
      user: { id: accountId, display_name: 'Synthetic recipient', email: 'recipient@example.test', timezone: 'UTC', email_verified: true, version: 1 },
      invitation: { id: invitationId, space_id: spaceId, space_name: 'Synthetic family', inviter_name: 'Synthetic owner',
        recipient_account_id: accountId, role: 'member', status: 'pending', created_at: '2026-10-07T06:00:00Z', expires_at: '2026-10-20T06:00:00Z' },
      attempts: [], writes: 0, admissions: 0, failure, language, readFailure: null, refusal: null,
    };
    const reply = data => Response.json({ data, request_id: 'synthetic-recovery', pagination: { next_cursor: null, has_more: false } });
    window.fetch = async (input, options = {}) => {
      const route = new URL(String(input), 'https://offline.example.test').pathname;
      const method = options.method ?? 'GET';
      if (method === 'GET' && route === '/api/invitations') {
        if (state.readFailure) return Response.json({ error: { code: 'NOT_FOUND', message: 'Invitation inbox unavailable.' } }, { status: state.readFailure });
        return reply(state.invitation.status === 'pending' ? [state.invitation] : []);
      }
      const decision = route.match(/^\/api\/invitations\/([^/]+)\/(accept|decline)$/);
      if (method !== 'POST' || !decision || decision[1] !== invitationId) throw new Error(`Unexpected request: ${method} ${route}`);
      state.attempts.push({ route, body: JSON.parse(options.body), account: options.headers['X-Account-ID'] });
      if (state.refusal) return Response.json({ error: { code: 'INVITATION_CLOSED', message: 'The invitation is closed.' } }, { status: state.refusal });
      const status = decision[2] === 'accept' ? 'accepted' : 'declined';
      if (state.invitation.status === 'pending') {
        state.invitation.status = status;
        state.writes += 1;
        if (status === 'accepted') state.admissions += 1;
      }
      const data = status === 'accepted'
        ? { id: spaceId, name: 'Synthetic family', space_type: 'family', visibility: 'private', status: 'active', role: 'member', version: '2', created_at: state.invitation.created_at }
        : { id: invitationId, status: 'declined' };
      if (state.attempts.length === 1) {
        if (state.failure === 'lost') throw new TypeError('Synthetic response lost after commit');
        if (state.failure === 'mismatched') return reply({ ...data, id: accountId });
      }
      return reply(data);
    };
  }, { accountId, spaceId, invitationId, failure, language });
  await page.addScriptTag({ content: javascript });
  await page.getByRole('listitem').waitFor();
  return { page, outbound, errors };
}

async function chooseDecision(page, action) {
  if (action === 'accept') {
    await page.getByRole('button', { name: 'Review invitation', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Join Space', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Decline invitation to Synthetic family', exact: true }).click();
  }
}

async function loseDecision(page, action, failure) {
  await chooseDecision(page, action);
  const message = failure === 'lost' ? 'No connection. Your changes are not confirmed.' : 'The invitation decision could not be confirmed.';
  const container = action === 'accept' ? page.getByRole('dialog') : page.getByRole('main');
  await container.getByRole('alert').filter({ hasText: message }).waitFor();
  if (action === 'accept') await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
}

for (const action of ['accept', 'decline']) for (const failure of ['lost', 'mismatched']) {
  test(`${action}: an unconfirmed ${failure} decision can be retried after a refresh removes its invitation`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, failure);
      await loseDecision(page, action, failure);
      await page.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
      await page.getByText('No pending invitations.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('listitem').count(), 0);
      const retry = page.getByRole('button', { name: 'Retry original decision', exact: true });
      assert.equal(await retry.count(), 1, 'The decision must remain retryable even when the pending list is empty.');
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const box = await retry.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await retry.click();
      await page.getByText(action === 'accept' ? 'Joined Synthetic family.' : 'Invitation declined.', { exact: true }).waitFor();
      const state = await page.evaluate(() => ({
        attempts: window.invitationRecovery.attempts, writes: window.invitationRecovery.writes, admissions: window.invitationRecovery.admissions,
      }));
      assert.equal(state.attempts.length, 2);
      assert.deepEqual(state.attempts[1], state.attempts[0]);
      assert.equal(state.attempts[0].account, accountId);
      assert.deepEqual(state.attempts[0].body, {});
      assert.equal(state.writes, 1);
      assert.equal(state.admissions, action === 'accept' ? 1 : 0);
      assert.equal(await retry.count(), 0);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const status of [403, 404, 503]) {
  test(`an unconfirmed decision stays hidden while the inbox read fails with ${status}`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, 'lost');
      await loseDecision(page, 'decline', 'lost');
      await page.evaluate(status => { window.invitationRecovery.readFailure = status; }, status);
      await page.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Invitation inbox unavailable.' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Retry original decision', exact: true }).count(), 0);
      assert.equal(await page.getByText('Synthetic family', { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.invitationRecovery.attempts.length), 1);
      await page.evaluate(() => { window.invitationRecovery.readFailure = null; });
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText('No pending invitations.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Retry original decision', exact: true }).click();
      await page.getByText('Invitation declined.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.invitationRecovery.writes), 1);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const action of ['accept', 'decline']) for (const status of [409, 410]) {
  test(`${action}: a known ${status} refusal does not offer an unknown-outcome retry`, async () => {
    const context = await browser.newContext();
    try {
      const { page, outbound, errors } = await fixture(context, 'lost');
      await page.evaluate(status => {
        window.invitationRecovery.refusal = status;
        window.invitationRecovery.invitation.status = status === 409 ? 'revoked' : 'expired';
      }, status);
      await chooseDecision(page, action);
      await page.getByRole('alert').filter({ hasText: 'The invitation is closed.' }).waitFor();
      await page.getByText('No pending invitations.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Retry original decision', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.invitationRecovery.writes), 0);
      assert.equal(await page.evaluate(() => window.invitationRecovery.admissions), 0);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

for (const language of ['te', 'hi']) {
  test(`the original-decision retry is localized and fits 320px/200% text in ${language}`, async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const { page, outbound, errors } = await fixture(context, 'lost', language);
      const text = dictionaries[language];
      await page.getByRole('button', { name: text['spaces.invitations.declineFor'].replace('{name}', 'Synthetic family'), exact: true }).click();
      await page.getByRole('alert').waitFor();
      await page.getByRole('button', { name: text['spaces.invitations.refresh'], exact: true }).click();
      await page.getByText(text['spaces.invitations.none'], { exact: true }).waitFor();
      const retry = page.getByRole('button', { name: text['spaces.invitations.retryDecision'], exact: true });
      await retry.waitFor();
      await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await retry.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      const box = await retry.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await retry.click();
      await page.getByText(text['spaces.invitations.declined'], { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.invitationRecovery.writes), 1);
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
