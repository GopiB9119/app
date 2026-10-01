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

async function mailCode(email) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await fetch(`${mail}/api/v1/messages`).then(response => response.json());
    const message = result.messages.find(entry => entry.To.some(recipient => recipient.Address === email) && entry.Subject.includes('registration'));
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
  await page.getByLabel('Verification code').fill(await mailCode(email));
  await page.getByLabel('Display name', { exact: true }).fill('Alex Morgan');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

function localParts(instant, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(day, days) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function noOverflow(page, label) {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: overflow at ${width}`);
    const invalid = await page.locator('main button, main input, main select').evaluateAll(elements => elements.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 1);
    }).map(element => element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent));
    assert.deepEqual(invalid, [], `${label}: control outside the viewport at ${width}`);
  }
}

test('repeating reminders: exact save retry, calendar plan, real delivery, snooze retry, skip, pause, resume and cancel', { timeout: 300000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const otherContext = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signUp(page, `series-live-${Date.now()}@example.test`);
    const me = await context.request.get(`${base}/api/me`);
    assert.equal(me.status(), 200, await me.text());
    const account = (await me.json()).data;
    const zone = account.timezone;
    const headers = { Origin: base, 'X-Account-ID': account.id };
    async function create(route, data) {
      const response = await context.request.post(`${base}/api/${route}`, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data });
      assert.equal(response.status(), 201, await response.text());
      return (await response.json()).data;
    }
    const space = await create('spaces', { name: 'Repeating family', space_type: 'family' });
    const task = await create('tasks', { space_id: space.id, title: 'Water the plants', description: 'Synthetic repeating check', due_date: null, assignee_account_id: null });

    const due = new Date(Math.ceil((Date.now() + 100000) / 60000) * 60000);
    const first = localParts(due, zone);
    const last = addDays(first.date, 6);
    await page.goto(`${base}/app/reminders?task_id=${task.id}`);
    await page.getByRole('heading', { name: 'New reminder', exact: true }).waitFor();
    await page.getByLabel('Repeat', { exact: true }).selectOption('daily');
    await page.getByLabel('Time', { exact: true }).fill(first.time);
    await page.getByLabel('First day', { exact: true }).fill(first.date);
    await page.getByLabel('Last day', { exact: true }).fill(last);
    assert.equal(await page.getByLabel('Timezone', { exact: true }).inputValue(), zone);
    await page.getByRole('button', { name: 'Review repeating reminder', exact: true }).click();
    const review = page.getByRole('region', { name: 'Review repeating reminder' });
    await page.getByRole('heading', { name: 'Review repeating reminder', exact: true }).waitFor();
    await page.getByText(`Every day at ${first.time}`, { exact: true }).waitFor();
    await page.getByText('Alex Morgan (you)', { exact: true }).waitFor();
    assert.equal(await review.getByRole('listitem').count(), 7);
    await page.screenshot({ path: path.join(root, '.local/screenshots/series-review-live-desktop.png'), fullPage: true });

    const attempts = [];
    let acceptedId;
    await page.route('**/api/reminder-series', async route => {
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
    await page.getByRole('button', { name: 'Save repeating reminder', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Change', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await page.getByText('Repeating reminder saved.', { exact: true }).waitFor();
    await page.unroute('**/api/reminder-series');
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    let listed = (await (await context.request.get(`${base}/api/reminder-series?task_id=${task.id}`, { headers })).json()).data;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, acceptedId);
    assert.equal(listed[0].status, 'active');
    assert.equal(Date.parse(listed[0].next_occurrence.scheduled_at), due.getTime());
    const seriesSection = page.getByRole('region', { name: 'Repeating reminders' });
    await seriesSection.getByText(`Every day at ${first.time}`, { exact: true }).waitFor();

    const plan = await context.request.get(`${base}/api/calendar?${new URLSearchParams({ space_id: space.id, start_date: first.date, end_date: last, timezone: zone, limit: '50' })}`, { headers });
    assert.equal(plan.status(), 200, await plan.text());
    const entries = (await plan.json()).data;
    assert.deepEqual(entries.map(entry => entry.kind), ['reminder', 'planned', 'planned', 'planned', 'planned', 'planned', 'planned']);
    assert.ok(entries.every(entry => entry.series_id === acceptedId));
    await page.goto(`${base}/app/calendar?space_id=${space.id}`);
    await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
    await page.getByLabel('Display timezone', { exact: true }).selectOption(zone);
    await page.getByLabel('Month', { exact: true }).fill(addDays(first.date, 1).slice(0, 7));
    await page.locator('li[data-kind="planned"]').first().waitFor();
    await page.locator('li[data-kind="planned"]').first().getByText('Planned, repeating', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/series-calendar-live-desktop.png'), fullPage: true });
    await noOverflow(page, 'calendar');
    await page.setViewportSize({ width: 1440, height: 1000 });

    const other = await otherContext.newPage();
    await signUp(other, `series-other-${Date.now()}@example.test`);
    const otherAccount = (await (await otherContext.request.get(`${base}/api/me`)).json()).data;
    const otherHeaders = { Origin: base, 'X-Account-ID': otherAccount.id };
    assert.equal((await otherContext.request.get(`${base}/api/reminder-series/${acceptedId}`, { headers: otherHeaders })).status(), 404);
    assert.equal((await otherContext.request.post(`${base}/api/reminder-series/${acceptedId}/cancel`, {
      headers: { ...otherHeaders, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': listed[0].etag }, data: {},
    })).status(), 404);
    assert.deepEqual((await (await otherContext.request.get(`${base}/api/reminder-series`, { headers: otherHeaders })).json()).data, []);

    const deadline = due.getTime() + 120000;
    let notification;
    while (Date.now() < deadline) {
      notification = (await (await context.request.get(`${base}/api/notifications`, { headers })).json()).data.find(item => item.series_id === acceptedId);
      if (notification) break;
      await delay(1000);
    }
    assert.ok(notification, 'The real worker did not deliver the first occurrence before the deadline.');
    assert.equal(notification.can_snooze, true);
    listed = (await (await context.request.get(`${base}/api/reminder-series?task_id=${task.id}`, { headers })).json()).data;
    assert.equal(listed[0].next_occurrence.local_date, addDays(first.date, 1));
    assert.equal(Date.parse(notification.snooze_before), Date.parse(listed[0].next_occurrence.scheduled_at));

    await page.goto(`${base}/app/notifications`);
    await page.getByRole('heading', { name: 'Inbox', exact: true }).waitFor();
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
    await row.getByRole('button', { name: `Snooze reminder: ${task.title}`, exact: true }).click();
    const snooze = page.getByRole('dialog', { name: 'Snooze this reminder?', exact: true });
    assert.equal(await snooze.getByRole('radio', { name: /^1 day/ }).isDisabled(), true);
    await snooze.getByRole('radio', { name: /^10 minutes/ }).check();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/screenshots/series-snooze-live-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const snoozes = [];
    await page.route('**/api/notifications/*/snooze', async route => {
      snoozes.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      if (snoozes.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        return route.abort('failed');
      }
      return route.continue();
    });
    await snooze.getByRole('button', { name: 'Snooze', exact: true }).click();
    await snooze.getByRole('alert').filter({ hasText: 'No connection' }).waitFor();
    await snooze.getByRole('button', { name: 'Retry original snooze', exact: true }).click();
    await page.getByText(/Snoozed until /).first().waitFor();
    await page.unroute('**/api/notifications/*/snooze');
    assert.equal(snoozes.length, 2);
    assert.deepEqual(snoozes[0], snoozes[1]);
    assert.deepEqual(snoozes[0].body, { minutes: 10 });
    await row.getByText(/Snoozed until /).waitFor();
    const snoozed = (await (await context.request.get(`${base}/api/notifications`, { headers })).json()).data.find(item => item.id === notification.id);
    assert.ok(snoozed.snoozed_until);
    assert.equal(snoozed.can_snooze, false);
    assert.ok(snoozed.read_at);
    const followUps = (await (await context.request.get(`${base}/api/reminders?task_id=${task.id}`, { headers })).json()).data.filter(item => item.follow_up_of);
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].status, 'scheduled');
    assert.equal(followUps[0].snooze_count, 1);

    await page.goto(`${base}/app/reminders?task_id=${task.id}`);
    await seriesSection.getByText(`Every day at ${first.time}`, { exact: true }).waitFor();
    async function act(label, dialogName, confirm, notice) {
      await seriesSection.getByRole('button', { name: `${label}: ${task.title}`, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
      await dialog.getByRole('button', { name: confirm, exact: true }).click();
      await page.getByText(notice, { exact: true }).waitFor();
      return (await (await context.request.get(`${base}/api/reminder-series/${acceptedId}`, { headers })).json()).data;
    }
    let current = await act('Skip next reminder', 'Skip the next reminder?', 'Skip next reminder', 'Next reminder skipped.');
    assert.equal(current.next_occurrence.local_date, addDays(first.date, 2));
    current = await act('Pause repeating reminder', 'Pause this repeating reminder?', 'Pause', 'Repeating reminder paused.');
    assert.deepEqual([current.status, current.reason, current.next_occurrence], ['paused', 'by_person', null]);
    await seriesSection.getByText('Paused by you.', { exact: true }).waitFor();
    current = await act('Resume repeating reminder', 'Resume this repeating reminder?', 'Resume', 'Repeating reminder resumed.');
    assert.equal(current.status, 'active');
    assert.equal(current.next_occurrence.local_date, addDays(first.date, 2));
    const held = (await (await context.request.get(`${base}/api/reminders?task_id=${task.id}`, { headers })).json()).data
      .filter(item => item.occurrence_date === addDays(first.date, 2) && !item.follow_up_of);
    assert.deepEqual(held.map(item => [item.id, item.status, item.reason]), [[current.next_occurrence.reminder_id, 'scheduled', null]]);
    await noOverflow(page, 'reminders');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => ['Refresh reminders', 'Refresh repeating reminders']
      .every(label => document.querySelector(`[aria-label="${label}"]`)?.hasAttribute('disabled') === false));
    await page.screenshot({ path: path.join(root, '.local/screenshots/series-list-live-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    current = await act('Cancel repeating reminder', 'Cancel this repeating reminder?', 'Cancel repeating reminder', 'Repeating reminder cancelled.');
    assert.deepEqual([current.status, current.next_occurrence], ['cancelled', null]);
    assert.equal(await seriesSection.getByRole('button', { name: `Resume repeating reminder: ${task.title}`, exact: true }).count(), 0);
    const settled = (await (await context.request.get(`${base}/api/reminders?task_id=${task.id}`, { headers })).json()).data;
    assert.deepEqual(settled.filter(item => item.follow_up_of).map(item => [item.status, item.reason]), [['cancelled', 'series_cancelled']]);
    assert.equal(settled.filter(item => item.status === 'scheduled').length, 0);
    const stale = await context.request.post(`${base}/api/reminder-series/${acceptedId}/resume`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': listed[0].etag }, data: {},
    });
    assert.equal(stale.status(), 412);
    assert.equal((await context.request.get(`${base}/api/tasks/${task.id}`, { headers }).then(response => response.json())).data.status, 'open');
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await otherContext.close();
  }
});
