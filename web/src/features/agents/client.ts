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
  retrieved_at: instant.nullable().optional(),
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
const runPayloadSchema = z.object({
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
  evidence: z.array(z.object({ kind: z.enum(["task", "reminder", "memory", "roster", "policy", "event", "poll", "document", "page", "post", "comment", "report", "message", "space", "interests"]), ref: z.string().nullable(), label: z.string() })).max(60),
  events: z.array(z.object({ sequence: z.number().int().positive(), event_type: z.string(), summary: z.string(), created_at: instant })).max(40),
  created_at: instant, updated_at: instant, finished_at: instant.nullable(), version: z.string().regex(/^[1-9][0-9]*$/),
});
export const messagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({ type: z.literal("markdown"), content: z.string() }),
  z.object({ type: z.literal("activity"), events: runPayloadSchema.shape.events }),
  z.object({ type: z.literal("task"), plan: runPayloadSchema.shape.plan, todos: runPayloadSchema.shape.todos }),
  z.object({ type: z.literal("tool"), call: runPayloadSchema.shape.tool_calls.element }),
  z.object({ type: z.literal("sources"), sources: runPayloadSchema.shape.sources }),
  z.object({ type: z.literal("evidence"), items: runPayloadSchema.shape.evidence }),
  z.object({ type: z.literal("approval"), approval: approvalSchema }),
  z.object({ type: z.literal("question"), question: runPayloadSchema.shape.question.unwrap() }),
  z.object({ type: z.literal("handoffs"), handoffs: runPayloadSchema.shape.handoffs }),
]);
export const interactionSchema = z.object({
  schema_version: z.literal(1), run_id: uuid, agent_kind: z.enum(["main", "space"]), space_id: uuid.nullable(), status: runStatusSchema,
  messages: z.array(z.object({
    id: z.string().max(50), role: z.enum(["user", "agent"]), parts: z.array(messagePartSchema).max(50), created_at: instant,
  })).length(2),
});
export type AgentMessagePart = z.infer<typeof messagePartSchema>;
export type AgentInteraction = z.infer<typeof interactionSchema>;

function projectInteraction(run: z.infer<typeof runPayloadSchema>): AgentInteraction {
  const parts: AgentMessagePart[] = [];
  if (run.answer) parts.push({ type: "markdown", content: run.answer });
  if (run.events.length) parts.push({ type: "activity", events: run.events });
  if (run.plan.length || run.todos.length) parts.push({ type: "task", plan: run.plan, todos: run.todos });
  parts.push(...run.tool_calls.map(call => ({ type: "tool" as const, call })));
  if (run.sources.length) parts.push({ type: "sources", sources: run.sources });
  if (run.evidence.length) parts.push({ type: "evidence", items: run.evidence });
  if (run.approval) parts.push({ type: "approval", approval: run.approval });
  if (run.question) parts.push({ type: "question", question: run.question });
  if (run.handoffs.length) parts.push({ type: "handoffs", handoffs: run.handoffs });
  return {
    schema_version: 1, run_id: run.id, agent_kind: run.agent_kind, space_id: run.space_id, status: run.status,
    messages: [
      { id: `${run.id}:request`, role: "user", parts: [{ type: "text", content: run.message }], created_at: run.created_at },
      { id: `${run.id}:response`, role: "agent", parts, created_at: run.finished_at ?? run.updated_at },
    ],
  };
}

function protocolIdentity(value: AgentInteraction) {
  return JSON.stringify(value, (key, item: unknown) => {
    if (typeof item !== "string" || !["id", "run_id", "space_id", "ref", "result_ref", "approval_id"].includes(key)) return item;
    if (uuid.safeParse(item).success) return item.toLowerCase();
    const message = item.match(/^([0-9a-f-]{36}):(request|response)$/i);
    return message && uuid.safeParse(message[1]).success ? `${message[1].toLowerCase()}:${message[2]}` : item;
  });
}

export const runSchema = runPayloadSchema.extend({ interaction: interactionSchema.optional() }).superRefine((run, context) => {
  if ((run.agent_kind === "main") !== (run.space_id === null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent Agent scope." });
  if (run.approval && (run.approval.run_id.toLowerCase() !== run.id.toLowerCase()
    || (run.approval.space_id?.toLowerCase() ?? null) !== (run.space_id?.toLowerCase() ?? null))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Approval does not belong to this Agent run." });
  }
  if ((run.status === "waiting_for_user") !== (run.question !== null)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent question." });
  if (run.status === "waiting_for_approval" && run.approval?.status !== "pending") context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing pending approval." });
  if (run.interaction && protocolIdentity(run.interaction) !== protocolIdentity(projectInteraction(run))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["interaction"], message: "Interaction does not match its authorized Agent run." });
  }
});
export function agentInteraction(run: AgentRun): AgentInteraction {
  return run.interaction ?? projectInteraction(run);
}
export const runsSchema = z.array(runSchema).max(50);
export const memorySchema = z.object({
  id: uuid, kind: z.enum(["preference", "note"]), key: z.string().nullable(), label: z.string(),
  content: chars(1, 200), source: z.string(), source_run_id: uuid.nullable(), space_id: uuid.nullable().default(null), created_at: instant,
  enabled: z.boolean().optional(), version: z.string().regex(/^[1-9][0-9]*$/).optional(), etag: etagSchema.optional(),
}).refine(memory => [memory.enabled, memory.version, memory.etag].filter(value => value !== undefined).length % 3 === 0,
  "Memory controls require complete review metadata.");
export const memoriesSchema = z.array(memorySchema).max(100);
const deletedSchema = z.object({ id: uuid, status: z.literal("deleted") });

export type AgentRun = z.infer<typeof runSchema>;
export type AgentApproval = z.infer<typeof approvalSchema>;
export type AgentMemory = z.infer<typeof memorySchema>;
export type MemoryEditIntent = { accountId: string; memory: AgentMemory; changes: { content?: string; enabled?: boolean }; key: string };
export type AskIntent = { accountId: string; spaceId: string | null; message: string; key: string; autoApprove?: boolean };
export type DecisionIntent = { accountId: string; approval: AgentApproval; action: "approve" | "reject"; key: string };

export const statusLabels: Record<AgentRun["status"], string> = {
  queued: "Queued", running: "Working", waiting_for_approval: "Needs your approval", waiting_for_user: "Needs your answer",
  verifying: "Checking", completed: "Done", failed: "Could not finish", cancelled: "Stopped", timed_out: "Timed out", expired: "Expired",
};

export const messageSchema = z.string().trim().min(1, "Type a message.").refine(value => characters(value) <= 2000, "Keep a message under 2,000 characters.")
  .refine(value => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), "Use plain text without control characters.");
export const answerSchema = z.string().trim().min(1).refine(value => characters(value) <= 1000);
export const isWorking = (run: AgentRun) => run.status === "queued" || run.status === "running" || run.status === "verifying";

export type RunFilter = "all" | "working" | "waiting_for_approval" | "waiting_for_user" | "completed" | "failed" | "cancelled" | "needs_you";
export const runFilters: Record<RunFilter, readonly AgentRun["status"][]> = {
  all: runStatusSchema.options,
  working: ["queued", "running", "verifying"],
  waiting_for_approval: ["waiting_for_approval"],
  waiting_for_user: ["waiting_for_user"],
  completed: ["completed"],
  failed: ["failed", "timed_out", "expired"],
  cancelled: ["cancelled"],
  needs_you: ["waiting_for_approval", "waiting_for_user"],
};

export async function runPage(accountId: string, spaceId: string | null, cursor: string | null, signal?: AbortSignal, status: RunFilter = "all") {
  const query = new URLSearchParams(spaceId ? { space_id: spaceId, limit: "20" } : { limit: "20" });
  if (cursor) query.set("cursor", cursor);
  if (status !== "all") query.set("status", status);
  const result = await api(`agent-runs?${query}`, runsSchema, { accountId, signal });
  const pagination = result.pagination ?? { next_cursor: null, has_more: false };
  if (result.data.length > 20 || new Set(result.data.map(run => run.id.toLowerCase())).size !== result.data.length
    || result.data.some(run => (run.space_id?.toLowerCase() ?? null) !== (spaceId?.toLowerCase() ?? null)
      || run.agent_kind !== (spaceId ? "space" : "main") || !runFilters[status].includes(run.status))
    || pagination.has_more !== !!pagination.next_cursor
    || pagination.has_more && (result.data.length === 0 || pagination.next_cursor === cursor)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected request list.");
  }
  return { data: result.data, pagination };
}

function matchingRunSchema(runId: string | undefined, spaceId?: string | null) {
  return runSchema.refine(run => (runId === undefined || run.id.toLowerCase() === runId.toLowerCase())
    && (spaceId === undefined || (run.space_id?.toLowerCase() ?? null) === (spaceId?.toLowerCase() ?? null)
      && run.agent_kind === (spaceId ? "space" : "main")), "The response does not match the requested Agent run.");
}

export async function readRun(accountId: string, runId: string, signal?: AbortSignal) {
  return (await api(`agent-runs/${runId}`, matchingRunSchema(runId), { accountId, signal })).data;
}

export async function readWebText(accountId: string, runId: string, signal?: AbortSignal) {
  const result = (await api(`agent-runs/${runId}/web-text`, webTextSchema, { accountId, signal })).data;
  if (result.run_id !== runId) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected source preview.");
  return result;
}

export async function askAgent(intent: AskIntent) {
  return (await api("agent-runs", matchingRunSchema(undefined, intent.spaceId), {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key },
    body: { ...(intent.spaceId ? { space_id: intent.spaceId } : {}), message: intent.message, ...(intent.autoApprove ? { auto_approve: true } : {}) },
  })).data;
}

export async function answerQuestion(accountId: string, run: AgentRun, answer: string) {
  if (!run.question) throw new Error("This request has no open question.");
  return (await api(`agent-runs/${run.id}/resume`, matchingRunSchema(run.id, run.space_id), {
    method: "POST", accountId, body: { question_id: run.question.id, answer },
  })).data;
}

export async function decide(intent: DecisionIntent) {
  const headers: Record<string, string> = { "If-Match": intent.approval.etag };
  if (intent.action === "approve") headers["Idempotency-Key"] = intent.key;
  return (await api(`agent-approvals/${intent.approval.id}/${intent.action}`, matchingRunSchema(intent.approval.run_id, intent.approval.space_id), {
    method: "POST", accountId: intent.accountId, headers, body: {},
  })).data;
}

export async function cancelRun(accountId: string, runId: string, spaceId?: string | null) {
  return (await api(`agent-runs/${runId}/cancel`, matchingRunSchema(runId, spaceId), { method: "POST", accountId, body: {} })).data;
}

export async function readMemories(accountId: string, signal?: AbortSignal) {
  return (await api("agent-memories", memoriesSchema, { accountId, signal })).data;
}

export async function editMemory(intent: MemoryEditIntent) {
  const { memory } = intent;
  if (memory.enabled === undefined || !memory.version || !memory.etag) {
    throw new ApiError(428, "PRECONDITION_REQUIRED", "Reload this memory before editing it.");
  }
  const result = (await api(`agent-memories/${memory.id}`, memorySchema, {
    method: "PATCH", accountId: intent.accountId,
    headers: { "If-Match": memory.etag, "Idempotency-Key": intent.key }, body: intent.changes,
  })).data;
  const changing = intent.changes.content !== undefined && intent.changes.content !== memory.content
    || intent.changes.enabled !== undefined && intent.changes.enabled !== memory.enabled;
  const prior = BigInt(memory.version);
  const current = result.version ? BigInt(result.version) : null;
  if (result.id.toLowerCase() !== memory.id.toLowerCase()
    || (result.space_id?.toLowerCase() ?? null) !== (memory.space_id?.toLowerCase() ?? null)
    || result.kind !== memory.kind || result.key !== memory.key || result.enabled === undefined || !result.etag
    || current === null || current < prior || changing && current === prior
    || current === prior && (result.content !== memory.content || result.enabled !== memory.enabled || result.etag !== memory.etag)
    || current > prior && result.etag === memory.etag) {
    throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected memory change.");
  }
  return result;
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
