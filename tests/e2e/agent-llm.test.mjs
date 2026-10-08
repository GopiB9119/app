// DEC-059: the LLM agent in the browser, against the local API with the owner's real Azure model (synthetic accounts only).
// Needs the API started with infra/compose.agent-model.yaml, the web preview at http://127.0.0.1:3000 and
// COMMUNITY_AGENT_MODEL_LIVE=1. Every model call counts towards the owner's token limit (Q44).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

async function signUp(page, email) {
  await page.goto(`${base}/register`);
  await page.getByLabel('Email address').fill(email);
  const registered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send verification code' }).click();
  const response = await registered;
  assert.equal(response.status(), 202, await response.text());
  await page.getByRole('heading', { name: 'Complete your account' }).waitFor();
  await page.getByLabel('Verification code').fill(await mailCode(email));
  await page.getByLabel('Display name', { exact: true }).fill('Alex Morgan');
  await page.getByLabel('Timezone', { exact: true }).selectOption('Asia/Kolkata');
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Verify and create account' }).click();
  await page.getByRole('heading', { name: 'Active sessions' }).waitFor();
}

test('llm web information: reads pages, summarizes follow-ups and offers an in-chat video', {
  timeout: 360000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured model and web provider',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stamp = Date.now();
  let readRuns;
  try {
    const page = await context.newPage();
    await signUp(page, `web-information-${stamp}@example.test`);
    const profile = await context.request.get(`${base}/api/me`);
    assert.equal(profile.status(), 200);
    const owner = (await profile.json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    readRuns = async () => {
      const response = await context.request.get(`${base}/api/agent-runs?limit=20`, { headers });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data;
    };
    await page.goto(`${base}/app/agent`);
    const input = page.getByRole('textbox', { name: 'Message the Agent', exact: true });
    await input.waitFor();
    const ask = async message => {
      await input.fill(message);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      const card = page.getByRole('article', { name: message, exact: true });
      await card.locator('[class*="agentSide"] > div[class*="bubble"]').last().waitFor({ timeout: 120000 });
      const run = (await readRuns()).find(item => item.message === message);
      assert.ok(run, message);
      assert.equal(run.status, 'completed', JSON.stringify(run));
      assert.equal(run.approval, null);
      assert.ok(run.tool_calls.every(call => call.effect === 'read'));
      return { card, run };
    };
    const first = await ask('Search the web for practical healthy cooking tips. Read the useful articles and summarize three tips, not a list of links. Then offer to explain the first source in more detail.');
    assert.ok(first.run.tool_calls.some(call => call.tool_name === 'web.search' && call.status === 'succeeded'));
    assert.ok(first.run.tool_calls.some(call => call.tool_name === 'web.read' && call.status === 'succeeded'));
    assert.ok(first.run.sources.some(source => source.read));
    assert.ok(first.run.answer.length > 100);
    assert.doesNotMatch(first.run.answer, /https?:\/\//);
    await first.card.getByText('Sources', { exact: true }).click();
    await first.card.getByRole('link', { name: first.run.sources[0].title, exact: true }).waitFor();
    const readSource = first.run.sources.find(source => source.read && !source.video_id);
    assert.ok(readSource);
    await first.card.getByRole('button', { name: `View text: ${readSource.title}`, exact: true }).first().click();
    const sourcePreview = first.card.getByRole('region', { name: `Source text: ${readSource.title}`, exact: true });
    await sourcePreview.locator('pre').waitFor();
    const savedTextResponse = await context.request.get(`${base}/api/agent-runs/${first.run.id}/web-text`, { headers });
    assert.equal(savedTextResponse.status(), 200, await savedTextResponse.text());
    const savedText = (await savedTextResponse.json()).data;
    assert.equal(savedText.run_id, first.run.id);
    assert.equal(await sourcePreview.locator('pre').textContent(), savedText.sources.find(item => item.source.url === readSource.url).text);
    assert.equal(await sourcePreview.locator('script, iframe, img').count(), 0);
    const afterPreview = (await readRuns()).find(item => item.id === first.run.id);
    assert.deepEqual(afterPreview.tool_calls, first.run.tool_calls, 'Inspecting retained text must not execute tools again');
    assert.equal(afterPreview.version, first.run.version, 'Inspecting retained text must not mutate the completed run');
    await first.card.getByRole('button', { name: `Hide text: ${readSource.title}`, exact: true }).click();
    testContext.diagnostic(`Summary: ${first.run.answer}`);

    const followup = await ask('yes do it');
    assert.ok(followup.run.tool_calls.some(call => call.tool_name === 'web.read' && call.status === 'succeeded'));
    assert.equal(followup.run.tool_calls.some(call => call.tool_name === 'web.search'), false, 'A source-reading follow-up must not repeat the search');
    assert.ok(followup.run.sources.some(source => first.run.sources.some(previous => previous.url === source.url)));
    assert.doesNotMatch(followup.run.answer, /https?:\/\//);
    assert.doesNotMatch(followup.run.answer, /(?:would you like|do you want|shall I|should I)[^?]*(?:first source|more detail)[^?]*\?/i,
      'A completed source explanation must not repeat the accepted offer');
    testContext.diagnostic(`Follow-up: ${followup.run.answer}`);

    const video = await ask('Play this video in the chat: https://www.youtube.com/watch?v=pKtweGSC2FU');
    const selected = video.run.sources.find(source => source.video_id === 'pKtweGSC2FU');
    assert.ok(selected);
    assert.deepEqual([...new Set(video.run.sources.filter(source => source.video_id).map(source => source.video_id))], ['pKtweGSC2FU']);
    assert.equal(video.run.tool_calls.some(call => call.tool_name === 'web.search' && call.status === 'succeeded'), false);
    await video.card.getByRole('button', { name: `Play ${selected.title}`, exact: true }).waitFor();
    assert.equal(await video.card.locator('iframe').count(), 0, 'Playback must wait for a click');
    await video.card.screenshot({ path: path.join(root, `.local/screenshots/agent-web-video-live-${stamp}.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-web-information-live-${stamp}.png`), fullPage: true });
    testContext.diagnostic('Video reference and Play control verified; external streaming was not started.');
  } finally {
    if (readRuns) await writeFile(path.join(root, `.local/agent-web-information-live-${stamp}.json`), JSON.stringify(await readRuns(), null, 2), { flag: 'wx' });
    await context.close();
  }
});

test('saved source preview: inspects an owned fixture without new Agent work', {
  timeout: 120000,
  skip: process.env.COMMUNITY_AGENT_SOURCE_PREVIEW_STAMP ? false : 'requires an existing web-information synthetic fixture stamp',
}, async testContext => {
  const fixtureStamp = process.env.COMMUNITY_AGENT_SOURCE_PREVIEW_STAMP;
  assert.match(fixtureStamp, /^\d{13}$/);
  const recorded = JSON.parse(await readFile(path.join(root, `.local/agent-web-information-live-${fixtureStamp}.json`), 'utf8'));
  const selected = recorded.find(run => run.agent_kind === 'main' && run.status === 'completed' && run.sources.some(source => source.read && !source.video_id));
  assert.ok(selected, 'The owned fixture must contain a completed article read');
  assert.match(selected.id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const outbound = [];
  const mutations = [];
  let headers;
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      outbound.push(url.origin);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/agent-') && request.method() !== 'GET') mutations.push(`${request.method()} ${pathname}`);
    });
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email address').fill(`web-information-${fixtureStamp}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const login = await signedIn;
    assert.equal(login.status(), 200, 'The owned synthetic fixture must sign in successfully');
    await page.waitForURL(url => url.pathname.startsWith('/app'), { waitUntil: 'domcontentloaded' });
    const profile = await context.request.get(`${base}/api/me`);
    assert.equal(profile.status(), 200);
    const owner = (await profile.json()).data;
    headers = { Origin: base, 'X-Account-ID': owner.id };
    const runResponse = await context.request.get(`${base}/api/agent-runs/${selected.id}`, { headers });
    assert.equal(runResponse.status(), 200, await runResponse.text());
    const before = (await runResponse.json()).data;
    const source = before.sources.find(item => item.read && !item.video_id);
    assert.ok(source);
    await page.goto(`${base}/app/agent`, { waitUntil: 'domcontentloaded' });
    const card = page.getByRole('article', { name: before.message, exact: true });
    await card.getByText('Sources', { exact: true }).click();
    await card.getByRole('button', { name: `View text: ${source.title}`, exact: true }).first().click();
    const preview = card.getByRole('region', { name: `Source text: ${source.title}`, exact: true });
    await preview.locator('pre').waitFor();
    const response = await context.request.get(`${base}/api/agent-runs/${before.id}/web-text`, { headers });
    assert.equal(response.status(), 200, await response.text());
    const saved = (await response.json()).data;
    assert.equal(saved.run_id, before.id);
    assert.equal(await preview.locator('pre').textContent(), saved.sources.find(item => item.source.url === source.url).text);
    assert.equal(await preview.locator('script, iframe, img, a').count(), 0);
    const afterResponse = await context.request.get(`${base}/api/agent-runs/${before.id}`, { headers });
    assert.equal(afterResponse.status(), 200);
    const afterRun = (await afterResponse.json()).data;
    assert.deepEqual(afterRun, before, 'Opening saved source text must not mutate or continue the run');
    const stamp = Date.now();
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-source-preview-live-${stamp}.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    await preview.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-source-preview-live-${stamp}-320.png`), fullPage: true });
    assert.deepEqual(outbound, []);
    assert.deepEqual(mutations, []);
    testContext.diagnostic('Real saved-source preview matched its API text; no Agent commands, external browser requests or run changes.');
  } finally {
    try {
      if (headers) {
        const logout = await context.request.post(`${base}/api/auth/logout`, { headers, data: {} });
        assert.equal(logout.status(), 200, 'The synthetic verification session must sign out');
      }
    } finally { await context.close(); }
  }
});

test('llm web extraction: reads and compares supplied pages entirely in chat', {
  timeout: 180000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured model and web provider',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stamp = Date.now();
  const external = [];
  const commands = [];
  let headers;
  let recorded;
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      external.push(url.hostname);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await signUp(page, `chat-extraction-${stamp}@example.test`);
    const profile = await context.request.get(`${base}/api/me`);
    assert.equal(profile.status(), 200);
    headers = { Origin: base, 'X-Account-ID': (await profile.json()).data.id };
    page.on('request', request => {
      const route = new URL(request.url()).pathname;
      if (route.startsWith('/api/agent-') && request.method() !== 'GET') commands.push(`${request.method()} ${route}`);
    });
    await page.goto(`${base}/app/agent`, { waitUntil: 'domcontentloaded' });
    const urls = ['https://docs.tinyfish.ai/fetch-api', 'https://docs.tinyfish.ai/search-api'];
    const message = `Read the main content of ${urls[0]} and ${urls[1]}, ignoring navigation menus. Compare what each service does, when to use it and its important limits. Give me the useful comparison here, not a list of links.`;
    const input = page.getByRole('textbox', { name: 'Message the Agent', exact: true });
    await input.fill(message);
    assert.deepEqual(await page.getByRole('group', { name: 'Agent views', exact: true }).getByRole('button').allTextContents(), ['Chat', 'Memories']);
    assert.equal(await page.getByRole('button', { name: 'Fetch', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('URLs', { exact: true }).count(), 0);
    const accepted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/agent-runs' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await accepted;
    assert.equal(response.status(), 201);
    const created = (await response.json()).data;
    const card = page.getByRole('article', { name: message, exact: true });
    await card.locator('[class*="agentSide"] > div[class*="bubble"]').last().waitFor({ timeout: 120000 });
    const completed = await context.request.get(`${base}/api/agent-runs/${created.id}`, { headers });
    assert.equal(completed.status(), 200);
    recorded = (await completed.json()).data;
    assert.equal(recorded.status, 'completed', JSON.stringify(recorded));
    assert.equal(recorded.intent, 'chat');
    assert.equal(recorded.approval, null);
    for (const url of urls) assert.ok(recorded.sources.some(source => source.url === url && source.read), `The Agent must read ${url}`);
    assert.ok(recorded.tool_calls.every(call => call.effect === 'read'));
    assert.ok(recorded.answer.length > 150);
    assert.match(recorded.answer, /fetch/i);
    assert.match(recorded.answer, /search/i);
    assert.doesNotMatch(recorded.answer, /https?:\/\//);
    assert.equal(await card.locator('script, iframe, img').count(), 0);
    await card.getByText('Sources', { exact: true }).click();
    for (const url of urls) assert.equal(await card.locator(`a[href="${url}"]`).count(), 1);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-chat-extraction-live-${stamp}.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-chat-extraction-live-${stamp}-320.png`), fullPage: true });
    assert.deepEqual(external, []);
    assert.deepEqual(commands, ['POST /api/agent-runs']);
    testContext.diagnostic(`Agent read both supplied pages and answered in the same chat: ${recorded.answer}`);
  } finally {
    if (recorded) await writeFile(path.join(root, `.local/agent-chat-extraction-live-${stamp}.json`), JSON.stringify(recorded, null, 2), { flag: 'wx' });
    try {
      if (headers) await context.request.post(`${base}/api/auth/logout`, { headers, data: {} });
    } finally { await context.close(); }
  }
});

test('video playback: the selected saved video advances in its real player', {
  timeout: 120000,
  skip: process.env.COMMUNITY_AGENT_VIDEO_LIVE === '1' && process.env.COMMUNITY_AGENT_SOURCE_PREVIEW_STAMP
    ? false : 'requires explicit external-video opt-in and an owned synthetic fixture',
}, async testContext => {
  const fixtureStamp = process.env.COMMUNITY_AGENT_SOURCE_PREVIEW_STAMP;
  assert.match(fixtureStamp, /^\d{13}$/);
  const recorded = JSON.parse(await readFile(path.join(root, `.local/agent-web-information-live-${fixtureStamp}.json`), 'utf8'));
  const selected = recorded.find(run => run.agent_kind === 'main' && run.status === 'completed'
    && run.sources.some(source => source.video_id === 'pKtweGSC2FU'));
  assert.ok(selected, 'The owned fixture must contain the exact selected video');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const blocked = new Set();
  const failures = new Set();
  const external = [];
  let headers;
  let page;
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      const allowed = ['www.youtube-nocookie.com', 'www.youtube.com', 'i.ytimg.com'].includes(url.hostname)
        || url.hostname.endsWith('.googlevideo.com');
      external.push(url.hostname);
      if (allowed && url.protocol === 'https:') return route.continue();
      blocked.add(url.hostname);
      return route.abort('blockedbyclient');
    });
    page = await context.newPage();
    page.on('requestfailed', request => failures.add(`${new URL(request.url()).hostname}: ${request.failure()?.errorText}`));
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email address').fill(`web-information-${fixtureStamp}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signedIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    assert.equal((await signedIn).status(), 200);
    await page.waitForURL(url => url.pathname.startsWith('/app'), { waitUntil: 'domcontentloaded' });
    const profile = await context.request.get(`${base}/api/me`);
    assert.equal(profile.status(), 200);
    headers = { Origin: base, 'X-Account-ID': (await profile.json()).data.id };
    await page.goto(`${base}/app/agent`, { waitUntil: 'domcontentloaded' });
    const card = page.getByRole('article', { name: selected.message, exact: true });
    const video = selected.sources.find(source => source.video_id === 'pKtweGSC2FU');
    const play = card.getByRole('button', { name: `Play ${video.title}`, exact: true });
    await play.waitFor();
    assert.equal(await card.locator('iframe').count(), 0);
    assert.deepEqual(external, [], 'The app must not contact a video host before Play');
    await play.click();
    const iframe = card.locator('iframe');
    await iframe.waitFor();
    assert.match(await iframe.getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/pKtweGSC2FU\?/);
    const frame = await (await iframe.elementHandle()).contentFrame();
    assert.ok(frame);
    await frame.waitForFunction(() => {
      const media = document.querySelector('video');
      if (!media) return false;
      media.muted = true;
      return media.readyState >= 2 && media.videoWidth > 0 && !media.paused && media.currentTime > 0
        && !document.querySelector('.html5-video-player.ad-showing');
    }, null, { timeout: 45000 });
    const before = await frame.locator('video').first().evaluate(media => media.currentTime);
    await frame.waitForFunction(before => {
      const media = document.querySelector('video');
      return media && !media.paused && media.currentTime > before + 1 && !document.querySelector('.html5-video-player.ad-showing');
    }, before, { timeout: 15000 });
    testContext.diagnostic('Real media playback advanced for the exact selected video; not just an iframe load.');
    await card.screenshot({ path: path.join(root, `.local/screenshots/agent-video-playback-live-${Date.now()}.png`) });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await card.getByRole('button', { name: 'Close video', exact: true }).click();
    assert.equal(await card.locator('iframe').count(), 0);
  } catch (error) {
    testContext.diagnostic(`Blocked unapproved hosts: ${[...blocked].join(', ') || 'none'}`);
    testContext.diagnostic(`Failed request hosts: ${[...failures].slice(0, 12).join('; ') || 'none'}`);
    if (page) {
      const player = page.frames().find(frame => frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
      if (player) testContext.diagnostic(`Player message: ${(await player.locator('body').innerText().catch(() => '')).slice(0, 1000)}`);
      await page.screenshot({ path: path.join(root, `.local/screenshots/agent-video-playback-failure-${Date.now()}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    try {
      if (headers) await context.request.post(`${base}/api/auth/logout`, { headers, data: {} });
    } finally { await context.close(); }
  }
});

test('llm news information: reads reports and gives dated context with explicit gaps', {
  timeout: 300000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured model and web provider',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stamp = Date.now();
  let readRuns;
  try {
    const page = await context.newPage();
    await signUp(page, `news-information-${stamp}@example.test`);
    const profile = await context.request.get(`${base}/api/me`);
    assert.equal(profile.status(), 200);
    const owner = (await profile.json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    readRuns = async () => {
      const response = await context.request.get(`${base}/api/agent-runs?limit=20`, { headers });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).data;
    };
    await page.goto(`${base}/app/agent`);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const message = `Search the live web for recent NASA Artemis programme news. Read at least two useful reports, preferably a primary source and independent coverage. Give a detailed briefing: dates when available, what happened, what changed, why it matters, and gaps or uncertainty. Today is ${today}. Clearly distinguish old or undated coverage from current developments. Do not invent missing news or dates.`;
    await page.getByRole('textbox', { name: 'Message the Agent', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const card = page.getByRole('article', { name: message, exact: true });
    await card.locator('[class*="agentSide"] > div[class*="bubble"]').last().waitFor({ timeout: 180000 });
    const run = (await readRuns()).find(item => item.message === message);
    assert.ok(run);
    assert.equal(run.status, 'completed', JSON.stringify(run));
    assert.equal(run.approval, null);
    assert.ok(run.tool_calls.every(call => call.effect === 'read'));
    assert.ok(run.tool_calls.some(call => call.tool_name === 'web.search' && call.status === 'succeeded'));
    assert.ok(new Set(run.sources.filter(source => source.read).map(source => source.url)).size >= 2, 'The briefing needs at least two actually read reports');
    assert.ok(run.answer.length > 300, 'A detailed news request needs more than a headline');
    assert.match(run.answer, /20\d{2}|undated|publication date|dates?.*(?:unknown|unavailable)/i);
    assert.match(run.answer, /unknown|uncertain|unconfirmed|could not|couldn't|gaps?|limits?|not (?:clear|available|verified)|cannot verify/i);
    assert.doesNotMatch(run.answer, /https?:\/\//);
    assert.ok(run.events.some(event => event.event_type === 'run.searching'));
    assert.ok(run.events.some(event => event.event_type === 'run.reviewing'));
    testContext.diagnostic(`News briefing: ${run.answer}`);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-news-live-${stamp}.png`), fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, `.local/screenshots/agent-news-live-${stamp}-320.png`), fullPage: true });
  } finally {
    if (readRuns) await writeFile(path.join(root, `.local/agent-news-live-${stamp}.json`), JSON.stringify(await readRuns(), null, 2), { flag: 'wx' });
    await context.close();
  }
});

test('llm agent: reasons, reads, proposes a change, waits for approval and reports', {
  timeout: 300000,
  skip: process.env.COMMUNITY_AGENT_MODEL_LIVE === '1' ? false : 'requires the configured real Azure model',
}, async testContext => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  try {
    const page = await context.newPage();
    const suffix = Date.now();
    await signUp(page, `llm-agent-${suffix}@example.test`);
    const owner = (await (await context.request.get(`${base}/api/me`)).json()).data;
    const headers = { Origin: base, 'X-Account-ID': owner.id };
    const created = await context.request.post(`${base}/api/spaces`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `LLM family ${suffix}`, space_type: 'family' },
    });
    assert.equal(created.status(), 201, await created.text());
    const family = (await created.json()).data;
    await page.goto(`${base}/app/agent?space_id=${family.id}`);
    await page.getByRole('heading', { name: 'Agent', level: 1 }).waitFor();
    const box = page.getByRole('textbox', { name: 'Message the Agent' });
    const message = 'I need to buy milk tomorrow. Please add that as a task for me, then tell me which tasks I have.';
    await box.fill(message);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const turn = page.getByRole('article', { name: message });
    await turn.waitFor();
    const approveButton = turn.getByRole('button', { name: 'Approve', exact: true });
    await approveButton.waitFor({ timeout: 120000 });
    const review = await turn.locator('dl').innerText();
    testContext.diagnostic(`review: ${review.replace(/\s+/g, ' ')}`);
    assert.match(review, /milk/i);
    const before = await context.request.get(`${base}/api/tasks?space_id=${family.id}`, { headers });
    assert.equal((await before.json()).data.length, 0, 'nothing changes before approval');
    await page.screenshot({ path: path.join(root, '.local/screenshots/llm-agent-approval.png'), fullPage: true });
    await approveButton.click();
    await turn.locator('[class*="agentSide"] > div[class*="bubble"]').last().waitFor({ timeout: 120000 });
    await page.waitForFunction(() => !document.querySelector('[role="status"] .spin'), null, { timeout: 120000 });
    const answer = await turn.locator('[class*="agentSide"] > div[class*="bubble"]').last().innerText();
    testContext.diagnostic(`answer: ${answer}`);
    const tasks = (await (await context.request.get(`${base}/api/tasks?space_id=${family.id}`, { headers })).json()).data;
    assert.equal(tasks.length, 1);
    assert.match(tasks[0].title, /milk/i);
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86400000));
    assert.equal(tasks[0].due_date, tomorrow, 'the model turned "tomorrow" into the due date');
    assert.doesNotMatch(answer, /[0-9a-f]{8}-[0-9a-f]{4}-/, 'no internal IDs in the answer');
    await page.screenshot({ path: path.join(root, '.local/screenshots/llm-agent-done.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
