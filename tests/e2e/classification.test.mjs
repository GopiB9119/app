// Live journey for T126/T127 against the local API and the web preview at http://127.0.0.1:3000.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
      return detail.Text.match(/code is (\d{6})/)[1];
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
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Your account' }).waitFor();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

test('classification: a classified page, private interests and an explained suggestion, live', { timeout: 240000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // The reader uses the narrowest supported width with text at 200%.
  const readerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  const readerPage = await readerContext.newPage();
  const errors = [];
  for (const page of [ownerPage, readerPage]) page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(ownerPage, `class-owner-${suffix}@example.test`);
    await signUp(readerPage, `class-reader-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const readerMe = await readerContext.request.get(`${base}/api/me`);
    assert.equal(readerMe.status(), 200, await readerMe.text());
    const reader = (await readerMe.json()).data;

    const vocabulary = await readerContext.request.get(`${base}/api/taxonomy`);
    assert.equal(vocabulary.status(), 200, await vocabulary.text());
    assert.equal((await vocabulary.json()).data.length, 271);

    const handle = `compost-${suffix}`;
    const created = await ownerContext.request.post(`${base}/api/pages`, {
      headers: { Origin: base, 'X-Account-ID': owner.id, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle, name: `Compost Club ${suffix}`, description: '', topic: 'environment',
        classification: { interests: ['composting'], languages: ['te'], places: ['in-telangana-hyderabad'] } },
    });
    assert.equal(created.status(), 201, await created.text());
    assert.deepEqual((await created.json()).data.classification.interests, ['composting']);

    const filtered = await readerContext.request.get(`${base}/api/discover/pages?place=in-telangana&limit=50`);
    assert.equal(filtered.status(), 200, await filtered.text());
    assert.ok((await filtered.json()).data.some(item => item.handle === handle));

    const readerHeaders = { Origin: base, 'X-Account-ID': reader.id };
    const current = (await (await readerContext.request.get(`${base}/api/me/interests`, { headers: readerHeaders })).json()).data;
    const saved = await readerContext.request.put(`${base}/api/me/interests`, {
      headers: { ...readerHeaders, 'If-Match': current.etag },
      data: { topics: [], interests: ['composting'], languages: ['te'], places: ['in-telangana'] },
    });
    assert.equal(saved.status(), 200, await saved.text());
    const stale = await readerContext.request.put(`${base}/api/me/interests`, {
      headers: { ...readerHeaders, 'If-Match': current.etag },
      data: { topics: ['food'], interests: [], languages: [], places: [] },
    });
    assert.equal(stale.status(), 412);

    const suggestedResponse = await readerContext.request.get(`${base}/api/me/suggested-pages?limit=20`, { headers: readerHeaders });
    assert.equal(suggestedResponse.status(), 200, await suggestedResponse.text());
    const suggested = (await suggestedResponse.json()).data;
    const mine = suggested.items.find(item => item.page.handle === handle);
    assert.ok(mine, JSON.stringify(suggested));
    assert.deepEqual(mine.reasons.map(reason => reason.code), ['composting', 'in-telangana', 'te']);

    await readerPage.setViewportSize({ width: 320, height: 800 });
    const ready = {
      interests: () => readerPage.getByText('composting', { exact: false }).or(readerPage.getByText('Composting')).first(),
      discover: () => readerPage.getByText(`Compost Club ${suffix}`).first(),
    };
    for (const [route, file] of [['/app/settings/interests', 'interests'], ['/app/discover', 'discover']]) {
      await readerPage.goto(`${base}${route}`);
      await readerPage.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      // The saved interest, and on Discover the suggested page, show once the screen has its data.
      await ready[file]().waitFor({ timeout: 90000 }).catch(async error => {
        throw new Error(`${error.message}\n${route} shows:\n${(await readerPage.locator('main').innerText()).slice(0, 1500)}`);
      });
      const overflow = await readerPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${route} scrolls sideways by ${overflow}px at 320 px and 200% text`);
      await readerPage.screenshot({ path: path.join(root, `.local/screenshots/t126-${file}-320.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await readerContext.close();
  }
});

test('interest posts and feed controls: a tagged post, a muted interest and Not interested with Undo, live', { timeout: 300000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const readerContext = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const ownerPage = await ownerContext.newPage();
  const readerPage = await readerContext.newPage();
  const errors = [];
  for (const page of [ownerPage, readerPage]) page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(ownerPage, `feed-owner-${suffix}@example.test`);
    await signUp(readerPage, `feed-reader-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const reader = (await (await readerContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const readerHeaders = { Origin: base, 'X-Account-ID': reader.id };

    // DEC-036: the owner tags one post with an interest; the page itself is about food.
    const created = await ownerContext.request.post(`${base}/api/pages`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle: `kitchen-${suffix}`, name: `Kitchen ${suffix}`, description: '', topic: 'food' },
    });
    assert.equal(created.status(), 201, await created.text());
    const body = `Kitchen scraps ${suffix} make compost.`;
    const drafted = await ownerContext.request.post(`${base}/api/pages/${(await created.json()).data.id}/posts`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { title: null, body, interests: ['composting'] },
    });
    assert.equal(drafted.status(), 201, await drafted.text());
    const draft = (await drafted.json()).data;
    const published = await ownerContext.request.post(`${base}/api/posts/${draft.id}/publish`, {
      headers: { ...ownerHeaders, 'If-Match': draft.etag }, data: {},
    });
    assert.equal(published.status(), 200, await published.text());
    assert.deepEqual((await published.json()).data.interests, ['composting']);

    // Composting sits under environment, so choosing environment brings the post, and says why.
    const current = (await (await readerContext.request.get(`${base}/api/me/interests`, { headers: readerHeaders })).json()).data;
    const saved = await readerContext.request.put(`${base}/api/me/interests`, {
      headers: { ...readerHeaders, 'If-Match': current.etag }, data: { topics: ['environment'], interests: [], languages: [], places: [] },
    });
    assert.equal(saved.status(), 200, await saved.text());
    const listed = async () => {
      const response = await readerContext.request.get(`${base}/api/me/interest-posts?limit=50`, { headers: readerHeaders });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data.find(item => item.post.id === draft.id);
    };
    assert.deepEqual((await listed())?.reasons, [{ dimension: 'topic', code: 'environment' }]);

    // DEC-037: a muted interest takes the post out of the list, but a search still finds it.
    const muted = await readerContext.request.post(`${base}/api/me/feed-controls`, {
      headers: readerHeaders, data: { kind: 'mute_term', dimension: 'interest', code: 'composting' },
    });
    assert.equal(muted.status(), 201, await muted.text());
    assert.equal(await listed(), undefined);
    const searched = await readerContext.request.get(`${base}/api/discover/posts?q=${encodeURIComponent(`scraps ${suffix}`)}`, { headers: readerHeaders });
    assert.ok((await searched.json()).data.some(item => item.id === draft.id));
    const removed = await readerContext.request.post(`${base}/api/me/feed-controls/${(await muted.json()).data.id}/remove`, { headers: readerHeaders, data: {} });
    assert.equal(removed.status(), 200, await removed.text());

    // On Discover at 320 px and 200% text: Not interested takes the post out at once, and Undo brings it back.
    await readerPage.goto(`${base}/app/discover`);
    await readerPage.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const section = readerPage.getByRole('region', { name: 'From your interests' });
    const card = section.getByRole('article').filter({ hasText: body });
    await card.waitFor({ timeout: 90000 });
    await card.getByRole('button', { name: 'More' }).click();
    await readerPage.getByRole('menuitem', { name: 'Not interested' }).click();
    await card.waitFor({ state: 'detached', timeout: 30000 });
    await readerPage.getByText('Post marked Not interested.').waitFor();
    const overflow = await readerPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `/app/discover scrolls sideways by ${overflow}px at 320 px and 200% text`);
    await readerPage.screenshot({ path: path.join(root, '.local/screenshots/t136-discover-320.png'), fullPage: true });
    await readerPage.getByRole('button', { name: 'Undo' }).first().click();
    await card.waitFor({ timeout: 30000 });
    assert.ok(await listed(), 'Undo brings the post back to the list');
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await readerContext.close();
  }
});

test('page insights: the owner sees totals that name nobody, live', { timeout: 300000 }, async () => {
  const ownerContext = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const readerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  const readerPage = await readerContext.newPage();
  const errors = [];
  for (const page of [ownerPage, readerPage]) page.on('pageerror', error => errors.push(error.message));
  try {
    const suffix = Date.now();
    await signUp(ownerPage, `insights-owner-${suffix}@example.test`);
    await signUp(readerPage, `insights-reader-${suffix}@example.test`);
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const reader = (await (await readerContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const readerHeaders = { Origin: base, 'X-Account-ID': reader.id };
    const handle = `insights-${suffix}`;
    const created = await ownerContext.request.post(`${base}/api/pages`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { handle, name: `Insights ${suffix}`, description: '', topic: 'hobbies' },
    });
    assert.equal(created.status(), 201, await created.text());
    const pageId = (await created.json()).data.id;
    const drafted = await ownerContext.request.post(`${base}/api/pages/${pageId}/posts`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { title: null, body: `Walk ${suffix}` },
    });
    const draft = (await drafted.json()).data;
    const published = await ownerContext.request.post(`${base}/api/posts/${draft.id}/publish`, { headers: { ...ownerHeaders, 'If-Match': draft.etag }, data: {} });
    assert.equal(published.status(), 200, await published.text());

    for (const [path, data, extra] of [[`pages/${pageId}/follow`, {}, {}], [`posts/${draft.id}/like`, {}, {}],
      [`posts/${draft.id}/comments`, { body: 'See you there' }, { 'Idempotency-Key': crypto.randomUUID() }]]) {
      const done = await readerContext.request.post(`${base}/api/${path}`, { headers: { ...readerHeaders, ...extra }, data });
      assert.ok(done.ok(), `${path}: ${done.status()} ${await done.text()}`);
    }

    // DEC-038: totals for the owner only, and nothing that names the reader.
    const response = await ownerContext.request.get(`${base}/api/pages/${pageId}/insights`, { headers: ownerHeaders });
    assert.equal(response.status(), 200, await response.text());
    const text = await response.text();
    const found = JSON.parse(text).data;
    assert.equal(found.follower_count, 1);
    assert.deepEqual(
      { new_followers: found.periods[0].new_followers, posts: found.periods[0].posts, comments: found.periods[0].comments, likes: found.periods[0].likes },
      { new_followers: 1, posts: 1, comments: 1, likes: 1 },
    );
    assert.ok(!text.includes(reader.id), 'insights never name who');
    const refused = await readerContext.request.get(`${base}/api/pages/${pageId}/insights`, { headers: readerHeaders });
    assert.equal(refused.status(), 403);

    // The owner opens them on the page at 320 px and 200% text.
    await ownerPage.goto(`${base}/pages/${handle}`);
    await ownerPage.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await ownerPage.getByRole('button', { name: 'Show insights' }).click({ timeout: 90000 });
    await ownerPage.getByText('Current followers: 1').waitFor({ timeout: 30000 });
    // The first live run passed while four of five columns sat off-screen; now each number must be on screen.
    const cells = ownerPage.getByRole('table', { name: 'Eight seven-day periods' }).getByRole('cell');
    assert.equal(await cells.count(), 32);
    const offScreen = await cells.evaluateAll(all => all.filter(cell => { const box = cell.getBoundingClientRect(); return box.width === 0 || box.left < 0 || box.right > 321; }).length);
    assert.equal(offScreen, 0, 'every insight number is on screen at 320 px and 200% text');
    const overflow = await ownerPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `the page scrolls sideways by ${overflow}px at 320 px and 200% text`);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/t132-insights-320.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await readerContext.close();
  }
});

function operator(operation, email) {
  // DEC-024: an operator names platform moderators with a local command; there is no screen for it.
  const result = spawnSync('docker', ['compose', '-f', 'infra/compose.yaml', 'exec', '-T', 'api', 'python3', '-m', 'app.cli', 'moderators', operation, email], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}${result.error ?? ''}`);
}

test('limited pages: a moderator limits a page, Discover drops it, comments pause, and an appeal lifts it, live', { timeout: 360000 }, async t => {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 320, height: 800 } }), browser.newContext({ viewport: { width: 1280, height: 900 } }),
    browser.newContext({ viewport: { width: 1280, height: 900 } }), browser.newContext({ viewport: { width: 1280, height: 900 } }),
  ]);
  const [ownerContext, readerContext, firstContext, secondContext] = contexts;
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [ownerPage, readerPage, firstPage, secondPage] = pages;
  const errors = [];
  for (const page of pages) page.on('pageerror', error => errors.push(error.message));
  const suffix = Date.now();
  const emails = ['owner', 'reader', 'first-moderator', 'second-moderator'].map(role => `limits-${role}-${suffix}@example.test`);
  // Runs even when the test times out, so no synthetic account keeps the moderator role.
  t.after(() => { for (const email of emails.slice(2)) spawnSync('docker', ['compose', '-f', 'infra/compose.yaml', 'exec', '-T', 'api', 'python3', '-m', 'app.cli', 'moderators', 'remove', email], { cwd: root, timeout: 120000 }); });
  try {
    for (const [index, page] of pages.entries()) await signUp(page, emails[index]);
    operator('add', emails[2]);
    operator('add', emails[3]);
    const accounts = await Promise.all(contexts.map(async context => (await (await context.request.get(`${base}/api/me`)).json()).data));
    const headers = accounts.map(account => ({ Origin: base, 'X-Account-ID': account.id }));
    const handle = `limits-${suffix}`;
    const created = await ownerContext.request.post(`${base}/api/pages`, {
      headers: { ...headers[0], 'Idempotency-Key': crypto.randomUUID() }, data: { handle, name: `Limits ${suffix}`, description: '', topic: 'hobbies' },
    });
    assert.equal(created.status(), 201, await created.text());
    const pageId = (await created.json()).data.id;
    const drafted = await ownerContext.request.post(`${base}/api/pages/${pageId}/posts`, {
      headers: { ...headers[0], 'Idempotency-Key': crypto.randomUUID() }, data: { title: null, body: `Riverside walk ${suffix}` },
    });
    const draft = (await drafted.json()).data;
    assert.equal((await ownerContext.request.post(`${base}/api/posts/${draft.id}/publish`, { headers: { ...headers[0], 'If-Match': draft.etag }, data: {} })).status(), 200);
    const reported = await readerContext.request.post(`${base}/api/reports`, {
      headers: headers[1], data: { target_type: 'page', target_id: pageId, reason: 'spam', details: 'Synthetic live report' },
    });
    assert.equal(reported.status(), 201, await reported.text());
    const discovered = async () => (await (await readerContext.request.get(`${base}/api/discover/pages?q=${handle}`, { headers: headers[1] })).json()).data.map(item => item.id);
    assert.deepEqual(await discovered(), [pageId]);

    // The first moderator limits the page from the queue (DEC-040).
    await firstPage.goto(`${base}/app/moderation`);
    const item = firstPage.getByRole('article', { name: 'Page report' }).filter({ hasText: `Limits ${suffix}` });
    // The queue is oldest first, so earlier reports in a shared dev database can push this one past the first page.
    const more = firstPage.getByRole('button', { name: 'Load more' });
    await firstPage.getByRole('article').first().waitFor({ timeout: 90000 });
    while (!(await item.count()) && await more.isVisible()) { await more.click(); await firstPage.waitForTimeout(500); }
    await item.getByRole('radio', { name: 'Limit page' }).check({ timeout: 90000 });
    await item.getByLabel('Reason').selectOption('spam');
    await item.getByRole('button', { name: 'Record decision' }).click();
    const deadline = Date.now() + 30000;
    while ((await discovered()).length && Date.now() < deadline) await delay(500);
    assert.deepEqual(await discovered(), [], 'a limited page leaves Discover');

    // A visitor still reads it, sees the pause, and cannot comment.
    await readerPage.goto(`${base}/pages/${handle}`);
    await readerPage.getByText('New posts and comments are paused on this page.', { exact: true }).waitFor({ timeout: 60000 });
    await readerPage.goto(`${base}/posts/${draft.id}`);
    await readerPage.getByText('Comments are paused on this page.', { exact: true }).waitFor({ timeout: 60000 });
    const comment = await readerContext.request.post(`${base}/api/posts/${draft.id}/comments`, {
      headers: { ...headers[1], 'Idempotency-Key': crypto.randomUUID() }, data: { body: 'Hello' },
    });
    assert.equal(comment.status(), 409);
    assert.equal((await comment.json()).error.code, 'PAGE_LIMITED');

    // The owner, at 320 px and 200% text, sees why and appeals; a different moderator lifts the limit.
    await ownerPage.goto(`${base}/pages/${handle}`);
    await ownerPage.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await ownerPage.getByText(/^A platform moderator limited this page for /).waitFor({ timeout: 60000 });
    const overflow = await ownerPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `the page scrolls sideways by ${overflow}px at 320 px and 200% text`);
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/t135-limited-owner-320.png'), fullPage: true });
    const notices = (await (await ownerContext.request.get(`${base}/api/me/moderation-notices`, { headers: headers[0] })).json()).data;
    const limit = notices.find(notice => notice.action === 'limit' && notice.target_id === pageId);
    assert.ok(limit, 'the owner is told about the limit');
    const appealed = await ownerContext.request.post(`${base}/api/moderation/decisions/${limit.id}/appeal`, {
      headers: { ...headers[0], 'Idempotency-Key': crypto.randomUUID() }, data: { note: 'The page is about walks, not spam.' },
    });
    assert.equal(appealed.status(), 201, await appealed.text());
    const appealId = (await appealed.json()).data.id;
    const resolved = await secondContext.request.post(`${base}/api/moderation/appeals/${appealId}/resolve`, {
      headers: headers[3], data: { outcome: 'overturned', note: 'Not spam.' },
    });
    assert.equal(resolved.status(), 200, await resolved.text());
    assert.deepEqual(await discovered(), [pageId], 'the lifted page is back in Discover');
    const reopened = await readerContext.request.post(`${base}/api/posts/${draft.id}/comments`, {
      headers: { ...headers[1], 'Idempotency-Key': crypto.randomUUID() }, data: { body: 'Hello again' },
    });
    assert.equal(reopened.status(), 201, await reopened.text());
    assert.deepEqual(errors, []);
  } finally {
    for (const context of contexts) await context.close();
  }
});
