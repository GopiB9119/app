import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { catalog, domainPaths, sourceFiles, sourceFingerprint, sourceInventory, validateCatalog } from './feature-catalog.mjs';

test('every chapter, must-have and final outcome has an existing contract and one owner', () => {
  assert.deepEqual(validateCatalog(), []);
  assert.equal(sourceFiles.length, 21);
  assert.equal(catalog.domains.flatMap(domain => domain.requirements).length, 48);
  assert.equal(catalog.domains.flatMap(domain => domain.outcomes).length, 17);
});

test('each domain has distinct backend, web and Android ownership paths', () => {
  const paths = catalog.domains.flatMap(domainPaths);
  assert.equal(new Set(paths).size, catalog.domains.length * 3);
  assert.ok(paths.every(directory => !directory.includes('..')));
});

test('all original sources can be fingerprinted without modifying them', () => {
  for (const source of sourceFiles) {
    const fingerprint = sourceFingerprint(source);
    assert.match(fingerprint.sha256, /^[a-f0-9]{64}$/);
    assert.ok(fingerprint.bytes > 1000);
  }
});

test('detailed inventory preserves every release category and source heading', () => {
  const inventory = sourceInventory();
  assert.equal(inventory.sources.length, 21);
  const counts = { F: 48, S: 17, C: 14, X: 11, O: 17, A: 39 };
  for (const [category, count] of Object.entries(counts)) {
    assert.equal(inventory.releaseLedger.filter(row => row.id.startsWith(`C1-${category}`)).length, count);
  }
  assert.equal(new Set(inventory.releaseLedger.map(row => row.id)).size, inventory.releaseLedger.length);
  for (const source of inventory.sources) {
    assert.ok(source.topics.length > 0);
    assert.ok(source.owners.length > 0);
    assert.ok(source.topics.every(topic => topic.line > 0 && topic.title.length > 0));
  }
});

test('product delivery ledger retains every feature and original source without completion inflation', () => {
  const location = new URL('../docs/PRODUCT_FEATURES.md', import.meta.url);
  const text = readFileSync(location, 'utf8');
  const rows = [...text.matchAll(/^\| ([a-z]+\.[a-z-]+) \| ([PUND]\/){2}[PUND] \|/gm)];
  const expected = catalog.domains.flatMap(domain => domain.features.map(feature => `${domain.id}.${feature}`));
  assert.deepEqual(rows.map(row => row[1]).sort(), expected.sort());
  assert.equal(new Set(rows.map(row => row[1])).size, expected.length);
  for (const source of sourceFiles) assert.ok(text.includes(`](${source})`), source);
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (!match[1].startsWith('http')) assert.ok(existsSync(new URL(match[1].split('#')[0], location)), match[1]);
  }
  const agent = catalog.domains.find(domain => domain.id === 'agents');
  for (const feature of agent.features) assert.ok(text.includes(`| agents.${feature} | D/D/D |`));
});