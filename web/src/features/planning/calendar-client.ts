import { z } from "zod";

import { ApiError, api } from "@/features/identity/client";

const base = {
  id: z.string().uuid(), task_id: z.string().uuid(), space_id: z.string().uuid(),
  title: z.string().min(1).max(200), date: z.string().date(),
};
const calendarEntrySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("task"), scheduled_at: z.null(), timezone: z.null(),
    status: z.enum(["open", "in_progress", "completed", "cancelled"]), source_changed: z.literal(false) }),
  z.object({ ...base, kind: z.literal("reminder"), scheduled_at: z.string().datetime({ offset: true }),
    timezone: z.string().min(1).max(64), status: z.enum(["scheduled", "available", "cancelled", "suppressed", "expired", "failed"]), source_changed: z.boolean() }),
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
  return first.date.localeCompare(second.date) || Number(first.kind === "reminder") - Number(second.kind === "reminder")
    || (first.scheduled_at && second.scheduled_at ? Date.parse(first.scheduled_at) - Date.parse(second.scheduled_at) : 0)
    || first.id.localeCompare(second.id);
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
    if (entry.kind === "reminder") {
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