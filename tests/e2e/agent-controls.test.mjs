import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { prepareRuntime } from '../../scripts/synthetic-api.mjs';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'http://127.0.0.1:3000';
const runtimeFile = process.env.COMMUNITY_AGENT_CONTROLS_RUNTIME;
const options = { timeout: 180000, skip: runtimeFile ? false : 'requires an explicitly selected owned synthetic runtime' };
let runtime;
let browser;

before(async () => {
  if (!runtimeFile) return;
  runtime = prepareRuntime(runtimeFile);
  assert.ok(runtime.summary.providersDisabled && runtime.summary.tracingDisabled);
  assert.ok(Number(runtime.summary.recordedMigration) >= 59);
  browser = await chromium.launch({ executablePath: process.env.COMMUNITY_CHROMIUM_PATH, headless: true });
  await mkdir(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function mailCode(email) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await fetch(`${runtime.summary.mailUrl}/api/v1/messages`);
    assert.ok(response.ok, 'The owned synthetic mailbox must be available.');
    const mailbox = await response.json();
    const message = mailbox.messages.find(entry => entry.Subject.includes('registration') && entry.To.some(recipient => recipient.Address === email));
    if (message) {
      const detail = await fetch(`${runtime.summary.mailUrl}/api/v1/message/${message.ID}`).then(result => result.json());
      const code = detail.Text.match(/code is (\d{6})/);
      assert.ok(code, 'Synthetic registration mail must contain a verification code.');
      return code[1];
    }
    await delay(200);
  }
  throw new Error('The owned mail worker did not deliver the synthetic verification message.');
}

async function fixture(context, label) {
  const errors = [];
  const forbidden = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || url.pathname === '/api/agent-runs' && request.method() === 'POST') {
      forbidden.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const email = `agent-controls-${label}-${crypto.randomUUID()}@example.test`;
  await page.goto(`${base}/register`);
  await page.getByLabel('Email address').fill(email);
  const submitted = page.waitForResponse(response => response.url() === `${base}/api/auth/register` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  assert.equal((await submitted).status(), 202, 'Synthetic registration must be accepted.');
  await page.getByRole('heading', { name: 'Complete your account', exact: true }).waitFor();
  await page.getByLabel('Verification code').fill(await mailCode(email));
  await page.getByLabel('Display name', { exact: true }).fill('Agent controls synthetic');
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill('Synthetic-Meadow-49!');
  await page.getByRole('button', { name: 'Verify and create account', exact: true }).click();
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor();
  const accountResponse = await context.request.get(`${base}/api/me`);
  assert.equal(accountResponse.status(), 200);
  const account = (await accountResponse.json()).data;
  const headers = { Origin: base, 'X-Account-ID': account.id };
  const created = await context.request.post(`${base}/api/spaces`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: `Synthetic ${label} Space`, space_type: 'family' },
  });
  assert.equal(created.status(), 201, 'The synthetic test Space must be created.');
  const space = (await created.json()).data;
  const read = async route => {
    const response = await context.request.get(`${base}/api/${route}`, { headers });
    assert.equal(response.status(), 200, `Live GET ${route} must succeed.`);
    return (await response.json()).data;
  };
  return { page, account, space, headers, read, errors, forbidden };
}

function seedControls(accountId, spaceId, withHistory = false) {
  const result = spawnSync(runtime.interpreter, ['-E', '-s', '-B', '-c', `
import json
import sys
from datetime import timedelta
from uuid import uuid4
from sqlalchemy import func, select
from app.main import create_app
from app.modules.agents.models import AgentMemory, AgentRun
from app.modules.agents.registry import route
from app.modules.identity.models import AccountSession, User
from app.modules.spaces.models import SpaceMembership

values = json.load(sys.stdin)
application = create_app()
assert application.state.agents.model is None and application.state.agents.web is None
with application.state.sessions.begin() as database:
    person = database.get(User, values['account_id'])
    assert person is not None and person.display_name == 'Agent controls synthetic'
    membership = database.get(SpaceMembership, (values['space_id'], person.id))
    assert membership is not None and membership.status == 'active' and membership.role == 'owner'
    assert database.scalar(select(func.count()).select_from(AgentMemory).where(AgentMemory.account_id == person.id)) == 0
    identifier = str(uuid4())
    database.add(AgentMemory(id=identifier, account_id=person.id, space_id=values['space_id'], kind='note',
                             key=None, content='Synthetic fixture: morning trips', source='synthetic_fixture',
                             source_run_id=None, created_at=application.state.agents.clock()))
    runs = []
    if values['history']:
      now = application.state.agents.clock()
      session = database.scalar(select(AccountSession).where(AccountSession.account_id == person.id,
                    AccountSession.revoked_at.is_(None), AccountSession.expires_at > now))
      assert session is not None
      definition = route(database, values['space_id'])
      for index in range(25):
        status = 'waiting_for_user' if index == 0 else 'failed' if index == 1 else 'completed'
        run_id = str(uuid4())
        created = now - timedelta(minutes=30 - index)
        question = str(uuid4()) if index == 0 else None
        message = f'Synthetic fixture request {index + 1:02d}'
        database.add(AgentRun(
          id=run_id, agent_kind='space', space_id=values['space_id'], account_id=person.id,
          admission_id=membership.admission_id, agent_instance_id=definition.instance_id, session_id=session.id,
          request_key=str(uuid4()), request_digest='0' * 64, message=message, timezone=person.timezone,
          status=status, intent='chat', outcome='answered' if status == 'completed' else None,
          answer='Synthetic fixture, not a live model result.' if status != 'waiting_for_user' else None,
          plan=[], state={'origin': 'synthetic_fixture', 'agent': definition.record(), 'changed': 0},
          question_id=question, question='Synthetic fixture question: morning or afternoon?' if question else None,
          question_expires_at=now + timedelta(hours=1) if question else None,
          created_at=created, updated_at=created, available_at=created,
          deadline_at=now + timedelta(hours=1), finished_at=created if status != 'waiting_for_user' else None,
        ))
        runs.append({'id': run_id, 'message': message, 'status': status})
print(json.dumps({'memory_id': identifier, 'runs': runs, 'synthetic': True, 'providers_disabled': True}))
application.state.engine.dispose()
`], {
    cwd: runtime.snapshotRoot, env: runtime.env, input: JSON.stringify({ account_id: accountId, space_id: spaceId, history: withHistory }),
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, `Synthetic fixture setup failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

test('agent controls live: memory edit disable retry and delete use the upgraded API without a provider', options, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, account, space, headers, read, errors, forbidden } = await fixture(context, 'memory');
    const seeded = seedControls(account.id, space.id);
    const memoryPath = `/api/agent-memories/${seeded.memory_id}`;
    const [original] = await read('agent-memories');
    assert.equal(original.enabled, true);
    assert.equal(original.version, '1');
    await page.goto(`${base}/app/agent`);
    await page.getByRole('button', { name: 'Memories', exact: true }).click();
    await page.getByRole('button', { name: 'Edit memory: Synthetic fixture: morning trips', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit memory', exact: true });
    await dialog.getByRole('textbox', { name: 'Memory text', exact: true }).fill('Synthetic fixture: afternoon trips');
    await dialog.getByRole('checkbox', { name: 'Use for future requests', exact: true }).uncheck();
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-controls-live-memory-desktop.png'), fullPage: true });
    const attempts = [];
    await page.route(`**${memoryPath}`, async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const request = route.request();
      attempts.push({ key: request.headers()['idempotency-key'], etag: request.headers()['if-match'], body: request.postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'The real memory edit must commit before response loss is simulated.');
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry original memory change', exact: true }).waitFor();
    const [committed] = await read('agent-memories');
    assert.equal(committed.enabled, false);
    assert.equal(committed.version, '2');
    assert.equal(committed.content, 'Synthetic fixture: afternoon trips');
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Retry original memory change', exact: true }).click();
    await page.getByText('Memory changes confirmed.', { exact: true }).waitFor();
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
    assert.deepEqual(await read('agent-memories'), [committed]);
    await page.unroute(`**${memoryPath}`);
    await page.getByRole('button', { name: 'Edit memory: Synthetic fixture: afternoon trips', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Use for future requests', exact: true }).check();
    await page.setViewportSize({ width: 320, height: 844 });
    const save = dialog.getByRole('button', { name: 'Save changes', exact: true });
    const originalSize = await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await save.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    await save.scrollIntoViewIfNeeded();
    await save.focus();
    assert.equal(await save.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-controls-live-memory-320.png'), fullPage: false });
    await save.click();
    await dialog.waitFor({ state: 'detached' });
    const [enabled] = await read('agent-memories');
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.version, '3');
    const replay = await context.request.patch(`${base}${memoryPath}`, {
      headers: { ...headers, 'If-Match': attempts[0].etag, 'Idempotency-Key': attempts[0].key },
      data: JSON.parse(attempts[0].body),
    });
    assert.equal(replay.status(), 200);
    assert.deepEqual((await replay.json()).data, enabled);
    await page.getByRole('button', { name: 'Delete memory: Synthetic fixture: afternoon trips', exact: true }).click();
    const removal = page.getByRole('dialog', { name: 'Delete this memory?', exact: true });
    await removal.getByRole('button', { name: 'Delete memory', exact: true }).click();
    await page.getByText('Nothing saved yet.', { exact: true }).waitFor();
    assert.deepEqual(await read('agent-memories'), []);
    assert.deepEqual(await read(`agent-runs?space_id=${space.id}`), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
  } finally { await context.close(); }
});

test('chat availability live: typing and sends keep health reads responsive with open streams', options, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const owner = await fixture(context, 'chat-availability');
    const member = await fixture(memberContext, 'chat-availability-member');
    const invitation = await context.request.post(`${base}/api/spaces/${owner.space.id}/invitations`, {
      headers: { ...owner.headers, 'Idempotency-Key': crypto.randomUUID() }, data: { recipient_account_id: member.account.id },
    });
    assert.equal(invitation.status(), 201);
    const joined = await memberContext.request.post(`${base}/api/invitations/${(await invitation.json()).data.id}/accept`, {
      headers: member.headers, data: {},
    });
    assert.equal(joined.status(), 200);
    await owner.page.goto(`${base}/app/messages?space_id=${owner.space.id}`);
    await member.page.goto(`${base}/app/messages?space_id=${owner.space.id}`);
    const ownerPane = owner.page.getByRole('region', { name: 'Conversation', exact: true });
    const memberPane = member.page.getByRole('region', { name: 'Conversation', exact: true });
    for (const pane of [ownerPane, memberPane]) await pane.getByRole('heading', { name: owner.space.name, exact: true }).waitFor();
    const [chat] = await owner.read(`conversations?space_id=${owner.space.id}`);
    const composer = ownerPane.getByLabel('Message', { exact: true });
    const typing = owner.page.waitForResponse(response => new URL(response.url()).pathname === `/api/conversations/${chat.id}/typing`
      && response.request().method() === 'POST' && response.request().postDataJSON().is_typing === true);
    await composer.fill('Synthetic availability draft');
    assert.equal((await typing).status(), 200);
    const timings = [];
    for (let index = 1; index <= 10; index += 1) {
      const text = `Synthetic availability message ${index}`;
      await composer.fill(text);
      const probes = Promise.all(['/health/live', '/health/ready', '/api/timezones'].map(async route => {
        const address = route.startsWith('/health/') ? `${runtime.summary.apiUrl}${route}` : `${base}${route}`;
        const started = performance.now();
        const response = await fetch(address, { signal: AbortSignal.timeout(8000) });
        assert.equal(response.status, 200, `Readiness must survive an active send: ${route}`);
        await response.body?.cancel();
        return { route, milliseconds: Math.round(performance.now() - started) };
      }));
      const sent = owner.page.waitForResponse(response => new URL(response.url()).pathname === `/api/conversations/${chat.id}/messages`
        && response.request().method() === 'POST');
      await ownerPane.getByRole('button', { name: 'Send', exact: true }).click();
      assert.equal((await sent).status(), 201);
      await memberPane.getByText(text, { exact: true }).waitFor({ timeout: 8000 });
      timings.push(...await probes);
    }
    const messages = await owner.read(`conversations/${chat.id}/messages?limit=30`);
    assert.equal(messages.length, 10);
    assert.equal(new Set(messages.map(message => message.id)).size, 10);
    assert.deepEqual(messages.map(message => message.body), Array.from({ length: 10 }, (_unused, index) => `Synthetic availability message ${index + 1}`));
    assert.deepEqual(owner.errors, []);
    assert.deepEqual(member.errors, []);
    assert.deepEqual(owner.forbidden, []);
    assert.deepEqual(member.forbidden, []);
    testContext.diagnostic(JSON.stringify({ healthReads: timings.length, maximumMilliseconds: Math.max(...timings.map(item => item.milliseconds)), messages: messages.length }));
  } finally { await context.close(); await memberContext.close(); }
});

test('account data live: privacy withdrawal export retry and session isolation work without a provider', options, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const otherContext = await browser.newContext();
  const secondSession = await browser.newContext();
  try {
    const person = await fixture(context, 'data');
    const other = await fixture(otherContext, 'other-data');
    const { page, account, space, headers, read } = person;
    seedControls(account.id, space.id);
    seedControls(other.account.id, other.space.id);
    const tasks = [];
    for (const [session, actor, title] of [
      [context, person, 'Synthetic own export task'],
      [otherContext, other, 'Synthetic other private export task'],
    ]) {
      const response = await session.request.post(`${base}/api/tasks`, {
        headers: { ...actor.headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { space_id: actor.space.id, title, description: '', assignee_account_id: null, due_date: null },
      });
      assert.equal(response.status(), 201);
      tasks.push((await response.json()).data);
    }
    const interests = await context.request.get(`${base}/api/me/interests`, { headers });
    assert.equal(interests.status(), 200);
    const reviewedInterests = (await interests.json()).data;
    const savedInterests = await context.request.put(`${base}/api/me/interests`, {
      headers: { ...headers, 'If-Match': reviewedInterests.etag },
      data: { topics: ['hobbies'], interests: [], languages: [], places: [] },
    });
    assert.equal(savedInterests.status(), 200);
    await page.goto(`${base}/app/settings/privacy`);
    await page.getByRole('heading', { name: 'Privacy', exact: true, level: 1 }).waitFor();
    const confirmation = page.getByRole('group', { name: 'Take this back?', exact: true });
    const memory = page.getByRole('button', { name: 'Take back: Synthetic fixture: morning trips', exact: true });
    await memory.click();
    assert.equal((await read('agent-memories')).length, 1);
    await confirmation.getByRole('button', { name: 'Keep', exact: true }).click();
    assert.equal((await read('agent-memories')).length, 1);
    await memory.click();
    await confirmation.getByRole('button', { name: 'Take back', exact: true }).click();
    await page.getByRole('region', { name: 'What your agent remembers', exact: true }).getByText('Nothing to show here.', { exact: true }).waitFor();
    assert.deepEqual(await read('agent-memories'), []);
    assert.equal((await other.read('agent-memories')).length, 1);
    for (const name of ['Reminders in your inbox', 'Interests used for page and post suggestions']) {
      await page.getByRole('button', { name: `Take back: ${name}`, exact: true }).click();
      await confirmation.getByRole('button', { name: 'Take back', exact: true }).click();
      await confirmation.waitFor({ state: 'detached' });
    }
    assert.equal((await read('me/notification-preferences')).in_app_reminders_enabled, false);
    assert.equal((await other.read('me/notification-preferences')).in_app_reminders_enabled, true);
    const cleared = await read('me/interests');
    for (const category of ['topics', 'interests', 'languages', 'places']) assert.deepEqual(cleared[category], []);
    await page.goto(`${base}/app/settings/data`);
    await page.getByRole('heading', { name: 'Your data', exact: true, level: 1 }).waitFor();
    for (const name of ['Security activity', 'Spaces', 'Reminders']) await page.getByRole('checkbox', { name, exact: true }).uncheck();
    const attempts = [];
    let exportId;
    await page.route('**/api/me/exports', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch();
      assert.equal(response.status(), 202, 'The export request must commit before dropping its reply.');
      exportId = (await response.json()).data.id;
      if (attempts.length === 1) return route.abort('failed');
      return route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await page.locator('main').getByRole('alert').waitFor();
    assert.equal((await read('me/exports')).length, 1);
    await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    const downloadButton = page.getByRole('button', { name: /^Download data requested / });
    await downloadButton.waitFor({ timeout: 30000 });
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[1], attempts[0]);
    assert.deepEqual(JSON.parse(attempts[0].body).categories, ['profile', 'tasks']);
    assert.equal((await read('me/exports')).length, 1);
    const downloading = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloading;
    assert.match(download.suggestedFilename(), /^community-platform-data-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    assert.ok(stream);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const archiveText = Buffer.concat(chunks).toString('utf8');
    const archive = JSON.parse(archiveText);
    assert.equal(archive.format, 'community-platform-account-export');
    assert.equal(archive.account_id, account.id);
    assert.equal(archive.profile.email, account.email);
    assert.deepEqual(archive.tasks.map(task => task.id), [tasks[0].id]);
    assert.equal(archiveText.includes(tasks[1].id), false);
    assert.equal(archiveText.includes(other.account.email), false);
    assert.equal((await otherContext.request.get(`${base}/api/me/exports/${exportId}/archive`, { headers: other.headers })).status(), 404);
    const login = await secondSession.request.post(`${base}/api/auth/login`, {
      headers: { Origin: base }, data: { email: account.email, password: 'Synthetic-Meadow-49!', device_name: 'Synthetic second browser' },
    });
    assert.equal(login.status(), 200);
    const elsewhere = await secondSession.request.get(`${base}/api/me/exports/${exportId}/archive`, { headers });
    assert.equal(elsewhere.status(), 403);
    assert.equal((await elsewhere.json()).error.code, 'EXPORT_OTHER_SESSION');
    await page.getByRole('button', { name: /^Cancel data requested / }).click();
    await page.getByText('Cancelled', { exact: true }).waitFor();
    assert.equal((await read(`me/exports/${exportId}`)).status, 'cancelled');
    assert.equal((await context.request.get(`${base}/api/me/exports/${exportId}/archive`, { headers })).status(), 409);
    const deletions = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/me/deletion') deletions.push(request.url());
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your account?', exact: true });
    const keep = dialog.getByRole('button', { name: 'Keep my account', exact: true });
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const originalSize = await keep.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    for (const scale of [1, 2]) {
      if (scale === 2) await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      });
      assert.equal(await keep.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * scale);
      const surface = await dialog.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--color-surface)';
        element.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { opacity: getComputedStyle(element).opacity, background: getComputedStyle(element).backgroundColor, expected };
      });
      assert.equal(surface.opacity, '1', 'The settled dialog must not show background content through its text.');
      assert.equal(surface.background, surface.expected);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
      for (const button of await dialog.getByRole('button').all()) {
        await button.scrollIntoViewIfNeeded();
        await button.focus();
        assert.equal(await button.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.height >= 44 && document.activeElement === element
            && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }), true, 'Every dialog action must remain focusable and reachable.');
      }
      await page.screenshot({ path: path.join(root, `.local/screenshots/account-data-live-320-settled-${scale}x.png`), fullPage: false });
    }
    await keep.click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(deletions, []);
    assert.equal((await read('me')).id, account.id);
    assert.equal((await read(`tasks?space_id=${space.id}`))[0].id, tasks[0].id);
    assert.deepEqual(person.errors, []);
    assert.deepEqual(other.errors, []);
    assert.deepEqual(person.forbidden, []);
    assert.deepEqual(other.forbidden, []);
  } finally { await context.close(); await otherContext.close(); await secondSession.close(); }
});

test('agent controls live: private inbox filters pages and cancellation use the upgraded API without a provider', options, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, account, space, headers, read, errors, forbidden } = await fixture(context, 'inbox');
    const seeded = seedControls(account.id, space.id, true);
    const another = await context.request.post(`${base}/api/spaces`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Synthetic other inbox Space', space_type: 'family' },
    });
    assert.equal(another.status(), 201);
    const otherSpace = (await another.json()).data;
    await page.goto(`${base}/app/agent/tasks?space_id=${space.id}`);
    await page.getByRole('heading', { name: 'Agent tasks', exact: true, level: 1 }).waitFor();
    const selectedSpace = page.getByRole('combobox', { name: 'Space', exact: true });
    assert.equal(await selectedSpace.inputValue(), space.id);
    const status = page.getByRole('combobox', { name: 'Status', exact: true });
    const completed = page.getByRole('article', { name: 'Synthetic fixture request 25', exact: true });
    await completed.waitFor();
    assert.equal(await page.getByRole('article').count(), 20);
    assert.equal(await page.getByRole('article', { name: 'Synthetic fixture request 01', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Load more requests', exact: true }).click();
    const waiting = page.getByRole('article', { name: 'Synthetic fixture request 01', exact: true });
    await waiting.waitFor();
    assert.equal(await page.getByRole('article').count(), 25);
    assert.equal(await page.getByRole('button', { name: 'Load more requests', exact: true }).count(), 0);
    await status.selectOption('failed');
    await page.getByRole('article', { name: 'Synthetic fixture request 02', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    await status.selectOption('waiting_for_user');
    await waiting.waitFor();
    assert.equal(await page.getByRole('article').count(), 1);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-controls-live-inbox-desktop.png'), fullPage: true });
    const filtered = await context.request.get(`${base}/api/agent-runs?space_id=${space.id}&status=completed&limit=1`, { headers });
    assert.equal(filtered.status(), 200);
    const cursor = (await filtered.json()).pagination.next_cursor;
    assert.ok(cursor);
    const wrongFilter = await context.request.get(`${base}/api/agent-runs?space_id=${space.id}&status=failed&limit=1&cursor=${encodeURIComponent(cursor)}`, { headers });
    assert.equal(wrongFilter.status(), 400);
    await selectedSpace.selectOption(otherSpace.id);
    await page.getByText('No requests match this status.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 0);
    await selectedSpace.selectOption(space.id);
    await status.selectOption('waiting_for_user');
    await waiting.waitFor();
    await page.setViewportSize({ width: 320, height: 844 });
    const stop = waiting.getByRole('button', { name: 'Stop this request', exact: true });
    const originalSize = await stop.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await stop.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), originalSize * 2);
    await stop.scrollIntoViewIfNeeded();
    await stop.focus();
    assert.equal(await stop.evaluate(element => document.activeElement === element), true);
    const box = await stop.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    assert.equal(await stop.evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2));
    }), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-controls-live-inbox-320.png'), fullPage: false });
    const cancelled = page.waitForResponse(response => new URL(response.url()).pathname === `/api/agent-runs/${seeded.runs[0].id}/cancel` && response.request().method() === 'POST');
    await stop.click();
    assert.equal((await cancelled).status(), 200);
    await page.getByText('No requests match this status.', { exact: true }).waitFor();
    assert.equal((await read(`agent-runs/${seeded.runs[0].id}`)).status, 'cancelled');
    await status.selectOption('cancelled');
    await waiting.getByText('Stopped', { exact: true }).waitFor();
    assert.equal(await stop.count(), 0);
    assert.deepEqual(await read('agent-runs'), []);
    assert.deepEqual(await read(`tasks?space_id=${space.id}`), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
  } finally { await context.close(); }
});