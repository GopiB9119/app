import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const MAX_BYTES = 524288;
export const MAX_NAME = 120;
export const ACCEPT = ".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv";
export const EXTENSIONS = [".txt", ".md", ".markdown", ".csv"] as const;
export const MEDIA_TYPES = ["text/plain", "text/markdown", "text/csv"] as const;
export const KIND_LABELS: Record<(typeof MEDIA_TYPES)[number], string> = { "text/plain": "Text", "text/markdown": "Markdown", "text/csv": "CSV" };
export const NOT_UTF8 = "This file is not UTF-8 text.";

export const documentSchema = z.object({
  id: uuid, space_id: uuid, space_name: z.string().min(1).max(200), status: z.enum(["active", "deleted"]),
  name: z.string().min(1).max(MAX_NAME * 4).nullable(), media_type: z.enum(MEDIA_TYPES).nullable(),
  size_bytes: z.number().int().nonnegative().nullable(), line_count: z.number().int().nonnegative().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(), added_by_name: z.string().max(200),
  added_at: timestamp, deleted_at: timestamp.nullable(), can_delete: z.boolean(),
}).superRefine((value, context) => {
  const kept = [value.name, value.media_type, value.size_bytes, value.line_count, value.sha256];
  const consistent = value.status === "active"
    ? kept.every(item => item !== null) && value.deleted_at === null
    : kept.every(item => item === null) && value.deleted_at !== null && !value.can_delete;
  if (!consistent) context.addIssue({ code: "custom", message: "Inconsistent document." });
});
export const detailSchema = documentSchema.and(z.object({ content: z.string().max(MAX_BYTES * 4).nullable() }));
export const deletedSchema = z.object({ id: uuid, space_id: uuid, status: z.literal("deleted"), deleted_at: timestamp });
export type SpaceDocument = z.infer<typeof documentSchema>;
export type DocumentDetail = z.infer<typeof detailSchema>;
export type AddIntent = { accountId: string; spaceId: string; key: string; body: { name: string; content: string } };

// The same rules as the server, checked first so a refused file never leaves the browser.
export function fileProblem(file: { name: string; size: number }) {
  const name = file.name.trim();
  const lowered = name.toLowerCase();
  if (!EXTENSIONS.some(extension => lowered.endsWith(extension) && lowered.length > extension.length)) {
    return "Add a .txt, .md or .csv file. Other file types need a virus scanner, which is not available yet.";
  }
  if ([...name].length > MAX_NAME) return `File names can have up to ${MAX_NAME} characters.`;
  if (/[/\\]/.test(name)) return "Use a file name without folders.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return "A document can be at most 512 KB.";
  return null;
}

export function decodeText(bytes: ArrayBuffer | Uint8Array): { text: string } | { problem: string } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { problem: NOT_UTF8 };
  }
}

export function formatSize(bytes: number) {
  return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
}

export function countLines(count: number) {
  return `${count} ${count === 1 ? "line" : "lines"}`;
}

// A final line break ends the last line instead of starting another, as on the server.
export function splitLines(text: string) {
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function checkSpace(value: { space_id: string }, spaceId: string) {
  if (value.space_id !== spaceId) throw new ApiError(502, "INVALID_RESPONSE", "The document does not match your request.");
}

export async function listDocuments(accountId: string, spaceId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`spaces/${spaceId}/documents?${query}`, z.array(documentSchema).max(50), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)
    || new Set(result.data.map(item => item.id)).size !== result.data.length
    || result.data.some(item => item.space_id !== spaceId || item.status !== "active")) {
    throw new ApiError(502, "INVALID_RESPONSE", "The document list is incomplete.");
  }
  return { data: result.data, pagination: result.pagination };
}

export async function readDocument(accountId: string, documentId: string, signal?: AbortSignal) {
  const result = await api(`documents/${documentId}`, detailSchema, { accountId, signal });
  const document = result.data;
  if (document.id !== documentId || document.status !== "active" || document.content === null) {
    throw new ApiError(502, "INVALID_RESPONSE", "The document could not be shown.");
  }
  return { ...document, content: document.content };
}

export async function addDocument(intent: AddIntent) {
  const result = await api(`spaces/${intent.spaceId}/documents`, documentSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  });
  checkSpace(result.data, intent.spaceId);
  return result.data;
}

export async function deleteDocument(accountId: string, document: { id: string; space_id: string }) {
  const result = await api(`documents/${document.id}/delete`, deletedSchema, { method: "POST", accountId, body: {} });
  if (result.data.id !== document.id) throw new ApiError(502, "INVALID_RESPONSE", "The deletion could not be confirmed.");
  checkSpace(result.data, document.space_id);
  return result.data;
}

export function isCursorProblem(error: unknown) {
  return error instanceof ApiError && ["CURSOR_EXPIRED", "CURSOR_INVALID"].includes(error.code);
}

// Lines to mark in the viewer, from the address; nothing is marked when the numbers do not make sense.
export function lineRange(line: string | undefined, end: string | undefined) {
  const first = Number(line);
  if (!line || !Number.isInteger(first) || first < 1 || first > 1000000) return null;
  const last = Number(end);
  return { start: first, end: end && Number.isInteger(last) && last >= first && last <= 1000000 ? last : first };
}
