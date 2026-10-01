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
const mail = 'http://127.0.0.1:8025';
const password = 'Synthetic-Meadow-49!';
let browser;

before(async () => {
  browser = await chromium.launch({ executablePath: process.env.COMMUNITY_CHROMIUM_PATH, headless: true });
  await mkdir(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function mailCode(email, purpose = 'registration') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await fetch(`${mail}/api/v1/messages`).then(response => response.json());
    const message = result.messages.find(entry => entry.To.some(recipient => recipient.Address === email) && entry.Subject.includes(purpose));
    if (message) {
      const detail = await fetch(`${mail}/api/v1/message/${message.ID}`).then(response => response.json());
      const code = detail.Text.match(/code is (\d{6})/);
      assert.ok(code);
      return code[1];
    }
    await delay(200);
  }
  throw new Error('Synthetic verification email did not arrive.');
}

async function signUp(page, email) {
  await page.goto(`${base}/register`);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByRole('heading', { name: 'Complete your account' }).waitFor();
  const code = await mailCode(email);
  await page.getByLabel('Verification code').fill(code);
  await page.getByLabel('Display name', { exact: true }).fill('Alex Morgan');
  // These journeys compute times in Asia/Kolkata; sign-up now starts in the browser's zone (T54).
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

test('checklist: exact add retry assignee checking conflict reload and reviewed removal', { timeout: 120000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(page, `checklist-owner-${suffix}@example.test`);
    await signUp(memberPage, `checklist-member-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    async function create(route, data) {
      const response = await ownerContext.request.post(`${base}/api/${route}`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data });
      assert.equal(response.status(), 201, await response.text());
      return (await response.json()).data;
    }
    const space = await create('spaces', { name: 'Checklist family', space_type: 'family' });
    const invite = await create(`spaces/${space.id}/invitations`, { recipient_account_id: member.id });
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${invite.id}/accept`, { headers: { Origin: base, 'X-Account-ID': member.id }, data: {} })).status(), 200);
    const task = await create('tasks', { space_id: space.id, title: 'Shopping checklist', description: '', assignee_account_id: member.id, due_date: null });
    const sourceUrl = `${base}/api/tasks/${task.id}/checklist`;
    await page.goto(`${base}/app/tasks?space_id=${space.id}`);
    await page.getByRole('button', { name: 'Checklist: Shopping checklist', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Task checklist', exact: true });
    await dialog.getByLabel('New item', { exact: true }).fill('Buy fruit');
    const attempts = [];
    await page.route(`**/api/tasks/${task.id}/checklist`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postData() });
      const response = await route.fetch(); assert.equal(response.status(), 200);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel('New item', { exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Retry original change', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Buy fruit', exact: true }).waitFor();
    assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]);
    await page.unroute(`**/api/tasks/${task.id}/checklist`);
    await memberPage.goto(`${base}/app/tasks?space_id=${space.id}`);
    await memberPage.getByRole('button', { name: 'Checklist: Shopping checklist', exact: true }).click();
    const memberDialog = memberPage.getByRole('dialog', { name: 'Task checklist', exact: true });
    await memberDialog.getByRole('checkbox', { name: 'Buy fruit', exact: true }).click();
    await memberDialog.getByText('Checklist saved.', { exact: true }).waitFor();
    assert.equal(await memberDialog.getByRole('checkbox', { name: 'Buy fruit', exact: true }).isChecked(), true);
    assert.equal(await memberDialog.getByRole('button', { name: 'Add item', exact: true }).count(), 0);
    assert.equal(await memberDialog.getByRole('button', { name: /^Remove checklist item:/ }).count(), 0);
    const checked = (await (await ownerContext.request.get(sourceUrl, { headers })).json()).data;
    assert.equal(checked.items[0].checked_by_account_id, member.id);
    assert.equal(checked.task_status, 'open');
    await dialog.getByLabel('New item', { exact: true }).fill('Stale draft');
    await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'changed' }).waitFor();
    assert.equal(await dialog.getByLabel('New item', { exact: true }).inputValue(), 'Stale draft');
    await dialog.getByRole('button', { name: 'Reload current checklist', exact: true }).click();
    await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('dialog input[type="checkbox"]')?.checked === true);
    await dialog.getByRole('button', { name: 'Edit checklist item: Buy fruit', exact: true }).click();
    await dialog.getByLabel('Item title', { exact: true }).fill('Buy fresh fruit and vegetables for the family dinner');
    await dialog.getByRole('button', { name: 'Save item', exact: true }).click();
    const renamed = dialog.getByRole('checkbox', { name: 'Buy fresh fruit and vegetables for the family dinner', exact: true });
    await renamed.waitFor(); assert.equal(await renamed.isChecked(), false);
    await page.screenshot({ path: path.join(root, '.local/screenshots/checklist-live-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1; });
      assert.equal(bounds, true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/checklist-live-mobile.png'), fullPage: true });
    await dialog.getByRole('button', { name: /^Remove checklist item:/ }).click();
    await dialog.getByRole('button', { name: 'Keep item', exact: true }).click();
    assert.equal((await (await ownerContext.request.get(sourceUrl, { headers })).json()).data.items.length, 1);
    await dialog.getByRole('button', { name: /^Remove checklist item:/ }).click();
    await dialog.getByRole('button', { name: 'Remove item', exact: true }).click();
    await dialog.getByText('No checklist items.', { exact: true }).waitFor();
    assert.equal((await (await ownerContext.request.get(sourceUrl, { headers })).json()).data.items.length, 0);
    assert.deepEqual(errors, []);
  } finally { await ownerContext.close(); await memberContext.close(); }
});

test('solo: private creation retry tasks settings and calendar work without membership controls', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(page, `solo-${Date.now()}@example.test`);
    const owner = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    await page.goto(`${base}/app/spaces`);
    await page.getByLabel('Space type', { exact: true }).selectOption('solo');
    await page.getByLabel('Space name', { exact: true }).fill('My private planning');
    const attempts = [];
    await page.route('**/api/spaces', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Create Space', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByLabel('Space type', { exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry creation', exact: true }).click();
    await page.getByText('Solo Space created.', { exact: true }).waitFor();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(JSON.parse(attempts[0].body).space_type, 'solo');
    await page.unroute('**/api/spaces');
    assert.equal(await page.getByRole('button', { name: /^Manage invitations for / }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Members of / }).count(), 0);
    const spaces = (await (await context.request.get(`${base}/api/spaces`, { headers })).json()).data;
    assert.equal(spaces.length, 1);
    const space = spaces[0];
    assert.equal(space.space_type, 'solo');
    await page.getByRole('button', { name: 'Settings for My private planning', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    await dialog.getByLabel('Space name', { exact: true }).fill('My personal workspace');
    await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
    await dialog.getByText('Settings saved. Current name: My personal workspace', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await page.getByRole('link', { name: 'Tasks for My personal workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'My tasks', exact: true }).waitFor();
    await page.getByLabel('Task title', { exact: true }).fill('Personal reading');
    await page.getByLabel('Due date', { exact: true }).fill('2026-11-02');
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page.getByText('Task created.', { exact: true }).waitFor();
    const tasks = (await (await context.request.get(`${base}/api/tasks?space_id=${space.id}`, { headers })).json()).data;
    assert.equal(tasks.length, 1);
    const preview = await context.request.post(`${base}/api/reminders/preview`, { headers, data: { task_id: tasks[0].id, local_time: '2026-11-02T10:00', timezone: 'UTC' } });
    assert.equal(preview.status(), 200);
    const saved = await context.request.post(`${base}/api/reminders`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { preview_token: (await preview.json()).data.options[0].preview_token } });
    assert.equal(saved.status(), 201);
    await page.goto(`${base}/app/calendar?space_id=${space.id}`);
    await page.getByLabel('Month', { exact: true }).fill('2026-11');
    await page.waitForFunction(() => document.querySelectorAll('li[data-kind]').length === 2);
    assert.equal(await page.getByLabel('Solo Space', { exact: true }).inputValue(), space.id);
    await page.screenshot({ path: path.join(root, '.local/screenshots/solo-calendar-live-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/app/spaces`);
    await page.getByRole('heading', { name: 'My personal workspace', exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/solo-space-live-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('space settings: owner rename retries exact intent and stale drafts require explicit reload', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(page, `settings-owner-${suffix}@example.test`);
    await signUp(memberPage, `settings-member-${suffix}@example.test`);
    const owner = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await context.request.post(`${base}/api/spaces`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Settings family', space_type: 'family' } });
    assert.equal(created.status(), 201);
    const space = (await created.json()).data;
    const settingsUrl = `${base}/api/spaces/${space.id}/settings`;
    const invite = await context.request.post(`${base}/api/spaces/${space.id}/invitations`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id } });
    assert.equal(invite.status(), 201);
    const accepted = await memberContext.request.post(`${base}/api/invitations/${(await invite.json()).data.id}/accept`, { headers: memberHeaders, data: {} });
    assert.equal(accepted.status(), 200);
    assert.equal((await memberContext.request.get(settingsUrl, { headers: memberHeaders })).status(), 404);
    await page.goto(`${base}/app/spaces`);
    await page.getByRole('button', { name: 'Settings for Settings family', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Space settings', exact: true });
    await dialog.getByLabel('Space name', { exact: true }).fill('Renamed family');
    const before = (await (await context.request.get(settingsUrl, { headers })).json()).data;
    const attempts = [];
    await page.route(`**/api/spaces/${space.id}/settings`, async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postData() });
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response: result });
    });
    await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Retry original name', exact: true }).click();
    await dialog.getByText('Settings saved. Current name: Renamed family', { exact: true }).waitFor();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    const saved = (await (await context.request.get(settingsUrl, { headers })).json()).data;
    assert.equal(Number(saved.version), Number(before.version) + 1);
    await page.unroute(`**/api/spaces/${space.id}/settings`);
    await dialog.getByLabel('Space name', { exact: true }).fill('My stale draft');
    const other = await context.request.patch(settingsUrl, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': saved.etag }, data: { name: 'Another current name' } });
    assert.equal(other.status(), 200);
    await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'This Space changed' }).waitFor();
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'My stale draft');
    assert.equal(await dialog.getByRole('button', { name: 'Save name', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Reload current settings', exact: true }).click();
    assert.equal(await dialog.getByLabel('Space name', { exact: true }).inputValue(), 'My stale draft');
    await dialog.getByRole('button', { name: 'Discard name', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[name="settings_name"]')?.value === 'Another current name');
    await dialog.getByLabel('Space name', { exact: true }).fill('Family name with a long description for a narrow settings screen');
    await page.screenshot({ path: path.join(root, '.local/screenshots/space-settings-live-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await dialog.evaluate(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, bottom: box.bottom, top: box.top, width: innerWidth, height: innerHeight }; });
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/space-settings-live-mobile.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.match(await dialog.getByLabel('Space name', { exact: true }).inputValue(), /long description/);
    await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
    await dialog.getByText('Settings saved.', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: 'Close Space settings', exact: true }).click();
    await page.reload();
    await page.getByRole('heading', { name: 'Family name with a long description for a narrow settings screen', exact: true }).waitFor();
    await memberPage.goto(`${base}/app/spaces`);
    await memberPage.getByRole('heading', { name: 'Family name with a long description for a narrow settings screen', exact: true }).waitFor();
    assert.equal(await memberPage.getByRole('button', { name: /^Settings for / }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); await memberContext.close(); }
});

test('calendar: real private agenda preserves dates, zones, source access and responsive controls', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(page, `calendar-${Date.now()}@example.test`);
    const profile = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': profile.id };
    async function create(route, data) {
      const response = await context.request.post(`${base}/api/${route}`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data });
      assert.equal(response.status(), 201, await response.text());
      return (await response.json()).data;
    }
    const space = await create('spaces', { name: 'Calendar family', space_type: 'family' });
    const task = await create('tasks', { space_id: space.id, title: 'Calendar groceries', due_date: '2026-11-02', description: '', assignee_account_id: null });
    const previewResponse = await context.request.post(`${base}/api/reminders/preview`, { headers, data: { task_id: task.id, local_time: '2026-11-02T00:15', timezone: 'Asia/Kolkata' } });
    assert.equal(previewResponse.status(), 200, await previewResponse.text());
    const reminder = await create('reminders', { preview_token: (await previewResponse.json()).data.options[0].preview_token });
    await page.getByRole('link', { name: 'Calendar', exact: true }).click();
    await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
    await page.getByLabel('Month', { exact: true }).fill('2026-11');
    await page.getByRole('heading', { name: 'Calendar groceries', exact: true }).first().waitFor();
    await page.waitForFunction(() => document.querySelectorAll('li[data-kind]').length === 2);
    assert.equal(await page.locator('li[data-kind="task"]').getByText('Due date', { exact: true }).count(), 1);
    await page.getByLabel('Display timezone', { exact: true }).selectOption('UTC');
    await page.waitForFunction(() => document.querySelector('li[data-kind="reminder"]')?.textContent.includes('Sun, Nov 1, 2026'));
    assert.match(await page.locator('li[data-kind="task"]').innerText(), /Mon, Nov 2, 2026/);
    await page.getByRole('button', { name: 'Mon, Nov 2, 2026', exact: true }).click();
    assert.equal(await page.locator('li[data-kind="reminder"]').count(), 0);
    await page.getByRole('button', { name: 'All dates', exact: true }).click();
    await page.locator('li[data-kind="reminder"]').waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/calendar-live-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
      const invalid = await page.locator('main button, main input, main select').evaluateAll(elements => elements.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 2);
      }).map(element => element.getAttribute('aria-label') ?? element.textContent));
      assert.deepEqual(invalid, [], `Control overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/calendar-live-mobile.png'), fullPage: true });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Calendar groceries', exact: true }).count(), 0);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
    await page.locator('li[data-kind="reminder"]').waitFor();
    const cancel = await context.request.post(`${base}/api/reminders/${reminder.id}/cancel`, { headers, data: {} });
    assert.equal(cancel.status(), 200, await cancel.text());
    await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
    await page.locator('li[data-kind="reminder"]').getByText('cancelled', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Space tasks', exact: true }).click();
    await page.getByRole('heading', { name: 'Family tasks', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Calendar groceries', exact: true }).waitFor();
    await page.goto(`${base}/app/calendar?space_id=${crypto.randomUUID()}`);
    await page.getByText('This Space is unavailable.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Calendar groceries', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('desktop: real signup, private cookie, profile persistence, revocation and recovery', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const email = `web-${Date.now()}@example.test`;
  await signUp(page, email);
  const cookies = await context.cookies();
  assert.equal(cookies.find(cookie => cookie.name === 'cp_session').httpOnly, true);
  assert.equal(cookies.find(cookie => cookie.name === 'cp_session').sameSite, 'Strict');
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  const profile = await context.request.get(`${base}/api/me`);
  const account = (await profile.json()).data;
  assert.equal(account.email, email);
  assert.equal(JSON.stringify(await profile.json()).includes('session_token'), false);
  assert.equal(profile.headers()['cache-control'], 'no-store');
  const denied = await context.request.patch(`${base}/api/me/profile`, {
    headers: { Origin: 'https://foreign.example', 'X-Account-ID': account.id, 'If-Match': profile.headers().etag },
    data: { display_name: 'Forbidden', timezone: 'UTC' },
  });
  assert.equal(denied.status(), 403);
  const wrongAccount = await context.request.patch(`${base}/api/me/profile`, {
    headers: { Origin: base, 'X-Account-ID': crypto.randomUUID(), 'If-Match': profile.headers().etag },
    data: { display_name: 'Forbidden', timezone: 'UTC' },
  });
  assert.equal(wrongAccount.status(), 409);
  await page.getByLabel('Display name', { exact: true }).fill('Alex Updated');
  await page.getByLabel('Timezone', { exact: true }).selectOption('Europe/London');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Profile saved.', { exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('input[name="display_name"]')?.value === 'Alex Updated');
  await page.getByText('This session', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, '.local/screenshots/account-desktop.png'), fullPage: true });
  const native = await fetch('http://127.0.0.1:8000/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, platform: 'android', device_name: 'Synthetic Android' }) }).then(response => response.json());
  await page.getByRole('button', { name: 'Refresh sessions' }).click();
  await page.getByRole('button', { name: 'Revoke Synthetic Android session' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByText('Session access revoked.', { exact: true }).waitFor();
  const revoked = await fetch('http://127.0.0.1:8000/v1/me', { headers: { Authorization: `Bearer ${native.data.session_token}` } });
  assert.equal(revoked.status, 401);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByRole('heading', { name: 'Recover your account' }).waitFor();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
  await page.getByLabel('Verification code').fill(await mailCode(email, 'recovery'));
  const replacement = 'Replacement-Meadow-54!';
  await page.getByLabel('New password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText('Password changed. All previous sessions are signed out.', { exact: false }).waitFor();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('mobile: signup, visible layout, accessible form and offline failure', { timeout: 90000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.screenshot({ path: path.join(root, '.local/screenshots/login-mobile.png'), fullPage: true });
  await signUp(page, `mobile-${Date.now()}@example.test`);
  await page.screenshot({ path: path.join(root, '.local/screenshots/account-mobile.png'), fullPage: true });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.getByLabel('Display name', { exact: true }).fill('Offline change');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
  await context.setOffline(false);
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Offline change');
  const unchanged = await context.request.get(`${base}/api/me`);
  assert.notEqual((await unchanged.json()).data.display_name, 'Offline change');
  await context.close();
});

test('auth forms: nothing is sent or put in the address before the page is interactive', { timeout: 60000 }, async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const [route, button] of [['/login', 'Sign in'], ['/register', 'Send verification code'], ['/recover', 'Send verification code']]) {
      await page.goto(`${base}${route}`);
      assert.equal(await page.locator('form.auth-form').getAttribute('method'), 'post', route);
      assert.equal(await page.getByRole('button', { name: button, exact: true }).isDisabled(), true, route);
      assert.equal(await page.getByLabel('Email address').isDisabled(), true, route);
      if (route === '/login') assert.equal(await page.getByLabel('Password', { exact: true }).isDisabled(), true, route);
      await page.keyboard.press('Enter');
      await page.waitForLoadState('load');
      assert.equal(new URL(page.url()).search, '', route);
    }
  } finally {
    await context.close();
  }
});

test('spaces: create, persist, retry unknown outcome and isolate accounts', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await signUp(page, `spaces-${Date.now()}@example.test`);
  const account = (await (await context.request.get(`${base}/api/me`)).json()).data;
  const accountHeaders = { 'X-Account-ID': account.id };
  await page.getByRole('link', { name: 'Spaces', exact: true }).click();
  await page.getByRole('heading', { name: 'Spaces', exact: true, level: 1 }).waitFor();
  await page.getByText('No Spaces yet', { exact: true }).waitFor();
  await page.getByLabel('Family name', { exact: true }).fill('Morgan family');
  await page.getByRole('button', { name: 'Create Space', exact: true }).click();
  await page.getByText('Family Space created.', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();

  const sentKeys = [];
  await page.route('**/api/spaces', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    sentKeys.push(route.request().headers()['idempotency-key']);
    if (sentKeys.length === 1) {
      const accepted = await route.fetch();
      assert.equal(accepted.status(), 201);
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByLabel('Family name', { exact: true }).fill('Shared family');
  await page.getByRole('button', { name: 'Create Space', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
  assert.equal(await page.getByLabel('Family name', { exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Retry creation', exact: true }).click();
  await page.getByText('Family Space created.', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Shared family', exact: true }).waitFor();
  assert.equal(sentKeys.length, 2);
  assert.equal(sentKeys[0], sentKeys[1]);
  await page.unroute('**/api/spaces');

  const listed = await context.request.get(`${base}/api/spaces`, { headers: accountHeaders });
  const all = await listed.json();
  assert.equal(listed.status(), 200);
  assert.equal(listed.headers()['cache-control'], 'no-store');
  assert.equal(all.data.length, 2);
  assert.equal(all.data.filter(space => space.name === 'Shared family').length, 1);
  for (const space of all.data) {
    assert.equal(space.visibility, 'private');
    assert.equal(space.role, 'owner');
    assert.equal('creation_key' in space, false);
  }
  const first = await context.request.get(`${base}/api/spaces?limit=1`, { headers: accountHeaders });
  const firstPage = await first.json();
  assert.equal(firstPage.data.length, 1);
  assert.equal(firstPage.pagination.has_more, true);
  const second = await context.request.get(`${base}/api/spaces`, {
    headers: accountHeaders, params: { limit: 1, cursor: firstPage.pagination.next_cursor },
  });
  const secondPage = await second.json();
  assert.equal(secondPage.data.length, 1);
  assert.notEqual(firstPage.data[0].id, secondPage.data[0].id);
  assert.equal(secondPage.pagination.has_more, false);
  const detail = await context.request.get(`${base}/api/spaces/${firstPage.data[0].id}`, { headers: accountHeaders });
  assert.equal(detail.status(), 200);
  assert.equal((await context.request.get(`${base}/api/spaces?limit=1&limit=2`, { headers: accountHeaders })).status(), 400);
  assert.equal((await context.request.get(`${base}/api/spaces`, { headers: { 'X-Account-ID': crypto.randomUUID() } })).status(), 409);
  const crossOrigin = await context.request.post(`${base}/api/spaces`, {
    headers: { ...accountHeaders, Origin: 'https://foreign.example', 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Forbidden', space_type: 'family' },
  });
  assert.equal(crossOrigin.status(), 403);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await page.screenshot({ path: path.join(root, '.local/screenshots/spaces-desktop.png'), fullPage: true });

  const otherContext = await browser.newContext();
  assert.equal((await otherContext.request.get(`${base}/api/spaces`)).status(), 401);
  const otherPage = await otherContext.newPage();
  await signUp(otherPage, `other-spaces-${Date.now()}@example.test`);
  const otherAccount = (await (await otherContext.request.get(`${base}/api/me`)).json()).data;
  const hidden = await otherContext.request.get(`${base}/api/spaces/${firstPage.data[0].id}`, {
    headers: { 'X-Account-ID': otherAccount.id },
  });
  assert.equal(hidden.status(), 404);
  await context.addCookies((await otherContext.cookies()).filter(cookie => cookie.name === 'cp_session'));
  await page.getByRole('button', { name: 'Refresh Spaces', exact: true }).click();
  await page.getByText('No Spaces yet', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Morgan family', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await otherContext.close();
  await context.close();
});

test('spaces: mobile creation and long names remain readable', { timeout: 90000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signUp(page, `mobile-spaces-${Date.now()}@example.test`);
  await page.goto(`${base}/app/spaces`);
  await page.getByRole('heading', { name: 'Spaces', exact: true, level: 1 }).waitFor();
  const longName = `Family-${'A'.repeat(70)}`;
  await page.getByLabel('Family name', { exact: true }).fill(longName);
  await page.getByRole('button', { name: 'Create Space', exact: true }).click();
  await page.getByRole('heading', { name: longName, exact: true }).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await page.getByRole('heading', { name: longName, exact: true }).boundingBox();
    assert.ok(bounds.x >= 0);
    assert.ok(bounds.x + bounds.width <= width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, '.local/screenshots/spaces-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
  await context.close();
});

test('invitations: intended recipient reviews, joins, declines and observes revocation', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const recipientPage = await recipientContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  recipientPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `invite-owner-${Date.now()}@example.test`);
    await signUp(recipientPage, `invite-recipient-${Date.now()}@example.test`);
    await ownerPage.goto(`${base}/app/spaces`);
    await recipientPage.goto(`${base}/app/spaces`);
    await ownerPage.getByLabel('Your account ID', { exact: true }).waitFor();
    await recipientPage.getByLabel('Your account ID', { exact: true }).waitFor();
    const ownerId = await ownerPage.getByLabel('Your account ID', { exact: true }).inputValue();
    const recipientId = await recipientPage.getByLabel('Your account ID', { exact: true }).inputValue();
    assert.notEqual(ownerId, recipientId);

    async function inviteTo(name) {
      const close = ownerPage.getByRole('button', { name: 'Close invitation management', exact: true });
      if (await close.count()) await close.click();
      await ownerPage.getByLabel('Family name', { exact: true }).fill(name);
      await ownerPage.getByRole('button', { name: 'Create Space', exact: true }).click();
      await ownerPage.getByRole('heading', { name, exact: true }).waitFor();
      await ownerPage.getByRole('button', { name: `Manage invitations for ${name}`, exact: true }).click();
      await ownerPage.getByLabel('Recipient account ID', { exact: true }).fill(recipientId);
      await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
      await ownerPage.getByText('Invitation created.', { exact: true }).waitFor();
      await recipientPage.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
      await recipientPage.locator('section[aria-labelledby="invitation-title"]').getByRole('heading', { name, exact: true }).waitFor();
    }

    await inviteTo('Invitation family');
    const inboxResponse = await recipientContext.request.get(`${base}/api/invitations`, {
      headers: { 'X-Account-ID': recipientId },
    });
    assert.equal(inboxResponse.status(), 200);
    const invitation = (await inboxResponse.json()).data[0];
    const forbidden = await ownerContext.request.post(`${base}/api/invitations/${invitation.id}/accept`, {
      headers: { Origin: base, 'X-Account-ID': ownerId }, data: {},
    });
    assert.equal(forbidden.status(), 404);
    const recipientSpaces = recipientPage.locator('section[aria-labelledby="spaces-title"]');
    assert.equal(await recipientSpaces.getByRole('heading', { name: 'Invitation family', exact: true }).count(), 0);
    await recipientPage.getByRole('button', { name: 'Review invitation', exact: true }).click();
    await recipientPage.getByRole('dialog', { name: 'Join Invitation family?' }).waitFor();
    await recipientPage.getByRole('dialog').getByText('No access granted', { exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await recipientPage.setViewportSize({ width, height: 844 });
      assert.equal(await recipientPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const dialog = await recipientPage.getByRole('dialog').boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
    }
    await recipientPage.setViewportSize({ width: 390, height: 844 });
    await recipientPage.screenshot({ path: path.join(root, '.local/screenshots/invitation-review-mobile.png'), fullPage: true });
    await recipientPage.getByRole('button', { name: 'Join Space', exact: true }).click();
    await recipientPage.getByText('Joined Invitation family.', { exact: true }).waitFor();
    await recipientSpaces.getByRole('heading', { name: 'Invitation family', exact: true }).waitFor();
    assert.equal(await recipientPage.getByRole('button', { name: 'Manage invitations for Invitation family', exact: true }).count(), 0);
    await recipientPage.reload();
    await recipientSpaces.getByRole('heading', { name: 'Invitation family', exact: true }).waitFor();

    await inviteTo('Declined family');
    await recipientPage.getByRole('button', { name: 'Decline invitation to Declined family', exact: true }).click();
    await recipientPage.getByText('Invitation declined.', { exact: true }).waitFor();
    assert.equal(await recipientSpaces.getByRole('heading', { name: 'Declined family', exact: true }).count(), 0);
    await ownerPage.getByRole('button', { name: 'Refresh sent invitations', exact: true }).click();
    await ownerPage.getByText('Declined / Member', { exact: true }).waitFor();

    await inviteTo('Revoked family');
    await ownerPage.getByRole('button', { name: `Revoke invitation for ${recipientId}`, exact: true }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Revoke invitation', exact: true }).click();
    await ownerPage.getByText('Invitation revoked.', { exact: true }).waitFor();
    await ownerPage.getByText('Revoked / Member', { exact: true }).waitFor();
    await recipientPage.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
    await recipientPage.getByText('No pending invitations.', { exact: true }).waitFor();
    assert.equal(await recipientSpaces.getByRole('heading', { name: 'Revoked family', exact: true }).count(), 0);
    assert.equal(await recipientPage.evaluate(() => localStorage.length), 0);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/invitations-owner-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await recipientContext.close();
  }
});

test('ownership: two-party transfer retries safely and the former owner can leave', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const external = [];
  for (const context of [ownerContext, memberContext]) await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
    external.push(url.origin); return route.abort('blockedbyclient');
  });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `transfer-owner-${Date.now()}@example.test`);
    await signUp(memberPage, `transfer-member-${Date.now()}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Ownership handover family', space_type: 'family' },
    });
    assert.equal(created.status(), 201);
    const family = (await created.json()).data;
    const oldTaskResponse = await ownerContext.request.post(`${base}/api/tasks`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { space_id: family.id, title: 'Earlier private family task', description: '', due_date: null, assignee_account_id: owner.id },
    });
    assert.equal(oldTaskResponse.status(), 201);
    const oldTask = (await oldTaskResponse.json()).data;
    const invitation = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id },
    });
    assert.equal(invitation.status(), 201);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${(await invitation.json()).data.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);
    const transferPath = `spaces/${family.id}/ownership-transfers`;
    await ownerPage.goto(`${base}/app/spaces`);
    await memberPage.goto(`${base}/app/spaces`);
    await ownerPage.getByRole('button', { name: `Members of ${family.name}`, exact: true }).click();
    await memberPage.getByRole('button', { name: `Members of ${family.name}`, exact: true }).click();
    await ownerPage.getByLabel('Next owner', { exact: true }).selectOption(member.id);
    await ownerPage.getByRole('button', { name: 'Review ownership offer', exact: true }).click();
    let review = ownerPage.getByRole('dialog', { name: 'Offer family ownership?', exact: true });
    await review.getByText(member.id, { exact: true }).waitFor();
    assert.equal((await (await ownerContext.request.get(`${base}/api/${transferPath}`, { headers: ownerHeaders })).json()).data.length, 0);
    await review.getByRole('button', { name: 'Not now', exact: true }).click();
    const offers = [];
    await ownerPage.route(`**/api/${transferPath}`, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      offers.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postDataJSON() });
      if (offers.length === 1) { assert.equal((await route.fetch()).status(), 201); return route.abort('failed'); }
      return route.continue();
    });
    await ownerPage.getByRole('button', { name: 'Review ownership offer', exact: true }).click();
    await review.getByRole('button', { name: 'Send ownership offer', exact: true }).click();
    await review.getByText('The result is unconfirmed.', { exact: true }).waitFor();
    assert.equal(await review.getByRole('button', { name: 'Not now', exact: true }).isDisabled(), true);
    await review.getByRole('button', { name: 'Retry original ownership change', exact: true }).click();
    await ownerPage.getByText('Ownership offer awaiting acceptance.', { exact: true }).waitFor();
    assert.equal(offers.length, 2); assert.deepEqual(offers[0], offers[1]);
    const transfer = (await (await ownerContext.request.get(`${base}/api/${transferPath}`, { headers: ownerHeaders })).json()).data[0];
    assert.equal(transfer.status, 'pending');
    assert.equal((await (await ownerContext.request.get(`${base}/api/spaces/${family.id}`, { headers: ownerHeaders })).json()).data.role, 'owner');
    await memberPage.getByRole('button', { name: 'Refresh ownership offers', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Review ownership', exact: true }).click();
    const acceptance = memberPage.getByRole('dialog', { name: 'Accept family ownership?', exact: true });
    await acceptance.getByText(member.id, { exact: true }).waitFor();
    assert.equal((await (await memberContext.request.get(`${base}/api/spaces/${family.id}`, { headers: memberHeaders })).json()).data.role, 'member');
    for (const width of [320, 390, 768]) {
      await memberPage.setViewportSize({ width, height: 844 });
      assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const button of await acceptance.getByRole('button').all()) {
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
      }
    }
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/ownership-review-live-mobile.png'), fullPage: true });
    const accepts = [];
    await memberPage.route(`**/api/${transferPath}/${transfer.id}/accept`, async route => {
      accepts.push({ etag: route.request().headers()['if-match'], body: route.request().postDataJSON() });
      if (accepts.length === 1) { assert.equal((await route.fetch()).status(), 200); return route.abort('failed'); }
      return route.continue();
    });
    await acceptance.getByRole('button', { name: 'Accept ownership', exact: true }).click();
    await acceptance.getByText('The result is unconfirmed.', { exact: true }).waitFor();
    await acceptance.getByRole('button', { name: 'Retry original ownership change', exact: true }).click();
    await memberPage.getByText('Ownership offer accepted.', { exact: true }).waitFor();
    assert.equal(accepts.length, 2); assert.deepEqual(accepts[0], accepts[1]); assert.deepEqual(accepts[0].body, {});
    const members = (await (await memberContext.request.get(`${base}/api/spaces/${family.id}/members`, { headers: memberHeaders })).json()).data;
    assert.deepEqual(members.filter(row => row.role === 'owner').map(row => row.account_id), [member.id]);
    assert.equal(members.find(row => row.account_id === owner.id).role, 'member');
    assert.equal((await memberContext.request.get(`${base}/api/tasks/${oldTask.id}`, { headers: memberHeaders })).status(), 404);
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: `Members of ${family.name}`, exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Leave Space', exact: true }).waitFor();
    assert.equal(await ownerPage.getByLabel('Next owner', { exact: true }).count(), 0);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/ownership-former-owner-live.png'), fullPage: true });
    await ownerPage.getByRole('button', { name: 'Leave Space', exact: true }).click();
    await ownerPage.getByRole('dialog', { name: 'Leave this family Space?', exact: true }).getByRole('button', { name: 'Leave Space', exact: true }).click();
    await ownerPage.getByText('No Spaces yet', { exact: true }).waitFor();
    const remaining = (await (await memberContext.request.get(`${base}/api/spaces/${family.id}/members`, { headers: memberHeaders })).json()).data;
    assert.deepEqual(remaining.map(row => row.account_id), [member.id]);
    assert.equal(remaining[0].role, 'owner');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await ownerContext.close(); await memberContext.close(); }
});

test('members: reviewed removal and self-leave survive lost responses and revoke access', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `membership-owner-${Date.now()}@example.test`);
    await signUp(memberPage, `membership-member-${Date.now()}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    async function joinedFamily(name) {
      const created = await ownerContext.request.post(`${base}/api/spaces`, {
        headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name, space_type: 'family' },
      });
      assert.equal(created.status(), 201);
      const family = (await created.json()).data;
      const sent = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, {
        headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id },
      });
      assert.equal(sent.status(), 201);
      const invitation = (await sent.json()).data;
      assert.equal((await memberContext.request.post(`${base}/api/invitations/${invitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);
      return { family, invitation };
    }
    const { family, invitation } = await joinedFamily('Removal family');
    const taskResponse = await ownerContext.request.post(`${base}/api/tasks`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { space_id: family.id, title: 'Private shared task', description: '', due_date: null, assignee_account_id: member.id },
    });
    assert.equal(taskResponse.status(), 201);
    const task = (await taskResponse.json()).data;
    await ownerPage.goto(`${base}/app/spaces`);
    await memberPage.goto(`${base}/app/spaces`);
    await ownerPage.getByRole('button', { name: 'Members of Removal family', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Members of Removal family', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Leave Space', exact: true }).waitFor();
    assert.equal(await memberPage.getByRole('button', { name: /^Remove / }).count(), 0);
    assert.equal(await ownerPage.getByRole('button', { name: 'Leave Space', exact: true }).count(), 0);
    const removePath = `**/api/spaces/${family.id}/members/${member.id}/remove`;
    const removeAttempts = [];
    await ownerPage.route(removePath, async route => {
      removeAttempts.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postDataJSON() });
      if (removeAttempts.length === 1) {
        assert.equal((await route.fetch()).status(), 200);
        return route.abort('failed');
      }
      return route.continue();
    });
    await ownerPage.getByRole('button', { name: `Remove Alex Morgan (${member.id})`, exact: true }).click();
    const removal = ownerPage.getByRole('dialog', { name: 'Remove this family member?', exact: true });
    await removal.getByText(member.id, { exact: true }).waitFor();
    await removal.getByRole('button', { name: 'Keep membership', exact: true }).click();
    assert.equal(removeAttempts.length, 0);
    await ownerPage.getByRole('button', { name: `Remove Alex Morgan (${member.id})`, exact: true }).click();
    await removal.getByRole('button', { name: 'Remove member', exact: true }).click();
    await removal.getByText('The result is unconfirmed.', { exact: true }).waitFor();
    assert.equal(await removal.getByRole('button', { name: 'Keep membership', exact: true }).isDisabled(), true);
    await removal.getByRole('button', { name: 'Retry original change', exact: true }).click();
    await ownerPage.getByText('Member removed.', { exact: true }).waitFor();
    assert.equal(removeAttempts.length, 2);
    assert.deepEqual(removeAttempts[0], removeAttempts[1]);
    assert.deepEqual(removeAttempts[0].body, {});
    await ownerPage.unroute(removePath);
    await memberPage.getByRole('button', { name: 'Refresh members', exact: true }).click();
    await memberPage.getByText('No Spaces yet', { exact: true }).waitFor();
    assert.equal(await memberPage.getByRole('heading', { name: 'Members of Removal family', exact: true }).count(), 0);
    assert.equal((await memberContext.request.get(`${base}/api/tasks/${task.id}`, { headers: memberHeaders })).status(), 404);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${invitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 404);
    const retained = (await (await ownerContext.request.get(`${base}/api/tasks/${task.id}`, { headers: ownerHeaders })).json()).data;
    assert.equal(retained.assignee, null);
    assert.equal(retained.assignee_unavailable, true);
    assert.equal(retained.status, 'open');
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/members-owner-live-desktop.png'), fullPage: true });

    const { family: leaving } = await joinedFamily(`Family ${'A'.repeat(66)}`);
    await memberPage.reload();
    await memberPage.getByRole('button', { name: `Members of ${leaving.name}`, exact: true }).click();
    await memberPage.getByRole('button', { name: 'Leave Space', exact: true }).click();
    const leave = memberPage.getByRole('dialog', { name: 'Leave this family Space?', exact: true });
    await leave.getByText(member.id, { exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await memberPage.setViewportSize({ width, height: 844 });
      assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const button of await leave.getByRole('button').all()) {
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}px: "${await button.textContent()}" at ${JSON.stringify(bounds)}`);
      }
    }
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/members-leave-live-mobile.png'), fullPage: true });
    await leave.getByRole('button', { name: 'Keep membership', exact: true }).click();
    assert.equal((await memberContext.request.get(`${base}/api/spaces/${leaving.id}`, { headers: memberHeaders })).status(), 200);
    const leavePath = `**/api/spaces/${leaving.id}/leave`;
    const leaveAttempts = [];
    await memberPage.route(leavePath, async route => {
      leaveAttempts.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postDataJSON() });
      if (leaveAttempts.length === 1) {
        assert.equal((await route.fetch()).status(), 200);
        return route.abort('failed');
      }
      return route.continue();
    });
    await memberPage.getByRole('button', { name: 'Leave Space', exact: true }).click();
    await leave.getByRole('button', { name: 'Leave Space', exact: true }).click();
    await leave.getByText('The result is unconfirmed.', { exact: true }).waitFor();
    await leave.getByRole('button', { name: 'Retry original change', exact: true }).click();
    await memberPage.getByText('No Spaces yet', { exact: true }).waitFor();
    assert.equal(leaveAttempts.length, 2);
    assert.deepEqual(leaveAttempts[0], leaveAttempts[1]);
    assert.equal(await memberPage.getByRole('heading', { name: `Members of ${leaving.name}`, exact: true }).count(), 0);
    const roster = await ownerContext.request.get(`${base}/api/spaces/${leaving.id}/members`, { headers: ownerHeaders });
    assert.equal(roster.status(), 200);
    assert.deepEqual((await roster.json()).data.map(item => item.account_id), [owner.id]);
    assert.equal(await memberPage.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test('rejoin: a former member returns only through a new invitation and earlier tasks stay hidden', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `rejoin-owner-${Date.now()}@example.test`);
    await signUp(memberPage, `rejoin-member-${Date.now()}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Rejoin family', space_type: 'family' },
    });
    assert.equal(created.status(), 201);
    const family = (await created.json()).data;
    const sent = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id },
    });
    assert.equal(sent.status(), 201);
    const firstInvitation = (await sent.json()).data;
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${firstInvitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);
    const earlier = await ownerContext.request.post(`${base}/api/tasks`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { space_id: family.id, title: 'Earlier shared task', description: '', due_date: null, assignee_account_id: member.id },
    });
    assert.equal(earlier.status(), 201);
    const earlierTask = (await earlier.json()).data;
    assert.equal((await memberContext.request.get(`${base}/api/tasks/${earlierTask.id}`, { headers: memberHeaders })).status(), 200);

    await ownerPage.goto(`${base}/app/spaces`);
    await ownerPage.getByRole('button', { name: 'Members of Rejoin family', exact: true }).click();
    await ownerPage.getByRole('button', { name: `Remove Alex Morgan (${member.id})`, exact: true }).click();
    const removal = ownerPage.getByRole('dialog', { name: 'Remove this family member?', exact: true });
    await removal.getByText(/You can invite them again later, but their earlier tasks and reminders will stay unavailable\./).waitFor();
    await removal.getByRole('button', { name: 'Remove member', exact: true }).click();
    await ownerPage.getByText('Member removed.', { exact: true }).waitFor();
    assert.equal((await memberContext.request.get(`${base}/api/spaces/${family.id}`, { headers: memberHeaders })).status(), 404);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${firstInvitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 404);

    await ownerPage.getByRole('button', { name: 'Close member management', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Manage invitations for Rejoin family', exact: true }).click();
    await ownerPage.getByLabel('Recipient account ID', { exact: true }).fill(member.id);
    await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    await ownerPage.getByText('Invitation created.', { exact: true }).waitFor();

    await memberPage.goto(`${base}/app/spaces`);
    await memberPage.locator('section[aria-labelledby="invitation-title"]').getByRole('heading', { name: 'Rejoin family', exact: true }).waitFor();
    const memberSpaces = memberPage.locator('section[aria-labelledby="spaces-title"]');
    assert.equal(await memberSpaces.getByRole('heading', { name: 'Rejoin family', exact: true }).count(), 0);
    await memberPage.getByRole('button', { name: 'Review invitation', exact: true }).click();
    const review = memberPage.getByRole('dialog', { name: 'Join Rejoin family?' });
    await review.getByText('No access granted', { exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await memberPage.setViewportSize({ width, height: 844 });
      assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const bounds = await review.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    }
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/rejoin-review-live-mobile.png'), fullPage: true });
    await review.getByRole('button', { name: 'Join Space', exact: true }).click();
    await memberPage.getByText('Joined Rejoin family.', { exact: true }).waitFor();
    await memberSpaces.getByRole('heading', { name: 'Rejoin family', exact: true }).waitFor();

    assert.equal((await memberContext.request.get(`${base}/api/tasks/${earlierTask.id}`, { headers: memberHeaders })).status(), 404);
    const listed = await memberContext.request.get(`${base}/api/tasks`, { headers: memberHeaders, params: { space_id: family.id } });
    assert.equal(listed.status(), 200);
    assert.deepEqual((await listed.json()).data, []);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${firstInvitation.id}/accept`, { headers: memberHeaders, data: {} })).status(), 404);
    const later = await ownerContext.request.post(`${base}/api/tasks`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { space_id: family.id, title: 'Task after rejoining', description: '', due_date: null, assignee_account_id: member.id },
    });
    assert.equal(later.status(), 201);
    const laterTask = (await later.json()).data;
    assert.equal((await memberContext.request.get(`${base}/api/tasks/${laterTask.id}`, { headers: memberHeaders })).status(), 200);
    const roster = await ownerContext.request.get(`${base}/api/spaces/${family.id}/members`, { headers: ownerHeaders });
    assert.equal(roster.status(), 200);
    const rejoined = (await roster.json()).data.find(item => item.account_id === member.id);
    assert.equal(rejoined?.role, 'member');

    await ownerPage.getByRole('button', { name: 'Close invitation management', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Members of Rejoin family', exact: true }).click();
    await ownerPage.getByRole('button', { name: `Remove Alex Morgan (${member.id})`, exact: true }).waitFor();
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/rejoin-owner-live-desktop.png'), fullPage: true });
    assert.equal(await memberPage.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test('tasks: admitted member completes a shared task and stale edits are rejected', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `task-owner-${Date.now()}@example.test`);
    await signUp(memberPage, `task-member-${Date.now()}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const createdSpace = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { Origin: base, 'X-Account-ID': owner.id, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Task family', space_type: 'family' },
    });
    assert.equal(createdSpace.status(), 201);
    const space = (await createdSpace.json()).data;
    const invitation = await ownerContext.request.post(`${base}/api/spaces/${space.id}/invitations`, {
      headers: { Origin: base, 'X-Account-ID': owner.id, 'Idempotency-Key': crypto.randomUUID() },
      data: { recipient_account_id: member.id },
    });
    assert.equal(invitation.status(), 201);
    await memberPage.goto(`${base}/app/spaces`);
    await memberPage.getByRole('button', { name: 'Review invitation', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Join Space', exact: true }).click();
    await memberPage.getByText('Joined Task family.', { exact: true }).waitFor();
    await ownerPage.goto(`${base}/app/tasks?space_id=${space.id}`);
    await ownerPage.getByRole('heading', { name: 'Family tasks', exact: true }).waitFor();
    await ownerPage.getByLabel('Task title', { exact: true }).fill('Buy groceries');
    await ownerPage.getByLabel('Notes', { exact: true }).fill('Fruit and bread');
    await ownerPage.getByLabel('Due date', { exact: true }).fill('2026-09-21');
    await ownerPage.getByLabel('Assignee', { exact: true }).selectOption(member.id);
    await ownerPage.getByRole('button', { name: 'Create task', exact: true }).click();
    await ownerPage.getByText('Task created.', { exact: true }).waitFor();
    await ownerPage.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/tasks-desktop.png'), fullPage: true });
    await ownerPage.getByRole('button', { name: 'Edit Buy groceries', exact: true }).click();
    const editor = ownerPage.getByRole('dialog', { name: 'Edit task', exact: true });
    await editor.getByLabel('Task title', { exact: true }).fill('Stale title');

    await memberPage.getByRole('link', { name: 'Tasks for Task family', exact: true }).click();
    await memberPage.getByRole('heading', { name: 'Buy groceries', exact: true }).waitFor();
    assert.equal(await memberPage.getByRole('button', { name: 'Edit Buy groceries', exact: true }).count(), 0);
    await memberPage.getByRole('button', { name: 'Complete task: Buy groceries', exact: true }).click();
    await memberPage.getByRole('dialog').getByRole('button', { name: 'Complete task', exact: true }).click();
    await memberPage.getByText('Task is completed.', { exact: true }).waitFor();
    await editor.getByRole('button', { name: 'Save task', exact: true }).click();
    await editor.getByRole('alert').filter({ hasText: 'This task changed' }).waitFor();
    await editor.getByRole('button', { name: 'Discard edits and reload', exact: true }).click();
    await editor.getByText('This task is no longer editable.', { exact: true }).waitFor();
    await editor.getByRole('button', { name: 'Close task dialog', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Refresh tasks', exact: true }).click();
    const ownerRow = ownerPage.getByRole('listitem').filter({ has: ownerPage.getByRole('heading', { name: 'Buy groceries', exact: true }) });
    await ownerRow.getByText('Completed', { exact: true }).waitFor();
    assert.equal(await ownerPage.getByRole('heading', { name: 'Stale title', exact: true }).count(), 0);

    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Reopen task: Buy groceries', exact: true }).click();
    await memberPage.getByRole('dialog').getByRole('button', { name: 'Reopen task', exact: true }).click();
    await memberPage.getByText('Task is open.', { exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await memberPage.setViewportSize({ width, height: 844 });
      assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/tasks-mobile.png'), fullPage: true });
    assert.equal(await memberPage.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test('reminders: real worker delivery, exact retry, cancellation and separate acknowledgment', { timeout: 210000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const otherContext = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(page, `reminder-live-${Date.now()}@example.test`);
    const account = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': account.id };
    const spaceResponse = await context.request.post(`${base}/api/spaces`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Reminder family', space_type: 'family' },
    });
    assert.equal(spaceResponse.status(), 201);
    const space = (await spaceResponse.json()).data;
    async function createTask(title) {
      const response = await context.request.post(`${base}/api/tasks`, {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { space_id: space.id, title, description: 'Synthetic live reminder check', due_date: null, assignee_account_id: null },
      });
      assert.equal(response.status(), 201);
      return (await response.json()).data;
    }
    const cancelledTask = await createTask('Cancelled reminder task');
    const dueTask = await createTask('Remember groceries');

    async function review(task, instant) {
      await page.goto(`${base}/app/reminders?task_id=${task.id}`);
      await page.getByRole('heading', { name: 'New reminder', exact: true }).waitFor();
      await page.getByLabel('Reminder date and time', { exact: true }).fill(instant.toISOString().slice(0, 16));
      await page.getByLabel('Timezone', { exact: true }).selectOption('UTC');
      await page.getByRole('button', { name: 'Review time', exact: true }).click();
      await page.getByRole('heading', { name: 'Review reminder', exact: true }).waitFor();
      await page.getByText('Alex Morgan (you)', { exact: true }).waitFor();
    }

    await review(cancelledTask, new Date(Math.ceil((Date.now() + 3600000) / 60000) * 60000));
    await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await page.getByText('Reminder saved.', { exact: true }).waitFor();
    await page.getByRole('button', { name: `Cancel reminder: ${cancelledTask.title}`, exact: true }).click();
    await page.getByRole('dialog', { name: 'Cancel this reminder?', exact: true }).getByRole('button', { name: 'Cancel reminder', exact: true }).click();
    await page.getByText('Reminder cancelled.', { exact: true }).waitFor();
    const cancelled = (await (await context.request.get(`${base}/api/reminders?task_id=${cancelledTask.id}`, { headers })).json()).data;
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].status, 'cancelled');

    const scheduledAt = new Date(Math.ceil((Date.now() + 45000) / 60000) * 60000);
    await review(dueTask, scheduledAt);
    await page.screenshot({ path: path.join(root, '.local/screenshots/reminder-review-live-desktop.png'), fullPage: true });
    const attempts = [];
    let acceptedId;
    await page.route('**/api/reminders', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      if (attempts.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        acceptedId = (await response.json()).data.id;
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Change time', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await page.getByText('Reminder saved.', { exact: true }).waitFor();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    await page.unroute('**/api/reminders');
    const reminders = await context.request.get(`${base}/api/reminders?task_id=${dueTask.id}`, { headers });
    const saved = (await reminders.json()).data;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, acceptedId);
    assert.equal(Date.parse(saved[0].scheduled_at), scheduledAt.getTime());
    assert.equal(saved[0].status, 'scheduled');

    const otherPage = await otherContext.newPage();
    await signUp(otherPage, `other-reminder-live-${Date.now()}@example.test`);
    const otherAccount = (await (await otherContext.request.get(`${base}/api/me`)).json()).data;
    const otherHeaders = { Origin: base, 'X-Account-ID': otherAccount.id };
    assert.equal((await otherContext.request.post(`${base}/api/reminders/${acceptedId}/cancel`, { headers: otherHeaders, data: {} })).status(), 404);

    await page.goto(`${base}/app/notifications`);
    await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
    const deliveryDeadline = Date.now() + 130000;
    let notification;
    while (Date.now() < deliveryDeadline) {
      const response = await context.request.get(`${base}/api/notifications`, { headers });
      assert.equal(response.status(), 200);
      notification = (await response.json()).data.find(item => item.reminder_id === acceptedId);
      if (notification) break;
      await delay(1000);
    }
    assert.ok(notification, 'The real worker did not create the expected notification before the deadline.');
    assert.equal(notification.read_at, null);
    assert.equal(notification.acknowledged_at, null);
    await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
    await page.getByRole('heading', { name: dueTask.title, exact: true }).waitFor();
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: dueTask.title, exact: true }) });
    await row.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    const acknowledgment = page.getByRole('dialog', { name: 'Acknowledge this reminder?', exact: true });
    await acknowledgment.getByRole('button', { name: 'Not now', exact: true }).click();
    const before = (await (await context.request.get(`${base}/api/notifications`, { headers })).json()).data;
    assert.equal(before.find(item => item.id === notification.id).acknowledged_at, null);
    await row.getByRole('button', { name: 'Acknowledge', exact: true }).click();
    await acknowledgment.getByRole('button', { name: 'Acknowledge reminder', exact: true }).click();
    await page.getByText('Reminder acknowledged.', { exact: true }).waitFor();
    await row.getByText('Acknowledged', { exact: true }).waitFor();
    await row.getByText('Unread', { exact: true }).waitFor();
    const afterAck = (await (await context.request.get(`${base}/api/notifications`, { headers })).json()).data.find(item => item.id === notification.id);
    assert.ok(afterAck.acknowledged_at);
    assert.equal(afterAck.read_at, null);
    const repeated = await context.request.post(`${base}/api/notifications/${notification.id}/acknowledge`, { headers, data: {} });
    assert.equal(repeated.status(), 200);
    assert.equal((await repeated.json()).data.acknowledged_at, afterAck.acknowledged_at);
    assert.equal((await otherContext.request.post(`${base}/api/notifications/${notification.id}/acknowledge`, { headers: otherHeaders, data: {} })).status(), 404);
    assert.deepEqual((await (await otherContext.request.get(`${base}/api/notifications`, { headers: otherHeaders })).json()).data, []);
    await row.getByRole('button', { name: 'Mark read', exact: true }).click();
    await row.getByText('Read', { exact: true }).waitFor();
    await page.reload();
    await row.getByText('Acknowledged', { exact: true }).waitFor();
    await row.getByText('Read', { exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/reminder-inbox-live-mobile.png'), fullPage: true });
    const finalInbox = await context.request.get(`${base}/api/notifications`, { headers });
    const final = await finalInbox.json();
    assert.equal(final.data.length, 1);
    assert.equal(final.unread_count, 0);
    assert.equal(final.data[0].reminder_id, acceptedId);
    assert.ok(final.data[0].read_at);
    const unchanged = await context.request.get(`${base}/api/tasks/${dueTask.id}`, { headers });
    assert.equal((await unchanged.json()).data.status, 'open');
    assert.equal((await context.request.post(`${base}/api/reminders/${acceptedId}/cancel`, { headers, data: {} })).status(), 409);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await otherContext.close();
  }
});

test('reminder requests: real recipient consent, exact retries, decline and withdrawal', { timeout: 180000 }, async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Synthetic consent journeys require the approved local web origin');
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const recipientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  const external = [];
  for (const context of [ownerContext, recipientContext]) {
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      external.push(route.request().url());
      return route.abort('blockedbyclient');
    });
  }
  const ownerPage = await ownerContext.newPage();
  const recipientPage = await recipientContext.newPage();
  ownerPage.on('pageerror', error => errors.push(error.message));
  recipientPage.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(ownerPage, `request-owner-${Date.now()}@example.test`);
    await signUp(recipientPage, `request-recipient-${Date.now()}@example.test`);
    async function namedAccount(context, displayName) {
      const profile = await context.request.get(`${base}/api/me`);
      const account = (await profile.json()).data;
      const updated = await context.request.patch(`${base}/api/me/profile`, {
        headers: { Origin: base, 'X-Account-ID': account.id, 'If-Match': profile.headers().etag },
        data: { display_name: displayName, timezone: 'UTC' },
      });
      assert.equal(updated.status(), 200);
      return (await updated.json()).data;
    }
    const owner = await namedAccount(ownerContext, 'Morgan Organizer');
    const recipient = await namedAccount(recipientContext, 'Riley Recipient');
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const recipientHeaders = { Origin: base, 'X-Account-ID': recipient.id };
    const createdSpace = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Consent family', space_type: 'family' },
    });
    assert.equal(createdSpace.status(), 201);
    const space = (await createdSpace.json()).data;
    const invitation = await ownerContext.request.post(`${base}/api/spaces/${space.id}/invitations`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: recipient.id },
    });
    assert.equal(invitation.status(), 201);
    const invitationId = (await invitation.json()).data.id;
    assert.equal((await recipientContext.request.post(`${base}/api/invitations/${invitationId}/accept`, { headers: recipientHeaders, data: {} })).status(), 200);
    async function createAssignedTask(title) {
      const response = await ownerContext.request.post(`${base}/api/tasks`, {
        headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
        data: { space_id: space.id, title, description: 'Synthetic recipient-approved request', due_date: null, assignee_account_id: recipient.id },
      });
      assert.equal(response.status(), 201);
      return (await response.json()).data;
    }
    const task = await createAssignedTask('Review the weekly shopping list');
    const instant = new Date(Date.now() + 24 * 60 * 60 * 1000);
    instant.setUTCSeconds(0, 0);
    const local = instant.toISOString().slice(0, 16);
    await ownerPage.goto(`${base}/app/reminders?task_id=${task.id}`);
    await ownerPage.getByRole('radio', { name: 'Request for Riley Recipient', exact: true }).check();
    await ownerPage.getByLabel('Reminder date and time', { exact: true }).fill(local);
    await ownerPage.getByLabel('Timezone', { exact: true }).selectOption('UTC');
    await ownerPage.getByRole('button', { name: 'Review time', exact: true }).click();
    await ownerPage.getByRole('heading', { name: 'Review reminder request', exact: true }).waitFor();
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/reminder-request-live-owner.png'), fullPage: true });
    const creations = [];
    let proposal;
    await ownerPage.route('**/api/reminder-requests', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      creations.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      const saved = await route.fetch();
      assert.equal(saved.status(), 201);
      proposal = (await saved.json()).data;
      if (creations.length === 1) return route.abort('failed');
      return route.fulfill({ response: saved });
    });
    await ownerPage.getByRole('button', { name: 'Send request', exact: true }).click();
    await ownerPage.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await ownerPage.getByRole('button', { name: 'Change time', exact: true }).isDisabled(), true);
    await ownerPage.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await ownerPage.getByText('Request awaiting acceptance.', { exact: true }).waitFor();
    assert.equal(creations.length, 2);
    assert.deepEqual(creations[0], creations[1]);
    await ownerPage.unroute('**/api/reminder-requests');
    const before = await recipientContext.request.get(`${base}/api/reminders`, { headers: recipientHeaders });
    assert.deepEqual((await before.json()).data, []);
    const noConsent = await ownerContext.request.post(`${base}/api/reminder-requests/${proposal.id}/accept`, { headers: ownerHeaders, data: creations[0].body });
    assert.equal(noConsent.status(), 404);
    await recipientPage.goto(`${base}/app/reminders`);
    await recipientPage.getByText('From Morgan Organizer', { exact: true }).waitFor();
    await recipientPage.getByRole('button', { name: 'Review request', exact: true }).click();
    const dialog = recipientPage.getByRole('dialog', { name: 'Review reminder request', exact: true });
    await dialog.getByRole('button', { name: 'Not now', exact: true }).click();
    assert.deepEqual((await (await recipientContext.request.get(`${base}/api/reminders`, { headers: recipientHeaders })).json()).data, []);
    await recipientPage.getByRole('button', { name: 'Review request', exact: true }).click();
    await dialog.locator('button:enabled').filter({ hasText: 'Accept reminder' }).waitFor();
    await recipientPage.screenshot({ path: path.join(root, '.local/screenshots/reminder-request-live-recipient.png'), fullPage: true });
    const acceptances = [];
    await recipientPage.route(`**/api/reminder-requests/${proposal.id}/accept`, async route => {
      acceptances.push(route.request().postDataJSON());
      const accepted = await route.fetch();
      assert.equal(accepted.status(), 200);
      if (acceptances.length === 1) return route.abort('failed');
      return route.fulfill({ response: accepted });
    });
    await dialog.getByRole('button', { name: 'Accept reminder', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Not now', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Retry original response', exact: true }).click();
    await recipientPage.getByText('Request accepted.', { exact: true }).waitFor();
    assert.equal(acceptances.length, 2);
    assert.deepEqual(acceptances[0], acceptances[1]);
    const schedules = (await (await recipientContext.request.get(`${base}/api/reminders`, { headers: recipientHeaders })).json()).data;
    assert.equal(schedules.length, 1);
    assert.equal(Date.parse(schedules[0].scheduled_at), instant.getTime());
    assert.equal(schedules[0].task_id, task.id);
    const sent = (await (await ownerContext.request.get(`${base}/api/reminder-requests?direction=sent`, { headers: ownerHeaders })).json()).data;
    assert.equal(sent.length, 1);
    assert.equal(sent[0].status, 'accepted');
    assert.equal(sent[0].reminder_id, null);
    await recipientPage.reload();
    await recipientPage.getByRole('button', { name: `Cancel reminder: ${task.title}`, exact: true }).click();
    await recipientPage.getByRole('dialog').getByRole('button', { name: 'Cancel reminder', exact: true }).click();
    await recipientPage.getByText('Reminder cancelled.', { exact: true }).waitFor();
    for (const action of ['decline', 'cancel']) {
      const nextTask = await createAssignedTask(`${action} request task`);
      const preview = await ownerContext.request.post(`${base}/api/reminder-requests/preview`, {
        headers: ownerHeaders, data: { task_id: nextTask.id, recipient_account_id: recipient.id, local_time: local, timezone: 'UTC' },
      });
      assert.equal(preview.status(), 200);
      const created = await ownerContext.request.post(`${base}/api/reminder-requests`, {
        headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { preview_token: (await preview.json()).data.options[0].preview_token },
      });
      assert.equal(created.status(), 201);
      const page = action === 'decline' ? recipientPage : ownerPage;
      await page.goto(`${base}/app/reminders`);
      if (action === 'cancel') await page.getByRole('tab', { name: 'Sent', exact: true }).click();
      const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: nextTask.title, exact: true }) });
      await row.getByRole('button', { name: action === 'decline' ? 'Decline' : 'Withdraw request', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: action === 'decline' ? 'Decline request' : 'Withdraw request', exact: true }).click();
      await page.getByText(action === 'decline' ? 'Request declined.' : 'Request withdrawn.', { exact: true }).waitFor();
    }
    const final = (await (await recipientContext.request.get(`${base}/api/reminders`, { headers: recipientHeaders })).json()).data;
    assert.equal(final.length, 1);
    assert.equal(final[0].status, 'cancelled');
    assert.equal(await recipientPage.evaluate(() => localStorage.length), 0);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await recipientContext.close();
  }
});

test('messages: Space chat and direct messages keep one copy per retry, honor membership and delete for everyone', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(ownerPage, `chat-owner-${suffix}@example.test`);
    await signUp(memberPage, `chat-member-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: `Chat family ${suffix}`, space_type: 'family' } });
    assert.equal(created.status(), 201);
    const family = (await created.json()).data;
    const sent = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id } });
    assert.equal(sent.status(), 201);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${(await sent.json()).data.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);

    await ownerPage.goto(`${base}/app/messages?space_id=${family.id}`);
    const ownerPane = ownerPage.getByRole('region', { name: 'Conversation', exact: true });
    await ownerPane.getByRole('heading', { name: family.name, exact: true }).waitFor();
    await ownerPane.getByText('Encrypted at rest on the server. Not end-to-end encrypted.', { exact: true }).waitFor();
    const attempts = [];
    // Background polls are held so only the explicit retry can confirm the lost send.
    let holdPolls = true;
    const messageRoute = url => url.pathname.startsWith('/api/conversations/') && url.pathname.endsWith('/messages');
    await ownerPage.route(messageRoute, async route => {
      if (route.request().method() !== 'POST') return holdPolls ? route.abort('failed') : route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await ownerPane.getByLabel('Message', { exact: true }).fill('  Dinner at seven\n');
    await ownerPane.getByRole('button', { name: 'Send', exact: true }).click();
    await ownerPane.getByText('Not confirmed. Retry sends this same message once.', { exact: true }).waitFor();
    await ownerPane.getByRole('button', { name: 'Retry', exact: true }).click();
    // The retry is confirmed only when the server copy is shown with its author controls.
    await ownerPane.getByRole('button', { name: 'Delete message for everyone', exact: true }).waitFor();
    await ownerPane.getByText('Sending...', { exact: true }).waitFor({ state: 'detached' });
    await ownerPane.getByText('Not confirmed. Retry sends this same message once.', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(JSON.parse(attempts[0].body), { body: 'Dinner at seven' });
    holdPolls = false;
    await ownerPage.unroute(messageRoute);
    const chat = (await (await ownerContext.request.get(`${base}/api/conversations?space_id=${family.id}`, { headers: ownerHeaders })).json()).data[0];
    assert.equal(chat.kind, 'space');
    const stored = (await (await ownerContext.request.get(`${base}/api/conversations/${chat.id}/messages`, { headers: ownerHeaders })).json()).data;
    assert.deepEqual(stored.map(item => [item.position, item.body, item.client_message_id]), [['1', 'Dinner at seven', attempts[0].key]]);

    const memberUnread = (await (await memberContext.request.get(`${base}/api/conversations`, { headers: memberHeaders })).json());
    assert.equal(memberUnread.unread_count, 1);
    await memberPage.goto(`${base}/app/messages`);
    await memberPage.getByRole('button', { name: new RegExp(`^Chat family ${suffix}`) }).click();
    const memberPane = memberPage.getByRole('region', { name: 'Conversation', exact: true });
    await memberPane.getByText('Dinner at seven', { exact: true }).waitFor();
    await memberPane.getByText('You see messages sent since your current membership began.', { exact: true }).waitFor();
    assert.equal(await memberPane.getByRole('button', { name: 'Delete message for everyone', exact: true }).count(), 0);
    const readDeadline = Date.now() + 20000;
    while ((await (await memberContext.request.get(`${base}/api/conversations`, { headers: memberHeaders })).json()).unread_count !== 0) {
      assert.ok(Date.now() < readDeadline, 'The member read position was not saved.');
      await delay(500);
    }
    await memberPane.getByLabel('Message', { exact: true }).fill('On my way');
    await memberPane.getByRole('button', { name: 'Send', exact: true }).click();
    await memberPane.getByText('On my way', { exact: true }).waitFor();
    await ownerPane.getByText('On my way', { exact: true }).waitFor({ timeout: 20000 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/messages-live-mobile.png'), fullPage: true });

    await ownerPage.getByRole('button', { name: 'Message Alex Morgan', exact: true }).click();
    await ownerPane.getByText('Direct conversation / Chat family', { exact: false }).waitFor();
    await ownerPane.getByLabel('Message', { exact: true }).fill('Private note for you');
    await ownerPane.getByRole('button', { name: 'Send', exact: true }).click();
    await ownerPane.getByText('Private note for you', { exact: true }).waitFor();
    const direct = (await (await memberContext.request.get(`${base}/api/conversations`, { headers: memberHeaders })).json()).data.find(item => item.kind === 'direct');
    assert.ok(direct);
    assert.deepEqual(direct.participants.map(item => item.account_id).sort(), [owner.id, member.id].sort());
    await ownerPane.getByRole('button', { name: 'Delete message for everyone', exact: true }).click();
    const confirmation = ownerPane.getByRole('group', { name: 'Confirm deletion', exact: true });
    await confirmation.getByRole('button', { name: 'Keep', exact: true }).click();
    assert.equal((await (await memberContext.request.get(`${base}/api/conversations/${direct.id}/messages`, { headers: memberHeaders })).json()).data[0].status, 'sent');
    await ownerPane.getByRole('button', { name: 'Delete message for everyone', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await ownerPane.getByText('Message deleted', { exact: true }).waitFor();
    const tombstone = (await (await memberContext.request.get(`${base}/api/conversations/${direct.id}/messages`, { headers: memberHeaders })).json()).data[0];
    assert.equal(tombstone.status, 'deleted');
    assert.equal(tombstone.body, null);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/messages-live-desktop.png'), fullPage: true });
    for (const width of [320, 390, 768]) {
      await ownerPage.setViewportSize({ width, height: 844 });
      assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`);
    }

    const roster = (await (await ownerContext.request.get(`${base}/api/spaces/${family.id}/members`, { headers: ownerHeaders })).json()).data;
    const reviewed = roster.find(item => item.account_id === member.id);
    const removed = await ownerContext.request.post(`${base}/api/spaces/${family.id}/members/${member.id}/remove`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': reviewed.etag }, data: {} });
    assert.equal(removed.status(), 200, await removed.text());
    await memberPane.getByText('You no longer have access to this conversation.', { exact: true }).first().waitFor({ timeout: 20000 });
    assert.equal(await memberPane.getByText('Dinner at seven', { exact: true }).count(), 0);
    assert.equal((await memberContext.request.get(`${base}/api/conversations/${chat.id}`, { headers: memberHeaders })).status(), 404);
    assert.equal((await memberContext.request.get(`${base}/api/conversations`, { headers: memberHeaders })).ok(), true);
    assert.deepEqual((await (await memberContext.request.get(`${base}/api/conversations`, { headers: memberHeaders })).json()).data, []);
    const readOnly = (await (await ownerContext.request.get(`${base}/api/conversations/${direct.id}`, { headers: ownerHeaders })).json()).data;
    assert.equal(readOnly.can_send, false);
    assert.equal(await memberPage.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test('community: page creation retry, private drafts, publication, follow feed, comments, report and block', { timeout: 240000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const readerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const visitorContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  const readerPage = await readerContext.newPage();
  const visitorPage = await visitorContext.newPage();
  const errors = [];
  for (const page of [ownerPage, readerPage, visitorPage]) page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    const handle = `walkers-${suffix}`;
    const name = `River Walkers ${suffix}`;
    await signUp(ownerPage, `page-owner-${suffix}@example.test`);
    await signUp(readerPage, `page-reader-${suffix}@example.test`);
    const reader = (await (await readerContext.request.get(`${base}/api/me`)).json()).data;
    const readerHeaders = { Origin: base, 'X-Account-ID': reader.id };

    await ownerPage.goto(`${base}/app/pages`);
    const form = ownerPage.getByRole('form', { name: 'Create a public page', exact: true });
    await form.getByLabel('Handle', { exact: true }).fill(handle);
    await form.getByLabel('Page name', { exact: true }).fill(`  ${name}  `);
    await form.getByLabel('Topic', { exact: true }).selectOption('hobbies');
    await form.getByLabel('Description (optional)', { exact: true }).fill('Weekend walks by the river.');
    const attempts = [];
    await ownerPage.route(`${base}/api/pages`, async route => {
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Create page', exact: true }).click();
    await form.getByRole('button', { name: 'Retry creating page', exact: true }).click();
    await form.getByRole('link', { name: `Open @${handle}`, exact: true }).waitFor();
    await ownerPage.unroute(`${base}/api/pages`);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(JSON.parse(attempts[0].body), { handle, name, description: 'Weekend walks by the river.', topic: 'hobbies' });
    await form.getByRole('link', { name: `Open @${handle}`, exact: true }).click();
    await ownerPage.getByRole('heading', { name, exact: true, level: 1 }).waitFor();

    const composer = ownerPage.getByRole('form', { name: 'New post', exact: true });
    await composer.getByLabel('Title (optional)', { exact: true }).fill('Saturday walk');
    await composer.getByLabel('Text', { exact: true }).fill('We meet at the bridge at 7.');
    await composer.getByRole('button', { name: 'Save draft', exact: true }).click();
    const drafts = ownerPage.getByRole('region', { name: 'Drafts', exact: true });
    const draftCard = drafts.getByRole('article', { name: 'Saturday walk', exact: true });
    await draftCard.getByText('Draft, only you can see it', { exact: true }).waitFor();
    const draft = (await (await ownerContext.request.get(`${base}/api/pages/${handle}/posts`)).json()).data;
    assert.deepEqual(draft, []);
    await visitorPage.goto(`${base}/pages/${handle}`);
    await visitorPage.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
    await visitorPage.getByText('No published posts yet.', { exact: true }).waitFor();
    assert.equal(await visitorPage.getByText('We meet at the bridge at 7.', { exact: true }).count(), 0);

    await draftCard.getByRole('button', { name: 'Publish', exact: true }).click();
    await draftCard.getByRole('group', { name: 'Confirm publication', exact: true }).getByRole('button', { name: 'Publish now', exact: true }).click();
    const published = ownerPage.getByRole('region', { name: 'Posts', exact: true }).getByRole('article', { name: 'Saturday walk', exact: true });
    await published.waitFor();
    await drafts.getByText('No drafts. New posts start as private drafts.', { exact: true }).waitFor();
    await visitorPage.reload();
    await visitorPage.getByText('We meet at the bridge at 7.', { exact: true }).waitFor();
    assert.equal(await visitorPage.getByRole('button', { name: /^Like/ }).isDisabled(), true);

    await readerPage.goto(`${base}/app/discover`);
    await readerPage.getByRole('searchbox', { name: 'Search pages', exact: true }).fill(String(suffix));
    await readerPage.getByRole('button', { name: 'Search', exact: true }).click();
    await readerPage.getByRole('button', { name: `Follow ${name}`, exact: true }).click();
    await readerPage.getByRole('button', { name: `Unfollow ${name}`, exact: true }).waitFor();
    await readerPage.goto(`${base}/app/home`);
    const feedCard = readerPage.getByRole('article', { name: 'Saturday walk', exact: true });
    await feedCard.waitFor();
    await feedCard.getByRole('button', { name: 'Like 0', exact: true }).click();
    await feedCard.getByRole('button', { name: 'Like 1', exact: true }).waitFor();
    await feedCard.getByRole('button', { name: 'Save', exact: true }).click();
    await feedCard.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await readerPage.getByRole('button', { name: 'Saved', exact: true, pressed: false }).click();
    await readerPage.getByRole('article', { name: 'Saturday walk', exact: true }).waitFor();

    await readerPage.getByRole('article', { name: 'Saturday walk', exact: true }).getByRole('link', { name: 'Comments 0', exact: true }).click();
    await readerPage.getByRole('heading', { name: `Post from ${name}`, exact: true }).waitFor();
    await readerPage.getByLabel('Write a comment', { exact: true }).fill('Count me in');
    await readerPage.getByRole('button', { name: 'Post comment', exact: true }).click();
    await readerPage.getByRole('article', { name: 'Comment by Alex Morgan' }).getByText('Count me in', { exact: true }).waitFor();
    const postId = new URL(readerPage.url()).pathname.split('/').pop();
    await ownerPage.goto(`${base}/posts/${postId}`);
    await ownerPage.getByText('Count me in', { exact: true }).waitFor();
    await ownerPage.getByRole('button', { name: 'Reply', exact: true }).click();
    await ownerPage.getByLabel('Reply to Alex Morgan', { exact: true }).fill('See you there');
    await ownerPage.getByRole('button', { name: 'Post reply', exact: true }).click();
    await ownerPage.getByRole('list', { name: 'Replies to Alex Morgan' }).getByText('See you there', { exact: true }).waitFor();
    const thread = (await (await readerContext.request.get(`${base}/api/posts/${postId}/comments`, { headers: readerHeaders })).json()).data;
    assert.deepEqual(thread.map(item => [item.body, item.parent_id === null]), [['Count me in', true], ['See you there', false]]);
    assert.equal(thread.some(item => 'author_account_id' in item), false);

    await readerPage.reload();
    await readerPage.getByRole('article', { name: 'Saturday walk', exact: true }).getByRole('button', { name: 'Report', exact: true }).click();
    const report = readerPage.getByRole('dialog', { name: 'Report post', exact: true });
    await report.getByRole('radio', { name: 'Spam or scam', exact: true }).check();
    await report.getByRole('button', { name: 'Send report', exact: true }).click();
    await report.getByText(/^Report received\./).waitFor();
    for (const width of [320, 390, 768]) {
      await readerPage.setViewportSize({ width, height: 844 });
      assert.equal(await readerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `dialog width ${width}`);
    }
    await report.getByRole('button', { name: 'Close', exact: true }).click();
    await readerPage.setViewportSize({ width: 390, height: 844 });
    await readerPage.screenshot({ path: path.join(root, '.local/screenshots/community-live-mobile.png'), fullPage: true });

    await readerPage.goto(`${base}/pages/${handle}`);
    await readerPage.getByRole('button', { name: 'Block page', exact: true }).click();
    await readerPage.getByRole('group', { name: 'Confirm block', exact: true }).getByRole('button', { name: 'Block', exact: true }).click();
    await readerPage.getByText('You blocked this page. Its posts are hidden from you.', { exact: true }).waitFor();
    const feed = (await (await readerContext.request.get(`${base}/api/feed`, { headers: readerHeaders })).json()).data;
    assert.deepEqual(feed, []);
    assert.equal((await readerContext.request.get(`${base}/api/posts/${postId}`, { headers: readerHeaders })).status(), 404);
    await readerPage.goto(`${base}/app/safety`);
    await readerPage.getByRole('button', { name: `Unblock ${name}`, exact: true }).click();
    await readerPage.getByRole('group', { name: `Confirm unblock ${name}`, exact: true }).getByRole('button', { name: 'Unblock', exact: true }).click();
    await readerPage.getByText('You have not blocked anyone.', { exact: true }).waitFor();
    assert.equal((await readerContext.request.get(`${base}/api/posts/${postId}`, { headers: readerHeaders })).status(), 200);

    await ownerPage.goto(`${base}/pages/${handle}`);
    await ownerPage.getByRole('region', { name: 'Posts', exact: true }).getByRole('article', { name: 'Saturday walk', exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await ownerPage.setViewportSize({ width, height: 900 });
      assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `owner width ${width}`);
    }
    await ownerPage.setViewportSize({ width: 1440, height: 1000 });
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/community-live-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await readerContext.close();
    await visitorContext.close();
  }
});

test('post search: Discover finds published public posts by their words, literally, and never drafts', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const readerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const visitorContext = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  const readerPage = await readerContext.newPage();
  const visitorPage = await visitorContext.newPage();
  const errors = [];
  for (const page of [ownerPage, readerPage, visitorPage]) page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    const word = `lantern${suffix}`;
    await signUp(ownerPage, `search-owner-${suffix}@example.test`);
    await signUp(readerPage, `search-reader-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const created = await ownerContext.request.post(`${base}/api/pages`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle: `lamps-${suffix}`, name: `Lamp Makers ${suffix}`, description: 'Evening lamp workshops.', topic: 'hobbies' },
    });
    assert.equal(created.status(), 201);
    const page = (await created.json()).data;
    async function write(title, body, publish) {
      const drafted = await ownerContext.request.post(`${base}/api/pages/${page.id}/posts`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { title, body } });
      assert.equal(drafted.status(), 201);
      const draft = (await drafted.json()).data;
      if (!publish) return draft;
      const done = await ownerContext.request.post(`${base}/api/posts/${draft.id}/publish`, { headers: { ...ownerHeaders, 'If-Match': draft.etag }, data: {} });
      assert.equal(done.status(), 200);
      return (await done.json()).data;
    }
    await write('Paper lanterns', `Bring glue for the ${word} evening.`, true);
    await write('Glass jars', 'Jars only this week.', true);
    await write('Secret plan', `Draft ${word} notes stay private.`, false);
    const mine = (await (await ownerContext.request.get(`${base}/api/discover/posts?q=${word}`, { headers: ownerHeaders })).json()).data;
    assert.deepEqual(mine.map(item => item.title), ['Paper lanterns']);

    await visitorPage.goto(`${base}/app/discover`);
    await visitorPage.getByRole('group', { name: 'Search for', exact: true }).getByRole('button', { name: 'Posts', exact: true }).click();
    await visitorPage.getByRole('button', { name: 'Posts', exact: true, pressed: true }).waitFor();
    assert.equal(await visitorPage.getByRole('combobox', { name: 'Topic', exact: true }).count(), 0);
    await visitorPage.getByRole('searchbox', { name: 'Search posts', exact: true }).fill(`  ${word.toUpperCase()}  `);
    await visitorPage.getByRole('button', { name: 'Search', exact: true }).click();
    const results = visitorPage.getByRole('region', { name: 'Posts', exact: true });
    await results.getByRole('article', { name: 'Paper lanterns', exact: true }).waitFor();
    assert.equal(await results.getByRole('article').count(), 1);
    assert.equal(await visitorPage.getByText(`Draft ${word} notes stay private.`).count(), 0);
    assert.equal(await results.getByRole('button', { name: /^Like/ }).isDisabled(), true);
    // A percent sign is a literal character: no post contains the word followed by "%".
    await visitorPage.getByRole('searchbox', { name: 'Search posts', exact: true }).fill(`${word}%`);
    await visitorPage.getByRole('button', { name: 'Search', exact: true }).click();
    await visitorPage.getByText('No posts match. Try another word.', { exact: true }).waitFor();
    assert.equal(await results.getByRole('article').count(), 0);

    await readerPage.goto(`${base}/app/discover`);
    await readerPage.getByRole('button', { name: 'Posts', exact: true }).click();
    await readerPage.getByRole('searchbox', { name: 'Search posts', exact: true }).fill(word);
    await readerPage.getByRole('button', { name: 'Search', exact: true }).click();
    const found = readerPage.getByRole('region', { name: 'Posts', exact: true }).getByRole('article', { name: 'Paper lanterns', exact: true });
    await found.getByRole('button', { name: 'Like 0', exact: true }).click();
    await found.getByRole('button', { name: 'Like 1', exact: true }).waitFor();
    await found.getByRole('button', { name: 'Save', exact: true }).click();
    await found.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    for (const width of [320, 390, 768]) {
      await readerPage.setViewportSize({ width, height: 844 });
      assert.equal(await readerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `search width ${width}`);
    }
    await readerPage.setViewportSize({ width: 390, height: 844 });
    await readerPage.screenshot({ path: path.join(root, '.local/screenshots/community-post-search-mobile.png'), fullPage: true });
    await readerPage.getByRole('button', { name: 'Pages', exact: true }).click();
    await readerPage.getByRole('searchbox', { name: 'Search pages', exact: true }).waitFor();
    await readerPage.getByRole('combobox', { name: 'Topic', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await readerContext.close();
    await visitorContext.close();
  }
});

test('events: exact create retry, responses, reschedule confirmation and cancellation', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(ownerPage, `event-owner-${suffix}@example.test`);
    await signUp(memberPage, `event-member-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: `Event family ${suffix}`, space_type: 'family' } });
    assert.equal(created.status(), 201);
    const family = (await created.json()).data;
    const sent = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, { headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id } });
    assert.equal(sent.status(), 201);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${(await sent.json()).data.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);

    const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await ownerPage.goto(`${base}/app/spaces`);
    await ownerPage.getByRole('link', { name: `Events for ${family.name}`, exact: true }).click();
    await ownerPage.getByRole('heading', { name: 'Events', exact: true }).waitFor();
    await ownerPage.getByText('No upcoming events. Events created before you joined this Space are not shown.', { exact: true }).waitFor();
    await ownerPage.getByRole('button', { name: 'New event', exact: true }).click();
    const form = ownerPage.getByRole('form', { name: 'New event', exact: true });
    await form.getByLabel('Title', { exact: true }).fill('  Family   dinner ');
    await form.getByLabel('Starts', { exact: true }).fill(`${day}T18:30`);
    await form.getByLabel('Ends (optional)', { exact: true }).fill(`${day}T21:00`);
    await form.getByLabel('Time zone', { exact: true }).selectOption('Europe/London');
    await form.getByLabel('Location (optional)', { exact: true }).fill("Grandma's house");
    const attempts = [];
    const createRoute = url => url.pathname === `/api/spaces/${family.id}/events`;
    await ownerPage.route(createRoute, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Create event', exact: true }).click();
    await form.getByText('Retry sends the same event; it will not be created twice.').waitFor();
    assert.equal(await form.getByLabel('Title', { exact: true }).isDisabled(), true);
    await form.getByRole('button', { name: 'Retry', exact: true }).click();
    const ownerPanel = ownerPage.getByRole('region', { name: 'Family dinner', exact: true });
    await ownerPanel.getByText(`(Europe/London)`).first().waitFor();
    await ownerPage.unroute(createRoute);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.deepEqual(JSON.parse(attempts[0].body), {
      title: 'Family dinner', description: '', location: "Grandma's house", timezone: 'Europe/London',
      local_start: `${day}T18:30`, local_end: `${day}T21:00`,
    });
    const stored = (await (await ownerContext.request.get(`${base}/api/spaces/${family.id}/events`, { headers: ownerHeaders })).json()).data;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].local_start, `${day}T18:30`);

    await ownerPanel.getByRole('button', { name: 'Going', exact: true }).click();
    await ownerPanel.getByRole('button', { name: 'Going', exact: true, pressed: true }).waitFor();
    await ownerPanel.getByText('Going 1 · Maybe 0 · Not going 0', { exact: true }).waitFor();

    await memberPage.goto(`${base}/app/events?space_id=${family.id}`);
    await memberPage.getByRole('button', { name: 'Family dinner', exact: true }).click();
    const memberPanel = memberPage.getByRole('region', { name: 'Family dinner', exact: true });
    await memberPanel.getByText('Organized by Alex Morgan', { exact: false }).waitFor();
    assert.equal(await memberPanel.getByRole('button', { name: 'Edit event' }).count(), 0);
    assert.equal(await memberPanel.getByRole('button', { name: 'Cancel event' }).count(), 0);
    await memberPanel.getByRole('button', { name: 'Maybe', exact: true }).click();
    await memberPanel.getByRole('button', { name: 'Maybe', exact: true, pressed: true }).waitFor();
    await memberPanel.getByText('Going 1 · Maybe 1 · Not going 0', { exact: true }).waitFor();

    await ownerPanel.getByRole('button', { name: 'Edit event', exact: true }).click();
    const editForm = ownerPage.getByRole('form', { name: 'Edit event', exact: true });
    await editForm.getByLabel('Starts', { exact: true }).fill(`${day}T19:00`);
    await editForm.getByRole('button', { name: 'Save changes', exact: true }).click();
    await ownerPanel.getByText('The time was changed after creation.', { exact: false }).waitFor();
    await ownerPanel.getByText('The time changed after you responded. Choose your response again to confirm it.', { exact: true }).waitFor();

    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Family dinner', exact: true }).click();
    await memberPanel.getByText('The time changed after you responded. Choose your response again to confirm it.', { exact: true }).waitFor();
    assert.equal(await memberPanel.getByRole('button', { name: 'Maybe', exact: true, pressed: true }).count(), 0);
    await memberPanel.getByRole('button', { name: 'Maybe', exact: true }).click();
    await memberPanel.getByRole('button', { name: 'Maybe', exact: true, pressed: true }).waitFor();
    await memberPanel.getByText('The time changed after you responded. Choose your response again to confirm it.', { exact: true }).waitFor({ state: 'detached' });
    for (const width of [320, 390, 768]) {
      await memberPage.setViewportSize({ width, height: 844 });
      assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`);
    }
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/events-live-mobile.png'), fullPage: true });

    await ownerPanel.getByRole('button', { name: 'Cancel event', exact: true }).click();
    const confirm = ownerPanel.getByRole('group', { name: 'Confirm cancellation', exact: true });
    await confirm.getByRole('button', { name: 'Yes, cancel event', exact: true }).click();
    await ownerPanel.getByText('This event was cancelled. Responses can no longer change.', { exact: true }).waitFor();
    assert.equal(await ownerPanel.getByRole('button', { name: 'Going', exact: true }).count(), 0);
    await memberPage.reload();
    await memberPage.getByText('Cancelled', { exact: true }).waitFor();
    await memberPage.getByRole('button', { name: /^Family dinner/ }).click();
    await memberPanel.getByText('This event was cancelled. Responses can no longer change.', { exact: true }).waitFor();
    assert.equal(await memberPanel.getByRole('button', { name: 'Maybe', exact: true }).count(), 0);
    const refused = await memberContext.request.post(`${base}/api/events/${stored[0].id}/attendance`, { headers: memberHeaders, data: { response: 'going' } });
    assert.equal(refused.status(), 409);
    for (const width of [320, 768]) {
      await ownerPage.setViewportSize({ width, height: 900 });
      assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `owner width ${width}`);
    }
    await ownerPage.setViewportSize({ width: 1440, height: 1000 });
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/events-live-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});

test('care: confirmed instruction, exact retries, own dose notes, privacy and stop', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ownerContext.newPage();
  const otherPage = await otherContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  otherPage.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(page, `care-owner-${suffix}@example.test`);
    await signUp(otherPage, `care-other-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const other = (await (await otherContext.request.get(`${base}/api/me`)).json()).data;
    assert.equal(owner.timezone, 'Asia/Kolkata');
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const wall = milliseconds => new Date(milliseconds + 330 * 60000).toISOString();
    const earlier = wall(Date.now() - 10 * 60000);
    const todayIst = wall(Date.now()).slice(0, 10);
    const targetDate = earlier.slice(0, 10);
    const targetTime = earlier.slice(11, 16);
    const later = wall(Date.now() + 4 * 3600000);
    const laterSameDay = later.slice(0, 10) === targetDate;

    await page.goto(`${base}/app/care`);
    await page.getByRole('heading', { name: 'Medicines', exact: true }).waitFor();
    await page.getByText('Only you can see this page; nobody in your Spaces can.', { exact: false }).waitFor();
    await page.getByText('Nothing is scheduled for this day.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'My medicines', exact: true }).click();
    await page.getByText('No current medicines.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    const form = page.getByRole('form', { name: 'Add a medicine', exact: true });
    await form.getByLabel('Medicine name', { exact: true }).fill('  Synthetic   tablet ');
    await form.getByLabel('Strength (optional)', { exact: true }).fill('5 mg');
    await form.getByLabel('Form (optional)', { exact: true }).fill('tablet');
    await form.getByLabel('Dose', { exact: true }).fill('One tablet');
    await form.getByLabel('Source', { exact: true }).selectOption('package_label');
    await form.getByLabel('Time 1', { exact: true }).fill(targetTime);
    if (laterSameDay) {
      await form.getByRole('button', { name: 'Add a time', exact: true }).click();
      await form.getByLabel('Time 2', { exact: true }).fill(later.slice(11, 16));
    }
    await form.getByLabel('First day', { exact: true }).fill(targetDate);
    await form.getByRole('button', { name: 'Save medicine', exact: true }).click();
    await form.getByText('Confirm that these details match your instructions.', { exact: true }).waitFor();
    await form.getByRole('checkbox').check();

    const attempts = [];
    const createRoute = url => url.pathname === '/api/care/instructions';
    await page.route(createRoute, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await form.getByRole('button', { name: 'Save medicine', exact: true }).click();
    await form.getByText('Retry sends the same request; it will not be saved twice.').waitFor();
    assert.equal(await form.getByLabel('Medicine name', { exact: true }).isDisabled(), true);
    await form.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('Synthetic tablet 5 mg (tablet)', { exact: true }).waitFor();
    await page.unroute(createRoute);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    const sent = JSON.parse(attempts[0].body);
    assert.equal(sent.medicine_name, 'Synthetic tablet');
    assert.equal(sent.confirmed, true);
    assert.equal(sent.timezone, 'Asia/Kolkata');
    const stored = (await (await ownerContext.request.get(`${base}/api/care/instructions?status=active`, { headers: ownerHeaders })).json()).data;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].confirmed_by_account_id, owner.id);
    await page.getByText('Source: The package label.', { exact: false }).waitFor();

    await page.getByRole('button', { name: 'Day plan', exact: true }).click();
    if (targetDate !== todayIst) await page.getByLabel('Go to date', { exact: true }).fill(targetDate);
    const row = page.getByRole('listitem').filter({ hasText: 'Synthetic tablet 5 mg (tablet)' }).first();
    await row.getByText('Not noted', { exact: true }).waitFor();
    if (laterSameDay) {
      const futureRow = page.getByRole('listitem').filter({ hasText: later.slice(11, 16) }).first();
      await futureRow.getByText('You can note this dose from one hour before its time.', { exact: true }).waitFor();
      assert.equal(await futureRow.getByRole('button', { name: 'Taken', exact: true }).count(), 0);
    }
    const reportAttempts = [];
    const reportRoute = url => url.pathname === `/api/care/instructions/${stored[0].id}/reports`;
    await page.route(reportRoute, async route => {
      reportAttempts.push({ key: route.request().headers()['idempotency-key'], etag: route.request().headers()['if-match'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      if (reportAttempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await row.getByRole('button', { name: 'Taken', exact: true }).click();
    await row.getByText('Choose Taken again to retry; it will not be saved twice.', { exact: false }).waitFor();
    await row.getByRole('button', { name: 'Taken', exact: true }).click();
    await row.getByText('You noted: Taken', { exact: true }).waitFor();
    await page.unroute(reportRoute);
    assert.equal(reportAttempts.length, 2);
    assert.deepEqual(reportAttempts[0], reportAttempts[1]);
    await row.getByText('You noted: Taken', { exact: true }).waitFor();
    await row.getByRole('button', { name: 'Change to Skipped', exact: true }).click();
    await row.getByText('You noted: Skipped', { exact: true }).waitFor();
    const planned = (await (await ownerContext.request.get(`${base}/api/care/day?date=${targetDate}`, { headers: ownerHeaders })).json()).data;
    const noted = planned.occurrences.find(item => item.local_time === targetTime);
    assert.equal(noted.report.outcome, 'skipped');
    assert.equal(noted.report.revision, 2);
    await page.getByText('not checked and this page does not measure whether you followed your instructions', { exact: false }).waitFor();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/care-live-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/care-live-desktop.png'), fullPage: true });

    const otherHeaders = { Origin: base, 'X-Account-ID': other.id };
    assert.equal((await otherContext.request.get(`${base}/api/care/instructions/${stored[0].id}`, { headers: otherHeaders })).status(), 404);
    assert.equal((await otherContext.request.post(`${base}/api/care/instructions/${stored[0].id}/reports`, {
      headers: { ...otherHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': noted.etag },
      data: { local_date: targetDate, local_time: targetTime, outcome: 'taken' },
    })).status(), 404);
    assert.equal((await otherContext.request.post(`${base}/api/care/instructions/${stored[0].id}/stop`, {
      headers: { ...otherHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': stored[0].etag }, data: {},
    })).status(), 404);
    const otherDay = (await (await otherContext.request.get(`${base}/api/care/day?date=${targetDate}`, { headers: otherHeaders })).json()).data;
    assert.deepEqual(otherDay.occurrences, []);
    await otherPage.goto(`${base}/app/care`);
    await otherPage.getByText('Nothing is scheduled for this day.', { exact: false }).waitFor();

    await page.getByRole('button', { name: 'My medicines', exact: true }).click();
    await page.getByRole('button', { name: 'Stop tracking', exact: true }).click();
    const confirm = page.getByRole('group', { name: 'Confirm stop', exact: true });
    await confirm.getByText('It does not tell you to stop taking it', { exact: false }).waitFor();
    await confirm.getByRole('button', { name: 'Yes, stop tracking', exact: true }).click();
    await page.getByText('No current medicines.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Stopped', exact: true }).click();
    await page.getByText('Synthetic tablet 5 mg (tablet)', { exact: true }).waitFor();
    await page.getByText('Stopped ', { exact: false }).first().waitFor();
    await page.getByRole('button', { name: 'Day plan', exact: true }).click();
    if (targetDate !== todayIst) await page.getByLabel('Go to date', { exact: true }).fill(targetDate);
    await page.getByText('(this medicine was stopped)', { exact: false }).waitFor();
    assert.equal((await ownerContext.request.post(`${base}/api/care/instructions/${stored[0].id}/stop`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': stored[0].etag }, data: {},
    })).status(), 412);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await otherContext.close();
  }
});

test('groups: a public group is found, joined on approval, and hidden again when made private', { timeout: 240000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const seekerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await ownerContext.newPage();
  const seekerPage = await seekerContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  seekerPage.on('pageerror', error => errors.push(error.message));
  const suffix = Date.now();
  const groupName = `Lakeside walkers ${suffix}`;
  const privateName = `Private book club ${suffix}`;
  try {
    await signUp(ownerPage, `group-owner-${suffix}@example.test`);
    await signUp(seekerPage, `group-seeker-${suffix}@example.test`);

    await ownerPage.goto(`${base}/app/spaces`);
    await ownerPage.getByRole('heading', { name: 'Spaces', exact: true, level: 1 }).waitFor();
    for (const [name, visibility] of [[privateName, 'private'], [groupName, 'public']]) {
      await ownerPage.getByLabel('Space type').selectOption('group');
      await ownerPage.getByLabel('Group name', { exact: true }).fill(name);
      await ownerPage.getByLabel('Description (optional)').fill(`${name}: Saturday mornings, all paces welcome.`);
      await ownerPage.getByRole('radio', { name: visibility === 'public' ? /Public/ : /Private/ }).check();
      await ownerPage.getByRole('button', { name: 'Create Space', exact: true }).click();
      await ownerPage.getByRole('heading', { name, exact: true }).waitFor();
    }
    await ownerPage.getByText('Public group created. People can now find it and ask to join.').waitFor();

    await seekerPage.goto(`${base}/app/spaces/discover`);
    await seekerPage.getByRole('heading', { name: 'Find groups', exact: true }).waitFor();
    await seekerPage.getByLabel('Search by name or description').fill(String(suffix));
    await seekerPage.getByRole('button', { name: 'Search', exact: true }).click();
    const card = seekerPage.getByRole('listitem').filter({ hasText: groupName });
    await card.waitFor();
    assert.equal(await seekerPage.getByText(privateName).count(), 0, 'A private group must never be listed.');
    await card.getByText('1 member').waitFor();
    for (const width of [320, 390]) {
      await seekerPage.setViewportSize({ width, height: 844 });
      assert.equal(await seekerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await seekerPage.setViewportSize({ width: 390, height: 844 });
    await card.getByRole('button', { name: 'Ask to join', exact: true }).click();
    await card.getByLabel('Note to the owner (optional)').fill('I walk by the lake every weekend.');
    await card.getByRole('button', { name: 'Send request', exact: true }).click();
    await seekerPage.getByText(`Request sent to ${groupName}. The owner will review it.`).waitFor();
    await card.getByText('Request sent', { exact: true }).waitFor();
    await seekerPage.getByText('Waiting for the owner', { exact: false }).waitFor();
    await seekerPage.screenshot({ path: path.join(root, '.local/screenshots/groups-find-mobile.png'), fullPage: true });

    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: `Join requests for ${groupName}` }).click();
    const requests = ownerPage.getByRole('dialog', { name: `Join requests: ${groupName}` });
    await requests.getByText('I walk by the lake every weekend.').waitFor();
    await requests.getByRole('button', { name: 'Approve Alex Morgan' }).click();
    await requests.getByText(`Alex Morgan joined ${groupName}.`).waitFor();
    await requests.getByText('Nobody is waiting.').waitFor();
    await requests.getByRole('button', { name: 'Close join requests' }).click();

    await seekerPage.goto(`${base}/app/spaces`);
    await seekerPage.getByRole('heading', { name: groupName, exact: true }).waitFor();
    await seekerPage.goto(`${base}/app/spaces/discover`);
    await seekerPage.getByLabel('Search by name or description').fill(String(suffix));
    await seekerPage.getByRole('button', { name: 'Search', exact: true }).click();
    await seekerPage.getByRole('listitem').filter({ hasText: groupName }).getByText('You are a member').waitFor();
    await seekerPage.getByRole('listitem').filter({ hasText: groupName }).getByText('2 members').waitFor();

    await ownerPage.getByRole('button', { name: `Settings for ${groupName}` }).click();
    const settings = ownerPage.getByRole('dialog', { name: 'Space settings' });
    await settings.getByRole('button', { name: 'Make this group private' }).click();
    await settings.getByText('The group will disappear from Find groups.', { exact: false }).waitFor();
    await settings.getByRole('button', { name: 'Make private', exact: true }).click();
    await settings.getByText('The group is private. It no longer appears in Find groups, and waiting requests were closed.').waitFor();
    await settings.getByRole('button', { name: 'Close Space settings' }).click();

    await seekerPage.reload();
    await seekerPage.getByLabel('Search by name or description').fill(String(suffix));
    await seekerPage.getByRole('button', { name: 'Search', exact: true }).click();
    await seekerPage.getByText('No public groups match that search.').waitFor();
    await seekerPage.goto(`${base}/app/spaces`);
    await seekerPage.getByRole('heading', { name: groupName, exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await seekerContext.close();
  }
});

test('documents: members find cited text and deletion removes it from search', { timeout: 180000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const external = [];
  for (const context of [ownerContext, memberContext]) await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  ownerPage.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    const word = `lantern${suffix}`;
    const fileName = `picnic-${suffix}.md`;
    const citedText = `Bring ${word} blankets to the park.`;
    const content = `# Family picnic\nMeeting notes\n${citedText}\nPack fruit and water.\n`;
    await signUp(ownerPage, `document-owner-${suffix}@example.test`);
    await signUp(memberPage, `document-member-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `Documents family ${suffix}`, space_type: 'family' },
    });
    assert.equal(created.status(), 201, await created.text());
    const family = (await created.json()).data;
    const sent = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id },
    });
    assert.equal(sent.status(), 201, await sent.text());
    await memberPage.goto(`${base}/app/spaces`);
    await memberPage.getByRole('heading', { name: 'Spaces', exact: true, level: 1 }).waitFor();
    await memberPage.getByRole('button', { name: 'Review invitation', exact: true }).click();
    const invitation = memberPage.getByRole('dialog', { name: `Join ${family.name}?`, exact: true });
    await invitation.getByRole('button', { name: 'Join Space', exact: true }).click();
    await memberPage.getByText(`Joined ${family.name}.`, { exact: true }).waitFor();
    const joined = await memberContext.request.get(`${base}/api/spaces/${family.id}`, { headers: memberHeaders });
    assert.equal(joined.status(), 200);
    assert.equal((await joined.json()).data.role, 'member');

    await ownerPage.goto(`${base}/app/documents?space_id=${family.id}`);
    await ownerPage.getByRole('heading', { name: 'Documents', exact: true, level: 1 }).waitFor();
    await ownerPage.getByRole('heading', { name: `Add a document to ${family.name}`, exact: true }).waitFor();
    await ownerPage.setInputFiles('input[type="file"]', { name: fileName, mimeType: 'text/markdown', buffer: Buffer.from(content, 'utf8') });
    await ownerPage.getByRole('button', { name: 'Add document', exact: true }).click();
    await ownerPage.getByText(`Added \u201c${fileName}\u201d to ${family.name}.`, { exact: true }).waitFor();
    await ownerPage.getByRole('button', { name: fileName, exact: true }).waitFor();
    const listed = await ownerContext.request.get(`${base}/api/spaces/${family.id}/documents`, { headers: ownerHeaders });
    assert.equal(listed.status(), 200);
    const documents = (await listed.json()).data;
    assert.equal(documents.length, 1);
    assert.equal(documents[0].name, fileName);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/documents-live-desktop.png'), fullPage: true });

    await memberPage.goto(`${base}/app/search`);
    await memberPage.getByRole('heading', { name: 'Search', exact: true, level: 1 }).waitFor();
    await memberPage.getByLabel('Search your Spaces', { exact: true }).fill(word);
    await memberPage.getByRole('button', { name: 'Search', exact: true }).click();
    await memberPage.getByRole('heading', { name: 'Documents (1)', exact: true, level: 3 }).waitFor();
    const result = memberPage.getByRole('region', { name: 'Documents (1)', exact: true }).getByRole('link', { name: fileName, exact: true });
    const address = new URL(await result.getAttribute('href'), base);
    assert.equal(address.pathname, '/app/documents');
    assert.equal(address.searchParams.get('space_id'), family.id);
    assert.equal(address.searchParams.get('id'), documents[0].id);
    const firstLine = Number(address.searchParams.get('line'));
    const lastLine = Number(address.searchParams.get('end'));
    assert.ok(Number.isInteger(firstLine) && firstLine >= 1 && firstLine <= 3);
    assert.ok(Number.isInteger(lastLine) && lastLine >= 3 && lastLine <= documents[0].line_count);
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/search-live-mobile.png'), fullPage: true });
    await result.click();
    await memberPage.getByRole('heading', { name: fileName, exact: true, level: 2 }).waitFor();
    await memberPage.locator('#L3[aria-current="location"]').waitFor();
    assert.equal(await memberPage.locator('#L3').innerText(), citedText);
    assert.equal(await memberPage.locator(`#L${firstLine}`).getAttribute('aria-current'), 'location');
    assert.equal(await memberPage.locator(`#L${lastLine}`).getAttribute('aria-current'), 'location');
    await memberPage.setViewportSize({ width: 320, height: 844 });
    await memberPage.evaluate(() => document.fonts.ready);
    assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/documents-viewer-live-320.png'), fullPage: false });

    await ownerPage.goto(address.href);
    await ownerPage.getByRole('heading', { name: fileName, exact: true, level: 2 }).waitFor();
    await ownerPage.getByRole('button', { name: 'Delete document', exact: true }).click();
    const confirmation = ownerPage.getByRole('dialog', { name: 'Delete document?', exact: true });
    await confirmation.getByText(`Delete \u201c${fileName}\u201d, added by Alex Morgan, from ${family.name}? Its text is removed for everyone and cannot be recovered.`, { exact: true }).waitFor();
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/documents-delete-live-desktop.png'), fullPage: false });
    await confirmation.getByRole('button', { name: 'Delete document', exact: true }).click();
    await ownerPage.getByText(`Deleted \u201c${fileName}\u201d.`, { exact: true }).waitFor();
    await ownerPage.getByText('No documents yet. Add a .txt, .md or .csv file.', { exact: true }).waitFor();

    await memberPage.goto(`${base}/app/search`);
    await memberPage.getByRole('heading', { name: 'Search', exact: true, level: 1 }).waitFor();
    await memberPage.getByLabel('Search your Spaces', { exact: true }).fill(word);
    await memberPage.getByRole('button', { name: 'Search', exact: true }).click();
    await memberPage.getByText('Nothing found in your Spaces.', { exact: true }).waitFor();
    assert.equal(await memberPage.getByRole('link', { name: fileName, exact: true }).count(), 0);
    await memberPage.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/search-live-320-200pct.png'), fullPage: true });
    await ownerPage.setViewportSize({ width: 320, height: 844 });
    await ownerPage.evaluate(() => document.fonts.ready);
    assert.equal(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});