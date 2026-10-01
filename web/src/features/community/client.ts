import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const TOPICS = ["community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other"] as const;
export const REPORT_REASONS = ["spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other"] as const;
export type Topic = typeof TOPICS[number];
export type ReportReason = typeof REPORT_REASONS[number];
export const topicLabels: Record<Topic, string> = {
  community: "Community", education: "Education", health: "Health", local: "Local", family: "Family",
  events: "Events", hobbies: "Hobbies", support: "Support", news: "News", other: "Other",
};
export const reasonLabels: Record<ReportReason, string> = {
  spam: "Spam or scam", harassment: "Harassment or bullying", hate: "Hate", violence: "Violence or threats",
  sexual: "Sexual content", misinformation: "False information", self_harm: "Self-harm", privacy: "Shares private information", other: "Something else",
};
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;
const etag = z.string().min(3).max(200);
// The server counts characters (code points), not UTF-16 units, so an emoji counts once.
const chars = (min: number, max: number) => z.string().refine(value => { const length = [...value].length; return length >= min && length <= max; });

export const pageSchema = z.object({
  id: uuid, handle: z.string().regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/), name: chars(1, 80),
  description: chars(0, 500), rules: chars(0, 2000).default(""), topic: z.enum(TOPICS), follower_count: z.number().int().nonnegative(),
  created_at: timestamp, updated_at: timestamp, following: z.boolean(), blocked: z.boolean(), can_manage: z.boolean(),
  etag: etag.nullable(),
}).refine(value => value.can_manage === (value.etag !== null) && !(value.following && value.blocked));
export type PublicPage = z.infer<typeof pageSchema>;

export const postSchema = z.object({
  id: uuid, page_id: uuid, page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
  title: chars(1, 120).nullable(), body: chars(1, 5000), status: z.enum(["draft", "published"]),
  like_count: z.number().int().nonnegative(), comment_count: z.number().int().nonnegative(),
  created_at: timestamp, published_at: timestamp.nullable(), edited_at: timestamp.nullable(),
  liked: z.boolean(), saved: z.boolean(), pinned: z.boolean().default(false), can_manage: z.boolean(), etag: etag.nullable(),
}).refine(value => (value.status === "published") === (value.published_at !== null)
  && value.can_manage === (value.etag !== null) && (value.status === "published" || value.can_manage)
  && (value.edited_at === null || value.status === "published") && (!value.pinned || value.status === "published"));
export type PublicPost = z.infer<typeof postSchema>;

export const commentSchema = z.object({
  id: uuid, post_id: uuid, parent_id: uuid.nullable(), author_name: chars(1, 80),
  body: chars(1, 2000).nullable(), status: z.enum(["visible", "deleted", "removed"]),
  created_at: timestamp, mine: z.boolean(), can_remove: z.boolean(),
}).refine(value => (value.status === "visible") === (value.body !== null) && (!value.can_remove || value.status === "visible") && value.parent_id !== value.id);
export type PostComment = z.infer<typeof commentSchema>;

export const reportSchema = z.object({
  id: uuid, target_type: z.enum(["page", "post", "comment"]), target_id: uuid, reason: z.enum(REPORT_REASONS),
  status: z.enum(["received", "reviewing", "closed"]), created_at: timestamp,
});
export const blockSchema = z.object({
  id: uuid, target_type: z.enum(["page", "account"]), page_id: uuid.nullable(), label: chars(1, 80), created_at: timestamp,
}).refine(value => (value.target_type === "page") === (value.page_id !== null));
export type Block = z.infer<typeof blockSchema>;
export type ReportTarget = { type: "page" | "post" | "comment"; id: string; label: string };
export type CreateIntent<Body> = { accountId: string; key: string; body: Body };

function invalid(message = "The service returned an unexpected response."): never {
  throw new ApiError(502, "INVALID_RESPONSE", message);
}

function unique<Item extends { id: string }>(items: Item[]) {
  if (new Set(items.map(item => item.id)).size !== items.length) invalid("The list contains duplicate entries.");
  return items;
}

function paged<Item extends { id: string }>(result: { data: Item[]; pagination?: { next_cursor: string | null; has_more: boolean } }, cursor?: string | null) {
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)) invalid("The list is incomplete.");
  return { items: unique(result.data), next: result.pagination.next_cursor };
}

function checkPage(value: PublicPage, reference?: string) {
  if (reference && value.id !== reference && value.handle !== reference.toLowerCase()) invalid("The page does not match your request.");
  return value;
}

function checkPost(value: PublicPost, id?: string) {
  if (id && value.id !== id) invalid("The post does not match your request.");
  return value;
}

export function textProblem(value: string, limit: number, required = true) {
  const text = value.replace(/\r\n/g, "\n").trim();
  if (required && !text) return "Enter some text first.";
  if ([...text].length > limit) return `Use up to ${limit} characters.`;
  if (/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(text)) return "Remove control characters.";
  return null;
}

export async function readPage(reference: string, accountId?: string, signal?: AbortSignal) {
  return checkPage((await api(`pages/${encodeURIComponent(reference)}`, pageSchema, { accountId, signal })).data, reference);
}

export async function pagePosts(reference: string, accountId?: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`pages/${encodeURIComponent(reference)}/posts?${query}`, z.array(postSchema).max(50), { accountId, signal }), cursor);
  if (page.items.some(item => item.status !== "published" || (item.page_id !== reference && item.page_handle !== reference))) invalid();
  return page;
}

export async function myPages(accountId: string, signal?: AbortSignal) {
  const result = unique((await api("me/pages", z.array(pageSchema).max(5), { accountId, signal })).data);
  if (result.some(item => !item.can_manage)) invalid();
  return result;
}

export async function createPage(intent: CreateIntent<{ handle: string; name: string; description: string; topic: Topic }>) {
  const result = checkPage((await api("pages", pageSchema, { method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key } })).data);
  if (!result.can_manage || result.handle !== intent.body.handle) invalid("The new page could not be confirmed.");
  return result;
}

export async function updatePage(accountId: string, page: PublicPage, changes: Partial<Pick<PublicPage, "name" | "description" | "topic" | "rules">>) {
  if (!page.etag) invalid();
  return checkPage((await api(`pages/${page.id}`, pageSchema, { method: "PATCH", accountId, body: changes, headers: { "If-Match": page.etag } })).data, page.id);
}

export async function followPage(accountId: string, pageId: string, follow: boolean) {
  const result = checkPage((await api(`pages/${pageId}/${follow ? "follow" : "unfollow"}`, pageSchema, { method: "POST", accountId, body: {} })).data, pageId);
  if (result.following !== follow) invalid("The follow change could not be confirmed.");
  return result;
}

export async function followingPages(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`me/following?${query}`, z.array(pageSchema).max(50), { accountId, signal }), cursor);
  if (page.items.some(item => !item.following)) invalid();
  return page;
}

export async function createPost(intent: CreateIntent<{ title: string | null; body: string }> & { pageId: string }) {
  const result = checkPost((await api(`pages/${intent.pageId}/posts`, postSchema, { method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key } })).data);
  if (result.page_id !== intent.pageId || !result.can_manage) invalid("The draft could not be confirmed.");
  return result;
}

export async function drafts(accountId: string, pageId: string, signal?: AbortSignal) {
  const result = unique((await api(`pages/${pageId}/drafts`, z.array(postSchema).max(50), { accountId, signal })).data);
  if (result.some(item => item.status !== "draft" || item.page_id !== pageId)) invalid();
  return result;
}

export async function updatePost(accountId: string, post: PublicPost, changes: { title?: string | null; body?: string }) {
  if (!post.etag) invalid();
  return checkPost((await api(`posts/${post.id}`, postSchema, { method: "PATCH", accountId, body: changes, headers: { "If-Match": post.etag } })).data, post.id);
}

export async function publishPost(accountId: string, post: PublicPost) {
  if (!post.etag) invalid();
  const result = checkPost((await api(`posts/${post.id}/publish`, postSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": post.etag } })).data, post.id);
  if (result.status !== "published") invalid("Publication could not be confirmed.");
  return result;
}

export async function deletePost(accountId: string, post: PublicPost) {
  const headers: Record<string, string> = post.etag ? { "If-Match": post.etag } : {};
  const result = await api(`posts/${post.id}/delete`, z.object({ id: uuid, status: z.literal("deleted") }), { method: "POST", accountId, body: {}, headers });
  if (result.data.id !== post.id) invalid();
  return result.data;
}

export async function readPost(postId: string, accountId?: string, signal?: AbortSignal) {
  return checkPost((await api(`posts/${postId}`, postSchema, { accountId, signal })).data, postId);
}

export async function reactToPost(accountId: string, postId: string, action: "like" | "unlike" | "save" | "unsave") {
  const result = checkPost((await api(`posts/${postId}/${action}`, postSchema, { method: "POST", accountId, body: {} })).data, postId);
  if ((action === "like" && !result.liked) || (action === "unlike" && result.liked) || (action === "save" && !result.saved) || (action === "unsave" && result.saved)) {
    invalid("The change could not be confirmed.");
  }
  return result;
}

export const MAX_PINNED_POSTS = 3;

export async function pinnedPosts(page: PublicPage, accountId?: string, signal?: AbortSignal) {
  const result = unique((await api(`pages/${page.id}/pinned-posts`, z.array(postSchema).max(MAX_PINNED_POSTS), { accountId, signal })).data);
  if (result.some(item => !item.pinned || item.page_id !== page.id)) invalid();
  return result;
}

export async function pinPost(accountId: string, postId: string, pin: boolean) {
  const result = checkPost((await api(`posts/${postId}/${pin ? "pin" : "unpin"}`, postSchema, { method: "POST", accountId, body: {} })).data, postId);
  if (result.pinned !== pin) invalid("The change could not be confirmed.");
  return result;
}

async function postList(path: string, accountId: string | undefined, cursor: string | null | undefined, signal?: AbortSignal, search = "") {
  const query = new URLSearchParams({ limit: "20" });
  if (search) query.set("q", search);
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`${path}?${query}`, z.array(postSchema).max(50), { accountId, signal }), cursor);
  if (page.items.some(item => item.status !== "published")) invalid();
  return page;
}

export const homeFeed = (accountId: string, cursor?: string | null, signal?: AbortSignal) => postList("feed", accountId, cursor, signal);
export const latestPosts = (accountId?: string, cursor?: string | null, signal?: AbortSignal) => postList("discover/posts", accountId, cursor, signal);
export const searchPosts = (accountId: string | undefined, search: string, cursor?: string | null, signal?: AbortSignal) =>
  postList("discover/posts", accountId, cursor, signal, search.trim().replace(/\s+/g, " ").slice(0, 80));
export async function savedPosts(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const page = await postList("me/saved-posts", accountId, cursor, signal);
  if (page.items.some(item => !item.saved)) invalid();
  return page;
}

export async function discoverPages(accountId: string | undefined, search: string, topic: Topic | "", cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  const text = search.trim().replace(/\s+/g, " ");
  if (text) query.set("q", text.slice(0, 80));
  if (topic) query.set("topic", topic);
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`discover/pages?${query}`, z.array(pageSchema).max(50), { accountId, signal }), cursor);
  if (page.items.some(item => item.blocked || (topic && item.topic !== topic))) invalid();
  return page;
}

export async function postComments(postId: string, accountId?: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`posts/${postId}/comments?${query}`, z.array(commentSchema).max(100), { accountId, signal }), cursor);
  if (page.items.some(item => item.post_id !== postId)) invalid();
  return page;
}

export async function createComment(intent: CreateIntent<{ body: string; parent_id?: string }> & { postId: string }) {
  const result = (await api(`posts/${intent.postId}/comments`, commentSchema, { method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key } })).data;
  if (result.post_id !== intent.postId || !result.mine || result.status !== "visible" || (result.parent_id ?? undefined) !== intent.body.parent_id) {
    invalid("The comment could not be confirmed.");
  }
  return result;
}

export async function endComment(accountId: string, commentId: string) {
  const result = (await api(`comments/${commentId}/delete`, commentSchema, { method: "POST", accountId, body: {} })).data;
  if (result.id !== commentId || result.status === "visible") invalid("The removal could not be confirmed.");
  return result;
}

export async function reportContent(accountId: string, target: ReportTarget, reason: ReportReason, details: string) {
  const result = (await api("reports", reportSchema, { method: "POST", accountId, body: { target_type: target.type, target_id: target.id, reason, details } })).data;
  if (result.target_type !== target.type || result.target_id !== target.id) invalid("The report could not be confirmed.");
  return result;
}

export async function myBlocks(accountId: string, signal?: AbortSignal) {
  return unique((await api("me/blocks", z.array(blockSchema).max(500), { accountId, signal })).data);
}

export async function block(accountId: string, targetType: "page" | "comment_author", targetId: string) {
  const result = (await api("blocks", blockSchema, { method: "POST", accountId, body: { target_type: targetType, target_id: targetId } })).data;
  if ((targetType === "page") !== (result.target_type === "page") || (targetType === "page" && result.page_id !== targetId)) invalid("The block could not be confirmed.");
  return result;
}

export async function unblock(accountId: string, blockId: string) {
  const result = (await api(`blocks/${blockId}/remove`, z.object({ id: uuid, status: z.literal("removed") }), { method: "POST", accountId, body: {} })).data;
  if (result.id !== blockId) invalid();
  return result;
}

export function isUnknown(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 408;
}
