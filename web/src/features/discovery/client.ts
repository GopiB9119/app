import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const MAX_QUERY = 200;
export const FIRST_PAGE = 20;
export const TASK_LABELS = { open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" } as const;
export const EVENT_LABELS = { scheduled: "Scheduled", cancelled: "Cancelled" } as const;
const text = z.string().max(2000);

export const documentHitSchema = z.object({
  document_id: uuid, space_id: uuid, space_name: z.string().min(1).max(200), name: z.string().min(1).max(480),
  media_type: z.enum(["text/plain", "text/markdown", "text/csv"]), start_line: z.number().int().min(1), end_line: z.number().int().min(1),
  excerpt: text, added_at: timestamp,
}).refine(hit => hit.end_line >= hit.start_line, { message: "Inconsistent lines." });
export const taskHitSchema = z.object({
  task_id: uuid, space_id: uuid, space_name: z.string().min(1).max(200), title: z.string().min(1).max(400), excerpt: text,
  status: z.enum(["open", "in_progress", "completed", "cancelled"]), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export const eventHitSchema = z.object({
  event_id: uuid, space_id: uuid, space_name: z.string().min(1).max(200), title: z.string().min(1).max(400), excerpt: text,
  status: z.enum(["scheduled", "cancelled"]), starts_at: timestamp, timezone: z.string().min(1).max(64),
  local_start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});
export const searchSchema = z.object({
  query: z.string().max(MAX_QUERY * 2), space_id: uuid.nullable(),
  documents: z.array(documentHitSchema).max(FIRST_PAGE), tasks: z.array(taskHitSchema).max(FIRST_PAGE), events: z.array(eventHitSchema).max(FIRST_PAGE),
  more_documents: z.boolean(), more_tasks: z.boolean(), more_events: z.boolean(),
});
export type SearchResults = z.infer<typeof searchSchema>;

export function normalizeQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function queryProblem(value: string) {
  const query = normalizeQuery(value);
  if (!query) return "Enter at least one word to search for.";
  if ([...query].length > MAX_QUERY) return `Search for up to ${MAX_QUERY} characters.`;
  return null;
}

export async function searchSpaces(accountId: string, value: string, spaceId: string, signal?: AbortSignal) {
  const parameters = new URLSearchParams({ q: normalizeQuery(value) });
  if (spaceId) parameters.set("space_id", spaceId);
  const result = (await api(`search?${parameters}`, searchSchema, { accountId, signal })).data;
  const wrongSpace = (hit: { space_id: string }) => Boolean(spaceId) && hit.space_id !== spaceId;
  if ((spaceId && result.space_id !== spaceId) || [...result.documents, ...result.tasks, ...result.events].some(wrongSpace)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The results do not match your search.");
  }
  return result;
}

export function documentLink(hit: { space_id: string; document_id: string; start_line: number; end_line: number }) {
  const query = new URLSearchParams({ space_id: hit.space_id, id: hit.document_id, line: String(hit.start_line), end: String(hit.end_line) });
  return `/app/documents?${query}`;
}

export const taskLink = (hit: { space_id: string }) => `/app/tasks?${new URLSearchParams({ space_id: hit.space_id })}`;
export const eventLink = (hit: { space_id: string }) => `/app/events?${new URLSearchParams({ space_id: hit.space_id })}`;

export function searchWords(value: string) {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []))].sort((left, right) => right.length - left.length);
}

// Splits text into plain and marked pieces. Words match from their beginning, like the search itself.
export function highlight(value: string, words: string[]) {
  const pieces: { text: string; marked: boolean }[] = [];
  let last = 0;
  for (const token of value.matchAll(/[\p{L}\p{M}\p{N}_]+/gu)) {
    const lowered = token[0].toLowerCase();
    const word = words.find(candidate => lowered.startsWith(candidate));
    if (!word) continue;
    const start = token.index ?? 0;
    const end = start + [...token[0]].slice(0, [...word].length).join("").length;
    if (start > last) pieces.push({ text: value.slice(last, start), marked: false });
    pieces.push({ text: value.slice(start, end), marked: true });
    last = end;
  }
  if (last < value.length) pieces.push({ text: value.slice(last), marked: false });
  return pieces;
}
