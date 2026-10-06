// DEC-046, T212: @agent in a Space chat, live against the local API and the web preview at http://127.0.0.1:3000.
// Synthetic accounts only. The agent's fixed rules read every request here, so no model is called.
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

test('agent reported requests: groceries, task correction, event clarification and reminder save real records', { timeout: 240000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const external = [];
  const errors = [];
  try {
    await blockOutside(context, external);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const suffix = Date.now();
    await signUp(page, `agent-repair-${suffix}@example.test`, 'Agent Repair Test');
    const person = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': person.id };
    const created = await context.request.post(`${base}/api/spaces`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `Agent repair family ${suffix}`, space_type: 'family' },
    });
    assert.equal(created.status(), 201, await created.text());
    const space = (await created.json()).data;
    await page.goto(`${base}/app/agent?space_id=${space.id}`);
    await page.getByRole('heading', { name: 'Your requests', exact: true }).waitFor();
    const ask = async message => {
      await page.getByLabel('What do you want to do?', { exact: true }).fill(message);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
      const card = page.locator('article').filter({ has: page.getByText(message, { exact: true }) });
      await card.waitFor();
      return card;
    };
    const readRuns = async () => {
      const response = await context.request.get(`${base}/api/agent-runs`, { headers, params: { space_id: space.id } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data;
    };
    const readTasks = async () => {
      const response = await context.request.get(`${base}/api/tasks`, { headers, params: { space_id: space.id } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data;
    };
    const approveCard = async card => {
      await card.getByRole('button', { name: 'Approve', exact: true }).click();
      await card.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'detached' });
      await card.getByText('Done', { exact: true }).first().waitFor();
    };

    const grocery = await ask('create add eggs milk and onions curd tomato for tommrow');
    await grocery.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    const proposed = (await readRuns()).find(run => run.message === 'create add eggs milk and onions curd tomato for tommrow');
    assert.equal(proposed.approval.fields.find(field => field.label === 'Title').value, 'Eggs milk and onions curd tomato');
    assert.equal((await readTasks()).length, 0);
    const observer = await context.newPage();
    await observer.goto(`${base}/app/agent?space_id=${space.id}`);
    const observedGrocery = observer.locator('article').filter({ has: observer.getByText(proposed.message, { exact: true }) });
    await observedGrocery.getByRole('button', { name: 'Approve', exact: true }).waitFor();
    await approveCard(grocery);
    await observedGrocery.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'detached', timeout: 15000 });
    await observedGrocery.getByText('Done', { exact: true }).first().waitFor();
    await observer.close();
    const [task] = await readTasks();
    assert.equal(task.title, 'Eggs milk and onions curd tomato');
    assert.ok(task.due_date);
    await grocery.locator('details summary').click();
    for (const heading of ['Plan', 'Sources', 'Actions', 'Activity']) await grocery.getByRole('heading', { name: heading, exact: true }).waitFor();
    await grocery.getByText('Create the task: done.', { exact: true }).waitFor();

    const correction = await ask('try to update that again add proper data');
    await correction.getByLabel('Your answer', { exact: true }).fill('1');
    await correction.getByRole('button', { name: 'Answer', exact: true }).click();
    await correction.getByText(/What should change in/).waitFor();
    await correction.getByLabel('Your answer', { exact: true }).fill('title: Buy eggs milk onions curd tomato');
    await correction.getByRole('button', { name: 'Answer', exact: true }).click();
    await correction.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.equal((await readTasks())[0].title, task.title);
    await approveCard(correction);
    const [updated] = await readTasks();
    assert.equal(updated.id, task.id);
    assert.equal(updated.title, 'Buy eggs milk onions curd tomato');
    assert.equal(updated.due_date, task.due_date);
    assert.equal(updated.description, task.description);

    const eventCard = await ask('hi can you create event');
    await eventCard.getByLabel('Your answer', { exact: true }).fill('Family dinner tomorrow at 6 pm');
    await eventCard.getByRole('button', { name: 'Answer', exact: true }).click();
    await eventCard.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    await eventCard.getByText('Family dinner', { exact: true }).waitFor();
    await approveCard(eventCard);
    const eventRun = (await readRuns()).find(run => run.message === 'hi can you create event');
    assert.equal(eventRun.approval.tool_name, 'events.create');
    const eventResponse = await context.request.get(`${base}/api/events/${eventRun.approval.result_ref}`, { headers });
    assert.equal(eventResponse.status(), 200, await eventResponse.text());
    assert.equal((await eventResponse.json()).data.title, 'Family dinner');

    const reminder = await ask('remind me about Buy eggs milk onions curd tomato tomorrow at 7 pm');
    await reminder.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    await approveCard(reminder);
    const reminderRun = (await readRuns()).find(run => run.message.startsWith('remind me about Buy eggs'));
    assert.equal(reminderRun.approval.tool_name, 'reminders.schedule');
    assert.equal(reminderRun.outcome, 'action_completed');
    const reminders = await context.request.get(`${base}/api/reminders`, { headers });
    assert.equal(reminders.status(), 200, await reminders.text());
    assert.ok((await reminders.json()).data.some(item => item.id === reminderRun.approval.result_ref && item.task_id === task.id));
    assert.equal((await readTasks()).length, 1);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t217-agent-repair-live-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t217-agent-repair-live-320-large-text.png'), fullPage: true });
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await context.request.post(`${base}/api/auth/logout`, { headers, data: {} });
  } finally {
    await context.close();
  }
});

test('agent model content: natural grocery wording preserves every item and conversation changes nothing', {
  timeout: 180000, skip: process.env.COMMUNITY_AGENT_MODEL_LIVE !== '1',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const external = [];
  try {
    await blockOutside(context, external);
    const page = await context.newPage();
    await signUp(page, `agent-model-repair-${Date.now()}@example.test`, 'Model Repair Test');
    const person = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': person.id };
    const created = await context.request.post(`${base}/api/spaces`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `Model repair ${Date.now()}`, space_type: 'family' },
    });
    assert.equal(created.status(), 201, await created.text());
    const space = (await created.json()).data;
    await page.goto(`${base}/app/agent?space_id=${space.id}`);
    const request = 'Please put bread carrots and yogurt on my grocery list for tomorrow';
    await page.getByLabel('What do you want to do?', { exact: true }).fill(request);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const card = page.locator('article').filter({ has: page.getByText(request, { exact: true }) });
    await card.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor({ timeout: 20000 });
    const runs = await context.request.get(`${base}/api/agent-runs`, { headers, params: { space_id: space.id } });
    assert.equal(runs.status(), 200);
    const [run] = (await runs.json()).data;
    assert.equal(run.intent, 'create_task');
    assert.ok(run.events.some(event => event.event_type === 'run.understood' && event.summary.includes('Read your request with the test model')),
      'This case must actually use the configured model, not only the fixed parser.');
    const title = run.approval.fields.find(field => field.label === 'Title').value;
    for (const item of ['bread', 'carrots', 'yogurt']) assert.match(title.toLowerCase(), new RegExp(`\\b${item}\\b`));
    const before = await context.request.get(`${base}/api/tasks`, { headers, params: { space_id: space.id } });
    assert.equal((await before.json()).data.length, 0);
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await card.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'detached' });
    const after = await context.request.get(`${base}/api/tasks`, { headers, params: { space_id: space.id } });
    const [stored] = (await after.json()).data;
    assert.equal(stored.title, title);
    assert.ok(stored.due_date);

    const greeting = 'Thanks for helping me organise the groceries';
    await page.getByLabel('What do you want to do?', { exact: true }).fill(greeting);
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const reply = page.locator('article').filter({ has: page.getByText(greeting, { exact: true }) });
    await reply.getByText(/Written by the test model, not checked/).waitFor({ timeout: 20000 });
    const finished = await context.request.get(`${base}/api/agent-runs`, { headers, params: { space_id: space.id } });
    const conversation = (await finished.json()).data.find(item => item.message === greeting);
    assert.equal(conversation.intent, 'reply');
    assert.equal(conversation.approval, null);
    assert.deepEqual(conversation.tool_calls, []);
    assert.equal((await (await context.request.get(`${base}/api/tasks`, { headers, params: { space_id: space.id } })).json()).data.length, 1);
    testContext.diagnostic(`Real model proposal: ${title}. Conversation reply: ${conversation.answer}`);
    await page.screenshot({ path: path.join(root, '.local/screenshots/t217-agent-model-live.png'), fullPage: true });
    assert.deepEqual(external, []);
    await context.request.post(`${base}/api/auth/logout`, { headers, data: {} });
  } finally { await context.close(); }
});

test('agent messages review: the author reads private results and approves in the originating conversation (DEC-052)', { timeout: 240000 }, async () => {
  const external = [];
  const errors = [];
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const memberContext = await browser.newContext({ viewport: { width: 320, height: 720 } });
  try {
    await blockOutside(ownerContext, external);
    await blockOutside(memberContext, external);
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();
    for (const page of [ownerPage, memberPage]) page.on('pageerror', error => errors.push(error.message));
    const suffix = Date.now();
    await signUp(ownerPage, `mention-owner-${suffix}@example.test`, 'Alex Morgan');
    await signUp(memberPage, `mention-member-${suffix}@example.test`, 'Sam Rivera');
    const owner = (await (await ownerContext.request.get(`${base}/api/me`)).json()).data;
    const member = (await (await memberContext.request.get(`${base}/api/me`)).json()).data;
    const ownerHeaders = { Origin: base, 'X-Account-ID': owner.id };
    const memberHeaders = { Origin: base, 'X-Account-ID': member.id };
    const created = await ownerContext.request.post(`${base}/api/spaces`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { name: `Mention family ${suffix}`, space_type: 'family' },
    });
    assert.equal(created.status(), 201);
    const family = (await created.json()).data;
    // Made before Sam joins, so only Alex may see it.
    const title = `Water the ferns ${suffix}`;
    const task = await ownerContext.request.post(`${base}/api/tasks`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
      data: { space_id: family.id, title, description: '', due_date: null, assignee_account_id: owner.id },
    });
    assert.equal(task.status(), 201);
    const invitation = await ownerContext.request.post(`${base}/api/spaces/${family.id}/invitations`, {
      headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.id },
    });
    assert.equal(invitation.status(), 201);
    assert.equal((await memberContext.request.post(`${base}/api/invitations/${(await invitation.json()).data.id}/accept`, { headers: memberHeaders, data: {} })).status(), 200);

    await ownerPage.goto(`${base}/app/messages?space_id=${family.id}`);
    const ownerPane = ownerPage.getByRole('region', { name: 'Conversation', exact: true });
    await ownerPane.getByRole('heading', { name: family.name, exact: true }).waitFor();
    const ask = async text => {
      await ownerPane.getByLabel('Message', { exact: true }).fill(text);
      await ownerPane.getByRole('button', { name: 'Send', exact: true }).click();
    };
    const agentReply = (page, pane, text) => pane.getByRole('listitem').filter({ has: page.getByText('Agent', { exact: true }) }).filter({ hasText: text });

    // Answers are private by default (DEC-061). Everyone in the chat may see the help text, so Alex can share it.
    await ask('@agent help');
    await agentReply(ownerPage, ownerPane, 'I answered Alex Morgan privately').waitFor({ timeout: 20000 });
    const helpMessage = ownerPane.getByRole('listitem').filter({ hasText: '@agent help' }).filter({ has: ownerPage.getByRole('status') });
    await helpMessage.getByRole('button', { name: 'Share with everyone', exact: true }).click();
    await helpMessage.getByRole('group', { name: "Share the Agent's answer", exact: true }).getByRole('button', { name: 'Share', exact: true }).click();
    await agentReply(ownerPage, ownerPane, 'I can list tasks').waitFor({ timeout: 20000 });
    // The task list names a task Sam cannot see, so the chat only says Alex was answered privately.
    await ask('@agent list my tasks');
    await agentReply(ownerPage, ownerPane, 'I answered Alex Morgan privately').waitFor({ timeout: 20000 });
    const privateMessage = ownerPane.getByRole('listitem').filter({ hasText: '@agent list my tasks' });
    const privately = privateMessage.getByRole('status').filter({ hasText: 'The agent answered you privately.' });
    await privately.waitFor();
    await privately.getByRole('button', { name: 'Review here', exact: true }).click();
    const privatePanel = privateMessage.getByRole('region', { name: 'Your private request', exact: true });
    await privatePanel.waitFor();
    // A change waits for Alex's approval in this conversation; nothing is created before it.
    await ask('@agent add a task to buy milk tomorrow');
    await agentReply(ownerPage, ownerPane, 'I prepared this for you to approve').waitFor({ timeout: 20000 });
    const waitingMessage = ownerPane.getByRole('listitem').filter({ hasText: '@agent add a task to buy milk tomorrow' });
    const waiting = waitingMessage.getByRole('status').filter({ hasText: 'The agent is waiting for your answer or approval.' });
    await waiting.waitFor();
    await waiting.getByRole('button', { name: 'Review here', exact: true }).click();
    const waitingPanel = waitingMessage.getByRole('region', { name: 'Your private request', exact: true });
    await waitingPanel.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.ok(await privatePanel.getByText(title).count() > 0, 'The author can see the private task in this panel.');
    assert.equal(await agentReply(ownerPage, ownerPane, 'I answered Alex Morgan privately').getByText(title).count(), 0,
      'The private task list must not appear in the shared Agent reply.');
    await ownerPage.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-messages-review-live-owner.png'), fullPage: true });

    const chat = (await (await ownerContext.request.get(`${base}/api/conversations?space_id=${family.id}`, { headers: ownerHeaders })).json()).data[0];
    const ownerView = (await (await ownerContext.request.get(`${base}/api/conversations/${chat.id}/messages`, { headers: ownerHeaders })).json()).data;
    const asked = ownerView.filter(item => item.agent_request);
    assert.deepEqual(asked.map(item => [item.body, item.agent_request.status]), [
      ['@agent help', 'answered'], ['@agent list my tasks', 'private'], ['@agent add a task to buy milk tomorrow', 'waiting'],
    ]);
    const replies = ownerView.filter(item => item.from_agent);
    assert.equal(replies.length, 3);
    assert.ok(replies.every(item => !item.mine && item.sender_name === 'Agent' && item.sender_account_id !== owner.id));
    assert.ok(replies.every(item => !item.body.includes(title)), 'No agent reply names the task Sam cannot see.');
    const privateRunResponse = await ownerContext.request.get(`${base}/api/agent-runs/${asked[1].agent_request.run_id}`, { headers: ownerHeaders });
    assert.equal(privateRunResponse.status(), 200, await privateRunResponse.text());
    const privateRun = (await privateRunResponse.json()).data;
    assert.equal(privateRun.status, 'completed');
    assert.equal(privateRun.outcome, 'answered');
    await privatePanel.getByText(privateRun.answer, { exact: true }).waitFor();
    await privatePanel.getByRole('button', { name: 'Refresh requests', exact: true }).waitFor();
    const tasks = (await (await ownerContext.request.get(`${base}/api/tasks`, { headers: ownerHeaders, params: { space_id: family.id } })).json()).data;
    assert.deepEqual(tasks.map(item => item.title), [title], 'Nothing is created before Alex approves it.');

    const waitingRunResponse = await ownerContext.request.get(`${base}/api/agent-runs/${asked[2].agent_request.run_id}`, { headers: ownerHeaders });
    assert.equal(waitingRunResponse.status(), 200, await waitingRunResponse.text());
    const waitingRun = (await waitingRunResponse.json()).data;
    assert.equal(waitingRun.status, 'waiting_for_approval');
    assert.deepEqual(await waitingPanel.locator('dt').allTextContents(), waitingRun.approval.fields.map(field => field.label));
    assert.deepEqual(await waitingPanel.locator('dd').allTextContents(), waitingRun.approval.fields.map(field => field.value));
    await waitingPanel.getByRole('button', { name: 'Approve', exact: true }).click();
    await waitingPanel.getByRole('button', { name: 'Approve', exact: true }).waitFor({ state: 'detached' });
    const taskRunResponse = await ownerContext.request.get(`${base}/api/agent-runs/${waitingRun.id}`, { headers: ownerHeaders });
    assert.equal(taskRunResponse.status(), 200, await taskRunResponse.text());
    const taskRun = (await taskRunResponse.json()).data;
    assert.equal(taskRun.status, 'completed');
    assert.equal(taskRun.outcome, 'action_completed');
    await waitingPanel.getByText(taskRun.answer, { exact: true }).waitFor();
    const afterApproval = (await (await ownerContext.request.get(`${base}/api/tasks`, { headers: ownerHeaders, params: { space_id: family.id } })).json()).data;
    assert.ok(afterApproval.some(item => item.title === 'Buy milk'), 'The task exists only after the in-chat approval is confirmed.');

    // Asking again about an answered request changes nothing.
    const again = await ownerContext.request.post(`${base}/api/conversations/${chat.id}/messages/${asked[0].id}/agent`, { headers: ownerHeaders, data: {} });
    assert.equal(again.status(), 200);
    assert.equal((await again.json()).data.agent_request.status, 'answered');
    const after = (await (await ownerContext.request.get(`${base}/api/conversations/${chat.id}/messages`, { headers: ownerHeaders })).json()).data;
    assert.equal(after.length, ownerView.length);

    // Sam sees the agent's replies but not Alex's request statuses, and cannot change the agent's messages.
    const memberView = (await (await memberContext.request.get(`${base}/api/conversations/${chat.id}/messages`, { headers: memberHeaders })).json()).data;
    assert.ok(memberView.every(item => item.agent_request === null));
    assert.equal(memberView.filter(item => item.from_agent).length, 3);
    const denied = await memberContext.request.post(`${base}/api/conversations/${chat.id}/messages/${replies[0].id}/delete`, { headers: memberHeaders, data: {} });
    assert.equal(denied.status(), 403);
    await memberPage.goto(`${base}/app/messages?space_id=${family.id}`);
    const memberPane = memberPage.getByRole('region', { name: 'Conversation', exact: true });
    await agentReply(memberPage, memberPane, 'I can list tasks').waitFor({ timeout: 20000 });
    await agentReply(memberPage, memberPane, 'I answered Alex Morgan privately').waitFor();
    assert.equal(await memberPane.getByText(title).count(), 0);
    assert.equal(await memberPane.getByRole('button', { name: 'Review here', exact: true }).count(), 0);
    assert.equal(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways at 320 px.');
    await memberPage.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-messages-review-live-member-320.png'), fullPage: true });

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
