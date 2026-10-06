import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateVariants, isDated, loadCases, menuEnding, registryNames, resolveDates, scoreRun, scriptShare, summarize, threads, validateCases,
} from './agent-golden-score.mjs';

const cases = loadCases();
const byId = Object.fromEntries(cases.map(item => [item.id, item]));
const env = { dates: resolveDates(new Date('2026-10-06T05:00:00Z')), seconds: 40, timedOut: false };
const run = overrides => ({
  status: 'completed', outcome: 'answered', stop_reason: null, answer: '', question: null, approval: null,
  sources: [], handoffs: [], tool_calls: [], events: [], ...overrides,
});
const call = (tool_name, status = 'succeeded', effect = 'read') => ({ tool_name, status, effect });
const failed = score => score.checks.filter(check => !check.ok).map(check => check.name);
const news = 'As of 6 October 2026, OpenAI announced a new safety review for its next model, according to Reuters (6 Oct 2026) and '
  + 'OpenAI\'s own post (5 Oct 2026). Among the big tech companies, Meta and Google reported new AI chips this week. '
  + 'Not confirmed yet: the release date of the model; OpenAI did not give one. MAFANG is read here as the large tech companies; '
  + 'the Mirae Asset fund with that name had no news of its own today.';
const newsRun = overrides => run({
  answer: news,
  tool_calls: [call('web.search'), call('web.read'), call('web.read')],
  sources: [{ title: 'Reuters', url: 'https://example.test/a', read: true }, { title: 'OpenAI', url: 'https://example.test/b', read: true }],
  ...overrides,
});

test('the golden cases are valid and only name tools the Agent has', () => {
  assert.deepEqual(validateCases(cases), []);
  assert.ok(cases.length >= 40);
  assert.ok(cases.filter(item => item.source === 'real').length >= 20);
  assert.deepEqual([...new Set(cases.map(item => item.scope))].sort(), ['main', 'space']);
  const registry = registryNames();
  for (const name of ['web.search', 'web.read', 'tasks.create', 'events.create', 'agent.spaces.handoff', 'community.posts.like']) assert.ok(registry.has(name), name);
});

test('broken cases are reported instead of silently scoring nothing', () => {
  const problems = validateCases([
    { id: 'one', area: 'news', scope: 'main', source: 'real', message: 'x', thread: 't', expect: { tools_all: ['web.find'], answer_match: ['('] } },
    { id: 'one', area: 'weather', scope: 'space', source: 'guess', message: ' ', thread: 't', expect: { typo: true } },
  ]);
  for (const expected of ['one: bad pattern (', 'one: unknown tool web.find', 'one: duplicate id', 'one: unknown area weather',
    'one: unknown source guess', 'one: message must be 1-2000 characters', 'one: thread t mixes scopes', 'one: unknown expectation "typo"']) {
    assert.ok(problems.some(problem => problem.startsWith(expected)), `${expected}\n${problems.join('\n')}`);
  }
  assert.equal(problems.length, 8);
});

test('relative dates follow the person\'s timezone, including just after midnight and on a Saturday', () => {
  assert.deepEqual(resolveDates(new Date('2026-10-06T05:00:00Z')), { today: '2026-10-06', tomorrow: '2026-10-07', day_after: '2026-10-08', saturday: '2026-10-10' });
  assert.deepEqual(resolveDates(new Date('2026-10-06T19:00:00Z')), { today: '2026-10-07', tomorrow: '2026-10-08', day_after: '2026-10-09', saturday: '2026-10-10' });
  assert.equal(resolveDates(new Date('2026-10-10T06:00:00Z')).saturday, '2026-10-10');
  assert.ok(dateVariants('2026-10-07').includes('07 Oct 2026'));
  assert.ok(dateVariants('2026-10-07').includes('Oct 7'));
  assert.ok(dateVariants('2026-10-07').includes('07-10-2026'));
});

test('a dated, sourced news answer passes and each missing quality is named', () => {
  const spec = byId['main-news-typo'];
  assert.deepEqual(failed(scoreRun(spec, newsRun(), env)), []);
  assert.deepEqual(failed(scoreRun(spec, newsRun({ sources: [{ title: 'OpenAI', url: 'https://example.test/b', read: true }] }), env)), ['read 2+ sources']);
  assert.deepEqual(failed(scoreRun(spec, newsRun({ answer: news.replace(/\d{1,2} Oct(?:ober)? 2026/g, 'recently') }), env)), ['gives dates']);
  assert.deepEqual(failed(scoreRun(spec, newsRun({ answer: `${news} Read more at https://example.test/a` }), env)), ['no raw links']);
  assert.deepEqual(failed(scoreRun(spec, newsRun(), { ...env, seconds: 200 })), ['finished within 150s']);
  const menu = `${news}\n\nWhat would you like next?\n- I can pull a daily briefing.\n- I can save a summary to memory.\n- I can set up an alert.\n\nTell me which option you prefer.`;
  assert.deepEqual(failed(scoreRun(spec, newsRun({ answer: menu }), env)), ['no menu of options at the end']);
});

test('a proposed task is checked field by field against the request', () => {
  const spec = byId['space-groceries-typos'];
  const proposal = (title, due) => run({
    status: 'waiting_for_approval', outcome: null,
    approval: { tool_name: 'tasks.create', fields: [{ label: 'Space', value: 'Golden family' }, { label: 'Title', value: title }, { label: 'Due date', value: due }] },
  });
  assert.deepEqual(failed(scoreRun(spec, proposal('Buy eggs, milk, onions, curd and tomato', 'Wed 07 Oct 2026'), env)), []);
  assert.deepEqual(failed(scoreRun(spec, proposal('To', 'None'), env)), [
    'Title matches /egg|milk|onion|curd|tomato|grocer|shopping/', 'Title avoids /^\\s*(to|for|add|create)?\\s*$/', 'Due date is tomorrow (2026-10-07)',
  ]);
  assert.deepEqual(failed(scoreRun(byId['space-add-task-typo'], run({ answer: 'Which task?' }), env)), ['status', 'proposes tasks.create', 'Title matches /milk/']);
});

test('a change nobody asked for, an invented action and internal IDs fail every case', () => {
  const spec = byId['space-vague-event'];
  const invented = run({ status: 'waiting_for_approval', approval: { tool_name: 'events.create', fields: [{ label: 'Title', value: 'Event' }] }, answer: 'Shall I create it?' });
  assert.deepEqual(failed(scoreRun(spec, invented, env)), ['no unrequested change', 'status', 'asks a question']);
  assert.deepEqual(failed(scoreRun(spec, run({ answer: 'I\'ve created the event. What time should it start?' }), env)), ['claims no change it did not make']);
  assert.deepEqual(failed(scoreRun(spec, run({ answer: 'Which event (3f2a9c1e-1111-4222-8333-123456789abc)?' }), env)), ['no internal IDs']);
  assert.deepEqual(failed(scoreRun(spec, run({ status: 'waiting_for_user', question: { id: 'q', text: 'What is the event called, and when?' } }), env)), []);
});

test('either a clarifying question or an answer that covers both meanings is acceptable', () => {
  const spec = byId['main-apple-price'];
  assert.equal(scoreRun(spec, run({ status: 'waiting_for_user', question: { id: 'q', text: 'Do you mean apples the fruit or Apple shares?' } }), env).passed, true);
  assert.equal(scoreRun(spec, run({ answer: 'Apples (fruit) sell for about Rs 180 per kg in Hyderabad markets today, 6 Oct 2026. Apple shares (AAPL) closed at $250.' }), env).passed, true);
  assert.deepEqual(failed(scoreRun(spec, run({ answer: 'Apples cost about Rs 180 per kg.' }), env)), ['one acceptable behaviour']);
  const guessed = 'Apple (AAPL) last traded at 332.85 USD on CNBC.\n\nWould you like me to set up a price alert or check again later?';
  assert.deepEqual(failed(scoreRun(spec, run({ answer: guessed }), env)), ['one acceptable behaviour']);
});

test('answers in Telugu or Hindi are recognised by their script, with English names allowed', () => {
  assert.ok(scriptShare('ఈ రోజు హైదరాబాద్‌లో OpenAI గురించి వార్తలు ఉన్నాయి', 'telugu') >= 0.4);
  assert.ok(scriptShare('आज OpenAI ने नया मॉडल जारी किया', 'devanagari') >= 0.4);
  assert.ok(scriptShare('Today in Hyderabad the news is about rain', 'telugu') < 0.4);
  assert.ok(isDated('6 అక్టోబర్ న వార్తలు'));
  assert.ok(isDated('अक्टूबर की खबरें'));
  assert.ok(isDated('on Oct 6 the launch moved'));
  assert.equal(isDated('recently the launch moved'), false);
});

test('only an options menu at the end counts, not facts followed by one offer', () => {
  assert.equal(menuEnding('Here is the news.\nWould you like me to:\n- read the first source\n- search again'), true);
  assert.equal(menuEnding('Here is the news.\nDo you want me to read it, compare the sources, or search again?'), true);
  assert.equal(menuEnding('Facts:\n- one\n- two\n- three\nWant me to read the first source in detail?'), false);
  assert.equal(menuEnding('Here is the news. Want me to read it or search for more?'), false);
});

test('threads keep follow-ups with the request they follow, and summaries count by area', () => {
  const grouped = threads(cases).filter(group => group.length > 1).map(group => group.map(item => item.id));
  assert.deepEqual(grouped, [['main-shop-bigbasket', 'main-shop-location'], ['main-recipe', 'main-recipe-followup']]);
  const summary = summarize([
    { area: 'news', score: { passed: true, checks: [] } },
    { area: 'news', score: { passed: false, checks: [{ name: 'gives dates', ok: false }] } },
    { area: 'space', score: { passed: true, checks: [] } },
  ]);
  assert.deepEqual(summary, { total: 3, passed: 2, rate: 2 / 3, areas: { news: { total: 2, passed: 1 }, space: { total: 1, passed: 1 } }, failures: { 'gives dates': 1 } });
});
