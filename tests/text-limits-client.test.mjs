import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// T100: the server counts text in characters (an emoji counts once). A name or title it accepted must never make the web
// refuse the whole answer, which would leave a list empty for everyone who can see it, and a form must take the full limit.
const require = createRequire(new URL('../web/package.json', import.meta.url));
const typescript = require('typescript');
const accountId = '4d7dff75-e4b8-4686-b779-744cdb8d09fb';
const otherId = 'acbf61e8-c984-4085-ae55-fb0c6ae0e14b';
const spaceId = '359bd05a-c95c-4975-b061-d647e82a6958';
const taskId = '463aa3d5-a47c-4560-8fe9-70da2f866a2e';
const itemId = '0d1e6a5c-3f43-4f0c-9c4b-0b8f7f1d2a11';
const reminderId = '2b6f1c0e-8a53-4d55-9a53-1d2b8b7c9e02';
const seriesId = '6f1c2f0e-8f53-4d55-9a53-1d2b8b7c9e01';
const notificationId = '9a6f1c0e-8a53-4d55-9a53-1d2b8b7c9e03';
const conversationId = '5f0c8a0e-9f67-4c55-8a29-1f1f7d6f1a01';
const messageId = '7e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a6b';
const eventId = '8f2e3d4c-5b6a-4798-8b1c-2d3e4f5a6b7c';
const runId = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const approvalId = '2a3b4c5d-6e7f-4a1b-8c2d-3e4f5a6b7c8e';
const memoryId = '3a4b5c6d-7e8f-4a1b-8c2d-3e4f5a6b7c8f';
const emoji = count => '\u{1F600}'.repeat(count);

function loadSource(relative, dependencies = {}) {
  const source = readFileSync(new URL(`../web/src/${relative}`, import.meta.url), 'utf8');
  const compiled = typescript.transpileModule(source, { compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports, require: name => dependencies[name] ?? require(name), URL, URLSearchParams, Buffer, AbortSignal, DOMException, Intl, Date,
    fetch: async () => { throw new Error('Unexpected network request'); }, process: { env: {} },
  }, { filename: relative });
  return exports;
}

function client(relative, api) {
  const identity = loadSource('features/identity/client.ts');
  return loadSource(relative, { '@/features/identity/client': api ? { ...identity, api } : identity });
}

const accepts = (schema, value) => schema.safeParse(value).success;
const instant = '2026-09-19T10:00:00Z';

test('Task answers and the task form count titles, notes and names in characters', () => {
  const planning = client('features/planning/client.ts');
  const task = (overrides = {}) => ({
    id: taskId, space_id: spaceId, title: 'Buy groceries', description: '', due_date: null, status: 'open', assignee: null,
    assignee_unavailable: false, created_by_account_id: accountId, completed_by_account_id: null, completed_at: null,
    created_at: instant, updated_at: instant, version: '1', permissions: { can_edit: true, allowed_statuses: ['completed'] }, ...overrides,
  });
  const person = name => ({ account_id: otherId, display_name: name });
  assert.equal(accepts(planning.taskSchema, task({ title: emoji(200), description: emoji(5000), assignee: person(emoji(80)) })), true);
  assert.equal(accepts(planning.taskSchema, task({ title: emoji(201) })), false);
  assert.equal(accepts(planning.taskSchema, task({ description: emoji(5001) })), false);
  assert.equal(accepts(planning.assigneeSchema, person(emoji(81))), false);
  const draft = (overrides = {}) => ({ title: 'Buy groceries', description: '', due_date: '', assignee_account_id: '', ...overrides });
  assert.equal(accepts(planning.taskDraftSchema, draft({ title: emoji(200), description: emoji(5000) })), true);
  const tooLong = planning.taskDraftSchema.safeParse(draft({ title: emoji(201) }));
  assert.equal(tooLong.success, false);
  assert.equal(tooLong.error.issues[0].message, 'Use up to 200 characters.');
  assert.equal(accepts(planning.taskDraftSchema, draft({ description: emoji(5001) })), false);
});

test('Checklists count item and task titles in characters', () => {
  const { checklistSchema } = client('features/planning/checklist-client.ts');
  const checklist = (title, taskTitle) => ({
    task_id: taskId, space_id: spaceId, task_title: taskTitle, task_status: 'open', task_version: '1', can_manage: true, can_check: true,
    items: [{ id: itemId, title, checked: false, checked_at: null, checked_by_account_id: null }], etag: `"${'a'.repeat(64)}"`,
  });
  assert.equal(accepts(checklistSchema, checklist(emoji(200), emoji(200))), true);
  assert.equal(accepts(checklistSchema, checklist(emoji(201), 'Buy groceries')), false);
  assert.equal(accepts(checklistSchema, checklist('Milk', emoji(201))), false);
});

test('The calendar counts entry titles in characters', async () => {
  const answer = title => async (path, schema) => ({
    data: schema.parse([{ id: taskId, space_id: spaceId, title, date: '2026-10-05', kind: 'task', task_id: taskId, scheduled_at: null,
      timezone: null, status: 'open', source_changed: false }]),
    pagination: { next_cursor: null, has_more: false },
  });
  const accepted = await client('features/planning/calendar-client.ts', answer(emoji(200))).calendarPage(accountId, spaceId, '2026-10', 'UTC', null);
  assert.equal(accepted.data[0].title, emoji(200));
  await assert.rejects(client('features/planning/calendar-client.ts', answer(emoji(201))).calendarPage(accountId, spaceId, '2026-10', 'UTC', null));
});

test('Reminders, requests, repeating reminders and the inbox count task titles and names in characters', () => {
  const scheduling = client('features/scheduling/client.ts');
  const person = name => ({ account_id: otherId, display_name: name });
  const reminder = title => ({
    id: reminderId, task_id: taskId, space_id: spaceId, task_title: title, local_time: '2026-09-19T15:31:00', timezone: 'Asia/Kolkata',
    scheduled_at: '2026-09-19T10:01:00Z', expires_at: '2026-09-20T10:01:00Z', status: 'scheduled', reason: null, source_changed: false,
    acknowledged_at: null, version: '1', channel: 'in_app',
  });
  assert.equal(accepts(scheduling.reminderSchema, reminder(emoji(200))), true);
  assert.equal(accepts(scheduling.reminderSchema, reminder(emoji(201))), false);
  const preview = (title, name) => ({
    task_id: taskId, task_title: title, task_version: '1', local_time: '2026-09-19T15:31:00', timezone: 'Asia/Kolkata',
    recipient: person(name), channel: 'in_app',
    options: [{ scheduled_at: '2026-09-19T10:01:00Z', dispatch_expires_at: '2026-09-20T10:01:00Z', utc_offset_minutes: 330, preview_token: 'a'.repeat(64) }],
    expires_at: '2026-09-19T10:05:00Z',
  });
  assert.equal(accepts(scheduling.reminderPreviewSchema, preview(emoji(200), emoji(80))), true);
  assert.equal(accepts(scheduling.reminderPreviewSchema, preview('Buy groceries', emoji(81))), false);
  const notification = title => ({
    id: notificationId, reminder_id: reminderId, task_id: taskId, space_id: spaceId, task_title: title, scheduled_at: '2026-09-19T10:30:00Z',
    created_at: '2026-09-19T10:30:05Z', read_at: null, acknowledged_at: null, series_id: seriesId, snooze_count: 0, snoozed_until: null,
    can_snooze: true, snooze_before: '2026-09-20T10:30:00Z',
  });
  assert.equal(accepts(scheduling.notificationSchema, notification(emoji(200))), true);
  assert.equal(accepts(scheduling.notificationSchema, notification(emoji(201))), false);
  const request = (title, name) => ({
    id: reminderId, task_id: taskId, space_id: spaceId, task_title: title, task_version: '1', requested_by: person(name),
    recipient: { account_id: accountId, display_name: 'Sam' }, local_time: '2026-09-19T16:00:00', timezone: 'Asia/Kolkata',
    scheduled_at: '2026-09-19T10:30:00Z', dispatch_expires_at: '2026-09-20T10:30:00Z', expires_at: '2026-09-19T10:30:00Z',
    created_at: instant, resolved_at: null, status: 'pending', source_changed: false, reminder_id: null, version: '1', channel: 'in_app',
  });
  assert.equal(accepts(scheduling.reminderRequestSchema, request(emoji(200), emoji(80))), true);
  assert.equal(accepts(scheduling.reminderRequestSchema, request('Buy groceries', emoji(81))), false);
  const rule = { frequency: 'daily', repeat_every: 1, weekdays: [], local_time: '16:00', timezone: 'Asia/Kolkata', start_date: '2026-09-19', end_date: '2026-09-30', clock_change_policy: 'shift_forward' };
  const occurrence = (overrides = {}) => ({ reminder_id: null, local_date: '2026-09-19', display_time: '16:00', scheduled_at: '2026-09-19T10:30:00Z', utc_offset_minutes: 330, adjustment: 'none', ...overrides });
  const seriesPreview = (title, name) => ({
    task_id: taskId, task_title: title, task_version: '1', recipient: person(name), ...rule,
    occurrences: [occurrence(), occurrence({ local_date: '2026-09-20', scheduled_at: '2026-09-20T10:30:00Z' })], occurrence_count: 12,
    clock_changes: [], channel: 'in_app', preview_token: 'p'.repeat(40), expires_at: '2026-09-19T10:05:00Z',
  });
  assert.equal(accepts(scheduling.seriesPreviewSchema, seriesPreview(emoji(200), emoji(80))), true);
  assert.equal(accepts(scheduling.seriesPreviewSchema, seriesPreview(emoji(201), 'Alex Morgan')), false);
  const series = title => ({
    id: seriesId, task_id: taskId, space_id: spaceId, task_title: title, task_version: '1', source_changed: false, ...rule, status: 'active',
    reason: null, next_occurrence: occurrence({ reminder_id: reminderId }), created_at: instant, updated_at: instant, version: '1', etag: '"s1"', channel: 'in_app',
  });
  assert.equal(accepts(scheduling.seriesSchema, series(emoji(200))), true);
  assert.equal(accepts(scheduling.seriesSchema, series(emoji(201))), false);
});

test('Conversations and messages count names and titles in characters', () => {
  const messaging = client('features/messaging/client.ts');
  const conversation = name => ({
    id: conversationId, space_id: spaceId, space_name: name, kind: 'space', title: name, participants: [], can_send: true,
    protection: 'server_encrypted', last_position: '2', read_position: '1', unread_count: 1, last_message_at: '2026-09-19T10:01:00Z', created_at: instant,
  });
  assert.equal(accepts(messaging.conversationSchema, conversation(emoji(80))), true);
  assert.equal(accepts(messaging.conversationSchema, conversation(emoji(81))), false);
  assert.equal(accepts(messaging.participantSchema, { account_id: otherId, display_name: emoji(80) }), true);
  assert.equal(accepts(messaging.participantSchema, { account_id: otherId, display_name: emoji(81) }), false);
  const message = name => ({
    id: messageId, conversation_id: conversationId, position: '1', sender_account_id: otherId, sender_name: name, mine: false,
    client_message_id: null, status: 'sent', body: 'Hello family', created_at: '2026-09-19T10:01:00Z', deleted_at: null,
  });
  assert.equal(accepts(messaging.messageSchema, message(emoji(80))), true);
  assert.equal(accepts(messaging.messageSchema, message(emoji(81))), false);
});

test('Events count the Space, the author and the people who answered in characters', () => {
  const events = client('features/events/client.ts');
  const event = (overrides = {}) => ({
    id: eventId, space_id: spaceId, space_name: 'Morgan family', title: 'Dinner', description: '', location: 'Home', timezone: 'Asia/Kolkata',
    local_start: '2026-09-25T18:30', local_end: '2026-09-25T21:00', starts_at: '2026-09-25T13:00:00Z', ends_at: '2026-09-25T15:30:00Z',
    status: 'scheduled', ended: false, created_by_name: 'Alex Morgan', created_at: instant, updated_at: instant, schedule_changed_at: null,
    cancelled_at: null, going: 0, maybe: 0, not_going: 0, my_response: null, my_response_outdated: false, can_manage: true, can_respond: true,
    etag: '"v1"', attendees: [], ...overrides,
  });
  assert.equal(accepts(events.eventSchema, event({ space_name: emoji(80), created_by_name: emoji(80) })), true);
  assert.equal(accepts(events.eventSchema, event({ space_name: emoji(81) })), false);
  assert.equal(accepts(events.eventSchema, event({ created_by_name: emoji(81) })), false);
  const attendee = name => ({ name, response: 'going', responded_at: instant, outdated: false, mine: false });
  assert.equal(accepts(events.attendeeSchema, attendee(emoji(80))), true);
  assert.equal(accepts(events.attendeeSchema, attendee(emoji(81))), false);
});

test('Agent requests, summaries and notes count characters, and the request form takes the full 500', () => {
  const agents = client('features/agents/client.ts');
  const approval = summary => ({
    id: approvalId, run_id: runId, space_id: spaceId, tool_name: 'tasks.create', risk: 'medium', summary, fields: [],
    status: 'pending', reason: null, result_ref: null, created_at: instant, expires_at: '2026-09-19T10:15:00Z', decided_at: null,
    version: '1', etag: `"${'b'.repeat(64)}"`,
  });
  assert.equal(accepts(agents.approvalSchema, approval(emoji(300))), true);
  assert.equal(accepts(agents.approvalSchema, approval(emoji(301))), false);
  const run = message => ({
    id: runId, space_id: spaceId, message, status: 'waiting_for_approval', outcome: null, stop_reason: null, intent: 'create_task',
    answer: null, question: null, approval: approval('Create this task.'), plan: [], tool_calls: [], evidence: [], events: [],
    created_at: instant, updated_at: instant, finished_at: null, version: '2',
  });
  assert.equal(accepts(agents.runSchema, run(emoji(500))), true);
  assert.equal(accepts(agents.runSchema, run(emoji(501))), false);
  const memory = content => ({ id: memoryId, kind: 'note', key: null, label: 'Note', content, source: 'approved_request', source_run_id: runId, created_at: instant });
  assert.equal(accepts(agents.memorySchema, memory(emoji(200))), true);
  assert.equal(accepts(agents.memorySchema, memory(emoji(201))), false);
  assert.equal(agents.messageSchema.safeParse(emoji(500)).success, true);
  const tooLong = agents.messageSchema.safeParse(emoji(501));
  assert.equal(tooLong.success, false);
  assert.equal(tooLong.error.issues[0].message, 'Keep a request under 500 characters.');
});
