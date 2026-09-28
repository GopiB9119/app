import { z } from "zod";
import { ApiError, api } from "@/features/identity/client";

export const spaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  space_type: z.literal("family"),
  visibility: z.literal("private"),
  status: z.literal("active"),
  role: z.enum(["owner", "member"]),
  version: z.string().regex(/^[1-9][0-9]*$/),
  created_at: z.string().datetime({ offset: true }),
});

export const spacesSchema = z.array(spaceSchema).max(50);

export type FamilySpace = z.infer<typeof spaceSchema>;
export const memberSchema = z.object({
  account_id: z.string().uuid(), display_name: z.string().min(1).max(80),
  role: z.enum(["owner", "member"]), joined_at: z.string().datetime({ offset: true }),
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