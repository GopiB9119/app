// DEC-051, T216: search inside your Spaces, live against the local API and the web preview at http://127.0.0.1:3000.
// Two synthetic accounts in one browser each. Alex changes things through the API while Sam has a search open.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.COMMUNITY_WEB_URL ?? 'http://127.0.0.1:3000';
const mail = process.env.COMMUNITY_MAIL_URL ?? 'http://127.0.0.1:8025';
const password = 'Synthetic-Meadow-49!';
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.COMMUNITY_CHROMIUM_PATH, headless: true });
  await mkdir(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function mailCode(email) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await fetch(`${mail}/api/v1/messages`).then(response => response.json());
    const message = result.messages.find(entry => entry.To.some(recipient => recipient.Address === email) && entry.Subject.includes('registration'));
    if (message) {
      const detail = await fetch(`${mail}/api/v1/message/${message.ID}`).then(response => response.json());
      return detail.Text.match(/code is (\d{6})/)[1];
    }
    await delay(200);
  }
  throw new Error('Synthetic verification email did not arrive.');
}

async function signUp(page, email, name) {
  await page.goto(`${base}/register`);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByRole('heading', { name: 'Complete your account' }).waitFor();
  await page.getByLabel('Verification code').fill(await mailCode(email));
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

async function blockOutside(context, external) {
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
}

test('search: a second person sees changes in an open search at once, opens the exact item and loses a Space cleanly (DEC-051)', { timeout: 300000 }, async () => {
  const external = [];
  const errors = [];
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await blockOutside(ownerContext, external);
    await blockOutside(memberContext, external);
    const ownerPage = await ownerContext.newPage();
    const page = await memberContext.newPage();
    for (const opened of [ownerPage, page]) opened.on('pageerror', error => errors.push(error.message));
    const suffix = Date.now();
    await signUp(ownerPage, `search-owner-${suffix}@example.test`, 'Alex Morgan');
    await signUp(page, `search-member-${suffix}@example.test`, 'Sam Rivera');
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const write = async (path, data) => {
      const response = await ownerContext.request.post(`${base}/api/${path}`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data });
      assert.equal(response.status(), 201, `${path}: ${await response.text()}`);
      return (await response.json()).data;
    };

    const family = await write('spaces', { name: `Search family ${suffix}`, space_type: 'family' });
    const invitation = await write(`spaces/${family.id}/invitations`, { recipient_account_id: member.id });
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${invitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);
    await write(`spaces/${family.id}/documents`, { name: 'insurance_policy.txt', content: 'Insurance policy number 7731\nRenewal date 2026-10-04\n' });

    // Sam finds the document by a part of its file name and by a part of the date inside it, with the matches marked.
    let searches = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/search') searches += 1; });
    const live = page.waitForResponse(response => new URL(response.url()).pathname === '/api/live' && response.status() === 200, { timeout: 60000 });
    await page.goto(`${base}/app/search`);
    const field = page.getByLabel('Search your Spaces', { exact: true });
    const run = async text => {
      await field.fill(text);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByRole('heading', { name: `Results for \u201c${text}\u201d`, level: 2 }).waitFor();
    };
    await run('policy');
    const documents = () => page.getByRole('region', { name: /^Documents \(/ });
    await documents().getByRole('link', { name: 'insurance_policy.txt', exact: true }).waitFor();
    assert.deepEqual(await documents().getByRole('link', { name: 'insurance_policy.txt', exact: true }).locator('mark').allTextContents(), ['policy']);
    await run('10');
    await documents().getByRole('link', { name: 'insurance_policy.txt', exact: true }).waitFor();
    assert.ok((await documents().locator('mark').allTextContents()).includes('10'), 'The 10 of 2026-10-04 is marked.');

    // Back to the first words. Sam types more without searching, then Alex adds a task and an event.
    await run('policy');
    await live;
    await delay(2000);
    await field.fill('policy draft');
    const tasks = () => page.getByRole('region', { name: /^Tasks \(/ });
    const events = () => page.getByRole('region', { name: /^Events \(/ });
    const task = await write('tasks', { space_id: family.id, title: 'Renew the policy', description: 'Call the broker', due_date: '2026-10-04', assignee_account_id: owner.id });
    await tasks().getByRole('link', { name: 'Renew the policy', exact: true }).waitFor({ timeout: 20000 });
    await page.locator('[role="status"]').filter({ hasText: 'Results updated.' }).waitFor({ timeout: 20000 });
    assert.equal(await field.inputValue(), 'policy draft', 'What Sam was typing stays.');
    assert.equal(await page.evaluate(() => document.activeElement?.id.endsWith('-q') === true), true, 'Focus stays in the field; it never jumps to the results.');
    const event = await write(`spaces/${family.id}/events`, {
      title: 'Policy review call', description: '', location: 'Phone', timezone: 'Asia/Kolkata', local_start: '2027-03-15T10:00', local_end: null,
    });
    await events().getByRole('link', { name: 'Policy review call', exact: true }).waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/t216-search-live-desktop.png'), fullPage: true });

    // A change that no longer matches takes its result away by itself.
    const renamed = await ownerContext.request.get(`${base}/api/tasks/${task.id}`, { headers: ownerHeaders });
    assert.equal(renamed.status(), 200);
    const cancelled = await ownerContext.request.post(`${base}/api/tasks/${task.id}/status`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': renamed.headers().etag }, data: { status: 'cancelled' },
    });
    assert.equal(cancelled.status(), 200, await cancelled.text());
    await tasks().getByText('Cancelled', { exact: false }).first().waitFor({ timeout: 20000 });

    // The task and the event open as themselves.
    await tasks().getByRole('link', { name: 'Renew the policy', exact: true }).click();
    await page.waitForURL(new RegExp(`/app/tasks\\?space_id=${family.id}&task_id=${task.id}`));
    const row = page.locator(`#task-${task.id}`);
    await row.waitFor();
    assert.equal(await row.getAttribute('aria-current'), 'location');
    await row.getByText('Opened from search', { exact: true }).waitFor();
    await page.waitForFunction(id => document.activeElement?.closest('li')?.id === `task-${id}`, task.id);
    await page.goBack();
    await page.getByRole('heading', { name: /^Results for /, level: 2 }).waitFor();
    await events().getByRole('link', { name: 'Policy review call', exact: true }).click();
    await page.waitForURL(new RegExp(`/app/events\\?space_id=${family.id}&event_id=${event.id}`));
    await page.getByRole('heading', { name: 'Policy review call', exact: true, level: 2 }).waitFor();
    await page.waitForFunction(() => document.activeElement?.tagName === 'H2' && document.activeElement.textContent === 'Policy review call');
    await page.goBack();
    await page.getByRole('heading', { name: /^Results for /, level: 2 }).waitFor();

    // Many more documents: the first twenty show, and Show more reaches the rest, all on Sam's open search.
    for (let index = 1; index <= 22; index += 1) await write(`spaces/${family.id}/documents`, { name: `policy-note-${index}.txt`, content: `Policy note ${index}\n` });
    await page.getByRole('heading', { name: 'Documents (20+)', exact: true, level: 3 }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Show more documents', exact: true }).click();
    await page.getByRole('heading', { name: 'Documents (23)', exact: true, level: 3 }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Show more documents', exact: true }).count(), 0);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t216-search-more-desktop.png'), fullPage: true });

    // Losing the Space the search is limited to: the filter goes, Sam is told, and nothing of that Space is left.
    await page.getByLabel('Space', { exact: true }).selectOption(family.id);
    await run('policy');
    const roster = (await (await ownerContext.request.get(`${base}/api/spaces/${family.id}/members`, { headers: ownerHeaders })).json()).data;
    const reviewed = roster.find(item => item.account_id === member.id);
    const removed = await ownerContext.request.post(`${base}/api/spaces/${family.id}/members/${member.id}/remove`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': reviewed.etag }, data: {},
    });
    assert.equal(removed.status(), 200, await removed.text());
    await page.getByText('That Space is no longer available to you. Showing all your Spaces.', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByLabel('Space', { exact: true }).inputValue(), '');
    await page.getByText('Nothing found in your Spaces.', { exact: true }).waitFor();
    assert.equal(await documents().count(), 0);
    // The search address no longer names the lost Space.
    assert.equal(new URL(page.url()).searchParams.has('space_id'), false);

    // Nothing scrolls sideways at 320 px, also at doubled text.
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Nothing scrolls sideways at 320 px.');
    await page.evaluate(() => { document.documentElement.style.fontSize = `${Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 2}px`; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Nothing scrolls sideways at 320 px and 200% text.');
    await page.screenshot({ path: path.join(root, '.local/screenshots/t216-search-lost-space-320-200.png'), fullPage: true });

    // Sam searched three times by hand; the other reads were made by the open search itself.
    assert.ok(searches >= 6, `Sam's search read the service again by itself (${searches} reads).`);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
