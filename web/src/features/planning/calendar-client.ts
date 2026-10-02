import { z } from "zod";

import { ApiError, api, chars } from "@/features/identity/client";

const base = {
  id: z.string().uuid(), space_id: z.string().uuid(),
  title: chars(1, 200), date: z.string().date(),
};
const taskId = z.string().uuid();
const timed = {
  scheduled_at: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(64), source_changed: z.boolean(),
};
const calendarEntrySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("task"), task_id: taskId, scheduled_at: z.null(), timezone: z.null(),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]), source_changed: z.literal(false), series_id: z.null().optional() }),
  z.object({ ...base, kind: z.literal("reminder"), task_id: taskId, ...timed,
    status: z.enum(["scheduled", "available", "cancelled", "suppressed", "expired", "failed"]), series_id: z.string().uuid().nullable().optional() }),
  z.object({ ...base, kind: z.literal("planned"), task_id: taskId, ...timed, status: z.literal("planned"), series_id: z.string().uuid() }),
  // Space events belong to the Space, not to a task.
  z.object({ ...base, kind: z.literal("event"), task_id: z.null(), ...timed, source_changed: z.literal(false),
    status: z.enum(["scheduled", "cancelled"]), series_id: z.null().optional() }),
]);
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export function dateInZone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === kind)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function calendarRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "1900-01" || month > "2100-12") {
    throw new ApiError(422, "CALENDAR_RANGE_INVALID", "Select a month between 1900 and 2100.");
  }
  const start = `${month}-01`;
  const last = new Date(`${start}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { start, end: last.toISOString().slice(0, 10) };
}

export function adjacentMonth(month: string, offset: number) {
  const date = new Date(`${calendarRange(month).start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function compareCalendarEntries(first: CalendarEntry, second: CalendarEntry) {
  return first.date.localeCompare(second.date) || Number(first.kind !== "task") - Number(second.kind !== "task")
    || (first.scheduled_at && second.scheduled_at ? Date.parse(first.scheduled_at) - Date.parse(second.scheduled_at) : 0)
    || first.id.localeCompare(second.id);
}

const fileKinds: Record<CalendarEntry["kind"], string> = { task: "Task due", reminder: "Reminder", planned: "Planned reminder", event: "Event" };

function utf8Length(character: string) {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

function icsInstant(value: string | Date) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Lines longer than 75 bytes continue on the next line after one space, without splitting a character.
function fold(line: string) {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const bytes = utf8Length(character);
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** A calendar file (iCalendar) copy of the loaded entries. It does not update when the calendar changes. */
export function calendarFile(entries: CalendarEntry[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Community Platform//Calendar copy//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const entry of entries) {
    lines.push("BEGIN:VEVENT", `UID:${entry.kind}-${entry.id}@community-platform.local`, `DTSTAMP:${icsInstant(now)}`);
    if (entry.kind === "task") {
      const next = new Date(`${entry.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${entry.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${icsInstant(entry.scheduled_at)}`);
    }
    lines.push(`SUMMARY:${icsText(`${fileKinds[entry.kind]}: ${entry.title}`)}`, `CATEGORIES:${icsText(fileKinds[entry.kind])}`);
    if (entry.status === "cancelled") lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export async function calendarPage(accountId: string, spaceId: string, month: string, timezone: string, cursor: string | null, signal?: AbortSignal) {
  const range = calendarRange(month);
  const query = new URLSearchParams({ space_id: spaceId, start_date: range.start, end_date: range.end, timezone, limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`calendar?${query}`, z.array(calendarEntrySchema).max(100), { accountId, signal });
  const invalid = () => new ApiError(502, "INVALID_RESPONSE", "The calendar could not be confirmed. Reload this view.");
  if (!result.pagination || result.pagination.next_cursor === cursor && cursor !== null || result.pagination.has_more && result.data.length === 0) throw invalid();
  const identifiers = new Set<string>();
  for (const [index, entry] of result.data.entries()) {
    const key = `${entry.kind}:${entry.id}`;
    if (entry.space_id !== spaceId || entry.date < range.start || entry.date > range.end || identifiers.has(key)) throw invalid();
    if (entry.kind === "task" && entry.id !== entry.task_id) throw invalid();
    if (entry.kind !== "task") {
      try {
        if (dateInZone(new Date(entry.scheduled_at), timezone) !== entry.date) throw invalid();
        new Intl.DateTimeFormat("en", { timeZone: entry.timezone }).format(new Date(entry.scheduled_at));
      } catch { throw invalid(); }
    }
    if (index > 0 && compareCalendarEntries(result.data[index - 1], entry) >= 0) throw invalid();
    identifiers.add(key);
  }
  return { data: result.data, pagination: result.pagination };
}