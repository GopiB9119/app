// D4: events on public pages, through the real website, proxy, API and database (synthetic accounts only).
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

async function person(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const email = `events-${name.toLowerCase()}-${Date.now()}@example.test`;
  await page.goto(`${base}/register`);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await page.getByRole('heading', { name: 'Complete your account' }).waitFor();
  await page.getByLabel('Verification code').fill(await mailCode(email));
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
  const account = (await (await context.request.get(`${base}/api/me`)).json()).data;
  return { context, page, account, headers: { Origin: base, 'X-Account-ID': account.id } };
}

test('page events: the owner publishes, a visitor sees no place, a person going sees it, and the owner cancels', { timeout: 240000 }, async () => {
  const stamp = Date.now();
  const people = [];
  try {
    const owner = await person('Kiran');
    people.push(owner);
    const handle = `walkers-${stamp}`.slice(0, 30);
    const created = await owner.context.request.post(`${base}/api/pages`, {
      headers: { ...owner.headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle, name: 'Lake Walkers', description: 'Walks around the lake.', topic: 'community' },
    });
    assert.equal(created.status(), 201, await created.text());
    const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await owner.page.goto(`${base}/pages/${handle}`);
    await owner.page.getByRole('heading', { name: 'Events' }).waitFor();
    await owner.page.getByRole('button', { name: 'New event' }).click();
    const form = owner.page.getByRole('form', { name: 'New event' });
    await form.getByLabel('Title').fill('Sunrise walk');
    await form.getByLabel('Starts').fill(`${start}T06:00`);
    await form.getByLabel('Time zone').selectOption('Asia/Kolkata');
    await form.getByLabel('Location', { exact: false }).fill('North gate, Lake Park');
    await form.getByLabel('Places (optional)').fill('2');
    await form.getByRole('button', { name: 'Publish event' }).click();
    const ownerCard = owner.page.getByRole('article', { name: 'Sunrise walk' });
    await ownerCard.getByText('North gate, Lake Park').waitFor();

    const visitor = await browser.newContext();
    try {
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`${base}/pages/${handle}`);
      const card = visitorPage.getByRole('article', { name: 'Sunrise walk' });
      await card.getByText('The place is shown to people who are going.').waitFor();
      assert.equal(await visitorPage.getByText('North gate, Lake Park').count(), 0);
      await card.getByText('Sign in to say you are going.').waitFor();
    } finally { await visitor.close(); }

    const walker = await person('Divya');
    people.push(walker);
    await walker.page.goto(`${base}/app/discover`);
    await walker.page.getByRole('heading', { name: "What's on" }).waitFor();
    await walker.page.getByRole('link', { name: 'Sunrise walk' }).first().click();
    await walker.page.waitForURL(`**/pages/${handle}`);
    await walker.page.goto(`${base}/pages/${handle}`);
    const walkerCard = walker.page.getByRole('article', { name: 'Sunrise walk' });
    await walkerCard.getByRole('button', { name: "I'm going" }).click();
    await walkerCard.getByText('You are going.').waitFor();
    await walkerCard.getByText('North gate, Lake Park').waitFor();
    await walkerCard.getByText('1 of 2 going').waitFor();
    const mine = await walker.context.request.get(`${base}/api/me/page-events`, { headers: walker.headers });
    assert.deepEqual((await mine.json()).data.map(item => item.title), ['Sunrise walk']);

    await owner.page.reload();
    await ownerCard.getByRole('button', { name: 'Who is going' }).click();
    await ownerCard.getByText('Divya', { exact: true }).waitFor();
    owner.page.once('dialog', dialog => dialog.accept());
    await ownerCard.getByRole('button', { name: 'Cancel event' }).click();
    await ownerCard.getByText('Cancelled', { exact: true }).waitFor();
    await walker.page.reload();
    await walkerCard.getByText('Cancelled', { exact: true }).waitFor();
    assert.equal(await walkerCard.getByRole('button', { name: "I'm going" }).count(), 0);
    await walker.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await walker.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await walker.page.screenshot({ path: path.join(root, `.local/screenshots/page-events-live-${stamp}.png`), fullPage: true });
  } finally {
    for (const item of people) await item.context.close();
  }
});
