import { z } from "zod";

import { ApiError, api, characters, chars } from "@/features/identity/client";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const etagSchema = z.string().regex(/^"[a-f0-9]{64}"$/);
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) return null;
    const parts = url.pathname.replace(/^\/|\/$/g, "").split("/");
    let id: string | null = null;
    if (url.hostname === "youtu.be" && parts.length === 1) id = parts[0];
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) id = url.searchParams.get("v");
      else if (parts.length === 2 && ["shorts", "embed"].includes(parts[0])) id = parts[1];
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export const webSourceSchema = z.object({
  title: chars(1, 120),
  url: z.string().max(300).url().refine(value => {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  }, "Unsupported source address."),
  read: z.boolean(), video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable().default(null),
}).refine(source => source.video_id === null || youtubeVideoId(source.url) === source.video_id, "Video does not match its source.");
export const webTextSchema = z.object({
  run_id: uuid,
  sources: z.array(z.object({
    source: webSourceSchema,
    text: chars(1, 2600), offset: z.number().int().min(0).max(24000).nullable(), partial: z.boolean(),
  }).refine(item => item.source.read && item.source.video_id === null && (item.partial || item.offset === 0), "Invalid saved source text.")).max(8),
}).refine(value => new Set(value.sources.map(item => item.source.url)).size === value.sources.length, "Duplicate source text.");
export const runStatusSchema = z.enum([
  "queued", "running", "waiting_for_approval", "waiting_for_user", "verifying",
  "completed", "failed", "cancelled", "timed_out", "expired",
]);
export const approvalSchema = z.object({
  id: uuid, run_id: uuid, space_id: uuid.nullable(), tool_name: z.string().min(1).max(64), risk: z.enum(["low", "medium"]),
  summary: chars(1, 300), fields: z.array(z.object({ label: z.string().min(1), value: z.string() })).max(10),
  status: z.enum(["pending", "approved", "rejected", "expired", "cancelled", "superseded"]),
  reason: z.string().nullable(), result_ref: uuid.nullable(), created_at: instant, expires_at: instant,
  decided_at: instant.nullable(), version: z.string().regex(/^[1-9][0-9]*$/), etag: etagSchema,
}).refine(value => (value.status === "pending") === (value.decided_at === null), { message: "Inconsistent approval decision." });
export const spaceTypeSchema = z.enum(["family", "couple", "group", "solo"]);
export const runSchema = z.object({
  // The Main Agent (DEC-060) has no Space; each Space's agent names its Space.
  id: uuid, agent_kind: z.enum(["main", "space"]).default("space"), space_id: uuid.nullable(), message: chars(1, 2000), status: runStatusSchema,
  outcome: z.enum(["answered", "refused", "action_completed"]).nullable(), stop_reason: z.string().nullable(),
  intent: z.string().nullable(), answer: z.string().nullable(),
  sources: z.array(webSourceSchema).max(8).default([]),
  question: z.object({ id: uuid, text: z.string().min(1), expires_at: instant }).nullable(),
  approval: approvalSchema.nullable(),
  plan: z.array(z.object({
    id: z.string(), label: z.string(), kind: z.enum(["check", "tool", "approval", "response"]),
    tool: z.string().nullable(), status: z.enum(["pending", "done", "skipped", "failed"]),
  })).max(20),
  todos: z.array(z.object({ content: z.string(), status: z.enum(["pending", "in_progress", "completed"]) })).max(10).default([]),
  handoffs: z.array(z.object({ space_id: uuid, name: z.string().min(1), space_type: spaceTypeSchema })).max(6).default([]),
  tool_calls: z.array(z.object({
    id: uuid, sequence: z.number().int().positive(), tool_name: z.string(), tool_version: z.string(),
    effect: z.enum(["read", "write"]), risk: z.enum(["low", "medium"]), status: z.enum(["succeeded", "failed"]),
    summary: z.string(), result_ref: uuid.nullable(), error_code: z.string().nullable(), approval_id: uuid.nullable(), created_at: instant,
  })).max(40),
  evidence: z.array(z.object({ kind: z.enum(["task", "reminder", "memory", "roster", "policy", "event", "document", "page", "post", "comment", "report", "message", "space", "interests"]), ref: z.string().nullable(), label: z.string() })).max(60),
  events: z.array(z.object({ sequence: z.number().int().positive(), event_type: z.string(), summary: z.string(), created_at: instant })).max(40),
  created_at: instant, updated_at: instant, finished_at: instant.nullable(), version: z.string().regex(/^[1-9][0-9]*$/),
}).superRefine((run, context) => {
  if ((run.status === "waiting_for_user") !== (run.question !== null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent question." });
  if (run.status === "waiting_for_approval" && run.approval?.status !== "pending") context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing pending approval." });
});
export const runsSchema = z.array(runSchema).max(50);
export const memorySchema = z.object({
  id: uuid, kind: z.enum(["preference", "note"]), key: z.string().nullable(), label: z.string(),
  content: chars(1, 200), source: z.string(), source_run_id: uuid.nullable(), space_id: uuid.nullable().default(null), created_at: instant,
});
export const memoriesSchema = z.array(memorySchema).max(100);
const deletedSchema = z.object({ id: uuid, status: z.literal("deleted") });

export type AgentRun = z.infer<typeof runSchema>;
export type AgentApproval = z.infer<typeof approvalSchema>;
export type AgentMemory = z.infer<typeof memorySchema>;
export type AskIntent = { accountId: string; spaceId: string | null; message: string; key: string; autoApprove?: boolean };
export type DecisionIntent = { accountId: string; approval: AgentApproval; action: "approve" | "reject"; key: string };

export const statusLabels: Record<AgentRun["status"], string> = {
  queued: "Queued", running: "Working", waiting_for_approval: "Needs your approval", waiting_for_user: "Needs your answer",
  verifying: "Checking", completed: "Done", failed: "Could not finish", cancelled: "Stopped", timed_out: "Timed out", expired: "Expired",
};

export const messageSchema = z.string().trim().min(1, "Type a message.").refine(value => characters(value) <= 2000, "Keep a message under 2,000 characters.")
  .refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), "Use plain text without control characters.");
export const answerSchema = z.string().trim().min(1).refine(value => characters(value) <= 1000);
export const isWorking = (run: AgentRun) => run.status === "queued" || run.status === "running";

export async function runPage(accountId: string, spaceId: string | null, cursor: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams(spaceId ? { space_id: spaceId, limit: "20" } : { limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`agent-runs?${query}`, runsSchema, { accountId, signal });
  return { data: result.data, pagination: result.pagination ?? { next_cursor: null, has_more: false } };
}

export async function readRun(accountId: string, runId: string, signal?: AbortSignal) {
  return (await api(`agent-runs/${runId}`, runSchema, { accountId, signal })).data;
}

export async function readWebText(accountId: string, runId: string, signal?: AbortSignal) {
  const result = (await api(`agent-runs/${runId}/web-text`, webTextSchema, { accountId, signal })).data;
  if (result.run_id !== runId) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected source preview.");
  return result;
}

export async function askAgent(intent: AskIntent) {
  return (await api("agent-runs", runSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key },
    body: { ...(intent.spaceId ? { space_id: intent.spaceId } : {}), message: intent.message, ...(intent.autoApprove ? { auto_approve: true } : {}) },
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
  let result: z.infer<typeof deletedSchema>;
  try {
    result = (await api(`agent-memories/${memoryId}`, deletedSchema, { method: "DELETE", accountId, body: {} })).data;
  } catch (error) {
    // Deleting again after a lost answer finds nothing left: the memory is gone, which is what the person asked for.
    if (error instanceof ApiError && error.status === 404) return { id: memoryId, status: "deleted" as const };
    throw error;
  }
  if (result.id !== memoryId) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected response.");
  return result;
}
