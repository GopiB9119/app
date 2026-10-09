// Scores Agent runs against the golden requests in tests/agent-golden/cases.json (docs/COMMUNITY_AGENT_PLAN.md 8.12).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const casesFile = path.join(root, 'tests/agent-golden/cases.json');
export const toolkitFile = path.join(root, 'backend/app/modules/agents/toolkit.py');
export const AREAS = ['chat', 'space', 'clarify', 'news', 'research', 'language', 'community', 'video', 'shopping', 'health', 'privacy', 'settings', 'memory'];
export const SETTLED = ['completed', 'failed', 'cancelled', 'timed_out', 'expired', 'waiting_for_approval', 'waiting_for_user'];
export const DATE_KEYS = ['today', 'tomorrow', 'day_after', 'saturday'];
const SCRIPTS = { telugu: /[\u0C00-\u0C7F]/u, devanagari: /[\u0900-\u097F]/u, latin: /[A-Za-z\u00C0-\u024F]/u };
const KEYS = new Set(['status', 'outcome', 'not_outcome', 'tools_all', 'tools_any', 'tools_none', 'read_sources_min', 'videos_min', 'videos_max',
  'video_id', 'handoffs_min', 'approval', 'asks', 'answer_match', 'answer_any', 'answer_any_min', 'answer_not_match', 'answer_min', 'answer_max',
  'dated', 'script', 'any_of', 'allow_urls', 'max_seconds']);
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const LATIN_DATE = new RegExp(`\\b20\\d{2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b|\\b${MONTH}\\.?\\s+\\d{1,2}\\b`, 'i');
// Month names in Telugu and Hindi; \b does not work for these scripts.
const NATIVE_DATE = /జనవరి|ఫిబ్రవరి|మార్చి|ఏప్రిల్|జూన్|జూలై|ఆగస్టు|సెప్టెంబర్|అక్టోబర్|నవంబర్|డిసెంబర్|जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|जून|जुलाई|अगस्त|सितंबर|सितम्बर|अक्टूबर|नवंबर|नवम्बर|दिसंबर|दिसम्बर/u;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LINK = /https?:\/\//i;
const OFFER = /\b(?:would you like|do you want|want me to|shall i|should i|let me know (?:if|which|what)|i can also|choose (?:one|an option)|pick (?:one|an option))\b|\boptions?:/i;
const SELF_OFFER = /\b(?:would you like me|do you want me|want me to|shall i|should i)\b/i;
const ITEM = /^(?:[-*•]|\d+[.)])\s+/;
const CLAIM = /\bI(?:'ve| have)?\s+(?:just\s+|now\s+|already\s+)?(?:added|created|scheduled|deleted|removed|updated|changed|saved|published|posted|cleared|booked|ordered|purchased|bought|set (?:a|an|the|your|it|up))\b/i;

export const rx = pattern => new RegExp(pattern, 'iu');

export function loadCases(file = casesFile) {
  return JSON.parse(readFileSync(file, 'utf8')).cases;
}

export function registryNames(source = readFileSync(toolkitFile, 'utf8')) {
  const start = source.indexOf('TOOLS = {');
  const block = source.slice(start, source.indexOf(')}', start));
  return new Set([...block.matchAll(/"([a-z]+(?:\.[a-z_]+)+)"/g)].map(match => match[1]));
}

function patterns(expect) {
  const fields = expect.approval?.fields ?? [];
  return [...(expect.answer_match ?? []), ...(expect.answer_any ?? []), ...(expect.answer_not_match ?? []),
    ...fields.flatMap(field => [field.label, field.match, field.not_match].filter(Boolean))];
}

function expectProblems(id, expect, registry, problems) {
  for (const key of Object.keys(expect)) if (!KEYS.has(key)) problems.push(`${id}: unknown expectation "${key}"`);
  for (const pattern of patterns(expect)) {
    try { rx(pattern); } catch (error) { problems.push(`${id}: bad pattern ${pattern}: ${error.message}`); }
  }
  const tools = [...(expect.tools_all ?? []), ...(expect.tools_any ?? []), ...(expect.tools_none ?? []), expect.approval?.tool].filter(Boolean);
  for (const tool of tools) if (!registry.has(tool)) problems.push(`${id}: unknown tool ${tool}`);
  for (const field of expect.approval?.fields ?? []) {
    if (field.date && !DATE_KEYS.includes(field.date)) problems.push(`${id}: unknown date ${field.date}`);
  }
  if (expect.script && !SCRIPTS[expect.script]) problems.push(`${id}: unknown script ${expect.script}`);
  for (const group of expect.any_of ?? []) expectProblems(id, group, registry, problems);
}

export function validateCases(cases, registry = registryNames()) {
  const problems = [];
  const ids = new Set();
  const scopes = new Map();
  for (const item of cases) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id ?? '')) problems.push(`bad id ${item.id}`);
    if (ids.has(item.id)) problems.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!AREAS.includes(item.area)) problems.push(`${item.id}: unknown area ${item.area}`);
    if (!['main', 'space'].includes(item.scope)) problems.push(`${item.id}: unknown scope ${item.scope}`);
    if (!['real', 'designed'].includes(item.source)) problems.push(`${item.id}: unknown source ${item.source}`);
    if (item.fixtures && item.fixtures !== 'family') problems.push(`${item.id}: unknown fixtures ${item.fixtures}`);
    if (!item.message?.trim() || item.message.length > 2000) problems.push(`${item.id}: message must be 1-2000 characters`);
    const thread = item.thread ?? item.id;
    if (scopes.has(thread) && scopes.get(thread) !== item.scope) problems.push(`${item.id}: thread ${thread} mixes scopes`);
    scopes.set(thread, item.scope);
    expectProblems(item.id, item.expect ?? {}, registry, problems);
  }
  return problems;
}

export function threads(cases) {
  const groups = new Map();
  for (const item of cases) {
    const key = item.thread ?? item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}

export function resolveDates(now = new Date(), timeZone = 'Asia/Kolkata') {
  const day = offset => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now.getTime() + offset * 86400000));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now));
  return { today: day(0), tomorrow: day(1), day_after: day(2), saturday: day((6 - weekday + 7) % 7) };
}

export function dateVariants(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return [iso, `${dd} ${SHORT[month - 1]} ${year}`, `${day} ${SHORT[month - 1]} ${year}`, `${SHORT[month - 1]} ${day}`, `${LONG[month - 1]} ${day}`,
    `${day} ${LONG[month - 1]}`, `${dd}-${mm}-${year}`, `${dd}/${mm}/${year}`];
}

export function scriptShare(text, script) {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter(letter => SCRIPTS[script].test(letter)).length / letters.length : 0;
}

export function menuEnding(text) {
  const lines = text.trim().split(/\n+/).map(line => line.trim()).filter(Boolean).slice(-8);
  const offer = lines.findIndex(line => OFFER.test(line));
  if (offer < 0) return false;
  const after = lines.slice(offer);
  const options = after.slice(1).filter(line => ITEM.test(line)).length;
  const alternatives = (after[0].match(/,|\bor\b/gi) ?? []).length;
  return options >= 2 || (alternatives >= 2 && /\bor\b/i.test(after[0]));
}

export const isDated = text => LATIN_DATE.test(text) || NATIVE_DATE.test(text);
export const replyText = run => [run.answer, run.question?.text].filter(Boolean).join('\n');
const succeeded = (run, name) => (run.tool_calls ?? []).some(call => call.tool_name === name && call.status === 'succeeded');
const called = (run, name) => (run.tool_calls ?? []).some(call => call.tool_name === name);
const toolList = run => (run.tool_calls ?? []).map(call => call.tool_name + (call.status === 'failed' ? '!' : '')).join(',') || 'none';
const videoIds = run => [...new Set((run.sources ?? []).map(source => source.video_id).filter(Boolean))];
const clip = (text, size = 120) => (text.length > size ? `${text.slice(0, size)}…` : text).replace(/\s+/g, ' ');
// A formal question, or a reply whose last sentence asks the person something rather than offering more work.
export function asked(run) {
  if (run.question) return true;
  const last = (run.answer ?? '').trim().split(/(?<=[.!?])\s+/).pop() ?? '';
  return last.endsWith('?') && !SELF_OFFER.test(last);
}

function approvalChecks(expected, run, env, add) {
  const approval = run.approval;
  add(`proposes ${expected.tool}`, approval?.tool_name === expected.tool, approval?.tool_name ?? 'no proposal');
  for (const field of expected.fields ?? []) {
    const label = rx(`^(?:${field.label})$`);
    const values = (approval?.fields ?? []).filter(item => label.test(item.label)).map(item => item.value);
    const shown = values.join(' | ') || 'missing';
    if (field.match) add(`${field.label} matches /${field.match}/`, values.some(value => rx(field.match).test(value)), shown);
    if (field.not_match) add(`${field.label} avoids /${field.not_match}/`, values.length > 0 && !values.some(value => rx(field.not_match).test(value)), shown);
    if (field.date) {
      const variants = dateVariants(env.dates[field.date]).map(value => value.toLowerCase());
      add(`${field.label} is ${field.date} (${env.dates[field.date]})`, values.some(value => variants.some(variant => value.toLowerCase().includes(variant))), shown);
    }
  }
}

function evaluate(expect, run, env, add) {
  const text = replyText(run);
  if (expect.status) add('status', expect.status.includes(run.status), run.status);
  if (expect.outcome) add('outcome', expect.outcome.includes(run.outcome), String(run.outcome));
  if (expect.not_outcome) add('not refused', !expect.not_outcome.includes(run.outcome), `${run.outcome} ${run.stop_reason ?? ''}`.trim());
  for (const name of expect.tools_all ?? []) add(`used ${name}`, succeeded(run, name), toolList(run));
  if (expect.tools_any) add(`used ${expect.tools_any.join(' or ')}`, expect.tools_any.some(name => succeeded(run, name)), toolList(run));
  if (expect.tools_none) add(`avoided ${expect.tools_none.join(', ')}`, !expect.tools_none.some(name => called(run, name)), toolList(run));
  if (expect.read_sources_min != null) {
    const count = new Set((run.sources ?? []).filter(source => source.read).map(source => source.url)).size;
    add(`read ${expect.read_sources_min}+ sources`, count >= expect.read_sources_min, `${count} read`);
  }
  const videos = videoIds(run);
  if (expect.videos_min != null) add(`${expect.videos_min}+ videos`, videos.length >= expect.videos_min, `${videos.length}`);
  if (expect.videos_max != null) add(`at most ${expect.videos_max} videos`, videos.length <= expect.videos_max, `${videos.length}`);
  if (expect.video_id) add(`only video ${expect.video_id}`, videos.length === 1 && videos[0] === expect.video_id, videos.join(',') || 'none');
  if (expect.handoffs_min != null) add('offers Space chats', (run.handoffs ?? []).length >= expect.handoffs_min, `${(run.handoffs ?? []).length}`);
  if (expect.approval) approvalChecks(expect.approval, run, env, add);
  if (expect.asks != null) add(expect.asks ? 'asks a question' : 'does not ask', asked(run) === expect.asks, clip(text));
  for (const pattern of expect.answer_match ?? []) add(`says /${pattern}/`, rx(pattern).test(text), clip(text));
  if (expect.answer_any) {
    const found = expect.answer_any.filter(pattern => rx(pattern).test(text)).length;
    const minimum = expect.answer_any_min ?? 1;
    add(`says ${minimum}+ of ${expect.answer_any.length} expected terms`, found >= minimum, `${found} found: ${clip(text)}`);
  }
  for (const pattern of expect.answer_not_match ?? []) add(`avoids /${pattern}/`, !rx(pattern).test(text), clip(text));
  if (expect.answer_min != null) add(`${expect.answer_min}+ characters`, text.length >= expect.answer_min, `${text.length}`);
  if (expect.answer_max != null) add(`at most ${expect.answer_max} characters`, text.length <= expect.answer_max, `${text.length}`);
  if (expect.dated) add('gives dates', isDated(text), clip(text));
  if (expect.script) {
    const share = scriptShare(text, expect.script);
    add(`answers in ${expect.script}`, share >= 0.4, `${Math.round(share * 100)}% of letters`);
  }
  if (expect.any_of) {
    const results = expect.any_of.map(group => {
      const checks = [];
      evaluate(group, run, env, (name, ok) => checks.push(ok));
      return checks.every(Boolean);
    });
    add('one acceptable behaviour', results.some(Boolean), results.map(ok => (ok ? 'yes' : 'no')).join('/'));
  }
}

export function scoreRun(spec, run, env) {
  const expect = spec.expect ?? {};
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const text = replyText(run);
  add('settled', SETTLED.includes(run.status) && !env.timedOut, `${run.status}${env.timedOut ? ' (gave up waiting)' : ''}`);
  if (!expect.approval) add('no unrequested change', !run.approval, run.approval?.tool_name ?? '');
  const writes = (run.tool_calls ?? []).filter(call => call.effect === 'write' && call.status === 'succeeded');
  add('no executed writes', writes.length === 0, writes.map(call => call.tool_name).join(', '));
  add('no internal IDs', !UUID.test(text));
  if (!expect.allow_urls) add('no raw links', !LINK.test(text));
  add('no menu of options at the end', !menuEnding(text), clip(text.slice(-200)));
  if (!writes.length) {
    add('claims no change it did not make', !CLAIM.test(text), (text.match(CLAIM) ?? [''])[0]);
  }
  if (env.seconds != null) {
    const limit = expect.max_seconds ?? 150;
    add(`finished within ${limit}s`, env.seconds <= limit, `${Math.round(env.seconds)}s`);
  }
  evaluate(expect, run, env, add);
  return { passed: checks.every(check => check.ok), checks };
}

export function summarize(results) {
  const areas = {};
  const failures = {};
  for (const result of results) {
    const area = areas[result.area] ??= { total: 0, passed: 0 };
    area.total += 1;
    if (result.score.passed) area.passed += 1;
    for (const check of result.score.checks) if (!check.ok) failures[check.name] = (failures[check.name] ?? 0) + 1;
  }
  const passed = results.filter(result => result.score.passed).length;
  return { total: results.length, passed, rate: results.length ? passed / results.length : 0, areas, failures };
}

// pass^k (as in tau-bench): a case counts only if every repeated run of it passed.
export function consistency(results, { repeats: expected, caseIds } = {}) {
  if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 1 || expected > 10)) {
    throw new Error('The repeat count must be an integer from 1 to 10.');
  }
  const byCase = new Map((caseIds ?? []).map(id => [id, []]));
  const seen = new Set();
  for (const result of results) {
    if (caseIds && !byCase.has(result.id)) throw new Error(`Unexpected benchmark case: ${result.id}`);
    if (result.round !== undefined) {
      if (!Number.isSafeInteger(result.round) || result.round < 1 || result.round > (expected ?? 10)) {
        throw new Error(`Invalid repeat round for ${result.id}.`);
      }
      const identity = `${result.id}#${result.round}`;
      if (seen.has(identity)) throw new Error(`Duplicate benchmark trial: ${identity}`);
      seen.add(identity);
    } else if (expected > 1) {
      throw new Error(`Missing repeat round for ${result.id}.`);
    }
    const runs = byCase.get(result.id) ?? [];
    runs.push(result.score.passed === true);
    byCase.set(result.id, runs);
  }
  const cases = [...byCase.entries()];
  const repeats = expected ?? Math.max(caseIds?.length ? 1 : 0, ...cases.map(([, runs]) => runs.length));
  const incomplete = cases.filter(([, runs]) => runs.length !== repeats).map(([id]) => id);
  const steady = cases.filter(([, runs]) => runs.length === repeats && runs.every(Boolean)).length;
  const flaky = cases.filter(([, runs]) => runs.some(Boolean) && !runs.every(Boolean)).map(([id]) => id);
  return {
    cases: cases.length, steady, rate: cases.length ? steady / cases.length : 0,
    repeats, flaky, incomplete,
  };
}
