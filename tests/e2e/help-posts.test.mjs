// D3: requests for help and offers of help, through the real website, proxy, API and database (synthetic accounts only).
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
  const email = `help-${name.toLowerCase()}-${Date.now()}@example.test`;
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

test('help loop: the owner opens a page, a follower asks, a helper replies privately and the asker marks it helped', { timeout: 240000 }, async () => {
  const stamp = Date.now();
  const people = [];
  try {
    const owner = await person('Priya');
    people.push(owner);
    const handle = `helpers-${stamp}`.slice(0, 30);
    const created = await owner.context.request.post(`${base}/api/pages`, {
      headers: { ...owner.headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle, name: 'Street Helpers', description: 'Neighbours helping neighbours.', topic: 'community' },
    });
    assert.equal(created.status(), 201, await created.text());
    await owner.page.goto(`${base}/pages/${handle}`);
    await owner.page.getByRole('heading', { name: 'Requests and offers' }).waitFor();
    await owner.page.getByRole('button', { name: 'Take requests and offers' }).click();
    await owner.page.getByRole('button', { name: 'Stop taking requests and offers' }).waitFor();

    const asker = await person('Asha');
    people.push(asker);
    await asker.page.goto(`${base}/pages/${handle}`);
    await asker.page.getByText('Follow this page to post a request or an offer.').waitFor();
    await asker.page.getByRole('button', { name: 'Follow', exact: true }).click();
    const form = asker.page.getByRole('form', { name: 'New request or offer' });
    await form.waitFor();
    await form.getByLabel('In a few words').fill('Call 98480 12345 for a ride');
    await form.getByText('Leave out phone numbers, email addresses and links. People share them in a private reply.').waitFor();
    await form.getByLabel('In a few words').fill('Need a ride to the clinic on Saturday');
    await form.getByLabel('Details (optional)').fill('Two people, back by noon.');
    await form.getByRole('button', { name: 'Post' }).click();
    const askerCard = asker.page.getByRole('article', { name: 'Need a ride to the clinic on Saturday' });
    await askerCard.waitFor();

    const helper = await person('Sam');
    people.push(helper);
    await helper.page.goto(`${base}/pages/${handle}`);
    const helperCard = helper.page.getByRole('article', { name: 'Need a ride to the clinic on Saturday' });
    await helperCard.getByRole('button', { name: 'I can help' }).click();
    await helperCard.getByRole('textbox', { name: 'Your private reply' }).fill('I can drive at 9. Call me on 98480 12345.');
    await helperCard.getByRole('button', { name: 'Send privately' }).click();
    await helperCard.getByText('You replied privately.').waitFor();

    // Nobody else sees the reply: a signed-out visitor sees the post without any reply text.
    const visitor = await browser.newContext();
    try {
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`${base}/pages/${handle}`);
      await visitorPage.getByRole('article', { name: 'Need a ride to the clinic on Saturday' }).waitFor();
      assert.equal(await visitorPage.getByText('98480 12345').count(), 0);
      await visitorPage.getByText('Sign in to ask for help or to offer it.').waitFor();
    } finally { await visitor.close(); }

    await asker.page.reload();
    await askerCard.getByText('1 private reply', { exact: false }).waitFor();
    await askerCard.getByRole('button', { name: 'Show replies' }).click();
    await askerCard.getByText('I can drive at 9. Call me on 98480 12345.').waitFor();
    await askerCard.getByRole('button', { name: 'This helped' }).click();
    await asker.page.getByText('No open requests or offers.').waitFor();
    await asker.page.getByRole('button', { name: 'All', exact: true }).click();
    await askerCard.getByText('Helped', { exact: true }).waitFor();
    await asker.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await asker.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await asker.page.screenshot({ path: path.join(root, `.local/screenshots/help-posts-live-${stamp}.png`), fullPage: true });

    const listed = await asker.context.request.get(`${base}/api/me/help-posts`, { headers: asker.headers });
    assert.equal(listed.status(), 200, await listed.text());
    assert.deepEqual((await listed.json()).data.map(item => [item.title, item.status]), [['Need a ride to the clinic on Saturday', 'helped']]);
  } finally {
    for (const item of people) await item.context.close();
  }
});

test('help reports: a reader reports a request and the page owner reads the note and keeps it', { timeout: 240000 }, async () => {
  const stamp = Date.now();
  const people = [];
  try {
    const owner = await person('Meera');
    people.push(owner);
    const handle = `reports-${stamp}`.slice(0, 30);
    const created = await owner.context.request.post(`${base}/api/pages`, {
      headers: { ...owner.headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle, name: 'Lane Helpers', description: 'Help on our lane.', topic: 'community' },
    });
    assert.equal(created.status(), 201, await created.text());
    const page = (await created.json()).data;
    const opened = await owner.context.request.patch(`${base}/api/pages/${page.id}`, {
      headers: { ...owner.headers, 'If-Match': page.etag }, data: { help_open: true },
    });
    assert.equal(opened.status(), 200, await opened.text());

    const asker = await person('Ravi');
    people.push(asker);
    assert.equal((await asker.context.request.post(`${base}/api/pages/${page.id}/follow`, { headers: asker.headers, data: {} })).status(), 200);
    const posted = await asker.context.request.post(`${base}/api/pages/${page.id}/help-posts`, {
      headers: { ...asker.headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { kind: 'request', title: 'Need help moving a sofa', details: 'Ground floor to the first floor.' },
    });
    assert.equal(posted.status(), 201, await posted.text());

    const reader = await person('Lata');
    people.push(reader);
    await reader.page.goto(`${base}/pages/${handle}`);
    const card = reader.page.getByRole('article', { name: 'Need help moving a sofa' });
    await card.getByText('New account', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Report', exact: true }).click();
    const dialog = reader.page.getByRole('dialog', { name: 'Report this request or offer' });
    await dialog.getByRole('radio', { name: 'Asks for money or fraud' }).check();
    await dialog.getByRole('textbox').fill('Asked me to pay a deposit first.');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await dialog.getByText(/^Report received\./).waitFor();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await card.getByText('Reported', { exact: true }).waitFor();

    // The author is not told; only the page's owner and moderators see the report, and never who sent it.
    await asker.page.goto(`${base}/pages/${handle}`);
    await asker.page.getByRole('article', { name: 'Need help moving a sofa' }).waitFor();
    assert.equal(await asker.page.getByText(/Reports to review/).count(), 0);

    await owner.page.goto(`${base}/pages/${handle}`);
    const managed = owner.page.getByRole('article', { name: 'Need help moving a sofa' });
    await managed.getByText('Reports to review: Asks for money or fraud (1)').waitFor();
    await managed.getByRole('button', { name: 'Show report notes' }).click();
    await managed.getByText('Asks for money or fraud: Asked me to pay a deposit first.').waitFor();
    assert.equal(await managed.getByText('Lata').count(), 0);
    await managed.getByRole('button', { name: 'Keep post' }).click();
    await managed.getByText(/^Reports to review/).waitFor({ state: 'detached' });
    await owner.page.screenshot({ path: path.join(root, `.local/screenshots/help-reports-live-${stamp}.png`), fullPage: true });
  } finally {
    for (const item of people) await item.context.close();
  }
});
