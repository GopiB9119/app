import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// T79: the server counts names, descriptions and notes in characters (an emoji counts once), so the web must too.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const otherId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const requestId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const created = '2026-10-01T10:00:00Z';
const later = '2026-10-04T10:00:00Z';
const emoji = count => '\u{1F600}'.repeat(count);

function loadSource(relative, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), URL, URLSearchParams, Buffer, AbortSignal, DOMException,
    fetch: async () => { throw new Error('Unexpected network request'); }, process: { env: {} },
  }, { filename: relative });
  return exports;
}

function spacesClient() {
  return loadSource('features/spaces/client.ts', { '@/features/identity/client': loadSource('features/identity/client.ts') });
}

const space = (overrides = {}) => ({
  id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
  role: 'owner', version: '1', created_at: created, ...overrides,
});

function accepts(schema, value) { return schema.safeParse(value).success; }

test('Space answers count names and descriptions in characters, as the server does', () => {
  const client = spacesClient();
  assert.equal(accepts(client.spaceSchema, space({ name: emoji(80), description: emoji(280) })), true);
  assert.equal(accepts(client.spaceSchema, space({ name: emoji(81) })), false);
  assert.equal(accepts(client.spaceSchema, space({ description: emoji(281) })), false);
  assert.equal(accepts(client.spaceSchema, space({ name: '' })), false);
  assert.equal(accepts(client.spacesSchema, [space({ name: `Morgan ${emoji(73)}`, description: emoji(200) })]), true);
  const settings = space({ name: emoji(80), description: emoji(280), etag: `"${'a'.repeat(64)}"` });
  assert.equal(accepts(client.spaceSettingsSchema, settings), true);
  assert.equal(accepts(client.spaceSettingsSchema, { ...settings, description: emoji(281) }), false);
});

test('Names and notes in members, invitations, join requests, Find groups and ownership offers count characters', () => {
  const client = spacesClient();
  const member = { account_id: otherId, display_name: emoji(80), role: 'member', joined_at: created, etag: '"member-1"' };
  assert.equal(accepts(client.memberSchema, member), true);
  assert.equal(accepts(client.memberSchema, { ...member, display_name: emoji(81) }), false);
  const invitation = {
    id: requestId, space_id: spaceId, space_name: emoji(80), inviter_name: emoji(80), recipient_account_id: accountId,
    role: 'member', status: 'pending', created_at: created, expires_at: later,
  };
  assert.equal(accepts(client.invitationSchema, invitation), true);
  assert.equal(accepts(client.invitationSchema, { ...invitation, inviter_name: emoji(81) }), false);
  const request = { id: requestId, space_id: spaceId, space_name: emoji(80), note: emoji(280), status: 'pending', created_at: created, expires_at: later, resolved_at: null };
  assert.equal(accepts(client.joinRequestSchema, request), true);
  assert.equal(accepts(client.joinRequestSchema, { ...request, note: emoji(281) }), false);
  const review = { id: requestId, account_id: otherId, display_name: emoji(80), note: emoji(280), created_at: created, expires_at: later };
  assert.equal(accepts(client.joinReviewSchema, review), true);
  assert.equal(accepts(client.joinReviewSchema, { ...review, display_name: emoji(81) }), false);
  const entry = { id: spaceId, name: emoji(80), description: emoji(280), member_count: 3, viewer_role: null, pending_request_id: null, can_request: true };
  assert.equal(accepts(client.directoryEntrySchema, entry), true);
  assert.equal(accepts(client.directoryEntrySchema, { ...entry, description: emoji(281) }), false);
  const transfer = {
    id: requestId, space_id: spaceId, space_name: emoji(80), from_account_id: accountId, from_name: emoji(80), to_account_id: otherId, to_name: emoji(80),
    status: 'pending', created_at: created, expires_at: later, resolved_at: null, version: '1', etag: '"transfer-1"',
  };
  assert.equal(accepts(client.ownershipTransferSchema, transfer), true);
  assert.equal(accepts(client.ownershipTransferSchema, { ...transfer, to_name: emoji(81) }), false);
});

test('Forms count characters: an emoji is one, and a limit is never reached in half', () => {
  const client = spacesClient();
  assert.equal(client.characters(emoji(280)), 280);
  assert.equal(client.characters('Synthetic note'), 14);
  assert.equal(client.lengthProblem(emoji(80), 80), null);
  assert.equal(client.lengthProblem(`  ${emoji(80)}  `, 80), null);
  assert.equal(client.lengthProblem(emoji(81), 80), 'Use up to 80 characters.');
  assert.equal(client.lengthProblem(emoji(281), 280), 'Use up to 280 characters.');
  assert.equal(client.lengthProblem('', 280), null);
});
