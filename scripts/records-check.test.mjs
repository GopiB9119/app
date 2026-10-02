import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare } from './records-check.mjs';

const tasks = (...rows) => `# Tasks\n\n| ID | Task | Breaks | Severity | Depends on | Status |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
const row = (id, status) => `| ${id} | Something to do. | R1 | Low | — | ${status} |`;

test('a task row that disappears is lost, and its order or wording does not matter', () => {
  const before = tasks(row('T1', 'Ready'), row('T2', 'Ready'));
  assert.deepEqual(compare('docs/TASKS.md', before, tasks(row('T1', 'Ready'))), { lost: ['T2'], reopened: [] });
  assert.deepEqual(compare('docs/TASKS.md', before, tasks(row('T2', 'In progress'), row('T1', 'Ready'), row('T3', 'Ready'))), { lost: [], reopened: [] });
});

test('a task that goes back from Done is reported, unless it says it was reopened', () => {
  const before = tasks(row('T1', 'Done 2026-10-02: built and tested'));
  assert.deepEqual(compare('docs/TASKS.md', before, tasks(row('T1', 'In progress (building session)'))), { lost: [], reopened: ['T1'] });
  assert.deepEqual(compare('docs/TASKS.md', before, tasks(row('T1', 'Done 2026-10-02: built and tested; checked again'))), { lost: [], reopened: [] });
  assert.deepEqual(compare('docs/TASKS.md', before, tasks(row('T1', 'Reopened 2026-10-03: a defect came back'))), { lost: [], reopened: [] });
});

test('decisions, checkpoints and evaluation rows must stay', () => {
  const decisions = ids => `| ID | Date |\n| --- | --- |\n${ids.map(id => `| ${id} | 2026-10-01 |`).join('\n')}\n`;
  assert.deepEqual(compare('docs/DECISIONS.md', decisions(['DEC-001', 'DEC-002']), decisions(['DEC-002'])).lost, ['DEC-001']);
  const status = (...names) => `# Build Status\n\n${names.map(name => `## ${name}\n\nText.\n`).join('\n')}`;
  assert.deepEqual(compare('docs/BUILD_STATUS.md', status('A Checkpoint', 'B Checkpoint'), status('B Checkpoint')).lost, ['## A Checkpoint']);
  assert.deepEqual(compare('docs/BUILD_STATUS.md', status('A Checkpoint'), status('A Checkpoint', 'C Checkpoint')).lost, []);
  const evaluations = (...suites) => `| Suite | Command | Latest full result |\n| --- | --- | --- |\n${suites.map(suite => `| ${suite} | \`npm test\` | passed |`).join('\n')}\n`;
  assert.deepEqual(compare('docs/EVALUATIONS.md', evaluations('Backend', 'Android JVM'), evaluations('Backend')).lost, ['Android JVM']);
  assert.deepEqual(compare('docs/EVALUATIONS.md', evaluations('Backend'), evaluations('Backend')).lost, []);
});

test('a changelog keeps its sections and titled entries, and may reword untitled bullets', () => {
  const before = '# Changelog\n\n## 2026-10-02\n\n### Community Management\n\n- Implemented part 3.\n- **Inbox newest first** (T102): text.\n';
  assert.deepEqual(compare('CHANGELOG.md', before, '# Changelog\n\n## 2026-10-02\n\n- Implemented part 3.\n').lost, ['### Community Management', 'entry: Inbox newest first']);
  assert.deepEqual(compare('CHANGELOG.md', before, before.replace('Implemented part 3.', 'Built part 3 and its tests.')).lost, []);
});

test('a record that appears twice is lost when one copy goes', () => {
  const before = '# Changelog\n\n## 2026-10-02\n\n### Product\n\n## 2026-10-01\n\n### Product\n';
  assert.deepEqual(compare('CHANGELOG.md', before, '# Changelog\n\n## 2026-10-02\n\n### Product\n\n## 2026-10-01\n').lost, ['### Product']);
});
