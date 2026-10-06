import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const termCodeSchema = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const TOPICS = ["community", "education", "health", "local", "family", "events", "hobbies", "support", "news", "other"] as const;
export const REPORT_REASONS = ["spam", "harassment", "hate", "violence", "sexual", "misinformation", "self_harm", "privacy", "other"] as const;
export type Topic = string;
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
export const PAGE_STATUSES = ["active", "read_only", "deleted"] as const;
export type PageStatus = typeof PAGE_STATUSES[number];
export const pageStatusLabel: Record<PageStatus, string> = { active: "Active", read_only: "Read only", deleted: "Deleted" };
const etag = z.string().min(3).max(200);
// The server counts characters (code points), not UTF-16 units, so an emoji counts once.
const chars = (min: number, max: number) => z.string().refine(value => { const length = [...value].length; return length >= min && length <= max; });

const termCodes = (maximum: number) => z.array(termCodeSchema).max(maximum).refine(values => new Set(values).size === values.length);
export const CLASSIFICATION_LIMITS = { other_topics: 2, interests: 10, languages: 5, places: 3, community_types: 2, audiences: 3, activities: 4, content_kinds: 4 } as const;
export const classificationSchema = z.object({
  other_topics: termCodes(CLASSIFICATION_LIMITS.other_topics).default([]),
  interests: termCodes(CLASSIFICATION_LIMITS.interests).default([]),
  languages: termCodes(CLASSIFICATION_LIMITS.languages).default([]),
  places: termCodes(CLASSIFICATION_LIMITS.places).default([]),
  community_types: termCodes(CLASSIFICATION_LIMITS.community_types).default([]),
  audiences: termCodes(CLASSIFICATION_LIMITS.audiences).default([]),
  activities: termCodes(CLASSIFICATION_LIMITS.activities).default([]),
  content_kinds: termCodes(CLASSIFICATION_LIMITS.content_kinds).default([]),
});
export type Classification = z.infer<typeof classificationSchema>;
export const emptyClassification = (): Classification => classificationSchema.parse({});

export const TAXONOMY_DIMENSIONS = ["topic", "interest", "language", "place", "community_type", "audience", "activity", "content_kind"] as const;
export type TaxonomyDimension = typeof TAXONOMY_DIMENSIONS[number];
export const termSchema = z.object({
  dimension: z.enum(TAXONOMY_DIMENSIONS), code: termCodeSchema, parent: termCodeSchema.nullable(),
  sensitive: z.boolean(), status: z.enum(["active", "retired"]),
  names: z.object({ en: z.string().min(1), te: z.string().nullable(), hi: z.string().nullable() }),
});
export type TaxonomyTerm = z.infer<typeof termSchema>;
export const taxonomySchema = z.array(termSchema).max(10000).refine(terms => new Set(terms.map(term => `${term.dimension}:${term.code}`)).size === terms.length);
export const TAXONOMY_CACHE_TIME = 5 * 60 * 1000;
let taxonomyCache: { terms: TaxonomyTerm[]; expires: number } | undefined;

export async function readTaxonomy(signal?: AbortSignal, refresh = false) {
  if (!refresh && taxonomyCache && taxonomyCache.expires > Date.now()) return taxonomyCache.terms;
  const terms = (await api("taxonomy", taxonomySchema, { signal })).data;
  taxonomyCache = { terms, expires: Date.now() + TAXONOMY_CACHE_TIME };
  return terms;
}

export function termName(term: TaxonomyTerm, language: "en" | "te" | "hi") {
  return term.names[language]?.trim() || term.names.en;
}

export function termLabel(terms: TaxonomyTerm[], dimension: TaxonomyDimension, code: string, language: "en" | "te" | "hi") {
  const term = terms.find(item => item.dimension === dimension && item.code === code);
  return term ? termName(term, language) : code;
}

export const INTEREST_LIMITS = { topics: 10, interests: 30, languages: 5, places: 5 } as const;
export const interestsInputSchema = z.object({
  topics: termCodes(INTEREST_LIMITS.topics), interests: termCodes(INTEREST_LIMITS.interests),
  languages: termCodes(INTEREST_LIMITS.languages), places: termCodes(INTEREST_LIMITS.places),
}).strict();
export const interestsSchema = interestsInputSchema.extend({ etag });
export type InterestChoices = z.infer<typeof interestsInputSchema>;
export type Interests = z.infer<typeof interestsSchema>;

export async function readInterests(accountId: string, signal?: AbortSignal) {
  return (await api("me/interests", interestsSchema, { accountId, signal })).data;
}

export async function saveInterests(accountId: string, reviewed: Pick<Interests, "etag">, choices: InterestChoices) {
  const parsed = interestsInputSchema.safeParse(choices);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_ERROR", "Choose valid interests within the limits.");
  if (!etag.safeParse(reviewed.etag).success) invalid("Reload your interests before saving.");
  const result = (await api("me/interests", interestsSchema, {
    method: "PUT", accountId, body: parsed.data, headers: { "If-Match": reviewed.etag },
  })).data;
  for (const field of Object.keys(INTEREST_LIMITS) as (keyof InterestChoices)[]) {
    if (result[field].length !== parsed.data[field].length || result[field].some(code => !parsed.data[field].includes(code))) {
      invalid("The interests could not be confirmed.");
    }
  }
  return result;
}

export const pageSchema = z.object({
  id: uuid, handle: z.string().regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/), name: chars(1, 80),
  description: chars(0, 500), rules: chars(0, 2000).default(""), topic: termCodeSchema,
  classification: classificationSchema.default(emptyClassification),
  status: z.enum(PAGE_STATUSES).default("active"),
  follower_count: z.number().int().nonnegative(),
  created_at: timestamp, updated_at: timestamp, following: z.boolean(), blocked: z.boolean(), can_manage: z.boolean(),
  etag: etag.nullable(),
  purge_after: timestamp.nullable().default(null),
  moderation: z.object({ hidden: z.literal(true), reason: z.enum(REPORT_REASONS) }).optional(),
  limited: z.boolean().default(false),
  limit: z.object({ reason: z.enum(REPORT_REASONS) }).optional(),
  help_open: z.boolean().default(false),
}).refine(value => value.can_manage === (value.etag !== null) && !(value.following && value.blocked));
export type PublicPage = z.infer<typeof pageSchema>;

export const pageInsightsSchema = z.object({
  page_id: uuid, follower_count: z.number().int().nonnegative(), as_of: timestamp,
  periods: z.array(z.object({
    start: timestamp, end: timestamp,
    new_followers: z.number().int().nonnegative(), posts: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(), likes: z.number().int().nonnegative(),
  }).strict()).length(8),
}).strict().refine(value => value.periods.every((period, index) => {
  const end = Date.parse(period.end);
  const newerStart = index === 0 ? Date.parse(value.as_of) : Date.parse(value.periods[index - 1].start);
  return end === newerStart && end - Date.parse(period.start) === 7 * 24 * 60 * 60 * 1000;
}));
export type PageInsights = z.infer<typeof pageInsightsSchema>;

export const suggestionsSchema = z.object({
  ranking: z.literal("interests-1"),
  items: z.array(z.object({
    page: pageSchema,
    reasons: z.array(z.object({ dimension: z.enum(["topic", "interest", "language", "place"]), code: termCodeSchema })).min(1).max(50)
      .refine(reasons => new Set(reasons.map(reason => `${reason.dimension}:${reason.code}`)).size === reasons.length),
  })).max(20),
});
export type SuggestedPage = z.infer<typeof suggestionsSchema>["items"][number];

export async function suggestedPages(accountId: string, limit = 6, signal?: AbortSignal) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ApiError(422, "VALIDATION_ERROR", "Choose between 1 and 20 pages.");
  const result = (await api(`me/suggested-pages?${new URLSearchParams({ limit: String(limit) })}`, suggestionsSchema, { accountId, signal })).data;
  if (result.items.length > limit || new Set(result.items.map(item => item.page.id)).size !== result.items.length
    || result.items.some(item => item.page.blocked || item.page.status !== "active")) invalid();
  return result;
}

export const POST_TERM_LIMITS = { topics: 3, interests: 5 } as const;
export const postSchema = z.object({
  id: uuid, page_id: uuid, page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
  title: chars(1, 120).nullable(), body: chars(1, 5000), status: z.enum(["draft", "published"]),
  topics: termCodes(POST_TERM_LIMITS.topics).default([]), interests: termCodes(POST_TERM_LIMITS.interests).default([]),
  like_count: z.number().int().nonnegative(), comment_count: z.number().int().nonnegative(),
  created_at: timestamp, published_at: timestamp.nullable(), edited_at: timestamp.nullable(),
  liked: z.boolean(), saved: z.boolean(), pinned: z.boolean().default(false), can_manage: z.boolean(), etag: etag.nullable(),
  page_status: z.enum(PAGE_STATUSES).default("active"),
  page_limited: z.boolean().default(false),
  moderation: z.object({ hidden: z.literal(true), reason: z.enum(REPORT_REASONS) }).optional(),
}).refine(value => (value.status === "published") === (value.published_at !== null)
  && value.can_manage === (value.etag !== null) && (value.status === "published" || value.can_manage)
  && (value.edited_at === null || value.status === "published") && (!value.pinned || value.status === "published"));
export type PublicPost = z.infer<typeof postSchema>;

export const interestPostsSchema = z.array(z.object({
  post: postSchema.refine(post => post.status === "published"),
  reasons: z.array(z.object({ dimension: z.enum(["topic", "interest"]), code: termCodeSchema }).strict()).min(1)
    .refine(reasons => new Set(reasons.map(reason => `${reason.dimension}:${reason.code}`)).size === reasons.length),
}).strict()).max(20).refine(items => new Set(items.map(item => item.post.id)).size === items.length);
export type InterestPost = z.infer<typeof interestPostsSchema>[number];

export const commentSchema = z.object({
  id: uuid, post_id: uuid, parent_id: uuid.nullable(), author_name: chars(1, 80),
  body: chars(1, 2000).nullable(), status: z.enum(["visible", "deleted", "removed"]),
  created_at: timestamp, mine: z.boolean(), can_remove: z.boolean(),
  moderation: z.object({ hidden: z.literal(true), reason: z.enum(REPORT_REASONS) }).optional(),
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

export const feedControlInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mute_page"), page_id: uuid }).strict(),
  z.object({ kind: z.literal("hide_suggestion"), page_id: uuid }).strict(),
  z.object({ kind: z.literal("hide_post"), post_id: uuid }).strict(),
  z.object({ kind: z.literal("mute_term"), dimension: z.enum(["topic", "interest"]), code: termCodeSchema }).strict(),
]);
export type FeedControlInput = z.infer<typeof feedControlInputSchema>;
export const feedControlSchema = z.object({
  id: uuid, kind: z.enum(["mute_page", "mute_term", "hide_post", "hide_suggestion"]),
  page_id: uuid.nullable(), page_handle: z.string().min(3).max(30).nullable(), page_name: chars(1, 80).nullable(),
  post_id: uuid.nullable(), post_title: chars(1, 120).nullable(), post_available: z.boolean().nullable(),
  dimension: z.enum(["topic", "interest"]).nullable(), code: termCodeSchema.nullable(), created_at: timestamp,
}).refine(value => {
  if ((value.page_handle === null) !== (value.page_name === null)) return false;
  if (value.page_id === null && value.page_name !== null) return false;
  if (value.kind === "mute_term") return value.dimension !== null && value.code !== null
    && value.page_id === null && value.page_name === null && value.post_id === null
    && value.post_title === null && value.post_available === null;
  if (value.dimension !== null || value.code !== null) return false;
  if (value.kind === "hide_post") return value.post_available === true
    ? value.post_id !== null && value.page_id !== null && value.page_name !== null
    : value.post_available === false && value.post_title === null;
  return value.post_id === null && value.post_title === null && value.post_available === null;
});
export type FeedControl = z.infer<typeof feedControlSchema>;
export const feedControlsSchema = z.array(feedControlSchema).max(1800)
  .refine(items => new Set(items.map(item => item.id)).size === items.length);

export async function feedControls(accountId: string, signal?: AbortSignal) {
  return (await api("me/feed-controls", feedControlsSchema, { accountId, signal })).data;
}

export async function addFeedControl(accountId: string, input: FeedControlInput) {
  const parsed = feedControlInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_ERROR", "Choose a valid feed control.");
  const result = (await api("me/feed-controls", feedControlSchema, { method: "POST", accountId, body: parsed.data })).data;
  const target = parsed.data;
  if (result.kind !== target.kind
    || ("page_id" in target && result.page_id !== target.page_id)
    || ("post_id" in target && result.post_id !== target.post_id)
    || ("dimension" in target && (result.dimension !== target.dimension || result.code !== target.code))) invalid();
  return result;
}

export async function removeFeedControl(accountId: string, id: string) {
  if (!uuid.safeParse(id).success) throw new ApiError(422, "VALIDATION_ERROR", "Choose a valid feed control.");
  try {
    const result = (await api(`me/feed-controls/${id}/remove`, z.object({ id: uuid, status: z.literal("removed") }), {
      method: "POST", accountId, body: {},
    })).data;
    if (result.id !== id) invalid();
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { id, status: "removed" as const };
    throw error;
  }
}

const moderationTarget = z.enum(["page", "post", "comment"]);
const moderationAction = z.enum(["no_action", "hide", "limit", "restore"]);
const appealStatus = z.enum(["open", "upheld", "overturned"]);
export const moderationTargetLabels = { page: "Page", post: "Post", comment: "Comment" } as const;
export const moderationActionLabels = { no_action: "No action", hide: "Hidden", limit: "Limited", restore: "Restored" } as const;
export const contentPreviewSchema = z.object({
  name: z.string().nullish(), handle: z.string().nullish(), description: z.string().nullish(),
  title: z.string().nullish(), body: z.string().nullish(), status: z.string(),
});
export type ContentPreview = z.infer<typeof contentPreviewSchema>;
export const moderationQueueSchema = z.object({
  target_type: moderationTarget, target_id: uuid, preview: contentPreviewSchema, page_name: z.string().nullable(),
  report_count: z.number().int().positive(),
  reasons: z.array(z.object({ reason: z.enum(REPORT_REASONS), count: z.number().int().positive() })).min(1),
  first_reported_at: timestamp,
}).refine(value => new Set(value.reasons.map(item => item.reason)).size === value.reasons.length
  && value.reasons.reduce((total, item) => total + item.count, 0) === value.report_count);
export type ModerationQueueItem = z.infer<typeof moderationQueueSchema>;
export const moderationDecisionSchema = z.object({
  id: uuid, target_type: moderationTarget, target_id: uuid, action: moderationAction, reason: z.enum(REPORT_REASONS),
  note: chars(0, 1000), decided_by: uuid, decided_at: timestamp, appeal_of: uuid.nullable(),
});
export type ModerationDecisionBody = {
  target_type: z.infer<typeof moderationTarget>; target_id: string; action: "no_action" | "hide" | "limit"; reason: ReportReason; note: string;
};
export const moderationAppealSchema = z.object({
  id: uuid, decision_id: uuid, note: chars(1, 1000), status: appealStatus, created_at: timestamp, resolved_at: timestamp.nullable(),
}).refine(value => (value.status === "open") === (value.resolved_at === null));
export const moderationAppealReviewSchema = z.object({
  appeal: moderationAppealSchema, decision: moderationDecisionSchema, preview: contentPreviewSchema,
  page_name: z.string().nullable(), resolution_note: chars(0, 1000).nullable(),
}).refine(value => value.appeal.decision_id === value.decision.id);
export type ModerationAppealReview = z.infer<typeof moderationAppealReviewSchema>;
export const moderationNoticeSchema = z.object({
  id: uuid, target_type: moderationTarget, target_id: uuid, action: moderationAction, reason: z.enum(REPORT_REASONS),
  decided_at: timestamp, appeal_status: appealStatus.nullable(), appeal_of: uuid.nullable(),
});
export type ModerationNotice = z.infer<typeof moderationNoticeSchema>;
export const myReportSchema = z.object({
  id: uuid, target_type: moderationTarget, target_id: uuid, reason: z.enum(REPORT_REASONS),
  status: z.enum(["open", "reviewed"]), outcome: z.enum(["action_taken", "no_action"]).nullable(),
  action: moderationAction.nullable(), created_at: timestamp, reviewed_at: timestamp.nullable(),
}).refine(value => value.status === "open"
  ? value.outcome === null && value.action === null && value.reviewed_at === null
  : value.outcome !== null && value.action !== null && value.reviewed_at !== null);

export async function moderatorStatus(accountId: string, signal?: AbortSignal) {
  return (await api("me/moderator", z.object({ moderator: z.boolean() }), { accountId, signal })).data;
}

export async function moderationQueue(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`moderation/queue?${query}`, z.array(moderationQueueSchema).max(50), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)
    || new Set(result.data.map(item => `${item.target_type}:${item.target_id}`)).size !== result.data.length) invalid("The list is incomplete.");
  return { items: result.data, next: result.pagination.next_cursor, hasMore: result.pagination.has_more };
}

export async function recordModerationDecision(intent: CreateIntent<ModerationDecisionBody>) {
  if (intent.body.action === "limit" && intent.body.target_type !== "page") {
    throw new ApiError(422, "VALIDATION_ERROR", "Only pages can be limited.");
  }
  const result = (await api("moderation/decisions", moderationDecisionSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  if (result.target_type !== intent.body.target_type || result.target_id !== intent.body.target_id
    || result.action !== intent.body.action || result.reason !== intent.body.reason || result.note !== intent.body.note
    || result.decided_by !== intent.accountId || result.appeal_of !== null) invalid("The decision could not be confirmed.");
  return result;
}

export async function moderationAppeals(accountId: string, status: "open" | "upheld" | "overturned" = "open", signal?: AbortSignal) {
  const result = (await api(`moderation/appeals?${new URLSearchParams({ status })}`, z.array(moderationAppealReviewSchema), { accountId, signal })).data;
  if (new Set(result.map(item => item.appeal.id)).size !== result.length || result.some(item => item.appeal.status !== status)) invalid();
  return result;
}

export async function resolveModerationAppeal(accountId: string, appealId: string, body: { outcome: "upheld" | "overturned"; note: string }) {
  const result = (await api(`moderation/appeals/${appealId}/resolve`, moderationAppealSchema, { method: "POST", accountId, body })).data;
  if (result.id !== appealId || result.status !== body.outcome) invalid("The appeal resolution could not be confirmed.");
  return result;
}

export async function moderationNotices(accountId: string, signal?: AbortSignal) {
  return unique((await api("me/moderation-notices", z.array(moderationNoticeSchema), { accountId, signal })).data);
}

export async function appealModerationDecision(intent: CreateIntent<{ note: string }> & { decisionId: string }) {
  const result = (await api(`moderation/decisions/${intent.decisionId}/appeal`, moderationAppealSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  if (result.decision_id !== intent.decisionId || result.note !== intent.body.note) invalid("The appeal could not be confirmed.");
  return result;
}

export async function myReports(accountId: string, signal?: AbortSignal) {
  return unique((await api("me/reports", z.array(myReportSchema), { accountId, signal })).data);
}

export const MODERATOR_STATES = [
  "pending", "active", "declined", "cancelled", "withdrawn", "removed", "stepped_down", "expired", "invalidated",
] as const;
export type ModeratorState = typeof MODERATOR_STATES[number];
const moderatorRowBase = z.object({
  id: uuid, page_id: uuid, account_id: uuid, display_name: chars(1, 80), status: z.enum(MODERATOR_STATES),
  created_at: timestamp, expires_at: timestamp.nullable(), resolved_at: timestamp.nullable(), etag,
});
const pendingLifecycle = (value: { status: string; expires_at: string | null; resolved_at: string | null }) =>
  (value.status === "pending") === (value.expires_at !== null) && (value.status === "pending") === (value.resolved_at === null);
export const moderatorRowSchema = moderatorRowBase.refine(pendingLifecycle);
export type ModeratorRow = z.infer<typeof moderatorRowSchema>;

export const moderatorRoleSchema = moderatorRowBase.omit({ account_id: true, display_name: true }).extend({
  page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
}).refine(pendingLifecycle);
export type ModeratorRole = z.infer<typeof moderatorRoleSchema>;

export const HANDOVER_STATES = ["pending", "accepted", "declined", "cancelled", "expired", "invalidated"] as const;
export type HandoverState = typeof HANDOVER_STATES[number];
// The server reports an offer whose 15 minutes passed, or whose page or people changed, as expired or invalidated
// before anything has closed it, so those two may still carry their end time and no resolution time.
const handoverLifecycle = (value: { status: string; expires_at: string | null; resolved_at: string | null }) =>
  pendingLifecycle(value) || ((value.status === "expired" || value.status === "invalidated") && value.expires_at !== null && value.resolved_at === null);
export const handoverSchema = z.object({
  id: uuid, page_id: uuid, page_handle: z.string().min(3).max(30), page_name: chars(1, 80),
  from_account_id: uuid, from_name: chars(1, 80), to_account_id: uuid, to_name: chars(1, 80),
  status: z.enum(HANDOVER_STATES),
  created_at: timestamp, expires_at: timestamp.nullable(), resolved_at: timestamp.nullable(), etag,
}).refine(handoverLifecycle);
export type Handover = z.infer<typeof handoverSchema>;

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

export async function pageInsights(accountId: string, pageId: string, signal?: AbortSignal) {
  if (!uuid.safeParse(pageId).success) throw new ApiError(422, "VALIDATION_ERROR", "Choose a valid page.");
  const result = (await api(`pages/${pageId}/insights`, pageInsightsSchema, { accountId, signal })).data;
  if (result.page_id !== pageId) invalid("The insights do not match your page.");
  return result;
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

export async function createPage(intent: CreateIntent<{ handle: string; name: string; description: string; topic: Topic; classification?: Partial<Classification> }>) {
  const result = checkPage((await api("pages", pageSchema, { method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key } })).data);
  if (!result.can_manage || result.handle !== intent.body.handle) invalid("The new page could not be confirmed.");
  return result;
}

export type PageChanges = Partial<Pick<PublicPage, "name" | "description" | "topic" | "rules">> & { classification?: Partial<Classification> };

export async function updatePage(accountId: string, page: PublicPage, changes: PageChanges) {
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

export async function createPost(intent: CreateIntent<{ title: string | null; body: string; topics?: string[]; interests?: string[] }> & { pageId: string }) {
  const result = checkPost((await api(`pages/${intent.pageId}/posts`, postSchema, { method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key } })).data);
  if (result.page_id !== intent.pageId || !result.can_manage) invalid("The draft could not be confirmed.");
  return result;
}

export async function drafts(accountId: string, pageId: string, signal?: AbortSignal) {
  const result = unique((await api(`pages/${pageId}/drafts`, z.array(postSchema).max(50), { accountId, signal })).data);
  if (result.some(item => item.status !== "draft" || item.page_id !== pageId)) invalid();
  return result;
}

export async function updatePost(accountId: string, post: PublicPost, changes: { title?: string | null; body?: string; topics?: string[]; interests?: string[] }) {
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

export async function interestPosts(accountId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`me/interest-posts?${query}`, interestPostsSchema, { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)
    || (result.pagination.has_more && result.data.length === 0)) invalid("The list is incomplete.");
  return { items: result.data, next: result.pagination.next_cursor };
}

export type DiscoverFilters = Partial<Record<TaxonomyDimension, string>>;

export async function discoverPages(accountId: string | undefined, search: string, topicOrFilters: Topic | DiscoverFilters, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  const text = search.trim().replace(/\s+/g, " ");
  if (text) query.set("q", text.slice(0, 80));
  const filters = typeof topicOrFilters === "string" ? { topic: topicOrFilters } : topicOrFilters;
  for (const dimension of TAXONOMY_DIMENSIONS) {
    const code = filters[dimension];
    if (code) {
      if (!termCodeSchema.safeParse(code).success) throw new ApiError(422, "VALIDATION_ERROR", "Choose a valid filter.");
      query.set(dimension, code);
    }
  }
  if (cursor) query.set("cursor", cursor);
  const page = paged(await api(`discover/pages?${query}`, z.array(pageSchema).max(50), { accountId, signal }), cursor);
  if (page.items.some(item => item.blocked || (filters.topic && item.topic !== filters.topic && !item.classification.other_topics.includes(filters.topic)))) invalid();
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

export async function inviteModerator(intent: CreateIntent<{ account_id: string }> & { pageId: string }) {
  const result = (await api(`pages/${intent.pageId}/moderators`, moderatorRowSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body, headers: { "Idempotency-Key": intent.key },
  })).data;
  // A retry with the same key returns the original invitation, whatever has happened to it since.
  if (result.page_id !== intent.pageId || result.account_id !== intent.body.account_id) {
    invalid("The invitation could not be confirmed.");
  }
  return result;
}

export async function pageModerators(accountId: string, pageId: string, signal?: AbortSignal) {
  const result = unique((await api(`pages/${pageId}/moderators`, z.array(moderatorRowSchema).max(10), { accountId, signal })).data);
  if (result.some(item => item.page_id !== pageId || (item.status !== "pending" && item.status !== "active"))) invalid();
  return result;
}

// A person may moderate any number of pages, so this list has no small limit.
export async function myModeratorRoles(accountId: string, signal?: AbortSignal) {
  const result = unique((await api("me/moderator-roles", z.array(moderatorRoleSchema).max(1000), { accountId, signal })).data);
  if (result.some(item => item.status !== "pending" && item.status !== "active")) invalid();
  return result;
}

async function moderatorAction(accountId: string, pageId: string, row: Pick<ModeratorRow, "id" | "etag">, action: string, required: ModeratorState) {
  const result = (await api(`pages/${pageId}/moderators/${row.id}/${action}`, moderatorRowSchema, {
    method: "POST", accountId, body: {}, headers: { "If-Match": row.etag },
  })).data;
  if (result.id !== row.id || result.status !== required) invalid(`The ${action.replace("-", " ")} could not be confirmed.`);
  return result;
}

export const acceptModerator = (accountId: string, pageId: string, row: ModeratorRole | ModeratorRow) => moderatorAction(accountId, pageId, row, "accept", "active");
export const declineModerator = (accountId: string, pageId: string, row: ModeratorRole | ModeratorRow) => moderatorAction(accountId, pageId, row, "decline", "declined");
export const withdrawModerator = (accountId: string, pageId: string, row: ModeratorRow) => moderatorAction(accountId, pageId, row, "withdraw", "withdrawn");
export const removeModerator = (accountId: string, pageId: string, row: ModeratorRow) => moderatorAction(accountId, pageId, row, "remove", "removed");
export const stepDownModerator = (accountId: string, pageId: string, row: ModeratorRole | ModeratorRow) => moderatorAction(accountId, pageId, row, "step-down", "stepped_down");

export async function offerHandover(intent: CreateIntent<{ to_account_id: string }> & { pageId: string; etag: string }) {
  const result = (await api(`pages/${intent.pageId}/handover`, handoverSchema, {
    method: "POST", accountId: intent.accountId, body: intent.body,
    headers: { "Idempotency-Key": intent.key, "If-Match": intent.etag },
  })).data;
  // A retry with the same key returns the original offer, whatever has happened to it since.
  if (result.page_id !== intent.pageId || result.to_account_id !== intent.body.to_account_id) {
    invalid("The offer could not be confirmed.");
  }
  return result;
}

/** The page's latest handover offer, for the owner who made it or the moderator it was made to; null when there is none. */
export async function pageHandover(accountId: string, pageId: string, signal?: AbortSignal) {
  try {
    const result = (await api(`pages/${pageId}/handover`, handoverSchema, { accountId, signal })).data;
    if (result.page_id !== pageId) invalid();
    return result;
  } catch (problem) {
    if (problem instanceof ApiError && problem.status === 404) return null;
    throw problem;
  }
}

export async function myHandoverOffers(accountId: string, signal?: AbortSignal) {
  const result = unique((await api("me/handover-offers", z.array(handoverSchema).max(1000), { accountId, signal })).data);
  if (result.some(item => item.status !== "pending" || item.to_account_id !== accountId)) invalid();
  return result;
}

async function handoverAction(accountId: string, pageId: string, offer: Handover, action: "accept" | "decline" | "cancel", required: HandoverState) {
  const result = (await api(`pages/${pageId}/handover/${offer.id}/${action}`, handoverSchema, {
    method: "POST", accountId, body: {}, headers: { "If-Match": offer.etag },
  })).data;
  if (result.id !== offer.id || result.status !== required) invalid(`The ${action} could not be confirmed.`);
  return result;
}

const handoverOutcomes = { accept: "accepted", decline: "declined", cancel: "cancelled" } as const;

export const respondHandover = (
  accountId: string, pageId: string, offer: Handover, action: keyof typeof handoverOutcomes,
) => handoverAction(accountId, pageId, offer, action, handoverOutcomes[action]);

export async function archivePage(accountId: string, page: PublicPage) {
  if (!page.etag) invalid();
  const result = checkPage((await api(`pages/${page.id}/archive`, pageSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": page.etag } })).data, page.id);
  if (result.status !== "read_only") invalid("The archive could not be confirmed.");
  return result;
}

export async function restorePage(accountId: string, page: PublicPage) {
  if (!page.etag) invalid();
  const result = checkPage((await api(`pages/${page.id}/restore`, pageSchema, { method: "POST", accountId, body: {}, headers: { "If-Match": page.etag } })).data, page.id);
  // A deleted page comes back as it was, which may be archived; an archived page comes back active.
  if (page.status === "deleted" ? result.status === "deleted" : result.status !== "active") invalid("The restore could not be confirmed.");
  return result;
}

export async function deletePage(accountId: string, page: PublicPage, confirm: string) {
  if (!page.etag) invalid();
  const result = checkPage((await api(`pages/${page.id}/delete`, pageSchema, {
    method: "POST", accountId, body: { confirm }, headers: { "If-Match": page.etag },
  })).data, page.id);
  // A deleted page stays readable for the grace period, so the deletion is only confirmed by its status.
  if (result.status !== "deleted") invalid("The deletion could not be confirmed.");
  return result;
}

export function isUnknown(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500 || error.status === 408;
}
