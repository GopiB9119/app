import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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

async function session(context, page, prefix) {
  await signUp(page, `${prefix}-${Date.now()}@example.test`);
  const account = (await (await context.request.get(`${base}/api/me`)).json()).data;
  const headers = { Origin: base, 'X-Account-ID': account.id };
  const call = async (method, route, data, extra = {}) => {
    const response = await context.request.fetch(`${base}/api/${route}`, { method, headers: { ...headers, ...extra }, data });
    const body = await response.json();
    return { status: response.status(), body, etag: response.headers().etag };
  };
  return { account, headers, call };
}

test('alerts: change and move a repeating reminder, events in the calendar and file, backup person, event and dose alerts, quiet hours', { timeout: 420000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  memberPage.on('pageerror', error => errors.push(error.message));
  try {
    const owner = await session(ownerContext, page, 'alerts-owner');
    const member = await session(memberContext, memberPage, 'alerts-member');
    const zone = owner.account.timezone;
    const space = (await owner.call('POST', 'spaces', { name: 'Alert family', space_type: 'family' }, { 'Idempotency-Key': crypto.randomUUID() })).body.data;
    const invitation = await owner.call('POST', `spaces/${space.id}/invitations`, { recipient_account_id: member.account.id }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(invitation.status, 201, JSON.stringify(invitation.body));
    assert.equal((await member.call('POST', `invitations/${invitation.body.data.id}/accept`, {})).status, 200);
    await delay(1100);
    const newTask = async title => {
      const created = await owner.call('POST', 'tasks', { space_id: space.id, title, description: 'Synthetic alert check', due_date: null, assignee_account_id: null }, { 'Idempotency-Key': crypto.randomUUID() });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      return created.body.data;
    };
    const plants = await newTask('Water the plants');
    const bins = await newTask('Take out the bins');

    // Change a repeating reminder in the browser, then move only its next time.
    const tomorrow = addDays(localParts(new Date(), zone).date, 1);
    const preview = await owner.call('POST', 'reminder-series/preview', {
      task_id: plants.id, local_time: '09:00', timezone: zone, start_date: tomorrow, end_date: addDays(tomorrow, 6),
      frequency: 'daily', repeat_every: 1, weekdays: [], clock_change_policy: 'shift_forward',
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const original = await owner.call('POST', 'reminder-series', { preview_token: preview.body.data.preview_token }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(original.status, 201, JSON.stringify(original.body));
    await page.goto(`${base}/app/reminders?task_id=${plants.id}`);
    const repeating = page.getByRole('region', { name: 'Repeating reminders' });
    await repeating.getByText('Every day at 09:00', { exact: true }).waitFor();
    await repeating.getByRole('button', { name: `Change repeating reminder: ${plants.title}`, exact: true }).click();
    const change = page.getByRole('dialog', { name: 'Change repeating reminder', exact: true });
    await change.getByLabel('Time', { exact: true }).fill('10:00');
    await change.getByRole('button', { name: 'Review change', exact: true }).click();
    await change.getByRole('heading', { name: 'Review the change', exact: true }).waitFor();
    await change.getByText('Every day at 10:00', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/series-change-live-desktop.png'), fullPage: true });
    await change.getByRole('button', { name: 'Save change', exact: true }).click();
    await page.getByText('Repeating reminder changed.', { exact: true }).waitFor();
    let rows = (await owner.call('GET', `reminder-series?task_id=${plants.id}`)).body.data;
    const replaced = rows.find(item => item.id === original.body.data.id);
    const current = rows.find(item => item.status === 'active');
    assert.equal(replaced.status, 'cancelled');
    assert.equal(replaced.replaced_by, current.id);
    assert.equal(current.local_time, '10:00');
    assert.equal(current.next_occurrence.local_date, tomorrow);
    await repeating.getByRole('button', { name: `Move next reminder: ${plants.title}`, exact: true }).click();
    const moveDialog = page.getByRole('dialog', { name: 'Move the next reminder?', exact: true });
    await moveDialog.getByLabel('New time', { exact: true }).fill('11:30');
    await moveDialog.getByRole('button', { name: 'Move reminder', exact: true }).click();
    await page.getByText('Next reminder moved to 11:30.', { exact: true }).waitFor();
    rows = (await owner.call('GET', `reminder-series?task_id=${plants.id}`)).body.data;
    const moved = rows.find(item => item.id === current.id);
    assert.deepEqual([moved.next_occurrence.display_time, moved.next_occurrence.adjustment, moved.local_time], ['11:30', 'moved', '10:00']);
    await repeating.getByText('Next (moved):', { exact: false }).waitFor();
    assert.equal((await member.call('POST', `reminder-series/${current.id}/move`, { local_time: `${tomorrow}T12:00` }, { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': moved.etag })).status, 404);

    // A Space event appears in a member's calendar and in the downloaded calendar file.
    const event = await owner.call('POST', `spaces/${space.id}/events`, {
      title: 'Garden dinner', description: 'Synthetic', location: 'Home', timezone: zone, local_start: `${tomorrow}T18:00`, local_end: null,
    }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(event.status, 201, JSON.stringify(event.body));
    await memberPage.goto(`${base}/app/calendar?space_id=${space.id}`);
    await memberPage.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
    await memberPage.getByLabel('Display timezone', { exact: true }).selectOption(member.account.timezone);
    await memberPage.getByLabel('Month', { exact: true }).fill(tomorrow.slice(0, 7));
    const eventRow = memberPage.locator('li[data-kind="event"]').filter({ hasText: 'Garden dinner' });
    await eventRow.waitFor();
    await eventRow.getByText(`Event in ${zone}`, { exact: true }).waitFor();
    const [download] = await Promise.all([
      memberPage.waitForEvent('download'),
      memberPage.getByRole('button', { name: 'Download calendar file', exact: true }).click(),
    ]);
    assert.equal(download.suggestedFilename(), `calendar-${tomorrow.slice(0, 7)}.ics`);
    const file = await readFile(await download.path(), 'utf8');
    assert.match(file, /^BEGIN:VCALENDAR\r\n/);
    assert.ok(file.includes('SUMMARY:Event: Garden dinner'));
    assert.ok(file.includes(`UID:event-${event.body.data.id}@community-platform.local`));
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/calendar-event-live-desktop.png'), fullPage: true });

    // The owner asks the member to be a backup person; nothing happens until the member agrees.
    await page.goto(`${base}/app/reminders?task_id=${bins.id}`);
    const backupSection = page.getByRole('region', { name: 'Backup people' });
    await backupSection.getByLabel('Ask someone who can see this task', { exact: true }).selectOption(member.account.id);
    await backupSection.getByLabel('Alert them if unanswered after', { exact: true }).selectOption('15');
    await backupSection.getByRole('button', { name: 'Ask to be backup', exact: true }).click();
    await page.getByText('Asked Alex Morgan to be your backup person.', { exact: true }).waitFor();
    await memberPage.goto(`${base}/app/reminders`);
    const asked = memberPage.getByRole('region', { name: 'Backup people' });
    await asked.getByText('Take out the bins', { exact: true }).waitFor();
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/backup-request-live-mobile.png'), fullPage: true });
    await noOverflow(memberPage, 'backup request');
    await memberPage.setViewportSize({ width: 1440, height: 1000 });
    await asked.getByRole('button', { name: 'Agree', exact: true }).click();
    await memberPage.getByText('You agreed to be the backup person.', { exact: true }).waitFor();
    const arrangements = (await owner.call('GET', `reminder-backups?role=owner&task_id=${bins.id}`)).body.data;
    assert.deepEqual(arrangements.map(item => [item.status, item.wait_minutes, item.contact.account_id]), [['active', 15, member.account.id]]);

    // A real worker delivers the owner's reminder; the member's device is told when to look again.
    const due = new Date(Math.ceil((Date.now() + 70000) / 60000) * 60000);
    const one = localParts(due, zone);
    const reminderPreview = await owner.call('POST', 'reminders/preview', { task_id: bins.id, local_time: `${one.date}T${one.time}`, timezone: zone });
    assert.equal(reminderPreview.status, 200, JSON.stringify(reminderPreview.body));
    const reminder = await owner.call('POST', 'reminders', { preview_token: reminderPreview.body.data.options[0].preview_token }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(reminder.status, 201, JSON.stringify(reminder.body));
    const waiting = (await member.call('GET', 'me/alerts')).body.data;
    assert.equal(Date.parse(waiting.next_check_at), due.getTime() + 16 * 60000);
    let delivered;
    const deadline = due.getTime() + 120000;
    while (Date.now() < deadline && !delivered) {
      delivered = (await owner.call('GET', 'notifications')).body.data.find(item => item.reminder_id === reminder.body.data.id);
      if (!delivered) await delay(1000);
    }
    assert.ok(delivered, 'The real worker did not deliver the reminder before the deadline.');
    const ownerFeed = (await owner.call('GET', 'me/alerts')).body.data;
    assert.ok(ownerFeed.items.some(item => item.kind === 'reminder' && item.reference === delivered.id));
    const memberFeed = (await member.call('GET', 'me/alerts')).body.data;
    assert.equal(memberFeed.items.length, 0);
    assert.equal(Date.parse(memberFeed.next_check_at), Date.parse(delivered.created_at) + 15 * 60000);

    // The member sets an alert before an event that starts soon; it is due now in their inbox.
    const soon = localParts(new Date(Math.ceil((Date.now() + 40 * 60000) / 60000) * 60000), zone);
    const tea = await owner.call('POST', `spaces/${space.id}/events`, {
      title: 'Tea with grandma', description: '', location: '', timezone: zone, local_start: `${soon.date}T${soon.time}`, local_end: null,
    }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(tea.status, 201, JSON.stringify(tea.body));
    await memberPage.goto(`${base}/app/events?space_id=${space.id}`);
    await memberPage.getByRole('button', { name: /Tea with grandma/ }).click();
    await memberPage.getByLabel('Remind me', { exact: true }).selectOption('60');
    await memberPage.waitForFunction(() => document.querySelector('select[name="event_alert"]')?.value === '60' && !document.querySelector('select[name="event_alert"]')?.disabled);
    assert.equal((await member.call('GET', `events/${tea.body.data.id}/alert`)).body.data.minutes_before, 60);

    // Dose alerts are opt-in for the person's own medicine.
    const doseAt = localParts(new Date(Date.now() - 30 * 60000), zone);
    const medicine = await member.call('POST', 'care/instructions', {
      medicine_name: 'Synthetic Medicine B', strength: '5 mg', form: 'tablet', dose: '1 tablet', instructions: 'Synthetic.', source: 'self',
      timezone: zone, times: [doseAt.time], start_date: doseAt.date, end_date: null, confirmed: true,
    }, { 'Idempotency-Key': crypto.randomUUID() });
    assert.equal(medicine.status, 201, JSON.stringify(medicine.body));
    assert.equal((await owner.call('POST', `care/instructions/${medicine.body.data.id}/alerts`, { enabled: true })).status, 404);
    await memberPage.goto(`${base}/app/care`);
    await memberPage.getByRole('button', { name: 'My medicines', exact: true }).click();
    const doseToggle = memberPage.getByLabel('Alert me in this app at these times', { exact: true });
    // The box reflects the saved setting, so it changes only after the server confirms.
    await doseToggle.click();
    await memberPage.waitForFunction(() => {
      const box = document.querySelector('input[name="care_dose_alert"]');
      return box?.checked && !box.disabled;
    });

    // The inbox shows both alerts; dismissing one keeps the other. Quiet hours save with a reviewed version.
    await memberPage.goto(`${base}/app/notifications`);
    const dueNow = memberPage.getByRole('region', { name: 'Due now' });
    await dueNow.locator('li[data-alert-kind="event"]').filter({ hasText: 'Tea with grandma' }).waitFor();
    await dueNow.locator('li[data-alert-kind="dose"]').filter({ hasText: 'Synthetic Medicine B' }).waitFor();
    await dueNow.getByRole('button', { name: 'Dismiss alert: Tea with grandma', exact: true }).click();
    await dueNow.locator('li[data-alert-kind="event"]').waitFor({ state: 'detached' });
    await dueNow.locator('li[data-alert-kind="dose"]').waitFor();
    const quiet = memberPage.getByRole('group', { name: 'Quiet hours' });
    await quiet.getByLabel('From', { exact: true }).fill('22:00');
    await quiet.getByLabel('Until', { exact: true }).fill('07:00');
    await quiet.getByRole('button', { name: 'Save quiet hours', exact: true }).click();
    await quiet.getByText(`On, 22:00 to 07:00 (${member.account.timezone}).`, { exact: false }).waitFor();
    const settings = await member.call('GET', 'me/quiet-hours');
    assert.deepEqual([settings.body.data.start, settings.body.data.end, settings.body.data.version], ['22:00', '07:00', '1']);
    const stale = await member.call('PATCH', 'me/quiet-hours', { start: null, end: null }, { 'If-Match': '"alert-settings-stale"' });
    assert.equal(stale.status, 412);
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/alerts-inbox-live-desktop.png'), fullPage: true });
    await noOverflow(memberPage, 'inbox alerts');
    await memberPage.setViewportSize({ width: 390, height: 844 });
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/alerts-inbox-live-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
