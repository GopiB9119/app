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