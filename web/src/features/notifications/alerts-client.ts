import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const instant = z.string().datetime({ offset: true });
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const person = z.object({ account_id: z.string().uuid(), display_name: z.string().max(80) });

export const quietStateSchema = z.object({ active: z.boolean(), until: instant.nullable() })
  .refine(value => value.active === (value.until !== null));
export const quietHoursSchema = z.object({
  start: clockTime.nullable(), end: clockTime.nullable(), timezone: z.string().min(1).max(64), quiet: quietStateSchema,
  version: z.string().regex(/^\d+$/),
}).refine(value => (value.start === null) === (value.end === null) && (value.start === null || value.start !== value.end));

export const alertItemSchema = z.object({
  id: z.string().min(1).max(160), kind: z.enum(["reminder", "backup", "dose", "event"]), reference: z.string().min(1).max(120),
  title: z.string().min(1).max(200), due_at: instant, ends_at: instant,
  space_id: z.string().uuid().nullable().optional(), task_id: z.string().uuid().nullable().optional(),
  event_id: z.string().uuid().nullable().optional(), instruction_id: z.string().uuid().nullable().optional(),
  person_name: z.string().max(80).nullable().optional(), display_time: clockTime.nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
}).refine(value => value.id === `${value.kind}:${value.reference}` && Date.parse(value.ends_at) > Date.parse(value.due_at));
export const alertFeedSchema = z.object({
  items: z.array(alertItemSchema).max(50), quiet: quietStateSchema, next_check_at: instant, generated_at: instant,
}).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length
  && Date.parse(value.next_check_at) > Date.parse(value.generated_at));

export const backupSchema = z.object({
  id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(), task_title: z.string().min(1).max(200),
  role: z.enum(["owner", "contact"]), owner: person, contact: person, wait_minutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]),
  status: z.enum(["pending", "active", "declined", "cancelled", "ended"]), created_at: instant,
  responded_at: instant.nullable(), ended_at: instant.nullable(), version: z.string().regex(/^[1-9]\d*$/),
}).refine(value => value.owner.account_id !== value.contact.account_id
  && (value.status === "pending") === (value.responded_at === null)
  && ["cancelled", "ended"].includes(value.status) === (value.ended_at !== null));

export type AlertItem = z.infer<typeof alertItemSchema>;
export type AlertFeed = z.infer<typeof alertFeedSchema>;
export type QuietHours = z.infer<typeof quietHoursSchema>;
export type ReminderBackup = z.infer<typeof backupSchema>;
export type BackupPerson = z.infer<typeof person>;
export type BackupWait = ReminderBackup["wait_minutes"];
export type BackupIntent = { accountId: string; taskId: string; contactId: string; waitMinutes: BackupWait; key: string };
export type EventLead = 10 | 30 | 60 | 1440;

export const backupWaits: { minutes: BackupWait; label: string }[] = [
  { minutes: 15, label: "15 minutes" }, { minutes: 30, label: "30 minutes" }, { minutes: 60, label: "1 hour" }, { minutes: 120, label: "2 hours" },
];
export const eventLeads: { minutes: EventLead; label: string }[] = [
  { minutes: 10, label: "10 minutes before" }, { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" }, { minutes: 1440, label: "1 day before" },
];
export const backupStatusLabels: Record<ReminderBackup["status"], string> = {
  pending: "Waiting for an answer", active: "Agreed", declined: "Declined", cancelled: "Stopped", ended: "Stopped",
};

export function alertLine(item: AlertItem) {
  if (item.kind === "backup") return `${item.person_name || "Someone"} has not answered a reminder for “${item.title}”.`;
  if (item.kind === "dose") return `Dose time ${item.display_time ?? ""} for ${item.title}. Record it on the care page.`;
  if (item.kind === "event") return `${item.title} starts at ${item.display_time ?? ""}.`;
  return `Reminder: ${item.title}`;
}

export async function alertFeed(accountId: string, signal?: AbortSignal) {
  return (await api("me/alerts", alertFeedSchema, { accountId, signal })).data;
}

export async function dismissAlert(accountId: string, item: AlertItem) {
  if (item.kind === "reminder") throw new ApiError(422, "ALERT_INVALID", "Open the reminder in your inbox instead.");
  const result = await api("me/alerts/dismiss", z.object({ kind: z.string(), reference: z.string(), dismissed_at: instant }), {
    method: "POST", accountId, body: { kind: item.kind, reference: item.reference },
  });
  if (result.data.kind !== item.kind || result.data.reference !== item.reference) throw new ApiError(502, "INVALID_RESPONSE", "The alert was not set aside.");
  return result.data;
}

export async function quietHours(accountId: string, signal?: AbortSignal) {
  const result = await api("me/quiet-hours", quietHoursSchema, { accountId, signal });
  if (!result.etag) throw new ApiError(502, "INVALID_RESPONSE", "Quiet hours are missing their version.");
  return { data: result.data, etag: result.etag };
}

export async function saveQuietHours(accountId: string, start: string | null, end: string | null, etag: string) {
  const result = await api("me/quiet-hours", quietHoursSchema, {
    method: "PATCH", accountId, headers: { "If-Match": etag }, body: { start, end },
  });
  if (!result.etag || result.data.start !== start || result.data.end !== end) throw new ApiError(502, "INVALID_RESPONSE", "Quiet hours were not confirmed.");
  return { data: result.data, etag: result.etag };
}

export async function backupPage(accountId: string, role: "owner" | "contact", taskId?: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ role, limit: "20" });
  if (taskId) query.set("task_id", taskId);
  if (cursor) query.set("cursor", cursor);
  const result = await api(`reminder-backups?${query}`, z.array(backupSchema).max(20), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor) || new Set(result.data.map(item => item.id)).size !== result.data.length
    || result.data.some(item => item.role !== role || (role === "owner" ? item.owner : item.contact).account_id !== accountId
      || (taskId && item.task_id !== taskId))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The backup person list is invalid.");
  }
  return { data: result.data, pagination: result.pagination };
}

export async function backupContacts(accountId: string, taskId: string, signal?: AbortSignal) {
  const result = await api(`reminder-backups/contacts?${new URLSearchParams({ task_id: taskId })}`, z.array(person).max(50), { accountId, signal });
  if (result.data.some(item => item.account_id === accountId)) throw new ApiError(502, "INVALID_RESPONSE", "The list of people is invalid.");
  return result.data;
}

export async function askBackup(intent: BackupIntent) {
  const result = await api("reminder-backups", backupSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key },
    body: { task_id: intent.taskId, contact_account_id: intent.contactId, wait_minutes: intent.waitMinutes },
  });
  if (result.data.task_id !== intent.taskId || result.data.contact.account_id !== intent.contactId || result.data.owner.account_id !== intent.accountId
    || result.data.wait_minutes !== intent.waitMinutes) {
    throw new ApiError(502, "INVALID_RESPONSE", "The backup request does not match what you chose.");
  }
  return result.data;
}

export async function respondBackup(accountId: string, backup: ReminderBackup, action: "accept" | "decline" | "cancel") {
  const result = await api(`reminder-backups/${backup.id}/${action}`, backupSchema, { method: "POST", accountId, body: {} });
  const expected = action === "accept" ? ["active"] : action === "decline" ? ["declined"] : ["cancelled", "ended", "declined"];
  if (result.data.id !== backup.id || !expected.includes(result.data.status)) throw new ApiError(502, "INVALID_RESPONSE", "The change was not confirmed.");
  return result.data;
}

const eventAlertSchema = z.object({ event_id: z.string().uuid(), minutes_before: z.union([z.literal(10), z.literal(30), z.literal(60), z.literal(1440)]).nullable() });

export async function eventAlert(accountId: string, eventId: string, signal?: AbortSignal) {
  const result = await api(`events/${eventId}/alert`, eventAlertSchema, { accountId, signal });
  if (result.data.event_id !== eventId) throw new ApiError(502, "INVALID_RESPONSE", "The event alert belongs to another event.");
  return result.data.minutes_before;
}

export async function setEventAlert(accountId: string, eventId: string, minutes: EventLead | null) {
  const result = await api(`events/${eventId}/alert`, eventAlertSchema, { method: "POST", accountId, body: { minutes_before: minutes } });
  if (result.data.event_id !== eventId || result.data.minutes_before !== minutes) throw new ApiError(502, "INVALID_RESPONSE", "The event alert was not confirmed.");
  return result.data.minutes_before;
}

const careAlertSchema = z.object({ instruction_id: z.string().uuid(), enabled: z.boolean() });

export async function careAlerts(accountId: string, signal?: AbortSignal) {
  const result = await api("me/care-alerts", z.array(careAlertSchema).max(30), { accountId, signal });
  return new Set(result.data.filter(item => item.enabled).map(item => item.instruction_id));
}

export async function setCareAlert(accountId: string, instructionId: string, enabled: boolean) {
  const result = await api(`care/instructions/${instructionId}/alerts`, careAlertSchema, { method: "POST", accountId, body: { enabled } });
  if (result.data.instruction_id !== instructionId || result.data.enabled !== enabled) throw new ApiError(502, "INVALID_RESPONSE", "The dose alert was not confirmed.");
  return result.data.enabled;
}
