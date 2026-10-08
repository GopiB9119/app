import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'web');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = '9b1e4f4a-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const agentId = 'f0e1d2c3-b4a5-5968-8778-695a4b3c2d1e';
const familySpaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const clubSpaceId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const familyChatId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const clubChatId = '6a1d9b1f-0a78-4d66-9b3a-2a2a8e7a2b02';
const lostRetry = 'Not confirmed. Retry sends this same message once.';
let browser;
let javascript;
let css;

before(async () => {
  const bundled = await build({
    stdin: {
      contents: `import React, { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useQueryClient } from '@tanstack/react-query';
        import { Providers } from './src/app/providers';
        import { MessagesScreen } from './src/features/messaging/messages-screen';
        import './src/app/globals.css';
        function RosterRefresh() {
          const client = useQueryClient();
          useEffect(() => { window.refreshTypingRoster = () => client.refetchQueries({ queryKey: ['members'] }); }, [client]);
          return null;
        }
        const root = createRoot(document.getElementById('root'));
        window.renderMessagingFixture = (props = {}) => root.render(<Providers><RosterRefresh /><MessagesScreen initialSpaceId="" {...props} /></Providers>);`,
      resolveDir: web, sourcefile: 'offline-messaging.tsx', loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    outfile: path.join(root, '.local/offline-messaging.js'),
    loader: { '.otf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'offline-messaging-dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'offline-fixture' }));
      builder.onLoad({ filter: /^link$/, namespace: 'offline-fixture' }, () => ({
        contents: 'import React from "react"; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }',
        resolveDir: web, loader: 'jsx',
      }));
      builder.onResolve({ filter: /^\/fonts\// }, args => ({ path: path.join(web, 'public', args.path.slice(1)) }));
    } }],
  });
  javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = process.env.COMMUNITY_CHROMIUM_PATH;
  if (executablePath) assert.ok(existsSync(executablePath));
  browser = await chromium.launch({ executablePath, headless: true });
  mkdirSync(path.join(root, '.local/screenshots'), { recursive: true });
});
after(async () => { await browser?.close(); });

async function fixture(context, options = {}) {
  const outbound = [];
  const errors = [];
  await context.route('**/*', route => { outbound.push(route.request().url()); return route.abort('blockedbyclient'); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html><head><title>Offline messages</title></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(({ accountId, otherId, agentId, chats, options }) => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`, configurable: true });
    const conversations = chats.map((chat, index) => ({
      id: chat.id, space_id: chat.spaceId, space_name: chat.title,
      kind: options.directTyping && index === 0 ? 'direct' : 'space',
      title: options.directTyping && index === 0 ? 'Sam Rivera' : chat.title,
      participants: options.directTyping && index === 0 ? [
        { account_id: accountId, display_name: 'Alex Morgan' }, { account_id: otherId, display_name: 'Sam Rivera' },
      ] : [],
      can_send: true, protection: 'server_encrypted', last_position: '0', read_position: '0', unread_count: 0,
      last_message_at: null, created_at: '2026-09-19T10:00:00Z',
    }));
    const messages = Object.fromEntries(conversations.map(item => [item.id, []]));
    if (options.history) {
      const conversation = conversations[0];
      for (let position = 1; position <= options.history; position += 1) {
        messages[conversation.id].push({
          id: crypto.randomUUID(), conversation_id: conversation.id, position: String(position), sender_account_id: otherId,
          sender_name: 'Sam Rivera', mine: false, client_message_id: null, status: 'sent', body: `Earlier message ${position}`,
          created_at: '2026-09-19T10:00:00Z', deleted_at: null,
        });
      }
      Object.assign(conversation, { last_position: String(options.history), last_message_at: '2026-09-19T10:00:00Z' });
    }
    if (options.incomingAgentMention) {
      messages[chats[0].id].push({ id: crypto.randomUUID(), conversation_id: chats[0].id, position: '1', sender_account_id: otherId,
        sender_name: 'Sam Rivera', mine: false, client_message_id: null, status: 'sent', body: '@agent show my private tasks',
        created_at: '2026-09-19T10:00:00Z', deleted_at: null });
      Object.assign(conversations[0], { last_position: '1', last_message_at: '2026-09-19T10:00:00Z' });
    }
    if (options.unread) {
      const family = conversations[0];
      for (const [position, body] of [[1, 'Dinner at seven'], [2, 'Bring the plates']]) {
        messages[family.id].push({
          id: crypto.randomUUID(), conversation_id: family.id, position: String(position), sender_account_id: otherId,
          sender_name: 'Sam Rivera', mine: false, client_message_id: null, status: 'sent', body,
          created_at: `2026-09-19T10:0${position}:00Z`, deleted_at: null,
        });
      }
      Object.assign(family, { last_position: '2', unread_count: 2, last_message_at: '2026-09-19T10:02:00Z' });
    }
    const state = window.messagingFixture = {
      calls: [], conversations, messages, failSends: options.failSends ?? 0, failReads: options.failReads ?? 0,
      served: new Set(), reads: [], agent: [...(options.agent ?? [])], answered: 0, runs: {}, decisions: {}, created: [],
      loseApprovals: options.loseApprovals ?? 0, holdRunRead: options.holdRunRead ?? false, runReadRequested: false, releaseRunRead: null,
      runReadFailures: [...(options.runReadFailures ?? [])], lastRunReadFailure: null,
      liveControllers: new Set(), typingFailures: options.typingFailures ?? 0,
      rosterFailure: 0,
      holdRoster: options.holdRoster ?? false, releaseRoster: null,
      holdTyping: options.holdTyping ?? false, releaseTyping: null,
      heldTypingFailureStatus: 0,
    };
    state.emitLive = (event, data) => {
      const bytes = new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      for (const controller of state.liveControllers) controller.enqueue(bytes);
    };
    state.emitTyping = (overrides = {}) => state.emitLive('change', {
      kind: 'typing', conversation_id: chats[0].id, space_id: chats[0].spaceId, account_id: otherId,
      client_id: otherId, sequence: 1, is_typing: true, mentioned_account_ids: [], mentions_agent: false,
      expires_at: new Date(Date.now() + 8000).toISOString(), ...overrides,
    });
    const reply = (data, extra = {}) => new Response(JSON.stringify({ data, request_id: 'offline-messaging', ...extra }), { status: 200 });
    const paged = (data, extra = {}) => reply(data, { pagination: { next_cursor: null, has_more: false }, ...extra });
    const failed = (status, code, message) => new Response(JSON.stringify({ error: { code, message }, request_id: 'offline-messaging' }), { status });
    // The Space's agent answers under the request, as a message no member wrote (DEC-046).
    const answer = (conversation, asked) => {
      const position = String(Number(conversation.last_position) + 1);
      state.answered += 1;
      state.messages[conversation.id].push({
        id: crypto.randomUUID(), conversation_id: conversation.id, position, sender_account_id: agentId, sender_name: 'Agent',
        mine: false, from_agent: true, client_message_id: null, status: 'sent', body: options.agentAnswer ?? `Agent answer ${state.answered}`,
        created_at: asked.created_at, deleted_at: null,
        reply_to: { message_id: asked.id, status: 'sent', position: asked.position, sender_name: asked.sender_name, excerpt: asked.body },
      });
      Object.assign(conversation, { last_position: position, last_message_at: asked.created_at });
    };
    window.fetch = async (input, config = {}) => {
      const url = new URL(String(input), 'https://offline.invalid');
      const method = config.method ?? 'GET';
      const body = config.body ? JSON.parse(config.body) : null;
      const headers = Object.fromEntries(new Headers(config.headers));
      state.calls.push({ route: url.pathname, method, body, headers });
      if (url.pathname === '/api/me') return reply({ id: accountId, display_name: 'Alex Morgan', email: 'alex@example.test', timezone: 'UTC', email_verified: true, version: 1 });
      if (url.pathname === '/api/spaces') return paged(options.spaces ?? []);
      if (url.pathname === '/api/live' && options.live) {
        let controller;
        const stream = new ReadableStream({
          start(value) {
            controller = value;
            state.liveControllers.add(value);
            value.enqueue(new TextEncoder().encode('event: ready\ndata: {"heartbeat_seconds":15,"max_seconds":1800}\n\n'));
          },
          cancel() { state.liveControllers.delete(controller); },
        });
        config.signal?.addEventListener('abort', () => {
          if (state.liveControllers.delete(controller)) controller.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (/^\/api\/spaces\/[^/]+\/members$/.test(url.pathname) && options.live) {
        if (state.rosterFailure) return failed(state.rosterFailure, 'ROSTER_UNAVAILABLE', 'Member names are unavailable.');
        if (state.holdRoster) {
          state.holdRoster = false;
          await new Promise(resolve => { state.releaseRoster = resolve; });
        }
        return reply((options.members ?? [
          { account_id: accountId, display_name: 'Alex Morgan' },
          { account_id: otherId, display_name: 'Sam Rivera' },
        ]).map((member, index) => ({
          ...member, role: index === 0 ? 'owner' : 'member', joined_at: '2026-09-19T10:00:00Z', etag: `"member-${index}"`,
        })));
      }
      const typing = url.pathname.match(/^\/api\/conversations\/([^/]+)\/typing$/);
      if (typing && method === 'POST' && options.live) {
        if (state.typingFailures > 0) {
          state.typingFailures -= 1;
          return failed(options.typingFailureStatus ?? 503, 'TYPING_UNAVAILABLE', 'Typing temporarily unavailable.');
        }
        if (state.holdTyping) {
          state.holdTyping = false;
          await new Promise(resolve => { state.releaseTyping = resolve; });
          if (state.heldTypingFailureStatus) {
            const status = state.heldTypingFailureStatus;
            state.heldTypingFailureStatus = 0;
            return failed(status, 'TYPING_UNAVAILABLE', 'Typing temporarily unavailable.');
          }
        }
        const conversation = state.conversations.find(item => item.id === typing[1]);
        return reply({
          ...body, kind: 'typing', conversation_id: conversation.id, space_id: conversation.space_id, account_id: accountId,
          expires_at: new Date(Date.now() + (body.is_typing ? 8000 : 0)).toISOString(),
        });
      }
      const opening = url.pathname.match(/^\/api\/spaces\/([^/]+)\/conversations$/);
      if (opening && method === 'POST' && body?.kind === 'space') {
        const found = state.conversations.find(item => item.space_id === opening[1] && item.kind === 'space');
        return found ? reply(found) : failed(404, 'NOT_FOUND', 'Space not found.');
      }
      const runRead = url.pathname.match(/^\/api\/agent-runs\/([^/]+)$/);
      if (runRead && method === 'GET') {
        const found = state.runs[runRead[1]];
        if (!found) return failed(404, 'NOT_FOUND', 'Agent request not found.');
        if (state.runReadFailures.length) {
          const status = state.runReadFailures.shift();
          if (status >= 400) {
            state.lastRunReadFailure = status;
            const code = status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : 'SERVICE_UNAVAILABLE';
            return failed(status, code, status >= 500 ? 'Try again.' : 'This private request is no longer available.');
          }
        }
        if (state.holdRunRead) {
          state.holdRunRead = false;
          state.runReadRequested = true;
          await new Promise(resolve => { state.releaseRunRead = resolve; });
        }
        return reply(found);
      }
      const resume = url.pathname.match(/^\/api\/agent-runs\/([^/]+)\/resume$/);
      if (resume && method === 'POST') {
        const found = state.runs[resume[1]];
        if (!found || found.status !== 'waiting_for_user' || body.question_id !== found.question?.id) return failed(409, 'QUESTION_CLOSED', 'This question is closed.');
        const tag = `"${'1'.padStart(64, '0')}"`;
        found.status = 'waiting_for_approval'; found.question = null; found.version = '2'; found.updated_at = '2026-09-19T10:06:00Z';
        found.approval = { id: crypto.randomUUID(), run_id: found.id, space_id: found.space_id, tool_name: 'tasks.update', risk: 'low',
          summary: 'Update the task after you approve.', fields: [{ label: 'Task', value: 'Task 12' }, { label: 'Due date', value: '20 October 2026' }],
          status: 'pending', reason: null, result_ref: null, created_at: found.updated_at, expires_at: '2026-09-19T11:00:00Z',
          decided_at: null, version: '1', etag: tag };
        found.plan.push({ id: 'prepare-update', label: 'Prepare the task update', kind: 'approval', tool: 'tasks.update', status: 'done' });
        return reply(found);
      }
      const approvalAction = url.pathname.match(/^\/api\/agent-approvals\/([^/]+)\/(approve|reject)$/);
      const approvalOwner = approvalAction && Object.values(state.runs).find(item => item.approval?.id === approvalAction[1]);
      if (approvalOwner && method === 'POST') {
        const approval = approvalOwner.approval;
        const idempotency = headers['idempotency-key'];
        if (approvalAction[2] === 'approve' && approval.status !== 'pending' && state.decisions[approval.id] === idempotency) return reply(approvalOwner);
        if (approval.status !== 'pending') return failed(409, 'APPROVAL_DECIDED', 'This action was already decided.');
        if (headers['if-match'] !== approval.etag) return failed(412, 'PRECONDITION_FAILED', 'This action changed. Review it again.');
        approval.status = approvalAction[2] === 'approve' ? 'approved' : 'rejected';
        approval.decided_at = '2026-09-19T10:07:00Z'; approval.version = '2'; approval.etag = `"${'2'.padStart(64, '0')}"`;
        approvalOwner.status = approvalAction[2] === 'approve' ? 'completed' : 'cancelled';
          approvalOwner.outcome = approvalAction[2] === 'approve' ? 'action_completed' : null;
        approvalOwner.answer = approvalAction[2] === 'approve' ? 'Done. Updated Task 12.' : 'Okay. Nothing was changed.';
        approvalOwner.finished_at = approval.decided_at; approvalOwner.updated_at = approval.decided_at; approvalOwner.version = '3';
        if (approvalAction[2] === 'approve') {
          state.decisions[approval.id] = idempotency;
          approval.result_ref = crypto.randomUUID();
          state.created.push({ tool: approval.tool_name, result: approval.result_ref });
          approvalOwner.tool_calls.push({ id: crypto.randomUUID(), sequence: 1, tool_name: approval.tool_name, tool_version: '1',
            effect: 'write', risk: approval.risk, status: 'succeeded', summary: 'Updated Task 12.', result_ref: approval.result_ref,
            error_code: null, approval_id: approval.id, created_at: approval.decided_at });
          approvalOwner.events.push({ sequence: 2, event_type: 'run.completed', summary: 'Task 12 was updated.', created_at: approval.decided_at });
          if (state.loseApprovals > 0) { state.loseApprovals -= 1; throw new TypeError('Synthetic lost response after the change was confirmed'); }
        }
        return reply(approvalOwner);
      }
        if (url.pathname === '/api/conversations' && method === 'GET') return paged(state.conversations, { unread_count: state.conversations.reduce((sum, item) => sum + item.unread_count, 0) });
      const match = url.pathname.match(/^\/api\/conversations\/([^/]+)(\/messages|\/read)?$/);
      const conversation = match && state.conversations.find(item => item.id === match[1]);
      if (match && !conversation) return failed(404, 'NOT_FOUND', 'Conversation not found.');
      if (conversation && !match[2] && method === 'GET') return reply(conversation);
      if (conversation && match[2] === '/messages' && method === 'GET') {
        // The newest page, or the page before or after a position, as the API returns them.
        const all = state.messages[conversation.id];
        const limit = Number(url.searchParams.get('limit') ?? 30);
        const after = url.searchParams.get('after');
        const before = url.searchParams.get('before');
        const range = after !== null ? all.filter(item => Number(item.position) > Number(after))
          : before !== null ? all.filter(item => Number(item.position) < Number(before)) : all;
        const page = after !== null ? range.slice(0, limit) : range.slice(Math.max(0, range.length - limit));
        const more = range.length > limit;
        for (const item of page) state.served.add(Number(item.position));
        const cursor = more ? (after !== null ? page[page.length - 1].position : page[0].position) : null;
        return paged(page, { pagination: { next_cursor: cursor, has_more: more } });
      }
      if (conversation && match[2] === '/messages' && method === 'POST') {
        if (state.failSends > 0) { state.failSends -= 1; throw new TypeError('Synthetic connection loss before the server'); }
        const key = headers['idempotency-key'];
        const existing = state.messages[conversation.id].find(item => item.client_message_id === key);
        if (existing) return reply(existing);
        const position = String(Number(conversation.last_position) + 1);
        const original = body.reply_to_message_id && state.messages[conversation.id].find(item => item.id === body.reply_to_message_id);
        const saved = {
          id: crypto.randomUUID(), conversation_id: conversation.id, position, sender_account_id: accountId,
          sender_name: 'Alex Morgan', mine: true, client_message_id: key, status: 'sent', body: body.body,
          created_at: options.sentAt ?? '2026-09-19T10:05:00Z', deleted_at: null,
          ...(original ? { reply_to: { message_id: original.id, status: 'sent', position: original.position, sender_name: original.sender_name, excerpt: original.body } } : {}),
        };
        // An @agent message is answered before the send returns; options.agent lists what becomes of each (DEC-046).
        const outcome = /(?<![\w@.])@agent\b/i.test(body.body) ? state.agent.shift() : undefined;
        if (outcome) {
          const runId = ['answered', 'private', 'waiting'].includes(outcome) ? crypto.randomUUID() : null;
          saved.agent_request = { status: outcome, run_id: runId };
          if (runId && ['private', 'waiting'].includes(outcome)) {
            const now = saved.created_at;
            const privateRun = {
              id: runId, space_id: conversation.space_id, message: body.body, status: outcome === 'waiting' ? 'waiting_for_user' : 'completed',
              outcome: outcome === 'waiting' ? null : 'answered', stop_reason: null, intent: outcome === 'waiting' ? 'create_task' : 'list_tasks',
              answer: outcome === 'waiting' ? null : '1. Task 12 is due tomorrow. `Task details` stay plain text.',
              question: outcome === 'waiting' ? { id: crypto.randomUUID(), text: 'Which task should I update?', expires_at: '2026-09-19T11:00:00Z' } : null,
              approval: null,
              plan: [{ id: 'read-private', label: 'Read Task 12', kind: 'tool', tool: 'tasks.list', status: 'done' }],
              tool_calls: outcome === 'waiting' ? [] : [{ id: crypto.randomUUID(), sequence: 1, tool_name: 'tasks.list', tool_version: '1', effect: 'read', risk: 'low', status: 'succeeded',
                summary: 'Read the authorized task.', result_ref: '10000000-0000-4000-9000-000000000099', error_code: null, approval_id: null, created_at: now }],
              evidence: outcome === 'waiting' ? [] : [{ kind: 'task', ref: '10000000-0000-4000-9000-000000000099', label: 'Task 12: Water the plants' }],
              events: [{ sequence: 1, event_type: outcome === 'waiting' ? 'run.waiting_for_user' : 'run.completed', summary: 'The private request was recorded.', created_at: now }],
              created_at: now, updated_at: now, finished_at: outcome === 'waiting' ? null : now, version: '1',
            };
            state.runs[runId] = privateRun;
          }
        }
        state.messages[conversation.id].push(saved);
        Object.assign(conversation, { last_position: position, read_position: position, last_message_at: saved.created_at });
        if (outcome === 'answered') answer(conversation, saved);
        return reply(saved);
      }
      if (conversation && match[2] === '/read' && method === 'POST') {
        if (state.failReads > 0) { state.failReads -= 1; throw new TypeError('Synthetic lost read receipt'); }
        const through = Number(body.through_position);
        const unseen = state.messages[conversation.id].filter(item => Number(item.position) <= through && !state.served.has(Number(item.position))).length;
        state.reads.push({ through, unseen });
        conversation.read_position = body.through_position;
        conversation.unread_count = Number(conversation.last_position) - Number(body.through_position);
        return reply(conversation);
      }
      // Edits and reactions (T162): each change raises the revision, as the API does.
      const sharing = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/agent\/share$/);
      const sharedMessage = sharing && state.messages[sharing[1]]?.find(item => item.id === sharing[2]);
      if (sharedMessage && method === 'POST') {
        // DEC-061: options.shareRefusal is the API's refusal; otherwise the private answer is shown to everyone once.
        if (options.shareRefusal) return failed(409, options.shareRefusal, 'Refused.');
        if (sharedMessage.agent_request?.status === 'private') {
          sharedMessage.agent_request = { ...sharedMessage.agent_request, status: 'answered' };
          sharedMessage.revision = (sharedMessage.revision ?? 1) + 1;
          answer(state.conversations.find(item => item.id === sharing[1]), sharedMessage);
        }
        return reply(sharedMessage);
      }
      const action = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/(edit|reactions|agent)$/);
      const deletion = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/delete$/);
      const deletedMessage = deletion && state.messages[deletion[1]]?.find(item => item.id === deletion[2]);
      if (deletedMessage && method === 'POST') {
        Object.assign(deletedMessage, { status: 'deleted', body: null, deleted_at: '2026-09-19T10:08:00Z', reactions: [], revision: (deletedMessage.revision ?? 1) + 1 });
        return reply(deletedMessage);
      }
      const target = action && state.messages[action[1]]?.find(item => item.id === action[2]);
      if (target && method === 'POST' && action[3] === 'agent') {
        // Asking again answers a request that got no answer, and changes nothing otherwise.
        if (['pending', 'failed'].includes(target.agent_request?.status)) {
          target.agent_request = { status: 'answered', run_id: crypto.randomUUID() };
          answer(state.conversations.find(item => item.id === action[1]), target);
        }
        return reply(target);
      }
      if (target && method === 'POST') {
        const order = ['like', 'love', 'laugh', 'wow', 'sad', 'thanks'];
        if (action[3] === 'edit') Object.assign(target, { body: body.body, edited_at: '2026-09-19T10:06:00Z' });
        else {
          const reactions = (target.reactions ?? []).filter(item => item.reaction !== body.reaction);
          if (body.on) reactions.push({ reaction: body.reaction, count: 1, mine: true });
          target.reactions = reactions.sort((left, right) => order.indexOf(left.reaction) - order.indexOf(right.reaction));
        }
        target.revision = (target.revision ?? 1) + 1;
        return reply(target);
      }
      throw new Error(`Offline fixture has no endpoint for ${method} ${url.pathname}`);
    };
  }, {
    accountId, otherId, agentId, options,
    chats: [{ id: familyChatId, spaceId: familySpaceId, title: 'Morgan family' }, { id: clubChatId, spaceId: clubSpaceId, title: 'Garden club' }],
  });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(props => window.renderMessagingFixture(props), options.screen ?? {});
  await page.getByRole('button', { name: options.directTyping ? /^Sam Rivera/ : /^Morgan family/ }).waitFor();
  return { page, outbound, errors, pane: page.getByRole('region', { name: 'Conversation', exact: true }) };
}

async function openTypingChat(context, options = {}) {
  const result = await fixture(context, { live: true, ...options });
  await result.page.getByRole('button', { name: /^Morgan family/ }).click();
  await result.page.waitForFunction(space => window.messagingFixture.calls.some(call => call.route === `/api/spaces/${space}/members`), familySpaceId);
  await result.pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
  return result;
}

test('typing publishes only metadata, coalesces keystrokes, follows mentions and stops on blur, idle and send', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, outbound, errors } = await openTypingChat(context);
    const input = pane.getByLabel('Message', { exact: true });
    const calls = () => page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')));
    assert.equal((await calls()).length, 0, 'Opening and focusing a chat do not imply typing.');
    await input.fill('Private draft one');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 1);
    const first = (await calls())[0];
    assert.deepEqual(first.body, {
      client_id: first.body.client_id, sequence: 1, is_typing: true, mentioned_account_ids: [], mentions_agent: false,
    });
    await input.fill('Private draft two');
    await input.fill('@Sam Rivera @agent help with a private draft');
    assert.equal((await calls()).length, 1, 'Keystrokes do not each send a request.');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 2);
    const mentioned = (await calls())[1];
    assert.deepEqual(mentioned.body.mentioned_account_ids, [otherId]);
    assert.equal(mentioned.body.mentions_agent, true);
    assert.equal(mentioned.body.sequence, 2);
    assert.equal(mentioned.body.client_id, first.body.client_id);
    assert.equal(JSON.stringify(await calls()).includes('private draft'), false);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call =>
      call.method === 'POST' && (call.route.endsWith('/messages') || call.route.includes('/agent-runs'))).length), 0);

    await input.blur();
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false);
    assert.deepEqual((await calls()).at(-1).body.mentioned_account_ids, []);
    assert.equal((await calls()).at(-1).body.mentions_agent, false);
    await input.fill('An idle draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === true);
    const beforeIdle = (await calls()).length;
    await page.waitForFunction(count => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length > count
      && window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1).body.is_typing === false, beforeIdle, { timeout: 6000 });
    assert.equal(await input.inputValue(), 'An idle draft', 'Stopping the animation never discards a draft.');
    await input.fill('Send this ordinary message');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText('Send this ordinary message', { exact: true }).waitFor();
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a stop survives a slow start response, repeated stop calls and switching conversations', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors } = await openTypingChat(context, { holdTyping: true });
    await pane.getByLabel('Message', { exact: true }).fill('Send while typing is pending');
    await page.waitForFunction(() => typeof window.messagingFixture.releaseTyping === 'function');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText('Send while typing is pending', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), 1);
    await page.evaluate(() => window.messagingFixture.releaseTyping());
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 2);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1).body.is_typing), false);
    await pane.getByLabel('Message', { exact: true }).fill('Leave this chat');
    await page.getByRole('button', { name: /^Garden club/ }).evaluate(element => element.click());
    await pane.getByRole('heading', { name: 'Garden club', exact: true }).waitFor();
    await page.waitForFunction(chat => window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/typing`).at(-1)?.body.is_typing === false, familyChatId);
    assert.equal(await pane.getByLabel('Message', { exact: true }).inputValue(), '');
    await page.evaluate(() => window.messagingFixture.emitTyping());
    assert.equal(await pane.getByText('Sam Rivera is typing', { exact: true }).count(), 0, 'Previous-chat activity stays out of the new chat.');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('typing shows the correct people and mentions, isolates sources, ignores stale updates and clears on access changes', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await openTypingChat(context);
    const status = pane.getByRole('status', { name: 'Typing activity' });
    for (const wrong of [
      { account_id: accountId }, { conversation_id: clubChatId }, { space_id: clubSpaceId },
      { expires_at: '2000-01-01T00:00:00Z' },
    ]) await page.evaluate(value => window.messagingFixture.emitTyping(value), wrong);
    assert.equal(await status.locator('p').count(), 0);
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 2 }));
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    await page.evaluate(id => window.messagingFixture.emitTyping({ sequence: 3, mentioned_account_ids: [id], mentions_agent: true }), accountId);
    await status.getByText('Sam Rivera is typing, mentioning @Alex Morgan and @agent', { exact: true }).waitFor();
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 2 }));
    assert.equal(await status.getByText('Sam Rivera is typing, mentioning @Alex Morgan and @agent', { exact: true }).count(), 1);
    await page.evaluate(id => window.messagingFixture.emitTyping({ client_id: id, sequence: 1 }), clubChatId);
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    assert.equal(await status.locator('p').count(), 1, 'Two tabs still name one person.');
    await page.evaluate(id => window.messagingFixture.emitTyping({ client_id: id, sequence: 2, is_typing: false }), clubChatId);
    await status.getByText('Sam Rivera is typing, mentioning @Alex Morgan and @agent', { exact: true }).waitFor();
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 4, is_typing: false }));
    await status.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 3 }));
    assert.equal(await status.locator('p').count(), 0, 'An old start cannot revive a stopped source.');
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 5 }));
    await status.waitFor();
    await page.evaluate(({ chat, space }) => window.messagingFixture.emitLive('change', {
      kind: 'conversation', conversation_id: chat, space_id: space, reason: 'access',
    }), { chat: familyChatId, space: familySpaceId });
    await status.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 6 }));
    await status.waitFor();
    await page.evaluate(() => window.messagingFixture.emitLive('resync', {}));
    await status.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('typing expires without a stop and disappears immediately when the live connection is lost', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors } = await openTypingChat(context);
    const status = pane.getByRole('status', { name: 'Typing activity' });
    await page.evaluate(() => window.messagingFixture.emitTyping({ expires_at: new Date(Date.now() + 60000).toISOString() }));
    await status.waitFor();
    const started = Date.now();
    await status.waitFor({ state: 'hidden', timeout: 9500 });
    assert.ok(Date.now() - started <= 8500, 'An oversized server expiry is capped at eight seconds, plus the 250 ms cleanup tick.');
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 2 }));
    await status.waitFor();
    await page.evaluate(() => {
      for (const controller of window.messagingFixture.liveControllers) controller.close();
      window.messagingFixture.liveControllers.clear();
    });
    await status.waitFor({ state: 'hidden', timeout: 1000 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('typing waits for the first roster without delaying messages or replaying early presence', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await openTypingChat(context, { holdRoster: true });
    await page.waitForFunction(() => typeof window.messagingFixture.releaseRoster === 'function');
    const input = pane.getByLabel('Message', { exact: true });
    const status = pane.getByRole('status', { name: 'Typing activity' });
    await page.evaluate(() => window.messagingFixture.emitTyping());
    await input.fill('Message while names are loading');
    assert.equal(await status.locator('p').count(), 0);
    assert.equal(await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), 0);
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText('Message while names are loading', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), 0);
    await page.evaluate(async () => { window.messagingFixture.releaseRoster(); await window.refreshTypingRoster(); });
    await input.fill('Fresh draft after the roster');
    await page.waitForFunction(() => window.messagingFixture.calls.some(call => call.route.endsWith('/typing') && call.body.is_typing));
    assert.equal(await status.locator('p').count(), 0);
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 2 }));
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/messages')).length), 1);
    await input.blur();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('typing keeps its source and visible names through an unchanged background roster refresh', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await openTypingChat(context);
    const input = pane.getByLabel('Message', { exact: true });
    const status = pane.getByRole('status', { name: 'Typing activity' });
    await page.evaluate(() => window.messagingFixture.emitTyping());
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    await input.fill('First draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 1);
    await page.evaluate(() => {
      window.messagingFixture.holdRoster = true;
      window.pendingRosterRefresh = window.refreshTypingRoster();
    });
    await page.waitForFunction(() => typeof window.messagingFixture.releaseRoster === 'function');
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    await input.fill('Draft while the roster refreshes');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 2);
    await page.evaluate(async () => { window.messagingFixture.releaseRoster(); await window.pendingRosterRefresh; });
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    const calls = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')));
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.body.is_typing));
    assert.equal(calls[0].body.client_id, calls[1].body.client_id);
    assert.deepEqual(calls.map(call => call.body.sequence), [1, 2]);
    assert.equal(await input.inputValue(), 'Draft while the roster refreshes');
    await input.blur();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('typing in a direct chat uses its two participants without a Space roster read', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await fixture(context, { live: true, directTyping: true });
    await page.evaluate(() => { window.messagingFixture.rosterFailure = 403; });
    await page.getByRole('button', { name: /^Sam Rivera/ }).click();
    await pane.getByRole('heading', { name: 'Sam Rivera', exact: true }).waitFor();
    const input = pane.getByLabel('Message', { exact: true });
    await input.fill('@Sam Rivera this remains a private draft');
    await page.waitForFunction(() => window.messagingFixture.calls.some(call => call.route.endsWith('/typing')));
    await page.evaluate(id => window.messagingFixture.emitTyping({ mentioned_account_ids: [id] }), accountId);
    await pane.getByRole('status', { name: 'Typing activity' }).getByText('Sam Rivera is typing, mentioning @Alex Morgan', { exact: true }).waitFor();
    const observed = await page.evaluate(() => ({ typing: window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')),
      roster: window.messagingFixture.calls.filter(call => /^\/api\/spaces\/[^/]+\/members$/.test(call.route)) }));
    assert.equal(observed.roster.length, 0);
    assert.deepEqual(observed.typing[0].body.mentioned_account_ids, [otherId]);
    assert.equal(JSON.stringify(observed.typing).includes('private draft'), false);
    assert.equal(await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).count(), 0);
    await input.blur();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

for (const failureStatus of [403, 503]) test(`typing roster failure (${failureStatus}) hides cached names and pauses metadata without blocking messages`, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await openTypingChat(context);
    const input = pane.getByLabel('Message', { exact: true });
    const status = pane.getByRole('status', { name: 'Typing activity' });
    await page.evaluate(id => window.messagingFixture.emitTyping({ mentioned_account_ids: [id], mentions_agent: true }), accountId);
    await status.getByText('Sam Rivera is typing, mentioning @Alex Morgan and @agent', { exact: true }).waitFor();
    await input.fill('Keep this draft');
    await page.waitForFunction(() => window.messagingFixture.calls.some(call => call.route.endsWith('/typing') && call.body.is_typing));
    await page.evaluate(async code => {
      window.messagingFixture.rosterFailure = code;
      await window.refreshTypingRoster();
    }, failureStatus);
    await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).waitFor();
    assert.equal(await status.locator('p').count(), 0, 'Failed roster reads must hide cached names and mentions.');
    assert.equal(await input.inputValue(), 'Keep this draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false);
    const activeBefore = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing') && call.body.is_typing).length);
    await input.fill('Keep this ordinary message');
    await page.evaluate(id => window.messagingFixture.emitTyping({ sequence: 2, mentioned_account_ids: [id], mentions_agent: true }), accountId);
    assert.equal(await status.locator('p').count(), 0);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing') && call.body.is_typing).length), activeBefore);
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText('Keep this ordinary message', { exact: true }).waitFor();
    const sent = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/messages')));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.body, 'Keep this ordinary message');
    await page.evaluate(async () => {
      window.messagingFixture.rosterFailure = 0;
      await window.refreshTypingRoster();
    });
    await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await status.locator('p').count(), 0, 'A recovered roster must not revive cached presence.');
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 3 }));
    await status.getByText('Sam Rivera is typing', { exact: true }).waitFor();
    await input.fill('Fresh activity after recovery');
    await page.waitForFunction(count => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing') && call.body.is_typing).length > count, activeBefore);
    await input.blur();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

for (const stopRejected of [false, true]) test(`typing roster cleanup preserves its queued Stop after a delayed 429 (${stopRejected ? 'rate-limited Stop' : 'accepted Stop'})`, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors, outbound } = await openTypingChat(context, { typingFailureStatus: 429 });
    const input = pane.getByLabel('Message', { exact: true });
    await input.fill('@Sam Rivera @agent first private draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length === 1);
    await page.evaluate(() => {
      window.messagingFixture.holdTyping = true;
      window.messagingFixture.heldTypingFailureStatus = 429;
    });
    await input.fill('@Sam Rivera @agent second private draft');
    await page.waitForFunction(() => typeof window.messagingFixture.releaseTyping === 'function');
    await page.evaluate(async rejected => {
      window.messagingFixture.rosterFailure = 503;
      await window.refreshTypingRoster();
      if (rejected) window.messagingFixture.typingFailures = 1;
    }, stopRejected);
    await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), 2);
    await page.evaluate(() => window.messagingFixture.releaseTyping());
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false,
      undefined, { timeout: 2000 });
    const calls = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => call.body.sequence), [1, 2, 3]);
    assert.equal(new Set(calls.map(call => call.body.client_id)).size, 1);
    assert.deepEqual(calls[2].body, { client_id: calls[0].body.client_id, sequence: 3, is_typing: false, mentioned_account_ids: [], mentions_agent: false });
    assert.equal(JSON.stringify(calls).includes('private draft'), false);
    await input.fill('An ordinary message after the limit');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText('An ordinary message after the limit', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), 3);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/messages')).length), 1);
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
  } finally { await context.close(); }
});

test('clearing a draft and hiding the tab stop typing without sending or exposing a hidden draft', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors } = await openTypingChat(context);
    const input = pane.getByLabel('Message', { exact: true });
    await input.fill('Clear this draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === true);
    await input.fill('');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false);
    await input.fill('Keep this hidden draft');
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === true);
    await page.evaluate(() => {
      window.messagingFixture.emitTyping();
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).at(-1)?.body.is_typing === false);
    await page.evaluate(() => window.messagingFixture.emitTyping({ sequence: 2 }));
    assert.equal(await pane.getByRole('status', { name: 'Typing activity' }).locator('p').count(), 0);
    assert.equal(await input.inputValue(), 'Keep this hidden draft');
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/messages')).length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const failureStatus of [404, 429, 503]) test(`typing failure (${failureStatus}) is visible without losing the draft or preventing a message`, async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pane, errors } = await openTypingChat(context, { typingFailures: 1, typingFailureStatus: failureStatus });
    const input = pane.getByLabel('Message', { exact: true });
    await input.fill('Keep my message');
    await pane.getByText('Live typing is temporarily unavailable. You can still send messages.', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'Keep my message');
    if (failureStatus === 429) {
      const before = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length);
      await input.fill('Keep my message after a rate limit');
      assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/typing')).length), before);
    }
    const expected = await input.inputValue();
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText(expected, { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const reducedMotion of ['no-preference', 'reduce']) test(`typing names wrap at 320 px and 200% text with ${reducedMotion} motion`, async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, reducedMotion });
  try {
    const name = 'Sam Rivera With A Very Long Display Name';
    const { page, pane, errors } = await openTypingChat(context, { members: [
      { account_id: accountId, display_name: 'Alex Morgan' }, { account_id: otherId, display_name: name },
      { account_id: agentId, display_name: 'Priya Rao' },
    ] });
    await page.evaluate(id => window.messagingFixture.emitTyping({ mentioned_account_ids: [id], mentions_agent: true }), accountId);
    const status = pane.getByRole('status', { name: 'Typing activity' });
    await status.waitFor();
    await page.evaluate(id => window.messagingFixture.emitTyping({ account_id: id, client_id: id }), agentId);
    await status.getByText('Priya Rao is typing', { exact: true }).waitFor();
    const before = await status.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
    const after = await status.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(after >= before * 2, 'Typing text actually doubles in size.');
    assert.equal(await status.getAttribute('aria-live'), 'polite');
    const animations = await status.locator('[aria-hidden="true"] > span').evaluateAll(dots => dots.map(dot => getComputedStyle(dot).animationName));
    assert.equal(animations.length, 6);
    assert.ok(animations.every(name => reducedMotion === 'reduce' ? name === 'none' : name !== 'none'));
    const box = await status.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 800, JSON.stringify(box));
    assert.equal(await status.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const send = await pane.getByRole('button', { name: 'Send', exact: true }).boundingBox();
    assert.ok(send.width >= 44 && send.height >= 44 && send.y >= 0 && send.y + send.height <= 800, JSON.stringify(send));
    assert.equal(await pane.getByRole('button', { name: 'Send', exact: true }).evaluate(element => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), true, 'The composer is not clipped behind the footer.');
    await status.focus();
    await status.press('End');
    await page.waitForFunction(() => document.querySelector('[aria-label="Typing activity"]').scrollTop > 0);
    await status.press('Home');
    await page.waitForFunction(() => document.querySelector('[aria-label="Typing activity"]').scrollTop === 0);
    await status.blur();
    await page.screenshot({ path: path.join(root, `.local/screenshots/messaging-typing-320-large-${reducedMotion}.png`), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const agentOn of [true, false]) test(`Ask Agent opens the Space chat ${agentOn ? 'with "@agent " ready in the focused composer' : 'with an empty composer when the agent is off'}, sending nothing`, async () => {
  // Wide enough to keep the conversation list beside the open chat, so the test can switch chats.
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 } });
  try {
    const { page, pane, outbound, errors } = await fixture(context, {
      screen: { initialSpaceId: familySpaceId, askAgent: true },
      spaces: [{ id: familySpaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active',
        role: 'owner', version: '1', created_at: '2026-09-19T10:00:00Z', agent_enabled: agentOn }],
    });
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.waitFor();
    if (agentOn) {
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-labelledby') === 'composer-label');
      assert.equal(await composer.inputValue(), '@agent ');
      assert.deepEqual(await composer.evaluate(element => [element.selectionStart, element.selectionEnd]), [7, 7]);
      // Leaving and returning does not refill a draft the person did not keep.
      await composer.fill('');
      await page.getByRole('button', { name: /^Garden club/ }).click();
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      assert.equal(await pane.getByLabel('Message', { exact: true }).inputValue(), '');
    } else {
      assert.equal(await composer.inputValue(), '');
    }
    assert.deepEqual(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method !== 'GET').map(call => call.route)), [`/api/spaces/${'359bd05a-c95c-4975-b061-d647e82a6958'}/conversations`]);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const width of [1440, 320]) test(`choosing a Space shows its header once with Chat marked before any chat opens, and nothing is sent (${width} px)`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
    const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
    const { page, outbound, errors } = await fixture(context, { spaces: [{
      id: spaceId, name: 'Morgan family', description: '', space_type: 'family', visibility: 'private', status: 'active', role: 'owner',
      version: '1', created_at: '2026-09-19T10:00:00Z', member_count: 3, member_preview: ['Sam Rivera', 'Priya Rao'], agent_enabled: true,
    }] });
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'Morgan family' });
    const header = page.getByRole('region', { name: 'Morgan family Space', exact: true });
    await header.getByText('3 members: Sam Rivera, Priya Rao', { exact: true }).waitFor();
    // The phone list and the wide conversation pane each have a copy, but only one is ever shown.
    assert.equal(await header.count(), 1);
    assert.equal(await header.locator('a[aria-current="page"]').getAttribute('aria-label'), 'Chat for Morgan family');
    // The chat is this page, so the header offers no separate Ask Agent link.
    assert.equal(await header.getByRole('link', { name: 'Ask Agent', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.every(call => call.method === 'GET')), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an open Space chat offers the Space sections in a More menu that fits 320 px and closes with Escape', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
  try {
    const { page, pane, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    const more = pane.getByRole('button', { name: 'More for Morgan family', exact: true });
    await more.waitFor();
    const box = await more.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 44, JSON.stringify(box));
    await more.click();
    const menu = page.getByRole('menu');
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole('menuitem').evaluateAll(items => items.map(item => [item.textContent.trim(), item.getAttribute('href')])), [
      ['Tasks', `/app/tasks?space_id=${familySpaceId}`],
      ['Events', `/app/events?space_id=${familySpaceId}`],
      ['Documents', `/app/documents?space_id=${familySpaceId}`],
      ['Polls', `/app/polls?space_id=${familySpaceId}`],
      ['Agent tasks', `/app/agent/tasks?space_id=${familySpaceId}`],
    ]);
    for (const item of await menu.getByRole('menuitem').all()) {
      const itemBox = await item.boundingBox();
      assert.ok(itemBox.x >= 0 && itemBox.x + itemBox.width <= 320 && itemBox.height >= 44, JSON.stringify(itemBox));
    }
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await more.evaluate(element => element === document.activeElement), true);
    for (const control of [pane.getByLabel('Message', { exact: true }), pane.getByRole('button', { name: 'Send', exact: true })]) {
      const controlBox = await control.boundingBox();
      assert.ok(controlBox.y + controlBox.height <= 720, JSON.stringify(controlBox));
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('chat workspace: the thread scrolls independently and keeps the composer visible on desktop and mobile', async () => {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 720]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      const { page, pane, outbound, errors } = await fixture(context, { history: 45 });
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      await pane.getByText('Earlier message 45', { exact: true }).waitFor();
      const list = pane.locator('ol');
      const geometry = await list.evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight, top: element.scrollTop }));
      assert.ok(geometry.height >= 120 && geometry.content > geometry.height && geometry.top > 0, JSON.stringify(geometry));
      for (const control of [pane.getByLabel('Message', { exact: true }), pane.getByRole('button', { name: 'Send', exact: true })]) {
        const box = await control.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, JSON.stringify({ width, box }));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, `.local/screenshots/chat-workspace-${width}.png`) });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('chat workspace: incoming messages preserve reading position until Latest messages is chosen', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    const { page, pane, outbound, errors } = await fixture(context, { history: 45 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Earlier message 45', { exact: true }).waitFor();
    const list = pane.locator('ol');
    await list.evaluate(element => { element.scrollTop = 80; element.dispatchEvent(new Event('scroll')); });
    const before = await list.evaluate(element => element.scrollTop);
    await page.evaluate(({ chat, otherId }) => {
      const state = window.messagingFixture;
      const conversation = state.conversations.find(item => item.id === chat);
      state.messages[chat].push({ id: crypto.randomUUID(), conversation_id: chat, position: '46', sender_account_id: otherId,
        sender_name: 'Sam Rivera', mine: false, client_message_id: null, status: 'sent', body: 'New message while reading',
        created_at: '2026-09-19T10:10:00Z', deleted_at: null });
      Object.assign(conversation, { last_position: '46', last_message_at: '2026-09-19T10:10:00Z' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, { chat: familyChatId, otherId });
    await pane.getByText('New message while reading', { exact: true }).waitFor();
    await pane.getByRole('button', { name: 'Latest messages', exact: true }).waitFor();
    assert.ok(Math.abs(await list.evaluate(element => element.scrollTop) - before) <= 2);
    await pane.getByRole('button', { name: 'Latest messages', exact: true }).click();
    assert.equal(await list.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight < 2), true);
    assert.equal(await pane.getByRole('button', { name: 'Latest messages', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/messages')).length), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline chat keeps an unconfirmed send and its retry across conversation switches', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { failSends: 1 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await pane.getByLabel('Message', { exact: true }).fill('  Dinner at seven\n');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByText(lostRetry, { exact: true }).waitFor();

    await page.getByRole('button', { name: /^Garden club/ }).click();
    await pane.getByRole('heading', { name: 'Garden club', exact: true }).waitFor();
    assert.equal(await pane.getByText(lostRetry, { exact: true }).count(), 0, 'Another conversation must not show the unconfirmed send.');
    await page.screenshot({ path: path.join(root, '.local/screenshots/messaging-offline-unconfirmed.png'), fullPage: true });

    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await pane.getByText(lostRetry, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /^Morgan family/ }).filter({ hasText: 'Not confirmed' }).waitFor();
    await pane.getByRole('button', { name: 'Retry', exact: true }).click();
    await pane.getByRole('button', { name: 'Delete message for everyone', exact: true }).waitFor();
    await pane.getByText(lostRetry, { exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /^Morgan family/ }).filter({ hasText: 'Not confirmed' }).waitFor({ state: 'detached' });

    const observed = await page.evaluate(chat => ({
      sends: window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/messages` && call.method === 'POST'),
      stored: window.messagingFixture.messages[chat],
    }), familyChatId);
    assert.equal(observed.sends.length, 2);
    assert.equal(observed.sends[0].headers['idempotency-key'], observed.sends[1].headers['idempotency-key']);
    assert.deepEqual(observed.sends[0].body, { body: 'Dinner at seven' });
    assert.deepEqual(observed.sends[1].body, observed.sends[0].body);
    assert.deepEqual(observed.stored.map(item => item.body), ['Dinner at seven']);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline chat retries a read receipt that failed', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { unread: true, failReads: 1 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Bring the plates', { exact: true }).waitFor();
    await page.waitForFunction(chat => window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/read`).length >= 2,
      familyChatId, { timeout: 20000 });
    const observed = await page.evaluate(chat => ({
      reads: window.messagingFixture.calls.filter(call => call.route === `/api/conversations/${chat}/read`).map(call => call.body),
      conversation: window.messagingFixture.conversations.find(item => item.id === chat),
    }), familyChatId);
    assert.deepEqual(observed.reads.slice(0, 2), [{ through_position: '2' }, { through_position: '2' }]);
    assert.equal(observed.conversation.read_position, '2');
    assert.equal(observed.conversation.unread_count, 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('offline chat shows every message after a long absence and marks read only what it fetched', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { unread: true });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('Bring the plates', { exact: true }).waitFor();
    // 400 messages arrive between two polls: more than the newest page plus ten pages of thirty.
    await page.evaluate(({ chat, otherId }) => {
      const state = window.messagingFixture;
      const conversation = state.conversations.find(item => item.id === chat);
      for (let index = 1; index <= 400; index += 1) {
        const position = String(Number(conversation.last_position) + 1);
        state.messages[chat].push({
          id: crypto.randomUUID(), conversation_id: chat, position, sender_account_id: otherId, sender_name: 'Sam Rivera',
          mine: false, client_message_id: null, status: 'sent', body: `Update ${index}`, created_at: '2026-09-19T11:00:00Z', deleted_at: null,
        });
        Object.assign(conversation, { last_position: position, last_message_at: '2026-09-19T11:00:00Z' });
      }
      conversation.unread_count = Number(conversation.last_position) - Number(conversation.read_position);
    }, { chat: familyChatId, otherId });

    await pane.getByText('Update 400', { exact: true }).waitFor({ timeout: 30000 });
    await page.waitForFunction(chat => window.messagingFixture.conversations.find(item => item.id === chat).read_position === '402', familyChatId, { timeout: 15000 });
    const shown = await pane.locator('li p').allInnerTexts();
    const missing = Array.from({ length: 400 }, (_value, index) => `Update ${index + 1}`).filter(text => !shown.includes(text));
    assert.deepEqual(missing, [], 'Every message that arrived must be shown.');
    const reads = await page.evaluate(() => window.messagingFixture.reads);
    assert.ok(reads.length >= 2);
    assert.deepEqual(reads.filter(read => read.unseen > 0), [], 'A read receipt must not cover messages that were never fetched.');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the delete control and its confirmation take the 44 px target without covering the message, at 320 px and 200% text', async () => {
  const text = 'Dinner at seven, and please bring the folding chairs from the garage';
  for (const large of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    try {
      const { page, outbound, errors, pane } = await fixture(context);
      if (large) await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
      await pane.getByLabel('Message', { exact: true }).fill(text);
      await pane.getByRole('button', { name: 'Send', exact: true }).click();
      const remove = pane.getByRole('button', { name: 'Delete message for everyone', exact: true });
      await remove.waitFor();
      const button = await remove.boundingBox();
      const body = await pane.getByText(text, { exact: true }).boundingBox();
      assert.ok(button.width >= 44 && button.height >= 44, `The delete button is ${button.width} by ${button.height} px.`);
      const covers = button.x < body.x + body.width && body.x < button.x + button.width && button.y < body.y + body.height && body.y < button.y + button.height;
      assert.equal(covers, false, 'The delete button must not cover the message text.');
      if (large) await page.screenshot({ path: path.join(root, '.local/screenshots/messaging-delete-320-large-text.png'), fullPage: true });
      await remove.click();
      const choices = await pane.getByRole('group', { name: 'Confirm deletion', exact: true }).getByRole('button').all();
      assert.equal(choices.length, 2);
      for (const choice of choices) assert.ok((await choice.boundingBox()).height >= 44, `${await choice.innerText()} is at least 44 px tall.`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
      if (large) await page.screenshot({ path: path.join(root, '.local/screenshots/messaging-delete-confirm-320-large-text.png'), fullPage: true });
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('a reply quotes its original, a reaction and an edit are saved, and every control fits at 320 px and 200% text (T162)', async () => {
  for (const large of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    try {
      const { page, outbound, errors, pane } = await fixture(context, { unread: true, sentAt: new Date().toISOString() });
      if (large) await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      await pane.getByText('Bring the plates', { exact: true }).waitFor();

      await pane.getByRole('button', { name: 'Reply to Sam Rivera' }).last().click();
      await pane.getByRole('status').filter({ hasText: 'Replying to Sam Rivera' }).waitFor();
      await pane.getByLabel('Message', { exact: true }).fill('I will bring six');
      await pane.getByRole('button', { name: 'Send', exact: true }).click();
      const mine = pane.getByRole('listitem').filter({ hasText: 'I will bring six' });
      await mine.getByText('Bring the plates').waitFor();
      assert.equal(await pane.getByRole('status').filter({ hasText: 'Replying to' }).count(), 0, 'The reply bar closes after sending.');

      await mine.getByRole('button', { name: 'React', exact: true }).click();
      await mine.getByRole('group', { name: 'Choose a reaction' }).getByRole('button', { name: 'Thanks', exact: true }).click();
      const chosen = mine.getByRole('group', { name: 'Reactions', exact: true }).getByRole('button', { name: 'Thanks: 1, including you' });
      await chosen.waitFor();
      assert.equal(await chosen.getAttribute('aria-pressed'), 'true');

      await mine.getByRole('button', { name: 'Edit message', exact: true }).click();
      // While it is edited, the text lives in the editor, so the message is found by its editor.
      const editing = pane.getByRole('listitem').filter({ has: page.getByLabel('Edit your message') });
      await editing.getByLabel('Edit your message').fill('I will bring eight');
      await editing.getByRole('button', { name: 'Save', exact: true }).click();
      const edited = pane.getByRole('listitem').filter({ hasText: 'I will bring eight' });
      await edited.getByText('Edited', { exact: true }).waitFor();

      for (const control of await edited.getByRole('button').all()) {
        const box = await control.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${await control.getAttribute('aria-label')} is ${box.width} by ${box.height} px.`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
      if (large) await page.screenshot({ path: path.join(root, '.local/screenshots/messaging-reply-react-edit-320-large-text.png'), fullPage: true });

      const sent = await page.evaluate(chat => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.startsWith(`/api/conversations/${chat}/messages`)).map(call => ({ route: call.route.split('/').slice(-1)[0], body: call.body })), familyChatId);
      assert.equal(sent[0].route, 'messages');
      assert.equal(sent[0].body.body, 'I will bring six');
      assert.match(sent[0].body.reply_to_message_id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(sent.slice(1), [{ route: 'reactions', body: { reaction: 'thanks', on: true } }, { route: 'edit', body: { body: 'I will bring eight' } }]);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('a Space Agent draft exposes data-use details before anything is sent and preserves the draft', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, pane, outbound, errors } = await fixture(context);
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    const input = pane.getByLabel('Message', { exact: true });
    await input.fill('Write to sam@agent.example');
    assert.equal(await pane.getByRole('button', { name: 'AI data use', exact: true }).count(), 0);
    await input.fill('@agent help with our plans');
    const trigger = pane.getByRole('button', { name: 'AI data use', exact: true });
    assert.equal(await trigger.count(), 1, 'A Space Agent needs the same provider disclosure as Main Agent.');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'AI data use', exact: true });
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /Microsoft Azure OpenAI/);
    assert.match(await dialog.textContent(), /TinyFish/);
    assert.equal(await dialog.getByRole('link').getAttribute('href'), '/privacy');
    assert.equal(await dialog.getByRole('link').getAttribute('target'), '_blank');
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await input.inputValue(), '@agent help with our plans');
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
    const sent = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST'
      && (call.route.endsWith('/messages') || call.route.startsWith('/api/agent-'))));
    assert.deepEqual(sent, []);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('an existing private Agent question exposes data use without submitting the typed answer', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
  try {
    const { page, pane, outbound, errors } = await fixture(context, { agent: ['waiting'] });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByLabel('Message', { exact: true }).fill('@agent update task 12');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent update task 12' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    const answer = panel.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('My unsubmitted answer');
    const trigger = panel.getByRole('button', { name: 'AI data use', exact: true });
    assert.equal(await trigger.count(), 1, 'An existing private question still needs accessible data-use details.');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'AI data use', exact: true });
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /Microsoft Azure OpenAI/);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await answer.inputValue(), 'My unsubmitted answer');
    assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
    const actions = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.startsWith('/api/agent-')));
    assert.deepEqual(actions, []);
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('shared agent rich content renders only the shared answer and keeps ordinary messages literal', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const content = '## Shared plan\n\n```javascript\nconst shared = true;\n```\n\n![Photo](https://images.example.org/private-tracker.png)';
  try {
    const { page, pane, outbound, errors } = await fixture(context, { agent: ['answered'], agentAnswer: content });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
    await pane.getByLabel('Message', { exact: true }).fill('@agent **keep my request literal**');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    await pane.getByRole('heading', { name: 'Shared plan', exact: true }).waitFor();
    await pane.getByText('@agent **keep my request literal**', { exact: true }).first().waitFor();
    assert.equal(await pane.locator('img').count(), 0);
    assert.equal(await pane.getByRole('button', { name: 'Copy code', exact: true }).count(), 1);
    assert.equal(await pane.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
    const action = pane.getByRole('button', { name: 'Copy answer', exact: true });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll('body *')].map(element => [element, parseFloat(getComputedStyle(element).fontSize)]);
      for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedSharedAnswer = text; } } });
    });
    await action.scrollIntoViewIfNeeded();
    await action.click();
    assert.equal(await page.evaluate(() => window.copiedSharedAnswer), content);
    assert.equal(await page.evaluate(() => window.messagingFixture.calls.some(call => call.route.startsWith('/api/agent-runs'))), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(root, '.local/screenshots/agent-rich-shared-320.png'), animations: 'disabled' });
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('@agent is answered in the chat, or its author reviews the private request here or can ask again, at 320 px and 200% text (DEC-046, DEC-052)', async () => {
  const hint = "Mention @agent to ask this Space's Agent. Only you see its answer until you share it with everyone, and changes wait for your approval.";
  for (const large of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    try {
      const { page, outbound, errors, pane } = await fixture(context, { agent: ['answered', 'waiting', 'off', 'failed'] });
      if (large) await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
      const composer = pane.getByLabel('Message', { exact: true });
      const send = async text => { await composer.fill(text); await pane.getByRole('button', { name: 'Send', exact: true }).click(); };
      const agentStatus = text => pane.getByRole('status').filter({ hasText: text });

      await composer.fill('Write to sam@agent.example');
      assert.equal(await pane.getByText(hint, { exact: true }).count(), 0, 'Only the word @agent asks the agent.');
      await composer.fill("@agent what's due today");
      await pane.getByText(hint, { exact: true }).waitFor();
      await pane.getByRole('button', { name: 'Send', exact: true }).click();
      const answer = pane.getByRole('listitem').filter({ hasText: 'Agent answer 1' });
      await answer.getByText('Agent', { exact: true }).waitFor();
      await answer.getByText("@agent what's due today").waitFor();
      await answer.getByRole('button', { name: 'Reply to Agent', exact: true }).waitFor();
      assert.equal(await answer.getByRole('button', { name: /^(Edit message|Delete message for everyone)$/ }).count(), 0, 'Nobody can edit or delete the agent\'s reply.');
      assert.equal(await pane.getByText(hint, { exact: true }).count(), 0, 'The hint leaves with the sent draft.');
      assert.equal(await agentStatus(/agent/i).count(), 0, 'An answer in the chat needs no status.');

      await send('@agent add a task to buy milk tomorrow');
      const waiting = agentStatus('The agent is waiting for your answer or approval.');
      await waiting.waitFor();
      assert.equal(await waiting.getByRole('link', { name: 'Open Agent', exact: true }).count(), 0, 'review stays in the originating conversation');
      await waiting.getByRole('button', { name: 'Review here', exact: true }).waitFor();
      await send('@agent help');
      const off = agentStatus('The agent is turned off in this Space.');
      await off.waitFor();
      assert.equal(await off.getByRole('link').count() + await off.getByRole('button').count(), 0, 'Nothing can be done about a Space whose agent is off.');
      await send('@agent what is on this week');
      const failedRequest = agentStatus('The agent could not answer.');
      await failedRequest.waitFor();

      for (const control of [waiting.getByRole('button', { name: 'Review here' }), failedRequest.getByRole('button', { name: 'Ask again' })]) {
        const box = await control.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${await control.innerText()} is ${box.width} by ${box.height} px.`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
      if (large) await page.screenshot({ path: path.join(root, '.local/screenshots/t218-messaging-agent-320-large-text.png'), fullPage: true });

      await failedRequest.getByRole('button', { name: 'Ask again', exact: true }).click();
      await pane.getByRole('listitem').filter({ hasText: 'Agent answer 2' }).getByText('@agent what is on this week').waitFor();
      await failedRequest.waitFor({ state: 'detached' });
      await waiting.waitFor();

      const observed = await page.evaluate(chat => ({
        commands: window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.startsWith(`/api/conversations/${chat}/messages`))
          .map(call => ({ route: call.route.split('/').slice(4).join('/'), body: call.body })),
        asked: window.messagingFixture.messages[chat].find(item => item.body === '@agent what is on this week').id,
      }), familyChatId);
      assert.deepEqual(observed.commands, [
        { route: 'messages', body: { body: "@agent what's due today" } }, { route: 'messages', body: { body: '@agent add a task to buy milk tomorrow' } },
        { route: 'messages', body: { body: '@agent help' } }, { route: 'messages', body: { body: '@agent what is on this week' } },
        { route: `messages/${observed.asked}/agent`, body: {} },
      ]);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('the author shares a private agent answer only after confirming, and a refusal keeps it private (DEC-061)', async () => {
  for (const refusal of [null, 'AGENT_ANSWER_NOT_SHARED']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    try {
      const { page, outbound, errors, pane } = await fixture(context, { agent: ['private'], ...(refusal ? { shareRefusal: refusal } : {}) });
      await page.getByRole('button', { name: /^Morgan family/ }).click();
      await pane.getByRole('heading', { name: 'Morgan family', exact: true }).waitFor();
      await pane.getByLabel('Message', { exact: true }).fill('@agent list my tasks');
      await pane.getByRole('button', { name: 'Send', exact: true }).click();
      const own = pane.getByRole('listitem').filter({ hasText: '@agent list my tasks' }).filter({ has: page.getByRole('status') });
      const share = own.getByRole('button', { name: 'Share with everyone', exact: true });
      const confirmation = own.getByRole('group', { name: "Share the Agent's answer", exact: true });
      const shares = () => page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.endsWith('/agent/share')).length);

      await share.click();
      await confirmation.getByText("Everyone in this chat will see the Agent's answer.", { exact: true }).waitFor();
      await confirmation.getByRole('button', { name: 'Keep private', exact: true }).click();
      assert.equal(await shares(), 0, 'Keeping the answer private sends nothing.');
      await share.click();
      await confirmation.getByRole('button', { name: 'Share', exact: true }).click();
      if (refusal) {
        await pane.getByRole('alert').filter({ hasText: 'Not everyone in this chat can see everything this answer names, so it stays private.' }).waitFor();
        await own.getByText('The agent answered you privately.', { exact: true }).waitFor();
        assert.equal(await pane.getByText('Agent answer 1').count(), 0);
      } else {
        await pane.getByRole('listitem').filter({ hasText: 'Agent answer 1' }).waitFor();
        await pane.getByRole('button', { name: 'Share with everyone', exact: true }).waitFor({ state: 'detached' });
      }
      assert.equal(await shares(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nothing scrolls sideways.');
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

test('the private request panel shows API record values after rerender and fits 320px at 200% text', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['private'], incomingAgentMention: true });
    await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByText('@agent show my private tasks', { exact: true }).waitFor();
    assert.equal(await pane.getByRole('button', { name: 'Review here', exact: true }).count(), 0, 'another member’s mention has no private request control');
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.fill('@agent list my tasks');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent list my tasks' });
    const review = own.getByRole('button', { name: 'Review here', exact: true });
    await review.waitFor();
    assert.equal(await own.getByRole('link', { name: 'Open Agent' }).count(), 0);
    assert.equal((await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.startsWith('/api/agent-') && call.method === 'POST'))).length, 0,
      'opening a private request never answers or approves automatically');
    await review.click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).waitFor();
    assert.equal(await panel.locator('code').filter({ hasText: /^Task details$/ }).count(), 1);
    const details = panel.locator('details').filter({ has: page.locator('summary').getByText('Request details', { exact: true }) });
    await details.locator('summary').click();
    for (const value of ['Plan', 'Sources', 'Actions', 'Activity', 'Read Task 12', 'Task 12: Water the plants',
      'Read the authorized task.', 'The private request was recorded.', '10000000-0000-4000-9000-000000000099']) {
      assert.ok(await details.getByText(value, { exact: true }).count() > 0, value);
    }
    await page.evaluate(() => window.renderMessagingFixture());
    for (const value of ['Read Task 12', 'Task 12: Water the plants', 'Read the authorized task.', 'The private request was recorded.']) {
      assert.equal(await details.getByText(value, { exact: true }).isVisible(), true, `rerender keeps ${value}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px at 200% text has no horizontal overflow');
    assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'the inline request stays within its message');
    await page.screenshot({ path: path.join(root, '.local/screenshots/t218-agent-inline-320-large-text.png'), fullPage: true });
    const reads = await page.evaluate(() => window.messagingFixture.calls.filter(call => call.route.startsWith('/api/agent-runs/') && call.method === 'GET'));
    assert.ok(reads.length >= 1);
    assert.equal(reads[0].headers['x-account-id'], accountId);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('private run reads show Retry and clear the old record after 403 or 404', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['private'], runReadFailures: [503, 200, 404, 403] });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.fill('@agent list my tasks');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent list my tasks' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    const failure = panel.getByRole('alert');
    await failure.waitFor();
    assert.match(await failure.innerText(), /Try again/);
    assert.equal(await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).count(), 0);
    await failure.getByRole('button', { name: 'Retry', exact: true }).click();
    await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.startsWith('/api/agent-runs/') && call.method === 'GET').length >= 3);
    await panel.getByRole('alert').filter({ hasText: 'This private request is no longer available.' }).waitFor();
    assert.equal(await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).count(), 0, '404 clears previously read private data');
    await panel.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForFunction(() => window.messagingFixture.calls.filter(call => call.route.startsWith('/api/agent-runs/') && call.method === 'GET').length >= 4);
    const afterForbidden = await page.evaluate(() => {
      const panel = document.querySelector('[aria-label="Your private request"]');
      const retry = [...(panel?.querySelectorAll('button') ?? [])].find(button => button.textContent.trim() === 'Retry');
      return { failure: window.messagingFixture.lastRunReadFailure, retryDisabled: retry?.disabled, text: panel?.innerText };
    });
    assert.equal(afterForbidden.failure, 403, JSON.stringify(afterForbidden));
    assert.equal(await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).count(), 0, '403 leaves no private data visible');
    assert.ok(await panel.getByRole('alert').count() > 0, '403 remains visible as a recoverable failure');
    assert.ok(await panel.getByRole('button', { name: 'Retry', exact: true }).isVisible());
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the requester answers and explicitly approves here; a lost approval response retries the same key and version', async () => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, timezoneId: 'UTC' });
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['waiting'], loseApprovals: 1 });
    await page.addStyleTag({ content: 'html, body { font-size: 32px !important; }' });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.fill('@agent update task 12');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent update task 12' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    const answer = panel.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('Task 12');
    assert.equal((await page.evaluate(() => window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.startsWith('/api/agent-')).length)), 0,
      'typing an answer does not mutate the request');
    await panel.getByRole('button', { name: 'Answer', exact: true }).click();
    await panel.getByRole('heading', { name: 'Check this before I do it', exact: true }).waitFor();
    assert.deepEqual(await panel.locator('dt').allTextContents(), ['Task', 'Due date']);
    assert.deepEqual(await panel.locator('dd').allTextContents(), ['Task 12', '20 October 2026']);
    assert.deepEqual(await page.evaluate(() => window.messagingFixture.created), [], 'answering only prepares an approval');
    const approve = panel.getByRole('button', { name: 'Approve', exact: true });
    await approve.click();
    await panel.getByRole('button', { name: 'Approve again', exact: true }).waitFor();
    // Reopening also reads the current outcome; hold that read to exercise retry while it is still unknown.
    await page.evaluate(() => { window.messagingFixture.holdRunRead = true; });
    await own.getByRole('button', { name: 'Close review', exact: true }).click();
    assert.equal(await panel.isVisible(), false, 'collapse hides private request controls and values');
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    await page.waitForFunction(() => window.messagingFixture.runReadRequested);
    await panel.getByRole('button', { name: 'Approve again', exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Approve again', exact: true }).click();
    await panel.getByText('Done. Updated Task 12.', { exact: true }).waitFor();
    await page.evaluate(() => window.messagingFixture.releaseRunRead());
    assert.equal(await panel.getByRole('button', { name: 'Approve', exact: true }).count(), 0);
    const observed = await page.evaluate(() => ({
      resume: window.messagingFixture.calls.filter(call => call.route.endsWith('/resume') && call.method === 'POST'),
      approvals: window.messagingFixture.calls.filter(call => call.route.endsWith('/approve') && call.method === 'POST'),
      created: window.messagingFixture.created,
    }));
    assert.equal(observed.resume.length, 1);
    assert.deepEqual(observed.resume[0].body, { question_id: observed.resume[0].body.question_id, answer: 'Task 12' });
    assert.equal(observed.approvals.length, 2);
    assert.ok(observed.approvals[0].headers['idempotency-key']);
    assert.equal(observed.approvals[1].headers['idempotency-key'], observed.approvals[0].headers['idempotency-key']);
    assert.equal(observed.approvals[1].headers['if-match'], observed.approvals[0].headers['if-match']);
    assert.equal(observed.approvals[0].headers['if-match'], `"${'1'.padStart(64, '0')}"`);
    assert.equal(observed.created.length, 1);
    assert.equal(observed.created[0].tool, 'tasks.update');
    const details = panel.locator('details').filter({ has: page.locator('summary').getByText('Request details', { exact: true }) });
    await details.locator('summary').click();
    await details.getByText('Updated Task 12.', { exact: true }).waitFor();
    await details.getByText(observed.created[0].result, { exact: true }).waitFor();
    await details.getByText('Task 12 was updated.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px at 200% text has no horizontal overflow');
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reopening a private approval with a lost response confirms its saved outcome without another write', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['waiting'], loseApprovals: 1 });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    await pane.getByLabel('Message', { exact: true }).fill('@agent update task 12');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent update task 12' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    await panel.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Task 12');
    await panel.getByRole('button', { name: 'Answer', exact: true }).click();
    await panel.getByRole('button', { name: 'Approve', exact: true }).click();
    await panel.getByRole('button', { name: 'Approve again', exact: true }).waitFor();
    await own.getByRole('button', { name: 'Close review', exact: true }).click();
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    await panel.getByText('Done. Updated Task 12.', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: /^Approve/ }).count(), 0);
    const state = await page.evaluate(() => ({
      approvals: window.messagingFixture.calls.filter(call => call.method === 'POST' && call.route.endsWith('/approve')).length,
      created: window.messagingFixture.created.length,
    }));
    assert.deepEqual(state, { approvals: 1, created: 1 });
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a private run response arriving after switching conversations is not shown in the new conversation', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['private'], holdRunRead: true });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.fill('@agent list my tasks');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent list my tasks' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    await page.waitForFunction(() => window.messagingFixture.runReadRequested);
    await page.getByRole('button', { name: /^Garden club/ }).click();
    await pane.getByRole('heading', { name: 'Garden club', exact: true }).waitFor();
    await page.evaluate(() => window.messagingFixture.releaseRunRead?.());
    await page.getByText('Agent answer', { exact: true }).waitFor({ state: 'detached' }).catch(() => {});
    assert.equal(await pane.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).count(), 0);
    assert.equal(await pane.getByRole('region', { name: 'Your private request', exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('deleting the originating message clears its private request and cached result', async () => {
  const context = await browser.newContext();
  try {
    const { page, outbound, errors, pane } = await fixture(context, { agent: ['private'] });
    await page.getByRole('button', { name: /^Morgan family/ }).click();
    const composer = pane.getByLabel('Message', { exact: true });
    await composer.fill('@agent list my tasks');
    await pane.getByRole('button', { name: 'Send', exact: true }).click();
    const own = pane.getByRole('listitem').filter({ hasText: '@agent list my tasks' });
    await own.getByRole('button', { name: 'Review here', exact: true }).click();
    const panel = own.getByRole('region', { name: 'Your private request', exact: true });
    await panel.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).waitFor();
    await own.getByRole('button', { name: 'Delete message for everyone', exact: true }).click();
    await own.getByRole('button', { name: 'Delete', exact: true }).click();
    await pane.getByText('Message deleted', { exact: true }).waitFor();
    assert.equal(await pane.getByText('Task 12 is due tomorrow. Task details stay plain text.', { exact: true }).count(), 0);
    assert.equal(await pane.getByRole('button', { name: 'Review here', exact: true }).count(), 0);
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});