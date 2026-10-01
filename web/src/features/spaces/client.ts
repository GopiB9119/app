import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

const spaceShape = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  description: z.string().max(280).default(""),
  space_type: z.enum(["family", "solo", "group", "couple"]),
  visibility: z.enum(["private", "public"]),
  status: z.literal("active"),
  role: z.enum(["owner", "admin", "member"]),
  version: z.string().regex(/^[1-9][0-9]*$/),
  created_at: z.string().datetime({ offset: true }),
});
const onlyGroupsArePublic = (space: { visibility: string; space_type: string }) => space.visibility === "private" || space.space_type === "group";
export const spaceSchema = spaceShape.refine(onlyGroupsArePublic, { message: "Only group Spaces can be public." });

export const spacesSchema = z.array(spaceSchema).max(50);

export type FamilySpace = z.infer<typeof spaceSchema>;
export const spaceSettingsSchema = spaceShape.extend({ role: z.literal("owner"), etag: z.string().regex(/^"[a-f0-9]{64}"$/) })
  .refine(onlyGroupsArePublic, { message: "Only group Spaces can be public." });
export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;
export type SpaceSettingsIntent = { accountId: string; spaceId: string; name: string; description?: string; etag: string; key: string };
export type VisibilityIntent = { accountId: string; spaceId: string; visibility: "private" | "public"; etag: string; key: string };
export const spaceTypeLabels: Record<FamilySpace["space_type"], string> = { family: "Family", group: "Group", solo: "Solo", couple: "Couple" };

export async function readSpaceSettings(accountId: string, spaceId: string, signal?: AbortSignal) {
  const result = await api(`spaces/${spaceId}/settings`, spaceSettingsSchema, { accountId, signal });
  if (result.data.id !== spaceId) throw new ApiError(502, "INVALID_RESPONSE", "The settings belong to another Space.");
  return result.data;
}

export async function saveSpaceSettings(intent: SpaceSettingsIntent) {
  const result = await api(`spaces/${intent.spaceId}/settings`, spaceSettingsSchema, {
    method: "PATCH", accountId: intent.accountId,
    body: intent.description === undefined ? { name: intent.name } : { name: intent.name, description: intent.description },
    headers: { "If-Match": intent.etag, "Idempotency-Key": intent.key },
  });
  if (result.data.id !== intent.spaceId) throw new ApiError(502, "INVALID_RESPONSE", "The settings result belongs to another Space.");
  return result.data;
}

export async function changeVisibility(intent: VisibilityIntent) {
  const result = await api(`spaces/${intent.spaceId}/visibility`, spaceSettingsSchema, {
    method: "POST", accountId: intent.accountId, body: { visibility: intent.visibility },
    headers: { "If-Match": intent.etag, "Idempotency-Key": intent.key },
  });
  if (result.data.id !== intent.spaceId || result.data.visibility !== intent.visibility) {
    throw new ApiError(502, "INVALID_RESPONSE", "The visibility result does not match this review.");
  }
  return result.data;
}

export const directoryEntrySchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(80), description: z.string().max(280),
  member_count: z.number().int().min(1).max(50), viewer_role: z.enum(["owner", "admin", "member"]).nullable(),
  pending_request_id: z.string().uuid().nullable(), can_request: z.boolean(),
}).refine(entry => !(entry.viewer_role && (entry.pending_request_id || entry.can_request)) && !(entry.pending_request_id && entry.can_request));
export type DirectoryEntry = z.infer<typeof directoryEntrySchema>;

export async function findGroups(accountId: string, query: string, cursor: string | null, signal?: AbortSignal) {
  const parameters = new URLSearchParams({ limit: "20" });
  if (query.trim()) parameters.set("q", query.trim());
  if (cursor) parameters.set("cursor", cursor);
  const result = await api(`discover/spaces?${parameters}`, z.array(directoryEntrySchema).max(20), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor) || new Set(result.data.map(entry => entry.id)).size !== result.data.length) {
    throw new ApiError(502, "INVALID_RESPONSE", "The group list could not be confirmed.");
  }
  return { data: result.data, pagination: result.pagination };
}

const joinStatuses = ["pending", "approved", "declined", "cancelled", "closed", "expired"] as const;
export const joinRequestSchema = z.object({
  id: z.string().uuid(), space_id: z.string().uuid(), space_name: z.string().min(1).max(80), note: z.string().max(280),
  status: z.enum(joinStatuses), created_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }),
  resolved_at: z.string().datetime({ offset: true }).nullable(),
}).refine(request => Date.parse(request.created_at) < Date.parse(request.expires_at)
  && (request.status !== "pending" || request.resolved_at === null)
  && (request.status === "pending" || request.status === "expired" || request.resolved_at !== null));
export type JoinRequest = z.infer<typeof joinRequestSchema>;
export const joinStatusLabels: Record<JoinRequest["status"], string> = {
  pending: "Waiting for the owner", approved: "Approved", declined: "Declined", cancelled: "Withdrawn",
  closed: "Closed: the group became private", expired: "Expired",
};
export const joinReviewSchema = z.object({
  id: z.string().uuid(), account_id: z.string().uuid(), display_name: z.string().min(1).max(80), note: z.string().max(280),
  created_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }),
});
export type JoinReview = z.infer<typeof joinReviewSchema>;
export type JoinIntent = { accountId: string; spaceId: string; note: string; key: string };

export async function askToJoin(intent: JoinIntent) {
  const result = await api(`spaces/${intent.spaceId}/join-requests`, joinRequestSchema, {
    method: "POST", accountId: intent.accountId, body: { note: intent.note }, headers: { "Idempotency-Key": intent.key },
  });
  if (result.data.space_id !== intent.spaceId || result.data.note !== intent.note.trim()) {
    throw new ApiError(502, "INVALID_RESPONSE", "The request does not match what you sent.");
  }
  return result.data;
}

export async function cancelJoinRequest(accountId: string, requestId: string) {
  const result = await api(`space-join-requests/${requestId}/cancel`, joinRequestSchema, { method: "POST", accountId, body: {} });
  if (result.data.id !== requestId || result.data.status !== "cancelled") throw new ApiError(502, "INVALID_RESPONSE", "The withdrawal could not be confirmed.");
  return result.data;
}

export async function myJoinRequests(accountId: string, signal?: AbortSignal) {
  return (await api("me/space-join-requests", z.array(joinRequestSchema).max(50), { accountId, signal })).data;
}

export async function pendingJoinRequests(accountId: string, spaceId: string, signal?: AbortSignal) {
  const result = await api(`spaces/${spaceId}/join-requests`, z.array(joinReviewSchema).max(100), { accountId, signal });
  if (result.data.some(item => item.account_id === accountId)) throw new ApiError(502, "INVALID_RESPONSE", "The request list is not valid.");
  return result.data;
}

export async function decideJoinRequest(accountId: string, spaceId: string, review: JoinReview, action: "approve" | "decline") {
  const result = await api(`spaces/${spaceId}/join-requests/${review.id}/${action}`, joinRequestSchema, { method: "POST", accountId, body: {} });
  if (result.data.id !== review.id || result.data.space_id !== spaceId || result.data.status !== (action === "approve" ? "approved" : "declined")) {
    throw new ApiError(502, "INVALID_RESPONSE", "The decision could not be confirmed.");
  }
  return result.data;
}

export const memberSchema = z.object({
  account_id: z.string().uuid(), display_name: z.string().min(1).max(80),
  role: z.enum(["owner", "admin", "member"]), joined_at: z.string().datetime({ offset: true }),
  etag: z.string().min(3).max(140).regex(/^"[^"\r\n]+"$/),
});
export const membersSchema = z.array(memberSchema).min(1).max(50).superRefine((members, context) => {
  if (new Set(members.map(member => member.account_id)).size !== members.length || members.filter(member => member.role === "owner").length !== 1) {
    context.addIssue({ code: "custom", message: "Invalid family roster." });
  }
});
export const membershipOutcomeSchema = z.object({
  space_id: z.string().uuid(), account_id: z.string().uuid(), status: z.literal("removed"),
});
export type SpaceMember = z.infer<typeof memberSchema>;
export type MembershipIntent = { accountId: string; spaceId: string; targetId: string; action: "remove" | "leave"; key: string; etag: string };
export type RoleIntent = { accountId: string; spaceId: string; targetId: string; role: "admin" | "member"; key: string; etag: string };

export async function readMembers(accountId: string, spaceId: string, signal?: AbortSignal) {
  const result = await api(`spaces/${spaceId}/members`, membersSchema, { accountId, signal });
  if (!result.data.some(member => member.account_id === accountId)) throw new ApiError(502, "INVALID_RESPONSE", "The current membership is missing.");
  return result.data;
}

export async function endMembership(intent: MembershipIntent) {
  if (intent.action === "leave" && intent.targetId !== intent.accountId) throw new ApiError(409, "ACCOUNT_CHANGED", "Review your own membership before leaving.");
  const route = intent.action === "leave" ? `spaces/${intent.spaceId}/leave` : `spaces/${intent.spaceId}/members/${intent.targetId}/remove`;
  const result = await api(route, membershipOutcomeSchema, { method: "POST", accountId: intent.accountId,
    body: {}, headers: { "If-Match": intent.etag, "Idempotency-Key": intent.key } });
  if (result.data.space_id !== intent.spaceId || result.data.account_id !== intent.targetId) throw new ApiError(502, "INVALID_RESPONSE", "The membership response does not match this review.");
  return result.data;
}

export async function changeRole(intent: RoleIntent) {
  const result = await api(`spaces/${intent.spaceId}/members/${intent.targetId}/role`, memberSchema, { method: "POST", accountId: intent.accountId,
    body: { role: intent.role }, headers: { "If-Match": intent.etag, "Idempotency-Key": intent.key } });
  if (result.data.account_id !== intent.targetId || result.data.role !== intent.role) throw new ApiError(502, "INVALID_RESPONSE", "The role response does not match this review.");
  return result.data;
}

export const recipientSchema = z.string().trim().uuid("Enter a valid account ID.");
export const invitationSchema = z.object({
  id: z.string().uuid(),
  space_id: z.string().uuid(),
  space_name: z.string().min(1).max(80),
  inviter_name: z.string().min(1).max(80),
  recipient_account_id: z.string().uuid(),
  role: z.literal("member"),
  status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  created_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
});
export const invitationOutcomeSchema = z.object({
  id: z.string().uuid(), status: z.enum(["declined", "revoked"]),
});
export type FamilyInvitation = z.infer<typeof invitationSchema>;

export async function invitationPage(path: string, accountId: string, cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`${path}?${query}`, z.array(invitationSchema).max(50), { accountId, signal });
  if (!result.pagination) throw new ApiError(502, "INVALID_RESPONSE", "Invitation pagination is missing.");
  return { data: result.data, pagination: result.pagination };
}

export const ownershipTransferSchema = z.object({
  id: z.string().uuid(), space_id: z.string().uuid(), space_name: z.string().min(1).max(80),
  from_account_id: z.string().uuid(), from_name: z.string().min(1).max(80),
  to_account_id: z.string().uuid(), to_name: z.string().min(1).max(80),
  status: z.enum(["pending", "accepted", "declined", "cancelled", "expired", "invalidated"]),
  created_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }),
  resolved_at: z.string().datetime({ offset: true }).nullable(), version: z.string().regex(/^[1-9][0-9]*$/),
  etag: z.string().min(3).max(140).regex(/^"[^"\r\n]+"$/),
}).refine(value => value.from_account_id !== value.to_account_id && Date.parse(value.created_at) < Date.parse(value.expires_at)
  && (value.status !== "pending" || value.resolved_at === null)
  && (!["accepted", "declined", "cancelled"].includes(value.status) || value.resolved_at !== null));

export type OwnershipTransfer = z.infer<typeof ownershipTransferSchema>;
export type OwnershipOfferIntent = { action: "offer"; accountId: string; spaceId: string; recipientId: string; etag: string; key: string };
export type OwnershipResponseIntent = { action: "accept" | "decline" | "cancel"; accountId: string; transfer: OwnershipTransfer };
export type OwnershipIntent = OwnershipOfferIntent | OwnershipResponseIntent;
export const ownershipLabels: Record<OwnershipTransfer["status"], string> = {
  pending: "Awaiting acceptance", accepted: "Accepted", declined: "Declined", cancelled: "Withdrawn", expired: "Expired", invalidated: "No longer valid",
};

export async function ownershipPage(accountId: string, spaceId: string, cursor?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await api(`spaces/${spaceId}/ownership-transfers?${query}`, z.array(ownershipTransferSchema).max(20), { accountId, signal });
  if (!result.pagination || (cursor && result.pagination.next_cursor === cursor)
    || new Set(result.data.map(item => item.id)).size !== result.data.length
    || result.data.some(item => item.space_id !== spaceId || (item.from_account_id !== accountId && item.to_account_id !== accountId))) {
    throw new ApiError(502, "INVALID_RESPONSE", "The ownership offers do not match this account and family.");
  }
  return { data: result.data, pagination: result.pagination };
}

export async function changeOwnership(intent: OwnershipIntent) {
  const offering = intent.action === "offer";
  if (!offering) {
    const expected = intent.action === "cancel" ? intent.transfer.from_account_id : intent.transfer.to_account_id;
    if (expected !== intent.accountId) throw new ApiError(404, "NOT_FOUND", "Ownership offer not found.");
  } else if (intent.accountId === intent.recipientId) {
    throw new ApiError(400, "INVALID_REQUEST", "Choose another current member.");
  }
  const spaceId = offering ? intent.spaceId : intent.transfer.space_id;
  const route = `spaces/${spaceId}/ownership-transfers${offering ? "" : `/${intent.transfer.id}/${intent.action}`}`;
  const result = await api(route, ownershipTransferSchema, {
    method: "POST", accountId: intent.accountId,
    headers: offering ? { "If-Match": intent.etag, "Idempotency-Key": intent.key } : { "If-Match": intent.transfer.etag },
    body: offering ? { recipient_account_id: intent.recipientId } : {},
  });
  if (result.data.space_id !== spaceId || (result.data.from_account_id !== intent.accountId && result.data.to_account_id !== intent.accountId)) {
    throw new ApiError(502, "INVALID_RESPONSE", "The ownership result belongs to another family or account.");
  }
  if (offering) {
    if (result.data.from_account_id !== intent.accountId || result.data.to_account_id !== intent.recipientId) {
      throw new ApiError(502, "INVALID_RESPONSE", "The offer does not match the intended next owner.");
    }
  } else {
    const expected = intent.transfer;
    const outcome = { accept: "accepted", decline: "declined", cancel: "cancelled" }[intent.action];
    if (result.data.id !== expected.id || result.data.from_account_id !== expected.from_account_id || result.data.to_account_id !== expected.to_account_id
      || result.data.created_at !== expected.created_at || result.data.expires_at !== expected.expires_at || result.data.status !== outcome) {
      throw new ApiError(502, "INVALID_RESPONSE", "The result does not match the reviewed ownership offer.");
    }
  }
  return result.data;
}