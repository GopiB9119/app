import { z } from "zod";
import { ApiError, api, chars } from "@/features/identity/client";

const uuid = z.string().uuid();
const position = z.string().regex(/^(0|[1-9][0-9]{0,9})$/);
const timestamp = z.string().datetime({ offset: true });
export const MAX_MESSAGE_CHARACTERS = 2000;
// Replies, reactions and edits (DEC-033): the six reactions in their fixed order, the reply excerpt and the edit limits.
export const REACTIONS = ["like", "love", "laugh", "wow", "sad", "thanks"] as const;
export type Reaction = typeof REACTIONS[number];
export const REPLY_EXCERPT_CHARACTERS = 120;
export const EDIT_WINDOW_MILLISECONDS = 15 * 60 * 1000;
export const MAX_EDITS = 10;
// Asking the agent from a chat message with @agent (DEC-046): what became of the request, as its author sees it.
export const AGENT_REQUEST_STATUSES = ["answered", "private", "waiting", "pending", "off", "limited", "too_long", "failed"] as const;
export type AgentRequestStatus = typeof AGENT_REQUEST_STATUSES[number];
const MENTION = /(?<![\p{L}\p{N}_@.])@agent(?![\p{L}\p{N}_])/iu;

export const participantSchema = z.object({ account_id: uuid, display_name: chars(1, 80) });
export const TYPING_TTL_MILLISECONDS = 8000;
export const MAX_TYPING_MENTIONS = 5;
export const typingSchema = z.object({
  kind: z.literal("typing"), conversation_id: uuid, space_id: uuid, account_id: uuid,
  client_id: uuid, sequence: z.number().int().min(1).max(2147483647), is_typing: z.boolean(),
  mentioned_account_ids: z.array(uuid).max(MAX_TYPING_MENTIONS).refine(ids => new Set(ids).size === ids.length),
  mentions_agent: z.boolean(), expires_at: timestamp,
}).refine(value => value.is_typing || (!value.mentions_agent && value.mentioned_account_ids.length === 0));
export type TypingUpdate = z.infer<typeof typingSchema>;
export type TypingIntent = Pick<TypingUpdate, "client_id" | "sequence" | "is_typing" | "mentioned_account_ids" | "mentions_agent">;

export const conversationSchema = z.object({
  id: uuid, space_id: uuid, space_name: chars(1, 80),
  kind: z.enum(["space", "direct"]), title: chars(1, 80),
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

export const replySchema = z.object({
  message_id: uuid, status: z.enum(["sent", "deleted", "unavailable"]), position: position.refine(value => value !== "0").nullable(),
  sender_name: chars(1, 80).nullable(),
  // One line of at most 120 characters and an ellipsis; surrogate pairs can double the JavaScript length.
  excerpt: z.string().min(1).max((REPLY_EXCERPT_CHARACTERS + 1) * 2).nullable(),
}).superRefine((value, context) => {
  const shown = value.status === "sent";
  // Out of the viewer's history it says nothing about itself; deleted keeps who wrote it, not what.
  const outside = value.status === "unavailable" && value.position === null;
  if (shown !== (value.excerpt !== null) || (outside ? value.sender_name !== null : value.sender_name === null || value.position === null)) {
    context.addIssue({ code: "custom", message: "Inconsistent reply." });
  }
});
export type Reply = z.infer<typeof replySchema>;
export const reactionSchema = z.object({ reaction: z.enum(REACTIONS), count: z.number().int().positive(), mine: z.boolean() });
export const agentRequestSchema = z.object({ status: z.enum(AGENT_REQUEST_STATUSES), run_id: uuid.nullable() }).superRefine((value, context) => {
  // A reply in the chat always comes from a request the agent received.
  if (["answered", "private", "waiting"].includes(value.status) && value.run_id === null) {
    context.addIssue({ code: "custom", message: "Inconsistent agent request." });
  }
});
export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const messageSchema = z.object({
  id: uuid, conversation_id: uuid, position: position.refine(value => value !== "0"),
  sender_account_id: uuid, sender_name: chars(1, 80), mine: z.boolean(),
  client_message_id: uuid.nullable(), status: z.enum(["sent", "deleted", "unavailable"]),
  // The server counts characters; UTF-16 surrogate pairs can double the JavaScript length.
  body: z.string().min(1).max(MAX_MESSAGE_CHARACTERS * 2).nullable(),
  created_at: timestamp, deleted_at: timestamp.nullable(),
  // Servers from before replies, reactions and edits leave these out.
  edited_at: timestamp.nullable().default(null), reply_to: replySchema.nullable().default(null),
  reactions: z.array(reactionSchema).max(REACTIONS.length).default([]), revision: z.number().int().positive().default(1),
  // Servers from before @agent (DEC-046) leave these out.
  from_agent: z.boolean().default(false), agent_request: agentRequestSchema.nullable().default(null),
}).superRefine((value, context) => {
  if ((value.status === "sent") !== (value.body !== null) || (value.status === "deleted") !== (value.deleted_at !== null)
    || value.mine !== (value.client_message_id !== null)) {
    context.addIssue({ code: "custom", message: "Inconsistent message." });
  }
  // The agent writes no reader's message, and only the author is told what became of their request.
  if ((value.from_agent && value.mine) || (value.agent_request !== null && (!value.mine || value.from_agent))) {
    context.addIssue({ code: "custom", message: "Inconsistent message." });
  }
  // A deleted message keeps no reactions, each reaction appears once in the fixed order, and a message cannot answer itself.
  const order = value.reactions.map(item => REACTIONS.indexOf(item.reaction));
  if ((value.status === "deleted" && value.reactions.length > 0) || order.some((item, index) => index > 0 && item <= order[index - 1])
    || value.reply_to?.message_id === value.id) {
    context.addIssue({ code: "custom", message: "Inconsistent message." });
  }
});
export type Message = z.infer<typeof messageSchema>;
export type SendIntent = { accountId: string; conversationId: string; key: string; body: string; replyTo?: string };

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
  // A message that answers none sends exactly what it always did.
  const body = intent.replyTo ? { body: intent.body, reply_to_message_id: intent.replyTo } : { body: intent.body };
  const result = await api(`conversations/${intent.conversationId}/messages`, messageSchema, {
    method: "POST", accountId: intent.accountId, body,
    headers: { "Idempotency-Key": intent.key },
  });
  const message = checkMessage(intent.accountId, intent.conversationId, result.data);
  if (!message.mine || message.client_message_id !== intent.key || (message.reply_to?.message_id ?? undefined) !== intent.replyTo) {
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

/** The author changes the text of their message; the same text again changes nothing (DEC-033). */
export async function editMessage(accountId: string, conversationId: string, messageId: string, body: string) {
  const result = await api(`conversations/${conversationId}/messages/${messageId}/edit`, messageSchema, { method: "POST", accountId, body: { body } });
  const message = checkMessage(accountId, conversationId, result.data);
  if (message.id !== messageId || !message.mine || message.status !== "sent") {
    throw new ApiError(502, "INVALID_RESPONSE", "The edit could not be confirmed.");
  }
  return message;
}

/** Adds or takes back one of the caller's own reactions; doing what is already done changes nothing. */
export async function reactToMessage(accountId: string, conversationId: string, messageId: string, reaction: Reaction, on: boolean) {
  const result = await api(`conversations/${conversationId}/messages/${messageId}/reactions`, messageSchema, {
    method: "POST", accountId, body: { reaction, on },
  });
  const message = checkMessage(accountId, conversationId, result.data);
  if (message.id !== messageId || (message.reactions.find(item => item.reaction === reaction)?.mine ?? false) !== on) {
    throw new ApiError(502, "INVALID_RESPONSE", "The reaction could not be confirmed.");
  }
  return message;
}

/** Whether the author may still edit [message] by the device clock; the server decides. */
export function editable(message: Message, now = Date.now()) {
  return message.mine && message.status === "sent" && now - Date.parse(message.created_at) < EDIT_WINDOW_MILLISECONDS;
}

/** Whether a message asks the agent: "@agent" as a word of its own, as the server reads it (DEC-046). */
export function mentionsAgent(text: string) {
  return MENTION.test(text);
}

export function typingMentions(text: string, members: readonly z.infer<typeof participantSchema>[]) {
  const normalized = text.normalize("NFC");
  const names = new Map<string, { name: string; accounts: string[] }>();
  for (const member of members) {
    const name = member.display_name.trim().normalize("NFC");
    const key = name.toLowerCase();
    if (!name || key === "agent") continue;
    const entry = names.get(key) ?? { name, accounts: [] };
    entry.accounts.push(member.account_id);
    names.set(key, entry);
  }
  const occupied: { start: number; end: number }[] = [];
  const targets = new Map<string, number>();
  // Prefer a complete longer name over its prefix; duplicate display names do not identify a person.
  for (const { name, accounts } of [...names.values()].sort((a, b) => b.name.length - a.name.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_@.])@${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, "giu");
    for (const match of normalized.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.some(range => start < range.end && end > range.start)) continue;
      occupied.push({ start, end });
      if (accounts.length === 1 && !targets.has(accounts[0])) targets.set(accounts[0], start);
    }
  }
  return {
    mentioned_account_ids: [...targets].sort((a, b) => a[1] - b[1]).slice(0, MAX_TYPING_MENTIONS).map(([id]) => id),
    mentions_agent: mentionsAgent(text),
  };
}

export async function sendTyping(accountId: string, conversationId: string, intent: TypingIntent, signal?: AbortSignal) {
  const { data } = await api(`conversations/${conversationId}/typing`, typingSchema, {
    method: "POST", accountId, body: intent, signal,
  });
  if (data.account_id !== accountId || data.conversation_id !== conversationId || data.client_id !== intent.client_id
    || data.sequence !== intent.sequence || data.is_typing !== intent.is_typing || data.mentions_agent !== intent.mentions_agent
    || data.mentioned_account_ids.join(",") !== intent.mentioned_account_ids.join(",")) {
    throw new ApiError(502, "INVALID_RESPONSE", "The typing update could not be confirmed.");
  }
  return data;
}

/** The author asks the agent again about their own message when no answer came; once answered, nothing changes. */
export async function askAgentAgain(accountId: string, conversationId: string, messageId: string) {
  const result = await api(`conversations/${conversationId}/messages/${messageId}/agent`, messageSchema, { method: "POST", accountId, body: {} });
  const message = checkMessage(accountId, conversationId, result.data);
  if (message.id !== messageId || !message.mine || message.agent_request === null) {
    throw new ApiError(502, "INVALID_RESPONSE", "The agent request could not be confirmed.");
  }
  return message;
}

/** The author shows the agent's private answer to their message to everyone in the chat (DEC-061); sharing again changes nothing. */
export async function shareAgentAnswer(accountId: string, conversationId: string, messageId: string) {
  const result = await api(`conversations/${conversationId}/messages/${messageId}/agent/share`, messageSchema, { method: "POST", accountId, body: {} });
  const message = checkMessage(accountId, conversationId, result.data);
  if (message.id !== messageId || !message.mine || message.agent_request?.status !== "answered") {
    throw new ApiError(502, "INVALID_RESPONSE", "Sharing the answer could not be confirmed.");
  }
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
  // Deletion is final, and every edit or reaction raises the revision: an older copy that arrives late, such as from a
  // poll that started before the change, cannot bring a message back or undo the change.
  for (const item of incoming) {
    const known = byId.get(item.id);
    if (!known || item.status === "deleted" || (known.status !== "deleted" && (item.revision ?? 1) >= (known.revision ?? 1))) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => Number(left.position) - Number(right.position));
}
