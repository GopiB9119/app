import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const pageId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const postId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';

function loadSource(relative, fetch, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), fetch, URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    process: { env: { COMMUNITY_API_URL: 'https://backend.example.test', COMMUNITY_WEB_ORIGINS: 'https://client.example.test' } },
  }, { filename: relative });
  return exports;
}

function communityClient() {
  const fetch = async () => { throw new Error('Unexpected network request'); };
  const identity = loadSource('features/identity/client.ts', fetch);
  return loadSource('features/community/client.ts', fetch, { '@/features/identity/client': identity });
}

// No page_status here: answers from before the field existed must still read.
const post = (overrides = {}) => ({
  id: postId, page_id: pageId, page_handle: 'river-walkers', page_name: 'River Walkers', title: 'Saturday walk', body: 'Meet at 7',
  status: 'published', like_count: 0, comment_count: 0, created_at: '2026-09-19T10:00:00Z', published_at: '2026-09-19T10:01:00Z',
  edited_at: null, liked: false, saved: false, can_manage: false, etag: null, ...overrides,
});

test('a post without page_status reads as a post of an active page', () => {
  const client = communityClient();
  assert.equal(client.postSchema.parse(post()).page_status, 'active');
});

test('a post keeps the state of its page, and an unknown state is refused', () => {
  const client = communityClient();
  for (const status of ['active', 'read_only', 'deleted']) {
    assert.equal(client.postSchema.parse(post({ page_status: status })).page_status, status);
  }
  assert.equal(client.postSchema.safeParse(post({ page_status: 'archived' })).success, false);
});
