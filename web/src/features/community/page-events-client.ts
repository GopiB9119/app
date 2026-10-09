import { z } from "zod";
import { ApiError, api, chars } from "@/features/identity/client";

// Events that public pages publish (D4). Saying you are going is intent; who is going stays with the page's managers.
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const pageEventSchema = z.object({
  id: uuid, page_id: uuid, page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
  title: chars(1, 120), description: chars(0, 2000), location: chars(1, 200).nullable(), location_hidden: z.boolean(), location_public: z.boolean(),
  timezone: z.string().min(1).max(64), local_start: local, local_end: local.nullable(), starts_at: timestamp, ends_at: timestamp.nullable(),
  status: z.enum(["scheduled", "cancelled"]), ended: z.boolean(), going_count: z.number().int().nonnegative(),
  capacity: z.number().int().positive().nullable(), going: z.boolean(), can_manage: z.boolean(), created_at: timestamp, updated_at: timestamp,
  schedule_changed_at: timestamp.nullable(), cancelled_at: timestamp.nullable(), etag: z.string().min(3).max(200).nullable(),
}).refine(value => value.can_manage === (value.etag !== null)
  && !(value.location !== null && value.location_hidden)
  && (value.status === "cancelled") === (value.cancelled_at !== null)
  && (value.capacity === null || value.going_count <= value.capacity));
export type PageEvent = z.infer<typeof pageEventSchema>;
export type PageEventBody = {
  title: string; description: string; location: string; location_public: boolean; timezone: string; local_start: string; local_end: string | null;
  capacity?: number | null;
};

function invalid(message = "The service returned an unexpected response."): never {
  throw new ApiError(502, "INVALID_RESPONSE", message);
}

export async function pageEvents(pageId: string, accountId: string | undefined, when: "upcoming" | "past", signal?: AbortSignal) {
  const result = (await api(`pages/${pageId}/events?when=${when}`, z.array(pageEventSchema).max(50), { accountId, signal })).data;
  if (result.some(item => item.page_id !== pageId) || new Set(result.map(item => item.id)).size !== result.length) invalid();
  return result;
}

export async function myPageEvents(accountId: string, signal?: AbortSignal) {
  return (await api("me/page-events", z.array(pageEventSchema).max(50), { accountId, signal })).data;
}

export async function discoverEvents(accountId: string | undefined, signal?: AbortSignal) {
  return (await api("discover/events?limit=6", z.array(pageEventSchema).max(20), { accountId, signal })).data;
}

export async function createPageEvent(intent: { accountId: string; pageId: string; key: string; body: PageEventBody }) {
  const result = (await api(`pages/${intent.pageId}/events`, pageEventSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  if (result.page_id !== intent.pageId || !result.can_manage) invalid("The event could not be confirmed.");
  return result;
}

export async function updatePageEvent(accountId: string, event: PageEvent, body: PageEventBody) {
  if (!event.etag) invalid();
  const result = (await api(`page-events/${event.id}`, pageEventSchema, { method: "PUT", accountId, body, headers: { "If-Match": event.etag } })).data;
  if (result.id !== event.id) invalid("The change could not be confirmed.");
  return result;
}

export async function cancelPageEvent(accountId: string, event: PageEvent) {
  if (!event.etag) invalid();
  const result = (await api(`page-events/${event.id}/cancel`, pageEventSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": event.etag } })).data;
  if (result.id !== event.id || result.status !== "cancelled") invalid("The cancellation could not be confirmed.");
  return result;
}

export async function setGoing(accountId: string, eventId: string, going: boolean) {
  const result = (await api(`page-events/${eventId}/${going ? "going" : "not-going"}`, pageEventSchema, { method: "POST", accountId, body: {} })).data;
  if (result.id !== eventId || result.going !== going) invalid("Your answer could not be confirmed.");
  return result;
}

export async function pageEventAttendees(accountId: string, eventId: string, signal?: AbortSignal) {
  return (await api(`page-events/${eventId}/attendees`, z.array(z.object({ name: chars(1, 80), since: timestamp })).max(10000), { accountId, signal })).data;
}
