import { z } from "zod";

import { ApiError, api, chars } from "@/features/identity/client";

export const MAX_QUESTION = 200;
export const MAX_OPTION = 80;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

const uuid = z.string().uuid().transform(value => value.toLowerCase());
const instant = z.string().datetime({ offset: true });

export const pollSchema = z.object({
  id: uuid, space_id: uuid, question: chars(1, MAX_QUESTION),
  options: z.array(z.object({ id: uuid, label: chars(1, MAX_OPTION), votes: z.number().int().min(0) })).min(MIN_OPTIONS).max(MAX_OPTIONS),
  status: z.enum(["open", "closed"]), closes_at: instant.nullable(), closed_at: instant.nullable(),
  created_by_name: z.string(), created_at: instant, total_votes: z.number().int().min(0),
  my_option_id: uuid.nullable(), leading_option_ids: z.array(uuid).max(MAX_OPTIONS),
  can_vote: z.boolean(), can_close: z.boolean(), etag: z.string().regex(/^"[^"]{1,198}"$/).nullable(),
}).superRefine((poll, context) => {
  const ids = new Set(poll.options.map(option => option.id));
  const most = Math.max(...poll.options.map(option => option.votes));
  const leaders = poll.options.filter(option => most > 0 && option.votes === most).map(option => option.id);
  if (ids.size !== poll.options.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate choice." });
  if (poll.total_votes !== poll.options.reduce((sum, option) => sum + option.votes, 0)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Votes do not add up." });
  if (poll.my_option_id !== null && !ids.has(poll.my_option_id)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown own vote." });
  if ([...poll.leading_option_ids].sort().join() !== [...leaders].sort().join()) context.addIssue({ code: z.ZodIssueCode.custom, message: "Leader does not match the counts." });
  if (poll.status === "closed" && (poll.can_vote || poll.can_close)) context.addIssue({ code: z.ZodIssueCode.custom, message: "A closed poll accepts no changes." });
  // People who may close a poll get its version even after it closes; only an open poll offers Close.
  if (poll.can_close && poll.etag === null) context.addIssue({ code: z.ZodIssueCode.custom, message: "Close review is incomplete." });
});
export type SpacePoll = z.infer<typeof pollSchema>;
export type PollStatus = SpacePoll["status"];
export type CreatePollIntent = { accountId: string; spaceId: string; question: string; options: string[]; key: string };

const invalid = () => new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected poll.");

export const PAGE_SIZE = 20;

export async function listPolls(accountId: string, spaceId: string, status: PollStatus, cursor: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ status, limit: String(PAGE_SIZE), ...(cursor ? { cursor } : {}) });
  const result = await api(`spaces/${spaceId}/polls?${query}`, z.array(pollSchema).max(PAGE_SIZE), { accountId, signal });
  if (result.data.some(poll => poll.space_id !== spaceId.toLowerCase() || poll.status !== status)
    || new Set(result.data.map(poll => poll.id)).size !== result.data.length) throw invalid();
  const next = result.pagination?.has_more ? result.pagination.next_cursor ?? null : null;
  if (result.pagination?.has_more && !next) throw invalid();
  return { polls: result.data, next };
}

export async function createPoll(intent: CreatePollIntent) {
  const result = await api(`spaces/${intent.spaceId}/polls`, pollSchema, {
    method: "POST", accountId: intent.accountId, headers: { "Idempotency-Key": intent.key },
    body: { question: intent.question, options: intent.options },
  });
  const poll = result.data;
  if (poll.space_id !== intent.spaceId.toLowerCase() || poll.options.length !== intent.options.length || poll.status !== "open") throw invalid();
  return poll;
}

function same(poll: SpacePoll, updated: SpacePoll) {
  if (updated.id !== poll.id || updated.space_id !== poll.space_id) throw invalid();
  return updated;
}

// Voting again replaces the person's choice, so repeating the same vote after a lost answer changes nothing.
export async function vote(accountId: string, poll: SpacePoll, optionId: string) {
  const updated = same(poll, (await api(`polls/${poll.id}/vote`, pollSchema, { method: "PUT", accountId, body: { option_id: optionId } })).data);
  if (updated.status === "open" && updated.my_option_id !== optionId) throw invalid();
  return updated;
}

export async function withdrawVote(accountId: string, poll: SpacePoll) {
  const updated = same(poll, (await api(`polls/${poll.id}/vote`, pollSchema, { method: "DELETE", accountId, body: {} })).data);
  if (updated.status === "open" && updated.my_option_id !== null) throw invalid();
  return updated;
}

export async function closePoll(accountId: string, poll: SpacePoll) {
  if (!poll.etag) throw new ApiError(403, "POLL_CLOSE_DENIED", "Only the person who asked, an admin or the owner can close this poll.");
  const updated = same(poll, (await api(`polls/${poll.id}/close`, pollSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": poll.etag } })).data);
  if (updated.status !== "closed") throw invalid();
  return updated;
}
