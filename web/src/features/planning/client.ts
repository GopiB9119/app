import { z } from "zod";

import { ApiError, api, characters, chars } from "@/features/identity/client";

export const taskStatusSchema = z.enum(["open", "in_progress", "completed", "cancelled"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
// DEC-029: every task has a priority; an older service that sends none means normal.
export const taskPrioritySchema = z.enum(["high", "normal", "low"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export const statusLabels: Record<TaskStatus, string> = {
  open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
export const actionLabels: Record<TaskStatus, string> = {
  open: "Reopen task", in_progress: "Start task", completed: "Complete task", cancelled: "Cancel task",
};
export const assigneeSchema = z.object({ account_id: z.string().uuid(), display_name: chars(1, 80) });
export const assigneesSchema = z.array(assigneeSchema).max(50);
const etagSchema = z.string().regex(/^"[a-f0-9]{64}"$/);
const taskRecordSchema = z.object({
  id: z.string().uuid(), space_id: z.string().uuid(),
  title: chars(1, 200), description: chars(0, 5000),
  due_date: z.string().date().nullable(), status: taskStatusSchema, priority: taskPrioritySchema.default("normal"),
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
  title: z.string().trim().min(1, "Enter a task title.").refine(value => characters(value) <= 200, "Use up to 200 characters."),
  description: chars(0, 5000),
  due_date: z.union([z.literal(""), z.string().date("Enter a valid calendar date.")]),
  assignee_account_id: z.union([z.literal(""), z.literal("unavailable"), z.string().uuid()]),
  priority: taskPrioritySchema.default("normal"),
}).strict();
export type TaskDraft = z.input<typeof taskDraftSchema>;
export type TaskIntent = { path: string; method: "POST" | "PATCH"; key: string; body: Record<string, unknown>; etag?: string };

export function taskDraft(task?: FamilyTask): TaskDraft {
  return {
    title: task?.title ?? "", description: task?.description ?? "", due_date: task?.due_date ?? "",
    assignee_account_id: task?.assignee?.account_id ?? (task?.assignee_unavailable ? "unavailable" : ""),
    priority: task?.priority ?? "normal",
  };
}

export function taskBody(draft: TaskDraft, spaceId: string, previous?: FamilyTask): Record<string, unknown> {
  const parsed = taskDraftSchema.parse(draft);
  const fields = {
    title: parsed.title, description: parsed.description,
    due_date: parsed.due_date || null, assignee_account_id: parsed.assignee_account_id || null,
    priority: parsed.priority,
  };
  if (!previous) {
    if (parsed.assignee_account_id === "unavailable") throw new Error("Select a current assignee.");
    // Normal is the service's default, so a plain task is created with exactly the fields it always had.
    const { priority, ...plain } = fields;
    return { space_id: spaceId, ...plain, ...(priority === "normal" ? {} : { priority }) };
  }
  const original = taskDraft(previous);
  const changed: Record<string, unknown> = {};
  for (const field of ["title", "description", "due_date", "assignee_account_id", "priority"] as const) {
    if (parsed[field] !== original[field]) changed[field] = fields[field];
  }
  if (changed.assignee_account_id === "unavailable") throw new Error("Select a current assignee.");
  if (Object.keys(changed).length === 0) throw new Error("No changes to save.");
  return changed;
}

/** Filters for the task list: `assignee` is an account ID or "none"; dates are YYYY-MM-DD, both days included. */
export type TaskFilters = { assignee?: string; due_from?: string; due_to?: string };
export type DueChoice = "" | "before" | "today" | "week";

function shiftDate(value: string, days: number) {
  const moment = new Date(`${value}T12:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** Today's calendar date where the person lives, as YYYY-MM-DD. */
export function localDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dueRange(choice: DueChoice, today: string): Pick<TaskFilters, "due_from" | "due_to"> {
  if (choice === "before") return { due_to: shiftDate(today, -1) };
  if (choice === "today") return { due_from: today, due_to: today };
  if (choice === "week") return { due_from: today, due_to: shiftDate(today, 6) };
  return {};
}

export async function taskPage(accountId: string, spaceId: string, status: TaskStatus | "", cursor: string | null, signal: AbortSignal, filters: TaskFilters = {}) {
  const query = new URLSearchParams({ space_id: spaceId, limit: "20" });
  if (status) query.set("status", status);
  for (const name of ["assignee", "due_from", "due_to"] as const) {
    const value = filters[name];
    if (value) query.set(name, value);
  }
  if (cursor) query.set("cursor", cursor);
  const result = await api(`tasks?${query}`, z.array(taskItemSchema).max(50), { accountId, signal });
  if (!result.pagination) throw new ApiError(502, "INVALID_RESPONSE", "Task pagination is missing.");
  return { data: result.data, pagination: result.pagination };
}

export function taskAssignees(accountId: string, spaceId: string, taskId: string | undefined, signal: AbortSignal) {
  const query = new URLSearchParams({ space_id: spaceId });
  if (taskId) query.set("task_id", taskId);
  return api(`tasks/assignees?${query}`, assigneesSchema, { accountId, signal });
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