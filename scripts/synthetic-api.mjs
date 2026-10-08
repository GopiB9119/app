import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants as fsConstants, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const components = ['api', 'mail', 'reminders', 'exports'];
const usage = 'node scripts/synthetic-api.mjs --runtime <runtime.json> [--component api|mail|reminders|exports] [--check]';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseOptions(argumentsList) {
  let parsed;
  try {
    parsed = parseArgs({ args: argumentsList, strict: true, allowPositionals: false, tokens: true, options: {
      runtime: { type: 'string' }, component: { type: 'string' },
      check: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
    } });
  } catch {
    throw new Error(`Invalid arguments. Usage: ${usage}`);
  }
  const names = parsed.tokens.map(token => token.name);
  requireValue(new Set(names).size === names.length, 'Duplicate options are not allowed.');
  const options = { ...parsed.values };
  requireValue(options.component === undefined || components.includes(options.component), 'Unknown component; choose api, mail, reminders or exports.');
  if (!options.help) {
    requireValue(Boolean(options.runtime), '--runtime is required.');
    requireValue(options.check || Boolean(options.component), '--component is required unless --check is used.');
  }
  return options;
}

function inside(directory, path) {
  const child = relative(directory, path);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function ownedPath(directory, path, label, { type = 'file', allowMissing = false } = {}) {
  const message = `${label} must resolve to ${type === 'file' ? 'a file' : 'a directory'} inside the owned directory.`;
  requireValue(typeof path === 'string' && isAbsolute(path) && inside(directory, resolve(path)), message);
  try {
    if (allowMissing && !lstatSync(path, { throwIfNoEntry: false })) {
      const parent = realpathSync(dirname(path));
      requireValue(parent === directory || inside(directory, parent), message);
      return join(parent, basename(path));
    }
    const actual = realpathSync(path);
    const entry = statSync(actual);
    requireValue(inside(directory, actual) && (type === 'file' ? entry.isFile() : entry.isDirectory()), message);
    return actual;
  } catch {
    throw new Error(message);
  }
}

function readJson(path, label) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Invalid object.');
    return value;
  } catch {
    throw new Error(`${label} must be readable JSON metadata.`);
  }
}

function port(value) {
  return /^[1-9][0-9]{0,4}$/.test(String(value)) && Number(value) <= 65535;
}

function loopback(hostname) {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname.toLowerCase());
}

function localUrl(value, label) {
  try {
    requireValue(typeof value === 'string' && !/[\s\\?#]/.test(value), 'Invalid URL.');
    const url = new URL(value);
    requireValue(loopback(url.hostname) && port(url.port), 'Invalid host or port.');
    return url;
  } catch {
    throw new Error(`${label} requires a loopback hostname, explicit valid port and no query or fragment.`);
  }
}

function verifyManifest(manifestFile, snapshotRoot, keyPath, component) {
  requireValue(basename(manifestFile) === 'source-manifest.json', 'Expected source-manifest.json metadata.');
  const manifest = readJson(manifestFile, 'Source manifest');
  requireValue(manifest.snapshot_root === snapshotRoot, 'Manifest snapshot_root must match the owned snapshot.');
  requireValue(Array.isArray(manifest.files) && manifest.files.length > 0, 'Source manifest requires captured files.');
  const seen = new Set();
  for (const entry of manifest.files) {
    requireValue(entry && typeof entry.path === 'string' && !isAbsolute(entry.path)
      && !entry.path.includes('\\') && entry.path.split('/').every(part => part && part !== '.' && part !== '..'
        && !part.startsWith('.env') && !part.endsWith('.key')), 'Manifest paths must name relative, non-secret source files.');
    const file = ownedPath(snapshotRoot, resolve(snapshotRoot, entry.path), 'Manifest source file');
    requireValue(file !== keyPath && !file.split(sep).some(part => part.startsWith('.env') || part.endsWith('.key')),
      'Manifest cannot include key or environment files.');
    requireValue(!seen.has(file), 'Source manifest contains a duplicate file.');
    seen.add(file);
    requireValue(['sha256_before', 'sha256_after'].every(name => typeof entry[name] === 'string' && /^[a-f0-9]{64}$/i.test(entry[name])),
      'Each captured file requires both SHA-256 hashes.');
    let bytes;
    try { bytes = readFileSync(file); } catch { throw new Error('Cannot read a captured source file.'); }
    const digest = createHash('sha256').update(bytes).digest('hex');
    requireValue(digest === entry.sha256_before.toLowerCase() && digest === entry.sha256_after.toLowerCase(),
      'Captured source does not match both manifest hashes.');
    requireValue(entry.bytes === undefined || entry.bytes === bytes.length, 'Captured source byte count does not match the manifest.');
  }
  for (const entrypoint of ['app/main.py', 'app/worker.py', 'app/reminder_worker.py']) {
    requireValue(seen.has(join(snapshotRoot, entrypoint)), 'Source manifest must cover the API, mail and reminder entry points.');
  }
  if (component === 'exports') {
    requireValue(seen.has(join(snapshotRoot, 'app/export_worker.py')), 'Source manifest must cover the export worker entry point.');
  }
  return seen.size;
}

function cleanInheritedEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !/^(COMMUNITY_|OPENAI_|AZURE_OPENAI_|LANGCHAIN_|LANGSMITH_|TINYFISH_|OTEL_|PYTHON|PG|UVICORN_|GUNICORN_|DYLD_)/i.test(name)
    && !/(^|_)PROXY($|_)/i.test(name)
    && !/^(VIRTUAL_ENV|__PYVENV_LAUNCHER__|LD_PRELOAD|LD_LIBRARY_PATH|NODE_OPTIONS|NODE_PATH|WEB_CONCURRENCY|FORWARDED_ALLOW_IPS)$/i.test(name)));
}

export function prepareRuntime(runtimeFile, { root = projectRoot, inheritedEnv = process.env, component } = {}) {
  let directory;
  let file;
  try {
    const local = join(realpathSync(root), '.local');
    file = resolve(runtimeFile);
    directory = dirname(file);
    requireValue(realpathSync(local) === local && dirname(directory) === local
      && /^synthetic-api-[A-Za-z0-9_-]+$/.test(basename(directory))
      && basename(file) === 'runtime.json' && realpathSync(directory) === directory
      && realpathSync(file) === file, 'Invalid runtime location.');
  } catch {
    throw new Error('Runtime metadata must be runtime.json in a project .local/synthetic-api-* owned directory without symlink redirection.');
  }
  const runtime = readJson(ownedPath(directory, file, 'Runtime metadata'), 'Runtime');
  requireValue(runtime.ownerLabel === `community.synthetic.owner=${basename(directory)}`, 'Runtime owner label must match its directory.');
  const environment = runtime.environment;
  requireValue(environment && typeof environment === 'object' && !Array.isArray(environment)
    && Object.values(environment).every(value => typeof value === 'string'), 'Runtime environment must contain string settings.');
  requireValue(['development', 'test'].includes(environment.COMMUNITY_ENVIRONMENT), 'Only development or test environments are allowed.');
  const database = localUrl(environment.COMMUNITY_DATABASE_URL, 'Synthetic database');
  requireValue(['postgresql:', 'postgresql+psycopg:'].includes(database.protocol) && database.pathname === '/community_test',
    'Only the synthetic community_test PostgreSQL database is allowed.');
  requireValue(port(runtime.databasePort) && Number(database.port) === Number(runtime.databasePort), 'Database port must match runtime metadata.');
  requireValue(['127.0.0.1', 'localhost'].includes(environment.COMMUNITY_SMTP_HOST), 'SMTP must use a loopback host supported by the backend.');
  requireValue(port(runtime.smtpPort) && port(environment.COMMUNITY_SMTP_PORT)
    && Number(environment.COMMUNITY_SMTP_PORT) === Number(runtime.smtpPort), 'SMTP requires a valid port matching runtime metadata.');
  requireValue(runtime.apiUrl === 'http://127.0.0.1:8000', 'API URL must be http://127.0.0.1:8000.');
  const mail = localUrl(runtime.mailUrl, 'Private Mailpit');
  requireValue(mail.protocol === 'http:' && mail.pathname === '/' && !mail.username && !mail.password, 'Private Mailpit requires a plain loopback HTTP origin.');
  const snapshotRoot = ownedPath(directory, runtime.snapshotRoot, 'Snapshot', { type: 'directory' });
  const interpreter = ownedPath(directory, runtime.interpreter, 'Interpreter');
  try { accessSync(interpreter, fsConstants.X_OK); } catch { throw new Error('Owned interpreter must be executable.'); }
  const keyPath = ownedPath(directory, environment.COMMUNITY_SECRET_FILE, 'Key path', { allowMissing: true });
  const manifestPath = ownedPath(directory, runtime.manifestPath, 'Source manifest');
  requireValue(keyPath !== file && keyPath !== manifestPath, 'Key path must not alias runtime metadata.');
  const sourceFiles = verifyManifest(manifestPath, snapshotRoot, keyPath, component);
  requireValue(typeof runtime.revision === 'string' && /^[A-Za-z0-9_-]+$/.test(runtime.revision), 'Runtime requires a recorded migration revision.');
  requireValue(Array.isArray(runtime.containers) && runtime.containers.length > 0
    && runtime.containers.every(container => container && /^[a-f0-9]{64}$/.test(container.id)
      && typeof container.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container.name)), 'Runtime requires exact owned container metadata.');
  const env = {
    ...cleanInheritedEnvironment(inheritedEnv),
    COMMUNITY_ENVIRONMENT: environment.COMMUNITY_ENVIRONMENT,
    COMMUNITY_DATABASE_URL: environment.COMMUNITY_DATABASE_URL,
    COMMUNITY_SECRET_FILE: keyPath,
    COMMUNITY_SMTP_HOST: environment.COMMUNITY_SMTP_HOST,
    COMMUNITY_SMTP_PORT: environment.COMMUNITY_SMTP_PORT,
    COMMUNITY_AGENT_MODEL_URL: '', COMMUNITY_AGENT_MODEL_NAME: '', COMMUNITY_AGENT_MODEL_KEY: '', COMMUNITY_AGENT_WEB_KEY: '',
    COMMUNITY_MAIL_URL: runtime.mailUrl, COMMUNITY_WEB_URL: 'http://127.0.0.1:3000',
    LANGCHAIN_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false', LANGSMITH_TRACING: 'false', OTEL_SDK_DISABLED: 'true',
    NO_PROXY: '127.0.0.1,localhost,::1',
  };
  return {
    interpreter, snapshotRoot, env,
    summary: {
      runtimeFile: file, snapshotRoot, interpreter, keyPath, manifestPath,
      recordedMigration: runtime.revision, ownerLabel: runtime.ownerLabel,
      containers: runtime.containers.map(({ name, id }) => ({ name, id })),
      apiUrl: runtime.apiUrl, mailUrl: runtime.mailUrl, webUrl: env.COMMUNITY_WEB_URL,
      sourceFiles, providersDisabled: true, tracingDisabled: true,
    },
  };
}

function launchChild(runtime, component) {
  const args = ['-E', '-s', '-B', '-m', ...(component === 'api'
    ? ['uvicorn', 'app.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8000', '--workers', '1']
    : [component === 'mail' ? 'app.worker' : component === 'reminders' ? 'app.reminder_worker' : 'app.export_worker'])];
  return new Promise(resolveResult => {
    const child = spawn(runtime.interpreter, args, { cwd: runtime.snapshotRoot, env: runtime.env, shell: false, stdio: 'inherit' });
    const onInterrupt = () => child.kill('SIGINT');
    const onTerminate = () => child.kill('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('close', (code, signal) => {
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      if (failed) console.error('Unable to start the owned component.');
      resolveResult(failed ? 1 : code ?? 128 + (osConstants.signals[signal] ?? 1));
    });
  });
}

export async function runCli(argumentsList) {
  try {
    const options = parseOptions(argumentsList);
    if (options.help) { console.log(usage); return 0; }
    const runtime = prepareRuntime(options.runtime, { component: options.component });
    if (options.check) { console.log(JSON.stringify(runtime.summary, null, 2)); return 0; }
    return await launchChild(runtime, options.component);
  } catch (error) {
    console.error(`Synthetic API: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}