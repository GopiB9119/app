import { z } from "zod";
import { ApiError, api, chars } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const RESPONSES = ["going", "maybe", "not_going"] as const;
export type EventResponse = (typeof RESPONSES)[number];
export const RESPONSE_LABELS: Record<EventResponse, string> = { going: "Going", maybe: "Maybe", not_going: "Not going" };
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_LOCATION = 200;

const count = z.number().int().nonnegative();
export const attendeeSchema = z.object({
  name: chars(1, 80), response: z.enum(RESPONSES), responded_at: timestamp,
  outdated: z.boolean(), mine: z.boolean(),
});
export const eventSchema = z.object({
  id: uuid, space_id: uuid, space_name: chars(1, 80),
  title: z.string().min(1).max(MAX_TITLE * 2), description: z.string().max(MAX_DESCRIPTION * 2), location: z.string().max(MAX_LOCATION * 2),
  timezone: z.string().min(1).max(64), local_start: localTime, local_end: localTime.nullable(),
  starts_at: timestamp, ends_at: timestamp.nullable(), status: z.enum(["scheduled", "cancelled"]), ended: z.boolean(),
  created_by_name: chars(0, 80), created_at: timestamp, updated_at: timestamp,
  schedule_changed_at: timestamp.nullable(), cancelled_at: timestamp.nullable(),
  going: count, maybe: count, not_going: count,
  my_response: z.enum(RESPONSES).nullable(), my_response_outdated: z.boolean(),
  can_manage: z.boolean(), can_respond: z.boolean(), etag: z.string().min(3).max(200).nullable(),
  attendees: z.array(attendeeSchema).max(500).optional(),
}).superRefine((value, context) => {
  if ((value.status === "cancelled") !== (value.cancelled_at !== null) || (value.local_end === null) !== (value.ends_at === null)
    || (value.ends_at !== null && Date.parse(value.ends_at) <= Date.parse(value.starts_at))
    || (value.can_manage && value.etag === null) || (value.can_respond && (value.status !== "scheduled" || value.ended))
    || (value.my_response === null && value.my_response_outdated)
    || (value.attendees && value.attendees.filter(item => item.mine).length > 1)) {
    context.addIssue({ code: "custom", message: "Inconsistent event." });
  }
});
export type SpaceEvent = z.infer<typeof eventSchema>;
export type EventForm = { title: string; description: string; location: string; timezone: string; local_start: string; local_end: string };
export type CreateIntent = { accountId: string; spaceId: string; key: string; body: EventBody };
type EventBody = { title: string; description: string; location: string; timezone: string; local_start: string; local_end: string | null };

function checkEvent(value: SpaceEvent, expected: { id?: string; spaceId?: string }) {
  if ((expected.id && value.id !== expected.id) || (expected.spaceId && value.space_id !== expected.spaceId)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The event does not match your request.");
  }
  return value;
}

export function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return [...new Set([current, ...zones, "UTC"])].filter(Boolean).sort();
}

export function eventBody(form: EventForm): EventBody {
  return {
    title: form.title.trim().replace(/\s+/g, " "), description: form.description.replace(/\r\n/g, "\n").trim(),
    location: form.location.trim().replace(/\s+/g, " "), timezone: form.timezone,
    local_start: form.local_start.slice(0, 16), local_end: form.local_end ? form.local_end.slice(0, 16) : null,
  };
}

const controls = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function formProblem(form: EventForm) {
  const body = eventBody(form);
  if (!body.title) return "Enter a title.";
  if ([...body.title].length > MAX_TITLE) return `Titles can have up to ${MAX_TITLE} characters.`;
  if ([...body.location].length > MAX_LOCATION) return `Locations can have up to ${MAX_LOCATION} characters.`;
  if ([...body.description].length > MAX_DESCRIPTION) return `Details can have up to ${MAX_DESCRIPTION} characters.`;
  if ([body.title, body.location, body.description].some(text => controls.test(text))) return "Remove control characters.";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.local_start)) return "Choose a start date and time.";
  if (body.local_end && body.local_end <= body.local_start) return "The end must be after the start.";
  if (!body.timezone) return "Choose a time zone.";
  return null;
}

export function sameBody(left: EventBody, right: EventBody) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formFromEvent(event: SpaceEvent): EventForm {
  return {
    title: event.title, description: event.description, location: event.location, timezone: event.timezone,
    local_start: event.local_start, local_end: event.local_end ?? "",
  };
}

export function formatWhen(event: Pick<SpaceEvent, "local_start" | "local_end" | "timezone" | "starts_at">, viewerZone: string) {
  const wall = (value: string) => {
    const [date, time] = value.split("T");
    const [year, month, day] = date.split("-").map(Number);
    const label = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, day)));
    return `${label}, ${time}`;
  };
  const start = wall(event.local_start);
  const end = event.local_end ? (event.local_end.slice(0, 10) === event.local_start.slice(0, 10) ? event.local_end.slice(11) : wall(event.local_end)) : null;
  const main = `${start}${end ? ` to ${end}` : ""} (${event.timezone})`;
  if (event.timezone === viewerZone) return { main, yours: null };
  const yours = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: viewerZone }).format(new Date(event.starts_at));
  return { main, yours: `Starts ${yours} your time` };
}

export async function listEvents(accountId: string, spaceId: string, when: "upcoming" | "past", cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ when, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`spaces/${spaceId}/events?${query}`, z.array(eventSchema).max(50), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)
    || new Set(result.data.map(item => item.id)).size !== result.data.length
    || result.data.some(item => item.space_id !== spaceId || (when === "upcoming" ? item.ended : !item.ended))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The event list is incomplete.");
  }
  return { data: result.data, pagination: result.pagination };
}

export async function readEvent(accountId: string, eventId: string, signal?: AbortSignal) {
  const result = await api(`events/${eventId}`, eventSchema, { accountId, signal });
  if (!result.data.attendees) throw new ApiError(502, "INVALID_RESPONSE", "The event details are incomplete.");
  return checkEvent(result.data, { id: eventId });
}

export async function createEvent(intent: CreateIntent) {
  const result = await api(`spaces/${intent.spaceId}/events`, eventSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  });
  const event = checkEvent(result.data, { spaceId: intent.spaceId });
  if (event.title !== intent.body.title || event.local_start !== intent.body.local_start || event.timezone !== intent.body.timezone) {
    throw new ApiError(502, "INVALID_RESPONSE", "The created event does not match your form.");
  }
  return event;
}

export async function updateEvent(accountId: string, event: SpaceEvent, body: EventBody) {
  const result = await api(`events/${event.id}`, eventSchema, {
    method: "PATCH", accountId, body, headers: { "If-Match": event.etag ?? "" },
  });
  return checkEvent(result.data, { id: event.id, spaceId: event.space_id });
}

export async function cancelEvent(accountId: string, event: SpaceEvent) {
  const result = await api(`events/${event.id}/cancel`, eventSchema, {
    method: "POST", accountId, body: {}, headers: { "If-Match": event.etag ?? "" },
  });
  const cancelled = checkEvent(result.data, { id: event.id });
  if (cancelled.status !== "cancelled") throw new ApiError(502, "INVALID_RESPONSE", "The cancellation could not be confirmed.");
  return cancelled;
}

export async function respondToEvent(accountId: string, eventId: string, response: EventResponse) {
  const result = await api(`events/${eventId}/attendance`, eventSchema, { method: "POST", accountId, body: { response } });
  const event = checkEvent(result.data, { id: eventId });
  if (event.my_response !== response || event.my_response_outdated) throw new ApiError(502, "INVALID_RESPONSE", "Your response could not be confirmed.");
  return event;
}
