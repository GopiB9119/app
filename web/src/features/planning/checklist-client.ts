import { z } from "zod";
import { api, ApiError, chars } from "@/features/identity/client";

const itemSchema = z.object({
  id: z.string().uuid(), title: chars(1, 200), checked: z.boolean(),
  checked_at: z.string().datetime({ offset: true }).nullable(), checked_by_account_id: z.string().uuid().nullable(),
}).refine(item => item.checked === (item.checked_at !== null) && item.checked === (item.checked_by_account_id !== null));
export const checklistSchema = z.object({
  task_id: z.string().uuid(), space_id: z.string().uuid(), task_title: chars(1, 200),
  task_status: z.enum(["open", "in_progress", "completed", "cancelled"]), task_version: z.string().regex(/^[1-9][0-9]*$/),
  can_manage: z.boolean(), can_check: z.boolean(), items: z.array(itemSchema).max(50), etag: z.string().regex(/^"[a-f0-9]{64}"$/),
}).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length
  && (!value.can_manage || value.can_check)
  && (!["completed", "cancelled"].includes(value.task_status) || !value.can_manage && !value.can_check));
export type Checklist = z.infer<typeof checklistSchema>;
export type ChecklistItem = z.infer<typeof itemSchema>;
export type ChecklistBody = { action: "add"; title: string } | { action: "rename"; item_id: string; title: string }
  | { action: "check"; item_id: string; checked: boolean } | { action: "remove"; item_id: string };
export type ChecklistIntent = { accountId: string; taskId: string; spaceId: string; etag: string; key: string; body: ChecklistBody };

function checked(value: Checklist, taskId: string, spaceId: string) {
  if (value.task_id !== taskId || value.space_id !== spaceId) throw new ApiError(502, "INVALID_RESPONSE", "This checklist belongs to another task.");
  return value;
}
export async function readChecklist(accountId: string, taskId: string, spaceId: string, signal?: AbortSignal) {
  return checked((await api(`tasks/${taskId}/checklist`, checklistSchema, { accountId, signal })).data, taskId, spaceId);
}
export async function changeChecklist(intent: ChecklistIntent) {
  return checked((await api(`tasks/${intent.taskId}/checklist`, checklistSchema, {
    accountId: intent.accountId, method: "POST", body: intent.body,
    headers: { "If-Match": intent.etag, "Idempotency-Key": intent.key },
  })).data, intent.taskId, intent.spaceId);
}