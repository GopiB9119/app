"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Inbox, LoaderCircle, RefreshCw, UserPlus, X } from "lucide-react";

import { ApiError, api } from "@/features/identity/client";
import type { Account } from "@/features/identity/client";
import { invitationOutcomeSchema, invitationPage, invitationSchema, recipientSchema, spaceSchema } from "./client";
import type { FamilyInvitation, FamilySpace } from "./client";
import styles from "./spaces.module.css";

function useAccountGuard(...errors: (Error | null)[]) {
  const queryClient = useQueryClient();
  const denied = errors.find(error => error instanceof ApiError && (error.status === 401 || error.code === "ACCOUNT_CHANGED"));
  useEffect(() => {
    if (denied instanceof ApiError) {
      queryClient.clear();
      window.location.replace(denied.status === 401 ? "/login" : "/app/spaces");
    }
  }, [denied, queryClient]);
  return !!denied;
}

export function AccountIdentifier({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true); setError("");
    } catch {
      setError("Clipboard unavailable.");
    }
  }
  return <div className={styles.accountIdentifier}>
    <label>Your account ID<input aria-label="Your account ID" value={accountId} readOnly onFocus={event => event.currentTarget.select()} /></label>
    <button className="icon-button" onClick={copy} title="Copy account ID" aria-label="Copy account ID">{copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}</button>
    <span className={styles.copyStatus} role="status">{error || (copied ? "Account ID copied." : "")}</span>
  </div>;
}

export function InvitationInbox({ user }: { user: Account }) {
  const queryClient = useQueryClient();
  const [review, setReview] = useState<FamilyInvitation | null>(null);
  const [notice, setNotice] = useState("");
  const invitations = useInfiniteQuery({
    queryKey: ["invitationInbox", user.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => invitationPage("invitations", user.id, pageParam, signal),
    getNextPageParam: last => last.pagination.next_cursor ?? undefined,
  });
  const respond = useMutation({
    mutationFn: async ({ invitation, action }: { invitation: FamilyInvitation; action: "accept" | "decline" }) => {
      const options = { method: "POST", body: {}, accountId: user.id };
      if (action === "accept") return api(`invitations/${invitation.id}/accept`, spaceSchema, options);
      return api(`invitations/${invitation.id}/decline`, invitationOutcomeSchema, options);
    },
    onMutate: () => setNotice(""),
    onSuccess: async (_result, { invitation, action }) => {
      setReview(null);
      setNotice(action === "accept" ? `Joined ${invitation.space_name}.` : "Invitation declined.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invitationInbox", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["spaces", user.id] }),
      ]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setReview(null);
        queryClient.invalidateQueries({ queryKey: ["invitationInbox", user.id] });
      }
    },
  });
  const denied = useAccountGuard(invitations.error, respond.error);
  const rows = [...new Map(invitations.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];

  return <section className={styles.invitationSection} aria-labelledby="invitation-title">
    <div className={styles.sectionHeading}><Inbox size={20} aria-hidden /><h2 id="invitation-title">Invitations</h2><button className="icon-button" title="Refresh invitations" aria-label="Refresh invitations" disabled={invitations.isFetching} onClick={() => invitations.refetch()}><RefreshCw size={17} className={invitations.isFetching ? "spin" : ""} aria-hidden /></button></div>
    {notice && <p className="message success" role="status">{notice}</p>}
    {invitations.isPending && <p role="status">Loading invitations...</p>}
    {invitations.isError && <div className="message error" role="alert">{invitations.error.message}<button className="text-button" onClick={() => invitations.refetch()}><RefreshCw size={16} aria-hidden />Retry</button></div>}
    {respond.isError && <p className="message error" role="alert">{respond.error.message}</p>}
    {!denied && !invitations.isError && !invitations.isPending && rows.length === 0 && <p className={styles.emptyNote}>No pending invitations.</p>}
    {!denied && !invitations.isError && <ul className={styles.invitationList}>{rows.map(invitation => <li key={invitation.id}>
      <div className={styles.invitationDetails}><h3>{invitation.space_name}</h3><p>From {invitation.inviter_name}</p><span>Member / Private</span><time dateTime={invitation.expires_at}>Expires {formatExpiry(invitation.expires_at, user.timezone)}</time></div>
      <div className={styles.invitationActions}>
        <button className="secondary-button" disabled={respond.isPending} onClick={() => { respond.reset(); setReview(invitation); }}><Check size={16} aria-hidden />Review invitation</button>
        <button className="icon-button" title={`Decline invitation to ${invitation.space_name}`} aria-label={`Decline invitation to ${invitation.space_name}`} disabled={respond.isPending} onClick={() => respond.mutate({ invitation, action: "decline" })}><X size={18} aria-hidden /></button>
      </div>
    </li>)}</ul>}
    {invitations.hasNextPage && !denied && <button className="text-button" onClick={() => invitations.fetchNextPage()} disabled={invitations.isFetching}>Load more invitations</button>}
    {review && !denied && <InvitationConfirmation title={`Join ${review.space_name}?`} label="Join Space" pending={respond.isPending} error={respond.error?.message} onCancel={() => setReview(null)} onConfirm={() => respond.mutate({ invitation: review, action: "accept" })}>
      <dl className={styles.reviewFacts}><dt>Invited by</dt><dd>{review.inviter_name}</dd><dt>Role</dt><dd>Member</dd><dt>Privacy</dt><dd>Private</dd><dt>Earlier content</dt><dd>No access granted</dd></dl>
    </InvitationConfirmation>}
  </section>;
}

export function ManageInvitations({ user, space, onClose }: { user: Account; space: FamilySpace; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [intent, setIntent] = useState<{ recipient: string; key: string } | null>(null);
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<FamilyInvitation | null>(null);
  const history = useInfiniteQuery({
    queryKey: ["sentInvitations", user.id, space.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => invitationPage(`spaces/${space.id}/invitations`, user.id, pageParam, signal),
    getNextPageParam: last => last.pagination.next_cursor ?? undefined,
  });
  const invite = useMutation({
    mutationFn: (pending: NonNullable<typeof intent>) => api(`spaces/${space.id}/invitations`, invitationSchema, {
      method: "POST", accountId: user.id, body: { recipient_account_id: pending.recipient }, headers: { "Idempotency-Key": pending.key },
    }),
    onSuccess: async result => {
      setIntent(null); setRecipient("");
      setNotice(result.data.status === "pending" ? "Invitation created." : `Invitation is ${result.data.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
    },
    onError: error => {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) {
        setIntent(null);
        queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
      }
    },
  });
  const revoke = useMutation({
    mutationFn: (invitation: FamilyInvitation) => api(`spaces/${space.id}/invitations/${invitation.id}/revoke`, invitationOutcomeSchema, { method: "POST", body: {}, accountId: user.id }),
    onSuccess: async () => {
      setRevokeTarget(null); setNotice("Invitation revoked.");
      await queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
    },
    onError: error => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        setRevokeTarget(null);
        queryClient.invalidateQueries({ queryKey: ["sentInvitations", user.id, space.id] });
      }
    },
  });
  const denied = useAccountGuard(history.error, invite.error, revoke.error);
  const rows = [...new Map(history.data?.pages.flatMap(page => page.data).map(item => [item.id, item] as const) ?? []).values()];

  useEffect(() => {
    if (!recipient && !intent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recipient, intent]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invite.isPending || denied || history.isError) return;
    const parsed = recipientSchema.safeParse(recipient);
    if (!parsed.success) { setValidation("Enter a valid account ID."); return; }
    const pending = intent ?? { recipient: parsed.data, key: crypto.randomUUID() };
    setIntent(pending); setValidation(""); setNotice(""); invite.mutate(pending);
  }

  return <section className={styles.invitationSection} aria-labelledby="manage-invitations-title">
    <div className={styles.sectionHeading}><UserPlus size={20} aria-hidden /><h2 id="manage-invitations-title">Invite to {space.name}</h2><button className="icon-button" title="Close invitation management" aria-label="Close invitation management" disabled={intent !== null || revoke.isPending} onClick={onClose}><X size={18} aria-hidden /></button></div>
    {notice && <p className="message success" role="status">{notice}</p>}
    {space.space_type === "couple" && <p className={styles.emptyNote}>A couple Space is for two people: you and one partner. One invitation can wait at a time.</p>}
    <form className={styles.inviteForm} onSubmit={submit}>
      <label>Recipient account ID<input name="recipient_account_id" autoComplete="off" required maxLength={36} value={recipient} disabled={intent !== null || denied || history.isError} aria-invalid={!!validation} aria-describedby={validation ? "recipient-error" : undefined} onChange={event => { setRecipient(event.target.value); setValidation(""); setNotice(""); invite.reset(); }} /></label>
      <button className="primary-button" type="submit" disabled={invite.isPending || !recipient.trim() || denied || history.isError}>{invite.isPending ? <LoaderCircle size={17} className="spin" aria-hidden /> : intent ? <RefreshCw size={17} aria-hidden /> : <UserPlus size={17} aria-hidden />}{invite.isPending ? "Creating..." : intent ? "Retry invitation" : "Create invitation"}</button>
    </form>
    {validation && <p id="recipient-error" className="message error" role="alert">{validation}</p>}
    {invite.isError && <p className="message error" role="alert">{invite.error.message}</p>}
    {revoke.isError && <p className="message error" role="alert">{revoke.error.message}</p>}
    <div className={styles.sectionHeading}><h3>Sent invitations</h3><button className="icon-button" title="Refresh sent invitations" aria-label="Refresh sent invitations" disabled={history.isFetching} onClick={() => history.refetch()}><RefreshCw size={17} className={history.isFetching ? "spin" : ""} aria-hidden /></button></div>
    {history.isPending && <p role="status">Loading sent invitations...</p>}
    {history.isError && <div className="message error" role="alert">{history.error.message}<button className="text-button" onClick={() => history.refetch()}>Retry</button></div>}
    {!denied && !history.isError && !history.isPending && rows.length === 0 && <p className={styles.emptyNote}>No invitations yet.</p>}
    {!denied && !history.isError && <ul className={styles.invitationList}>{rows.map(invitation => <li key={invitation.id}>
      <div className={styles.invitationDetails}><span className={styles.accountCode}>{invitation.recipient_account_id}</span><span>{invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)} / Member</span><time dateTime={invitation.expires_at}>Expires {formatExpiry(invitation.expires_at, user.timezone)}</time></div>
      {invitation.status === "pending" && <button className="icon-button" title="Revoke invitation" aria-label={`Revoke invitation for ${invitation.recipient_account_id}`} disabled={revoke.isPending} onClick={() => { revoke.reset(); setRevokeTarget(invitation); }}><X size={18} aria-hidden /></button>}
    </li>)}</ul>}
    {history.hasNextPage && !denied && <button className="text-button" disabled={history.isFetching} onClick={() => history.fetchNextPage()}>Load more sent invitations</button>}
    {revokeTarget && !denied && <InvitationConfirmation title="Revoke this invitation?" label="Revoke invitation" pending={revoke.isPending} error={revoke.error?.message} onCancel={() => setRevokeTarget(null)} onConfirm={() => revoke.mutate(revokeTarget)}><p className={styles.accountCode}>{revokeTarget.recipient_account_id}</p></InvitationConfirmation>}
  </section>;
}

function InvitationConfirmation({ title, label, pending, error, children, onCancel, onConfirm }: {
  title: string; label: string; pending: boolean; error?: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void;
}) {
  const [element, setElement] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { element?.showModal(); return () => element?.close(); }, [element]);
  return <dialog className={styles.invitationDialog} ref={setElement} aria-labelledby="invitation-review-title" onCancel={event => { if (pending) event.preventDefault(); else onCancel(); }}>
    <div className="dialog-heading"><h2 id="invitation-review-title">{title}</h2><button className="icon-button" title="Close confirmation" aria-label="Close confirmation" disabled={pending} onClick={onCancel}><X size={18} aria-hidden /></button></div>
    {children}
    {error && <p className="message error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={onCancel}>Cancel</button><button className="primary-button" disabled={pending} onClick={onConfirm}>{pending ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Check size={17} aria-hidden />}{label}</button></div>
  </dialog>;
}

function formatExpiry(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}