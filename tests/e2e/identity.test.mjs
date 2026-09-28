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
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

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

test('spaces: create, persist, retry unknown outcome and isolate accounts', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await signUp(page, `spaces-${Date.now()}@example.test`);
  const account = (await (await context.request.get(`${base}/api/me`)).json()).data;
  const accountHeaders = { 'X-Account-ID': account.id };
  await page.getByRole('link', { name: 'Spaces', exact: true }).click();
  await page.getByRole('heading', { name: 'Family Spaces', exact: true }).waitFor();
  await page.getByText('No family Spaces yet', { exact: true }).waitFor();
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
  await page.getByText('No family Spaces yet', { exact: true }).waitFor();
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
  await page.getByRole('heading', { name: 'Family Spaces', exact: true }).waitFor();
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
    await ownerPage.getByText('No family Spaces yet', { exact: true }).waitFor();
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
    await memberPage.getByText('No family Spaces yet', { exact: true }).waitFor();
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
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
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
    await memberPage.getByText('No family Spaces yet', { exact: true }).waitFor();
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