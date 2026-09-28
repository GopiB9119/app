import { z } from "zod";

import { ApiError, api } from "@/features/identity/client";

export const taskStatusSchema = z.enum(["open", "in_progress", "completed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const statusLabels: Record<TaskStatus, string> = {
  open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
export const actionLabels: Record<TaskStatus, string> = {
  open: "Reopen task", in_progress: "Start task", completed: "Complete task", cancelled: "Cancel task",
};
export const assigneeSchema = z.object({ account_id: z.string().uuid(), display_name: z.string().min(1).max(80) });
export const assigneesSchema = z.array(assigneeSchema).max(50);
const etagSchema = z.string().regex(/^"[a-f0-9]{64}"$/);
const taskRecordSchema = z.object({
  id: z.string().uuid(), space_id: z.string().uuid(),
  title: z.string().min(1).max(200), description: z.string().max(5000),
  due_date: z.string().date().nullable(), status: taskStatusSchema,
  assignee: assigneeSchema.nullable(), assignee_unavailable: z.boolean(),
  created_by_account_id: z.string().uuid(), completed_by_account_id: z.string().uuid().nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }), updated_at: z.string().datetime({ offset: true }),
  version: z.string().regex(/^[1-9][0-9]*$/),
  permissions: z.object({ can_edit: z.boolean(), allowed_statuses: z.array(taskStatusSchema).max(4) }),
});

function checkTask(task: z.infer<typeof taskRecordSchema>, context: z.RefinementCtx) {
  const completed = task.status === "completed";
  if (completed !== (task.completed_at !== null) || completed !== (task.completed_by_account_id !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent task completion." });
  }
  if (task.assignee && task.assignee_unavailable) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent task assignment." });
  }
}

export const taskSchema = taskRecordSchema.superRefine(checkTask);
export const taskItemSchema = taskRecordSchema.extend({ etag: etagSchema }).superRefine(checkTask);
export type FamilyTask = z.infer<typeof taskSchema>;
export type TaskItem = z.infer<typeof taskItemSchema>;

export const taskDraftSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(200),
  description: z.string().max(5000),
  due_date: z.union([z.literal(""), z.string().date("Enter a valid calendar date.")]),
  assignee_account_id: z.union([z.literal(""), z.literal("unavailable"), z.string().uuid()]),
}).strict();
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type TaskIntent = { path: string; method: "POST" | "PATCH"; key: string; body: Record<string, unknown>; etag?: string };

export function taskDraft(task?: FamilyTask): TaskDraft {
  return {
    title: task?.title ?? "", description: task?.description ?? "", due_date: task?.due_date ?? "",
    assignee_account_id: task?.assignee?.account_id ?? (task?.assignee_unavailable ? "unavailable" : ""),
  };
}

export function taskBody(draft: TaskDraft, spaceId: string, previous?: FamilyTask): Record<string, unknown> {
  const parsed = taskDraftSchema.parse(draft);
  const fields = {
    title: parsed.title, description: parsed.description,
    due_date: parsed.due_date || null, assignee_account_id: parsed.assignee_account_id || null,
  };
  if (!previous) {
    if (parsed.assignee_account_id === "unavailable") throw new Error("Select a current assignee.");
    return { space_id: spaceId, ...fields };
  }
  const original = taskDraft(previous);
  const changed: Record<string, unknown> = {};
  for (const field of ["title", "description", "due_date", "assignee_account_id"] as const) {
    if (parsed[field] !== original[field]) changed[field] = fields[field];
  }
  if (changed.assignee_account_id === "unavailable") throw new Error("Select a current assignee.");
  if (Object.keys(changed).length === 0) throw new Error("No changes to save.");
  return changed;
}

export async function taskPage(accountId: string, spaceId: string, status: TaskStatus | "", cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams({ space_id: spaceId, limit: "20" });
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  const result = await api(`tasks?${query}`, z.array(taskItemSchema).max(50), { accountId, signal });
  if (!result.pagination) throw new ApiError(502, "INVALID_RESPONSE", "Task pagination is missing.");
  return { data: result.data, pagination: result.pagination };
}

export async function sendTask(intent: TaskIntent, accountId: string): Promise<TaskItem> {
  const result = await api(intent.path, taskSchema, {
    method: intent.method, body: intent.body, accountId,
    headers: { "Idempotency-Key": intent.key, ...(intent.etag ? { "If-Match": intent.etag } : {}) },
  });
  const parsed = taskItemSchema.safeParse({ ...result.data, etag: result.etag });
  if (!parsed.success) throw new ApiError(502, "INVALID_RESPONSE", "The task result could not be confirmed.");
  return parsed.data;
}

export async function readTask(identifier: string, accountId: string): Promise<TaskItem> {
  const result = await api(`tasks/${identifier}`, taskSchema, { accountId });
  const parsed = taskItemSchema.safeParse({ ...result.data, etag: result.etag });
  if (!parsed.success) throw new ApiError(502, "INVALID_RESPONSE", "Reload the task to continue.");
  return parsed.data;
}