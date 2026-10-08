import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseOptions, prepareRuntime } from './synthetic-api.mjs';

const safeEnvironment = { PATH: process.env.PATH, HOME: process.env.HOME };

function fixture(context, { withExports = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'community-synthetic-api-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, '.local', 'synthetic-api-fixture');
  const snapshotRoot = join(directory, 'backend');
  mkdirSync(join(snapshotRoot, 'app'), { recursive: true });
  mkdirSync(join(directory, 'venv', 'bin'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  const cli = join(root, 'scripts', 'synthetic-api.mjs');
  copyFileSync(fileURLToPath(new URL('./synthetic-api.mjs', import.meta.url)), cli);
  const marker = join(directory, 'child.json');
  const runtime = {
    ownerLabel: 'community.synthetic.owner=synthetic-api-fixture',
    interpreter: join(directory, 'venv', 'bin', 'python'), snapshotRoot,
    manifestPath: join(directory, 'source-manifest.json'), revision: '0057',
    databasePort: 32788, smtpPort: 32786, mailUrl: 'http://127.0.0.1:32787', apiUrl: 'http://127.0.0.1:8000',
    containers: [{ name: 'event-synthetic-db-fixture', id: 'a'.repeat(64) }, { name: 'event-synthetic-mail-fixture', id: 'b'.repeat(64) }],
    environment: {
      COMMUNITY_ENVIRONMENT: 'development', COMMUNITY_DATABASE_URL: 'postgresql+psycopg://127.0.0.1:32788/community_test',
      COMMUNITY_SECRET_FILE: join(directory, 'identity.key'), COMMUNITY_SMTP_HOST: '127.0.0.1', COMMUNITY_SMTP_PORT: '32786',
    },
  };
  const setStub = source => writeFileSync(runtime.interpreter, `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
  setStub(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({
    args: process.argv.slice(2), cwd: process.cwd(),
    mailUrl: process.env.COMMUNITY_MAIL_URL, webUrl: process.env.COMMUNITY_WEB_URL,
    modelUrl: process.env.COMMUNITY_AGENT_MODEL_URL, modelKey: process.env.COMMUNITY_AGENT_MODEL_KEY,
    webKey: process.env.COMMUNITY_AGENT_WEB_KEY, tracing: process.env.LANGSMITH_TRACING,
    inheritedProvider: process.env.OPENAI_API_KEY, pythonPath: process.env.PYTHONPATH, proxy: process.env.HTTPS_PROXY
  })); process.exit(Number(process.env.SYNTHETIC_STUB_EXIT ?? 0));`);
  const manifest = { source_root: join(root, 'uncaptured-live-source'), snapshot_root: snapshotRoot, files: [], verification: 'source before == source after == snapshot' };
  for (const path of ['app/main.py', 'app/worker.py', 'app/reminder_worker.py', ...(withExports ? ['app/export_worker.py'] : [])]) {
    const bytes = Buffer.from(`source_name = ${JSON.stringify(path)}\n`);
    writeFileSync(join(snapshotRoot, path), bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    manifest.files.push({ path, sha256_before: digest, sha256_after: digest, bytes: bytes.length });
  }
  const file = join(directory, 'runtime.json');
  const save = () => {
    writeFileSync(file, JSON.stringify(runtime));
    writeFileSync(join(directory, 'source-manifest.json'), JSON.stringify(manifest));
  };
  save();
  return { root, directory, runtime, manifest, file, marker, cli, save, setStub };
}

function prepare(fixtureData, inheritedEnv = safeEnvironment) {
  return prepareRuntime(fixtureData.file, { root: fixtureData.root, inheritedEnv });
}

function invoke(fixtureData, args, environment = {}) {
  return spawnSync(process.execPath, [fixtureData.cli, '--runtime', fixtureData.file, ...args], {
    cwd: fixtureData.root, env: { ...safeEnvironment, ...environment }, encoding: 'utf8', timeout: 10000,
  });
}

test('strict options require a runtime and a known component or read-only check', () => {
  assert.equal(parseOptions(['--runtime', 'runtime.json', '--component', 'api']).component, 'api');
  assert.equal(parseOptions(['--runtime', 'runtime.json', '--component', 'exports']).component, 'exports');
  assert.equal(parseOptions(['--runtime=runtime.json', '--check']).check, true);
  assert.equal(parseOptions(['--help']).help, true);
  for (const args of [[], ['--check'], ['--runtime', 'runtime.json'], ['--runtime', 'runtime.json', '--component', 'deletion'],
    ['--runtime', 'runtime.json', '--check', '--component', 'toString'], ['--runtime', 'runtime.json', '--check', '--unknown'],
    ['--runtime', 'runtime.json', '--check=false'], ['--runtime', 'runtime.json', '--check', 'positional'],
    ['--runtime', 'runtime.json', '--check', '--check'], ['--runtime', 'one', '--runtime', 'two', '--check']]) {
    assert.throws(() => parseOptions(args), undefined, JSON.stringify(args));
  }
});

test('valid runtime reuses captured paths and accepts an absent key without creating it', context => {
  const data = fixture(context);
  const prepared = prepare(data);
  assert.equal(prepared.interpreter, data.runtime.interpreter);
  assert.equal(prepared.snapshotRoot, data.runtime.snapshotRoot);
  assert.equal(prepared.summary.sourceFiles, 3);
  assert.equal(prepared.summary.recordedMigration, '0057');
  assert.deepEqual(prepared.summary.containers, data.runtime.containers);
  assert.equal(prepared.env.COMMUNITY_DATABASE_URL, data.runtime.environment.COMMUNITY_DATABASE_URL);
  assert.equal(prepared.env.COMMUNITY_SECRET_FILE, data.runtime.environment.COMMUNITY_SECRET_FILE);
  assert.equal(existsSync(data.runtime.environment.COMMUNITY_SECRET_FILE), false);
  assert.equal(existsSync(data.marker), false);
  assert.equal(existsSync(data.manifest.source_root), false);
});

test('inherited environment is scrubbed and runtime provider settings cannot enable providers', context => {
  const data = fixture(context);
  const hostile = {
    COMMUNITY_SECRET_KEY: 'fixture-canary', COMMUNITY_DATABASE_URL: 'not-a-local-database', COMMUNITY_UNREVIEWED: 'fixture-canary',
    OPENAI_API_KEY: 'fixture-canary', openai_base_url: 'fixture-canary', AZURE_OPENAI_ENDPOINT: 'fixture-canary',
    LANGCHAIN_API_KEY: 'fixture-canary', LANGSMITH_ENDPOINT: 'fixture-canary', TINYFISH_API_KEY: 'fixture-canary', OTEL_EXPORTER_OTLP_ENDPOINT: 'fixture-canary',
    HTTP_PROXY: 'fixture-canary', https_proxy: 'fixture-canary', ALL_PROXY: 'fixture-canary', NO_PROXY: '*', no_proxy: '*',
    PYTHONPATH: 'fixture-canary', PYTHONHOME: 'fixture-canary', PYTHONUSERBASE: 'fixture-canary', PYTHONSTARTUP: 'fixture-canary',
    PGHOSTADDR: 'fixture-canary', PGHOST: 'fixture-canary', PGDATABASE: 'fixture-canary', PGSERVICE: 'fixture-canary', PGPASSFILE: 'fixture-canary',
    VIRTUAL_ENV: 'fixture-canary', __PYVENV_LAUNCHER__: 'fixture-canary', LD_PRELOAD: 'fixture-canary', LD_LIBRARY_PATH: 'fixture-canary',
    NODE_OPTIONS: 'fixture-canary', NODE_PATH: 'fixture-canary', UVICORN_HOST: '0.0.0.0', WEB_CONCURRENCY: '50',
  };
  Object.assign(data.runtime.environment, hostile, {
    COMMUNITY_DATABASE_URL: 'postgresql+psycopg://127.0.0.1:32788/community_test',
    COMMUNITY_AGENT_MODEL_URL: 'https://provider.invalid', COMMUNITY_AGENT_MODEL_NAME: 'fixture-model',
    COMMUNITY_AGENT_MODEL_KEY: 'fixture-canary', COMMUNITY_AGENT_WEB_KEY: 'fixture-canary',
    LANGCHAIN_TRACING_V2: 'true', LANGSMITH_TRACING: 'true',
  });
  data.save();
  const prepared = prepare(data, { ...safeEnvironment, ...hostile, KEEP_LOCAL_SETTING: 'kept' });
  for (const name of Object.keys(hostile)) {
    if (name === 'COMMUNITY_DATABASE_URL' || name === 'NO_PROXY') continue;
    assert.equal(prepared.env[name], undefined, name);
  }
  for (const name of ['COMMUNITY_AGENT_MODEL_URL', 'COMMUNITY_AGENT_MODEL_NAME', 'COMMUNITY_AGENT_MODEL_KEY', 'COMMUNITY_AGENT_WEB_KEY']) {
    assert.equal(prepared.env[name], '', name);
  }
  assert.equal(prepared.env.LANGCHAIN_TRACING, 'false');
  assert.equal(prepared.env.LANGCHAIN_TRACING_V2, 'false');
  assert.equal(prepared.env.LANGSMITH_TRACING, 'false');
  assert.equal(prepared.env.OTEL_SDK_DISABLED, 'true');
  assert.equal(prepared.env.NO_PROXY, '127.0.0.1,localhost,::1');
  assert.equal(prepared.env.PATH, safeEnvironment.PATH);
  assert.equal(prepared.env.HOME, safeEnvironment.HOME);
  assert.equal(prepared.env.KEEP_LOCAL_SETTING, 'kept');
  assert.equal(prepared.env.COMMUNITY_MAIL_URL, data.runtime.mailUrl);
  assert.equal(prepared.env.COMMUNITY_WEB_URL, 'http://127.0.0.1:3000');
  assert.doesNotMatch(JSON.stringify(prepared.summary), /fixture-canary|postgresql|COMMUNITY_DATABASE_URL/);
});

test('manifest hashes must both match the captured file bytes', context => {
  for (const field of ['sha256_before', 'sha256_after', 'both', 'bytes', 'source']) {
    const data = fixture(context);
    if (field === 'both') Object.assign(data.manifest.files[0], { sha256_before: '0'.repeat(64), sha256_after: '0'.repeat(64) });
    else if (field === 'bytes') data.manifest.files[0].bytes += 1;
    else if (field === 'source') writeFileSync(join(data.runtime.snapshotRoot, 'app', 'main.py'), 'changed = True\n');
    else data.manifest.files[0][field] = '0'.repeat(64);
    data.save();
    assert.throws(() => prepare(data), /manifest/i, field);
  }
});

test('check reports safe metadata without starting a child or changing runtime metadata', context => {
  const data = fixture(context);
  const original = readFileSync(data.file);
  const result = invoke(data, ['--check'], { OPENAI_API_KEY: 'fixture-canary' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.providersDisabled, true);
  assert.equal(summary.tracingDisabled, true);
  assert.equal(summary.mailUrl, data.runtime.mailUrl);
  assert.equal(summary.sourceFiles, 3);
  assert.doesNotMatch(result.stdout, /fixture-canary|postgresql|COMMUNITY_DATABASE_URL/);
  assert.equal(existsSync(data.marker), false);
  assert.equal(existsSync(data.runtime.environment.COMMUNITY_SECRET_FILE), false);
  assert.deepEqual(readFileSync(data.file), original);
});

test('foreground launches use fixed argument arrays and propagate failed child exits', context => {
  for (const component of ['api', 'mail', 'reminders', 'exports']) {
    const data = fixture(context, { withExports: component === 'exports' });
    const result = invoke(data, ['--component', component], {
      SYNTHETIC_STUB_EXIT: '7', OPENAI_API_KEY: 'fixture-canary', PYTHONPATH: 'fixture-canary', HTTPS_PROXY: 'http://proxy.invalid',
    });
    assert.equal(result.status, 7, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const child = JSON.parse(readFileSync(data.marker, 'utf8'));
    assert.deepEqual(child.args, ['-E', '-s', '-B', '-m', ...(component === 'api'
      ? ['uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8000', '--workers', '1']
      : [component === 'mail' ? 'app.worker' : component === 'reminders' ? 'app.reminder_worker' : 'app.export_worker'])]);
    assert.equal(child.cwd, data.runtime.snapshotRoot);
    assert.equal(child.mailUrl, data.runtime.mailUrl);
    assert.equal(child.webUrl, 'http://127.0.0.1:3000');
    assert.equal(child.modelUrl, '');
    assert.equal(child.modelKey, '');
    assert.equal(child.webKey, '');
    assert.equal(child.tracing, 'false');
    assert.equal(child.inheritedProvider, undefined);
    assert.equal(child.pythonPath, undefined);
    assert.equal(child.proxy, undefined);
  }
});

test('exports require a captured worker and never launch uncaptured or changed code', context => {
  const missing = fixture(context);
  assert.equal(invoke(missing, ['--check']).status, 0);
  for (const args of [['--component', 'exports'], ['--component', 'exports', '--check']]) {
    const result = invoke(missing, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /export worker entry point/);
    assert.equal(existsSync(missing.marker), false);
  }
  const changed = fixture(context, { withExports: true });
  writeFileSync(join(changed.runtime.snapshotRoot, 'app/export_worker.py'), 'changed = True\n');
  const result = invoke(changed, ['--component', 'exports']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifest hashes/);
  assert.equal(existsSync(changed.marker), false);
});

test('only synthetic loopback PostgreSQL URLs with matching explicit ports are accepted', context => {
  for (const url of [
    'postgresql+psycopg://remote.invalid:32788/community_test',
    'postgresql+psycopg://127.0.0.1.remote.invalid:32788/community_test',
    'postgresql+psycopg://127.0.0.1:32788/community',
    'postgresql+psycopg://127.0.0.1:32788/production',
    'sqlite://127.0.0.1:32788/community_test',
    'postgresql+psycopg://127.0.0.1/community_test',
    'postgresql+psycopg://127.0.0.1:0/community_test',
    'postgresql+psycopg://127.0.0.1:65536/community_test',
    'postgresql+psycopg://127.0.0.1:32789/community_test',
    'postgresql+psycopg://127.0.0.1:32788/community_test?host=remote.invalid',
    'postgresql+psycopg://127.0.0.1:32788/community_test?dbname=production',
    'postgresql+psycopg://127.0.0.1:32788/community_test#fragment',
    'postgresql+psycopg://127.0.0.1:32788/community_test\n',
  ]) {
    const data = fixture(context);
    data.runtime.environment.COMMUNITY_DATABASE_URL = url;
    data.save();
    assert.throws(() => prepare(data), /database|port/i);
  }
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const data = fixture(context);
    data.runtime.environment.COMMUNITY_DATABASE_URL = `postgresql+psycopg://${host}:32788/community_test`;
    data.save();
    assert.equal(prepare(data).summary.providersDisabled, true);
  }
});

test('SMTP and Mailpit must remain loopback and API binding is fixed', context => {
  for (const change of [
    runtime => { runtime.environment.COMMUNITY_SMTP_HOST = 'mail'; },
    runtime => { runtime.environment.COMMUNITY_SMTP_HOST = 'remote.invalid'; },
    runtime => { runtime.environment.COMMUNITY_SMTP_PORT = '0'; },
    runtime => { runtime.environment.COMMUNITY_SMTP_PORT = '65536'; },
    runtime => { runtime.environment.COMMUNITY_SMTP_PORT = '32787'; },
    runtime => { runtime.smtpPort = 0; },
    runtime => { runtime.databasePort = 65536; },
    runtime => { runtime.mailUrl = 'http://remote.invalid:32787'; },
    runtime => { runtime.mailUrl = 'http://127.0.0.1'; },
    runtime => { runtime.mailUrl = 'https://127.0.0.1:32787'; },
    runtime => { runtime.mailUrl = 'http://fixture@127.0.0.1:32787'; },
    runtime => { runtime.mailUrl = 'http://127.0.0.1:32787/path'; },
    runtime => { runtime.mailUrl = 'http://127.0.0.1:32787?target=remote.invalid'; },
    runtime => { runtime.apiUrl = 'http://0.0.0.0:8000'; },
    runtime => { runtime.apiUrl = 'http://localhost:8000'; },
    runtime => { runtime.apiUrl = 'http://127.0.0.1:8001'; },
    runtime => { runtime.environment.COMMUNITY_ENVIRONMENT = 'production'; },
  ]) {
    const data = fixture(context);
    change(data.runtime);
    data.save();
    assert.throws(() => prepare(data));
  }
});

test('all captured runtime paths reject lexical escapes and symlink escapes', context => {
  for (const field of ['snapshotRoot', 'interpreter', 'manifestPath', 'COMMUNITY_SECRET_FILE']) {
    for (const mode of ['path', 'symlink']) {
      const data = fixture(context);
      const outside = join(data.root, field === 'snapshotRoot' ? 'outside' : 'outside.txt');
      if (field === 'snapshotRoot') mkdirSync(outside);
      else writeFileSync(outside, 'synthetic non-secret fixture\n', { mode: 0o700 });
      const path = mode === 'path' ? outside : join(data.directory, 'escape-link');
      if (mode === 'symlink') symlinkSync(outside, path);
      if (field === 'COMMUNITY_SECRET_FILE') data.runtime.environment[field] = path;
      else data.runtime[field] = path;
      data.save();
      assert.throws(() => prepare(data), /owned directory/, `${field}: ${mode}`);
    }
  }
});

test('runtime metadata cannot use another project or redirected local directories', context => {
  const data = fixture(context);
  const another = fixture(context);
  assert.throws(() => prepareRuntime(another.file, { root: data.root, inheritedEnv: safeEnvironment }), /owned directory/);
  for (const target of ['local', 'owner', 'runtime']) {
    const current = fixture(context);
    const original = target === 'local' ? join(current.root, '.local') : target === 'owner' ? current.directory : current.file;
    const destination = `${original}-redirected`;
    renameSync(original, destination);
    symlinkSync(destination, original);
    assert.throws(() => prepare(current), /symlink redirection/, target);
  }
});

test('a missing key cannot hide a parent escape or dangling symlink', context => {
  for (const mode of ['parent', 'dangling']) {
    const data = fixture(context);
    if (mode === 'parent') {
      symlinkSync(data.root, join(data.directory, 'key-parent'));
      data.runtime.environment.COMMUNITY_SECRET_FILE = join(data.directory, 'key-parent', 'identity.key');
    } else {
      symlinkSync(join(data.directory, 'missing.key'), data.runtime.environment.COMMUNITY_SECRET_FILE);
    }
    data.save();
    assert.throws(() => prepare(data), /Key path/);
  }
});

test('manifest traversal, secret paths, duplicate files and missing entry points are rejected', context => {
  for (const change of [
    manifest => { manifest.files[0].path = '../runtime.json'; },
    manifest => { manifest.files[0].path = '/outside.py'; },
    manifest => { manifest.files[0].path = '..\\outside.py'; },
    manifest => { manifest.files[0].path = '.env'; },
    manifest => { manifest.files[0].path = 'app/.env.local'; },
    manifest => { manifest.files[0].path = 'identity.key'; },
    manifest => { manifest.files.push({ ...manifest.files[0] }); },
    manifest => { manifest.files.pop(); },
    manifest => { manifest.files = []; },
    manifest => { delete manifest.files[0].sha256_before; },
    manifest => { delete manifest.files[0].sha256_after; },
    manifest => { manifest.snapshot_root = '/different-snapshot'; },
  ]) {
    const data = fixture(context);
    change(data.manifest);
    data.save();
    assert.throws(() => prepare(data), /manifest|captured file/i);
  }
  const data = fixture(context);
  const source = join(data.runtime.snapshotRoot, 'app', 'main.py');
  rmSync(source);
  symlinkSync(data.file, source);
  assert.throws(() => prepare(data), /Manifest source file/);
});

test('a manifest cannot read the declared key through a source or metadata alias', context => {
  for (const target of ['source', 'manifest']) {
    const data = fixture(context);
    data.runtime.environment.COMMUNITY_SECRET_FILE = target === 'source'
      ? join(data.runtime.snapshotRoot, 'app', 'main.py') : data.runtime.manifestPath;
    data.save();
    assert.throws(() => prepare(data), /key/i);
  }
});

test('untrusted ownership records and non-executable interpreters are rejected', context => {
  for (const change of [
    runtime => { runtime.ownerLabel = 'community.synthetic.owner=someone-else'; },
    runtime => { runtime.containers[0].id = 'short-id'; },
    runtime => { runtime.containers = []; },
    runtime => { runtime.revision = ''; },
  ]) {
    const data = fixture(context);
    change(data.runtime);
    data.save();
    assert.throws(() => prepare(data));
  }
  const data = fixture(context);
  chmodSync(data.runtime.interpreter, 0o600);
  assert.throws(() => prepare(data), /executable/);
});

test('CLI rejects invalid metadata and unknown components before any child starts', context => {
  for (const mode of ['component', 'database', 'json', 'manifest']) {
    const data = fixture(context);
    if (mode === 'database') {
      data.runtime.environment.COMMUNITY_DATABASE_URL = 'postgresql+psycopg://fixture-canary@remote.invalid:32788/community_test';
      data.save();
    }
    if (mode === 'json') writeFileSync(data.file, '{fixture-canary');
    if (mode === 'manifest') writeFileSync(data.runtime.manifestPath, '{fixture-canary');
    const result = invoke(data, ['--component', mode === 'component' ? 'unknown-fixture-canary' : 'api']);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /fixture-canary|postgresql/);
    assert.equal(existsSync(data.marker), false);
  }
});

test('check with any valid component still starts no child', context => {
  const data = fixture(context, { withExports: true });
  for (const component of ['api', 'mail', 'reminders', 'exports']) {
    const result = invoke(data, ['--check', '--component', component]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(data.marker), false);
  }
});

test('successful exits, spawn failures and child signals preserve meaningful exit status', context => {
  const success = fixture(context);
  assert.equal(invoke(success, ['--component', 'mail']).status, 0);
  const failure = fixture(context);
  writeFileSync(failure.runtime.interpreter, '#!/missing-synthetic-fixture-interpreter\n');
  const failed = invoke(failure, ['--component', 'mail']);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Unable to start the owned component/);
  const signalled = fixture(context);
  signalled.setStub('process.kill(process.pid, "SIGTERM");');
  assert.equal(invoke(signalled, ['--component', 'mail']).status, 143);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`foreground ${signal} reaches only the owned child and its failure propagates`, async context => {
    const data = fixture(context);
    data.setStub(`process.on(${JSON.stringify(signal)}, () => {
      require('node:fs').writeFileSync(${JSON.stringify(data.marker)}, ${JSON.stringify(signal)});
      process.exit(23);
    });
    process.stdout.write('fixture-ready\\n');
    setTimeout(() => process.exit(99), 4000);`);
    const child = spawn(process.execPath, [data.cli, '--runtime', data.file, '--component', 'mail'], {
      cwd: data.root, env: safeEnvironment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
    });
    context.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
    let output = '';
    let errors = '';
    let sent = false;
    child.stdout.on('data', bytes => {
      output += bytes;
      if (!sent && output.includes('fixture-ready\n')) sent = child.kill(signal);
    });
    child.stderr.on('data', bytes => { errors += bytes; });
    const result = await new Promise((resolveResult, reject) => {
      child.once('error', reject);
      child.once('close', (code, exitSignal) => resolveResult({ code, signal: exitSignal }));
    });
    assert.equal(sent, true, errors || output);
    assert.deepEqual(result, { code: 23, signal: null }, errors || output);
    assert.equal(readFileSync(data.marker, 'utf8'), signal);
  });
}