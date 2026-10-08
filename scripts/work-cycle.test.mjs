import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluateVerification, offlineSuites, parseArgs, requestWorkCycleStop, runWorkCycle, superviseCommand, workCycleStatus } from './work-cycle.mjs';

function summary() {
  return {
    commit: 'synthetic', endCommit: 'synthetic', exitCode: 0, evidenceErrors: [], changedDuringRun: [], sourceAfter: {},
    suites: [{ suite: 'golden', result: 'passed', tally: { total: 2, passed: 2, failed: 0, skipped: 0, cancelled: 0 } }],
  };
}

test('defaults make one finite offline pass and explicit selections have verifier order', () => {
  assert.deepEqual(parseArgs([]), { cycles: 1, minutes: 15, selected: ['tokens', 'golden', 'typecheck', 'client'], help: false });
  assert.deepEqual(parseArgs(['--cycles=10', '--minutes', '120', '--suite', 'client,runner,client']).selected, ['runner', 'client']);
  assert.deepEqual(parseArgs(['--suite', offlineSuites.join(',')]).selected, offlineSuites);
  assert.equal(parseArgs(['--help']).help, true);
});

test('status and stop are explicit control commands and cannot launch suites', () => {
  assert.equal(parseArgs(['--status']).action, 'status');
  assert.equal(parseArgs(['--stop']).action, 'stop');
  for (const args of [['--status', '--stop'], ['--stop', '--stop'], ['--status', '--suite', 'golden'], ['--cycles', '2', '--stop']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('status is read-only and stop preserves existing control files', context => {
  const root = fixture(context);
  assert.deepEqual(workCycleStatus(root), { locked: false, stopRequested: false, latest: null });
  assert.equal(existsSync(join(root, '.local')), false);
  assert.equal(requestWorkCycleStop(root).stopRequested, true);
  const directory = join(root, '.local', 'work-cycle');
  writeFileSync(join(directory, 'STOP'), 'Owner requested a pause.\n');
  writeFileSync(join(directory, 'LOCK'), 'Existing owner lock.\n');
  assert.equal(requestWorkCycleStop(root).locked, true);
  assert.equal(readFileSync(join(directory, 'STOP'), 'utf8'), 'Owner requested a pause.\n');
  assert.equal(readFileSync(join(directory, 'LOCK'), 'utf8'), 'Existing owner lock.\n');
});

test('status names the latest report and reports missing evidence honestly', context => {
  const root = fixture(context);
  const directory = join(root, '.local', 'work-cycle', '2026-10-07T10-00-00-000Z-fixture');
  mkdirSync(directory, { recursive: true });
  assert.equal(workCycleStatus(root).latest.result, 'unavailable');
  writeFileSync(join(directory, 'summary.json'), JSON.stringify({ result: 'failed', reason: 'synthetic failure', exitCode: 1 }));
  assert.equal(workCycleStatus(root).latest.result, 'failed');
  assert.equal(workCycleStatus(root).latest.reason, 'synthetic failure');
  assert.equal(workCycleStatus(root).latest.summary, join(directory, 'summary.json'));
});

test('cycles and deadline cannot be zero, infinite, fractional, unsafe or unbounded', () => {
  for (const name of ['cycles', 'minutes']) {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '1.5', '1e2', '9007199254740993', '121', '']) {
      assert.throws(() => parseArgs([`--${name}=${value}`]), undefined, `${name}=${value}`);
    }
  }
  assert.throws(() => parseArgs(['--cycles', '11']));
  assert.equal(parseArgs(['--cycles', '1', '--minutes', '1']).minutes, 1);
});

test('CLI refuses ambiguous options, arbitrary commands and non-offline suites', () => {
  for (const args of [
    ['--cycles'], ['--suite'], ['--minutes', '--suite', 'golden'], ['--cycles', '2', '--cycles', '3'],
    ['--live'], ['--command', 'anything'], ['--suite', 'golden,'], ['--suite', ','], ['--suite', 'golden;echo unsafe'],
    ...['live', 'backend', 'android', 'device', 'contracts', 'records', 'structure'].map(name => ['--suite', name]),
  ]) assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
});

test('success requires the exact requested suites and real test counts', () => {
  const record = summary();
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'passed');
  assert.equal(evaluateVerification(record, 0, ['golden', 'client']).result, 'incomplete');
  assert.equal(evaluateVerification(record, 0, []).result, 'incomplete');
  record.suites[0].tally = null;
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'incomplete');
  record.suites = [{ suite: 'typecheck', result: 'passed', tally: null }];
  assert.equal(evaluateVerification(record, 0, ['typecheck']).result, 'passed');
});

test('a zero exit does not hide missing evidence, blocked suites or malformed counts', () => {
  assert.equal(evaluateVerification(null, 0, ['golden']).result, 'incomplete');
  assert.equal(evaluateVerification({}, 0, ['golden']).result, 'incomplete');
  for (const key of ['evidenceErrors', 'changedDuringRun', 'commit', 'endCommit']) {
    const record = summary();
    delete record[key];
    assert.equal(evaluateVerification(record, 0, ['golden']).result, 'incomplete', key);
  }
  for (const tally of [
    { total: 0, passed: 0, failed: 0, skipped: 0, cancelled: 0 },
    { total: 2, passed: 1, failed: 0, skipped: 0, cancelled: 0 },
    { total: 1, passed: -1, failed: 0, skipped: 2, cancelled: 0 },
    { total: '2', passed: 2, failed: 0, skipped: 0, cancelled: 0 },
  ]) {
    const record = summary();
    record.suites[0].tally = tally;
    assert.equal(evaluateVerification(record, 0, ['golden']).result, 'incomplete');
  }
  const blocked = summary();
  blocked.suites[0].result = 'not run';
  assert.equal(evaluateVerification(blocked, 0, ['golden']).result, 'failed');
});

test('failures, skips and cancellation never become a clean cycle', () => {
  for (const name of ['failed', 'skipped', 'cancelled']) {
    const record = summary();
    record.suites[0].tally[name] = 1;
    record.suites[0].tally.passed = 1;
    assert.equal(evaluateVerification(record, 0, ['golden']).result, 'incomplete', name);
  }
  assert.equal(evaluateVerification(summary(), 9, ['golden']).result, 'failed');
  assert.equal(evaluateVerification(summary(), null, ['golden']).result, 'failed');
  const record = summary();
  record.exitCode = 1;
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'failed');
  record.exitCode = 0;
  record.evidenceErrors.push('git unavailable');
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'failed');
});

test('concurrent source edits and commits stop stable-source qualification', () => {
  const record = summary();
  record.changedDuringRun.push('a-file.mjs');
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'changed');
  record.changedDuringRun = [];
  record.endCommit = 'another-commit';
  assert.equal(evaluateVerification(record, 0, ['golden']).result, 'changed');
});

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'community-work-cycle-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeVerifier(transform = record => record) {
  return async command => {
    assert.equal(command.file, process.execPath);
    assert.equal(command.args[0], join(command.root, 'scripts', 'verify.mjs'));
    assert.equal(command.args[1], '--suite');
    assert.equal(command.args[3], '--output');
    assert.ok(command.timeoutMs > 0 && command.timeoutMs <= 60_000);
    writeFileSync(join(command.args[4], 'summary.json'), JSON.stringify(transform(summary())));
    writeFileSync(command.log, 'synthetic verifier evidence\n');
    return { code: 0, signal: null, error: null, stopped: null };
  };
}

test('finite cycles preserve separate logs, release their lock and use only the fixed verifier', async context => {
  const root = fixture(context);
  let launches = 0;
  const record = await runWorkCycle(parseArgs(['--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
    root, report() {}, execute: async command => {
      launches += 1;
      const pending = JSON.parse(readFileSync(join(dirname(command.args[4]), 'summary.json'), 'utf8'));
      assert.equal(pending.result, 'running');
      assert.equal(pending.finished, null);
      assert.equal(pending.exitCode, null);
      return await fakeVerifier()(command);
    },
  });
  assert.equal(launches, 2);
  assert.equal(record.result, 'passed');
  assert.equal(record.exitCode, 0);
  assert.equal(record.cycles.length, 2);
  assert.notEqual(record.cycles[0].log, record.cycles[1].log);
  assert.ok(record.finished);
  assert.equal(existsSync(join(root, '.local', 'work-cycle', 'LOCK')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(record.output, 'summary.json'), 'utf8')), record);
});

test('the first failed, changed or incomplete cycle stops instead of retrying to green', async context => {
  for (const mode of ['failed', 'changed', 'incomplete']) {
    const root = fixture(context);
    const record = await runWorkCycle(parseArgs(['--cycles', '3', '--minutes', '1', '--suite', 'golden']), {
      root, report() {}, execute: fakeVerifier(record => {
        if (mode === 'failed') record.exitCode = 1;
        if (mode === 'changed') record.changedDuringRun.push('concurrent-edit');
        if (mode === 'incomplete') record.suites = [];
        return record;
      }),
    });
    assert.equal(record.result, mode);
    assert.equal(record.exitCode, 1);
    assert.equal(record.cycles.length, 1);
  }
});

test('missing, malformed and nonzero child results retain failure evidence', async context => {
  for (const mode of ['missing', 'malformed', 'exit', 'throw']) {
    const root = fixture(context);
    const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
      root, report() {}, execute: async command => {
        if (mode === 'throw') throw new Error('synthetic launch failure');
        if (mode === 'malformed') writeFileSync(join(command.args[4], 'summary.json'), '{');
        return { code: mode === 'exit' ? 7 : 0 };
      },
    });
    assert.equal(record.exitCode, 1);
    assert.equal(record.result, ['exit', 'throw'].includes(mode) ? 'failed' : 'incomplete');
    assert.equal(existsSync(join(root, '.local', 'work-cycle', 'LOCK')), false);
    assert.ok(existsSync(join(record.output, 'summary.json')));
  }
});

test('an existing stop file and an already cancelled signal prevent any child launch', async context => {
  for (const mode of ['file', 'signal']) {
    const root = fixture(context);
    const stateDirectory = join(root, '.local', 'work-cycle');
    mkdirSync(stateDirectory, { recursive: true });
    const controller = new AbortController();
    if (mode === 'file') writeFileSync(join(stateDirectory, 'STOP'), '');
    else controller.abort();
    const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
      root, report() {}, signal: controller.signal, execute: () => assert.fail('must not launch'),
    });
    assert.equal(record.result, 'stopped');
    assert.equal(record.cycles.length, 0);
    if (mode === 'file') assert.ok(existsSync(join(stateDirectory, 'STOP')));
  }
});

test('the stop file interrupts an active cycle and leaves an explicit stopped result', async context => {
  const root = fixture(context);
  const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
    root, report() {}, execute: async command => {
      writeFileSync(join(root, '.local', 'work-cycle', 'STOP'), '');
      return await new Promise(resolveResult => command.signal.addEventListener('abort', () => {
        resolveResult({ code: null, stopped: command.signal.reason });
      }, { once: true }));
    },
  });
  assert.equal(record.result, 'stopped');
  assert.equal(record.reason, 'stop_file');
});

for (const reason of ['stop_file', 'interrupted']) {
  test(`a completion-boundary ${reason} cannot leave a successful cycle`, async context => {
    const root = fixture(context);
    const controller = new AbortController();
    const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
      root, report() {}, signal: controller.signal, execute: async command => {
        const result = await fakeVerifier()(command);
        if (reason === 'stop_file') writeFileSync(join(root, '.local', 'work-cycle', 'STOP'), '');
        else controller.abort(reason);
        return result;
      },
    });
    assert.equal(record.result, 'stopped');
    assert.equal(record.reason, reason);
    assert.equal(record.exitCode, 1);
    assert.equal(record.cycles[0].result, 'stopped');
    assert.equal(record.cycles[0].reason, reason);
    assert.equal(existsSync(join(root, '.local', 'work-cycle', 'LOCK')), false);
  });
}

for (const elapsed of [59_999, 60_000, 60_001]) {
  test(`completion deadline is enforced at ${elapsed} ms before timers can run`, async context => {
    const root = fixture(context);
    let clock = 0;
    context.mock.method(performance, 'now', () => clock);
    const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
      root, report() {}, execute: async command => {
        const result = await fakeVerifier()(command);
        clock = elapsed;
        return result;
      },
    });
    context.mock.restoreAll();
    const expired = elapsed >= 60_000;
    assert.equal(record.result, expired ? 'timed_out' : 'passed');
    assert.equal(record.cycles[0].result, record.result);
    assert.equal(record.exitCode, expired ? 1 : 0);
    if (expired) {
      assert.equal(record.reason, 'deadline');
      assert.equal(record.cycles[0].reason, 'deadline');
    }
  });
}

for (const reason of ['stop_file', 'deadline']) {
  test(`${reason} during final reporting cannot qualify a successful run`, async context => {
    const root = fixture(context);
    let clock = 0;
    context.mock.method(performance, 'now', () => clock);
    const record = await runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
      root, execute: fakeVerifier(), report(message) {
        if (!message.startsWith('Cycle 1: passed.')) return;
        if (reason === 'stop_file') requestWorkCycleStop(root);
        else clock = 60_001;
      },
    });
    context.mock.restoreAll();
    assert.equal(record.result, reason === 'deadline' ? 'timed_out' : 'stopped');
    assert.equal(record.reason, reason);
    assert.equal(record.exitCode, 1);
    assert.equal(record.cycles[0].result, 'passed');
    assert.deepEqual(JSON.parse(readFileSync(join(record.output, 'summary.json'), 'utf8')), record);
    assert.equal(existsSync(join(root, '.local', 'work-cycle', 'LOCK')), false);
    if (reason === 'stop_file') assert.equal(workCycleStatus(root).stopRequested, true);
  });
}

test('an exclusive lock refuses a second owner and is not silently stolen', async context => {
  const root = fixture(context);
  const stateDirectory = join(root, '.local', 'work-cycle');
  mkdirSync(stateDirectory, { recursive: true });
  const lockPath = join(stateDirectory, 'LOCK');
  writeFileSync(lockPath, '{"pid":123,"owner":"synthetic"}\n');
  await assert.rejects(runWorkCycle(parseArgs(['--minutes', '1', '--suite', 'golden']), {
    root, report() {}, execute: () => assert.fail('must not launch'),
  }), /stale lock/);
  assert.match(readFileSync(lockPath, 'utf8'), /synthetic/);
});

test('real subprocess output and exit codes are retained without a shell', async context => {
  const root = fixture(context);
  const log = join(root, 'child.log');
  const result = await superviseCommand({
    file: process.execPath, args: ['-e', 'console.log(process.argv[1]);process.exit(7)', 'literal; not a shell'],
    root, env: process.env, log, timeoutMs: 5000,
  });
  assert.equal(result.code, 7);
  assert.equal(result.stopped, null);
  assert.equal(result.error, null);
  assert.equal(readFileSync(log, 'utf8'), 'literal; not a shell\n');
});

test('a missing subprocess is a launch error, not a clean result', async context => {
  const root = fixture(context);
  const result = await superviseCommand({ file: join(root, 'missing'), args: [], root, env: process.env, log: join(root, 'missing.log'), timeoutMs: 5000 });
  assert.match(result.error, /ENOENT/);
  assert.notEqual(result.code, 0);
});

test('the deadline kills a real child that ignores graceful termination', async context => {
  const root = fixture(context);
  const result = await superviseCommand({
    file: process.execPath,
    args: ['-e', 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'],
    root, env: process.env, log: join(root, 'deadline.log'), timeoutMs: 500, forceAfterMs: 50,
  });
  assert.match(readFileSync(join(root, 'deadline.log'), 'utf8'), /ready/);
  assert.equal(result.stopped, 'deadline');
  assert.equal(result.signal, 'SIGKILL');
});

test('cancellation terminates a running subprocess', async context => {
  const root = fixture(context);
  const controller = new AbortController();
  const pending = superviseCommand({
    file: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'],
    root, env: process.env, log: join(root, 'cancel.log'), signal: controller.signal, timeoutMs: 5000, forceAfterMs: 50,
  });
  controller.abort('user_stop');
  const result = await pending;
  assert.equal(result.stopped, 'user_stop');
  assert.notEqual(result.code, 0);
});

test('deadline completion also reaps the parent when its descendants need forced termination', { timeout: 5000 }, async context => {
  const root = fixture(context);
  const descendant = 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)';
  const parent = `process.on("SIGTERM",()=>{});const {spawn}=require("node:child_process");spawn(process.execPath,["-e",${JSON.stringify(descendant)}],{stdio:"ignore"});setInterval(()=>{},1000)`;
  const result = await superviseCommand({
    file: process.execPath,
    args: ['-e', parent],
    root, env: process.env, log: join(root, 'group-deadline.log'), timeoutMs: 500, forceAfterMs: 50,
  });
  assert.equal(result.stopped, 'deadline', readFileSync(join(root, 'group-deadline.log'), 'utf8'));
  assert.equal(result.signal, 'SIGKILL');
});

test('a child cannot leave an ordinary background descendant running after success', async context => {
  const root = fixture(context);
  const result = await superviseCommand({
    file: process.execPath,
    args: ['-e', 'const {spawn}=require("node:child_process");const descendant=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});descendant.unref()'],
    root, env: process.env, log: join(root, 'descendant.log'), timeoutMs: 5000, forceAfterMs: 50,
  });
  assert.equal(result.code, 0);
  assert.equal(result.stopped, 'unfinished_children');
});

test('CLI help and invalid options do not invoke verification', () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'work-cycle.mjs');
  const help = spawnSync(process.execPath, [file, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No code editing, paid calls, live suites/);
  const invalid = spawnSync(process.execPath, [file, '--suite', 'live'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Only offline suites/);
});

test('watch mode remains finite and rejects ambiguous or mixed control flags', () => {
  assert.equal(parseArgs(['--watch']).watch, true);
  assert.equal(parseArgs(['--watch']).cycles, 10);
  assert.equal(parseArgs(['--watch', '--cycles', '2']).cycles, 2);
  assert.equal(parseArgs(['--cycles', '2', '--watch']).minutes, 15);
  assert.throws(() => parseArgs(['--watch', '--watch']), /Duplicate/);
  assert.throws(() => parseArgs(['--watch=true']), /Unknown/);
  assert.throws(() => parseArgs(['--watch', '--status']));
  assert.throws(() => parseArgs(['--stop', '--watch']));
});

test('watch mode waits for source changes instead of repeating checks on unchanged inputs', async context => {
  const root = fixture(context);
  let launches = 0;
  let waits = 0;
  const state = { commit: 'synthetic', files: {} };
  const record = await runWorkCycle(parseArgs(['--watch', '--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
    root, report() {}, readState: () => state,
    pause: async milliseconds => {
      assert.equal(milliseconds, 5000);
      waits += 1;
      assert.equal(launches, 1, 'no child is started while source is unchanged');
      const directory = JSON.parse(readFileSync(join(root, '.local/work-cycle/LOCK'), 'utf8')).output;
      const pending = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
      assert.equal(pending.result, 'waiting_for_change');
      assert.equal(pending.finished, null);
      state.files['changed.mjs'] = ' M|changed';
    },
    execute: async command => {
      launches += 1;
      return fakeVerifier(record => ({ ...record, sourceAfter: { ...state.files } }))(command);
    },
  });
  assert.equal(waits, 1);
  assert.equal(launches, 2);
  assert.equal(record.result, 'passed');
});

test('watch mode notices a new commit even if the worktree is clean', async context => {
  const root = fixture(context);
  let launches = 0;
  const record = await runWorkCycle(parseArgs(['--watch', '--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
    root, report() {}, readState: () => ({ commit: 'new-revision', files: {} }),
    pause: () => assert.fail('a changed commit is immediately eligible for verification'),
    execute: command => { launches += 1; return fakeVerifier()(command); },
  });
  assert.equal(record.result, 'passed');
  assert.equal(launches, 2);
});

test('watch cancellation and deadline while idle do not fabricate another passed cycle', async context => {
  for (const reason of ['user_stop', 'deadline']) {
    const root = fixture(context);
    const controller = new AbortController();
    let launches = 0;
    const record = await runWorkCycle(parseArgs(['--watch', '--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
      root, report() {}, signal: controller.signal, readState: () => ({ commit: 'synthetic', files: {} }),
      pause: async () => {
        controller.abort(reason);
        throw new DOMException('Aborted', 'AbortError');
      },
      execute: command => { launches += 1; return fakeVerifier()(command); },
    });
    assert.equal(record.result, reason === 'deadline' ? 'timed_out' : 'stopped');
    assert.equal(record.exitCode, 1);
    assert.equal(record.cycles.length, 1);
    assert.equal(launches, 1);
    assert.equal(existsSync(join(root, '.local/work-cycle/LOCK')), false);
  }
});

test('watch mode reports missing or unavailable source evidence explicitly', async context => {
  for (const missing of [false, true]) {
    const root = fixture(context);
    const record = await runWorkCycle(parseArgs(['--watch', '--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
      root, report() {}, readState: () => { throw new Error('source evidence unavailable'); },
      execute: fakeVerifier(record => {
        if (missing) delete record.sourceAfter;
        return record;
      }),
    });
    assert.equal(record.result, 'failed');
    assert.equal(record.cycles.length, 1);
    assert.match(record.reason, /source/i);
  }
});

test('the persistent stop command also interrupts a watcher waiting between cycles', async context => {
  const root = fixture(context);
  const record = await runWorkCycle(parseArgs(['--watch', '--cycles', '2', '--minutes', '1', '--suite', 'golden']), {
    root, report() {}, readState: () => ({ commit: 'synthetic', files: {} }), execute: fakeVerifier(),
    pause: async (_milliseconds, _value, { signal }) => {
      requestWorkCycleStop(root);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true }));
    },
  });
  assert.equal(record.result, 'stopped');
  assert.equal(record.reason, 'stop_file');
  assert.equal(record.cycles.length, 1);
  assert.equal(existsSync(join(root, '.local/work-cycle/STOP')), true);
  assert.equal(existsSync(join(root, '.local/work-cycle/LOCK')), false);
});