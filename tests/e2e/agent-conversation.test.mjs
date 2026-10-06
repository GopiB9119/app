// DEC-047, T213/T214: the Agent creates events after the person approves them and writes short, labelled replies from the
// owner's Azure test model. Live against the local API and the web preview at http://127.0.0.1:3000, synthetic accounts only.
// The event journey needs no model. The reply journey needs the API started with infra/compose.agent-model.yaml and
// COMMUNITY_AGENT_MODEL_LIVE=1, and every model call counts towards the owner's limits (Q44).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
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
const note = 'Written by the test model, not checked. It may be wrong, and nothing was changed.';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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

// A day 40 days ahead in Kolkata, written the way a person asks for it and the way the Agent shows it.
function ahead() {
  const moment = new Date(Date.now() + 40 * 86400000);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(moment);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(moment);
  const month = Number(iso.slice(5, 7)) - 1;
  const day = Number(iso.slice(8, 10));
  return { iso, asked: `${day} ${longMonths[month]}`, shown: `${weekday} ${day} ${months[month]} ${iso.slice(0, 4)}` };
}

async function openAgent(browserContext, label) {
  const external = [];
  await browserContext.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    external.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  const page = await browserContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const suffix = Date.now();
  await signUp(page, `${label}-${suffix}@example.test`);
  const owner = (await (await browserContext.request.get(`${base}/api/me`)).json()).data;
  const headers = { Origin: base, 'X-Account-ID': owner.id };
  const created = await browserContext.request.post(`${base}/api/spaces`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: `${label} family ${suffix}`, space_type: 'family' },
  });
  assert.equal(created.status(), 201, await created.text());
  const family = (await created.json()).data;
  const read = async route => {
    const response = await browserContext.request.get(`${base}/api/${route}`, { headers });
    assert.equal(response.status(), 200, await response.text());
    return (await response.json()).data;
  };
  await page.getByRole('link', { name: 'Agent', exact: true }).click();
  await page.getByRole('heading', { name: 'Agent', exact: true, level: 1 }).waitFor();
  await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption({ label: family.name });
  await page.getByText('What can I help you with?', { exact: true }).waitFor();
  const request = page.getByRole('textbox', { name: /^(What do you want to do\?|Message the Agent)$/ });
  const ask = async message => {
    await request.fill(message);
    await page.getByRole('button', { name: /^(Ask|Send)$/ }).click();
    const card = page.getByRole('article', { name: message, exact: true });
    await card.waitFor();
    return card;
  };
  return { page, family, read, ask, headers, external, errors, events: () => read(`spaces/${family.id}/events`), tasks: () => read(`tasks?space_id=${family.id}`) };
}

test('agent workspace live: chat fits desktop, phones and short windows without sending a request', { timeout: 120000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, family, read, external, errors } = await openAgent(context, 'agent-layout');
    const stamp = Date.now();
    assert.equal(await page.locator('.environment, .inbox-link').count(), 0);
    assert.equal(await page.locator('a[href="http://127.0.0.1:8025"]').count(), 0);
    assert.equal(await page.getByText(/Local test environment|Local build/).count(), 0);
    await page.getByRole('button', { name: 'Auto-approve', exact: true }).click();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      const log = await page.getByRole('log', { name: 'Chat', exact: true }).boundingBox();
      const input = await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).boundingBox();
      assert.ok(log.height >= 120, JSON.stringify({ viewport, log }));
      assert.ok(input.y >= 0 && input.y + input.height <= viewport.height, JSON.stringify({ viewport, input }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-live-workspace-${stamp}-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    await page.getByRole('heading', { name: 'Your memories', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).waitFor();
    assert.deepEqual(await read(`agent-runs?space_id=${family.id}&limit=20`), [], 'layout checks must never send Agent requests');
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('agent public content: wellness page and post require exact review and publish once', {
  timeout: 240000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured real Azure model',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, family, read, ask, headers, tasks, external, errors } = await openAgent(context, 'agent-public');
    const stamp = Date.now();
    const handle = `wellness-${stamp}`;
    const message = `can you please create page and post randon health most usefull content. Use the unique handle ${handle}. Draft from general knowledge only; do not use web tools. Publish after my review.`;
    const card = await ask(message);
    const reviews = [];
    let runId;
    let pageName;
    let draft;
    for (const [tool, summary] of [
      ['community.pages.create', 'Create this public page.'],
      ['community.posts.create', 'Create this post draft.'],
      ['community.posts.publish', 'Publish this post.'],
    ]) {
      await card.getByText(summary, { exact: true }).waitFor({ timeout: 60000 });
      await card.getByRole('button', { name: 'Approve', exact: true }).waitFor();
      const proposed = (await read(`agent-runs?space_id=${family.id}&limit=20`)).find(run => run.message === message);
      assert.ok(proposed, 'the actual request has a persisted review');
      assert.equal(proposed.status, 'waiting_for_approval');
      assert.equal(proposed.approval.tool_name, tool);
      assert.equal(proposed.id, runId ?? proposed.id, 'the original request continues after each approval');
      runId = proposed.id;
      const reviewed = Object.fromEntries(proposed.approval.fields.map(field => [field.label, field.value]));
      reviews.push({ tool, fields: reviewed, approvalId: proposed.approval.id });
      if (tool === 'community.pages.create') {
        assert.equal(reviewed.Handle, `@${handle}`);
        assert.match(reviewed['Who can see it'], /public page/);
        assert.ok(reviewed.Name.length > 0);
        pageName = reviewed.Name;
        assert.deepEqual(await read('me/pages'), []);
        assert.equal((await visitor.request.get(`${base}/api/pages/${handle}`)).status(), 404);
      } else {
        assert.ok(reviewed.Text.length > 80);
        await card.getByText(reviewed.Text, { exact: true }).waitFor();
        assert.deepEqual(await read(`pages/${handle}/posts`), [], 'a public post needs its own publication approval');
        if (tool === 'community.posts.create') {
          assert.match(reviewed.Status, /Draft: not public/);
        } else {
          assert.equal(reviewed.Text, draft.body);
          assert.equal(reviewed.Title, draft.title ?? 'None');
          assert.equal(reviewed['Who can see it'], 'Everyone');
          assert.equal((await visitor.request.get(`${base}/api/posts/${draft.id}`)).status(), 404);
          await card.screenshot({ path: path.join(root, `.local/screenshots/agent-public-review-${stamp}-desktop.png`) });
          await page.setViewportSize({ width: 320, height: 844 });
          await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('*')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
            for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
          });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
          await card.screenshot({ path: path.join(root, `.local/screenshots/agent-public-review-${stamp}-320-200pct.png`) });
          assert.deepEqual(await read(`pages/${handle}/posts`), [], 'viewing or resizing the review must not publish it');
        }
      }
      const decisionPath = `/api/agent-approvals/${proposed.approval.id}/approve`;
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === decisionPath && response.request().method() === 'POST');
      await card.getByRole('button', { name: 'Approve', exact: true }).click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, await response.text());
      const repeated = await context.request.post(`${base}${decisionPath}`, {
        headers: { ...headers, 'If-Match': proposed.approval.etag, 'Idempotency-Key': response.request().headers()['idempotency-key'] },
        data: {},
      });
      assert.equal(repeated.status(), 200, await repeated.text());
      const current = await read(`agent-runs/${runId}`);
      const effects = current.tool_calls.filter(call => call.approval_id === proposed.approval.id && call.status === 'succeeded');
      assert.equal(effects.length, 1, 'the same approval must have one recorded effect');
      assert.equal(effects[0].tool_name, tool);
      if (tool === 'community.posts.create') {
        draft = await read(`posts/${effects[0].result_ref}`);
        assert.equal(draft.status, 'draft');
        assert.equal(draft.body, reviewed.Text);
        assert.equal(draft.title ?? 'None', reviewed.Title);
      }
      assert.equal((await read('me/pages')).length, 1);
      assert.deepEqual(await tasks(), [], 'page requests must not create tasks');
      assert.deepEqual(await read('agent-memories'), [], 'post text must not become personal memory');
    }
    let result = await read(`agent-runs/${runId}`);
    if (['queued', 'running', 'verifying'].includes(result.status)) {
      await page.waitForResponse(async response => {
        if (response.request().method() !== 'GET' || new URL(response.url()).pathname !== '/api/agent-runs' || response.status() !== 200) return false;
        return (await response.json()).data.some(run => run.id === runId && !['queued', 'running', 'verifying'].includes(run.status));
      }, { timeout: 60000 });
      result = await read(`agent-runs/${runId}`);
    }
    assert.equal(result.status, 'completed');
    assert.equal(result.outcome, 'action_completed');
    await card.getByText(result.answer, { exact: true }).waitFor();
    assert.equal(result.tool_calls.filter(call => call.effect === 'write' && call.status === 'succeeded').length, 3);
    assert.equal(result.tool_calls.some(call => call.tool_name.startsWith('web.')), false);
    const owned = await read('me/pages');
    assert.equal(owned.length, 1);
    assert.equal(owned[0].name, pageName);
    const posts = await read(`pages/${handle}/posts`);
    assert.equal(posts.length, 1, 'the reviewed steps produce one published post');
    assert.deepEqual([posts[0].id, posts[0].title, posts[0].body, posts[0].status], [draft.id, draft.title, draft.body, 'published']);
    const publicPage = await visitor.newPage();
    await publicPage.goto(`${base}/pages/${handle}`);
    await publicPage.getByRole('heading', { name: pageName, exact: true, level: 1 }).waitFor();
    await publicPage.getByText(draft.body, { exact: true }).waitFor();
    assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await publicPage.screenshot({ path: path.join(root, `.local/screenshots/agent-public-published-${stamp}.png`), fullPage: true });
    const evidence = { request: message, run: result, reviews, pageUrl: `${base}/pages/${handle}`, postUrl: `${base}/posts/${posts[0].id}` };
    await mkdir(path.join(root, '.local/t235'), { recursive: true });
    await writeFile(path.join(root, `.local/t235/live-public-${stamp}.json`), JSON.stringify(evidence, null, 2), { flag: 'wx' });
    testContext.diagnostic(`Agent-created page: ${evidence.pageUrl}`);
    testContext.diagnostic(`Agent-published post: ${evidence.postUrl}`);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await visitor.close();
  }
});

test('agent events: an event is shown first, created only after approval and visible on the Events screen, live', { timeout: 240000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, family, ask, read, events, external, errors } = await openAgent(context, 'agent-events');
    const when = ahead();

    const dinner = await ask(`create an event birthday dinner on ${when.asked} at 6 pm`);
    await dinner.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.deepEqual(await dinner.locator('dt').allTextContents(), ['Space', 'Title', 'Starts', 'Ends', 'Time zone', 'Who can see it']);
    assert.deepEqual(await dinner.locator('dd').allTextContents(), [
      family.name, 'Birthday dinner', `${when.shown}, 18:00`, 'Not set', 'Asia/Kolkata (UTC+05:30)', 'Members of this Space',
    ]);
    assert.deepEqual(await events(), [], 'nothing is created before approval');
    await dinner.getByRole('button', { name: 'Approve', exact: true }).click();
    await dinner.getByText('Done. Created the event \u201cBirthday dinner\u201d.', { exact: true }).waitFor();
    const [created] = await events();
    assert.deepEqual([created.title, created.timezone, created.local_start, created.local_end, created.status],
      ['Birthday dinner', 'Asia/Kolkata', `${when.iso}T18:00`, null, 'scheduled']);

    // The same event is on the Events screen, created by the same service the screen uses.
    await page.goto(`${base}/app/events?space_id=${family.id}`);
    await page.getByRole('heading', { name: 'Events', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Birthday dinner', exact: true }).waitFor();

    // A missing start is asked for, an end time is read, and asking people in is refused: none of it creates anything.
    await page.getByRole('link', { name: 'Agent', exact: true }).click();
    await page.getByRole('combobox', { name: 'Space', exact: true }).selectOption({ label: family.name });
    const request = page.getByRole('textbox', { name: 'What do you want to do?', exact: true });
    const send = async message => {
      await request.fill(message);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      const card = page.getByRole('article', { name: message, exact: true });
      await card.waitFor();
      return card;
    };
    const picnic = await send('create an event picnic');
    await picnic.getByText('When does it start? For example: Saturday at 6 pm.', { exact: true }).waitFor();
    await picnic.getByLabel('Your answer').fill(`${when.asked} at 4 pm until 7 pm`);
    await picnic.getByRole('button', { name: 'Answer', exact: true }).click();
    await picnic.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const facts = await picnic.locator('dd').allTextContents();
    assert.deepEqual(facts.slice(1, 4), ['Picnic', `${when.shown}, 16:00`, `${when.shown}, 19:00`]);
    assert.equal((await events()).length, 1);
    await picnic.getByRole('button', { name: 'Don\'t do it', exact: true }).click();
    await picnic.getByText('Okay. Nothing was changed.', { exact: true }).waitFor();

    const invite = await send(`create an event barbecue on ${when.asked} at 5 pm and invite Sam`);
    await invite.getByText('I can\'t invite, remove or change members or roles. The Space owner manages membership on the Spaces screen.', { exact: true }).waitFor();
    assert.equal(await invite.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
    assert.equal((await events()).length, 1, 'only the approved event exists');

    // The approval card fits the narrowest width at 200% text.
    const last = await send(`schedule a meeting with the plumber on ${when.asked} at 3 pm`);
    await last.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-event-approval-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-event-approval-320-200pct.png'), fullPage: true });
    // The raw runs the server sent (synthetic account), kept so the Android decoder can be checked against real answers.
    await writeFile(path.join(root, '.local/t213-captured-event-runs.json'), JSON.stringify(await read(`agent-runs?space_id=${family.id}&limit=20`), null, 2));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('agent natural conversation: real replies and approved records preserve the reported details', {
  timeout: 300000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured real Azure model',
}, async t => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, family, read, ask, events, tasks, external, errors } = await openAgent(context, 'agent-natural');
    const runs = () => read(`agent-runs?space_id=${family.id}&limit=20`);
    const memories = () => read('agent-memories');
    const stored = async message => {
      const run = (await runs()).find(item => item.message === message);
      assert.ok(run, message);
      return run;
    };
    const recipe = 'i want make chiken curry i dont what are ingreadions to buy can you tell me';
    let recipeCard;
    for (const message of ['hi', recipe]) {
      const card = await ask(message);
      await card.getByText(note, { exact: false }).waitFor();
      const run = await stored(message);
      assert.deepEqual([run.intent, run.status, run.outcome, run.approval, run.tool_calls],
        ['reply', 'completed', 'answered', null, []]);
      assert.ok(run.events.some(event => event.summary === 'The test model wrote a reply.'));
      assert.ok(run.answer.length > note.length + 4);
      if (message === recipe) {
        assert.match(run.answer, /chicken/i);
        assert.ok((run.answer.match(/onion|garlic|ginger|tomato|spice|turmeric|coconut|yogurt|oil/gi) ?? []).length >= 2);
        recipeCard = card;
      }
      t.diagnostic(`${message} => ${run.answer}`);
    }
    assert.deepEqual(await Promise.all([tasks(), events(), memories()]), [[], [], []]);

    const task = await ask('add a taks to buy milk');
    await task.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal((await stored('add a taks to buy milk')).approval.fields.find(field => field.label === 'Title').value, 'Buy milk');
    assert.deepEqual(await tasks(), []);
    await task.getByRole('button', { name: 'Approve', exact: true }).click();
    await task.getByText(/^Done\. Created /).waitFor();
    assert.deepEqual((await tasks()).map(item => item.title), ['Buy milk']);

    const eventMessage = 'create an event birthday dinner on Saturday at 6 am in dec';
    const dinner = await ask(eventMessage);
    await dinner.getByText('Which Saturday in December do you mean? Give the exact date.', { exact: true }).waitFor();
    const pendingEvent = await stored(eventMessage);
    assert.equal(pendingEvent.approval, null);
    assert.deepEqual(await events(), []);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    let year = Number(today.slice(0, 4));
    const firstSaturday = calendarYear => {
      const first = new Date(Date.UTC(calendarYear, 11, 1));
      return new Date(Date.UTC(calendarYear, 11, 1 + (6 - first.getUTCDay() + 7) % 7));
    };
    if (firstSaturday(year).toISOString().slice(0, 10) <= today) year += 1;
    const december = firstSaturday(year).toISOString().slice(0, 10);
    await dinner.getByLabel('Your answer', { exact: true }).fill(december);
    await dinner.getByRole('button', { name: 'Answer', exact: true }).click();
    await dinner.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const eventProposal = await stored(eventMessage);
    assert.equal(eventProposal.id, pendingEvent.id);
    assert.equal(eventProposal.approval.fields.find(field => field.label === 'Title').value, 'Birthday dinner');
    assert.match(eventProposal.approval.fields.find(field => field.label === 'Starts').value, /Dec.*06:00$/);
    assert.deepEqual(await events(), []);
    await dinner.getByRole('button', { name: 'Approve', exact: true }).click();
    await dinner.getByText(/^Done\. Created the event /).waitFor();
    assert.deepEqual((await events()).map(item => [item.title, item.local_start]), [['Birthday dinner', `${december}T06:00`]]);

    const memory = await ask('can you save memory');
    await memory.getByText('What would you like me to remember?', { exact: true }).waitFor();
    const pendingMemory = await stored('can you save memory');
    assert.equal(pendingMemory.approval, null);
    assert.deepEqual(await memories(), []);
    const content = 'The spare key is in the kitchen drawer';
    await memory.getByLabel('Your answer', { exact: true }).fill(content);
    await memory.getByRole('button', { name: 'Answer', exact: true }).click();
    await memory.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const memoryProposal = await stored('can you save memory');
    assert.equal(memoryProposal.id, pendingMemory.id);
    assert.equal(memoryProposal.approval.fields.find(field => field.label === 'Remember').value, content);
    assert.deepEqual(await memories(), []);
    await memory.getByRole('button', { name: 'Approve', exact: true }).click();
    await memory.getByText(/^Done\. I'll remember /).waitFor();
    assert.deepEqual((await memories()).map(item => item.content), [content]);

    await recipeCard.locator('summary').click();
    assert.deepEqual(await recipeCard.locator('details h3').allTextContents(), ['Plan', 'Sources', 'Actions', 'Activity']);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-natural-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('*')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    const language = page.locator('select').filter({ has: page.locator('option[value="te"]') });
    for (const locale of ['en', 'te', 'hi']) {
      await language.selectOption(locale);
      await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
      const headings = await recipeCard.locator('details h3').allTextContents();
      assert.equal(headings.length, 4);
      assert.ok(headings.every(heading => heading.trim().length > 0));
      const rows = await recipeCard.locator('details li > p:first-child').allTextContents();
      assert.ok(rows.length > 0 && rows.every(row => row.trim().length > 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await recipeCard.screenshot({ path: path.join(root, `.local/screenshots/agent-natural-${locale}-320-200pct.png`) });
    }
    await mkdir(path.join(root, '.local/t232'), { recursive: true });
    await writeFile(path.join(root, `.local/t232/live-browser-runs-${Date.now()}.json`), JSON.stringify(await runs(), null, 2));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('agent conversation: the test model writes labelled replies that change nothing, and reads an unclear event request', {
  timeout: 300000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'needs the API started with infra/compose.agent-model.yaml and COMMUNITY_AGENT_MODEL_LIVE=1',
}, async t => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const { page, family, read, ask, events, tasks, external, errors } = await openAgent(context, 'agent-chat');
    const when = ahead();
    const understood = async message => {
      const run = (await read(`agent-runs?space_id=${family.id}&limit=20`)).find(item => item.message === message);
      assert.ok(run, message);
      return run;
    };

    for (const message of ['thanks, that was really helpful', 'who are you?', 'what is a PDF file']) {
      const card = await ask(message);
      await card.getByText(note, { exact: false }).waitFor();
      assert.equal(await card.getByRole('button', { name: 'Approve', exact: true }).count(), 0, message);
      const run = await understood(message);
      assert.deepEqual([run.intent, run.status, run.outcome, run.approval, run.tool_calls.length], ['reply', 'completed', 'answered', null, 0], message);
      assert.ok(run.answer.endsWith(note) && run.answer.length > note.length + 4, message);
      t.diagnostic(`${message} => ${run.answer}`);
      assert.ok(!run.answer.includes('I can\'t do that yet'), message);
      assert.ok(run.events.some(event => event.summary === 'The test model wrote a reply.'), message);
    }

    // A request to act is never answered with a reply: it is refused or stays "I can't do that yet".
    const dizzy = await ask('I feel dizzy and my chest hurts, what should I do');
    await dizzy.getByText(/I can't help with medicines, doses, symptoms/).waitFor();
    assert.equal((await understood('I feel dizzy and my chest hurts, what should I do')).intent, 'refuse');
    const video = await ask('find me a video of a dancing cat');
    const unsupported = await understood('find me a video of a dancing cat');
    assert.equal(unsupported.intent, 'unknown');
    assert.equal(unsupported.approval, null);
    assert.deepEqual(unsupported.tool_calls, []);
    assert.ok(unsupported.answer.trim());
    await video.getByText(unsupported.answer, { exact: true }).waitFor();
    await video.getByText('Not understood', { exact: true }).waitFor();

    // The model reads an unclear request into an event; the person still approves the exact fields.
    const unclear = `could we have the neighbours over on ${when.asked} at seven in the evening for a get together`;
    const event = await ask(unclear);
    await event.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const fields = await event.locator('dd').allTextContents();
    assert.match(fields[1], /neighbou?rs|get[- ]?together/i);
    assert.equal(fields[2], `${when.shown}, 19:00`);
    assert.deepEqual(await events(), [], 'nothing is created before approval');
    assert.deepEqual((await understood(unclear)).events.filter(item => item.event_type === 'run.understood').map(item => item.summary),
      ['Read your request with the test model.']);
    await event.getByRole('button', { name: 'Approve', exact: true }).click();
    await event.getByText(/^Done\. Created the event /).waitFor();
    assert.equal((await events()).length, 1);
    assert.deepEqual(await tasks(), [], 'no reply or refusal created a task');

    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-conversation-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-conversation-320-200pct.png'), fullPage: true });
    await writeFile(path.join(root, '.local/t213-captured-conversation-runs.json'), JSON.stringify(await read(`agent-runs?space_id=${family.id}&limit=20`), null, 2));
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
