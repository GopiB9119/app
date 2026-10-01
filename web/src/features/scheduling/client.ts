import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const instant = z.string().datetime({ offset: true });
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00$/)
  .refine(value => z.string().date().safeParse(value.slice(0, 10)).success);
const namedTimezone = z.string().min(1).max(64).refine(value => {
  if (value !== "UTC" && !value.includes("/")) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
});
export const reminderStatusSchema = z.enum(["scheduled", "available", "cancelled", "suppressed", "expired", "failed"]);
export const reminderSchema = z.object({
  id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(), task_title: z.string().min(1).max(200),
  local_time: localTime, timezone: namedTimezone, scheduled_at: instant, expires_at: instant,
  status: reminderStatusSchema, reason: z.string().nullable(), source_changed: z.boolean(),
  acknowledged_at: instant.nullable(), version: z.string().regex(/^[1-9]\d*$/), channel: z.literal("in_app"),
  series_id: z.string().uuid().nullable().optional(), occurrence_date: z.string().date().nullable().optional(),
  follow_up_of: z.string().uuid().nullable().optional(), snooze_count: z.number().int().min(0).max(3).optional(),
}).refine(value => Date.parse(value.expires_at) > Date.parse(value.scheduled_at) && (value.acknowledged_at === null || value.status === "available"));

const previewOption = z.object({
  scheduled_at: instant, dispatch_expires_at: instant, utc_offset_minutes: z.number().int().min(-840).max(840),
  preview_token: z.string().min(32).max(4096),
}).refine(value => Date.parse(value.dispatch_expires_at) > Date.parse(value.scheduled_at));

export const reminderPreviewSchema = z.object({
  task_id: z.string().uuid(), task_title: z.string().min(1).max(200), task_version: z.string().regex(/^[1-9]\d*$/),
  local_time: localTime, timezone: namedTimezone, recipient: z.object({ account_id: z.string().uuid(), display_name: z.string().min(1).max(80) }),
  channel: z.literal("in_app"), options: z.array(previewOption).min(1).max(2), expires_at: instant,
}).superRefine((value, context) => {
  const wallTime = Date.parse(`${value.local_time}Z`);
  const instants = value.options.map(option => Date.parse(option.scheduled_at));
  if (new Set(instants).size !== instants.length || new Set(value.options.map(option => option.preview_token)).size !== value.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Reminder choices must be distinct." });
  }
  value.options.forEach((option, index) => {
    if (wallTime - option.utc_offset_minutes * 60000 !== instants[index] || (index > 0 && instants[index] <= instants[index - 1])) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "The reminder clock time and offset do not agree." });
    }
  });
});

export const notificationSchema = z.object({
  id: z.string().uuid(), reminder_id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(),
  task_title: z.string().min(1).max(200), scheduled_at: instant, created_at: instant, read_at: instant.nullable(), acknowledged_at: instant.nullable(),
  series_id: z.string().uuid().nullable().optional(), snooze_count: z.number().int().min(0).max(3).optional(),
  snoozed_until: instant.nullable().optional(), can_snooze: z.boolean().optional(), snooze_before: instant.nullable().optional(),
});
export const notificationPreferencesSchema = z.object({ in_app_reminders_enabled: z.boolean(), version: z.string().regex(/^[1-9]\d*$/) });
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderPreview = z.infer<typeof reminderPreviewSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type ReminderIntent = { key: string; previewToken: string; taskId: string; accountId: string };

export async function previewReminder(accountId: string, taskId: string, local: string, timezone: string) {
  const result = await api("reminders/preview", reminderPreviewSchema, { method: "POST", accountId, body: { task_id: taskId, local_time: local, timezone } });
  if (result.data.task_id !== taskId || result.data.recipient.account_id !== accountId || result.data.timezone !== timezone || result.data.local_time.slice(0, 16) !== local.slice(0, 16)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The reminder preview does not match this request.");
  }
  return result.data;
}

export async function saveReminder(intent: ReminderIntent) {
  const result = await api("reminders", reminderSchema, { method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key }, body: { preview_token: intent.previewToken } });
  if (result.data.task_id !== intent.taskId) throw new ApiError(502, "INVALID_RESPONSE", "The reminder belongs to a different task.");
  return result.data;
}

export async function reminderPage(accountId: string, taskId?: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (taskId) query.set("task_id", taskId);
  if (cursor) query.set("cursor", cursor);
  const result = await api(`reminders?${query}`, z.array(reminderSchema).max(20), { accountId, signal });
  if (!result.pagination || (taskId && result.data.some(item => item.task_id !== taskId))) throw new ApiError(502, "INVALID_RESPONSE", "The reminder list is invalid.");
  return { data: result.data, pagination: result.pagination };
}

export async function notificationPage(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`notifications?${query}`, z.array(notificationSchema).max(20), { accountId, signal });
  if (!result.pagination || result.unreadCount === undefined) throw new ApiError(502, "INVALID_RESPONSE", "The notification list is incomplete.");
  return { data: result.data, pagination: result.pagination, unreadCount: result.unreadCount };
}

export const reminderLabels: Record<Reminder["status"], string> = { scheduled: "Scheduled", available: "Available in inbox", cancelled: "Cancelled", suppressed: "Stopped", expired: "Expired", failed: "Delivery failed" };

export function offsetLabel(minutes: number) {
  const magnitude = Math.abs(minutes);
  return `UTC${minutes >= 0 ? "+" : "-"}${String(Math.floor(magnitude / 60)).padStart(2, "0")}:${String(magnitude % 60).padStart(2, "0")}`;
}

const requestPerson = z.object({ account_id: z.string().uuid(), display_name: z.string().min(1).max(80) });
export const reminderRequestSchema = z.object({
  id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(), task_title: z.string().min(1).max(200),
  task_version: z.string().regex(/^[1-9]\d*$/), requested_by: requestPerson, recipient: requestPerson,
  local_time: localTime, timezone: namedTimezone, scheduled_at: instant, dispatch_expires_at: instant,
  expires_at: instant, created_at: instant, resolved_at: instant.nullable(),
  status: z.enum(["pending", "accepted", "declined", "cancelled", "expired", "outdated"]),
  source_changed: z.boolean(), reminder_id: z.string().uuid().nullable(), version: z.string().regex(/^[1-9]\d*$/), channel: z.literal("in_app"),
}).refine(value => value.requested_by.account_id !== value.recipient.account_id
  && Date.parse(value.dispatch_expires_at) > Date.parse(value.scheduled_at)
  && Date.parse(value.expires_at) <= Date.parse(value.scheduled_at)
  && Date.parse(value.created_at) < Date.parse(value.expires_at)
  && (value.status === "accepted" || value.reminder_id === null)
  && (value.status !== "pending" || value.resolved_at === null)
  && (!["accepted", "declined", "cancelled"].includes(value.status) || value.resolved_at !== null));

export const reminderRequestPreviewSchema = reminderPreviewSchema.and(z.object({
  requested_by: requestPerson, request_expires_at: instant,
})).refine(value => value.requested_by.account_id !== value.recipient.account_id
  && value.options.every(option => Date.parse(value.request_expires_at) <= Date.parse(option.scheduled_at)));

export const reminderRequestReviewSchema = z.object({
  request: reminderRequestSchema, preview_token: z.string().min(32).max(4096), expires_at: instant,
}).refine(value => value.request.status === "pending" && !value.request.source_changed
  && Date.parse(value.expires_at) <= Date.parse(value.request.expires_at));

export type ReminderRequest = z.infer<typeof reminderRequestSchema>;
export type ReminderRequestPreview = z.infer<typeof reminderRequestPreviewSchema>;
export type ReminderRequestReview = z.infer<typeof reminderRequestReviewSchema>;
export type ReminderRequestIntent = ReminderIntent & {
  recipientAccountId: string; spaceId: string; taskVersion: string; localTime: string; timezone: string; scheduledAt: string;
};
export type ReminderRequestAction = { accountId: string; request: ReminderRequest; action: "accept" | "decline" | "cancel"; previewToken?: string };
export const requestLabels: Record<ReminderRequest["status"], string> = {
  pending: "Awaiting acceptance", accepted: "Accepted", declined: "Declined", cancelled: "Withdrawn", expired: "Expired", outdated: "Task changed",
};

function validateRequestAccount(request: ReminderRequest, accountId: string) {
  if ((request.recipient.account_id !== accountId && request.requested_by.account_id !== accountId)
    || (request.requested_by.account_id === accountId && request.reminder_id !== null)
    || (request.recipient.account_id === accountId && request.status === "accepted" && request.reminder_id === null)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The reminder request does not match this account.");
  }
}

function validateRequestMatch(result: ReminderRequest, expected: ReminderRequest) {
  if (result.id !== expected.id || result.task_id !== expected.task_id || result.space_id !== expected.space_id
    || result.recipient.account_id !== expected.recipient.account_id || result.requested_by.account_id !== expected.requested_by.account_id
    || result.task_version !== expected.task_version || result.local_time !== expected.local_time
    || result.timezone !== expected.timezone || Date.parse(result.scheduled_at) !== Date.parse(expected.scheduled_at)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The response does not match the reviewed request.");
  }
}

export async function previewReminderRequest(accountId: string, recipientId: string, taskId: string, local: string, timezone: string) {
  const result = await api("reminder-requests/preview", reminderRequestPreviewSchema, {
    method: "POST", accountId, body: { task_id: taskId, recipient_account_id: recipientId, local_time: local, timezone },
  });
  if (result.data.task_id !== taskId || result.data.recipient.account_id !== recipientId || result.data.requested_by.account_id !== accountId
    || result.data.timezone !== timezone || result.data.local_time.slice(0, 16) !== local.slice(0, 16)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The preview does not match this reminder request.");
  }
  return result.data;
}

export async function saveReminderRequest(intent: ReminderRequestIntent) {
  const result = await api("reminder-requests", reminderRequestSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key }, body: { preview_token: intent.previewToken },
  });
  validateRequestAccount(result.data, intent.accountId);
  if (result.data.requested_by.account_id !== intent.accountId || result.data.recipient.account_id !== intent.recipientAccountId
    || result.data.task_id !== intent.taskId || result.data.space_id !== intent.spaceId || result.data.task_version !== intent.taskVersion
    || result.data.local_time !== intent.localTime || result.data.timezone !== intent.timezone
    || Date.parse(result.data.scheduled_at) !== Date.parse(intent.scheduledAt)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The saved request does not match the selected time or recipient.");
  }
  return result.data;
}

export async function reminderRequestPage(accountId: string, direction: "received" | "sent", cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ direction, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`reminder-requests?${query}`, z.array(reminderRequestSchema).max(20), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor) || new Set(result.data.map(item => item.id)).size !== result.data.length) {
    throw new ApiError(502, "INVALID_RESPONSE", "The request list is invalid.");
  }
  for (const item of result.data) {
    validateRequestAccount(item, accountId);
    if ((direction === "received" ? item.recipient.account_id : item.requested_by.account_id) !== accountId) {
      throw new ApiError(502, "INVALID_RESPONSE", "The request list belongs to another account.");
    }
  }
  return { data: result.data, pagination: result.pagination };
}

export async function reviewReminderRequest(accountId: string, request: ReminderRequest) {
  if (request.recipient.account_id !== accountId) throw new ApiError(404, "NOT_FOUND", "Reminder request not found.");
  const result = await api(`reminder-requests/${request.id}/review`, reminderRequestReviewSchema, { accountId });
  validateRequestAccount(result.data.request, accountId);
  validateRequestMatch(result.data.request, request);
  return result.data;
}

export async function respondReminderRequest(intent: ReminderRequestAction) {
  const expectedAccount = intent.action === "cancel" ? intent.request.requested_by.account_id : intent.request.recipient.account_id;
  if (expectedAccount !== intent.accountId) throw new ApiError(404, "NOT_FOUND", "Reminder request not found.");
  if (intent.action === "accept" && !intent.previewToken) throw new ApiError(400, "PREVIEW_INVALID", "Review this request first.");
  const result = await api(`reminder-requests/${intent.request.id}/${intent.action}`, reminderRequestSchema, {
    method: "POST", accountId: intent.accountId, body: intent.action === "accept" ? { preview_token: intent.previewToken } : {},
  });
  validateRequestAccount(result.data, intent.accountId);
  validateRequestMatch(result.data, intent.request);
  const expectedStatus = { accept: "accepted", decline: "declined", cancel: "cancelled" }[intent.action];
  if (result.data.status !== expectedStatus) throw new ApiError(502, "INVALID_RESPONSE", "The request outcome is not confirmed.");
  return result.data;
}

export const weekdayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = typeof weekdayNames[number];
export const weekdayLabels: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const localDate = z.string().date();
const seriesOccurrenceSchema = z.object({
  reminder_id: z.string().uuid().nullable(), local_date: localDate, display_time: clockTime, scheduled_at: instant,
  utc_offset_minutes: z.number().int().min(-840).max(840), adjustment: z.enum(["none", "shifted_forward", "repeated_time_first", "moved"]),
}).refine(value => Date.parse(`${value.local_date}T${value.display_time}:00Z`) - value.utc_offset_minutes * 60000 === Date.parse(value.scheduled_at));
const ruleShape = {
  frequency: z.enum(["daily", "weekly"]), repeat_every: z.number().int().min(1).max(30), weekdays: z.array(z.enum(weekdayNames)).max(7),
  local_time: clockTime, timezone: namedTimezone, start_date: localDate, end_date: localDate,
  clock_change_policy: z.enum(["shift_forward", "skip"]),
};
export const seriesPreviewSchema = z.object({
  task_id: z.string().uuid(), task_title: z.string().min(1).max(200), task_version: z.string().regex(/^[1-9]\d*$/),
  recipient: requestPerson, ...ruleShape, occurrences: z.array(seriesOccurrenceSchema).min(1).max(10),
  occurrence_count: z.number().int().min(1).max(366),
  clock_changes: z.array(z.object({ local_date: localDate, change: z.enum(["shifted_forward", "repeated_time_first", "skipped"]) })).max(20),
  channel: z.literal("in_app"), preview_token: z.string().min(32).max(4096), expires_at: instant,
}).refine(value => value.occurrences.length <= value.occurrence_count
  && value.occurrences.every((item, index) => item.reminder_id === null
    && (index === 0 || Date.parse(item.scheduled_at) > Date.parse(value.occurrences[index - 1].scheduled_at))));
export const seriesSchema = z.object({
  id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(), task_title: z.string().min(1).max(200),
  task_version: z.string().regex(/^[1-9]\d*$/), source_changed: z.boolean(), ...ruleShape,
  status: z.enum(["active", "paused", "cancelled", "ended", "suppressed"]), reason: z.string().max(40).nullable(),
  next_occurrence: seriesOccurrenceSchema.nullable(), created_at: instant, updated_at: instant,
  version: z.string().regex(/^[1-9]\d*$/), etag: z.string().min(3).max(160), channel: z.literal("in_app"),
  replaced_by: z.string().uuid().nullable().optional(),
}).refine(value => ["paused", "suppressed"].includes(value.status) === (value.reason !== null)
  && (value.status === "active" || value.next_occurrence === null)
  && (value.next_occurrence === null || value.next_occurrence.reminder_id !== null)
  && (!value.replaced_by || value.status === "cancelled"));

export type SeriesRule = {
  frequency: "daily" | "weekly"; repeat_every: number; weekdays: Weekday[]; local_time: string; timezone: string;
  start_date: string; end_date: string; clock_change_policy: "shift_forward" | "skip";
};
export type ReminderSeries = z.infer<typeof seriesSchema>;
export type ReminderSeriesPreview = z.infer<typeof seriesPreviewSchema>;
export type SeriesIntent = { key: string; previewToken: string; taskId: string; accountId: string; rule: SeriesRule };
export type SeriesOperation = "pause" | "resume" | "skip" | "cancel";
export type SeriesCommandIntent = { accountId: string; series: ReminderSeries; operation: SeriesOperation; key: string };
export type SeriesReplaceIntent = { accountId: string; series: ReminderSeries; previewToken: string; key: string; rule: SeriesRule };
export type SeriesMoveIntent = { accountId: string; series: ReminderSeries; localTime: string; key: string };
export type SnoozeMinutes = 10 | 60 | 180 | 1440;
export type SnoozeIntent = { accountId: string; notification: Notification; minutes: SnoozeMinutes; key: string };
export const snoozeChoices: { minutes: SnoozeMinutes; label: string }[] = [
  { minutes: 10, label: "10 minutes" }, { minutes: 60, label: "1 hour" }, { minutes: 180, label: "3 hours" }, { minutes: 1440, label: "1 day" },
];
export const seriesStatusLabels: Record<ReminderSeries["status"], string> = { active: "Active", paused: "Paused", cancelled: "Cancelled", ended: "Ended", suppressed: "Stopped" };

export function seriesReason(reason: string | null) {
  if (!reason) return "";
  return ({
    by_person: "Paused by you.", task_changed: "Paused because the task changed. Review the task, then resume.",
    task_closed: "Paused because the task is closed. Reopen it before resuming.", access_lost: "Stopped: you no longer have access to this task.",
    account_inactive: "Stopped: the account is inactive.", preference_revoked: "Stopped: in-app reminders were turned off.",
  } as Record<string, string>)[reason] ?? "Stopped.";
}

export function describeRule(rule: SeriesRule) {
  const cadence = rule.frequency === "daily"
    ? rule.repeat_every === 1 ? "Every day" : `Every ${rule.repeat_every} days`
    : `${rule.repeat_every === 1 ? "Every week" : `Every ${rule.repeat_every} weeks`} on ${rule.weekdays.map(day => weekdayLabels[day]).join(", ")}`;
  return `${cadence} at ${rule.local_time}`;
}

function sameRule(value: SeriesRule, rule: SeriesRule) {
  return value.frequency === rule.frequency && value.repeat_every === rule.repeat_every && value.weekdays.join() === rule.weekdays.join()
    && value.local_time === rule.local_time && value.timezone === rule.timezone && value.start_date === rule.start_date
    && value.end_date === rule.end_date && value.clock_change_policy === rule.clock_change_policy;
}

export async function previewSeries(accountId: string, taskId: string, rule: SeriesRule, replacesSeriesId?: string) {
  const body = replacesSeriesId ? { task_id: taskId, ...rule, replaces_series_id: replacesSeriesId } : { task_id: taskId, ...rule };
  const result = await api("reminder-series/preview", seriesPreviewSchema, { method: "POST", accountId, body });
  if (result.data.task_id !== taskId || result.data.recipient.account_id !== accountId || !sameRule(result.data, rule)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The repeating reminder preview does not match this request.");
  }
  return result.data;
}

export async function saveSeries(intent: SeriesIntent) {
  const result = await api("reminder-series", seriesSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key }, body: { preview_token: intent.previewToken },
  });
  if (result.data.task_id !== intent.taskId || !sameRule(result.data, intent.rule)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The saved repeating reminder does not match the reviewed one.");
  }
  return result.data;
}

export async function seriesPage(accountId: string, taskId?: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (taskId) query.set("task_id", taskId);
  if (cursor) query.set("cursor", cursor);
  const result = await api(`reminder-series?${query}`, z.array(seriesSchema).max(20), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor) || new Set(result.data.map(item => item.id)).size !== result.data.length
    || (taskId && result.data.some(item => item.task_id !== taskId))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The repeating reminder list is invalid.");
  }
  return { data: result.data, pagination: result.pagination };
}

const confirmedStatus: Record<SeriesOperation, ReminderSeries["status"][]> = {
  pause: ["paused"], resume: ["active", "ended"], skip: ["active", "ended"], cancel: ["cancelled"],
};

export async function commandSeries(intent: SeriesCommandIntent) {
  const result = await api(`reminder-series/${intent.series.id}/${intent.operation}`, seriesSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key, "If-Match": intent.series.etag }, body: {},
  });
  if (result.data.id !== intent.series.id || result.data.task_id !== intent.series.task_id || !confirmedStatus[intent.operation].includes(result.data.status)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The repeating reminder change is not confirmed.");
  }
  return result.data;
}

// Saving a changed rule cancels the old repeating reminder and starts a new one in one step.
export async function replaceSeries(intent: SeriesReplaceIntent) {
  const result = await api(`reminder-series/${intent.series.id}/replace`, seriesSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key, "If-Match": intent.series.etag },
    body: { preview_token: intent.previewToken },
  });
  if (result.data.id === intent.series.id || result.data.task_id !== intent.series.task_id || result.data.status !== "active" || !sameRule(result.data, intent.rule)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The changed repeating reminder is not confirmed.");
  }
  return result.data;
}

// Moves only the next time, on the same day. The rule stays as it was.
export async function moveSeries(intent: SeriesMoveIntent) {
  const result = await api(`reminder-series/${intent.series.id}/move`, seriesSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key, "If-Match": intent.series.etag },
    body: { local_time: intent.localTime },
  });
  const next = result.data.next_occurrence;
  if (result.data.id !== intent.series.id || !next || next.adjustment !== "moved"
    || `${next.local_date}T${next.display_time}` !== intent.localTime.slice(0, 16)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The moved reminder time is not confirmed.");
  }
  return result.data;
}

export async function snoozeNotification(intent: SnoozeIntent) {
  const result = await api(`notifications/${intent.notification.id}/snooze`, notificationSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key }, body: { minutes: intent.minutes },
  });
  if (result.data.id !== intent.notification.id || result.data.reminder_id !== intent.notification.reminder_id || result.data.can_snooze !== false) {
    throw new ApiError(502, "INVALID_RESPONSE", "The snooze is not confirmed.");
  }
  return result.data;
}