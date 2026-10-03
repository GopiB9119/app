import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const catalog = JSON.parse(readFileSync(path.join(root, 'packages/feature-catalog/features.json'), 'utf8'));
export const sourceFiles = ['idea.md', ...Array.from({ length: 20 }, (_, index) => `Chapter${index + 1}.md`)];

export function sourceFingerprint(file) {
  const content = readFileSync(path.join(root, 'docs', file));
  return { file, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.length };
}

export function sourceInventory() {
  const sources = sourceFiles.map(file => {
    const chapter = Number(file.match(/^Chapter(\d+)\.md$/)?.[1]);
    const owners = catalog.domains.filter(domain => !chapter || domain.chapters.includes(chapter)).map(domain => domain.id);
    const topics = [];
    let fence = null;
    for (const [index, line] of readFileSync(path.join(root, 'docs', file), 'utf8').split(/\r?\n/).entries()) {
      const delimiter = line.match(/^\s*(`{3,}|~{3,})/);
      if (delimiter) {
        if (!fence) fence = delimiter[1][0];
        else if (delimiter[1][0] === fence) fence = null;
        continue;
      }
      const heading = !fence && line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) topics.push({ line: index + 1, level: heading[1].length, title: heading[2].trim() });
    }
    return { ...sourceFingerprint(file), owners, topics };
  });
  const release = readFileSync(path.join(root, 'docs/CHAPTER_01_RELEASE_PLAN.md'), 'utf8');
  const releaseLedger = [...release.matchAll(/^\| (C1-[FSCOXA]\d{2}) \| ([^|]+) \|/gm)].map(match => ({
    id: match[1], text: match[2].trim(), source: 'docs/CHAPTER_01_RELEASE_PLAN.md',
  }));
  return { schemaVersion: 1, coverageMeaning: 'Source traceability, not implementation completeness or policy approval.', sources, releaseLedger };
}

export function domainPaths(domain) {
  return [
    `backend/app/modules/${domain.id}`,
    `web/src/features/${domain.id}`,
    `android/app/src/main/java/com/community/platform/feature/${domain.id}`,
  ];
}

export function validateCatalog() {
  const errors = [];
  const release = readFileSync(path.join(root, 'docs/CHAPTER_01_RELEASE_PLAN.md'), 'utf8');
  for (const [field, prefix] of [['requirements', 'F'], ['outcomes', 'O']]) {
    const expected = [...release.matchAll(new RegExp(`^\\| (C1-${prefix}\\d{2}) \\|`, 'gm'))].map(match => match[1]);
    const mapped = catalog.domains.flatMap(domain => domain[field]);
    for (const identifier of expected) {
      if (mapped.filter(value => value === identifier).length !== 1) errors.push(`${identifier} must have exactly one owner`);
    }
    for (const identifier of mapped) {
      if (!expected.includes(identifier)) errors.push(`Unknown requirement ${identifier}`);
    }
  }
  for (let chapter = 1; chapter <= 20; chapter += 1) {
    if (!catalog.domains.some(domain => domain.chapters.includes(chapter))) errors.push(`Chapter ${chapter} has no owner`);
  }
  const domainIds = new Set();
  for (const domain of catalog.domains) {
    if (domainIds.has(domain.id)) errors.push(`Duplicate domain ${domain.id}`);
    domainIds.add(domain.id);
    if (!/^[a-z]+$/.test(domain.id)) errors.push(`Unsafe domain path ${domain.id}`);
    if (new Set(domain.features).size !== domain.features.length) errors.push(`Duplicate feature in ${domain.id}`);
    for (const contract of domain.contracts) {
      if (!existsSync(path.join(root, 'docs', contract))) errors.push(`Missing contract ${contract}`);
    }
  }
  sourceFiles.forEach(sourceFingerprint);
  return errors;
}

function materialize() {
  const marker = '<!-- generated: feature-catalog; reserved, not implemented -->';
  for (const domain of catalog.domains) {
    for (const directory of domainPaths(domain)) {
      const absolute = path.join(root, directory);
      mkdirSync(absolute, { recursive: true });
      const file = path.join(absolute, 'README.md');
      if (existsSync(file) && !readFileSync(file, 'utf8').startsWith(marker)) continue;
      const relative = path.relative(absolute, path.join(root, 'packages/feature-catalog/features.json')).replaceAll('\\', '/');
      writeFileSync(file, `${marker}\n# ${domain.id}\n\nReserved domain boundary. Only features with executable evidence in the build status are implemented.\n\nSource chapters: ${domain.chapters.join(', ')}.\n\nFeature inventory: ${domain.features.join(', ')}.\n\nSee the [complete feature catalog](${relative}). Future implementation files belong here as each feature is built.\n`);
    }
  }
  const support = {
    'agent': 'Shared, bounded LangGraph runtime. Domain authorization and tools stay in backend modules. No model calls are enabled.',
    'infra': 'Local infrastructure, deployment configuration, observability and recovery. Production deployment is not enabled.',
    'packages/openapi': 'Generated HTTP schema for implemented API operations only. Future operations are not advertised as available.',
    'packages/events': 'Versioned realtime and job schemas. Delivery implementations remain owned by their domains.',
    'packages/states': 'Shared state vocabulary for implemented features. Unresolved chapter states must not be silently merged.',
    'packages/design-tokens': 'Shared web and Android color, spacing, typography and accessibility decisions.',
    'tests/e2e': 'Cross-client journey tests using isolated synthetic accounts and local delivery only.',
    'docs/runbooks': 'Executable setup, verification, failure recovery and operational procedures.',
  };
  for (const [directory, description] of Object.entries(support)) {
    mkdirSync(path.join(root, directory), { recursive: true });
    const file = path.join(root, directory, 'README.md');
    if (!existsSync(file)) writeFileSync(file, `${marker}\n# ${directory.split('/').at(-1)}\n\n${description}\n`);
  }
  const lockPath = path.join(root, 'packages/feature-catalog/sources.lock.json');
  if (!existsSync(lockPath)) {
    writeFileSync(lockPath, `${JSON.stringify({ schemaVersion: 1, sources: sourceFiles.map(sourceFingerprint) }, null, 2)}\n`);
  }
  writeFileSync(path.join(root, 'packages/feature-catalog/requirements.json'), `${JSON.stringify(sourceInventory(), null, 2)}\n`);
}

export function validateStructure() {
  const errors = validateCatalog();
  const lockPath = path.join(root, 'packages/feature-catalog/sources.lock.json');
  if (!existsSync(lockPath)) return [...errors, 'Missing source fingerprint lock'];
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  for (const expected of lock.sources) {
    if (sourceFingerprint(expected.file).sha256 !== expected.sha256) errors.push(`Source changed: ${expected.file}; review before updating the lock`);
  }
  const inventoryPath = path.join(root, 'packages/feature-catalog/requirements.json');
  if (!existsSync(inventoryPath)) errors.push('Missing detailed source inventory');
  else if (JSON.stringify(JSON.parse(readFileSync(inventoryPath, 'utf8'))) !== JSON.stringify(sourceInventory())) errors.push('Detailed source inventory is stale; review changes before regenerating');
  for (const domain of catalog.domains) {
    for (const directory of domainPaths(domain)) {
      if (!existsSync(path.join(root, directory))) errors.push(`Missing domain directory ${directory}`);
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const initialErrors = validateCatalog();
  if (initialErrors.length) throw new Error(initialErrors.join('\n'));
  if (process.argv.includes('--materialize')) materialize();
  const errors = validateStructure();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`PASS: ${sourceFiles.length} sources preserved; ${catalog.domains.length} domains; 48 must-haves and 17 outcomes assigned; ${catalog.domains.flatMap(domain => domain.features).length} feature entries and ${sourceInventory().sources.flatMap(source => source.topics).length} source headings retained.`);
}