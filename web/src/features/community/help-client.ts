import { z } from "zod";
import { ApiError, api, chars } from "@/features/identity/client";
import type { CreateIntent, PublicPage } from "./client";
import { REPORT_REASONS, pageSchema } from "./client";

// Requests for help and offers of help on a page (D3). Replies are private to the people involved.
export const HELP_KINDS = ["request", "offer"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];
// Reports of help posts go to the page's owner and moderators; a scam is the first thing to report.
export const HELP_REPORT_REASONS = ["scam", ...REPORT_REASONS] as const;
export type HelpReportReason = (typeof HELP_REPORT_REASONS)[number];
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const etag = z.string().min(3).max(200);

export const helpPostSchema = z.object({
  id: uuid, page_id: uuid, page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
  kind: z.enum(HELP_KINDS), title: chars(1, 120), details: chars(0, 1000).nullable(),
  place: z.string().min(1).max(64).nullable(), need_by: day.nullable(),
  status: z.enum(["open", "pending", "helped", "closed", "removed"]), author_name: chars(1, 80), author_new: z.boolean().default(false),
  reply_count: z.number().int().nonnegative(), created_at: timestamp, updated_at: timestamp, ended_at: timestamp.nullable(),
  mine: z.boolean(), can_manage: z.boolean(), replied: z.boolean(), helped_reply_id: uuid.nullable(), etag: etag.nullable(),
  reported: z.boolean().default(false),
  reports: z.array(z.object({ reason: z.enum(HELP_REPORT_REASONS), count: z.number().int().positive() })).max(HELP_REPORT_REASONS.length).nullable().default(null),
}).refine(value => (value.mine || value.can_manage) === (value.etag !== null)
  && (value.reports === null || value.can_manage)
  && (value.status === "open" || value.status === "pending") === (value.ended_at === null)
  && (value.status === "removed") === (value.details === null));
export type HelpPost = z.infer<typeof helpPostSchema>;

export const helpReplySchema = z.object({
  id: uuid, post_id: uuid, author_name: chars(1, 80), author_new: z.boolean().default(false), body: chars(1, 500).nullable(),
  status: z.enum(["active", "withdrawn", "removed"]), created_at: timestamp, ended_at: timestamp.nullable(),
  mine: z.boolean(), helped: z.boolean(),
}).refine(value => (value.status === "active") === (value.body !== null && value.ended_at === null));
export type HelpReply = z.infer<typeof helpReplySchema>;

export type NewHelpPost = { kind: HelpKind; title: string; details: string; place?: string; need_by?: string };

function invalid(message = "The service returned an unexpected response."): never {
  throw new ApiError(502, "INVALID_RESPONSE", message);
}

export async function setHelpOpen(accountId: string, page: PublicPage, open: boolean) {
  if (!page.etag) invalid();
  const result = (await api(`pages/${page.id}`, pageSchema, { method: "PATCH", accountId, body: { help_open: open }, headers: { "If-Match": page.etag } })).data;
  if (result.id !== page.id || result.help_open !== open) invalid("The change could not be confirmed.");
  return result;
}

export async function helpPosts(pageId: string, accountId: string | undefined, state: "open" | "all", cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ state, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`pages/${pageId}/help-posts?${query}`, z.array(helpPostSchema).max(50), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)) invalid("The list is incomplete.");
  if (result.data.some(item => item.page_id !== pageId || item.status === "removed" || (state === "open" && item.status !== "open" && item.status !== "pending"))) invalid();
  if (new Set(result.data.map(item => item.id)).size !== result.data.length) invalid("The list contains duplicate entries.");
  return { items: result.data, next: result.pagination.next_cursor };
}

export async function myHelpPosts(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`me/help-posts?${query}`, z.array(helpPostSchema).max(50), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)) invalid("The list is incomplete.");
  if (result.data.some(item => !item.mine)) invalid();
  return { items: result.data, next: result.pagination.next_cursor };
}

export async function helpReviewQueue(accountId: string, signal?: AbortSignal) {
  const result = (await api("me/help-review", z.array(helpPostSchema).max(50), { accountId, signal })).data;
  if (result.some(item => !item.can_manage)) invalid();
  return result;
}

export async function createHelpPost(intent: CreateIntent<NewHelpPost> & { pageId: string }) {
  const result = (await api(`pages/${intent.pageId}/help-posts`, helpPostSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  if (result.page_id !== intent.pageId || !result.mine || (result.status !== "open" && result.status !== "pending") || result.kind !== intent.body.kind) invalid("The post could not be confirmed.");
  return result;
}

export async function resolveHelpPost(accountId: string, post: HelpPost, outcome: "helped" | "closed", replyId?: string) {
  if (!post.etag) invalid();
  const result = (await api(`help-posts/${post.id}/resolve`, helpPostSchema, {
    method: "POST", accountId, body: replyId ? { outcome, reply_id: replyId } : { outcome }, headers: { "If-Match": post.etag },
  })).data;
  if (result.id !== post.id || result.status !== outcome) invalid("The change could not be confirmed.");
  return result;
}

export async function removeHelpPost(accountId: string, post: HelpPost) {
  if (!post.etag) invalid();
  const result = (await api(`help-posts/${post.id}/remove`, helpPostSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": post.etag } })).data;
  if (result.id !== post.id || result.status !== "removed") invalid("The removal could not be confirmed.");
  return result;
}

export async function approveHelpPost(accountId: string, post: HelpPost) {
  if (!post.etag) invalid();
  const result = (await api(`help-posts/${post.id}/approve`, helpPostSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": post.etag } })).data;
  if (result.id !== post.id || result.status !== "open") invalid("The approval could not be confirmed.");
  return result;
}

export async function deleteHelpPost(accountId: string, post: HelpPost) {
  if (!post.etag) invalid();
  const result = (await api(`help-posts/${post.id}/delete`, z.object({ id: uuid, status: z.literal("deleted") }), {
    method: "POST", accountId, body: {}, headers: { "If-Match": post.etag },
  })).data;
  if (result.id !== post.id) invalid("The deletion could not be confirmed.");
  return result;
}

export async function helpReplies(accountId: string, postId: string, signal?: AbortSignal) {
  const result = (await api(`help-posts/${postId}/replies`, z.array(helpReplySchema).max(200), { accountId, signal })).data;
  if (result.some(item => item.post_id !== postId)) invalid();
  return result;
}

export async function replyToHelpPost(intent: CreateIntent<{ body: string }> & { postId: string }) {
  const result = (await api(`help-posts/${intent.postId}/replies`, helpReplySchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  if (result.post_id !== intent.postId || !result.mine || result.status !== "active") invalid("The reply could not be confirmed.");
  return result;
}

export async function endHelpReply(accountId: string, replyId: string) {
  const result = (await api(`help-replies/${replyId}/end`, helpReplySchema, { method: "POST", accountId, body: {} })).data;
  if (result.id !== replyId || result.status === "active") invalid("The change could not be confirmed.");
  return result;
}

const helpReportSchema = z.object({
  id: uuid, post_id: uuid, reason: z.enum(HELP_REPORT_REASONS), status: z.enum(["received", "closed"]), created_at: timestamp,
});

export async function reportHelpPost(accountId: string, postId: string, reason: HelpReportReason, details: string) {
  // Reporting again while the first report waits returns that report, so a retry is safe.
  const result = (await api(`help-posts/${postId}/report`, helpReportSchema, { method: "POST", accountId, body: { reason, details } })).data;
  if (result.post_id !== postId || result.status !== "received") invalid("The report could not be confirmed.");
  return result;
}

/** Open reports for the page's owner and moderators: reason, note and time, never who sent them. */
export async function helpReportNotes(accountId: string, postId: string, signal?: AbortSignal) {
  const note = z.object({ id: uuid, reason: z.enum(HELP_REPORT_REASONS), details: chars(1, 1000).nullable(), created_at: timestamp });
  return (await api(`help-posts/${postId}/reports`, z.array(note).max(200), { accountId, signal })).data;
}

/** A page manager keeps a reported post. The count tells the server which reports were reviewed. */
export async function keepHelpPost(accountId: string, post: HelpPost) {
  const reviewed = post.reports?.reduce((total, item) => total + item.count, 0) ?? 0;
  if (!post.etag || reviewed === 0) invalid();
  const result = (await api(`help-posts/${post.id}/keep`, helpPostSchema, {
    method: "POST", accountId, body: { reports: reviewed }, headers: { "If-Match": post.etag },
  })).data;
  if (result.id !== post.id || result.reports?.length !== 0) invalid("The change could not be confirmed.");
  return result;
}

// Public text must leave out contact details; this mirrors the server's check so the person learns before sending.
const CONTACT = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|in|net|org|co|io|app|me|link|xyz|shop|store|info|biz)\b|[\w.+-]+@[\w-]+\.\w|(?<!\d)(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\+\d{1,3}[\s-]?\d{6,12}/i;
export const hasContactDetails = (value: string) => CONTACT.test(value);
