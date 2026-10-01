import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const position = z.string().regex(/^(0|[1-9][0-9]{0,9})$/);
const timestamp = z.string().datetime({ offset: true });
export const MAX_MESSAGE_CHARACTERS = 2000;

export const participantSchema = z.object({ account_id: uuid, display_name: z.string().min(1).max(80) });
export const conversationSchema = z.object({
  id: uuid, space_id: uuid, space_name: z.string().min(1).max(80),
  kind: z.enum(["space", "direct"]), title: z.string().min(1).max(80),
  participants: z.array(participantSchema).max(2), can_send: z.boolean(),
  protection: z.literal("server_encrypted"),
  last_position: position, read_position: position, unread_count: z.number().int().nonnegative(),
  last_message_at: timestamp.nullable(), created_at: timestamp,
}).superRefine((value, context) => {
  const direct = value.kind === "direct";
  if (direct !== (value.participants.length === 2) || Number(value.read_position) > Number(value.last_position)
    || (value.last_message_at === null) !== (value.last_position === "0")
    || (direct && value.participants[0].account_id === value.participants[1].account_id)) {
    context.addIssue({ code: "custom", message: "Inconsistent conversation." });
  }
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: uuid, conversation_id: uuid, position: position.refine(value => value !== "0"),
  sender_account_id: uuid, sender_name: z.string().min(1).max(80), mine: z.boolean(),
  client_message_id: uuid.nullable(), status: z.enum(["sent", "deleted", "unavailable"]),
  // The server counts characters; UTF-16 surrogate pairs can double the JavaScript length.
  body: z.string().min(1).max(MAX_MESSAGE_CHARACTERS * 2).nullable(),
  created_at: timestamp, deleted_at: timestamp.nullable(),
}).superRefine((value, context) => {
  if ((value.status === "sent") !== (value.body !== null) || (value.status === "deleted") !== (value.deleted_at !== null)
    || value.mine !== (value.client_message_id !== null)) {
    context.addIssue({ code: "custom", message: "Inconsistent message." });
  }
});
export type Message = z.infer<typeof messageSchema>;
export type SendIntent = { accountId: string; conversationId: string; key: string; body: string };

function checkConversation(accountId: string, value: Conversation, expected?: { id?: string; spaceId?: string }) {
  if ((expected?.id && value.id !== expected.id) || (expected?.spaceId && value.space_id !== expected.spaceId)
    || (value.kind === "direct" && !value.participants.some(participant => participant.account_id === accountId))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The conversation does not match this account.");
  }
  return value;
}

function checkMessage(accountId: string, conversationId: string, value: Message) {
  if (value.conversation_id !== conversationId || value.mine !== (value.sender_account_id === accountId)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The message does not belong to this conversation.");
  }
  return value;
}

export function normalizeBody(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

export function bodyProblem(value: string) {
  const body = normalizeBody(value);
  if (!body) return "Write a message first.";
  if ([...body].length > MAX_MESSAGE_CHARACTERS) return `Messages can have up to ${MAX_MESSAGE_CHARACTERS} characters.`;
  if (/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(body)) return "Remove control characters from the message.";
  return null;
}

export async function openConversation(accountId: string, spaceId: string, participantId?: string) {
  const body = participantId ? { kind: "direct", participant_account_id: participantId } : { kind: "space" };
  const result = await api(`spaces/${spaceId}/conversations`, conversationSchema, { method: "POST", accountId, body });
  const conversation = checkConversation(accountId, result.data, { spaceId });
  if (conversation.kind !== (participantId ? "direct" : "space")
    || (participantId && !conversation.participants.some(participant => participant.account_id === participantId))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The opened conversation does not match your choice.");
  }
  return conversation;
}

export async function conversationPage(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`conversations?${query}`, z.array(conversationSchema).max(50), { accountId, signal });
  if (!result.pagination || result.unreadCount === undefined || (cursor && result.pagination.next_cursor === cursor)
    || new Set(result.data.map(item => item.id)).size !== result.data.length) {
    throw new ApiError(502, "INVALID_RESPONSE", "The conversation list is incomplete.");
  }
  result.data.forEach(item => checkConversation(accountId, item));
  return { data: result.data, pagination: result.pagination, unreadCount: result.unreadCount };
}

export async function readConversation(accountId: string, conversationId: string, signal?: AbortSignal) {
  const result = await api(`conversations/${conversationId}`, conversationSchema, { accountId, signal });
  return checkConversation(accountId, result.data, { id: conversationId });
}

export async function messagePage(accountId: string, conversationId: string, options: { before?: string; after?: string; signal?: AbortSignal } = {}) {
  const query = new URLSearchParams({ limit: "30" });
  if (options.before) query.set("before", options.before);
  if (options.after) query.set("after", options.after);
  const result = await api(`conversations/${conversationId}/messages?${query}`, z.array(messageSchema).max(50), { accountId, signal: options.signal });
  if (!result.pagination) throw new ApiError(502, "INVALID_RESPONSE", "Message pagination is missing.");
  const positions = result.data.map(item => Number(checkMessage(accountId, conversationId, item).position));
  if (positions.some((value, index) => index > 0 && value <= positions[index - 1])
    || (options.before && positions.some(value => value >= Number(options.before)))
    || (options.after && positions.some(value => value <= Number(options.after)))) {
    throw new ApiError(502, "INVALID_RESPONSE", "Messages arrived out of order.");
  }
  return { data: result.data, pagination: result.pagination };
}

export async function sendMessage(intent: SendIntent) {
  const result = await api(`conversations/${intent.conversationId}/messages`, messageSchema, {
    method: "POST", accountId: intent.accountId, body: { body: intent.body },
    headers: { "Idempotency-Key": intent.key },
  });
  const message = checkMessage(intent.accountId, intent.conversationId, result.data);
  if (!message.mine || message.client_message_id !== intent.key) {
    throw new ApiError(502, "INVALID_RESPONSE", "The sent message could not be confirmed.");
  }
  return message;
}

export async function deleteMessage(accountId: string, conversationId: string, messageId: string) {
  const result = await api(`conversations/${conversationId}/messages/${messageId}/delete`, messageSchema, { method: "POST", accountId, body: {} });
  const message = checkMessage(accountId, conversationId, result.data);
  if (message.id !== messageId || message.status !== "deleted") throw new ApiError(502, "INVALID_RESPONSE", "The deletion could not be confirmed.");
  return message;
}

export async function markRead(accountId: string, conversationId: string, through: string) {
  const result = await api(`conversations/${conversationId}/read`, conversationSchema, {
    method: "POST", accountId, body: { through_position: through },
  });
  return checkConversation(accountId, result.data, { id: conversationId });
}

export function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map(item => [item.id, item]));
  // Deletion is final: an older copy that arrives late, such as from a poll that started before the deletion, cannot bring a message back.
  for (const item of incoming) if (byId.get(item.id)?.status !== "deleted" || item.status === "deleted") byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => Number(left.position) - Number(right.position));
}
