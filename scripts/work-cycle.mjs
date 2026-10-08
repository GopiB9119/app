import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { changedPaths, getTreeState } from './verify.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const offlineSuites = Object.freeze(['runner', 'tokens', 'golden', 'typecheck', 'client', 'unit']);

export function parseArgs(argumentsList) {
  const options = { cycles: 1, minutes: 15, selected: ['tokens', 'golden', 'typecheck', 'client'], help: false };
  const seen = new Set();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--status' || argument === '--stop') {
      if (options.action) throw new Error('Choose only one of --status or --stop.');
      options.action = argument.slice(2);
      continue;
    }
    if (argument === '--watch') {
      if (seen.has('watch')) throw new Error('Duplicate option: --watch');
      seen.add('watch');
      options.watch = true;
      continue;
    }
    const match = /^--(cycles|minutes|suite)(?:=(.*))?$/.exec(argument);
    if (!match) throw new Error(`Unknown option: ${argument}`);
    const name = match[1];
    if (seen.has(name)) throw new Error(`Duplicate option: --${name}`);
    seen.add(name);
    const value = match[2] ?? argumentsList[++index];
    if (!value || value.startsWith('-')) throw new Error(`Missing value for --${name}`);
    if (name === 'suite') {
      const selected = value.split(',').map(entry => entry.trim());
      if (selected.some(entry => !offlineSuites.includes(entry))) {
        throw new Error(`Only offline suites are allowed: ${offlineSuites.join(',')}`);
      }
      options.selected = offlineSuites.filter(entry => selected.includes(entry));
    } else {
      const number = Number(value);
      const maximum = name === 'cycles' ? 10 : 120;
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > maximum) {
        throw new Error(`--${name} must be an integer from 1 to ${maximum}.`);
      }
      options[name] = number;
    }
  }
  if (options.action && seen.size) throw new Error('--status and --stop cannot be combined with execution options.');
  if (options.watch && !seen.has('cycles')) options.cycles = 10;
  return options;
}

export function workCycleStatus(root = projectRoot) {
  const directory = join(root, '.local', 'work-cycle');
  const status = { locked: existsSync(join(directory, 'LOCK')), stopRequested: existsSync(join(directory, 'STOP')), latest: null };
  if (!existsSync(directory)) return status;
  const folders = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name)).map(entry => entry.name).sort().reverse();
  if (!folders.length) return status;
  const file = join(directory, folders[0], 'summary.json');
  try {
    const record = JSON.parse(readFileSync(file, 'utf8'));
    status.latest = { summary: file, result: record.result, started: record.started, finished: record.finished,
      exitCode: record.exitCode, reason: record.reason };
  } catch {
    status.latest = { summary: file, result: 'unavailable', reason: 'The latest summary is missing or unreadable.' };
  }
  return status;
}

export function requestWorkCycleStop(root = projectRoot) {
  const directory = join(root, '.local', 'work-cycle');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(directory, 'STOP'), `${JSON.stringify({ requested: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return workCycleStatus(root);
}

export function evaluateVerification(record, exitCode, selected) {
  const outcome = (result, reason) => ({ result, reason });
  if (exitCode !== 0) return outcome('failed', `Verifier exited with ${exitCode ?? 'no exit code'}.`);
  if (!record || typeof record !== 'object' || !Array.isArray(record.suites)
    || !Array.isArray(record.evidenceErrors) || !Array.isArray(record.changedDuringRun)
    || typeof record.commit !== 'string' || !record.commit || typeof record.endCommit !== 'string') {
    return outcome('incomplete', 'Verification summary or source-state evidence is missing or invalid.');
  }
  if (record.exitCode !== 0 || record.evidenceErrors.length) {
    return outcome('failed', 'Verification reported a failure or unavailable source evidence.');
  }
  if (record.suites.length !== selected.length || record.suites.some((entry, index) => entry?.suite !== selected[index])) {
    return outcome('incomplete', 'The summary does not cover exactly the requested suites.');
  }
  for (const entry of record.suites) {
    if (entry.result !== 'passed') return outcome('failed', `${entry.suite}: ${entry.result ?? 'missing result'}.`);
    if (entry.suite === 'typecheck') continue;
    const tally = entry.tally;
    if (!tally || !['total', 'passed', 'failed', 'skipped', 'cancelled'].every(name => Number.isSafeInteger(tally[name]) && tally[name] >= 0)
      || tally.total === 0 || tally.total !== tally.passed + tally.failed + tally.skipped + tally.cancelled) {
      return outcome('incomplete', `${entry.suite}: current, consistent test counts are required.`);
    }
    if (tally.failed || tally.skipped || tally.cancelled) {
      return outcome('incomplete', `${entry.suite}: failures, skipped or cancelled tests cannot qualify a cycle.`);
    }
  }
  if (record.commit !== record.endCommit || record.changedDuringRun.length) {
    return outcome('changed', 'Source changed during verification; the results do not qualify a stable source state.');
  }
  return outcome('passed', 'Every requested offline suite passed without skipped tests or reported source changes.');
}

export async function superviseCommand({ file, args, root, env, log, signal, timeoutMs, forceAfterMs = 1000 }) {
  if (process.platform === 'win32') throw new Error('Process-group supervision currently requires Linux or macOS.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive, finite command deadline is required.');
  if (signal?.aborted) return { code: null, signal: null, stopped: 'cancelled', error: null };
  const descriptor = openSync(log, 'wx', 0o600);
  let child;
  try {
    child = spawn(file, args, { cwd: root, env, detached: true, stdio: ['ignore', descriptor, descriptor] });
  } finally {
    closeSync(descriptor);
  }
  return new Promise(resolveResult => {
    let closed = false;
    let settled = false;
    let escalated = false;
    let escalation;
    const result = { code: null, signal: null, stopped: null, error: null };
    const groupSignal = name => {
      if (!child.pid) return false;
      try {
        process.kill(-child.pid, name);
        return true;
      } catch (error) {
        if (error.code !== 'ESRCH') result.error ??= error.message;
        return false;
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      signal?.removeEventListener('abort', onAbort);
      resolveResult(result);
    };
    const stop = reason => {
      if (result.stopped || settled) return;
      result.stopped = reason;
      groupSignal('SIGTERM');
      escalation = setTimeout(() => {
        escalated = true;
        groupSignal('SIGKILL');
        if (closed) finish();
      }, forceAfterMs);
    };
    const onAbort = () => stop(typeof signal.reason === 'string' ? signal.reason : 'cancelled');
    const deadline = setTimeout(() => stop('deadline'), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', error => { result.error = error.message; });
    child.once('close', (code, exitSignal) => {
      closed = true;
      result.code = code;
      result.signal = exitSignal;
      if (!escalated && groupSignal(0)) {
        stop('unfinished_children');
      } else {
        finish();
      }
    });
    if (signal?.aborted) onAbort();
  });
}

export async function runWorkCycle(options, { root = projectRoot, env = process.env, execute = superviseCommand, report = console.log, signal, readState = getTreeState, pause = sleep } = {}) {
  const checked = parseArgs(['--cycles', String(options.cycles), '--minutes', String(options.minutes), '--suite', options.selected.join(','), ...(options.watch ? ['--watch'] : [])]);
  if (process.platform === 'win32') throw new Error('Work cycles currently require Linux or macOS; use npm run verify on Windows.');
  const stateDirectory = join(root, '.local', 'work-cycle');
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const lockPath = join(stateDirectory, 'LOCK');
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another cycle or an unreviewed stale lock exists: ${lockPath}. Check its recorded PID; locks are never removed automatically.`);
    throw error;
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(typeof signal.reason === 'string' ? signal.reason : 'cancelled');
  let watcher;
  let deadlineTimer;
  let output;
  let record;
  const save = () => {
    const temporary = join(output, 'summary.json.part');
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, join(output, 'summary.json'));
  };
  try {
    const started = new Date().toISOString();
    const deadline = performance.now() + checked.minutes * 60_000;
    output = mkdtempSync(join(stateDirectory, `${started.replace(/[:.]/g, '-')}-`));
    writeFileSync(lock, `${JSON.stringify({ pid: process.pid, started, output })}\n`);
    record = { started, finished: null, pid: process.pid, limits: checked, result: 'running', reason: null, cycles: [], output, exitCode: null };
    save();
    report(`Work cycle: ${output}`);
    const stopPath = join(stateDirectory, 'STOP');
    const checkStop = () => { if (existsSync(stopPath)) controller.abort('stop_file'); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    checkStop();
    watcher = setInterval(checkStop, 200);
    deadlineTimer = setTimeout(() => controller.abort('deadline'), checked.minutes * 60_000);
    let previous;
    for (let cycle = 1; cycle <= checked.cycles; cycle += 1) {
      if (performance.now() >= deadline) controller.abort('deadline');
      checkStop();
      if (controller.signal.aborted) break;
      if (checked.watch && previous) {
        if (!previous.sourceAfter || typeof previous.sourceAfter !== 'object' || Array.isArray(previous.sourceAfter)
          || Object.values(previous.sourceAfter).some(value => typeof value !== 'string')) {
          throw new Error('Source-state evidence is required before watching for changes.');
        }
        record.result = 'waiting_for_change';
        record.reason = 'Last cycle passed. Waiting for a source edit or a new commit; no checks are running.';
        save();
        report(record.reason);
        while (!controller.signal.aborted) {
          const current = readState(root, env);
          if (!current || typeof current.commit !== 'string' || !current.commit
            || !current.files || typeof current.files !== 'object' || Array.isArray(current.files)) {
            throw new Error('Current source-state evidence is missing or invalid.');
          }
          if (current.commit !== previous.endCommit || changedPaths(previous.sourceAfter, current.files).length) break;
          try {
            await pause(5000, undefined, { signal: controller.signal });
          } catch (error) {
            if (!controller.signal.aborted || error.name !== 'AbortError') throw error;
          }
          checkStop();
        }
      }
      const remaining = deadline - performance.now();
      if (remaining <= 0) controller.abort('deadline');
      checkStop();
      if (controller.signal.aborted) break;
      record.result = 'running';
      record.reason = `Verifying cycle ${cycle} of at most ${checked.cycles}.`;
      save();
      const cycleOutput = join(output, `cycle-${cycle}`);
      mkdirSync(cycleOutput, { mode: 0o700 });
      report(`Cycle ${cycle}/${checked.cycles}: ${checked.selected.join(',')}`);
      const child = await execute({
        file: process.execPath,
        args: [join(root, 'scripts', 'verify.mjs'), '--suite', checked.selected.join(','), '--output', cycleOutput],
        root, env: { ...env, CI: '1', FORCE_COLOR: '0' }, log: join(cycleOutput, 'verifier.log'),
        signal: controller.signal, timeoutMs: remaining,
      });
      checkStop();
      if (performance.now() >= deadline) controller.abort('deadline');
      let verification;
      let readError;
      try {
        verification = JSON.parse(readFileSync(join(cycleOutput, 'summary.json'), 'utf8'));
      } catch (error) {
        readError = error.message;
      }
      let outcome;
      const stopped = controller.signal.aborted ? String(controller.signal.reason) : child.stopped;
      if (stopped) {
        outcome = { result: stopped === 'deadline' ? 'timed_out' : 'stopped', reason: stopped };
      } else if (child.error || child.signal) {
        outcome = { result: 'failed', reason: child.error || `Verifier ended with ${child.signal}.` };
      } else {
        outcome = evaluateVerification(verification, child.code, checked.selected);
        if (readError) outcome.reason += ` Summary unavailable: ${readError}`;
      }
      record.cycles.push({ cycle, ...outcome, exitCode: child.code, summary: join(cycleOutput, 'summary.json'), log: join(cycleOutput, 'verifier.log') });
      record.result = outcome.result === 'passed' ? 'running' : outcome.result;
      record.reason = outcome.reason;
      save();
      report(`Cycle ${cycle}: ${outcome.result}. ${outcome.reason}`);
      if (outcome.result !== 'passed') break;
      previous = verification;
    }
    checkStop();
    if (performance.now() >= deadline) controller.abort('deadline');
    if (controller.signal.aborted) {
      record.result = controller.signal.reason === 'deadline' ? 'timed_out' : 'stopped';
      record.reason = String(controller.signal.reason);
    } else if (record.cycles.length === checked.cycles && record.cycles.every(cycle => cycle.result === 'passed')) {
      record.result = 'passed';
    } else if (record.result === 'running') {
      record.result = 'incomplete';
      record.reason = 'Not all requested cycles finished.';
    }
  } catch (error) {
    if (!record) throw error;
    record.result = 'failed';
    record.reason = error.message;
  } finally {
    clearInterval(watcher);
    clearTimeout(deadlineTimer);
    signal?.removeEventListener('abort', onAbort);
    closeSync(lock);
    unlinkSync(lockPath);
  }
  record.finished = new Date().toISOString();
  record.exitCode = record.result === 'passed' ? 0 : 1;
  save();
  report(`Result: ${record.result}. Evidence: ${join(output, 'summary.json')}`);
  return record;
}

export async function main(argumentsList = process.argv.slice(2)) {
  const options = parseArgs(argumentsList);
  if (options.help) {
    console.log(`Usage: node scripts/work-cycle.mjs [--watch] [--cycles 1..10] [--minutes 1..120] [--suite ${offlineSuites.join(',')}]
  Control: --status shows the latest report and control files; --stop requests a stop without starting checks.
Defaults: one cycle, 15 minutes total, tokens,golden,typecheck,client.
--watch: run once, then wait for source changes before further cycles (default cap 10); the total deadline still applies.
Stops on the first failure, incomplete evidence, source change or deadline.
Ctrl+C or .local/work-cycle/STOP stops work; STOP is never cleared automatically.
Logs: .local/work-cycle/. Linux/macOS only. No code editing, paid calls, live suites, deployment or automatic repair.`);
    return 0;
  }
  if (options.action) {
    console.log(JSON.stringify(options.action === 'stop' ? requestWorkCycleStop() : workCycleStatus(), null, 2));
    return 0;
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort('interrupted');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    return (await runWorkCycle(options, { signal: controller.signal })).exitCode;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Work cycle failed: ${error.message}`);
    process.exitCode = 1;
  });
}