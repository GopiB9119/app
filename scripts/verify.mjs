import { spawnSync } from 'node:child_process';
import { accessSync, appendFileSync, closeSync, constants, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const suiteOrder = ['runner', 'records', 'structure', 'tokens', 'golden', 'contracts', 'typecheck', 'client', 'unit', 'backend', 'android', 'device', 'live'];
export const defaultSuites = suiteOrder.filter(name => !['device', 'live'].includes(name));

export function parseArgs(argumentsList) {
  const selected = [];
  let output;
  let help = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (/^(--help|-h|-\?)$/i.test(argument)) {
      help = true;
      continue;
    }
    const option = /^--?(suite|output)(?:=(.*))?$/i.exec(argument);
    if (!option) throw new Error(`Unknown argument: ${argument}`);
    const values = option[2] === undefined ? [] : [option[2]];
    if (values.length === 0) {
      while (index + 1 < argumentsList.length && !argumentsList[index + 1].startsWith('-')) {
        values.push(argumentsList[++index]);
        if (option[1].toLowerCase() === 'output') break;
      }
    }
    if (values.length === 0 || values.some(value => !value.trim())) throw new Error(`Missing value for ${argument}`);
    if (option[1].toLowerCase() === 'output') {
      output = values[0];
    } else {
      const names = values.flatMap(value => value.split(',')).map(value => value.trim().toLowerCase()).filter(Boolean);
      if (names.length === 0) throw new Error('At least one suite is required.');
      selected.push(...names);
    }
  }
  const unknown = selected.filter(name => !suiteOrder.includes(name));
  if (unknown.length) throw new Error(`Unknown suite: ${unknown.join(', ')}. Choose from: ${suiteOrder.join(', ')}.`);
  return { selected: selected.length ? suiteOrder.filter(name => selected.includes(name)) : [...defaultSuites], output, help };
}

export function windowsCommand({ selected, output }, root) {
  return {
    file: 'powershell',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'verify.ps1'), '-Suite', selected.join(','), ...(output ? ['-Output', output] : [])],
  };
}

export function suiteDefinitions() {
  const command = (file, args, kind = 'none') => ({ file, args, kind });
  const npm = (script, kind = 'none') => command('npm', ['run', script], kind);
  const web = (script, kind = 'node') => command('npm', ['--prefix', 'web', 'run', script], kind);
  return {
    runner: { title: 'Verification runner and work-cycle supervisor', kind: 'node', commands: [command(process.execPath, ['--test', 'scripts/verify.test.mjs', 'scripts/work-cycle.test.mjs'], 'node')] },
    records: { title: 'Records kept', kind: 'node', commands: [npm('test:records', 'node'), npm('check:records')] },
    structure: { title: 'Structure', kind: 'node', commands: [npm('test:structure', 'node'), npm('check:structure')] },
    tokens: { title: 'Design tokens', kind: 'node', commands: [npm('test:tokens', 'node'), npm('check:tokens')] },
    golden: { title: 'Agent golden evaluator', kind: 'node', commands: [npm('test:golden', 'node'), npm('golden')] },
    contracts: { title: 'OpenAPI contract', kind: 'pytest', commands: [npm('test:openapi', 'pytest'), npm('check:openapi')] },
    typecheck: { title: 'Web type check', kind: 'none', commands: [web('typecheck', 'none')] },
    client: { title: 'Web client and BFF', kind: 'node', commands: [web('test:client')] },
    unit: { title: 'Web offline components', kind: 'node', commands: [web('test:unit')] },
    backend: { title: 'Backend', kind: 'pytest', commands: [command('docker', ['compose', '-f', 'infra/compose.yaml', '--profile', 'test', 'run', '--rm', '--pull', 'never', 'tests', 'pytest', '-q', '-p', 'no:cacheprovider'], 'pytest')] },
    android: { title: 'Android JVM', kind: 'junit', commands: [command('sh', ['android/gradlew', '-p', 'android', ':app:testDebugUnitTest', '--offline', '--console=plain', '--rerun'], 'junit')] },
    device: { title: 'Android device', kind: 'instrument', commands: [] },
    live: { title: 'Web live journeys', kind: 'node', commands: [web('test:e2e')] },
  };
}

export function runCommand(command, { root, env, log, report = console.log }) {
  const shown = [command.file, ...command.args].map(value => JSON.stringify(value)).join(' ');
  const part = `${log}.part`;
  report(`> ${shown}`);
  const descriptor = openSync(part, 'w');
  let result;
  try {
    result = spawnSync(command.file, command.args, { cwd: root, env, stdio: ['ignore', descriptor, descriptor] });
  } finally {
    closeSync(descriptor);
  }
  const text = readFileSync(part, 'utf8');
  rmSync(part);
  const error = result.error?.message;
  appendFileSync(log, `> ${shown}\n${text}\n${error ? `${error}\n` : ''}> exit code ${result.status ?? 'none'}${result.signal ? `; signal ${result.signal}` : ''}\n\n`);
  return { text, code: result.status ?? 1, signal: result.signal, error };
}

function runPython(source, args, { root, env }) {
  const result = spawnSync('python3', ['-c', source, ...args], { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Python 3 parser failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  }
  return JSON.parse(result.stdout);
}

export function readCounts(kind, text, context = {}) {
  const clean = stripVTControlCharacters(text);
  const counts = {};
  if (kind === 'node') {
    let summary = {};
    const collect = () => {
      if (!Object.keys(summary).length) return;
      if (!['tests', 'pass', 'fail'].every(key => key in summary)) throw new Error('Incomplete Node test summary.');
      const accounted = ['pass', 'fail', 'cancelled', 'skipped', 'todo'].reduce((total, key) => total + (summary[key] ?? 0), 0);
      if (summary.tests !== accounted) throw new Error('Inconsistent Node test counts.');
      for (const [key, value] of Object.entries(summary)) counts[key] = (counts[key] ?? 0) + value;
      summary = {};
    };
    for (const match of clean.matchAll(/^(?:\S+\s+)?(tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) {
      if (match[1] === 'tests' && 'tests' in summary) collect();
      summary[match[1]] = Number(match[2]);
    }
    collect();
  } else if (kind === 'pytest') {
    const summaries = [...clean.matchAll(/^=*\s*((?:\d+ \w+(?:, )?)+) in [\d.]+s/gm)];
    for (const match of (summaries.at(-1)?.[1] ?? '').matchAll(/(\d+) (\w+)/g)) counts[match[2]] = Number(match[1]);
  } else if (kind === 'junit') {
    return runPython(`
import json, re, sys
from pathlib import Path
from xml.etree import ElementTree

folder = Path(sys.argv[1])
since = float(sys.argv[2])
files = sorted(path for path in folder.glob('TEST-*.xml') if path.stat().st_mtime * 1000 >= since)
counts = {}
if files:
    counts = dict(classes=len(files), uncaughtClasses=0, tests=0, failures=0, errors=0, skipped=0)
for path in files:
    report = ElementTree.parse(path).getroot()
    suites = [suite for suite in report.iter('testsuite') if not suite.findall('.//testsuite')]
    if not suites:
        raise ValueError(f'{path.name}: no testsuite elements')
    for suite in suites:
        values = {name: int(suite.attrib.get(name, '0')) for name in ('tests', 'failures', 'errors', 'skipped')}
        if 'tests' not in suite.attrib or min(values.values()) < 0 or sum(values[name] for name in ('failures', 'errors', 'skipped')) > values['tests']:
            raise ValueError(f'{path.name}: invalid JUnit counts')
        for name, value in values.items():
            counts[name] += value
    stderr = '\\n'.join(''.join(element.itertext()) for element in report.iter('system-err'))
    if re.search(r'^\\s*Exception in thread "[^"]+"', stderr, re.MULTILINE):
        counts['uncaughtClasses'] += 1
print(json.dumps(counts))
`, [join(context.root, 'android', 'app', 'build', 'test-results', 'testDebugUnitTest'), String(context.since)], context);
  } else if (kind === 'instrument') {
    const codes = [...clean.matchAll(/^INSTRUMENTATION_STATUS_CODE: (-?\d+)/gm)].map(match => Number(match[1]));
    if (codes.length) {
      const passed = codes.filter(code => code === 0).length;
      const failed = codes.filter(code => code === -1 || code === -2).length;
      const skipped = codes.filter(code => code === -3 || code === -4).length;
      const unfinished = Math.max(0, codes.filter(code => code === 1).length - passed - failed - skipped);
      Object.assign(counts, { tests: passed + failed + skipped + unfinished, failures: failed + unfinished, skipped });
    }
  }
  return counts;
}

export function getTally(kind, counts) {
  if (Object.keys(counts).length === 0) return null;
  const value = name => counts[name] ?? 0;
  let total;
  let passed;
  let failed;
  let skipped;
  const cancelled = kind === 'node' ? value('cancelled') : 0;
  if (kind === 'node') {
    total = value('tests');
    passed = value('pass');
    failed = value('fail');
    skipped = value('skipped') + value('todo');
  } else if (kind === 'pytest') {
    passed = value('passed') + value('xpassed');
    failed = value('failed') + value('error') + value('errors');
    skipped = value('skipped') + value('xfailed');
    total = passed + failed + skipped;
  } else {
    total = value('tests');
    failed = value('failures') + value('errors');
    skipped = value('skipped');
    passed = total - failed - skipped;
  }
  if (total === 0 && failed === 0 && cancelled === 0) return null;
  if (passed < 0 || total !== passed + failed + skipped + cancelled) throw new Error('Inconsistent test counts.');
  return { total, passed, failed, skipped, cancelled };
}

export function formatTally(tally) {
  if (!tally) return '';
  return [`${tally.passed} of ${tally.total} passed`, ...['failed', 'skipped', 'cancelled'].filter(name => tally[name]).map(name => `${tally[name]} ${name}`)].join(', ');
}

export function checkMigrationHeads(context) {
  return runPython(`
import ast, json, sys
from pathlib import Path

revisions = {}
follows = set()
problem = None
for path in sorted(Path(sys.argv[1]).glob('*.py')):
    values = {}
    for statement in ast.parse(path.read_text(encoding='utf-8'), filename=str(path)).body:
        targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target] if isinstance(statement, ast.AnnAssign) else []
        for target in targets:
            if isinstance(target, ast.Name) and target.id in ('revision', 'down_revision'):
                values[target.id] = ast.literal_eval(statement.value)
    revision = values.get('revision')
    if not revision:
        continue
    if revision in revisions:
        problem = f'Two migrations both say revision {revision} ({revisions[revision]} and {path.name}); one must be renumbered.'
        break
    revisions[revision] = path.name
    previous = values.get('down_revision')
    follows.update(previous if isinstance(previous, (tuple, list)) else [previous] if previous else [])
heads = sorted(set(revisions) - follows)
if not problem:
    if not revisions:
        problem = 'No migration revisions were found.'
    elif follows - set(revisions):
        problem = 'Migration parents are missing: ' + ', '.join(sorted(follows - set(revisions)))
    elif len(heads) > 1:
        problem = 'The migrations have more than one newest revision (' + ', '.join(heads) + '); one must follow the other.'
    elif not heads:
        problem = 'The migrations have no head revision.'
print(json.dumps(problem))
`, [join(context.root, 'backend', 'migrations', 'versions')], context);
}

function findExecutable(file, { root, env }) {
  const candidates = isAbsolute(file) || file.includes('/') ? [resolve(root, file)] : (env.PATH ?? '').split(delimiter).map(folder => resolve(root, folder, file));
  return candidates.find(candidate => {
    try {
      accessSync(candidate, constants.X_OK);
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function prepareEnvironment(selected, root, inherited = process.env) {
  const env = { ...inherited, FORCE_COLOR: '0' };
  if (selected.some(name => ['unit', 'live'].includes(name)) && !env.COMMUNITY_CHROMIUM_PATH) {
    try {
      const browser = createRequire(join(root, 'web', 'package.json'))('playwright').chromium.executablePath();
      if (existsSync(browser)) env.COMMUNITY_CHROMIUM_PATH = browser;
    } catch {}
  }
  if (selected.includes('android')) {
    if (!env.JAVA_HOME) {
      const java = findExecutable('java', { root, env });
      if (java) env.JAVA_HOME = dirname(dirname(realpathSync(java)));
    }
    if (!env.ANDROID_HOME) {
      const sdk = [env.ANDROID_SDK_ROOT, join(homedir(), 'Android', 'Sdk'), join(homedir(), 'Android', 'sdk')].find(candidate => candidate && existsSync(candidate));
      if (sdk) env.ANDROID_HOME = sdk;
    }
  }
  if (selected.includes('live') && !env.COMMUNITY_WEB_URL) env.COMMUNITY_WEB_URL = 'http://127.0.0.1:3000';
  return env;
}

export async function getBlocker(name, definition, context) {
  if (name === 'device') return 'Android device verification requires Windows and scripts/verify-android-device.ps1.';
  const required = definition.commands.map(command => command.file);
  if (['backend', 'contracts'].includes(name)) required.push('docker');
  if (name === 'backend' || definition.kind === 'junit') required.push('python3');
  for (const file of new Set(required)) {
    if (!findExecutable(file, context)) return `Required executable ${file} is missing or not executable on PATH.${file === 'python3' ? ' Python 3 standard-library parsers are required for migration/JVM reports on Linux.' : ''}`;
  }
  if (name === 'backend') {
    const problem = checkMigrationHeads(context);
    if (problem) return problem;
  }
  if (name === 'android') {
    if (!context.env.JAVA_HOME || !findExecutable(join(context.env.JAVA_HOME, 'bin', 'java'), context)) return 'JAVA_HOME does not identify an installed Java runtime, and java was not found on PATH.';
    if (!existsSync(join(context.root, 'android', 'gradlew'))) return 'android/gradlew is missing.';
  }
  if (['unit', 'live'].includes(name) && (!context.env.COMMUNITY_CHROMIUM_PATH || !findExecutable(context.env.COMMUNITY_CHROMIUM_PATH, context))) {
    return 'No installed Chromium executable was found. Set COMMUNITY_CHROMIUM_PATH or provision the matching Playwright browser separately; verification never installs browsers.';
  }
  if (name === 'live') {
    try {
      const url = new URL(context.env.COMMUNITY_WEB_URL);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return 'Live verification requires a local HTTP web preview.';
      const response = await fetch(`${url.href.replace(/\/$/, '')}/login`, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
      await response.body?.cancel();
      if (!response.ok && ![301, 302, 303, 307, 308].includes(response.status)) return `The local web preview returned HTTP ${response.status}.`;
    } catch (error) {
      return `The local web preview did not answer: ${error.message}. Start it and the local services first.`;
    }
  }
  return null;
}

export async function runSuite(name, definition, { root, output, env, report = console.log }) {
  const started = Date.now();
  const log = join(output, `${name}.log`);
  const entry = { suite: name, title: definition.title, result: 'passed', tally: null, counts: {}, summary: '', seconds: 0, log, note: null };
  const diagnostics = [];
  writeFileSync(log, '');
  try {
    entry.note = await getBlocker(name, definition, { root, env });
    if (entry.note) {
      entry.result = 'not run';
      appendFileSync(log, `Not run: ${entry.note}\n`);
    } else {
      if (!definition.commands.length) throw new Error('No verification commands are defined.');
      for (const command of definition.commands) {
        const since = Date.now();
        try {
          const result = runCommand(command, { root, env, log, report: message => report(`[${name}] ${message}`) });
          if (result.code !== 0 || result.signal || result.error) entry.result = 'failed';
          const counts = readCounts(command.kind, result.text, { root, env, since });
          for (const [key, value] of Object.entries(counts)) entry.counts[key] = (entry.counts[key] ?? 0) + value;
          if (command.kind !== 'none' && !getTally(command.kind, counts)) throw new Error(`No current ${command.kind} test results were reported.`);
          if (counts.uncaughtClasses) throw new Error(`uncaught exceptions in ${counts.uncaughtClasses} JVM test classes; inspect XML system-err`);
        } catch (error) {
          entry.result = 'failed';
          diagnostics.push(error.message);
          appendFileSync(log, `Verification failed: ${error.message}\n`);
        }
      }
      entry.tally = getTally(definition.kind, entry.counts);
      if (entry.tally?.failed || entry.tally?.cancelled) entry.result = 'failed';
      if (entry.result === 'passed' && entry.tally && entry.tally.passed === 0) {
        entry.result = 'not run';
        entry.note = 'All reported tests were skipped; no tests passed.';
        appendFileSync(log, `Not run: ${entry.note}\n`);
      }
      if (name === 'records' && entry.result === 'failed') {
        const lost = /^Records check: (\d+ records? lost or reverted)\./m.exec(readFileSync(log, 'utf8'));
        if (lost) diagnostics.push(lost[1]);
      }
    }
  } catch (error) {
    entry.result = 'failed';
    diagnostics.push(error.message);
    appendFileSync(log, `Verification failed: ${error.message}\n`);
  }
  entry.summary = [formatTally(entry.tally), ...diagnostics].filter(Boolean).join('; ');
  entry.seconds = Math.round((Date.now() - started) / 1000);
  report(`[${name}] ${entry.result}${entry.note ? `: ${entry.note}` : entry.summary ? ` (${entry.summary})` : ''} in ${entry.seconds} s`);
  return entry;
}

export function getTreeState(root, env = process.env) {
  const git = args => {
    const result = spawnSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`Source-state evidence unavailable: ${result.error?.message || result.stderr.trim()}`);
    return result.stdout;
  };
  const commit = git(['rev-parse', '--short', 'HEAD']).trim();
  const listed = git(['status', '--porcelain=v1', '-z', '-uall']).split('\0');
  const files = {};
  for (let index = 0; index < listed.length; index += 1) {
    const entry = listed[index];
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    let stamp = 'none';
    try {
      const metadata = statSync(join(root, path));
      stamp = `${metadata.mtimeMs}|${metadata.ctimeMs}|${metadata.size}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    files[path] = `${status}|${stamp}`;
    if (/[RC]/.test(status)) index += 1;
  }
  return { commit, files, uncommitted: Object.keys(files).length };
}

export function changedPaths(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
}

export async function runVerification({ root = projectRoot, selected = defaultSuites, output, env: inherited = process.env, definitions = suiteDefinitions(), report = console.log } = {}) {
  const started = new Date();
  output = resolve(output || join(root, '.local', 'verify', `${started.toISOString().replace(/[-:.TZ]/g, '')}-${process.pid}`));
  mkdirSync(output, { recursive: true });
  const env = prepareEnvironment(selected, root, inherited);
  const evidenceErrors = [];
  const captureState = () => {
    try {
      return getTreeState(root, env);
    } catch (error) {
      evidenceErrors.push(error.message);
      return { commit: null, files: {}, uncommitted: null };
    }
  };
  const before = captureState();
  report(`Checks on ${before.commit ?? 'unknown commit'} with ${before.uncommitted ?? 'unknown'} uncommitted changes; logs in ${output}`);
  const suites = [];
  for (const name of selected) suites.push(await runSuite(name, definitions[name], { root, output, env, report }));
  const after = captureState();
  const moved = changedPaths(before.files, after.files);
  const record = {
    started: started.toISOString(), finished: new Date().toISOString(), commit: before.commit, endCommit: after.commit,
    uncommitted: before.uncommitted, changedDuringRun: moved, sourceBefore: before.files, sourceAfter: after.files, evidenceErrors, suites,
    exitCode: suites.length > 0 && suites.every(entry => entry.result === 'passed') && evidenceErrors.length === 0 ? 0 : 1,
  };
  const lines = ['# Verification summary', '', `Started ${record.started}, finished ${record.finished}, on commit \`${record.commit ?? 'unknown'}\` with ${record.uncommitted ?? 'unknown'} uncommitted changes.`, ''];
  if (after.commit !== before.commit) lines.push(`A commit was made during the run: it ended on \`${after.commit}\`.`, '');
  if (moved.length) lines.push(`${moved.length} files changed during the run, so the results may mix the states before and after: ${moved.slice(0, 10).map(path => `\`${path}\``).join(', ')}${moved.length > 10 ? ', ...' : ''}.`, '');
  if (evidenceErrors.length) lines.push(...evidenceErrors, '');
  lines.push('| Suite | Result | Counts | Seconds | Log |', '| --- | --- | --- | --- | --- |');
  const cell = text => String(text).replace(/[|\r\n]/g, ' ');
  for (const entry of suites) lines.push(`| ${cell(entry.title)} | ${cell(entry.note ? `${entry.result}: ${entry.note}` : entry.result)} | ${cell(entry.summary)} | ${entry.seconds} | ${basename(entry.log)} |`);
  writeFileSync(join(output, 'summary.md'), `${lines.join('\n')}\n`);
  writeFileSync(join(output, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`);
  report(lines.slice(2).join('\n'));
  report(`Summary: ${join(output, 'summary.md')}`);
  return record;
}

export async function main(argumentsList = process.argv.slice(2)) {
  const options = parseArgs(argumentsList);
  if (options.help) {
    console.log(`Usage: npm run verify -- -Suite ${suiteOrder.join(',')} -Output <folder>\nAlso accepts --suite and --output. Defaults: ${defaultSuites.join(',')}.\nLinux JVM XML and migration checks require Python 3 (standard library only). Android device verification requires Windows.`);
    return 0;
  }
  if (process.platform === 'win32') {
    const command = windowsCommand(options, projectRoot);
    const result = spawnSync(command.file, command.args, { stdio: 'inherit' });
    if (result.error) console.error(`Windows verification could not start: ${result.error.message}`);
    return result.status ?? 1;
  }
  return (await runVerification(options)).exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}