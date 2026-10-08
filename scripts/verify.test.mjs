import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { changedPaths, checkMigrationHeads, defaultSuites, formatTally, getBlocker, getTally, parseArgs, prepareEnvironment, readCounts, runCommand, runSuite, runVerification, suiteDefinitions, suiteOrder, windowsCommand } from './verify.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'community-verify-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('legacy and long CLI options preserve ordered, comma-separated and optional suites', () => {
  assert.deepEqual(parseArgs([]).selected, defaultSuites);
  assert.deepEqual(defaultSuites, suiteOrder.slice(0, -2));
  assert.deepEqual(parseArgs(['-Suite', 'unit,CLIENT', 'unit', '-Output', 'logs with spaces']), {
    selected: ['client', 'unit'], output: 'logs with spaces', help: false,
  });
  assert.deepEqual(parseArgs(['--suite=device,live', '--output=logs']).selected, ['device', 'live']);
  assert.equal(parseArgs(['--help']).help, true);
  for (const argumentsList of [['-Suite'], ['-Output'], ['-Suite', ','], ['-Suite', 'unknown'], ['--unknown']]) {
    assert.throws(() => parseArgs(argumentsList));
  }
});

test('Windows dispatch retains the PowerShell wrapper and argument boundaries', () => {
  const options = parseArgs(['-Suite', 'tokens,client', '-Output', 'logs with spaces']);
  assert.deepEqual(windowsCommand(options, '/project'), {
    file: 'powershell',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join('/project', 'scripts', 'verify.ps1'), '-Suite', 'tokens,client', '-Output', 'logs with spaces'],
  });
});

test('Linux definitions preserve every suite and use the POSIX offline Gradle wrapper', () => {
  const definitions = suiteDefinitions();
  assert.deepEqual(Object.keys(definitions), suiteOrder);
  assert.equal(definitions.runner.commands[0].file, process.execPath);
  assert.deepEqual(definitions.runner.commands[0].args, ['--test', 'scripts/verify.test.mjs', 'scripts/work-cycle.test.mjs']);
  assert.deepEqual(definitions.android.commands[0].args, ['android/gradlew', '-p', 'android', ':app:testDebugUnitTest', '--offline', '--console=plain', '--rerun']);
  assert.equal(definitions.contracts.commands.length, 2);
  assert.ok(definitions.backend.commands[0].args.includes('never'));
  assert.equal(definitions.device.kind, 'instrument');
});

test('golden follows tokens in defaults and runs evaluator tests before offline inventory', () => {
  const expectedOrder = ['runner', 'records', 'structure', 'tokens', 'golden', 'contracts', 'typecheck', 'client', 'unit', 'backend', 'android', 'device', 'live'];
  assert.deepEqual(suiteOrder, expectedOrder);
  assert.deepEqual(defaultSuites, expectedOrder.slice(0, -2));
  assert.deepEqual(parseArgs([]).selected, expectedOrder.slice(0, -2));
  assert.deepEqual(parseArgs(['-Suite', 'golden,tokens']).selected, ['tokens', 'golden']);
  assert.deepEqual(suiteDefinitions().golden, {
    title: 'Agent golden evaluator', kind: 'node', commands: [
      { file: 'npm', args: ['run', 'test:golden'], kind: 'node' },
      { file: 'npm', args: ['run', 'golden'], kind: 'none' },
    ],
  });
});

test('repository automation runs only offline tooling on Linux and Windows with read-only permissions', () => {
  const workflow = JSON.parse(readFileSync(join(projectRoot, '.github', 'workflows', 'offline-verification.yml'), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.tooling;
  assert.deepEqual(job.strategy.matrix.os, ['ubuntu-latest', 'windows-latest']);
  assert.equal(job.strategy['fail-fast'], false);
  assert.equal(job['timeout-minutes'], 10);
  assert.deepEqual(job.steps.filter(step => step.run).map(step => step.run), [
    'node --test scripts/verify.test.mjs',
    'npm run verify -- --suite runner,tokens,golden --output .local/verify/ci',
  ]);
  const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(checkout.with['fetch-depth'], 2);
  const artifact = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(artifact.if, '${{ always() }}');
  assert.equal(artifact.with.path, '.local/verify/ci');
  assert.equal(artifact.with['include-hidden-files'], true);
});

test('native commands preserve logs and nonzero exits without a Windows shell', context => {
  const root = fixture(context);
  const log = join(root, 'command.log');
  const result = runCommand({ file: process.execPath, args: ['-e', 'console.log(process.argv[1]); console.error("diagnostic"); process.exit(7)', 'argument with spaces'] }, {
    root, env: process.env, log, report() {},
  });
  assert.equal(result.code, 7);
  assert.match(result.text, /argument with spaces\ndiagnostic/);
  assert.match(readFileSync(log, 'utf8'), /> exit code 7/);
});

test('an absent executable is not a successful command', context => {
  const root = fixture(context);
  const result = runCommand({ file: join(root, 'missing-tool'), args: [] }, {
    root, env: process.env, log: join(root, 'missing.log'), report() {},
  });
  assert.equal(result.code, 1);
  assert.match(result.error, /ENOENT/);
});

test('Node summaries preserve skipped, todo, failed and cancelled results across commands', () => {
  const counts = readCounts('node', '# tests 6\n# pass 2\n# fail 1\n# cancelled 1\n# skipped 1\n# todo 1\n');
  const tally = getTally('node', counts);
  assert.deepEqual(tally, { total: 6, passed: 2, failed: 1, skipped: 2, cancelled: 1 });
  assert.equal(formatTally(tally), '2 of 6 passed, 1 failed, 2 skipped, 1 cancelled');
  assert.deepEqual(readCounts('node', '# tests 1\n# pass 1\n# fail 0\n# tests 1\n# pass 0\n# fail 1\n'), { tests: 2, pass: 1, fail: 1 });
  assert.throws(() => readCounts('node', '# tests 2\n# pass 1\n# fail 0\n'), /Inconsistent/);
  assert.throws(() => readCounts('node', '# tests 2\n'), /Incomplete/);
  assert.equal(getTally('node', readCounts('node', 'not a test summary')), null);
  assert.equal(getTally('node', readCounts('node', '# tests 0\n# pass 0\n# fail 0\n')), null);
});

test('pytest counts handle quiet summaries, errors, expected failures and skipped cases', () => {
  const counts = readCounts('pytest', '======= 4 passed, 1 failed, 2 errors, 3 skipped, 2 xfailed, 1 xpassed, 7 warnings in 0.21s =======\n');
  assert.deepEqual(getTally('pytest', counts), { total: 13, passed: 5, failed: 3, skipped: 5, cancelled: 0 });
  assert.deepEqual(readCounts('pytest', '2 passed in 0.12s\n'), { passed: 2 });
  assert.equal(getTally('pytest', readCounts('pytest', 'no tests ran in 0.12s')), null);
});

test('instrumentation counts include skipped and unfinished tests without inventing passes', () => {
  const counts = readCounts('instrument', [1, 0, 1, -3, 1, -2, 1].map(code => `INSTRUMENTATION_STATUS_CODE: ${code}`).join('\n'));
  assert.deepEqual(getTally('instrument', counts), { total: 4, passed: 1, failed: 2, skipped: 1, cancelled: 0 });
});

function reportsFixture(context) {
  const root = fixture(context);
  const folder = join(root, 'android', 'app', 'build', 'test-results', 'testDebugUnitTest');
  mkdirSync(folder, { recursive: true });
  const since = Date.now() - 1000;
  return { root, env: process.env, since, folder };
}

test('fresh structured JVM reports preserve counts and reject uncaught errors in CDATA and escaped text', context => {
  const options = reportsFixture(context);
  const fatal = 'Exception in thread "DefaultDispatcher-worker-2" synthetic.Fatal';
  writeFileSync(join(options.folder, 'TEST-first.xml'), `<testsuite tests="3" failures="0" errors="0" skipped="1"><system-err><![CDATA[${fatal}\n${fatal}]]></system-err></testsuite>`);
  writeFileSync(join(options.folder, 'TEST-second.xml'), '<testsuites><testsuite tests="2" failures="1" errors="0" skipped="0"><system-err>Exception in thread &quot;worker&quot; synthetic.Error</system-err></testsuite></testsuites>');
  const counts = readCounts('junit', '', options);
  assert.deepEqual(counts, { classes: 2, uncaughtClasses: 2, tests: 5, failures: 1, errors: 0, skipped: 1 });
  assert.deepEqual(getTally('junit', counts), { total: 5, passed: 3, failed: 1, skipped: 1, cancelled: 0 });
});

test('nested JVM reports count only leaf suites, even when wrapper totals conceal failures', context => {
  const options = reportsFixture(context);
  const file = join(options.folder, 'TEST-nested.xml');
  const nested = '<testsuite tests="5" failures="1" errors="1" skipped="1"><testsuite tests="3" failures="1" skipped="1"/><testsuite tests="2" errors="1"/></testsuite><testsuite tests="1"/>';
  for (const xml of [`<testsuites>${nested}</testsuites>`, `<testsuite tests="99" failures="0">${nested}</testsuite>`]) {
    writeFileSync(file, xml);
    const counts = readCounts('junit', '', options);
    assert.deepEqual(counts, { classes: 1, uncaughtClasses: 0, tests: 6, failures: 1, errors: 1, skipped: 1 });
    assert.deepEqual(getTally('junit', counts), { total: 6, passed: 3, failed: 2, skipped: 1, cancelled: 0 });
  }
  writeFileSync(file, '<testsuites><testsuite tests="2"/><testsuite tests="1" skipped="1"/></testsuites>');
  assert.deepEqual(getTally('junit', readCounts('junit', '', options)), { total: 3, passed: 2, failed: 0, skipped: 1, cancelled: 0 });
});

test('JVM counts require nonnegative, consistent values in each leaf before aggregation', context => {
  const options = reportsFixture(context);
  const file = join(options.folder, 'TEST-invalid.xml');
  for (const xml of [
    '<testsuite failures="0"/>',
    '<testsuite tests="-1"/>',
    '<testsuite tests="3" failures="-1"/>',
    '<testsuite tests="3" errors="-1"/>',
    '<testsuite tests="3" skipped="-1"/>',
    '<testsuite tests="2" failures="1" errors="1" skipped="1"/>',
    '<testsuite tests="0" skipped="1"/>',
    '<testsuites><testsuite tests="1" failures="2"/><testsuite tests="3"/></testsuites>',
    '<testsuites><testsuite tests="1" failures="-1"/><testsuite tests="2" failures="1"/></testsuites>',
  ]) {
    writeFileSync(file, xml);
    assert.throws(() => readCounts('junit', '', options), /invalid JUnit counts/, xml);
  }
  for (const xml of ['<testsuite tests=""/>', '<testsuite tests="1.5"/>', '<testsuite tests="3" skipped="invalid"/>']) {
    writeFileSync(file, xml);
    assert.throws(() => readCounts('junit', '', options), /invalid literal/, xml);
  }
  writeFileSync(file, '<testsuites/>');
  assert.throws(() => readCounts('junit', '', options), /no testsuite elements/);
});

test('stale JVM reports are excluded and missing or malformed results cannot become a tally', context => {
  const options = reportsFixture(context);
  const stale = join(options.folder, 'TEST-stale.xml');
  writeFileSync(stale, '<testsuite tests="9" failures="9"/>');
  utimesSync(stale, new Date(0), new Date(0));
  assert.deepEqual(readCounts('junit', '', options), {});
  assert.equal(getTally('junit', readCounts('junit', '', options)), null);
  const fresh = join(options.folder, 'TEST-fresh.xml');
  writeFileSync(fresh, '<testsuite tests="2" failures="0" errors="0" skipped="0"><system-err>WARNING: synthetic diagnostic</system-err></testsuite>');
  assert.equal(readCounts('junit', '', options).tests, 2);
  assert.equal(readCounts('junit', '', options).uncaughtClasses, 0);
  writeFileSync(fresh, '<testsuite tests="1" failures="2"/>');
  assert.throws(() => readCounts('junit', '', options), /invalid JUnit counts/);
  writeFileSync(fresh, '<testsuite');
  assert.throws(() => readCounts('junit', '', options), /parser failed/);
});

test('the XML parser prerequisite fails explicitly when Python is unavailable', context => {
  const options = reportsFixture(context);
  assert.throws(() => readCounts('junit', '', { ...options, env: { ...process.env, PATH: options.root } }), /Python 3 parser failed:.*ENOENT/);
});

test('migration guards cover duplicate and multiple heads, annotated revisions and merges', context => {
  const root = fixture(context);
  const folder = join(root, 'backend', 'migrations', 'versions');
  mkdirSync(folder, { recursive: true });
  const options = { root, env: process.env };
  assert.match(checkMigrationHeads(options), /No migration revisions/);
  writeFileSync(join(folder, 'first.py'), 'revision: str = "first"\ndown_revision = None\n');
  assert.equal(checkMigrationHeads(options), null);
  writeFileSync(join(folder, 'second.py'), 'revision = "second"\ndown_revision = None\n');
  assert.match(checkMigrationHeads(options), /more than one newest revision/);
  writeFileSync(join(folder, 'merge.py'), 'revision = "merged"\ndown_revision = ("first", "second")\n');
  assert.equal(checkMigrationHeads(options), null);
  writeFileSync(join(folder, 'duplicate.py'), 'revision = "first"\ndown_revision = None\n');
  assert.match(checkMigrationHeads(options), /Two migrations both say revision first/);
});

function syntheticCommand(source, kind = 'node') {
  return { file: process.execPath, args: ['-e', source], kind };
}

function nodeSummary({ passed = 1, failed = 0, skipped = 0, cancelled = 0 } = {}) {
  return `# tests ${passed + failed + skipped + cancelled}\n# pass ${passed}\n# fail ${failed}\n# skipped ${skipped}\n# cancelled ${cancelled}\n`;
}

test('golden inventory exit status controls suite and gate results after passing tests', async context => {
  const output = fixture(context);
  const golden = suiteDefinitions().golden;
  for (const code of [0, 7]) {
    const definitions = {
      golden: {
        ...golden,
        commands: [
          syntheticCommand(`console.log(${JSON.stringify(nodeSummary({ passed: 2 }))})`, golden.commands[0].kind),
          syntheticCommand(`console.log("Offline golden inventory"); process.exit(${code})`, golden.commands[1].kind),
        ],
      },
    };
    const record = await runVerification({ output, definitions, selected: ['golden'], report() {} });
    const entry = record.suites[0];
    assert.equal(record.exitCode, code === 0 ? 0 : 1);
    assert.equal(entry.result, code === 0 ? 'passed' : 'failed');
    assert.deepEqual(entry.tally, { total: 2, passed: 2, failed: 0, skipped: 0, cancelled: 0 });
    assert.equal(entry.summary, '2 of 2 passed');
    assert.deepEqual(record.evidenceErrors, []);
    const log = readFileSync(entry.log, 'utf8');
    assert.match(log, /Offline golden inventory/);
    assert.ok(log.includes(`> exit code ${code}`));
    const saved = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8'));
    assert.equal(saved.exitCode, record.exitCode);
    assert.equal(saved.suites[0].result, entry.result);
  }
});

test('aggregation continues after nonzero and missing results, with logs and source-state evidence', async context => {
  const output = fixture(context);
  const definitions = {
    runner: { title: 'Synthetic nonzero', kind: 'node', commands: [syntheticCommand(`console.log(${JSON.stringify(nodeSummary())}); process.exit(7)`), syntheticCommand(`console.log(${JSON.stringify(nodeSummary())})`)] },
    records: { title: 'Synthetic missing results', kind: 'node', commands: [syntheticCommand('console.log("no results")'), syntheticCommand(`console.log(${JSON.stringify(nodeSummary())})`)] },
    tokens: { title: 'Synthetic final success', kind: 'node', commands: [syntheticCommand(`console.log(${JSON.stringify(nodeSummary({ passed: 2, skipped: 1 }))})`)] },
    typecheck: { title: 'Synthetic check-only', kind: 'none', commands: [syntheticCommand('console.log("checked")', 'none')] },
  };
  const record = await runVerification({ output, definitions, selected: Object.keys(definitions), report() {} });
  assert.equal(record.exitCode, 1);
  assert.deepEqual(record.suites.map(entry => entry.result), ['failed', 'failed', 'passed', 'passed']);
  assert.equal(record.suites[0].tally.passed, 2);
  assert.equal(record.suites[2].tally.skipped, 1);
  assert.match(readFileSync(join(output, 'runner.log'), 'utf8'), /> exit code 7/);
  assert.match(readFileSync(join(output, 'records.log'), 'utf8'), /No current node test results/);
  assert.match(record.commit, /^[a-f0-9]+$/);
  assert.deepEqual(record.evidenceErrors, []);
  assert.equal(typeof record.sourceBefore, 'object');
  assert.equal(typeof record.sourceAfter, 'object');
  assert.ok(Array.isArray(record.changedDuringRun));
  assert.equal(JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8')).exitCode, 1);
  assert.match(readFileSync(join(output, 'summary.md'), 'utf8'), /2 of 3 passed, 1 skipped/);
});

test('reported failures and cancellations fail even at exit zero; all-skipped is not run', async context => {
  const root = fixture(context);
  for (const outcome of [{ failed: 1 }, { cancelled: 1 }, { passed: 0, skipped: 2 }]) {
    const definition = { title: 'Synthetic outcomes', kind: 'node', commands: [syntheticCommand(`console.log(${JSON.stringify(nodeSummary(outcome))})`)] };
    const entry = await runSuite('synthetic', definition, { root, output: root, env: process.env, report() {} });
    assert.equal(entry.result, outcome.skipped ? 'not run' : 'failed');
    assert.equal(entry.tally.cancelled, outcome.cancelled ?? 0);
    assert.equal(entry.tally.failed, outcome.failed ?? 0);
  }
});

test('missing prerequisites and the Windows-only device suite do not execute commands', async context => {
  const root = fixture(context);
  const definition = { title: 'Missing tool', kind: 'node', commands: [{ file: join(root, 'missing-tool'), args: [], kind: 'node' }] };
  const entry = await runSuite('synthetic', definition, { root, output: root, env: process.env, report() {} });
  assert.equal(entry.result, 'not run');
  assert.equal(entry.tally, null);
  assert.match(readFileSync(entry.log, 'utf8'), /^Not run: Required executable/);
  const device = await runSuite('device', suiteDefinitions().device, { root, output: root, env: process.env, report() {} });
  assert.equal(device.result, 'not run');
  assert.match(device.note, /requires Windows/);
  const parser = await getBlocker('synthetic', { ...definition, kind: 'junit', commands: [] }, { root, env: { ...process.env, PATH: root } });
  assert.match(parser, /Python 3 standard-library parsers/);
});

test('JVM stale-only, uncaught and malformed reports fail even when the command succeeds', async context => {
  const options = reportsFixture(context);
  const file = join(options.folder, 'TEST-fixture.xml');
  writeFileSync(file, '<testsuite tests="3" failures="0"/>');
  utimesSync(file, new Date(0), new Date(0));
  const definition = { title: 'Synthetic JVM', kind: 'junit', commands: [syntheticCommand('console.log("successful command")', 'junit')] };
  const invoke = () => runSuite('synthetic', definition, { ...options, output: options.root, report() {} });
  const stale = await invoke();
  assert.equal(stale.result, 'failed');
  assert.equal(stale.tally, null);
  assert.match(stale.summary, /No current junit test results/);
  const fatal = '<testsuite tests="3" failures="0" errors="0" skipped="0"><system-err><![CDATA[Exception in thread "worker" synthetic.Fatal]]></system-err></testsuite>';
  definition.commands = [syntheticCommand(`require('node:fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(fatal)})`, 'junit')];
  const uncaught = await invoke();
  assert.equal(uncaught.result, 'failed');
  assert.equal(uncaught.counts.uncaughtClasses, 1);
  assert.equal(uncaught.tally.passed, 3);
  assert.match(uncaught.summary, /uncaught exceptions/);
  definition.commands = [syntheticCommand(`require('node:fs').writeFileSync(${JSON.stringify(file)}, '<testsuite')`, 'junit')];
  assert.equal((await invoke()).result, 'failed');
});

test('source state tracks additions, deletions and changes, and missing evidence fails the run', async context => {
  assert.deepEqual(changedPaths({ unchanged: 'same', edited: 'old', deleted: 'old' }, { unchanged: 'same', edited: 'new', added: 'new' }), ['added', 'deleted', 'edited']);
  const root = fixture(context);
  const definitions = { typecheck: { title: 'Synthetic check', kind: 'none', commands: [syntheticCommand('', 'none')] } };
  for (const env of [process.env, { ...process.env, PATH: root }]) {
    const record = await runVerification({ root, output: root, env, definitions, selected: ['typecheck'], report() {} });
    assert.equal(record.suites[0].result, 'passed');
    assert.equal(record.exitCode, 1);
    assert.equal(record.evidenceErrors.length, 2);
    assert.ok(record.evidenceErrors.every(message => message.startsWith('Source-state evidence unavailable:')));
    if (env.PATH === root) assert.ok(record.evidenceErrors.every(message => message.includes('ENOENT')));
    assert.equal(record.commit, null);
    assert.equal(record.endCommit, null);
    assert.equal(record.uncommitted, null);
    const saved = JSON.parse(readFileSync(join(root, 'summary.json'), 'utf8'));
    assert.equal(saved.exitCode, 1);
    assert.deepEqual(saved.evidenceErrors, record.evidenceErrors);
    assert.match(readFileSync(join(root, 'summary.md'), 'utf8'), /Source-state evidence unavailable:/);
  }
});

test('environment defaults are isolated from the caller', () => {
  const inherited = { PATH: '', FORCE_COLOR: '1' };
  const prepared = prepareEnvironment(['live'], projectRoot, inherited);
  assert.deepEqual(inherited, { PATH: '', FORCE_COLOR: '1' });
  assert.equal(prepared.FORCE_COLOR, '0');
  assert.equal(prepared.COMMUNITY_WEB_URL, 'http://127.0.0.1:3000');
});

test('CLI errors and unavailable prerequisites exit nonzero and retain -Suite/-Output compatibility', context => {
  const output = join(fixture(context), 'logs with spaces');
  const script = join(projectRoot, 'scripts', 'verify.mjs');
  const invalid = spawnSync(process.execPath, [script, '-Suite', 'unknown'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown suite/);
  const blocked = spawnSync(process.execPath, [script, '-Suite', 'tokens', '-Output', output], { env: { ...process.env, PATH: output }, encoding: 'utf8' });
  assert.equal(blocked.status, 1);
  const record = JSON.parse(readFileSync(join(output, 'summary.json'), 'utf8'));
  assert.deepEqual(record.suites.map(entry => entry.suite), ['tokens']);
  assert.equal(record.suites[0].result, 'not run');
  assert.match(record.suites[0].note, /npm/);
});