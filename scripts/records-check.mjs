// Records only grow. A task, decision, checkpoint, changelog section or evaluation row that once existed must not
// disappear, and a task marked Done must not go back without saying so. Sessions sharing one working tree have
// written these files from stale copies and lost others' records (audit M6); this check finds that in the working
// copy before it is committed, and in the last commit.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const lines = text => text.split(/\r?\n/);

// The first cell names the row; the last cell of a task row is its status.
function rows(text, pattern) {
  const found = [];
  for (const line of lines(text)) {
    const match = pattern.exec(line);
    if (!match) continue;
    const trimmed = line.trimEnd();
    const end = trimmed.lastIndexOf('|');
    const start = trimmed.lastIndexOf('|', end - 1);
    found.push({ key: match[1].trim(), status: start >= 0 && end > start ? trimmed.slice(start + 1, end).trim() : '' });
  }
  return found;
}

function headings(text, levels) {
  return lines(text).flatMap(line => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    return match && levels.includes(match[1].length) ? [{ key: `${match[1]} ${match[2]}`, status: '' }] : [];
  });
}

// A changelog keeps its sections and every entry that has a bold title; untitled bullets may be reworded.
function changelog(text) {
  const titled = lines(text).flatMap(line => {
    const match = /^\s*-\s+\*\*(.+?)\*\*/.exec(line);
    return match ? [{ key: `entry: ${match[1]}`, status: '' }] : [];
  });
  return [...headings(text, [2, 3]), ...titled];
}

export const KINDS = {
  'docs/TASKS.md': { name: 'task', read: text => rows(text, /^\|\s*(T\d+)\s*\|/), statuses: true },
  'docs/DECISIONS.md': { name: 'decision', read: text => rows(text, /^\|\s*(DEC-\d+)\s*\|/) },
  'docs/BUILD_STATUS.md': { name: 'heading', read: text => headings(text, [2, 3]) },
  'docs/EVALUATIONS.md': { name: 'row', read: text => rows(text, /^\|\s*([^|\s-][^|]*?)\s*\|/).filter(row => !['Suite', 'Date'].includes(row.key)) },
  'CHANGELOG.md': { name: 'record', read: changelog },
};

const done = status => /^Done\b/.test(status);
const counted = records => records.reduce((counts, record) => counts.set(record.key, (counts.get(record.key) ?? 0) + 1), new Map());

/** What `after` lost compared with `before`: records that disappeared, and tasks that went back from Done. */
export function compare(file, before, after) {
  const kind = KINDS[file];
  if (!kind) throw new Error(`No record rules for ${file}`);
  const old = kind.read(before);
  const now = kind.read(after);
  const remaining = counted(now);
  const lost = [];
  for (const [key, count] of counted(old)) {
    if ((remaining.get(key) ?? 0) < count) lost.push(key);
  }
  const reopened = [];
  if (kind.statuses) {
    const current = new Map(now.map(record => [record.key, record.status]));
    for (const record of old) {
      const status = current.get(record.key);
      if (done(record.status) && status !== undefined && !done(status) && !/^Reopened\b/.test(status)) reopened.push(record.key);
    }
  }
  return { lost, reopened };
}

function show(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function revisionExists(revision) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function check(label, read) {
  const findings = [];
  for (const file of Object.keys(KINDS)) {
    const pair = read(file);
    if (!pair || pair.before === null) continue;
    if (pair.after === null) { findings.push(`${file}: the file is gone (${label})`); continue; }
    const { lost, reopened } = compare(file, pair.before, pair.after);
    const kind = KINDS[file].name;
    for (const key of lost) findings.push(`${file}: ${kind} lost (${label}): ${key}`);
    for (const key of reopened) findings.push(`${file}: task went back from Done without "Reopened" (${label}): ${key}`);
  }
  return findings;
}

function main(argv) {
  const range = argv.includes('--range') ? argv[argv.indexOf('--range') + 1] : null;
  const findings = [];
  if (range) {
    const [from, to] = range.split('..');
    findings.push(...check(range, file => ({ before: show(from, file), after: show(to || 'HEAD', file) })));
  } else {
    findings.push(...check('working copy against HEAD', file => ({
      before: show('HEAD', file),
      after: existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null,
    })));
    if (revisionExists('HEAD^')) findings.push(...check('last commit against its parent', file => ({ before: show('HEAD^', file), after: show('HEAD', file) })));
  }
  for (const finding of findings) console.log(finding);
  console.log(findings.length ? `Records check: ${findings.length} record${findings.length === 1 ? '' : 's'} lost or reverted.` : 'Records check: no record was lost.');
  return findings.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
