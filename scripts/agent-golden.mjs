// Runs the golden Agent requests (tests/agent-golden/cases.json) against the local API and scores them.
// Live runs use the owner's configured model and web provider: every model call counts towards the shared token limit,
// so nothing is sent without --live, and a run stops starting new requests after --max-tokens.
//   node scripts/agent-golden.mjs                      check the cases, no network
//   node scripts/agent-golden.mjs --live --only a,b    run selected cases (whole threads)
//   node scripts/agent-golden.mjs --live --repeat 3    run every thread 3 times and report pass^3
//   node scripts/agent-golden.mjs --score FILE         re-score a saved run without the model
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AREAS, consistency, loadCases, registryNames, resolveDates, root, scoreRun, SETTLED, summarize, threads, validateCases,
} from './agent-golden-score.mjs';

const api = process.env.COMMUNITY_API_URL ?? 'http://127.0.0.1:8000';
const mail = process.env.COMMUNITY_MAIL_URL ?? 'http://127.0.0.1:8025';
const ledger = path.join(root, 'backend/.local/agent-model-usage');
const timeZone = 'Asia/Kolkata';
const WORKING = ['queued', 'running', 'verifying', 'waiting_for_approval', 'waiting_for_user'];

function parse(argv) {
  const value = name => {
    const index = argv.indexOf(name);
    if (index < 0) return undefined;
    const next = argv[index + 1];
    if (!next?.trim() || next.startsWith('--')) throw new Error(`${name} requires a value.`);
    return next;
  };
  const list = name => value(name)?.split(',').map(item => item.trim()).filter(Boolean);
  const tokenCount = (name, fallback, minimum = 1) => {
    const count = Number(value(name) ?? fallback);
    if (!Number.isSafeInteger(count) || count < minimum) {
      throw new Error(`${name} must be ${minimum === 0 ? 'a non-negative' : 'a positive'} safe integer.`);
    }
    return count;
  };
  const passValue = value('--min-pass');
  const minPass = passValue === undefined ? null : Number(passValue);
  if (minPass !== null && (!Number.isFinite(minPass) || minPass < 0 || minPass > 1)) {
    throw new Error('--min-pass must be a finite number between 0 and 1.');
  }
  const repeat = tokenCount('--repeat', 1);
  if (repeat > 10) throw new Error('--repeat must be a positive safe integer up to 10.');
  return {
    live: argv.includes('--live'), score: value('--score'), only: list('--only'), areas: list('--area'),
    maxTokens: tokenCount('--max-tokens', 120_000), reserve: tokenCount('--reserve', 300_000, 0),
    limit: tokenCount('--limit', 2_000_000), out: path.resolve(value('--out') ?? path.join(root, '.local/agent-golden')),
    minPass, repeat,
  };
}

function select(cases, { only, areas }) {
  const unknownAreas = (areas ?? []).filter(area => !AREAS.includes(area));
  if (unknownAreas.length) throw new Error(`Unknown areas: ${unknownAreas.join(', ')}`);
  const chosen = cases.filter(item => (!only || only.includes(item.id)) && (!areas || areas.includes(item.area)));
  const unknown = (only ?? []).filter(id => !cases.some(item => item.id === id));
  if (unknown.length) throw new Error(`Unknown case ids: ${unknown.join(', ')}`);
  if (!chosen.length) throw new Error('No golden cases match the selected filters.');
  // A follow-up only makes sense after the turns before it, so a chosen case brings its whole thread.
  const keys = new Set(chosen.map(item => item.thread ?? item.id));
  return cases.filter(item => keys.has(item.thread ?? item.id));
}

async function spentTokens() {
  let total = 0;
  for (const name of await readdir(ledger).catch(() => [])) {
    if (!name.endsWith('.jsonl')) continue;
    for (const line of (await readFile(path.join(ledger, name), 'utf8')).split('\n')) {
      try { total += Number(JSON.parse(line).tokens) || 0; } catch { /* blank or partly written line */ }
    }
  }
  return total;
}

async function call(method, route, { token, body, headers = {} } = {}) {
  const response = await fetch(`${api}/v1${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} returned ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : null;
}

const post = (route, token, body) => call('POST', route, { token, body, headers: { 'Idempotency-Key': randomUUID() } });

async function mailCode(email) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const listed = await (await fetch(`${mail}/api/v1/messages`)).json();
    const message = listed.messages.find(entry => entry.To.some(recipient => recipient.Address === email) && entry.Subject.includes('registration'));
    if (message) return (await (await fetch(`${mail}/api/v1/message/${message.ID}`)).json()).Text.match(/code is (\d{6})/)[1];
    await delay(300);
  }
  throw new Error(`The verification email for ${email} did not arrive.`);
}

async function signUp(label) {
  const email = `golden-${label}-${Date.now()}@example.test`;
  const secret = randomBytes(24).toString('base64url');
  const challenge = await post('/auth/register', null, { email, context_secret: secret });
  const auth = await call('POST', '/auth/verify-email', { body: {
    challenge_id: challenge.challenge_id, context_secret: secret, code: await mailCode(email), password: `Golden-${randomBytes(8).toString('hex')}!`,
    display_name: 'Golden Tester', timezone: timeZone, device_name: 'Golden runner', platform: 'web',
  } });
  return { token: auth.session_token, id: auth.user.id };
}

async function familySpace(account, label, dates) {
  const space = await post('/spaces', account.token, { name: `Golden family ${label}`, space_type: 'family' });
  const tasks = [['Buy milk', dates.today], ['Pay electricity bill', dates.tomorrow], ['Call the plumber', null], ['Buy curd', dates.tomorrow], ['Buy eggs', null]];
  for (const [title, due] of tasks) await post('/tasks', account.token, { space_id: space.id, title, due_date: due });
  await post(`/spaces/${space.id}/events`, account.token, {
    title: 'Family dinner', timezone: timeZone, local_start: `${dates.saturday}T20:00`, local_end: `${dates.saturday}T21:30`,
  });
  return space;
}

async function ask(account, spaceId, message, seconds) {
  const started = Date.now();
  let run = await post('/agent-runs', account.token, { space_id: spaceId, message });
  while (!SETTLED.includes(run.status) && Date.now() - started < (seconds + 60) * 1000) {
    await delay(1500);
    run = await call('GET', `/agent-runs/${run.id}`, { token: account.token });
  }
  return { run, seconds: (Date.now() - started) / 1000, timedOut: !SETTLED.includes(run.status) };
}

function report(results, skipped = [], plan = {}) {
  const steady = consistency(results, plan);
  for (const result of results) {
    const failed = result.score.checks.filter(check => !check.ok);
    const cost = result.tokens == null ? '' : `, ${result.tokens} tokens`;
    console.log(`${result.score.passed ? 'PASS' : 'FAIL'} ${result.id} (${Math.round(result.seconds ?? 0)}s${cost})`);
    for (const check of failed) console.log(`     - ${check.name}: ${check.detail}`);
  }
  const summary = summarize(results);
  console.log(`\n${summary.passed}/${summary.total} passed (${Math.round(summary.rate * 100)}%)`);
  for (const [area, counts] of Object.entries(summary.areas)) console.log(`  ${area.padEnd(10)} ${counts.passed}/${counts.total}`);
  const failures = Object.entries(summary.failures).sort((a, b) => b[1] - a[1]);
  if (failures.length) console.log(`Most failed checks: ${failures.slice(0, 8).map(([name, count]) => `${name} (${count})`).join('; ')}`);
  if (skipped.length) console.log(`Not run (token cap reached): ${skipped.join(', ')}`);
  if (steady.repeats > 1) {
    console.log(`pass^${steady.repeats}: ${steady.steady}/${steady.cases} cases passed every run (${Math.round(steady.rate * 100)}%)`);
    if (steady.flaky.length) console.log(`Passed only sometimes: ${steady.flaky.join(', ')}`);
  }
  if (steady.incomplete?.length) console.log(`Incomplete cases: ${steady.incomplete.join(', ')}`);
  return { ...summary, rate: steady.rate };
}

async function live(options, chosen) {
  const ready = await fetch(`${api}/health/ready`).then(response => response.json()).catch(() => ({}));
  if (ready.status !== 'ready') throw new Error('The local API is not ready; start it before a live run.');
  const before = await spentTokens();
  const remaining = options.limit - before;
  if (remaining - options.maxTokens < options.reserve) {
    throw new Error(`${remaining} tokens remain of ${options.limit}; this run may use ${options.maxTokens} and ${options.reserve} stay reserved for other work.`);
  }
  const prompts = await readFile(path.join(root, 'backend/app/modules/agents/prompts.py'), 'utf8');
  const meta = {
    started_at: new Date().toISOString(), api, prompt_version: prompts.match(/^PROMPT_VERSION = "([^"]+)"/m)?.[1] ?? null,
    dates: resolveDates(new Date(), timeZone), ledger_before: before, max_tokens: options.maxTokens, repeat: options.repeat,
    case_ids: chosen.map(item => item.id),
  };
  console.log(`Live golden run: ${chosen.length} requests x ${options.repeat}, prompt ${meta.prompt_version}, ${remaining} tokens left before the run.`);
  const results = [];
  const skipped = [];
  const accounts = [];
  let spaceAccount;
  try {
    for (let round = 1; round <= options.repeat; round += 1) for (const [index, group] of threads(chosen).entries()) {
      if ((await spentTokens()) - before >= options.maxTokens) {
        skipped.push(...group.map(item => (options.repeat > 1 ? `${item.id}#${round}` : item.id)));
        continue;
      }
      let account;
      let spaceId = null;
      if (group[0].scope === 'space') {
        if (!spaceAccount) accounts.push(spaceAccount = await signUp('space'));
        account = spaceAccount;
        spaceId = (await familySpace(account, `${round}-${index + 1}`, meta.dates)).id;
      } else {
        accounts.push(account = await signUp(`main${round}-${index + 1}`));
        if (group.some(item => item.fixtures === 'family')) await familySpace(account, `${round}-${index + 1}`, meta.dates);
      }
      for (const [turn, spec] of group.entries()) {
        const tokensBefore = await spentTokens();
        if (tokensBefore - before >= options.maxTokens) {
          skipped.push(...group.slice(turn).map(item => (options.repeat > 1 ? `${item.id}#${round}` : item.id)));
          break;
        }
        const { run, seconds, timedOut } = await ask(account, spaceId, spec.message, spec.expect?.max_seconds ?? 150);
        const tokens = (await spentTokens()) - tokensBefore;
        const score = scoreRun(spec, run, { dates: meta.dates, seconds, timedOut });
        results.push({ id: spec.id, area: spec.area, thread: spec.thread ?? spec.id, round, message: spec.message, seconds, timedOut, tokens, run, score });
        console.log(`${score.passed ? 'pass' : 'FAIL'} ${spec.id}${options.repeat > 1 ? ` #${round}` : ''} ${run.status} ${Math.round(seconds)}s ${tokens} tokens`);
        // Free the run so the next request is not refused as busy; nothing proposed is ever approved.
        if (WORKING.includes(run.status)) await post(`/agent-runs/${run.id}/cancel`, account.token, {}).catch(error => console.warn(error.message));
      }
    }
  } finally {
    for (const account of accounts) await post('/auth/logout', account.token, {}).catch(() => {});
    meta.finished_at = new Date().toISOString();
    meta.ledger_after = await spentTokens();
    meta.tokens = meta.ledger_after - before;
    await mkdir(options.out, { recursive: true });
    const file = path.join(options.out, `golden-${meta.started_at.replace(/[:.]/g, '-')}.json`);
    await writeFile(file, JSON.stringify({ meta, skipped, results }, null, 2), { flag: 'wx' });
    console.log(`\nSaved ${file} (${meta.tokens} tokens in the shared ledger during the run, including any other work).`);
  }
  return report(results, skipped, { repeats: options.repeat, caseIds: meta.case_ids });
}

async function rescore(file, cases, { only, areas }) {
  const saved = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const known = new Map(cases.map(item => [item.id, item]));
  const selected = saved.results.filter(result => known.has(result.id));
  if (!selected.length) throw new Error('No saved results match the selected cases.');
  const seen = new Set();
  const duplicates = new Set();
  for (const result of selected) {
    // Repeated runs of one case are told apart by their round; older saved runs have none.
    const key = `${result.id}#${result.round ?? 1}`;
    if (seen.has(key)) duplicates.add(result.id);
    seen.add(key);
  }
  if (duplicates.size) throw new Error(`Duplicate saved result IDs: ${[...duplicates].join(', ')}`);
  if (only || areas) {
    const missing = cases.filter(item => !selected.some(result => result.id === item.id));
    if (missing.length) throw new Error(`Saved run is missing selected cases: ${missing.map(item => item.id).join(', ')}`);
  }
  const results = selected.map(result => ({
    ...result, score: scoreRun(known.get(result.id), result.run, { dates: saved.meta.dates, seconds: result.seconds, timedOut: result.timedOut }),
  }));
  const skipped = (saved.skipped ?? []).filter(id => known.has(id.split('#')[0]));
  const caseIds = saved.meta.case_ids?.filter(id => known.has(id))
    ?? [...new Set([...selected.map(result => result.id), ...skipped.map(id => id.split('#')[0])])];
  console.log(`Re-scored ${results.length} saved requests from ${saved.meta.started_at} (prompt ${saved.meta.prompt_version}).`);
  return report(results, skipped, { repeats: saved.meta.repeat, caseIds });
}

async function main() {
  const options = parse(process.argv.slice(2));
  const cases = loadCases();
  const problems = validateCases(cases, registryNames());
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const chosen = select(cases, options);
  let summary;
  if (options.score) summary = await rescore(options.score, chosen, options);
  else if (options.live) summary = await live(options, chosen);
  else {
    const counts = AREAS.map(area => [area, chosen.filter(item => item.area === area).length]).filter(([, count]) => count);
    console.log(`${chosen.length} golden requests in ${threads(chosen).length} threads; cases are valid.`);
    console.log(counts.map(([area, count]) => `${area} ${count}`).join(', '));
    console.log('Nothing was sent. Add --live to run them with the real model (uses the shared token limit).');
    return;
  }
  if (options.minPass !== null && summary.rate < options.minPass) process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
