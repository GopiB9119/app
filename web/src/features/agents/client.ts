import { z } from "zod";

import { api } from "@/features/identity/client";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const etagSchema = z.string().regex(/^"[a-f0-9]{64}"$/);
export const runStatusSchema = z.enum([
  "queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
  "completed", "failed", "cancelled", "timed_out", "expired",
]);
export const approvalSchema = z.object({
  id: uuid, run_id: uuid, space_id: uuid, tool_name: z.string().min(1).max(64), risk: z.enum(["low", "medium"]),
  summary: z.string().min(1).max(300), fields: z.array(z.object({ label: z.string().min(1), value: z.string() })).max(10),
  status: z.enum(["pending", "approved", "rejected", "expired", "cancelled", "superseded"]),
  reason: z.string().nullable(), result_ref: uuid.nullable(), created_at: instant, expires_at: instant,
  decided_at: instant.nullable(), version: z.string().regex(/^[1-9][0-9]*$/), etag: etagSchema,
}).refine(value => (value.status === "pending") === (value.decided_at === null), { message: "Inconsistent approval decision." });
export const runSchema = z.object({
  id: uuid, space_id: uuid, message: z.string().min(1).max(500), status: runStatusSchema,
  outcome: z.enum(["answered", "refused", "action_completed"]).nullable(), stop_reason: z.string().nullable(),
  intent: z.string().nullable(), answer: z.string().nullable(),
  question: z.object({ id: uuid, text: z.string().min(1), expires_at: instant }).nullable(),
  approval: approvalSchema.nullable(),
  plan: z.array(z.object({
    id: z.string(), label: z.string(), kind: z.enum(["check", "tool", "approval", "response"]),
    tool: z.string().nullable(), status: z.enum(["pending", "done", "skipped", "failed"]),
  })).max(10),
  tool_calls: z.array(z.object({
    id: uuid, sequence: z.number().int().positive(), tool_name: z.string(), tool_version: z.string(),
    effect: z.enum(["read", "write"]), risk: z.enum(["low", "medium"]), status: z.enum(["succeeded", "failed"]),
    summary: z.string(), result_ref: uuid.nullable(), error_code: z.string().nullable(), approval_id: uuid.nullable(), created_at: instant,
  })).max(20),
  evidence: z.array(z.object({ kind: z.enum(["task", "reminder", "memory", "roster", "policy"]), ref: z.string().nullable(), label: z.string() })).max(60),
  events: z.array(z.object({ sequence: z.number().int().positive(), event_type: z.string(), summary: z.string(), created_at: instant })).max(40),
  created_at: instant, updated_at: instant, finished_at: instant.nullable(), version: z.string().regex(/^[1-9][0-9]*$/),
}).superRefine((run, context) => {
  if ((run.status === "waiting_for_user") !== (run.question !== null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent question." });
  if (run.status === "waiting_for_approval" && run.approval?.status !== "pending") context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing pending approval." });
});
export const runsSchema = z.array(runSchema).max(50);
export const memorySchema = z.object({
  id: uuid, kind: z.enum(["preference", "note"]), key: z.string().nullable(), label: z.string(),
  content: z.string().min(1).max(200), source: z.string(), source_run_id: uuid.nullable(), created_at: instant,
});
export const memoriesSchema = z.array(memorySchema).max(100);
const deletedSchema = z.object({ id: uuid, status: z.literal("deleted") });

export type AgentRun = z.infer<typeof runSchema>;
export type AgentApproval = z.infer<typeof approvalSchema>;
export type AgentMemory = z.infer<typeof memorySchema>;
export type AskIntent = { accountId: string; spaceId: string; message: string; key: string };
export type DecisionIntent = { accountId: string; approval: AgentApproval; action: "approve" | "reject"; key: string };

export const statusLabels: Record<AgentRun["status"], string> = {
  queued: "Queued", running: "Working", waiting_for_approval: "Needs your approval", waiting_for_user: "Needs your answer",
  verifying: "Checking", completed: "Done", failed: "Could not finish", cancelled: "Stopped", timed_out: "Timed out", expired: "Expired",
};

export const messageSchema = z.string().trim().min(1, "Type a request.").max(500, "Keep a request under 500 characters.")
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use one line without control characters.");

export async function runPage(accountId: string, spaceId: string, cursor: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ space_id: spaceId, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`agent-runs?${query}`, runsSchema, { accountId, signal });
  return { data: result.data, pagination: result.pagination ?? { next_cursor: null, has_more: false } };
}

export async function askAgent(intent: AskIntent) {
  return (await api("agent-runs", runSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key },
    body: { space_id: intent.spaceId, message: intent.message },
  })).data;
}

export async function answerQuestion(accountId: string, run: AgentRun, answer: string) {
  if (!run.question) throw new Error("This request has no open question.");
  return (await api(`agent-runs/${run.id}/resume`, runSchema, {
    method: "POST", accountId, body: { question_id: run.question.id, answer },
  })).data;
}

export async function decide(intent: DecisionIntent) {
  const headers: Record<string, string> = { "If-Match": intent.approval.etag };
  if (intent.action === "approve") headers["Idempotency-Key"] = intent.key;
  return (await api(`agent-approvals/${intent.approval.id}/${intent.action}`, runSchema, {
    method: "POST", accountId: intent.accountId, headers, body: {},
  })).data;
}

export async function cancelRun(accountId: string, runId: string) {
  return (await api(`agent-runs/${runId}/cancel`, runSchema, { method: "POST", accountId, body: {} })).data;
}

export async function readMemories(accountId: string, signal?: AbortSignal) {
  return (await api("agent-memories", memoriesSchema, { accountId, signal })).data;
}

export async function forgetMemory(accountId: string, memoryId: string) {
  return (await api(`agent-memories/${memoryId}`, deletedSchema, { method: "DELETE", accountId, body: {} })).data;
}
